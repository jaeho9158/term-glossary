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

  initSidebarSearch(base, loadTerms, matchResults);
})();

function initSidebarSearch(base, loadTerms, matchResults) {
  const headerInner = document.querySelector(".site-header .inner");
  if (!headerInner || document.getElementById("search-sidebar")) return;

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "open-sidebar-btn";
  toggleBtn.className = "sidebar-search-toggle";
  toggleBtn.type = "button";
  toggleBtn.setAttribute("aria-label", "용어 검색 사이드바 열기");
  toggleBtn.textContent = "≡";
  headerInner.appendChild(toggleBtn);

  const sidebar = document.createElement("div");
  sidebar.id = "search-sidebar";
  sidebar.className = "search-sidebar";
  sidebar.innerHTML = `
    <div class="search-sidebar-header">
      <h2>용어 검색</h2>
      <button id="close-sidebar-btn" class="search-sidebar-close" type="button" aria-label="닫기">&times;</button>
    </div>
    <input type="search" id="sidebar-term-search" class="search-sidebar-input" placeholder="검색어를 입력하세요..." autocomplete="off">
    <ul id="sidebar-term-search-results" class="search-sidebar-results"></ul>
  `;
  document.body.appendChild(sidebar);

  const overlay = document.createElement("div");
  overlay.id = "sidebar-overlay";
  overlay.className = "search-sidebar-overlay";
  document.body.appendChild(overlay);

  const closeBtn = sidebar.querySelector("#close-sidebar-btn");
  const sidebarInput = sidebar.querySelector("#sidebar-term-search");
  const sidebarResults = sidebar.querySelector("#sidebar-term-search-results");

  function openSidebar() {
    sidebar.classList.add("open");
    overlay.classList.add("open");
    sidebarInput.focus();
  }
  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
  }

  toggleBtn.addEventListener("click", openSidebar);
  closeBtn.addEventListener("click", closeSidebar);
  overlay.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSidebar();
  });

  sidebarInput.addEventListener("input", async () => {
    const list = await loadTerms();
    const matches = matchResults(list, sidebarInput.value);
    if (matches.length === 0) {
      sidebarResults.innerHTML = sidebarInput.value.trim()
        ? `<li class="search-sidebar-empty">일치하는 용어가 없습니다.</li>`
        : "";
      return;
    }
    sidebarResults.innerHTML = matches
      .map((t) => {
        const enPart = t.title_en ? ` <span class="term-en">(${t.title_en})</span>` : "";
        return `<li><a href="${base}terms/${t.slug}.html">${t.title_ko}${enPart}</a></li>`;
      })
      .join("");
  });
}
