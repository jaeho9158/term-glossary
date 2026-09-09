// category.html 안의 <!--STATIC_CATEGORY_GROUPS--> 자리에, JS 없이도 크롤러가
// 볼 수 있는 정적 카테고리 링크 목록을 채워 넣는다.
//
// scripts/generate-category-pages.js가 만드는 category/{code}.html로 가는 링크를
// CATEGORY_GROUPS 순서(대분류별)로 나열한다. 반드시 generate-category-pages.js를
// 먼저(또는 함께) 실행해서 category/*.html이 최신 상태여야 링크가 깨지지 않는다.
const fs = require("fs");
const path = require("path");
const {
  CATEGORY_GROUPS,
  CATEGORY_LABELS,
} = require("../assets/category-data.js");

const ROOT_DIR = path.join(__dirname, "..");
const CATEGORY_HTML_PATH = path.join(ROOT_DIR, "category.html");
const CATEGORY_DIR = path.join(ROOT_DIR, "category");

const MARKER_BLOCK = /<!--STATIC_CATEGORY_GROUPS:START-->[\s\S]*?<!--STATIC_CATEGORY_GROUPS:END-->/;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderGroups() {
  const blocks = CATEGORY_GROUPS.map((group) => {
    const items = group.codes
      // 용어가 0개라 generate-category-pages.js가 페이지를 만들지 않은 코드는
      // 링크를 걸지 않는다(안 그러면 404 링크가 생긴다).
      .filter((code) => fs.existsSync(path.join(CATEGORY_DIR, `${code}.html`)))
      .map((code) => {
        const label = CATEGORY_LABELS[code];
        return `        <li><a href="category/${code}.html">${escapeHtml(label)}</a></li>`;
      })
      .join("\n");

    if (!items) return "";

    return `      <div class="static-category-group">
        <h3>${escapeHtml(group.label)}</h3>
        <ul>
${items}
        </ul>
      </div>`;
  }).filter(Boolean);

  return blocks.join("\n");
}

function run() {
  const html = fs.readFileSync(CATEGORY_HTML_PATH, "utf8");

  if (!MARKER_BLOCK.test(html)) {
    throw new Error("category.html에서 STATIC_CATEGORY_GROUPS 마커 블록을 찾을 수 없습니다.");
  }

  const rendered = renderGroups();
  const replacement = `<!--STATIC_CATEGORY_GROUPS:START-->\n${rendered}\n    <!--STATIC_CATEGORY_GROUPS:END-->`;
  const next = html.replace(MARKER_BLOCK, replacement);

  fs.writeFileSync(CATEGORY_HTML_PATH, next, "utf8");

  const linkCount = (rendered.match(/<a href="category\//g) || []).length;
  console.log(`category.html 정적 링크 삽입 완료: ${linkCount}개 카테고리 링크`);
}

run();
