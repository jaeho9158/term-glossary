const CATEGORY_LABELS = {
  stat: "통계",
  method: "연구방법론",
  tool: "측정·도구",
  ethics: "윤리·출판",
  physchem: "물리학·화학",
  bioearth: "생물학·지구과학",
  neuro: "뇌과학·신경과학",
  medhealth: "의학·보건",
  psych: "심리학",
  socialecon: "사회과학·경제학",
  eng: "공학",
  cs: "컴퓨터과학·AI",
};

const CATEGORY_ORDER = ["stat", "method", "tool", "ethics", "physchem", "bioearth", "neuro", "medhealth", "psych", "socialecon", "eng", "cs"];

async function loadTerms() {
  const res = await fetch("terms.json");
  return res.json();
}

function termLinkHTML(term) {
  const enPart = term.title_en ? ` <span class="term-en">(${term.title_en})</span>` : "";
  return `<li><a href="terms/${term.slug}.html">${term.title_ko}${enPart}</a></li>`;
}

function render(terms, query) {
  const container = document.getElementById("category-sections");
  if (!container) return;

  container.innerHTML = "";
  const q = query.trim().toLowerCase();

  const filtered = terms.filter((t) => {
    if (!q) return true;
    const ko = t.title_ko || "";
    const en = t.title_en || "";
    return ko.toLowerCase().includes(q) || en.toLowerCase().includes(q);
  });

  for (const code of CATEGORY_ORDER) {
    const mainMatched = filtered.filter((t) => {
      return t.categories && t.categories.includes(code);
    });

    if (mainMatched.length === 0) continue;

    const mainDetails = document.createElement("details");
    mainDetails.className = "namu-main-category";
    if (q) mainDetails.open = true;

    mainDetails.innerHTML = `
    <summary class="category-summary">
        <span class="category-title">
            ${CATEGORY_LABELS[code] || code}
        </span>

        <span class="category-count">
            ${mainMatched.length}개
        </span>
    </summary>
    `;

    const subWrapper = document.createElement("div");
    subWrapper.className = "namu-sub-wrapper";

    const subMap = {};
    mainMatched.forEach((t) => {
      const subName = t.sub_category || "일반 용어";
      if (!subMap[subName]) {
        subMap[subName] = [];
      }
      subMap[subName].push(t);
    });

    for (const subName in subMap) {
      const subMatched = subMap[subName];
      if (subMatched.length === 0) continue;

      const subDetails = document.createElement("details");
      subDetails.className = "namu-sub-category";
      if (q) subDetails.open = true;

      subDetails.innerHTML = `
      <summary class="sub-summary">
        ${subName}
    </summary>
    `;

      const termList = document.createElement("ul");
      termList.className = "namu-term-list";
      termList.innerHTML = subMatched.map(termLinkHTML).join("");

      subDetails.appendChild(termList);
      subWrapper.appendChild(subDetails);
    }

    mainDetails.appendChild(subWrapper);
    container.appendChild(mainDetails);
  }
}

async function init() {
  const terms = await loadTerms();
  render(terms, "");

  const searchInput = document.getElementById("term-search");
  const container = document.getElementById("category-sections");
  if (!searchInput || !container) return;

  searchInput.addEventListener("input", () => {
    container.classList.add("is-filtering");
    window.setTimeout(() => {
      render(terms, searchInput.value);
      container.classList.remove("is-filtering");
    }, 120);
  });
}

init();
