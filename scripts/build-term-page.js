// 용어 페이지 생성기 — 콘텐츠 JSON → terms/<slug>.html
//
// 기존 페이지를 "도너"로 삼아 head/header/footer/스크립트 크롬을 그대로 재사용하고
// <main> 안쪽만 새로 렌더한다. 크롬을 문자열로 다시 쓰지 않으므로, 사이트 공통
// 마크업이 바뀌어도 이 스크립트가 옛 마크업을 되살리는 드리프트가 생기지 않는다.
//
// 본문 링크는 원시 HTML을 허용하지 않고 [[slug|표시문구]] 마커만 허용한다.
// (LLM이 생성한 텍스트를 그대로 HTML에 넣지 않기 위함 — 마커 외 문자는 전부 이스케이프)
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const DONOR_PAGE = path.join(ROOT_DIR, "terms", "nmda-receptor.html");
const { escapeHtml } = require("../assets/escape.js");

let categoryData = null;
function labels() {
  if (!categoryData) categoryData = require("../assets/category-data.js");
  return categoryData;
}

// 도너 페이지에서 <main> 앞/뒤 크롬을 한 번만 잘라 캐시한다.
let chromeCache = null;
function chrome() {
  if (chromeCache) return chromeCache;
  const html = fs.readFileSync(DONOR_PAGE, "utf8");
  const start = html.indexOf('<main class="delay-1">');
  const end = html.indexOf("</main>");
  if (start === -1 || end === -1) throw new Error("도너 페이지에서 <main> 블록을 찾지 못했습니다.");
  chromeCache = {
    head: html.slice(0, start),
    tail: html.slice(end),
  };
  return chromeCache;
}

// [[slug|텍스트]] → 내부 링크. validSlugs에 없는 slug는 링크를 걸지 않고 텍스트만 남긴다
// (죽은 링크가 생기느니 평문이 낫다).
function renderProse(text, validSlugs) {
  const raw = String(text || "");
  let out = "";
  let last = 0;
  const re = /\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    out += escapeHtml(raw.slice(last, m.index));
    const [, slug, label] = m;
    out += validSlugs.has(slug)
      ? `<a href="${slug}.html">${escapeHtml(label)}</a>`
      : escapeHtml(label);
    last = m.index + m[0].length;
  }
  out += escapeHtml(raw.slice(last));
  return out;
}

function renderMain(term, ctx) {
  const { validSlugs, titleBySlug } = ctx;
  const { CATEGORY_LABELS } = labels();
  const heading = `${term.title_ko} (${term.title_en})`;
  const prose = (t) => renderProse(t, validSlugs);

  const badges = (term.categories || [])
    .map((code) => {
      const label = CATEGORY_LABELS[code] || code;
      return `    <a class="category-badge" href="../category.html?cat=${encodeURIComponent(code)}">${escapeHtml(label)}</a>`;
    })
    .join("\n");

  const examples = (term.examples || [])
    .map(
      (ex) =>
        `  <div class="example">"${escapeHtml(ex.sentence)}"</div>\n` +
        `  <p>${prose(ex.explanation)}</p>`
    )
    .join("\n");

  // 관련 용어 앵커 텍스트는 terms.json의 한글 제목을 쓴다 — 표기 불일치 방지.
  const related = (term.related || [])
    .filter((slug) => validSlugs.has(slug))
    .map((slug) => `    <a href="${slug}.html">${escapeHtml(titleBySlug.get(slug) || slug)}</a>`)
    .join("\n");

  return `<main class="delay-1">
  <p class="breadcrumb"><a href="../index.html">용어 목록</a> &gt; ${escapeHtml(heading)}</p>
  <h1>${escapeHtml(heading)}</h1>
  <div class="category-badges">
${badges}
  </div>

  <button id="bookmark-btn" class="bookmark-btn" type="button" hidden>
    <span class="bookmark-icon" aria-hidden="true">☆</span>
    <span class="bookmark-label">즐겨찾기</span>
  </button>

  <div class="definition-box">
    <strong>한 줄 정의:</strong> ${escapeHtml(term.definition)}
  </div>

  <h2>쉽게 풀면</h2>
  <p>${prose(term.easy)}</p>

  <h2>왜 중요한가</h2>
  <p>${prose(term.why)}</p>

  <h2>논문에서는 이렇게 쓰입니다</h2>
${examples}

  <h2>조금 더 깊게 보면</h2>
  <p>${prose(term.deeper)}</p>

  <h2>주의할 점</h2>
  <p>${prose(term.caution)}</p>

  <h2>관련 용어</h2>
  <div class="related-terms">
${related}
  </div>
`;
}

function renderTermPage(term, ctx) {
  const { head, tail } = chrome();
  const title = `${term.title_en}(${term.title_ko})란? 쉬운 뜻과 논문 예문 - 논문용어사전`;
  const description = term.meta_description || term.definition;

  const newHead = head
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta name="description" content="[\s\S]*?">/,
      `<meta name="description" content="${escapeHtml(description)}">`
    )
    .replace(
      /<link rel="canonical" href="[^"]*">/,
      `<link rel="canonical" href="https://termglossary.kr/terms/${term.slug}.html">`
    );

  return newHead + renderMain(term, ctx) + tail;
}

function buildContext(terms, incomingSlugs = []) {
  const validSlugs = new Set(terms.map((t) => t.slug));
  const titleBySlug = new Map(terms.map((t) => [t.slug, t.title_ko]));
  for (const s of incomingSlugs) validSlugs.add(s);
  return { validSlugs, titleBySlug };
}

module.exports = { renderTermPage, renderProse, buildContext };

if (require.main === module) {
  const [contentPath] = process.argv.slice(2);
  if (!contentPath) {
    console.error("usage: node scripts/build-term-page.js <content.json>");
    process.exit(1);
  }
  const incoming = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "terms.json"), "utf8"));
  const list = Array.isArray(incoming) ? incoming : [incoming];
  const ctx = buildContext(terms, list.map((t) => t.slug));
  for (const term of list) {
    const out = path.join(ROOT_DIR, "terms", `${term.slug}.html`);
    fs.writeFileSync(out, renderTermPage(term, ctx), "utf8");
    console.log("wrote", out);
  }
}
