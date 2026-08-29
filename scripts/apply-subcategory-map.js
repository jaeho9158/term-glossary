// 하위분류 백필 적용기 — subcat/out-*.tsv (슬러그<TAB>하위분류) 를 terms.json 에 반영.
//
// usage: node scripts/apply-subcategory-map.js <subcat-dir> [--dry]
//
// 에이전트 산출물을 그대로 믿지 않고 전부 검사한다:
//  - 슬러그가 실제로 존재하고, 지금 subcategory 가 비어 있는 항목인가
//  - 배정된 값이 그 용어의 1순위 카테고리의 SUB_CATEGORY_ORDER 안에 글자 그대로 있는가
//  - 중복 배정 / 미배정 잔여 건수
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { SUB_CATEGORY_ORDER, CATEGORY_LABELS } = require("../assets/category-data.js");

const dir = process.argv[2];
const dry = process.argv.includes("--dry");
if (!dir) {
  console.error("usage: node scripts/apply-subcategory-map.js <subcat-dir> [--dry]");
  process.exit(1);
}

const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
const bySlug = new Map(terms.map((t) => [t.slug, t]));

const files = fs.readdirSync(dir).filter((f) => /^out-.*\.tsv$/.test(f)).sort();
let applied = 0;
const problems = { unknownSlug: 0, alreadySet: 0, badSub: 0, badSamples: [], dupe: 0, emptyLine: 0 };
const seen = new Set();
const perCat = {};

for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const [slug, sub] = line.split("\t");
    if (!slug || !sub) { problems.emptyLine++; continue; }
    const t = bySlug.get(slug.trim());
    if (!t) { problems.unknownSlug++; continue; }
    if (t.subcategory) { problems.alreadySet++; continue; }
    if (seen.has(slug)) { problems.dupe++; continue; }
    const cat = (t.categories || [])[0];
    const allowed = SUB_CATEGORY_ORDER[cat] || [];
    const value = sub.trim();
    if (!allowed.includes(value)) {
      // 표시는 몇 건만 하되 집계는 전수로 — 예전엔 표시 상한이 곧 건수로 찍혀
      // 6천 건대 불일치가 16건으로 보였다.
      problems.badSub++;
      if (problems.badSamples.length < 10) problems.badSamples.push(`${slug}: "${value}" (${cat})`);
      continue;
    }
    seen.add(slug);
    if (!dry) t.subcategory = value;
    perCat[cat] = (perCat[cat] || 0) + 1;
    applied++;
  }
}

const remaining = terms.filter((t) => !t.subcategory).length;
console.log(`파일 ${files.length}개 → 적용 ${applied}건`);
console.log(`  미존재 슬러그 ${problems.unknownSlug} / 이미 설정됨 ${problems.alreadySet} / 중복 ${problems.dupe} / 빈줄·형식오류 ${problems.emptyLine}`);
console.log(`  목록에 없는 하위분류 ${problems.badSub}건`);
for (const b of problems.badSamples) console.log("    " + b);
console.log(`  분야별: ${Object.entries(perCat).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`${CATEGORY_LABELS[c]||c} ${n}`).join(", ")}`);
console.log(`남는 미분류: ${dry ? remaining + " (dry, 적용 전 기준)" : remaining}`);

if (!dry && applied) {
  fs.writeFileSync(path.join(ROOT, "terms.json"), JSON.stringify(terms, null, 2) + "\n", "utf8");
  console.log("terms.json 저장 완료");
}
