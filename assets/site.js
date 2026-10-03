// 중복 분야 병합·대형 분야 분할로 없어진 옛 카테고리 코드가 URL에 남아 있을 수
// 있다(검색엔진에 이미 색인된 링크). CATEGORY_ALIASES로 새 코드에 넘겨준다.
// 하나가 둘로 쪼개진 경우(예: physchem -> phys, chem)는 양쪽을 함께 보여준다.
function resolveCategoryParam(code) {
  if (!code) return [];
  if (CATEGORY_LABELS[code]) return [code];
  const alias = typeof CATEGORY_ALIASES !== "undefined" && CATEGORY_ALIASES[code];
  return alias ? alias.slice() : [];
}

// 실패 시 null을 돌려 호출부가 빈 화면 대신 안내 문구를 보여줄 수 있게 한다.
// (terms-index.json은 수 MB라 모바일·불안정 회선에서 전송 실패가 드물지 않다.)
async function loadTerms() {
  try {
    const res = await fetch("terms-index.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("용어 목록 로드 실패:", err);
    return null;
  }
}

// escapeHtml은 assets/escape.js(전역)를 사용한다 — category.html이 먼저 로드함.
function termLinkHTML(term) {
  const enPart = term.title_en
    ? ` <span class="term-en">(${escapeHtml(term.title_en)})</span>`
    : "";

  return `
    <li>
      <a href="terms/${encodeURIComponent(term.slug)}.html">
        ${escapeHtml(term.title_ko)}${enPart}
      </a>
    </li>
  `;
}

// Term counts per category have grown into the thousands, and a subcategory
// list with hundreds of <li> elements open at once is what makes browsing
// (as opposed to searching) feel sluggish/unwieldy. Render only the first
// page of each subcategory up front, with a "더 보기" button to reveal the
// rest — full result sets still render immediately while actively searching,
// since a filtered list is already short and the user wants to see it all.
const TERM_LIST_PAGE_SIZE = 40;

// Returns a DocumentFragment containing the <ul> (and, when paged, a
// "더 보기" button after it) so the caller can append() it as one unit
// regardless of whether pagination kicked in.
function buildTermListFragment(terms, { paged }) {
  const fragment = document.createDocumentFragment();
  const termList = document.createElement("ul");
  termList.className = "namu-term-list";
  fragment.appendChild(termList);

  if (!paged || terms.length <= TERM_LIST_PAGE_SIZE) {
    termList.innerHTML = terms.map((term) => termLinkHTML(term)).join("");
    return fragment;
  }

  termList.innerHTML = terms
    .slice(0, TERM_LIST_PAGE_SIZE)
    .map((term) => termLinkHTML(term))
    .join("");

  const moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "term-list-more-btn";
  moreBtn.textContent = `${terms.length - TERM_LIST_PAGE_SIZE}개 더 보기`;
  moreBtn.addEventListener("click", () => {
    termList.innerHTML += terms
      .slice(TERM_LIST_PAGE_SIZE)
      .map((term) => termLinkHTML(term))
      .join("");
    moreBtn.remove();
  });
  fragment.appendChild(moreBtn);

  return fragment;
}

// ---- 분야 페이지(한 분야만 보는 화면) ----------------------------------

// 검색 일치 순위: 0 = 정확히 일치, 1 = 접두, 2 = 포함, null = 불일치.
function termMatchRank(t, q) {
  if (!q) return null;
  const fields = [
    (t.title_ko || "").toLowerCase(),
    (t.title_en || "").toLowerCase(),
    ...(t.aliases || []).map((a) => a.toLowerCase()),
  ];
  if (fields.some((f) => f === q)) return 0;
  if (fields.some((f) => f.startsWith(q))) return 1;
  if (fields.some((f) => f.includes(q))) return 2;
  return null;
}

// 표제어의 가나다 머리글. 한글 음절은 초성(쌍자음은 평자음으로 합침),
// 영문은 대문자, 숫자는 "0-9", 그 밖은 "#".
const INITIAL_CONSONANTS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const INITIAL_FOLD = { "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ" };
const INITIAL_ORDER = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ";

function initialOf(title) {
  const ch = String(title || "").trim().charAt(0);
  if (!ch) return "#";
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const c = INITIAL_CONSONANTS[Math.floor((code - 0xac00) / 588)];
    return INITIAL_FOLD[c] || c;
  }
  if (/[A-Za-z]/.test(ch)) return ch.toUpperCase();
  if (/[0-9]/.test(ch)) return "0-9";
  return "#";
}

