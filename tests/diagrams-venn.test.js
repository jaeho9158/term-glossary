const assert = require("assert");
const { validateSpec, renderSpec } = require("../scripts/diagrams/lib.js");

const two = {
  slug: "mixed-methods", type: "venn",
  nodes: [{ id: "q", label: "양적 연구", color: "blue" }, { id: "l", label: "질적 연구", color: "green" }],
  regions: [{ sets: ["q"], label: "일반화" }, { sets: ["l"], label: "맥락 이해" }, { sets: ["q", "l"], label: "혼합 연구" }],
  edges: [], source: "test", reviewed: false,
};
const three = {
  ...two, slug: "three-sets",
  nodes: [...two.nodes, { id: "a", label: "실행 연구", color: "amber" }],
  regions: [{ sets: ["q", "l", "a"], label: "통합" }, { sets: ["q", "a"], label: "평가" }, { sets: ["a"], label: "현장 개선" }],
};

for (const s of [two, three]) {
  assert.deepStrictEqual(validateSpec(s), [], s.slug);
  const r = renderSpec(s, { title: s.slug });
  assert.deepStrictEqual(r.warnings, [], `${s.slug}: ${r.warnings.join("; ")}`);
  assert.strictEqual((r.svg.match(/<circle /g) || []).length, s.nodes.length);
  assert.ok(!/#[0-9a-fA-F]{6}/.test(r.svg.replace(/<desc[\s\S]*?<\/desc>/, "")));
}
assert.ok(renderSpec(two, { title: "t" }).desc.includes("양적 연구∩질적 연구: 혼합 연구"));
assert.ok(validateSpec({ ...two, nodes: two.nodes.slice(0, 1) }).some((e) => e.includes("2~3")));
assert.ok(validateSpec({ ...two, regions: [{ sets: ["zz"], label: "x" }] }).some((e) => e.includes("영역")));
assert.ok(validateSpec({ ...two, regions: [...two.regions, { sets: ["l", "q"], label: "중복" }] }).some((e) => e.includes("중복")));
// null 항목은 예외가 아니라 검증 오류
assert.ok(validateSpec({ ...two, regions: [null] }).some((e) => e.includes("영역")));
assert.ok(validateSpec({ ...two, nodes: [null, ...two.nodes] }).length > 0);
console.log("diagrams-venn: all tests passed");
