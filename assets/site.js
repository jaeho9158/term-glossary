async function loadTerms() {
  const res = await fetch("terms-index.json");
  return res.json();
}

function termLinkHTML(term) {
  const enPart = term.title_en
    ? ` <span class="term-en">(${term.title_en})</span>`
    : "";

  return `
    <li>
      <a href="terms/${term.slug}.html">
        ${term.title_ko}${enPart}
      </a>
    </li>
  `;
}

function render(terms, query = "", category = "") {

  const container = document.getElementById("category-sections");
  if (!container) return;

  container.innerHTML = "";

  const q = query.trim().toLowerCase();

  let filtered = terms.filter((t) => {
    if (!q) return true;
    const ko = t.title_ko || "";
    const en = t.title_en || "";
    const aliases = t.aliases || [];
    return (
      ko.toLowerCase().includes(q) ||
      en.toLowerCase().includes(q) ||
      aliases.some((a) => a.toLowerCase().includes(q))
    );
  });

  if (category) {
    filtered = filtered.filter(term =>
      term.categories?.includes(category)
    );
  }

  const codesToRender = category ? [category] : CATEGORY_ORDER;

  for (const code of codesToRender) {

    const mainMatched = filtered.filter(term =>
      term.categories?.includes(code)
    );

    if (!mainMatched.length) continue;

    const mainDetails = document.createElement("details");
    mainDetails.className = "namu-main-category";

    if (q || category === code) {
      mainDetails.open = true;
    }

    const moreLink = category === code
      ? ""
      : `<a class="category-more-link" href="category.html?cat=${code}">더보기</a>`;

    mainDetails.innerHTML = `
      <summary class="category-summary">
        <span class="category-title">
          ${CATEGORY_LABELS[code] || code}
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
    const rules = SUB_CATEGORY_RULES[code] || {};

    mainMatched.forEach(term => {

      let assignedSub = "일반 용어";

      for (const subLabel in rules) {
        if (rules[subLabel].includes(term.slug)) {
          assignedSub = subLabel;
          break;
        }
      }

      if (!subMap[assignedSub]) {
        subMap[assignedSub] = [];
      }

      subMap[assignedSub].push(term);
    });
        for (const subName in subMap) {

      const subMatched = subMap[subName];

      if (!subMatched.length) continue;

      const subDetails = document.createElement("details");
      subDetails.className = "namu-sub-category";

      if (q) {
        subDetails.open = true;
      }

      subDetails.innerHTML = `
        <summary class="namu-sub-title">
          <span>${subName}</span>
        </summary>
      `;

      const termList = document.createElement("ul");
      termList.className = "namu-term-list";
      termList.innerHTML = subMatched
        .map(term => termLinkHTML(term))
        .join("");

      subDetails.appendChild(termList);
      subWrapper.appendChild(subDetails);
    }

    mainDetails.appendChild(subWrapper);
    container.appendChild(mainDetails);
  }
}

async function init() {

  const terms = await loadTerms();

  const initialCategory = new URLSearchParams(location.search).get("cat") || "";

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

    if (initialCategory) {
      categoryFilter.value = initialCategory;
    }

    categoryFilter.addEventListener("change", update);
  }

  if (searchInput) {
    searchInput.addEventListener("input", update);

    const recent = JSON.parse(
      localStorage.getItem("recentSearches") || "[]"
    );

    const value = searchInput.value.trim();

    if (!value) return;

    const list = recent.filter(v => v !== value);

    list.unshift(value);

    localStorage.setItem(
        "recentSearches",
        JSON.stringify(list.slice(0, 5))
    );
  }

  function update() {

    render(
      terms,
      searchInput?.value || "",
      categoryFilter?.value || ""
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