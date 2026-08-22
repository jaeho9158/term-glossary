// Homepage "오늘의 단어" (word of the day) cards. Picks 5 terms
// deterministically from today's date, so every visitor sees the same 5
// terms on a given day with no backend involved.

function escapeHtmlWod(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Small deterministic PRNG (mulberry32) seeded from a string, so "today"
// always yields the same shuffle without needing a server or localStorage.
function seededPick(list, count, seedStr) {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  }

  function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const pool = list.slice();
  const picks = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(next() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
}

function todaySeed() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function wordOfDayCardHTML(term) {
  const enPart = term.title_en
    ? ` <span class="term-en">(${escapeHtmlWod(term.title_en)})</span>`
    : "";
  return `
    <a class="wod-card" href="terms/${encodeURIComponent(term.slug)}.html">
      <span class="wod-card-term">${escapeHtmlWod(term.title_ko)}${enPart}</span>
    </a>
  `;
}

async function initWordOfDay() {
  const section = document.getElementById("word-of-day-section");
  if (!section) return;

  try {
    // 후보 풀은 home-data.json에 고정 크기로 잘라 두었다. 날짜 시드 추첨은
    // 풀이 같으면 결과도 같으므로, 전체 인덱스를 받을 필요가 없다.
    const res = await fetch("home-data.json");
    const { daily: terms } = await res.json();
    if (!Array.isArray(terms) || terms.length === 0) return;

    const picks = seededPick(terms, 5, todaySeed());

    section.innerHTML = `
      <h2 class="wod-heading">오늘의 단어</h2>
      <div class="wod-cards">
        ${picks.map(wordOfDayCardHTML).join("")}
      </div>
    `;
  } catch (err) {
    // Fails silently — the homepage still works fine without this section.
    console.error("[word-of-day]", err);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { seededPick, todaySeed };
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initWordOfDay);
}
