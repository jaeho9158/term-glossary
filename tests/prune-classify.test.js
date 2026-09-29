// 등급 산정(scripts/prune/classify.js) 단위 테스트: 계획서 Phase 4 표의 행을 하나씩 태운다.
const test = require("node:test");
const assert = require("node:assert");
const { classify } = require("../scripts/prune/classify.js");

const T = (slug, extra = {}) => ({ slug, title_ko: slug, title_en: slug, categories: ["psych"], related: [], prerequisites: [], ...extra });
const V = (label, confidence = 0.9, suggest_category = null) => ({ label, confidence, note: "", suggest_category });
const group = (keeper, absorb, conf, extra = {}) => ({ id: `m-${keeper}`, keeper, absorb, conf,
  members: [keeper, ...absorb].map((slug) => ({ slug })), ...extra });

function run(terms, opts) {
  const r = classify({ terms, ...opts });
  return r.tiers;
}

test("행1: 흡수 대상 + conf=high → merge", () => {
  const t = run([T("k"), T("a")], { groups: [group("k", ["a"], "high")] });
  assert.strictEqual(t.a.tier, "merge");
  assert.strictEqual(t.a.groupId, "m-k");
});

test("행2: 흡수 대상 + medium/low 또는 크기>4 → needs-human(merge-uncertain)", () => {
  for (const conf of ["medium", "low"]) {
    const t = run([T("k"), T("a")], { groups: [group("k", ["a"], conf)] });
    assert.strictEqual(t.a.tier, "needs-human");
    assert.strictEqual(t.a.reason, "merge-uncertain");
  }
  const big = ["a", "b", "c", "d"];
  const t = run([T("k"), ...big.map((s) => T(s))], { groups: [group("k", big, "high")] });
  assert.strictEqual(t.a.tier, "needs-human");
});

test("행3: GA≥1이면 verdict가 everyday여도 keep", () => {
  const t = run([T("x")], { ga: new Map([["x", 1]]), verdicts: { x: V("everyday", 0.99) } });
  assert.strictEqual(t.x.tier, "keep");
  assert.strictEqual(t.x.reason, "ga");
});

test("행4: 역링크≥3이면 keep", () => {
  const terms = [T("x"), T("r1", { related: ["x"] }), T("r2", { related: ["x"] }), T("r3", { prerequisites: ["x"] })];
  const t = run(terms, { verdicts: { x: V("proper_noun", 0.99) } });
  assert.strictEqual(t.x.tier, "keep");
  assert.strictEqual(t.x.reason, "inbound");
});

test("행5: dfNeutral≥1 또는 df≥2면 keep", () => {
  const stats = { terms: { a: { df: 1, dfNeutral: 1 }, b: { df: 2, dfNeutral: 0 }, c: { df: 1, dfNeutral: 0 } } };
  const verdicts = { a: V("everyday"), b: V("everyday"), c: V("everyday") };
  const t = run([T("a"), T("b"), T("c")], { stats, verdicts });
  assert.strictEqual(t.a.tier, "keep");
  assert.strictEqual(t.b.tier, "keep");
  assert.strictEqual(t.c.tier, "prune");
});

test("행6: everyday/proper_noun ∧ confidence≥0.8 → prune", () => {
  const t = run([T("e"), T("p")], { verdicts: { e: V("everyday", 0.8), p: V("proper_noun", 0.95) } });
  assert.strictEqual(t.e.tier, "prune");
  assert.strictEqual(t.p.tier, "prune");
});

test("행7: niche ∧ confidence≥0.8 ∧ 역링크=0 → prune, 역링크 있으면 needs-human", () => {
  const t = run([T("n"), T("m"), T("r", { related: ["m"] })], { verdicts: { n: V("niche", 0.85), m: V("niche", 0.85) } });
  assert.strictEqual(t.n.tier, "prune");
  assert.strictEqual(t.m.tier, "needs-human");
  assert.strictEqual(t.m.reason, "llm-low-conf");
});

test("행8: 그 밖의 everyday/proper_noun/niche(확신 낮음) → needs-human(llm-low-conf)", () => {
  const t = run([T("a"), T("b"), T("c")], { verdicts: { a: V("everyday", 0.79), b: V("proper_noun", 0.5), c: V("niche", 0.79) } });
  for (const s of ["a", "b", "c"]) {
    assert.strictEqual(t[s].tier, "needs-human");
    assert.strictEqual(t[s].reason, "llm-low-conf");
  }
});

test("행9: wrong_category → keep + recat 목록", () => {
  const r = classify({ terms: [T("w")], verdicts: { w: V("wrong_category", 0.9, "phys") } });
  assert.strictEqual(r.tiers.w.tier, "keep");
  assert.deepStrictEqual(r.summary.recat, [{ slug: "w", suggest_category: "phys" }]);
});

test("행10: 나머지(academic·판정 없음)는 keep", () => {
  const t = run([T("a"), T("b")], { verdicts: { a: V("academic", 0.9) } });
  assert.strictEqual(t.a.tier, "keep");
  assert.strictEqual(t.b.tier, "keep");
});

test("df=0 단독으로는 아무것도 prune되지 않는다(판정 없음)", () => {
  const t = run([T("a")], { stats: { terms: {} } });
  assert.strictEqual(t.a.tier, "keep");
});

test("그룹 대표는 verdict가 나빠도 prune되지 않는다(가드)", () => {
  const t = run([T("k"), T("a")], { groups: [group("k", ["a"], "high")], verdicts: { k: V("everyday", 0.99) } });
  assert.strictEqual(t.k.tier, "keep");
  assert.strictEqual(t.k.reason, "merge-keeper");
});

test("속성: GA≥1인 용어는 어떤 verdict·조합에서도 prune이 아니다", () => {
  const labels = ["academic", "everyday", "proper_noun", "niche", "wrong_category"];
  const confs = [0, 0.5, 0.8, 1];
  const terms = [];
  const verdicts = {};
  for (const l of labels) for (const c of confs) { const slug = `${l}-${c}`; terms.push(T(slug)); verdicts[slug] = V(l, c, "phys"); }
  const ga = new Map(terms.map((t) => [t.slug, 1]));
  const r = classify({ terms, ga, verdicts });
  for (const [slug, v] of Object.entries(r.tiers)) assert.notStrictEqual(v.tier, "prune", slug);
});

test("요약: 분야별 prune/needsHuman/merge 집계", () => {
  const terms = [T("k"), T("a"), T("p", { categories: ["edu"] }), T("h", { categories: ["edu"] })];
  const r = classify({ terms, groups: [group("k", ["a"], "high")], verdicts: { p: V("everyday", 0.9), h: V("niche", 0.5) } });
  assert.deepStrictEqual(r.summary.byCategory, {
    psych: { prune: 0, needsHuman: 0, merge: 1 },
    edu: { prune: 1, needsHuman: 1, merge: 0 },
  });
  assert.strictEqual(r.summary.keep, 1);
  assert.strictEqual(r.summary.merge + r.summary.prune + r.summary.needsHuman + r.summary.keep, terms.length);
});
