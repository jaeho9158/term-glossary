// 숫자/숫자 분수 후보 목록(자동 변환 없음). node tools/frac-candidates.mjs [사이트] [출력.json]
import fs from 'node:fs'; import path from 'node:path';
const SITE = path.resolve(process.argv[2] || path.resolve(import.meta.dirname, '../../..'));
const OUT = process.argv[3] || path.join(SITE, '.superpowers/frac-candidates.json');
const RE = /(?<![\w./:\-])(\d{1,3})\/(\d{1,3})(?![\w./:\-]|\d)/g;
const BAD_CTX = /(\d{1,4}\/\d{1,2}\/\d{1,4})|km\/h|m\/s|mg\/|\/(?:day|min|sec|hr|kg|mL|L)\b/;
const found = [];
const scan = (file, kind, obj) => {
  const walk = (v, p) => {
    if (typeof v === 'string') { for (const m of v.matchAll(RE)) { const ctx = v.slice(Math.max(0, m.index - 12), m.index + m[0].length + 12); if (!BAD_CTX.test(ctx)) found.push({ file, kind, path: p, frac: m[0], context: ctx }); } }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, p + '[' + i + ']'));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (['slug', 'source', 'id', 'sources'].includes(k)) continue; walk(x, p + '.' + k); }
  };
  walk(obj, '');
};
const specDir = path.join(SITE, 'diagrams/specs');
for (const f of fs.readdirSync(specDir).filter(x => x.endsWith('.json'))) scan('diagrams/specs/' + f, 'diagram', JSON.parse(fs.readFileSync(path.join(specDir, f), 'utf8')));
const illDir = path.join(SITE, 'data/illus/specs');
for (const f of fs.readdirSync(illDir).filter(x => x.endsWith('.json'))) scan('data/illus/specs/' + f, 'illus', JSON.parse(fs.readFileSync(path.join(illDir, f), 'utf8')));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(found, null, 1));
console.log('후보', found.length, '건 /', new Set(found.map(x => x.file)).size, '파일 →', OUT);
