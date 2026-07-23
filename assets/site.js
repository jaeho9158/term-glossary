let fuse;

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

const CATEGORY_ORDER = [
  "stat",
  "method",
  "tool",
  "ethics",
  "physchem",
  "bioearth",
  "neuro",
  "medhealth",
  "psych",
  "socialecon",
  "eng",
  "cs"
];

async function loadTerms() {
  const res = await fetch("terms.json");
  const terms = await res.json();

  fuse = new Fuse(terms, {
    includeScore: true,
    threshold: 0.45,
    ignoreLocation: true,
    minMatchCharLength: 2,
    keys: [
      { name: "title_ko", weight: 0.75 },
      { name: "title_en", weight: 0.2 },
      { name: "definition", weight: 0.05 }
    ]
  });
  return terms;
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

  const q = query
    .trim()
    .toLowerCase()
    .replace(/[()\[\],.:;'"!?]/g, "");
  let filtered;

  if (!q) {
    filtered = terms;
  } else {
    filtered = fuse.search(q).filter(r => r.score <= 0.45).map(r => r.item);
  }

  if (category) {
    filtered = filtered.filter(term =>
      term.categories?.includes(category)
    );
  }

  for (const code of CATEGORY_ORDER) {

    const mainMatched = filtered.filter(term =>
      term.categories?.includes(code)
    );

    if (!mainMatched.length) continue;

    const mainDetails = document.createElement("details");
    mainDetails.className = "namu-main-category";

    if (q) {
      mainDetails.open = true;
    }

    mainDetails.innerHTML = `
      <summary class="category-summary">
        <span class="category-title">
          ${CATEGORY_LABELS[code] || code}
          <span class="category-count">
            ${mainMatched.length}개
          </span>
        </span>
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

  render(terms);

  const searchInput = document.getElementById("term-search");
  const categoryFilter = document.getElementById("category-filter");

  if (categoryFilter) {

    for (const code of CATEGORY_ORDER) {

      const option = document.createElement("option");
      option.value = code;
      option.textContent = CATEGORY_LABELS[code];

      categoryFilter.appendChild(option);
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

const SUB_CATEGORY_RULES = {
    "stat":{
        "기초통계":[
            "variance",
            "standard-deviation",
            "standard-error",
            "normal-distribution",
            "outlier",
            "confidence-interval",
            "effect-size",
            "odds-ratio",
        ],
        "가설검정":[
            "p-value",
            "null-hypothesis",
            "significance-level",
            "type-1-error",
            "type-2-error",
            "statistical-power"
        ],
        "분석기법":[
            "regression",
            "anova",
            "t-test",
            "chi-square-test",
            "factor-analysis",
            "difference-in-differences"
        ]
    },
    "method":{
        "연구설계":[
            "longitudinal-study",
            "cross-sectional-study",
            "case-study",
            "case-control-study"
        ],
        "방법론 유형":[
            "qualitative-research",
            "mixed-methods",
            "grounded-theory"
        ],
        "문헌·분석":[
            "meta-analysis",
            "literature-review",
            "systematic-review",
            "content-analysis",
            "intention-to-treat"
        ]
    },
    "tool":{
        "측정척도":[
            "likert-scale",
            "construct"
        ],
        "신뢰도·타당도":[
            "validity",
            "reliability"
        ]
    },
    "ethics":{
        "연구윤리":[
            "blinding",
            "double-blind",
            "placebo"
        ],
        "논문출판":[
            "peer-review",
            "publication-bias",
            "reproducibility"
        ]
    },
    "physchem":{
        "물리학":[
            "quantum-entanglement",
            "entropy",
            "spectroscopy"
        ],
        "화학":[
            "catalyst",
            "isotope",
            "polymer",
            "phase-transition",
            "chirality"
        ]
    },
    "bioearth":{
        "생물학":[
            "gene-expression",
            "crispr",
            "phylogenetics",
            "biodiversity",
            "symbiosis"
        ],
        "지구과학":[
            "plate-tectonics",
            "carbon-cycle",
            "ecosystem-service"
        ]
    },
    "neuro":{
        "뇌 구조":[
            "synapse",
            "amygdala",
            "neurotransmitter"
        ],
        "뇌 기능":[
            "neuroplasticity",
            "cognitive-load",
            "neurodegeneration"
        ],
        "측정 기법":[
            "fmri",
            "eeg"
        ]
    },
    "medhealth":{
        "임상연구":[
            "clinical-trial",
            "cohort-study",
            "rct"
        ],
        "역학":[
            "epidemiology",
            "incidence-rate",
            "prevalence",
            "comorbidity"
        ],
        "의학기초":[
            "biomarker"
        ]
    },

    "psych":{
        "인지심리":[
            "meta-cognition",
            "cognitive-bias",
            "confirmation-bias",
            "cognitive-load"
        ],
        "발달·성격":[
            "attachment-theory",
            "self-efficacy"
        ],
        "사회심리":[
            "social-desirability-bias"
        ],
        "임상·신경심리":[
            "neuroplasticity",
            "neurotransmitter",
            "neurodegeneration"
        ]
    },
    "socialecon":{
        "경제학":[
            "gini-coefficient",
            "externality",
            "social-capital"
        ],
        "계량경제학":[
            "endogeneity",
            "instrumental-variable",
            "panel-data",
            "difference-in-differences"
        ],
        "사회과학":[
            "intervention",
            "content-analysis"
        ]
    },
    "eng":{
        "해석·설계":[
            "finite-element-analysis",
            "simulation"
        ],
        "제어공학":[
            "feedback-control"
        ],
        "신호처리":[
            "signal-to-noise-ratio"
        ],
        "재료공학":[
            "fatigue-failure",
            "polymer"
        ],
        "에너지":[
            "renewable-energy",
            "life-cycle-assessment"
        ],
        "시스템공학":[
            "redundancy"
        ]
    },
    "cs":{
        "머신러닝 기법":[
            "machine-learning",
            "overfitting",
            "cross-validation",
            "gradient-descent",
            "reinforcement-learning"
        ],
        "딥러닝 알고리즘":[
            "neural-network",
            "transformer",
            "attention-mechanism",
            "convolutional-neural-network"
        ],
        "자연어처리":[
            "natural-language-processing",
            "embedding"
        ],
        "데이터 처리":[
            "data-augmentation"
        ],
        "AI 윤리":[
            "algorithm-bias"
        ]
    }
};

init();