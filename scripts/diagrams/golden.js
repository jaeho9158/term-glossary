// 렌더러 회귀 스냅샷: 스펙 내용 해시 → 렌더 결과 해시.
//   node scripts/diagrams/golden.js --write   tests/fixtures/diagrams-golden.json 갱신
// 테스트는 스펙 해시가 기록과 같은 항목만 비교한다(스펙을 고치면 그 항목은 건너뜀).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { renderFigure } = require("./lib.js");

const ROOT = path.join(__dirname, "..", "..");
const SPEC_DIR = path.join(ROOT, "diagrams", "specs");
const OUT = path.join(ROOT, "tests", "fixtures", "diagrams-golden.json");
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);

function snapshot() {
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const titles = new Map(terms.map((t) => [t.slug, t.title_ko]));
  const out = {};
  for (const f of fs.readdirSync(SPEC_DIR).filter((x) => x.endsWith(".json")).sort()) {
    const raw = fs.readFileSync(path.join(SPEC_DIR, f), "utf8");
    const spec = JSON.parse(raw);
    out[spec.slug] = [sha(raw), sha(renderFigure(spec, titles.get(spec.slug)).html)];
  }
  return out;
}

if (require.main === module && process.argv.includes("--write")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const snap = snapshot();
  fs.writeFileSync(OUT, JSON.stringify(snap, null, 0).replace(/\],/g, "],\n") + "\n", "utf8");
  console.log(`스냅샷 ${Object.keys(snap).length}개 → ${path.relative(ROOT, OUT)}`);
}

module.exports = { snapshot, sha, OUT, SPEC_DIR };
