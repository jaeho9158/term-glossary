const currentCategory = document.body.dataset.category;

const SUB_CATEGORY_RULES = {
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
            "confirmation-bias"
        ],
        "발달·성격":[
            "attachment-theory",
            "self-efficacy"
        ],
        "연구오류":[
            "social-desirability-bias"
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
            "panel-data"
        ],
        "사회과학":[
            "intervention"
        ]
    }
};

async function loadTerms() {

    const res = await fetch("terms.json");
    const terms = await res.json();

    render(terms);

    document
        .getElementById("term-search")
        .addEventListener("input", e=>{
            render(terms,e.target.value);
        });
}

function termHTML(term){

    const en = term.title_en
        ? ` <span class="term-en">(${term.title_en})</span>`
        : "";

    return `<li><a href="terms/${term.slug}.html">${term.title_ko}${en}</a></li>`;
}

function render(terms, keyword = "") {

    const container = document.getElementById("category-sections");

    container.innerHTML = "";

    document.getElementById("category-title").textContent =
        CATEGORY_LABELS[currentCategory] || "카테고리";

    const filtered = terms.filter(t => {

        if (!t.categories)
            return false;

        if (!t.categories.includes(currentCategory))
            return false;

        if (!keyword)
            return true;

        const q = keyword.toLowerCase();

        return (
            (t.title_ko || "").toLowerCase().includes(q) ||
            (t.title_en || "").toLowerCase().includes(q)
        );

    });

    const rules = SUB_CATEGORY_RULES[currentCategory] || {};

    const subMap = {};

    filtered.forEach(term => {

        let sub = "일반 용어";

        for (const name in rules) {

            if (rules[name].includes(term.slug)) {
                sub = name;
                break;
            }

        }

        if (!subMap[sub]) {
            subMap[sub] = [];
        }

        subMap[sub].push(term);

    });

    for (const subName in subMap) {

        const details = document.createElement("details");
        details.className = "namu-sub-category";
        details.open = true;

        const summary = document.createElement("summary");
        summary.className = "namu-sub-title";
        summary.textContent = subName;

        const list = document.createElement("ul");
        list.className = "namu-term-list";
        list.innerHTML = subMap[subName].map(termHTML).join("");

        details.appendChild(summary);
        details.appendChild(list);

        container.appendChild(details);
    }
}

loadTerms();