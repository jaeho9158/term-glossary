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
        <span class="category-title">${CATEGORY_LABELS[code] || code}</span>
        <span class="category-count">${mainMatched.length}개</span>
    </summary>
    `;

    const subWrapper = document.createElement("div");
    subWrapper.className = "namu-sub-wrapper";

    const subMap = {};
    const rules = SUB_CATEGORY_RULES[code] || {};

    mainMatched.forEach((t) => {
      let assignedSub = "일반 용어";

      for (const subLabel in rules) {
         if (rules[subLabel].includes(t.slug)) {
           assignedSub = subLabel;
           break;
         }
      }

      if (!subMap[assignedSub]) {
        subMap[assignedSub] = [];
      }
      subMap[assignedSub].push(t);
    });
    for (const subName in subMap) {
      const subMatched = subMap[subName];
      if (subMatched.length === 0) continue;

      const subDetails = document.createElement("details");
      subDetails.className = "namu-sub-category";
      if (q) subDetails.open = true;

      subDetails.innerHTML = `<summary class="namu-sub-title">${subName}</summary>`;

      const termList = document.createElement("ul");
      termList.className = "namu-term-list";
      termList.innerHTML = subMatched.map((term) => termLinkHTML(term)).join("");

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

document.addEventListener("click", (e) => {
    if (e.target.closest('a')) {
        return;
    }
    const summary = e.target.closest('.category-summary, .namu-sub-title');
    if (!summary) return;
    e.preventDefault();

    const details = summary.parentElement;
    const content = details.querySelector('.namu-sub-wrapper, .namu-term-list');

    if (!content) return;

    if (!details.open) {
        details.open = true;
        requestAnimationFrame(() => {
            details.classList.add('js-animated');
            content.classList.add('is-active');
        });
    } else {
        details.classList.remove('js-animated');
        content.classList.remove('is-active');

        setTimeout(() => {
            if (!content.classList.contains('is-active')) {
                details.removeAttribute('open');
            }
        }, 250);
    }
});

const SUB_CATEGORY_RULES = {
  "stat": {
    "기초통계": ["variance", "standard-deviation", "standard-error", "normal-distribution", "outlier"],
    "가설검정": ["p-value", "null-hypothesis", "type-1-error", "type-2-error", "significance-level", "statistical-power"],
    "분석기법": ["regression", "anova", "t-test", "chi-square-test", "factor-analysis", "difference-in-differences"],
    "기타수치": ["confidence-interval", "effect-size", "odds-ratio"]
  },
  "method": {
    "연구설계": ["cohort-study", "rct", "longitudinal-study", "cross-sectional-study", "case-study", "case-control-study"],
    "방법론유형": ["qualitative-research", "mixed-methods", "grounded-theory"],
    "검증 및 분석": ["meta-analysis", "literature-review", "systematic-review", "content-analysis", "intention-to-treat"]
  },
  "cs": {
    "머신러닝 기법": ["machine-learning", "overfitting", "cross-validation", "gradient-descent", "reinforcement-learning"],
    "딥러닝 알고리즘": ["neural-network", "transformer", "attention-mechanism", "convolutional-neural-network"],
    "데이터 처리": ["natural-language-processing", "data-augmentation", "embedding"]
  }
  // 등등 넣어주세요!
};

init();
