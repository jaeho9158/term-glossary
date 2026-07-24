(function () {
  const input = document.getElementById("global-term-search");
  const resultsEl = document.getElementById("global-term-search-results");
  if (!input || !resultsEl) return;

  const base = document.body.getAttribute("data-base") || "";
  const RECENT_KEY = "recentSearches";
  let terms = null;
  let fuse = null;
  let activeIndex = -1;

  const SUPABASE_URL = "https://schdtmdpgexsacxzozso.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjaGR0bWRwZ2V4c2FjeHpvenNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzI1MjMsImV4cCI6MjA5OTEwODUyM30.OT0YaKOmPwnQcfvqqwRut6aJFJ98k_pdOiE4yTUmitY";
  const loggedZeroResultQueries = new Set();
  let zeroResultLogTimer = null;

  function logZeroResultSearch(query, resultCount) {
    const q = query.trim();
    if (q.length < 2 || loggedZeroResultQueries.has(q)) return;
    loggedZeroResultQueries.add(q);
    fetch(`${SUPABASE_URL}/rest/v1/tg_search_log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ query: q, result_count: resultCount }),
    }).catch(() => {});
  }

  function scheduleZeroResultLog(query, resultCount) {
    clearTimeout(zeroResultLogTimer);
    if (resultCount !== 0) return;
    zeroResultLogTimer = setTimeout(() => logZeroResultSearch(query, resultCount), 600);
  }

  async function loadTerms() {
    if (terms) return terms;
    const res = await fetch(base + "terms.json");
    terms = await res.json();
    fuse = new Fuse(terms, {
      includeScore: true,
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 1,
      keys: [
        { name: "title_ko", weight: 0.5 },
        { name: "title_en", weight: 0.3 },
        { name: "aliases", weight: 0.15 },
        { name: "definition", weight: 0.05 },
      ],
    });
    return terms;
  }

  function getRecent() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveRecent(query) {
    const q = query.trim();
    if (!q) return;
    const list = getRecent().filter((v) => v !== q);
    list.unshift(q);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
  }

  function matchResults(query) {
    const q = query.trim();
    if (!q) return [];
    return fuse
      .search(q)
      .sort((a, b) => a.score - b.score)
      .slice(0, 8)
      .map((r) => r.item);
  }

  function renderResults(matches) {
    activeIndex = -1;
    if (matches.length === 0) {
      resultsEl.innerHTML = "";
      resultsEl.hidden = true;
      return;
    }
    resultsEl.innerHTML = matches
      .map((t) => {
        const enPart = t.title_en ? ` <span class="term-en">(${t.title_en})</span>` : "";
        return `<li><a href="${base}terms/${t.slug}.html">${t.title_ko}${enPart}</a></li>`;
      })
      .join("");
    resultsEl.hidden = false;
  }

  function renderRecent() {
    const recent = getRecent();
    if (recent.length === 0) {
      resultsEl.innerHTML = "";
      resultsEl.hidden = true;
      return;
    }
    resultsEl.innerHTML = recent
      .map((q) => `<li class="recent-search-item" data-query="${q.replace(/"/g, "&quot;")}">${q}</li>`)
      .join("");
    resultsEl.hidden = false;
  }

  input.addEventListener("input", async () => {
    await loadTerms();
    const value = input.value;
    if (!value.trim()) {
      renderRecent();
      return;
    }
    const matches = matchResults(value);
    renderResults(matches);
    scheduleZeroResultLog(value, matches.length);
  });

  input.addEventListener("keydown", (e) => {
    const items = resultsEl.querySelectorAll("li a");
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      items[activeIndex].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      items[activeIndex].focus();
    } else if (e.key === "Enter" && activeIndex === -1) {
      saveRecent(input.value);
      items[0].click();
    } else if (e.key === "Escape") {
      renderResults([]);
      input.blur();
    }
  });

  resultsEl.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (link) {
      saveRecent(input.value);
      return;
    }
    const recentItem = e.target.closest(".recent-search-item");
    if (recentItem) {
      input.value = recentItem.dataset.query;
      input.dispatchEvent(new Event("input"));
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".header-search")) {
      resultsEl.hidden = true;
    }
  });

  input.addEventListener("focus", async () => {
    if (!input.value.trim()) {
      renderRecent();
    } else if (resultsEl.children.length > 0) {
      resultsEl.hidden = false;
    }
    await loadTerms();
  });
})();
