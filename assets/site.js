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

function render(terms, query = "", category = "") {

  const container = document.getElementById("category-sections");
  if (!container) return;

  container.innerHTML = "";

  const q = query.trim().toLowerCase();

  // Match rank: 0 = exact match, 1 = starts-with, 2 = contains. Lower is better.
  function matchRank(t) {
    if (!q) return null;
    const ko = (t.title_ko || "").toLowerCase();
    const en = (t.title_en || "").toLowerCase();
    const aliases = (t.aliases || []).map((a) => a.toLowerCase());
    const fields = [ko, en, ...aliases];

    if (fields.some((f) => f === q)) return 0;
    if (fields.some((f) => f.startsWith(q))) return 1;
    if (fields.some((f) => f.includes(q))) return 2;
    return null;
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

  render(terms, "", initialCategory);

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