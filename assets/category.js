const currentCategory = document.body.dataset.category;

async function loadTerms() {

    // terms.json is the full 23MB dataset (definitions, related terms, etc.);
    // this page only ever renders slug/title/category/subcategory, so the
    // much smaller terms-index.json (same fields site.js/index.html already
    // use) is enough and loads far faster.
    const res = await fetch("terms-index.json");
    const terms = await res.json();

    render(terms);

    let debounceTimer = null;
    document
        .getElementById("term-search")
        .addEventListener("input", e => {
            // Full re-render tears down and rebuilds the whole term tree;
            // debounce so typing doesn't trigger it on every keystroke.
            clearTimeout(debounceTimer);
            const value = e.target.value;
            debounceTimer = setTimeout(() => render(terms, value), 150);
        });
}

function termHTML(term){

    const en = term.title_en
        ? ` <span class="term-en">(${term.title_en})</span>`
        : "";

    return `<li><a href="terms/${term.slug}.html">${term.title_ko}${en}</a></li>`;
}

// Term counts per category run into the thousands, and rendering every
// subcategory pre-expanded with its full list was what made this page feel
// unwieldy. Only page/collapse when browsing unfiltered — an active search
// already narrows the result set down to something worth showing in full.
const TERM_LIST_PAGE_SIZE = 40;

function buildTermListFragment(terms, { paged }) {
    const fragment = document.createDocumentFragment();
    const list = document.createElement("ul");
    list.className = "namu-term-list";
    fragment.appendChild(list);

    if (!paged || terms.length <= TERM_LIST_PAGE_SIZE) {
        list.innerHTML = terms.map(termHTML).join("");
        return fragment;
    }

    list.innerHTML = terms.slice(0, TERM_LIST_PAGE_SIZE).map(termHTML).join("");

    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "term-list-more-btn";
    moreBtn.textContent = `${terms.length - TERM_LIST_PAGE_SIZE}개 더 보기`;
    moreBtn.addEventListener("click", () => {
        list.innerHTML += terms.slice(TERM_LIST_PAGE_SIZE).map(termHTML).join("");
        moreBtn.remove();
    });
    fragment.appendChild(moreBtn);

    return fragment;
}

function render(terms, keyword = "") {

    const container = document.getElementById("category-sections");

    container.innerHTML = "";

    document.getElementById("category-title").textContent =
        CATEGORY_LABELS[currentCategory] || "카테고리";

    const q = keyword.trim().toLowerCase();

    const filtered = terms.filter(t => {

        if (!t.categories)
            return false;

        if (!t.categories.includes(currentCategory))
            return false;

        if (!q)
            return true;

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

    subNames.forEach((subName, i) => {

        const details = document.createElement("details");
        details.className = "namu-sub-category";
        // Expanding every subcategory at once (previously unconditional)
        // is what made a large category page unwieldy to scroll through.
        // Open the first one (or all of them while searching) and leave
        // the rest collapsed for the user to open on demand.
        details.open = q ? true : i === 0;

        const summary = document.createElement("summary");
        summary.className = "namu-sub-title";
        summary.textContent = `${subName} (${subMap[subName].length}개)`;

        details.appendChild(summary);
        details.appendChild(buildTermListFragment(subMap[subName], { paged: !q }));

        container.appendChild(details);
    });
}

loadTerms();
