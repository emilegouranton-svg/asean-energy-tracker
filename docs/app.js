const COUNTRY_NAMES = {
  VN: "Vietnam",
  MY: "Malaysia",
  PH: "Philippines",
  ID: "Indonesia",
  TH: "Thailand",
  SG: "Singapore",
  LA: "Laos",
  KH: "Cambodia",
  MM: "Myanmar",
  BN: "Brunei",
  ASEAN: "ASEAN-wide",
};

const COUNTRY_ORDER = ["VN", "MY", "PH", "ID", "TH", "SG", "ASEAN", "LA", "KH", "MM", "BN"];
const TOPICS = ["HVDC", "Offshore Wind", "Interconnector", "General"];

const state = {
  topics: new Set(),
  countries: new Set(),
  windowDays: 0,
  search: "",
  sort: "desc",
};

let ARTICLES = [];

function slug(s) {
  return s.toLowerCase().replace(/\s+/g, "-");
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = diffMs / 36e5;
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

async function loadData() {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  try {
    const [articlesRes, runRes] = await Promise.all([
      fetch("data/articles.json", { cache: "no-store" }),
      fetch("data/last_run.json", { cache: "no-store" }).catch(() => null),
    ]);
    ARTICLES = await articlesRes.json();

    if (runRes && runRes.ok) {
      const run = await runRes.json();
      const when = new Date(run.last_run);
      statusDot.classList.add("live");
      statusText.textContent = `Last run ${when.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · +${run.new_articles} new today`;
      document.getElementById("archiveMeta").textContent =
        `${run.total_articles} articles tracked\nlast automated run: ${when.toLocaleString("en-GB")}`;
    } else {
      statusText.textContent = "Awaiting first automated run";
      document.getElementById("archiveMeta").textContent = `${ARTICLES.length} articles tracked (seed data)`;
    }
  } catch (err) {
    statusText.textContent = "Feed unavailable";
    console.error(err);
  }

  renderGridStrip();
  renderTopicChips();
  renderCountryChips();
  render();
}

function countBy(field) {
  const counts = {};
  ARTICLES.forEach((a) => {
    counts[a[field]] = (counts[a[field]] || 0) + 1;
  });
  return counts;
}

function hasRecent(country) {
  const cutoff = Date.now() - 24 * 36e5;
  return ARTICLES.some((a) => a.country === country && new Date(a.published).getTime() > cutoff);
}

function renderGridStrip() {
  const counts = countBy("country");
  const present = COUNTRY_ORDER.filter((c) => counts[c]);
  const wrap = document.getElementById("gridStrip");
  wrap.innerHTML = "";
  present.forEach((code, i) => {
    const node = document.createElement("button");
    node.className = "node" + (hasRecent(code) ? " has-new" : "");
    node.dataset.country = code;
    node.innerHTML = `
      <span class="node-dot"></span>
      <span class="node-code">${code}</span>
      <span class="node-count">${counts[code]}</span>
    `;
    node.title = COUNTRY_NAMES[code] || code;
    node.addEventListener("click", () => toggleCountry(code));
    wrap.appendChild(node);
    if (i < present.length - 1) {
      const wire = document.createElement("span");
      wire.className = "wire";
      wrap.appendChild(wire);
    }
  });
}

function renderTopicChips() {
  const wrap = document.getElementById("topicChips");
  wrap.innerHTML = "";
  TOPICS.forEach((topic) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = topic;
    btn.dataset.topic = topic;
    btn.addEventListener("click", () => toggleTopic(topic));
    wrap.appendChild(btn);
  });
}

function renderCountryChips() {
  const counts = countBy("country");
  const present = COUNTRY_ORDER.filter((c) => counts[c]);
  const wrap = document.getElementById("countryChips");
  wrap.innerHTML = "";
  present.forEach((code) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = COUNTRY_NAMES[code] || code;
    btn.dataset.country = code;
    btn.addEventListener("click", () => toggleCountry(code));
    wrap.appendChild(btn);
  });
}

function toggleTopic(topic) {
  state.topics.has(topic) ? state.topics.delete(topic) : state.topics.add(topic);
  render();
}

function toggleCountry(code) {
  state.countries.has(code) ? state.countries.delete(code) : state.countries.add(code);
  render();
}

function syncChipStates() {
  document.querySelectorAll("#topicChips .chip").forEach((el) => {
    el.classList.toggle("active", state.topics.has(el.dataset.topic));
  });
  document.querySelectorAll("#countryChips .chip").forEach((el) => {
    el.classList.toggle("active", state.countries.has(el.dataset.country));
  });
  document.querySelectorAll(".node").forEach((el) => {
    el.classList.toggle("active", state.countries.has(el.dataset.country));
  });
  document.querySelectorAll("#windowChips .chip").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.window) === state.windowDays);
  });
}

function filteredArticles() {
  const cutoff = state.windowDays > 0 ? Date.now() - state.windowDays * 24 * 36e5 : 0;
  const q = state.search.trim().toLowerCase();

  let list = ARTICLES.filter((a) => {
    if (state.topics.size && !state.topics.has(a.topic)) return false;
    if (state.countries.size && !state.countries.has(a.country)) return false;
    if (cutoff && new Date(a.published).getTime() < cutoff) return false;
    if (q && !(a.title.toLowerCase().includes(q) || a.source.toLowerCase().includes(q))) return false;
    return true;
  });

  list.sort((a, b) => {
    const diff = new Date(a.published) - new Date(b.published);
    return state.sort === "desc" ? -diff : diff;
  });

  return list;
}

function render() {
  syncChipStates();
  const list = filteredArticles();
  const container = document.getElementById("articleList");
  const empty = document.getElementById("emptyState");
  container.innerHTML = "";

  document.getElementById("resultCount").textContent =
    `${list.length} article${list.length === 1 ? "" : "s"}`;

  empty.hidden = list.length !== 0;

  list.forEach((a) => {
    const li = document.createElement("li");
    const card = document.createElement("a");
    card.href = a.link;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.className = `article-card topic-${slug(a.topic)}`;
    card.innerHTML = `
      <div class="card-meta">
        <span class="tag country">${a.country}</span>
        <span class="tag topic-${slug(a.topic)}">${a.topic}</span>
        <span>${timeAgo(a.published)}</span>
      </div>
      <p class="card-title">${a.title}</p>
      <p class="card-source">${a.source}</p>
    `;
    li.appendChild(card);
    container.appendChild(li);
  });
}

document.getElementById("searchInput").addEventListener("input", (e) => {
  state.search = e.target.value;
  render();
});

document.getElementById("sortSelect").addEventListener("change", (e) => {
  state.sort = e.target.value;
  render();
});

document.getElementById("windowChips").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-window]");
  if (!btn) return;
  state.windowDays = Number(btn.dataset.window);
  render();
});

document.getElementById("resetBtn").addEventListener("click", () => {
  state.topics.clear();
  state.countries.clear();
  state.windowDays = 0;
  state.search = "";
  document.getElementById("searchInput").value = "";
  render();
});

loadData();
