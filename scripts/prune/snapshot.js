// Phase 0: 용어 정리 기준선 스냅샷 → data/prune/baseline.json (커밋 안 함).
// 사용: node scripts/prune/snapshot.js
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "data", "prune");

function parseViewerEval(text) {
  const m = text.match(/합계: 미탐 (\d+)\/(\d+) \(([\d.]+)%\), 오탐 (\d+)\/(\d+) \(([\d.]+)%\)/);
  if (!m) return null;
  return { miss: Number(m[1]), missOf: Number(m[2]), missPct: Number(m[3]),
    fp: Number(m[4]), fpOf: Number(m[5]), fpPct: Number(m[6]), line: m[0] };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const slugs = new Set(terms.map((t) => t.slug));
  const files = fs.readdirSync(path.join(ROOT, "terms")).filter((f) => f.endsWith(".html"));
  const stubCount = files.filter((f) => !slugs.has(f.slice(0, -5))).length;
  const gaFile = path.join(OUT_DIR, "ga4.json");
  const ga = fs.existsSync(gaFile) ? JSON.parse(fs.readFileSync(gaFile, "utf8")) : {};
  const gaTerms = Object.entries(ga).filter(([k, v]) => /^\/terms\/.+\.html$/.test(k) && v >= 1).length;
  const stats = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "oa-stats.json"), "utf8"));
  const evalOut = execFileSync(process.execPath, [path.join(ROOT, "scripts", "viewer-eval.js")],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const baseline = {
    date: new Date().toISOString().slice(0, 10),
    termCount: terms.length,
    stubCount,
    gaTerms,
    oaDocs: stats.docs,
    viewerEval: parseViewerEval(evalOut),
  };
  fs.writeFileSync(path.join(OUT_DIR, "baseline.json"), JSON.stringify(baseline, null, 2) + "\n");
  console.log(JSON.stringify(baseline));
}

if (require.main === module) main();
module.exports = { parseViewerEval };
