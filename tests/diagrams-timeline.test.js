const assert = require("assert");
const { validateSpec, renderSpec, renderFigure } = require("../scripts/diagrams/lib.js");

const spec = {
  slug: "history-of-statistics", type: "timeline",
  events: [
    { when: "1900", label: "카이제곱 검정", sub: "피어슨", color: "blue" },
    { when: "1908", label: "t 검정", sub: "고셋" },
    { when: "1925", label: "분산분석", sub: "피셔", color: "violet" },
    { when: "1933", label: "가설검정 틀", sub: "네이만·피어슨" },
  ],
  source: "test", reviewed: false,
};

assert.deepStrictEqual(validateSpec(spec), []);
for (const o of ["h", "v"]) {
  const r = renderSpec(spec, { title: "통계의 역사", orientation: o });
  assert.deepStrictEqual(r.warnings, [], `${o}: ${r.warnings.join("; ")}`);
}
const h = renderSpec(spec, { orientation: "h" }), v = renderSpec(spec, { orientation: "v" });
assert.ok(v.width < h.width && v.height > h.height);
assert.strictEqual((renderFigure(spec, "t").html.match(/<svg/g) || []).length, 2);
assert.ok(h.desc.includes("1908 t 검정"));
assert.ok(validateSpec({ ...spec, events: spec.events.slice(0, 1) }).some((e) => e.includes("2~7")));
assert.ok(validateSpec({ ...spec, events: [{ when: "", label: "x" }, ...spec.events] }).some((e) => e.includes("when")));
console.log("diagrams-timeline: all tests passed");
