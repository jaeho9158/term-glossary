// term-extras 작업 큐: 코어 등급 용어 중 data/term-extras/<slug>.json 이 아직 없는 것.
// 제외: 보관(archive) 등급, 리다이렉트 스텁 페이지, 페이지 파일 없음.
// 정렬: GA 조회수(data/prune/ga4.json 의 "/terms/<slug>.html", 없으면 0) 내림차순 → 제목(ko).
//
// 사용: node scripts/term-extras-queue.js [--field <코드>] [--limit N] [--batch N] [--json out.json]
//   기본 출력: 표(탭 구분) 한 줄에 slug, title_ko, title_en, field, views
//   --batch N : slug 를 N 개씩 쉼표로 이은 줄만 출력
//   --json    : 행 배열을 파일에 저장(출력은 요약만)
//   --summary : 분야별 큐 크기 출력
const fs = require("fs");
const path = require("path");
const { isStub } = require("./lib/index-tier.js");

const ROOT = path.join(__dirname, "..");

function readJson(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { if (fb !== undefined) return fb; throw e; }
}

function buildQueue(opts = {}) {
  const root = opts.root || ROOT;
  const terms = readJson(path.join(root, "terms.json"));
  const archive = new Set((readJson(path.join(root, "data", "index-tiers.json"), {}).archive) || []);
  const ga = readJson(path.join(root, "data", "prune", "ga4.json"), {});
  const extrasDir = path.join(root, "data", "term-extras");
  const done = new Set(fs.existsSync(extrasDir) ? fs.readdirSync(extrasDir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : []);
  const rows = [];
  for (const t of terms) {
    if (archive.has(t.slug) || done.has(t.slug)) continue;
    const file = path.join(root, "terms", `${t.slug}.html`);
    if (!fs.existsSync(file) || isStub(fs.readFileSync(file, "utf8"))) continue;
    const views = Number(ga[`/terms/${t.slug}.html`]) || 0;
    rows.push({ slug: t.slug, title_ko: t.title_ko || "", title_en: t.title_en || "", field: (t.categories || [])[0] || "", views });
  }
  rows.sort((a, b) => b.views - a.views || a.title_ko.localeCompare(b.title_ko, "ko") || (a.slug < b.slug ? -1 : 1));
  let out = rows;
  if (opts.field) out = out.filter((r) => r.field === opts.field);
  if (opts.limit) out = out.slice(0, opts.limit);
  return out;
}

function fieldCounts(rows) {
  const c = {};
  for (const r of rows) c[r.field] = (c[r.field] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

function main() {
  const argv = process.argv.slice(2);
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const rows = buildQueue({ field: val("--field"), limit: val("--limit") ? Number(val("--limit")) : 0 });
  if (argv.includes("--summary")) {
    for (const [f, n] of fieldCounts(buildQueue())) console.log(`${f}\t${n}`);
    return;
  }
  if (val("--json")) {
    fs.writeFileSync(val("--json"), JSON.stringify(rows, null, 2) + "\n");
    console.log(`${rows.length}행 저장: ${val("--json")}`);
    return;
  }
  const b = Number(val("--batch")) || 0;
  if (b > 0) {
    for (let i = 0; i < rows.length; i += b) console.log(rows.slice(i, i + b).map((r) => r.slug).join(","));
    return;
  }
  for (const r of rows) console.log([r.slug, r.title_ko, r.title_en, r.field, r.views].join("\t"));
}

module.exports = { buildQueue, fieldCounts };
if (require.main === module) main();
