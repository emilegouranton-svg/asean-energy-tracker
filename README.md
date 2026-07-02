# ASEAN Grid Watch

A self-updating tracker for HVDC, offshore wind, and cross-border interconnector
news across ASEAN. Runs entirely on GitHub's free tier: a scheduled GitHub
Action fetches new articles every day from Google News RSS (no API key
needed) and pushes them straight to a static site served by GitHub Pages.

No server to maintain, nothing to pay for, nothing to keep running on your
own machine.

## How it works

```
sources.yaml              → the list of tracked queries (country + topic tagged)
scripts/fetch_articles.py → pulls fresh results, dedupes, writes the archive
docs/data/articles.json   → the article archive (what the site reads)
docs/index.html/.css/.js  → the static site itself (GitHub Pages serves /docs)
.github/workflows/update.yml → runs the fetch script daily and commits changes
```

Every night, GitHub Actions runs the fetch script, which:
1. Reads `sources.yaml`
2. Queries Google News RSS for each entry
3. Skips anything already in the archive (by article URL)
4. Appends new articles, trims the archive to the most recent 600, and commits

Because the commit happens automatically, GitHub Pages redeploys the site
within a minute or two — you don't touch anything.

## One-time setup (10 minutes)

1. **Create a GitHub account** if you don't have one (free): https://github.com/signup

2. **Create a new repository** and upload this folder's contents to it.
   Easiest path if you're not on the command line:
   - On github.com, click **New repository**, name it e.g. `asean-grid-watch`, keep it Public (Pages requires a paid plan for private repos on personal accounts), don't add a README (you already have one).
   - On the new repo's page, click **uploading an existing file** and drag in the whole folder contents (keep the folder structure — `.github/`, `scripts/`, `docs/`, `sources.yaml`, `README.md`).

   Or, if you're comfortable with git:
   ```bash
   cd asean-energy-tracker
   git init
   git add .
   git commit -m "Initial setup"
   git branch -M main
   git remote add origin https://github.com/<your-username>/asean-grid-watch.git
   git push -u origin main
   ```

3. **Enable GitHub Pages**
   - In the repo, go to **Settings → Pages**
   - Under "Build and deployment", set **Source** to "Deploy from a branch"
   - Set **Branch** to `main` and folder to `/docs`, then **Save**
   - Your site will be live at `https://<your-username>.github.io/asean-grid-watch/` within a minute or two

4. **Enable Actions** (usually on by default for a repo you create)
   - Go to the **Actions** tab. If prompted, click "I understand my workflows, go ahead and enable them"
   - Click into **Daily article fetch** → **Run workflow** to trigger the first real fetch immediately, rather than waiting for the nightly schedule

That's it. From here it updates itself every day at 23:00 UTC (06:00 Paris
time the next morning — edit the cron line in
`.github/workflows/update.yml` if you'd like a different time).

## Customising what it tracks

Open `sources.yaml` and edit the `queries` list — each entry is a Google
News search plus a `country` and `topic` tag used for filtering on the
site. To track Thailand's TPA Code reform and the VTMS corridor more
closely, for example, add:

```yaml
  - label: "Thailand VTMS corridor"
    q: "VTMS Vietnam Thailand Malaysia Singapore power corridor"
    country: "TH"
    topic: "Interconnector"
```

Changes take effect on the next scheduled (or manually triggered) run — no
need to touch the Python code.

### Adding a direct RSS feed

If you find a trade-press site with its own working feed (many WordPress
sites publish one at `/feed/`), add it under `extra_feeds` in
`sources.yaml`. The fetch script tries it on every run and simply logs a
skip if the feed doesn't parse — it won't break anything.

## Checking on it

- `docs/data/last_run.json` shows the timestamp of the last successful run,
  how many new articles it found, and a per-query status log — useful for
  spotting a query that's stopped returning results.
- The **Actions** tab in GitHub shows the log of every run, success or
  failure.
- The site itself shows "Last run … · +N new today" in the top-right status
  indicator.

## Notes

- Google News RSS is free and needs no key, but it's not officially an
  API — if Google ever changes the endpoint format, the fetch script would
  need a small update. This is the trade-off for zero-cost, zero-key setup.
- The seed data already in `docs/data/articles.json` are the real articles
  found during the July 2026 research pass, so the site is populated from
  day one rather than starting empty.
- The archive keeps the most recent 600 articles (~configurable in
  `sources.yaml` under `settings.max_articles_stored`); older ones roll off
  automatically so the JSON file stays small and the site stays fast.
