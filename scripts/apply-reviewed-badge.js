// 용어 페이지에 검수 표시를 끼우거나 뺀다(멱등). 두 단계가 있다.
//   data/reviewed.json       ({슬러그: "YYYY-MM-DD"}) : 운영자가 직접 읽고 확인한 페이지 → "운영자 검수"
//   data/source-checked.json ({슬러그: "YYYY-MM-DD"}) : 사실 문장을 출처와 대조한 페이지 → "출처 대조"
// 두 목록에 다 있으면 운영자 검수를 단다. 설명은 about.html#editorial.
// 위치: 카테고리 배지 묶음(.category-badges) 바로 뒤. 마커 <!-- reviewed:start/end --> 로 감싼다.
// 사용: node scripts/apply-reviewed-badge.js [--dry]
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TERMS_DIR = path.join(ROOT, "terms");
const BLOCK_RE = /[ ]*<!-- reviewed:start -->[\s\S]*?<!-- reviewed:end -->\r?\n/g;
const BADGES_RE = /(<div class="category-badges">[\s\S]*?<\/div>\r?\n)/;
const H1_RE = /(<h1>[\s\S]*?<\/h1>\r?\n)/;

const LEVELS = {
  operator: { cls: "reviewed-badge", title: "운영자가 직접 읽고 확인한 페이지예요", label: "운영자 검수" },
  source: { cls: "reviewed-badge reviewed-badge--source", title: "사실 문장을 출처와 하나씩 대조한 페이지예요", label: "출처 대조" },
};

const blockFor = (date, level, nl) => {
  const L = LEVELS[level];
  return [
    "  <!-- reviewed:start -->",
    `  <p class="${L.cls}" title="${L.title} (${date})"><a href="../about.html#editorial"><span aria-hidden="true">✓</span> ${L.label}</a> <time datetime="${date}">${date}</time></p>`,
    "  <!-- reviewed:end -->",
    "",
  ].join(nl);
};

// level 을 생략하면 운영자 검수로 본다(예전 호출과 호환).
function applyToHtml(html, date, level = "operator") {
  const bare = html.replace(BLOCK_RE, "");
  if (!date) return bare;
  if (!LEVELS[level]) throw new Error(`알 수 없는 검수 단계: ${level}`);
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  const re = BADGES_RE.test(bare) ? BADGES_RE : H1_RE;
  if (!re.test(bare)) throw new Error("h1 없음");
  return bare.replace(re, (m) => m + blockFor(date, level, nl));
}

function readMap(name) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", name), "utf8")); } catch (e) { if (e.code === "ENOENT") return {}; throw e; }
}

// 슬러그 → [날짜, 단계] (없으면 null)
function levelOf(slug, reviewed, checked) {
  if (reviewed[slug]) return [reviewed[slug], "operator"];
  if (checked[slug]) return [checked[slug], "source"];
  return null;
}

function main() {
  const dry = process.argv.includes("--dry");
  const reviewed = readMap("reviewed.json");
  const checked = readMap("source-checked.json");
  let changed = 0;
  for (const f of fs.readdirSync(TERMS_DIR).filter((x) => x.endsWith(".html"))) {
    const p = path.join(TERMS_DIR, f);
    const html = fs.readFileSync(p, "utf8");
    const lv = levelOf(f.slice(0, -5), reviewed, checked);
    if (!lv && !html.includes("<!-- reviewed:start -->")) continue;
    const next = lv ? applyToHtml(html, lv[0], lv[1]) : applyToHtml(html, null);
    if (next === html) continue;
    changed++;
    if (!dry) fs.writeFileSync(p, next, "utf8");
  }
  console.log(`검수 표시: ${changed}개 ${dry ? "변경 예정" : "갱신"}`);
}

if (require.main === module) main();
module.exports = { applyToHtml, BLOCK_RE, levelOf, readMap };
