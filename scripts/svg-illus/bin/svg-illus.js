#!/usr/bin/env node
// 사용: node bin/svg-illus.js spec.json [-o out.svg] [--html] [--css] [--embed-style] [--strict]
//   spec이 도식(type: procedure·chain·…·plot)이든 도해(elements / template)든 알아서 고른다.
//   --html  figure + figcaption(캡션·범례·대응표) 조각을 낸다.
//   --css   공통 CSS(토큰·다크 모드)를 출력하고 끝낸다.
import fs from 'node:fs';
import { toFigure, toSVG, themeCss, validate, validateDiagram, isDiagram, renderSVG, templates, resolveSpec } from '../src/index.js';

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const val = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (flag('-h') || flag('--help') || !args.length) {
  console.log('사용: svg-illus <spec.json> [-o 출력] [--html] [--embed-style] [--strict]\n      svg-illus --css > svg-illus.css');
  process.exit(args.length ? 0 : 1);
}
if (flag('--css')) { process.stdout.write(themeCss()); process.exit(0); }
const out = val('-o');
const file = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-o');
let spec;
try { spec = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.error(`스펙을 읽지 못함: ${file}: ${e.message}`); process.exit(1); }

try {
  const diagram = isDiagram(spec);
  const errs = diagram ? validateDiagram(spec, { requireMeta: false }) : validate(resolveSpec(spec, templates));
  if (errs.length) { console.error('스펙 오류:\n- ' + errs.join('\n- ')); process.exit(1); }
  const opts = { embedStyle: flag('--embed-style'), strict: flag('--strict') };
  if (!diagram) {
    const { report } = renderSVG(spec, { templates, ...opts });
    for (const u of report.unresolved) console.error(`경고: 라벨 겹침 미해결 "${u.text}" (${u.why})`);
  }
  const result = flag('--html') ? toFigure(spec, opts) : toSVG(spec, opts);
  if (out) { fs.writeFileSync(out, result + '\n'); console.error(`→ ${out}`); }
  else process.stdout.write(result + '\n');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
