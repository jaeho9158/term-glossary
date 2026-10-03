const assert = require("assert");
const { validateSpec, renderSpec } = require("../scripts/diagrams/lib.js");

const spec = {
  slug: "type-i-and-type-ii-errors", type: "matrix",
  axes: { x: { label: "실제", low: "귀무가설 참", high: "귀무가설 거짓" }, y: { label: "판단", low: "기각 안 함", high: "기각" } },
  nodes: [
    { id: "a", cell: "tl", label: "1종 오류", sub: "α", color: "rose" },
    { id: "b", cell: "tr", label: "옳은 기각", sub: "검정력 1−β", color: "green" },
    { id: "c", cell: "bl", label: "옳은 유지", color: "green" },
    { id: "d", cell: "br", label: "2종 오류", sub: "β", color: "rose" },
  ],
  edges: [], source: "test", reviewed: false,
};

assert.deepStrictEqual(validateSpec(spec), []);
const r = renderSpec(spec, { title: "1종·2종 오류" });
assert.deepStrictEqual(r.warnings, [], r.warnings.join("; "));
assert.ok(r.desc.includes("왼쪽 위 1종 오류") && r.desc.includes("오른쪽 아래 2종 오류"));
assert.ok(validateSpec({ ...spec, nodes: spec.nodes.slice(0, 3) }).some((e) => e.includes("4개")));
assert.ok(validateSpec({ ...spec, nodes: spec.nodes.map((n) => ({ ...n, cell: "tl" })) }).some((e) => e.includes("cell")));
assert.ok(validateSpec({ ...spec, axes: { x: spec.axes.x } }).some((e) => e.includes("axes.y")));
// x축 low·high 글자가 길면 칸을 넓혀 서로 겹치지 않게
{
  const long = { ...spec, axes: { ...spec.axes, x: { label: "시장", low: "기존 시장에서의 점유율 확대", high: "신규 시장 개척과 진출 전략" } } };
  const r = renderSpec(long, { title: "t" });
  assert.deepStrictEqual(r.warnings, [], r.warnings.join("; "));
}
console.log("diagrams-matrix: all tests passed");
