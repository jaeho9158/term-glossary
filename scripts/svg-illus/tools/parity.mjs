// 사이트 원본 도식 렌더러와 새 어댑터의 SVG가 (색 변수 이름·클래스 차이를 빼고) 같은지 전수 비교한다.
//   node tools/parity.mjs [사이트 경로]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { renderDiagramSVG, validateDiagram } from '../src/index.js';
const SITE = process.argv[2] || path.resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);
const old = require(path.join(SITE, 'scripts/diagrams/lib.js'));
const dir = path.join(SITE, 'diagrams/specs');
const norm = s => s.replace(/var\(--si-([a-z-]+),[^)]*\)/g, 'var(--dg-$1)').replace(/--si-/g, '--dg-').replace('class="si dg ', 'class="dg ').replace(/varsi/g, 'vardg');
let same = 0, diff = 0, errs = 0; const byType = {}; const diffs = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const t = byType[spec.type] ??= { same: 0, diff: 0 };
  if (old.validateSpec(spec).length !== validateDiagram(spec).length) errs++;
  for (const o of ['h', 'v']) {
    let a, b;
    try { a = old.renderSpec(spec, { orientation: o }).svg; } catch { a = 'ERR'; }
    try { b = norm(renderDiagramSVG(spec, { orientation: o }).svg); } catch { b = 'ERR'; }
    if (a === b) { same++; t.same++; } else { diff++; t.diff++; if (diffs.length < 5) diffs.push(f + ' ' + o); }
  }
}
console.log({ same, diff, validateMismatch: errs, byType, diffs });
process.exitCode = diff ? 1 : 0;
