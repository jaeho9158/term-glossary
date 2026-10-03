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
// 영역 라벨 줄마다: 모든 원에 대해 완전히 안 또는 완전히 밖이어야 하고,
// 그 안쪽 원 조합이 그 줄을 담은 영역의 sets와 같아야 한다(엉뚱한 영역에 앉지 않게).
const { textWidth } = require("../scripts/diagrams/core.js");
function regionCheck(s, r) {
  const C = [...r.svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
  const ids = s.nodes.map((n) => n.id);
  const names = new Set(s.nodes.map((n) => n.label));
  const bad = [];
  for (const m of r.svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)" text-anchor="(\w+)" font-size="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)) {
    const [x, y, fs] = [+m[1], +m[2], +m[4]], t = m[6];
    const w = textWidth(t, fs, /700/.test(m[5]));
    const L = m[3] === "middle" ? x - w / 2 : m[3] === "end" ? x - w : x;
    const rc = { x: L, y: y - fs * 0.82, w, h: fs * 1.08 };
    if (rc.x < 0 || rc.x + rc.w > r.width || rc.y < 0 || rc.y + rc.h > r.height) bad.push(`밖: ${t}`);
    if (names.has(t)) continue;
    const ins = [];
    C.forEach(([cx, cy, rad], i) => {
      const far = Math.max(...[[rc.x, rc.y], [rc.x + rc.w, rc.y], [rc.x, rc.y + rc.h], [rc.x + rc.w, rc.y + rc.h]].map(([px, py]) => Math.hypot(px - cx, py - cy)));
      const near = Math.hypot(Math.max(rc.x - cx, 0, cx - rc.x - rc.w), Math.max(rc.y - cy, 0, cy - rc.y - rc.h));
      if (far <= rad) ins.push(ids[i]);
      else if (near < rad) bad.push(`원 ${ids[i]} 경계에 걸침: ${t}`);
    });
    const key = ins.sort().join("+");
    const rg = (s.regions || []).find((g) => [...g.sets].sort().join("+") === key);
    if (!rg || !rg.label.replace(/\s+/g, "").includes(t.replace(/\s+/g, ""))) bad.push(`엉뚱한 영역(${key}): ${t}`);
  }
  return bad;
}
{
  const v3 = [{ id: "a", label: "생물학적 요인" }, { id: "b", label: "심리적 요인" }, { id: "c", label: "사회문화적 요인" }];
  const all7 = (lab, nodes = v3) => ({ ...two, slug: "v", nodes, regions: [["a"], ["b"], ["c"], ["a", "b"], ["a", "c"], ["b", "c"], ["a", "b", "c"]].map((sets, i) => ({ sets, label: lab[i] })) });
  const cases = {
    short: all7(["유전", "인지", "문화", "기질", "건강행동", "사회학습", "통합"]),
    mid: all7(["유전 소인", "인지 처리", "문화 규범", "기질 특성", "건강 행동", "사회 학습", "통합 모형"]),
    longnames: all7(["유전", "인지", "문화", "기질", "건강", "학습", "통합"], [{ id: "a", label: "생물학적 요인과 유전적 소인" }, { id: "b", label: "심리적 요인과 인지 과정" }, { id: "c", label: "사회문화적 요인과 환경" }]),
    two: { ...two, regions: [{ sets: ["q"], label: "통계적 일반화와 가설 검증" }, { sets: ["l"], label: "맥락적 의미 해석과 심층 이해" }, { sets: ["q", "l"], label: "혼합 연구 설계 방법" }] },
    twolongnames: { ...two, nodes: [{ id: "q", label: "양적 연구 방법론의 실증주의 전통" }, { id: "l", label: "질적 연구 방법론의 해석주의 전통" }], regions: [] },
  };
  for (const [k, s] of Object.entries(cases)) {
    assert.deepStrictEqual(validateSpec(s), [], k);
    const r = renderSpec(s, { title: k });
    assert.deepStrictEqual(r.warnings, [], `${k}: ${r.warnings.join("; ")}`);
    assert.deepStrictEqual(regionCheck(s, r), [], k);
  }
  for (const s of [two, three]) assert.deepStrictEqual(regionCheck(s, renderSpec(s, { title: "t" })), [], s.slug);
  // 들어갈 자리가 없을 만큼 긴 라벨은 조용히 엉뚱한 곳에 두지 않고 경고
  const huge = all7(["유전과 신경 생리 그리고 내분비계의 복합적 작용", "인지", "문화", "기질", "건강", "학습", "통합"]);
  const r = renderSpec(huge, { title: "t" });
  assert.ok(r.warnings.some((w) => w.includes("영역 라벨이 영역에 들어가지 않음")), r.warnings.join("; "));
}
console.log("diagrams-venn: all tests passed");