function initialRank(g) {
  const k = INITIAL_ORDER.indexOf(g);
  if (k !== -1) return k;
  if (/^[A-Z]$/.test(g)) return 100 + g.charCodeAt(0);
  return g === "0-9" ? 200 : 300;
}

// 표제어 가나다순으로 정렬하고 머리글별로 묶는다: [{ initial, terms }]
function groupByInitial(terms) {
  const groups = {};
  for (const t of terms) (groups[initialOf(t.title_ko)] ||= []).push(t);
  return Object.keys(groups)
    .sort((a, b) => initialRank(a) - initialRank(b))
    .map((initial) => ({
      initial,
      terms: groups[initial].sort((a, b) =>
        String(a.title_ko).localeCompare(String(b.title_ko), "ko")),
    }));
}

// 슬러그 목록(인기순)을 용어 객체로 바꾼다. 이 분야에 없는 슬러그는 건너뛴다.
function pickPopular(slugs, bySlug, limit = 20) {
  const out = [];
  for (const s of slugs || []) {
    if (bySlug[s]) out.push(bySlug[s]);
    if (out.length >= limit) break;
  }
  return out;
}

// 하위 주제 표시 이름. 데이터의 "관련 용어"는 화면에서만 "기타"로 부른다.
const FIELD_OTHER_KEY = "관련 용어";
function subLabel(name) {
  return name === FIELD_OTHER_KEY ? "기타" : name;
}

// 하위 주제 순서: 지정 순서 → 나머지 가나다 → 기타(맨 끝)
function sortSubNames(names, order) {
  const isOther = (n) => n === FIELD_OTHER_KEY || n === "기타";
  return names.slice().sort((a, b) => {
    if (isOther(a) !== isOther(b)) return isOther(a) ? 1 : -1;
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b, "ko");
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

const FIELD_INDEX_MIN = 100; // 이보다 길면 가나다 색인과 머리글을 보여준다
const FIELD_POPULAR_N = 20;

function fieldTermRowHTML(term, shortMap) {
  const enPart = term.title_en
    ? ` <span class="term-en">(${escapeHtml(term.title_en)})</span>`
    : "";
  const d = shortMap && shortMap[term.slug];
  const desc = d ? `<span class="term-desc">${escapeHtml(d)}</span>` : "";
  return `<li><a href="terms/${encodeURIComponent(term.slug)}.html">` +
    `<span class="term-name">${escapeHtml(term.title_ko)}${enPart}</span>${desc}</a></li>`;
}

async function fetchJsonOrNull(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`${url} 로드 실패:`, err);
    return null;
  }
}

