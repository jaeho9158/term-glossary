// Phase 3 수집: data/prune/judge/out/*.json → data/prune/verdicts.json
// 누락·중복·스키마 위반 slug는 data/prune/judge/retry.json에 적는다(재배치용).
// 사용: node scripts/prune/collect-verdicts.js [--judge-dir <dir>] [--out <verdicts.json>]
const fs = require("fs");
const path = require("path");
const lib = require("./lib.js");

const LABELS = new Set(["academic", "everyday", "proper_noun", "niche", "wrong_category"]);
const NOTE_MAX = 40;

// 순수 함수: 항목 하나 검증. 통과하면 정규화된 verdict, 아니면 { error }.
function validateVerdict(v) {
  if (!v || typeof v.slug !== "string" || !v.slug) return { error: "slug 없음" };
  if (!LABELS.has(v.label)) return { error: `label 위반: ${v.label}` };
  if (typeof v.confidence !== "number" || !(v.confidence >= 0 && v.confidence <= 1)) return { error: "confidence 위반" };
  if (v.suggest_category != null && typeof v.suggest_category !== "string") return { error: "suggest_category 위반" };
  if (v.label === "wrong_category" && !v.suggest_category) return { error: "wrong_category인데 suggest_category 없음" };
  if (v.note != null && typeof v.note !== "string") return { error: "note 위반" };
  return { verdict: { label: v.label, confidence: v.confidence, note: (v.note || "").slice(0, NOTE_MAX),
    suggest_category: v.suggest_category || null } };
}

// 순수 함수: 배치 출력들 + 대상 slug 목록 → { verdicts, retry }
function collect(outputs, targets) {
  const targetSet = new Set(targets);
  const verdicts = {};
  const seen = new Map();
  const invalid = [];
  const duplicate = new Set();
  const unknown = [];
  for (const out of outputs) {
    for (const item of (out && out.verdicts) || []) {
      const slug = item && item.slug;
      if (typeof slug === "string" && !targetSet.has(slug)) { unknown.push(slug); continue; }
      const r = validateVerdict(item);
      if (r.error) { invalid.push({ slug: slug || null, reason: r.error }); if (slug) seen.set(slug, (seen.get(slug) || 0) + 1); continue; }
      seen.set(slug, (seen.get(slug) || 0) + 1);
      if (seen.get(slug) > 1) { duplicate.add(slug); continue; }
      verdicts[slug] = r.verdict;
    }
  }
  for (const s of duplicate) delete verdicts[s];
  const missing = targets.filter((s) => !seen.has(s));
  const retrySlugs = new Set([...missing, ...duplicate, ...invalid.map((i) => i.slug).filter(Boolean)]);
  for (const s of retrySlugs) delete verdicts[s];
  return { verdicts, retry: { missing, duplicate: [...duplicate], invalid, unknown, slugs: [...retrySlugs].sort() } };
}

function main() {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const dir = arg("--judge-dir") ? path.resolve(arg("--judge-dir")) : path.join(lib.PRUNE_DIR, "judge");
  const outFile = arg("--out") ? path.resolve(arg("--out")) : path.join(lib.PRUNE_DIR, "verdicts.json");
  const targets = JSON.parse(fs.readFileSync(path.join(dir, "targets.json"), "utf8"));
  const outDir = path.join(dir, "out");
  const outputs = [];
  for (const f of fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith(".json")).sort() : []) {
    try { outputs.push(JSON.parse(fs.readFileSync(path.join(outDir, f), "utf8"))); }
    catch (e) { console.warn(`[skip] ${f}: JSON 파싱 실패`); }
  }
  const { verdicts, retry } = collect(outputs, targets);
  fs.writeFileSync(outFile, JSON.stringify(verdicts) + "\n");
  fs.writeFileSync(path.join(dir, "retry.json"), JSON.stringify(retry, null, 1) + "\n");
  console.log(`verdict ${Object.keys(verdicts).length}/${targets.length}, 재시도 ${retry.slugs.length}(누락 ${retry.missing.length}, 중복 ${retry.duplicate.length}, 위반 ${retry.invalid.length}), 대상 외 ${retry.unknown.length}`);
}

if (require.main === module) main();

module.exports = { validateVerdict, collect, LABELS };
