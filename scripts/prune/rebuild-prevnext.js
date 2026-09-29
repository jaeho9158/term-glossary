// 용어 페이지의 이전/다음 네비게이션(<nav class="term-pager">) 재계산.
// 규칙(cbec42cb2에서 실측 확인, 현재 41,230개 전부 일치): 첫 번째 분야(categories[0])별로 slug를
// 기본 문자열 순(JS sort)으로 세워 바로 앞/뒤 용어. 양 끝은 해당 링크를 생략한다.
// 라벨은 이웃의 title_ko(HTML 이스케이프: & < > ")다.
// 사용: node scripts/prune/rebuild-prevnext.js [--root <dir>] [--dry]   (--root 기본: 저장소 루트)
// apply.js가 영향받은 분야만 골라 rebuildPrevNext()를 부른다.
const fs = require("fs");
const path = require("path");
const lib = require("./lib.js");

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NAV_RE = /<nav class="term-pager"[\s\S]*?<\/nav>/;

function buildNav(prev, next, eol) {
  const lines = ['<nav class="term-pager" aria-label="용어 이전/다음">'];
  if (prev) lines.push(`  <a href="${prev.slug}.html" class="term-pager-prev">← 이전: ${esc(prev.title_ko)}</a>`);
  if (next) lines.push(`  <a href="${next.slug}.html" class="term-pager-next">다음: ${esc(next.title_ko)} →</a>`);
  lines.push("</nav>");
  return lines.join(eol);
}

// terms: 최종 terms.json 배열. categories: 다시 계산할 첫 분야 코드 집합(null이면 전부).
function rebuildPrevNext({ root, terms, categories = null, dry = false }) {
  const groups = new Map();
  for (const t of terms) {
    const c = (t.categories || [])[0] || "none";
    if (categories && !categories.has(c)) continue;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(t);
  }
  let checked = 0, changed = 0, noNav = 0, missingFile = 0;
  const changedSlugs = [];
  for (const list of groups.values()) {
    list.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    list.forEach((t, i) => {
      checked++;
      const file = path.join(root, "terms", `${t.slug}.html`);
      if (!fs.existsSync(file)) { missingFile++; return; }
      const html = fs.readFileSync(file, "utf8");
      const m = html.match(NAV_RE);
      if (!m) { noNav++; return; }
      const eol = m[0].includes("\r\n") ? "\r\n" : "\n";
      const nav = buildNav(i > 0 ? list[i - 1] : null, i < list.length - 1 ? list[i + 1] : null, eol);
      if (nav === m[0]) return;
      changed++;
      changedSlugs.push(t.slug);
      if (!dry) fs.writeFileSync(file, html.replace(NAV_RE, () => nav));
    });
  }
  return { checked, changed, noNav, missingFile, changedSlugs };
}

function main() {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const root = arg("--root") ? path.resolve(arg("--root")) : lib.ROOT;
  const dry = process.argv.includes("--dry");
  const terms = JSON.parse(fs.readFileSync(path.join(root, "terms.json"), "utf8"));
  const r = rebuildPrevNext({ root, terms, dry });
  console.log(`이전/다음: 확인 ${r.checked}, 변경 ${r.changed}${dry ? "(dry, 쓰지 않음)" : ""}, 네비 없음 ${r.noNav}, 파일 없음 ${r.missingFile}`);
}

if (require.main === module) main();

module.exports = { rebuildPrevNext, buildNav, NAV_RE };