async function initFieldPage(allTerms, code) {
  const container = document.getElementById("category-sections");
  const searchInput = document.getElementById("term-search");
  if (!container) return;

  const fieldTerms = allTerms.filter((t) => t.categories?.includes(code));
  const bySlug = {};
  for (const t of fieldTerms) bySlug[t.slug] = t;

  const [popularAll, shortMap] = await Promise.all([
    fetchJsonOrNull("data/popular-terms.json"),
    fetchJsonOrNull(`data/category-short/${code}.json`),
  ]);
  const popular = popularAll
    ? pickPopular(popularAll[code], bySlug, FIELD_POPULAR_N)
    : [];

  // 하위 주제: 주 분야(categories[0])가 이 분야인 용어만 자기 하위 주제를 갖는다.
  const subMap = {};
  for (const t of fieldTerms) {
    const own = t.categories[0] === code && t.subcategory;
    (subMap[own ? t.subcategory : FIELD_OTHER_KEY] ||= []).push(t);
  }
  const subNames = sortSubNames(Object.keys(subMap), SUB_CATEGORY_ORDER[code] || []);

  container.innerHTML = `
    <div class="field-page">
      <p class="field-total">${escapeHtml(CATEGORY_LABELS[code] || code)} 용어 ${fieldTerms.length}개</p>
      <div class="field-chips" role="group" aria-label="하위 주제"></div>
      <p class="field-status" aria-live="polite"></p>
      <div class="field-index" role="navigation" aria-label="가나다 색인" hidden></div>
      <div class="field-list"></div>
    </div>`;
  const chipsEl = container.querySelector(".field-chips");
  const statusEl = container.querySelector(".field-status");
  const indexEl = container.querySelector(".field-index");
  const listEl = container.querySelector(".field-list");

  // 해시 → 상태. "" = 많이 찾는 용어, "all" = 전체, "sub-N" = N번째 하위 주제
  function readHash() {
    const h = location.hash.replace(/^#/, "");
    if (h === "all") return "all";
    const m = /^sub-(\d+)$/.exec(h);
    if (m && Number(m[1]) < subNames.length) return h;
    // 인기 목록을 못 불러왔으면 빈 화면 대신 첫 하위 주제를 보여준다.
    return popular.length ? "" : (subNames.length ? "sub-0" : "all");
  }

  function setView(view) {
    if (view === "") {
      history.pushState(null, "", location.pathname + location.search);
      render();
    } else {
      location.hash = view; // hashchange → render (뒤로 가기 지원)
    }
  }

  function chipHTML(view, label, count, pressed) {
    return `<button type="button" class="field-chip" data-view="${view}" aria-pressed="${pressed}">` +
      `${escapeHtml(label)} <span class="field-chip-count">${count}</span></button>`;
  }

  function renderList(rows, grouped) {
    if (!rows.length) {
      listEl.innerHTML = '<p class="field-empty">일치하는 용어가 없습니다.</p>';
      indexEl.hidden = true;
      return;
    }
    if (grouped && rows.length > FIELD_INDEX_MIN) {
      const groups = groupByInitial(rows);
      indexEl.innerHTML = groups
        .map((g) => `<button type="button" class="field-jump" data-jump="${escapeHtml(g.initial)}">${escapeHtml(g.initial)}</button>`)
        .join("");
      indexEl.hidden = false;
      listEl.innerHTML = groups
        .map((g) => `<section class="field-group" data-initial="${escapeHtml(g.initial)}">` +
          `<h3 class="field-group-title">${escapeHtml(g.initial)}</h3>` +
          `<ul class="namu-term-list is-active">${g.terms.map((t) => fieldTermRowHTML(t, shortMap)).join("")}</ul></section>`)
        .join("");
    } else {
      indexEl.hidden = true;
      listEl.innerHTML =
        `<ul class="namu-term-list is-active">${rows.map((t) => fieldTermRowHTML(t, shortMap)).join("")}</ul>`;
    }
  }

  let focusView = null;
  function render() {
    const view = readHash();
    const q = (searchInput?.value || "").trim().toLowerCase();

    chipsEl.innerHTML =
      chipHTML("all", "전체", fieldTerms.length, view === "all") +
      subNames.map((n, i) => chipHTML(`sub-${i}`, subLabel(n), subMap[n].length, view === `sub-${i}`)).join("");
    if (focusView !== null) {
      // 칩 버튼을 다시 그렸으니 키보드 초점을 같은 칩으로 되돌린다.
      const again = chipsEl.querySelector(`[data-view="${focusView}"]`);
      if (again) again.focus();
      focusView = null;
    }

    if (q) {
      // 보이는 목록이 전체 보기면 그 목록, 그 밖(하위 주제·인기)이면 분야 전체가 대상.
      const rows = fieldTerms
        .map((t) => ({ t, r: termMatchRank(t, q) }))
        .filter((x) => x.r !== null)
        .sort((a, b) => a.r - b.r || String(a.t.title_ko).localeCompare(String(b.t.title_ko), "ko"))
        .map((x) => x.t);
      statusEl.textContent = `"${searchInput.value.trim()}" 검색: 이 분야 전체에서 ${rows.length}개` +
        (view === "all" ? "" : " (선택한 하위 주제와 상관없이 분야 전체를 검색합니다)");
      renderList(rows, false);
      if (window.trackNoResult) window.trackNoResult(searchInput.value, "category", rows.length);
      return;
    }
    if (window.trackNoResult) window.trackNoResult("", "category", -1); // 검색어가 비면 대기 중 전송을 취소

    if (view === "") {
      statusEl.textContent = `많이 찾는 용어 ${popular.length}개`;
      renderList(popular, false);
      if (fieldTerms.length > popular.length) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "term-list-more-btn field-show-all";
        btn.textContent = `전체 보기 (${fieldTerms.length}개)`;
        btn.addEventListener("click", () => setView("all"));
        listEl.appendChild(btn);
      }
      return;
    }
    if (view === "all") {
      statusEl.textContent = `전체 ${fieldTerms.length}개`;
      renderList(fieldTerms, true);
      return;
    }
    const name = subNames[Number(view.slice(4))];
    statusEl.textContent = `${subLabel(name)} ${subMap[name].length}개`;
    renderList(subMap[name], true);
  }

  chipsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".field-chip");
    if (!b) return;
    // 눌린 칩을 다시 누르면 기본(많이 찾는 용어) 화면으로 돌아간다.
    const next = b.getAttribute("aria-pressed") === "true" && popular.length ? "" : b.dataset.view;
    focusView = b.dataset.view;
    setView(next);
  });
  indexEl.addEventListener("click", (e) => {
    const b = e.target.closest(".field-jump");
    if (!b) return;
    const sec = [...listEl.querySelectorAll(".field-group")].find((s) => s.dataset.initial === b.dataset.jump);
    if (sec) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      sec.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  });
  window.addEventListener("hashchange", render);
  window.addEventListener("popstate", render);
  if (searchInput) {
    let timer = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(render, 150);
    });
  }
  render();
}

