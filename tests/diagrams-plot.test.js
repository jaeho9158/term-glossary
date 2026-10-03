const assert = require("assert");
const { validateSpec, renderSpec, renderFigure } = require("../scripts/diagrams/lib.js");

const power = {
  slug: "statistical-power", type: "plot",
  plot: {
    series: [
      { fn: "normal", params: { mu: 0, sigma: 1 }, label: "귀무가설", color: "gray" },
      { fn: "normal", params: { mu: 2.5, sigma: 1 }, label: "대립가설", color: "blue" },
    ],
    shade: [{ series: 1, from: 1.64, to: null, label: "검정력" }],
    vlines: [{ x: 1.64, label: "임계값" }],
    x: { label: "검정통계량", range: [-4, 6] },
    y: { label: "밀도" },
  },
  source: "test", reviewed: false,
};
const roc = {
  slug: "roc-curve", type: "plot",
  plot: {
    series: [{ fn: "roc", params: { auc: 0.85 }, label: "AUC 0.85", color: "blue" }],
    x: { label: "위양성률", ticks: true }, y: { label: "민감도", ticks: true },
  },
  source: "test", reviewed: false,
};

for (const s of [power, roc]) {
  assert.deepStrictEqual(validateSpec(s), [], s.slug);
  const r = renderSpec(s, { title: s.slug });
  assert.deepStrictEqual(r.warnings, [], `${s.slug}: ${r.warnings.join("; ")}`);
  assert.ok(!/#[0-9a-fA-F]{6}/.test(r.svg.replace(/<desc[\s\S]*?<\/desc>/, "")));
}
const fig = renderFigure(power, "검정력");
assert.ok(fig.html.includes("<figcaption>개념 설명용 모식도"), "모식도 캡션");
assert.strictEqual((fig.html.match(/<svg/g) || []).length, 1);
assert.ok(renderSpec(power, { title: "t" }).desc.includes("음영: 검정력"));
assert.ok(renderSpec(roc, { title: "t" }).svg.includes("stroke-dasharray"), "ROC 우연선");

// 검증
const bad = (patch) => validateSpec({ ...power, plot: { ...power.plot, ...patch } });
assert.ok(bad({ series: [] }).some((e) => e.includes("1~3")));
assert.ok(bad({ series: [{ fn: "gamma", params: {} }] }).some((e) => e.includes("알 수 없는 plot 함수")));
assert.ok(bad({ x: { label: "x", range: [3, 1] } }).some((e) => e.includes("range")));
assert.ok(bad({ shade: [{ series: 5, from: 0, to: 1 }] }).some((e) => e.includes("shade")));
assert.ok(bad({ vlines: [{ x: 99 }] }).some((e) => e.includes("vlines")));
assert.ok(bad({ series: [...roc.plot.series, power.plot.series[0]] }).some((e) => e.includes("roc")));
assert.ok(validateSpec({ ...power, plot: undefined }).some((e) => e.includes("plot 없음")));

// 곡선이 라벨을 가리면 경고: 좁은 음영에 긴 라벨을 달면 라벨이 옆 곡선(귀무가설) 위로 뻗는다
{
  const covered = { ...power, plot: { ...power.plot, vlines: [], shade: [{ series: 1, from: 1.64, to: 1.7, label: "아주 긴 음영 라벨 문장입니다" }] } };
  const r = renderSpec(covered, { title: "t" });
  assert.ok(r.warnings.some((w) => w.includes("곡선이 라벨을 가림")), r.warnings.join("; "));
}
// 계열 기본 색·축 색은 core 한 곳에서(venn·plot·matrix 공용)
{
  const core = require("../scripts/diagrams/core.js");
  assert.deepStrictEqual(core.SERIES_COLORS, ["blue", "rose", "green"]);
  assert.strictEqual(core.AXIS_COLOR, "var(--dg-general)");
}
console.log("diagrams-plot: all tests passed");
