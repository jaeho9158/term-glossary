(function () {
  const input = document.getElementById("global-term-search");
  const resultsEl = document.getElementById("global-term-search-results");
  if (!input || !resultsEl) return;

  const base = document.body.getAttribute("data-base") || "";

  // Local copy of assets/category-data.js CATEGORY_LABELS: term pages don't load
  // category-data.js, but this file needs category labels for search result tags.
  const LOCAL_CATEGORY_LABELS = {
    stat: "통계",
    method: "연구방법론",
    tool: "측정·도구",
    ethics: "윤리·출판",
    phys: "물리학",
    chem: "화학",
    bio: "생물학",
    earth: "지구과학",
    neuro: "뇌과학·신경과학",
    med: "의학",
    pubhealth: "보건학",
    psych: "심리학",
    socialecon: "사회과학·경제학",
    eng: "공학",
    cs: "컴퓨터과학·AI",
    math: "수학",
  };
  const RECENT_KEY = "recentSearches";
  let terms = null;
  let fuse = null;
  let activeIndex = -1;

  // 이 파일은 3만8천여 개 용어 페이지에서도 로드되는데, 그쪽에는
  // assets/escape.js가 실려 있지 않다. 그래서 공용 escapeHtml에 의존하지 않고
  // 자체 구현을 둔다(있으면 그것을 쓴다 — 집합·순서는 escape.js와 동일).
  const esc =
    typeof escapeHtml === "function"
      ? escapeHtml
      : (str) =>
          String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

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

  // Exact (case-insensitive) lookup for title_en / aliases, keyed by the
  // lowercased value. Short English abbreviations (CI, SD, SE, OR, HR, RR...)
  // are common in this dictionary's aliases, but Fuse's fuzzy substring
  // matching has almost no discriminating power on a 2-3 character query —
  // it ranks unrelated terms that merely *contain* those letters (e.g. "CI"
  // fuzzy-matches "INCI", "ORCID", "ACID") above the actual exact match, or
  // pushes it off the results entirely. An exact index sidesteps that: any
  // query that's a verbatim abbreviation always surfaces its term first.
  let exactAliasIndex = null;

  function buildExactAliasIndex(list) {
    const map = new Map();
    const add = (key, term) => {
      if (!key) return;
      const k = key.toLowerCase();
      if (!map.has(k)) map.set(k, []);
      const bucket = map.get(k);
      if (!bucket.some((t) => t.slug === term.slug)) bucket.push(term);
    };
    for (const term of list) {
      add(term.title_en, term);
      for (const alias of term.aliases || []) add(alias, term);
    }
    return map;
  }

  // terms-index.json은 수 MB다. loadTerms()는 스크립트 로드 시점·포커스·
  // 입력마다 호출되는데, terms에 값이 들어가는 건 await 이후라 예전에는
  // 같은 파일을 동시에 여러 번 내려받았다. 진행 중인 Promise를 캐시해 한 번만
  // 받는다. 실패는 삼켜서(빈 결과) 검색어 입력이 예외로 죽지 않게 한다.
  let termsPromise = null;

  function loadTerms() {
    if (termsPromise) return termsPromise;
    termsPromise = fetchTerms().catch((err) => {
      console.error("terms-index.json 로드 실패:", err);
      termsPromise = null; // 다음 입력에서 재시도할 수 있게 한다
      return null;
    });
    return termsPromise;
  }

  async function fetchTerms() {
    if (terms) return terms;
    const res = await fetch(base + "terms-index.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    terms = await res.json();
    exactAliasIndex = buildExactAliasIndex(terms);
    fuse = new Fuse(terms, {
      includeScore: true,
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 1,
      keys: [
        { name: "title_ko", weight: 0.55 },
        { name: "title_en", weight: 0.3 },
        { name: "aliases", weight: 0.15 },
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
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
    } catch (e) { /* 프라이빗 모드 등 저장 실패는 무시 */ }
  }

  function matchResults(query) {
    const q = query.trim();
    if (!q || !fuse) return [];

    const exactMatches = (exactAliasIndex && exactAliasIndex.get(q.toLowerCase())) || [];
    const seenSlugs = new Set(exactMatches.map((t) => t.slug));

    const fuzzyMatches = fuse
      .search(q)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.item)
      .filter((t) => !seenSlugs.has(t.slug));

    return [...exactMatches, ...fuzzyMatches].slice(0, 8);
  }

  // 목록을 열고 닫는 통로를 하나로 모은다. 열림 상태가 aria-expanded와
  // 항상 같이 움직여야 스크린리더가 "목록이 열렸다"를 놓치지 않는다.
  function setOpen(open) {
    resultsEl.hidden = !open;
    input.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) setActive(-1);
  }

  function optionEls() {
    return resultsEl.querySelectorAll('[role="option"]');
  }

  // activeIndex는 -1이면 "입력창에 있음", 0 이상이면 그 번째 항목에 있음.
  function setActive(index) {
    activeIndex = index;
    const items = optionEls();
    items.forEach((el, i) => {
      el.setAttribute("aria-selected", i === index ? "true" : "false");
    });
    if (index >= 0 && items[index]) {
      input.setAttribute("aria-activedescendant", items[index].id);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function moveActive(delta) {
    const items = optionEls();
    if (items.length === 0) return;
    const next = activeIndex + delta;
    // 첫 항목에서 위로 더 가면 입력창으로 되돌아온다(막다른 곳을 만들지 않는다).
    if (next < 0) {
      setActive(-1);
      input.focus();
      return;
    }
    setActive(Math.min(next, items.length - 1));
    items[activeIndex].focus();
  }

  function renderResults(matches) {
    if (matches.length === 0) {
      resultsEl.innerHTML = "";
      setOpen(false);
      return;
    }
    resultsEl.innerHTML = matches
      .map((t, i) => {
        const enPart = t.title_en ? ` <span class="term-en">(${esc(t.title_en)})</span>` : "";
        const mainCat = t.categories && t.categories[0];
        const catLabel = mainCat ? LOCAL_CATEGORY_LABELS[mainCat] : null;
        const tagParts = [catLabel, t.subcategory].filter(Boolean);
        const tag = tagParts.length
          ? `<span class="term-search-tag">${esc(tagParts.join(" > "))}</span>`
          : "";
        return `<li><a id="hs-opt-${i}" role="option" aria-selected="false" href="${base}terms/${encodeURIComponent(
          t.slug
        )}.html">${esc(t.title_ko)}${enPart}${tag}</a></li>`;
      })
      .join("");
    setOpen(true);
  }

  function renderRecent() {
    const recent = getRecent();
    if (recent.length === 0) {
      resultsEl.innerHTML = "";
      setOpen(false);
      return;
    }
    // 최근 검색어는 사용자가 입력한 문자열(localStorage 출처)이라 그대로
    // innerHTML에 넣으면 자기 자신에 대한 스크립트 주입이 가능하다 —
    // 속성/본문 양쪽 모두 이스케이프한다.
    // tabindex/role은 검색 결과와 동일하게 키보드로 오르내릴 수 있게 하려는 것.
    resultsEl.innerHTML = recent
      .map(
        (q, i) =>
          `<li class="recent-search-item" id="hs-opt-${i}" role="option" aria-selected="false" tabindex="-1" data-query="${esc(
            q
          )}">${esc(q)}</li>`
      )
      .join("");
    setOpen(true);
  }

  let searchDebounceTimer = null;
  let isComposing = false;

  async function runSearch() {
    await loadTerms();
    const value = input.value;
    if (!value.trim()) {
      renderRecent();
      return;
    }
    const matches = matchResults(value);
    renderResults(matches);
    scheduleZeroResultLog(value, matches.length);
  }

  input.addEventListener("compositionstart", () => {
    isComposing = true;
  });

  input.addEventListener("compositionend", () => {
    isComposing = false;
    clearTimeout(searchDebounceTimer);
    runSearch();
  });

  input.addEventListener("input", () => {
    if (isComposing) return;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(runSearch, 150);
  });

  // 키보드 처리는 입력창이 아니라 검색 위젯 전체에 건다. 항목으로 포커스가
  // 옮겨간 뒤에도 방향키·Esc가 계속 동작해야 하기 때문(입력창에만 걸면
  // 첫 항목으로 내려간 순간 그 뒤 키 입력이 전부 무시된다).
  const searchRoot = input.closest(".header-search") || resultsEl.parentElement || document;

  searchRoot.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (resultsEl.hidden) return;
      e.preventDefault();
      setOpen(false);
      input.focus(); // 닫은 뒤엔 바로 이어서 타이핑할 수 있어야 한다
      return;
    }

    const items = optionEls();
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Enter") {
      const focused = document.activeElement;
      const recentItem = focused && focused.closest && focused.closest(".recent-search-item");
      if (recentItem) {
        // 최근 검색어 항목은 링크가 아니라서 Enter 기본 동작이 없다.
        e.preventDefault();
        input.value = recentItem.dataset.query;
        input.focus();
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (activeIndex === -1) {
        e.preventDefault();
        saveRecent(input.value);
        items[0].click();
      }
      // 결과 링크에 포커스가 있으면 브라우저 기본 동작(이동)에 맡긴다.
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
      setOpen(false);
    }
  });

  input.addEventListener("focus", async () => {
    if (!input.value.trim()) {
      renderRecent();
    } else if (resultsEl.children.length > 0) {
      setOpen(true);
    }
    await loadTerms();
  });

  // 콤보박스 의미 부여 — 이게 없으면 스크린리더는 그냥 텍스트 입력칸으로만 읽는다.
  if (!resultsEl.id) resultsEl.id = "header-search-listbox";
  resultsEl.setAttribute("role", "listbox");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", resultsEl.id);

  loadTerms();
})();
