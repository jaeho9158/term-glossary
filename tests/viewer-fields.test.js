// 문서 분야 추정 → 패널 정렬(계획 3단계 2번). 철회된 a4cdbf8d6은 분야로
// "숨겨서" 문제였으므로, 여기서는 숨기지 않고 순서만 바꾼다는 것이 핵심이다.
const assert = require("assert");
const { estimateDocumentFields, groupMatchesByField } = require("../assets/viewer.js");

const m = (slug, cats, extra) => Object.assign({ slug, title_ko: slug, categories: cats, count: 1 }, extra || {});

// categories[0]만 센다(덤 태그까지 세면 논문 하나에 분야가 수십 개가 된다)
{
  const matches = [
    m("a", ["mech", "stat"]), m("b", ["mech"]), m("c", ["mech"]),
    m("d", ["mech"]), m("e", ["mech"]), m("f", ["mech"]),
    m("g", ["stat"]), m("h", ["stat"]), m("i", ["stat"]), m("j", ["stat"]),
    m("k", ["lit"]),
  ];
  assert.deepStrictEqual(estimateDocumentFields(matches), ["mech", "stat"]);
}

// 잡힌 용어가 적으면 분야를 정하지 않는다 — 표본이 안 되고, 잘못 접으면
// 정작 주제어가 "다른 분야"로 내려간다
{
  const matches = [m("a", ["mech"]), m("b", ["mech"]), m("c", ["stat"])];
  assert.deepStrictEqual(estimateDocumentFields(matches), []);
}

// 분야가 골고루 흩어져 상위 3개로도 절반을 못 덮으면 정하지 않는다
{
  const matches = [];
  "abcdefghijklmnop".split("").forEach((c, i) => matches.push(m(c, ["f" + (i % 8)])));
  assert.deepStrictEqual(estimateDocumentFields(matches), []);
}

// 최대 3개까지, 그리고 1위 대비 너무 작은 분야는 "주 분야"로 치지 않는다
{
  const matches = [];
  for (let i = 0; i < 20; i++) matches.push(m("a" + i, ["mech"]));
  for (let i = 0; i < 10; i++) matches.push(m("b" + i, ["stat"]));
  for (let i = 0; i < 6; i++) matches.push(m("c" + i, ["method"]));
  for (let i = 0; i < 4; i++) matches.push(m("d" + i, ["edu"]));
  matches.push(m("e", ["lit"])); // 1/20 — 곁가지
  assert.deepStrictEqual(estimateDocumentFields(matches), ["mech", "stat", "method"]);
}

// 빈 입력·분야 없는 용어에서 터지지 않는다
{
  assert.deepStrictEqual(estimateDocumentFields([]), []);
  assert.deepStrictEqual(estimateDocumentFields([m("a", [])]), []);
}

// 그룹 나누기: 주 분야가 앞, 나머지는 others로. 순서는 원본 순서를 지킨다.
{
  const matches = [m("a", ["mech"]), m("b", ["lit"]), m("c", ["mech"])];
  const grouped = groupMatchesByField(matches, ["mech"]);
  assert.deepStrictEqual(grouped.primary.map((x) => x.slug), ["a", "c"]);
  assert.deepStrictEqual(grouped.others.map((x) => x.slug), ["b"]);
}

// 기초 용어(nestedUnder)는 대표 용어를 따라간다 — 분야가 달라도 떼어놓지 않는다
{
  const matches = [m("long", ["mech"], { basics: ["short"] }), m("short", ["lit"], { nestedUnder: "long" })];
  const grouped = groupMatchesByField(matches, ["mech"]);
  assert.deepStrictEqual(grouped.primary.map((x) => x.slug), ["long", "short"]);
  assert.deepStrictEqual(grouped.others, []);
}

// 주 분야가 없으면(분야 정보 없음) 전부 primary — 아무것도 접지 않는다
{
  const matches = [m("a", []), m("b", [])];
  const grouped = groupMatchesByField(matches, []);
  assert.strictEqual(grouped.primary.length, 2);
  assert.strictEqual(grouped.others.length, 0);
}

console.log("estimateDocumentFields/groupMatchesByField: all tests passed");