// ---- 전체 분야 허브(category.html, cat 없음) -----------------------------
// 분야는 펼치지 않고 링크 칩으로만 보여준다. 칩을 누르면 분야 페이지로 이동한다.
function hubChipHTML(code, count) {
  return `<a class="field-chip field-chip-link" href="category.html?cat=${encodeURIComponent(code)}">` +
    `${escapeHtml(CATEGORY_LABELS[code] || code)} <span class="field-chip-count">${count}</span>` +
    `<span class="field-chip-arrow" aria-hidden="true">→</span></a>`;
}

async function initHub(allTerms) {
  const container = document.getElementById("category-sections");
  const searchInput = document.getElementById("term-search");
  if (!container) return;

  const counts = {};
  for (const t of allTerms) for (const c of t.categories || []) counts[c] = (counts[c] || 0) + 1;
  const popularAll = await fetchJsonOrNull("data/popular-terms.json");
  const topFields = popularAll && Array.isArray(popularAll._fields)
    ? popularAll._fields.filter((c) => CATEGORY_LABELS[c])
    : [];

  if (searchInput) {
    searchInput.placeholder = "분야·용어 검색";
    searchInput.setAttribute("aria-label", "분야·용어 검색");
  }

  function draw(query) {
    const q = query.trim().toLowerCase();
    const chip = (code) => hubChipHTML(code, counts[code] || 0);
    const matches = (code) => !q || (CATEGORY_LABELS[code] || "").toLowerCase().includes(q) || code.toLowerCase() === q;
    let html = "";
    if (!q && topFields.length) {
      html += `<section class="category-group hub-popular"><h2 class="category-group-title">많이 찾는 분야</h2>` +
        `<div class="field-chips">${topFields.map(chip).join("")}</div></section>`;
    }
    let shown = 0;
    for (const g of CATEGORY_GROUPS) {
      const codes = g.codes.filter((c) => CATEGORY_LABELS[c] && matches(c));
      if (!codes.length) continue;
      shown += codes.length;
      html += `<section class="category-group"><h2 class="category-group-title">${escapeHtml(g.label)}</h2>` +
        `<div class="field-chips">${codes.map(chip).join("")}</div></section>`;
    }
    container.innerHTML = html;
    if (!q) {
      if (window.trackNoResult) window.trackNoResult("", "hub", -1);
      return;
    }
    const found = allTerms
      .map((t) => ({ t, r: termMatchRank(t, q) }))
      .filter((x) => x.r !== null)
      .sort((a, b) => a.r - b.r)
      .map((x) => x.t);
    const wrap = document.createElement("section");
    wrap.className = "category-group hub-term-results";
    wrap.innerHTML = `<h2 class="category-group-title">용어 ${found.length}개</h2>`;
    if (found.length) wrap.appendChild(buildTermListFragment(found, { paged: true }));
    else if (!shown) wrap.insertAdjacentHTML("beforeend", '<p class="field-empty">일치하는 분야나 용어가 없습니다.</p>');
    container.appendChild(wrap);
    if (window.trackNoResult) window.trackNoResult(query, "hub", found.length + shown);
  }

  draw("");
  if (searchInput) {
    let timer = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => draw(searchInput.value), 150);
    });
  }
}

