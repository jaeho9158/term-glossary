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
  container.innerHTML = "";
  const q = query.trim().toLowerCase();

  for (const code of CATEGORY_ORDER) {
    const matched = terms.filter((t) => {
      if (!t.categories.includes(code)) return false;
      if (!q) return true;
      return t.title_ko.toLowerCase().includes(q) || (t.title_en || "").toLowerCase().includes(q);
    });
    if (matched.length === 0) continue;

    const section = document.createElement("section");
    section.innerHTML = `<h2>${CATEGORY_LABELS[code]}</h2><ul class="term-list">${matched.map(termLinkHTML).join("")}</ul>`;
    container.appendChild(section);
  }
}

async function init() {
  const terms = await loadTerms();
  render(terms, "");

  const searchInput = document.getElementById("term-search");
  searchInput.addEventListener("input", () => {
    render(terms, searchInput.value);
  });
}

init();
