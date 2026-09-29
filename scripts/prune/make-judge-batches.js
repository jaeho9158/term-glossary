// Phase 3 준비: LLM 학술성 판정 대상 선별 + 배치 파일 생성.
// 대상: GA=0 이고 역링크 ≤2 이고 dfNeutral=0 이고 MERGE 그룹의 흡수 대상이 아닌 용어.
// 출력: data/prune/judge/in/<분야코드>-<nn>.json (분야=categories[0], 100개씩), data/prune/judge/targets.json
// 사용: node scripts/prune/make-judge-batches.js
const fs = require("fs");
const path = require("path");
const lib = require("./lib.js");

const BATCH_SIZE = 100;
const MAX_INBOUND = 2;
const DEF_CHARS = 300;

// 순수 함수: terms, ga(Map), stats(oa-stats), absorbSet(Set) → 대상 term 배열
function selectTargets(terms, { ga, stats, absorb }) {
  const inbound = lib.inboundCounts(terms);
  return terms.filter((t) =>
    !(ga.get(t.slug) > 0)
    && (inbound.get(t.slug) || 0) <= MAX_INBOUND
    && !((stats.terms && stats.terms[t.slug] && stats.terms[t.slug].dfNeutral) > 0)
    && !absorb.has(t.slug));
}

function makeBatches(targets) {
  const byCode = new Map();
  for (const t of targets) {
    const code = (t.categories && t.categories[0]) || "none";
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(t);
  }
  const batches = [];
  for (const code of [...byCode.keys()].sort()) {
    const list = byCode.get(code).sort((a, b) => (a.slug < b.slug ? -1 : 1));
    for (let i = 0, n = 1; i < list.length; i += BATCH_SIZE, n++) {
      batches.push({
        name: `${code}-${String(n).padStart(2, "0")}`,
        items: list.slice(i, i + BATCH_SIZE).map((t) => ({
          slug: t.slug, title_ko: t.title_ko, title_en: t.title_en, categories: t.categories,
          subcategory: t.subcategory || "", definition: String(t.definition || "").slice(0, DEF_CHARS),
        })),
      });
    }
  }
  return batches;
}

function main() {
  const terms = JSON.parse(fs.readFileSync(path.join(lib.ROOT, "terms.json"), "utf8"));
  const stats = JSON.parse(fs.readFileSync(path.join(lib.ROOT, "data", "oa-stats.json"), "utf8"));
  const candFile = path.join(lib.PRUNE_DIR, "merge-candidates.json");
  const absorb = new Set();
  if (fs.existsSync(candFile)) for (const g of JSON.parse(fs.readFileSync(candFile, "utf8")).groups) g.absorb.forEach((s) => absorb.add(s));
  else console.warn("merge-candidates.json 없음 — find-duplicates.js를 먼저 돌리세요(흡수 대상 제외 없이 진행)");
  if (!("docsNeutral" in stats)) console.warn("oa-stats.json에 dfNeutral 없음 — build-stats.js 재빌드 전이면 dfNeutral=0으로 본다");
  const targets = selectTargets(terms, { ga: lib.loadGa(), stats, absorb });
  const batches = makeBatches(targets);
  const dir = path.join(lib.PRUNE_DIR, "judge");
  fs.mkdirSync(path.join(dir, "in"), { recursive: true });
  fs.mkdirSync(path.join(dir, "out"), { recursive: true });
  for (const b of batches) fs.writeFileSync(path.join(dir, "in", `${b.name}.json`), JSON.stringify({ batch: b.name, items: b.items }, null, 1) + "\n");
  fs.writeFileSync(path.join(dir, "targets.json"), JSON.stringify(targets.map((t) => t.slug)) + "\n");
  console.log(`판정 대상 ${targets.length}개, 배치 ${batches.length}개 (data/prune/judge/in/)`);
}

if (require.main === module) main();

module.exports = { selectTargets, makeBatches, BATCH_SIZE };
