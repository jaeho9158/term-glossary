const currentCategory = document.body.dataset.category;

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

    const order = SUB_CATEGORY_ORDER[currentCategory] || [];

    const subMap = {};

    filtered.forEach(term => {

        const isPrimaryCategory = term.categories && term.categories[0] === currentCategory;
        const sub = (isPrimaryCategory && term.subcategory) || "관련 용어";

        if (!subMap[sub]) {
            subMap[sub] = [];
        }

        subMap[sub].push(term);

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

        const details = document.createElement("details");
        details.className = "namu-sub-category";
        details.open = true;

        const summary = document.createElement("summary");
        summary.className = "namu-sub-title";
        summary.textContent = `${subName} (${subMap[subName].length}개)`;

        const list = document.createElement("ul");
        list.className = "namu-term-list";
        list.innerHTML = subMap[subName].map(termHTML).join("");

        details.appendChild(summary);
        details.appendChild(list);

        container.appendChild(details);
    }
}

loadTerms();
