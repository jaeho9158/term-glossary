const assert = require("assert");
const { validateSpec, renderSpec, renderFigure } = require("../scripts/diagrams/lib.js");

const base = (n) => ({
  slug: "pdca-cycle", type: "cycle", center: "PDCA",
  nodes: ["계획", "실행", "점검", "개선", "표준화", "공유"].slice(0, n).map((l, i) => ({ id: `n${i}`, label: l, color: "blue" })),
  edges: [], source: "test", reviewed: false,
});

for (const n of [3, 4, 5, 6]) {
  const s = base(n);
  assert.deepStrictEqual(validateSpec(s), [], `n=${n}`);
  const r = renderSpec(s, { title: "PDCA" });
  assert.deepStrictEqual(r.warnings, [], `n=${n} 겹침: ${r.warnings.join("; ")}`);
  assert.strictEqual((r.svg.match(/<line /g) || []).length, n, "화살표는 노드 수만큼");
  assert.ok(!/#[0-9a-fA-F]{6}/.test(r.svg.replace(/<desc[\s\S]*?<\/desc>/, "")));
}
assert.ok(validateSpec(base(2)).some((e) => e.includes("3~6")));
assert.ok(validateSpec({ ...base(7), nodes: [...base(6).nodes, { id: "x", label: "추가" }] }).some((e) => e.includes("3~6")));
assert.ok(validateSpec({ ...base(4), edges: [{ from: "n0", to: "n1" }] }).some((e) => e.includes("edges")));

const r = renderSpec(base(4), { title: "PDCA" });
assert.ok(r.desc.includes("다시 계획"));
assert.strictEqual((renderFigure(base(4), "t").html.match(/<svg/g) || []).length, 1);
console.log("diagrams-cycle: all tests passed");
