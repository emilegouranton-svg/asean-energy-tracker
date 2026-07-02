#!/usr/bin/env python3
"""
Daily fetch job for the ASEAN Energy Infrastructure Tracker.

- Reads sources.yaml for the list of (country, topic) tagged search queries
  and any extra direct RSS feeds.
- Pulls fresh results from Google News RSS (no API key needed) for every
  query, plus any extra_feeds.
- Dedupes against the existing archive (docs/data/articles.json) by link.
- Writes the merged, trimmed, newest-first archive back out.

Designed to be safe to run repeatedly: a broken feed or a network hiccup on
one query never aborts the whole run, it's just logged and skipped.
"""

import json
import hashlib
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import feedparser
import yaml
from dateutil import parser as dateparser

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "sources.yaml"
ARCHIVE_FILE = ROOT / "docs" / "data" / "articles.json"
LOG_FILE = ROOT / "docs" / "data" / "last_run.json"

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"


def load_sources():
    with open(SOURCES_FILE, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_archive():
    if ARCHIVE_FILE.exists():
        with open(ARCHIVE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def make_id(link: str) -> str:
    return hashlib.sha1(link.encode("utf-8")).hexdigest()[:16]


def parse_date(raw: str) -> str:
    """Return an ISO-8601 UTC string, falling back to 'now' if unparseable."""
    if not raw:
        return datetime.now(timezone.utc).isoformat()
    try:
        dt = dateparser.parse(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except (ValueError, OverflowError):
        return datetime.now(timezone.utc).isoformat()


def clean_source_name(entry, fallback):
    src = entry.get("source")
    if isinstance(src, dict):
        return src.get("title", fallback)
    if hasattr(entry, "source") and getattr(entry.source, "title", None):
        return entry.source.title
    return fallback


def fetch_query(label, q, country, topic, max_items, log):
    url = GOOGLE_NEWS_RSS.format(query=urllib.parse.quote(q))
    try:
        feed = feedparser.parse(url)
    except Exception as exc:  # noqa: BLE001 - never let one query kill the run
        log.append({"query": label, "status": "error", "detail": str(exc)})
        return []

    if feed.bozo and not feed.entries:
        log.append({"query": label, "status": "empty_or_bad", "detail": str(feed.bozo_exception)})
        return []

    records = []
    for entry in feed.entries[:max_items]:
        link = entry.get("link", "")
        if not link:
            continue
        title = entry.get("title", "Untitled")
        published_raw = entry.get("published", "") or entry.get("updated", "")
        records.append(
            {
                "id": make_id(link),
                "title": title,
                "link": link,
                "source": clean_source_name(entry, fallback=label),
                "published": parse_date(published_raw),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "country": country,
                "topic": topic,
                "query_label": label,
            }
        )
    log.append({"query": label, "status": "ok", "count": len(records)})
    return records


def fetch_extra_feed(feed_cfg, max_items, log):
    label = feed_cfg.get("label", feed_cfg.get("url", "extra feed"))
    url = feed_cfg["url"]
    country = feed_cfg.get("country", "ASEAN")
    topic = feed_cfg.get("topic", "General")
    try:
        feed = feedparser.parse(url)
    except Exception as exc:  # noqa: BLE001
        log.append({"query": label, "status": "error", "detail": str(exc)})
        return []

    if feed.bozo and not feed.entries:
        log.append({"query": label, "status": "empty_or_bad", "detail": str(feed.bozo_exception)})
        return []

    records = []
    for entry in feed.entries[:max_items]:
        link = entry.get("link", "")
        if not link:
            continue
        published_raw = entry.get("published", "") or entry.get("updated", "")
        records.append(
            {
                "id": make_id(link),
                "title": entry.get("title", "Untitled"),
                "link": link,
                "source": clean_source_name(entry, fallback=label),
                "published": parse_date(published_raw),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "country": country,
                "topic": topic,
                "query_label": label,
            }
        )
    log.append({"query": label, "status": "ok", "count": len(records)})
    return records


def main():
    config = load_sources()
    settings = config.get("settings", {})
    max_per_query = settings.get("max_per_query", 12)
    max_stored = settings.get("max_articles_stored", 600)

    run_log = []
    fresh = []

    for q in config.get("queries", []):
        fresh.extend(
            fetch_query(
                q["label"], q["q"], q.get("country", "ASEAN"), q.get("topic", "General"),
                max_per_query, run_log,
            )
        )
        time.sleep(1)  # be polite between requests

    for feed_cfg in config.get("extra_feeds", []) or []:
        fresh.extend(fetch_extra_feed(feed_cfg, max_per_query, run_log))
        time.sleep(1)

    archive = load_archive()
    existing_links = {a["link"] for a in archive}

    new_count = 0
    for rec in fresh:
        if rec["link"] not in existing_links:
            archive.append(rec)
            existing_links.add(rec["link"])
            new_count += 1

    archive.sort(key=lambda a: a["published"], reverse=True)
    archive = archive[:max_stored]

    ARCHIVE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(ARCHIVE_FILE, "w", encoding="utf-8") as f:
        json.dump(archive, f, ensure_ascii=False, indent=2)

    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(
            {
                "last_run": datetime.now(timezone.utc).isoformat(),
                "new_articles": new_count,
                "total_articles": len(archive),
                "queries": run_log,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print(f"Fetched {len(fresh)} results, {new_count} new. Archive now has {len(archive)} articles.")


if __name__ == "__main__":
    sys.exit(main())
