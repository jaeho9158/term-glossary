(function () {
  const input = document.getElementById("global-term-search");
  const resultsEl = document.getElementById("global-term-search-results");
  if (!input || !resultsEl) return;

  const base = document.body.getAttribute("data-base") || "";
  let terms = null;
  let activeIndex = -1;

  async function loadTerms() {
    if (terms) return terms;
    const res = await fetch(base + "terms.json");
    terms = await res.json();
    return terms;
  }

  function matchResults(list, query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return list
      .filter((t) => {
        const ko = (t.title_ko || "").toLowerCase();
        const en = (t.title_en || "").toLowerCase();
        return ko.includes(q) || en.includes(q);
      })
      .slice(0, 8);
  }

  function renderResults(matches) {
    activeIndex = -1;
    if (matches.length === 0) {
      resultsEl.innerHTML = "";
      resultsEl.hidden = true;
      return;
    }
    resultsEl.innerHTML = matches
      .map((t) => {
        const enPart = t.title_en ? ` <span class="term-en">(${t.title_en})</span>` : "";
        return `<li><a href="${base}terms/${t.slug}.html">${t.title_ko}${enPart}</a></li>`;
      })
      .join("");
    resultsEl.hidden = false;
  }

  input.addEventListener("input", async () => {
    const list = await loadTerms();
    renderResults(matchResults(list, input.value));
  });

  input.addEventListener("keydown", (e) => {
    const items = resultsEl.querySelectorAll("li a");
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      items[activeIndex].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      items[activeIndex].focus();
    } else if (e.key === "Enter" && activeIndex === -1) {
      items[0].click();
    } else if (e.key === "Escape") {
      renderResults([]);
      input.blur();
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".header-search")) {
      resultsEl.hidden = true;
    }
  });

  input.addEventListener("focus", () => {
    if (resultsEl.children.length > 0) resultsEl.hidden = false;
  });
})();
