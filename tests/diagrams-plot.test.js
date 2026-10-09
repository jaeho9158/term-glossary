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
// 가로판(440px 그림)과 휴대폰판(343px 컬럼에 1:1) 두 벌
assert.strictEqual((fig.html.match(/<svg/g) || []).length, 2);
for (const s of [power, roc]) {
  const v = renderSpec(s, { title: s.slug, orientation: "v" });
  assert.strictEqual(v.width, 343, `${s.slug}: 휴대폰판 폭`);
  assert.deepStrictEqual(v.warnings, [], `${s.slug} v: ${v.warnings.join("; ")}`);
}
// 자리를 못 찾은 라벨은 번호 배지 + 그림 아래 범례로 옮긴다(겹침 없이)
{
  const tight = { ...power, plot: { ...power.plot, shade: [{ series: 0, from: -0.2, to: 0.2, label: "아주 좁은 구간의 긴 음영 라벨" }], vlines: [] } };
  const v = renderSpec(tight, { title: "t", orientation: "v" });
  assert.deepStrictEqual(v.warnings, [], v.warnings.join("; "));
  assert.ok(v.texts.some((t) => t.owner === "key" && t.label.includes("긴 음영")), "범례(key)에 라벨");
}
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
// 오른쪽 끝 수직선의 라벨은 왼쪽으로 붙여 보기 영역 안에
{
  const edge = { ...power, plot: { series: [power.plot.series[0]], x: { label: "x", range: [-3, 3] }, y: { label: "y" }, vlines: [{ x: 3, label: "상한 임계값 표시" }] } };
  const r = renderSpec(edge, { title: "t" });
  assert.deepStrictEqual(r.warnings, [], r.warnings.join("; "));
  assert.ok(r.svg.includes('text-anchor="end" font-size="11.5" font-weight="700" fill="var(--dg-navy)">상한 임계값 표시'));
}
// 눈금: 1·2·5×10^k 간격, 간격에 맞는 소수 자리, 부동소수 찌꺼기 없음, 축 안에만
{
  const ticksOf = (s) => {
    const r = renderSpec(s, { title: "t" });
    assert.deepStrictEqual(r.warnings, [], r.warnings.join("; "));
    const T = [...r.svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)" text-anchor="(middle|end)" font-size="11.5" fill="var\(--dg-general\)">([^<]*)</g)];
    return { x: T.filter((m) => m[3] === "middle").map((m) => m[4]), y: T.filter((m) => m[3] === "end").map((m) => m[4]) };
  };
  const mk = (series, range) => ({ ...power, plot: { series, x: { label: "x", range, ticks: true }, y: { label: "y", ticks: true } } });
  const tiny = ticksOf(mk([{ fn: "normal", params: { mu: 0, sigma: 0.01 } }], [-0.03, 0.03]));
  assert.deepStrictEqual(tiny.x, ["-0.03", "-0.02", "-0.01", "0", "0.01", "0.02", "0.03"]);
  assert.deepStrictEqual(tiny.y, ["0", "10", "20", "30"]); // 최댓값 39.9, 여백 12%는 눈금에 안 넣음
  const big = ticksOf(mk([{ fn: "linear", params: { a: 1000, b: 0 } }], [0, 1234.5678]));
  assert.deepStrictEqual(big.x, ["0", "200", "400", "600", "800", "1000", "1200"]);
  assert.deepStrictEqual(big.y, ["0", "200000", "400000", "600000", "800000", "1000000", "1200000"]);
  const fine = ticksOf(mk([{ fn: "linear", params: { a: 1, b: 0 } }], [0, 0.02]));
  assert.deepStrictEqual(fine.x, ["0", "0.005", "0.010", "0.015", "0.020"]);
  const rocT = ticksOf(roc);
  assert.deepStrictEqual(rocT.x, ["0", "0.2", "0.4", "0.6", "0.8", "1.0"]);
  for (const t of [...tiny.x, ...tiny.y, ...big.x, ...fine.x, ...rocT.y]) assert.ok(!/0000\d|9999|^-0$/.test(t), t);
}
// 음영 라벨은 음영 넓이의 무게중심에: 끝이 열린 음영(from·to null)도 라벨이 음영 안에
{
  const textbook = { ...power, plot: { ...power.plot, vlines: [{ x: 1.64, label: "임계값" }], shade: [
    { series: 0, from: 1.64, to: null, label: "α" },
    { series: 1, from: null, to: 1.64, label: "β" },
  ] } };
  const withPower = { ...textbook, plot: { ...textbook.plot, shade: [...textbook.plot.shade, { series: 1, from: 1.64, to: null, label: "검정력" }] } };
  for (const s of [textbook, withPower, power]) {
    assert.deepStrictEqual(validateSpec(s), []);
    const r = renderSpec(s, { title: "t" });
    // 축 변환을 SVG에서 되찾는다: x축 선(가로 화살표)과 y축 선의 위치, 범위 [-4,6]
    const ax = r.svg.match(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="\2"/);
    const left = +ax[1], baseY = +ax[2], PW = +ax[3] - 8 - left;
    const X = (x) => left + ((x + 4) / 10) * PW;
    for (const sh of s.plot.shade) {
      const m = r.svg.match(new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)" text-anchor="middle" font-size="11.5" font-weight="700"[^>]*>${sh.label}<`));
      assert.ok(m, sh.label);
      const tx = +m[1], ty = +m[2];
      const a = sh.from ?? -4, b = sh.to ?? 6;
      assert.ok(tx > X(a) && tx < X(b), `${sh.label}: x ${tx} 음영 [${X(a)}, ${X(b)}] 밖`);
      assert.ok(ty <= baseY - 2, `${sh.label}: 축 아래 ${ty} > ${baseY}`);
      // 라벨이 곡선에 가리면 경고가 나야 한다. β·검정력은 넓은 음영이라 가리지 않아야 한다.
      if (sh.label !== "α") assert.ok(!r.warnings.some((w) => w.includes(`"${sh.label}"`)), `${sh.label}: ${r.warnings.join("; ")}`);
    }
    if (s === power) assert.deepStrictEqual(r.warnings, [], r.warnings.join("; "));
    console.log(`  교과서 그림(${s.plot.shade.map((x) => x.label).join("·")}): 경고 ${r.warnings.length ? r.warnings.join("; ") : "없음"}`);
  }
  // 음영 끝이 x 범위 밖에만 있으면 오류
  assert.ok(bad({ shade: [{ series: 0, from: 7, to: null }] }).some((e) => e.includes("shade")));
  assert.ok(bad({ shade: [{ series: 0, from: null, to: -5 }] }).some((e) => e.includes("shade")));
  assert.ok(bad({ shade: [{ series: 0, from: 6.5, to: 9 }] }).some((e) => e.includes("shade")));
  assert.deepStrictEqual(bad({ shade: [{ series: 0, from: 5, to: 9 }] }), []);
}
// 카이제곱 df=1(0에서 발산)과 df=4를 겹쳐도 둘 다 보이게: 위 2% 튀는 값은 y 범위에서 빼고 곡선은 그림 영역으로 자른다
{
  const chi = { ...power, slug: "chi-square", plot: { series: [{ fn: "chi2", params: { df: 1 }, label: "자유도 1" }, { fn: "chi2", params: { df: 4 }, label: "자유도 4" }], x: { label: "카이제곱", range: [0, 10] }, y: { label: "밀도" } } };
  assert.deepStrictEqual(validateSpec(chi), []);
  const r = renderSpec(chi, { title: "t" });
  assert.deepStrictEqual(r.warnings, [], r.warnings.join("; "));
  const clip = r.svg.match(/<clipPath id="([^"]+)">/);
  assert.ok(clip && clip[1].startsWith("dg-chi-square-h"), "clipPath id는 캔버스 접두어로");
  const curves = [...r.svg.matchAll(/<path d="M([^"]+)" fill="none" stroke="var\(--dg-(\w+)-s\)" stroke-width="2.2" clip-path="url\(#([^)]+)\)"/g)];
  assert.strictEqual(curves.length, 2);
  assert.ok(curves.every((m) => m[3] === clip[1]));
  const ax = r.svg.match(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="\2"/);
  const baseY = +ax[2];
  const peak = (m) => Math.min(...[...m[1].matchAll(/[\d.]+,([-\d.]+)/g)].map((q) => +q[1]));
  assert.ok(baseY - peak(curves[1]) > 0.25 * 200, `df=4 곡선 높이 ${baseY - peak(curves[1])}px`);
  assert.ok(!/#[0-9a-fA-F]{6}/.test(r.svg.replace(/<desc[\s\S]*?<\/desc>/, "")));
  // 튀는 값이 없는 그림(정규분포)은 y 범위를 자르지 않는다
  const n = renderSpec(power, { title: "t" }).svg;
  const top = Math.min(...[...n.matchAll(/<path d="M([^"]+)" fill="none"/g)].flatMap((m) => [...m[1].matchAll(/[\d.]+,([-\d.]+)/g)].map((q) => +q[1])));
  assert.ok(top > 0 && top > baseY - 200, String(top));
}
// 음영 색은 계열 색 대신 따로 줄 수 있다(α 꼬리를 빨강으로)
{
  const c = { ...power, plot: { ...power.plot, shade: [{ series: 0, from: 1.64, to: null, label: "α", color: "rose" }] } };
  assert.deepStrictEqual(validateSpec(c), []);
  assert.ok(renderSpec(c, { title: "t" }).svg.includes("var(--dg-rose-f)"));
  assert.ok(validateSpec({ ...power, plot: { ...power.plot, shade: [{ series: 0, from: 0, to: 1, color: "pink" }] } }).some((e) => e.includes("pink")));
}
console.log("diagrams-plot: all tests passed");
