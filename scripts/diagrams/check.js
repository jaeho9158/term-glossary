// 스펙 파일 몇 개만 검증·렌더해 오류/겹침 경고를 출력한다(작성 에이전트용).
//   node scripts/diagrams/check.js diagrams/specs/a.json diagrams/specs/b.json ...
"use strict";
const fs = require("fs");
const path = require("path");
const { validateSpec, renderFigure } = require("./lib.js");
const ROOT = path.join(__dirname, "..", "..");
const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
const known = new Set(terms.map((t) => t.slug));
let bad = 0;
for (const f of process.argv.slice(2)) {
  let spec;
  try { spec = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { console.log(`✗ ${f}: JSON 오류 ${e.message}`); bad++; continue; }
  const errs = validateSpec(spec, known);
  if (path.basename(f, ".json") !== spec.slug) errs.push("파일명과 slug 불일치");
  if (errs.length) { console.log(`✗ ${f}: ${errs.join("; ")}`); bad++; continue; }
  const w = renderFigure(spec, spec.slug).warnings;
  if (w.length) { console.log(`! ${f}: ${w.join("; ")}`); bad++; }
}
console.log(bad ? `문제 ${bad}건` : "OK");
process.exitCode = bad ? 1 : 0;
