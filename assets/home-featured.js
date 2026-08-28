// Homepage featured-category cards. The homepage used to render all 100+
// categories as open accordions (via site.js's render()), which made it
// feel cluttered. This renders only the curated HOME_FEATURED_CATEGORIES
// set as compact cards, with a link out to category.html for the rest.

function escapeHtmlHf(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function categoryCardHTML(code, count) {
  const label = CATEGORY_LABELS[code] || code;
  return `
    <a class="home-category-card" href="category.html?cat=${encodeURIComponent(code)}">
      <span class="home-category-card-title">${escapeHtmlHf(label)}</span>
      <span class="home-category-card-count">${count}개</span>
    </a>
  `;
}

async function initHomeFeaturedCategories() {
  const container = document.getElementById("home-featured-categories");
  if (!container) return;

  try {
    // 7MB 전체 인덱스 대신 홈 전용으로 뽑아 둔 분야별 개수만 받는다.
    const res = await fetch("home-data.json");
    const { counts, total } = await res.json();

    container.innerHTML = HOME_FEATURED_CATEGORIES
      .map((code) => categoryCardHTML(code, counts[code] || 0))
      .join("");

    // 소개 문구의 용어 수를 실제 데이터로 채운다. HTML에 박아 둔 숫자는
    // 용어가 늘어날 때마다 옛날 값("6,000여 개")으로 남아 있었다.
    const totalEl = document.getElementById("home-term-total");
    if (totalEl && total) totalEl.textContent = total.toLocaleString("ko-KR");
  } catch (err) {
    console.error("[home-featured]", err);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initHomeFeaturedCategories);
}
