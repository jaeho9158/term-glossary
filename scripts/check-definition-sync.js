// 읽기 전용 점검: core 용어 페이지의 정의 상자(.definition-box) 문장이 terms.json 의 definition 과 같은지 대조한다.
//   node scripts/check-definition-sync.js [--all] [--limit N]
// - 기본은 core 만(보관(archive) 등급과 리다이렉트 스텁 제외). --all 이면 보관 등급도 포함.
// - 아무것도 고치지 않는다. 불일치가 있어도 종료 코드는 0 이다(정보 출력용).
// 왜: extras 의 fixes 나 손 교정으로 페이지 정의가 바뀌면 terms.json(메타·검색·뷰어 색인의 출처)과 어긋난다.
const fs = require("fs");
const path = require("path");
const { isStub } = require("./lib/term-meta.js");

const ROOT = path.join(__dirname, "..");
const DEF_BOX = /<div class="definition-box">\s*<strong>한 줄 정의:<\/strong>([\s\S]*?)<\/div>/;

function unescapeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
const norm = (s) => unescapeEntities(String(s == null ? "" : s).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

function archiveSet() {
  try {
    return new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "data", "index-tiers.json"), "utf8")).archive || []);
  } catch (e) {
    return new Set();
  }
}

function check({ all = false } = {}) {
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const archive = all ? new Set() : archiveSet();
  const mismatches = [];
  let checked = 0, noBox = 0, stubs = 0, missing = 0, archived = 0;
  for (const t of terms) {
    const file = path.join(ROOT, "terms", `${t.slug}.html`);
    if (!fs.existsSync(file)) { missing++; continue; }
    if (archive.has(t.slug)) { archived++; continue; }
    const html = fs.readFileSync(file, "utf8");
    if (isStub(html)) { stubs++; continue; }
    const m = DEF_BOX.exec(html);
    if (!m) { noBox++; continue; }
    checked++;
    const page = norm(m[1]);
    const json = norm(t.definition);
    if (page !== json) mismatches.push({ slug: t.slug, page, json });
  }
  return { checked, noBox, stubs, missing, archived, mismatches };
}

function main(argv) {
  const all = argv.includes("--all");
  const li = argv.indexOf("--limit");
  const limit = li >= 0 ? Number(argv[li + 1]) : 50;
  const r = check({ all });
  console.log(`대조 ${r.checked}쪽 / 불일치 ${r.mismatches.length} / 정의 상자 없음 ${r.noBox} / 스텁 ${r.stubs} / 보관 제외 ${r.archived} / 페이지 없음 ${r.missing}`);
  for (const x of r.mismatches.slice(0, limit)) {
    console.log(`- ${x.slug}\n    페이지: ${x.page}\n    terms.json: ${x.json}`);
  }
  if (r.mismatches.length > limit) console.log(`... 외 ${r.mismatches.length - limit}건 (--limit N 으로 늘리기)`);
  return r;
}

module.exports = { check, norm };
if (require.main === module) main(process.argv.slice(2));
