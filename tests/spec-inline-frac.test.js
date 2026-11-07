// 그림 스펙 문구에 a/b 꼴 인라인 분수가 남지 않았는지 검사 (분수는 {frac:n,d} 또는 \frac{n}{d})
const test = require("node:test");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { findInlineFractions } = require("../scripts/diagrams/inline-frac.js");

const ROOT = path.join(__dirname, "..");
const SKIPK = /^(title|expr|slug|source|type|fn|id|from|to|color|kind|tone|license|credit|url|src|href|file|path|image|sourceUrl|reviewed|alt|sourceNote|checkResult)$/;
// 다른 작업이 맡은 slug, 서브스크립트가 든 분수를 엔진이 못 그려 인라인으로 둔 예외
const SKIP_SLUGS = new Set("arrhenius-equation,dot-product,echogenicity,permutations-combinations,shear-stress,tensile-force,bloom-taxonomy,five-s,confirmation-bias,explosion-limit-lel-uel,creatine-kinase,neutralization-reaction,carbon-footprint,limbic-system,exergy-analysis".split(","));

// 분수 구문 안쪽(중첩 인라인 포함)은 검사에서 가린다
function group(s, i) { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}' && --d === 0) return k; } return -1; }
function mask(s) {
  for (let i = s.indexOf("\\frac{"); i >= 0; i = s.indexOf("\\frac{")) {
    const e1 = group(s, i + 5), e2 = e1 < 0 ? -1 : group(s, e1 + 1);
    if (e2 < 0 || s[e1 + 1] !== '{') break;
    s = s.slice(0, i) + '§' + s.slice(e2 + 1);
  }
  return s.replace(/\{frac:[^,{}]*,[^{}]*\}/g, '§');
}
function walk(v, loc, cb) {
  if (typeof v === "string") cb(v, loc);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, loc + "[" + i + "]", cb));
  else if (v && typeof v === "object") for (const k in v) if (!SKIPK.test(k)) walk(v[k], loc + "." + k, cb);
}

test("그림 스펙·도해 캡션에 인라인 분수(a/b)가 없다", () => {
  const bad = [];
  for (const [dir, only] of [["diagrams/specs", null], ["data/illus/specs", null], ["data/illus", ["caption"]]]) {
    const d = path.join(ROOT, dir);
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith(".json")) continue;
      const slug = f.replace(/\.json$/, "");
      if (SKIP_SLUGS.has(slug)) continue;
      let j; try { j = JSON.parse(fs.readFileSync(path.join(d, f), "utf8")); } catch { continue; }
      if (only) j = Object.fromEntries(only.filter((k) => k in j).map((k) => [k, j[k]]));
      walk(j, "", (s, loc) => { for (const c of findInlineFractions(mask(s))) bad.push(`${dir}/${f}${loc}: ${c.before}`); });
    }
  }
  assert.deepStrictEqual(bad, []);
});
