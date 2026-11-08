// data/reviewed.json({슬러그: "YYYY-MM-DD"})대로 용어 페이지에 "검수 완료" 표시를 끼우거나 뺀다(멱등).
// 위치: 카테고리 배지 묶음(.category-badges) 바로 뒤. 마커 <!-- reviewed:start/end --> 로 감싼다.
// 사용: node scripts/apply-reviewed-badge.js [--dry]
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TERMS_DIR = path.join(ROOT, "terms");
const BLOCK_RE = /[ ]*<!-- reviewed:start -->[\s\S]*?<!-- reviewed:end -->\r?\n/g;
const BADGES_RE = /(<div class="category-badges">[\s\S]*?<\/div>\r?\n)/;
const H1_RE = /(<h1>[\s\S]*?<\/h1>\r?\n)/;

const blockFor = (date, nl) =>
  [
    "  <!-- reviewed:start -->",
    `  <p class="reviewed-badge" title="운영자가 직접 확인한 페이지예요 (${date})"><span aria-hidden="true">✓</span> 검수 완료 <time datetime="${date}">${date}</time></p>`,
    "  <!-- reviewed:end -->",
    "",
  ].join(nl);

function applyToHtml(html, date) {
  const bare = html.replace(BLOCK_RE, "");
  if (!date) return bare;
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  const re = BADGES_RE.test(bare) ? BADGES_RE : H1_RE;
  if (!re.test(bare)) throw new Error("h1 없음");
  return bare.replace(re, (m) => m + blockFor(date, nl));
}

function main() {
  const dry = process.argv.includes("--dry");
  const reviewed = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "reviewed.json"), "utf8"));
  let changed = 0;
  for (const f of fs.readdirSync(TERMS_DIR).filter((x) => x.endsWith(".html"))) {
    const p = path.join(TERMS_DIR, f);
    const html = fs.readFileSync(p, "utf8");
    if (!reviewed[f.slice(0, -5)] && !html.includes("<!-- reviewed:start -->")) continue;
    const next = applyToHtml(html, reviewed[f.slice(0, -5)]);
    if (next === html) continue;
    changed++;
    if (!dry) fs.writeFileSync(p, next, "utf8");
  }
  console.log(`검수 표시: ${changed}개 ${dry ? "변경 예정" : "갱신"}`);
}

if (require.main === module) main();
module.exports = { applyToHtml, BLOCK_RE };