function render(terms, query = "", category = "") {

  const container = document.getElementById("category-sections");
  if (!container) return;

  container.innerHTML = "";

  const q = query.trim().toLowerCase();

  // Match rank: 0 = exact match, 1 = starts-with, 2 = contains. Lower is better.
  function matchRank(t) {
    return termMatchRank(t, q);
  }

  let filtered = terms
    .map((t) => ({ term: t, rank: matchRank(t) }))
    .filter(({ rank }) => !q || rank !== null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map(({ term }) => term);

  // category는 단일 코드이거나, 쪼개진 옛 코드가 가리키는 여러 코드일 수 있다.
  const selected = Array.isArray(category)
    ? category
    : resolveCategoryParam(category);

  if (selected.length) {
    filtered = filtered.filter(term =>
      term.categories?.some(c => selected.includes(c))
    );
  }

  const codesToRender = selected.length ? selected : CATEGORY_ORDER;

  // 분야를 고르지 않은 전체 보기에서는 대분류로 한 번 묶어서 보여준다.
  const grouped = !selected.length && typeof CATEGORY_GROUPS !== "undefined";
  const groupOf = {};
  if (grouped) {
    for (const g of CATEGORY_GROUPS) {
      for (const c of g.codes) groupOf[c] = g.label;
    }
  }
  let currentGroup = null;
  let groupBody = null;

  for (const code of codesToRender) {

    const mainMatched = filtered.filter(term =>
      term.categories?.includes(code)
    );

    if (!mainMatched.length) continue;

    if (grouped && groupOf[code] !== currentGroup) {
      currentGroup = groupOf[code];
      const section = document.createElement("section");
      section.className = "category-group";
      const heading = document.createElement("h2");
      heading.className = "category-group-title";
      heading.textContent = currentGroup;
      section.appendChild(heading);
      container.appendChild(section);
      groupBody = section;
    }

    const mainDetails = document.createElement("details");
    mainDetails.className = "namu-main-category";

    if (q || selected.includes(code)) {
      mainDetails.open = true;
    }

    const moreLink = selected.includes(code)
      ? ""
      : `<a class="category-more-link" href="category.html?cat=${code}">더보기</a>`;

    mainDetails.innerHTML = `
      <summary class="category-summary">
        <span class="category-title">
          ${escapeHtml(CATEGORY_LABELS[code] || code)}
          <span class="category-count">
            ${mainMatched.length}개
          </span>
        </span>
        ${moreLink}
      </summary>
    `;

    const subWrapper = document.createElement("div");
    subWrapper.className = "namu-sub-wrapper";

    const subMap = {};
    const order = SUB_CATEGORY_ORDER[code] || [];

    mainMatched.forEach(term => {

      const isPrimaryCategory = term.categories && term.categories[0] === code;
      const assignedSub = (isPrimaryCategory && term.subcategory) || "관련 용어";

      if (!subMap[assignedSub]) {
        subMap[assignedSub] = [];
      }

      subMap[assignedSub].push(term);
    });

    const subNames = Object.keys(subMap).sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    for (const subName of subNames) {

      const subMatched = subMap[subName];

      if (!subMatched.length) continue;

      const subDetails = document.createElement("details");
      subDetails.className = "namu-sub-category";

      if (q) {
        subDetails.open = true;
      }

      subDetails.innerHTML = `
        <summary class="namu-sub-title">
          <span>${escapeHtml(subName)} (${subMatched.length}개)</span>
        </summary>
      `;

      // While actively searching/filtering, the result set is already short
      // and the user wants to see everything that matched — only page the
      // list when browsing the unfiltered category.
      subDetails.appendChild(buildTermListFragment(subMatched, { paged: !q }));
      subWrapper.appendChild(subDetails);
    }

    mainDetails.appendChild(subWrapper);
    (groupBody || container).appendChild(mainDetails);
  }
}

async function init() {

  const terms = await loadTerms();

  if (!terms) {
    const listEl = document.getElementById("category-sections");
    if (listEl) {
      listEl.innerHTML =
        '<p class="load-error">용어 목록을 불러오지 못했습니다. 네트워크 상태를 확인하고 새로고침해주세요.</p>';
    }
    return;
  }

  const rawCategory = new URLSearchParams(location.search).get("cat") || "";
  const initialCategory = resolveCategoryParam(rawCategory);

  if (initialCategory.length === 1) {
    // 한 분야만 보는 화면은 칩·인기 목록 UI로 따로 그린다.
    await initFieldPage(terms, initialCategory[0]);
    const staticLinks1 = document.querySelector(".static-category-links");
    if (staticLinks1) staticLinks1.hidden = true;
    return;
  }

  if (!initialCategory.length) {
    await initHub(terms);
    const staticLinks0 = document.querySelector(".static-category-links");
    if (staticLinks0) staticLinks0.hidden = true;
    return;
  }

  render(terms, "", initialCategory);

  // JS 렌더링이 성공하면 크롤러/무자바스크립트 대비용 정적 링크 목록은 숨긴다.
  // (이 목록 자체는 항상 정적 HTML에 남아있어야 하므로 절대 innerHTML로 지우지 않는다.)
  const staticLinks = document.querySelector(".static-category-links");
  if (staticLinks) staticLinks.hidden = true;

  const searchInput = document.getElementById("term-search");
  const categoryFilter = document.getElementById("category-filter");

  if (categoryFilter) {

    for (const code of CATEGORY_ORDER) {

      const option = document.createElement("option");
      option.value = code;
      option.textContent = CATEGORY_LABELS[code];

      categoryFilter.appendChild(option);
    }

    if (initialCategory.length === 1) {
      categoryFilter.value = initialCategory[0];
    }

    categoryFilter.addEventListener("change", update);
  }

  if (searchInput) {
    // Full re-render tears down and rebuilds the entire term tree; with tens
    // of thousands of terms that's expensive enough to make typing feel
    // laggy if it runs on every keystroke, so debounce it.
    let debounceTimer = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(update, 150);
    });

    // 최근 검색어("recentSearches") 저장은 assets/header-search.js가 담당한다.
    // 여기 있던 저장 코드는 init() 실행 시점(= 페이지 로드 직후, 입력창이
    // 아직 비어 있을 때)에 딱 한 번만 돌아 실제로는 아무것도 저장하지
    // 못했으므로 제거했다.
  }

  function update() {

    render(
      terms,
      searchInput?.value || "",
      categoryFilter ? resolveCategoryParam(categoryFilter.value) : initialCategory
    );

  }

}

document.addEventListener("click", (e) => {

  if (e.target.closest("a")) {
    return;
  }

  const summary = e.target.closest(
    ".category-summary, .namu-sub-title"
  );

  if (!summary) return;

  e.preventDefault();

  const details = summary.parentElement;

  const content = details.querySelector(
    ".namu-sub-wrapper, .namu-term-list"
  );

  if (!content) return;

  if (!details.open) {

    details.open = true;

    requestAnimationFrame(() => {
      details.classList.add("js-animated");
      content.classList.add("is-active");
    });

  } else {

    details.classList.remove("js-animated");
    content.classList.remove("is-active");

    setTimeout(() => {

      if (!content.classList.contains("is-active")) {
        details.removeAttribute("open");
      }

    }, 250);

  }

});


init();