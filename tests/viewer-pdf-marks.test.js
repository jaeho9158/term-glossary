const test = require("node:test");
const assert = require("node:assert");
const { buildExactIndex, findSpanTermSlugs } = require("../assets/viewer.js");

// PDF 텍스트 레이어는 span을 쪼개지 않고 span 자체에 표시를 얹으므로,
// 순수 로직은 "이 span 텍스트에 어떤 용어가 들어 있나"만 판단하면 된다.
const TERMS = [
  { slug: "p-value", title_ko: "유의확률", title_en: "p-value" },
  { slug: "correlation", title_ko: "상관관계", title_en: "correlation" },
  { slug: "regression", title_ko: "회귀분석", title_en: "regression" },
];
const index = buildExactIndex(TERMS);

test("span에 용어가 없으면 빈 배열", () => {
  assert.deepStrictEqual(findSpanTermSlugs("This sentence has nothing.", index), []);
  assert.deepStrictEqual(findSpanTermSlugs("", index), []);
});

test("영문 용어를 찾는다 (하이픈 포함)", () => {
  assert.deepStrictEqual(findSpanTermSlugs("We report the p-value here.", index), ["p-value"]);
});

test("한글 용어와 조사 결합형을 찾는다", () => {
  assert.deepStrictEqual(findSpanTermSlugs("상관관계가 높았다.", index), ["correlation"]);
});

test("한 span에 여러 용어가 있으면 나온 순서대로 준다", () => {
  assert.deepStrictEqual(
    findSpanTermSlugs("회귀분석 결과 correlation 과 p-value 를 보고한다.", index),
    ["regression", "correlation", "p-value"]
  );
});

test("같은 용어가 여러 번 나와도 한 번만 준다", () => {
  assert.deepStrictEqual(findSpanTermSlugs("p-value and p-value again", index), ["p-value"]);
});

test("allowedSlugs에 없는 용어(분석 전·숨긴 용어)는 표시하지 않는다", () => {
  const allowed = new Set(["p-value"]);
  assert.deepStrictEqual(
    findSpanTermSlugs("regression and p-value", index, allowed),
    ["p-value"]
  );
  assert.deepStrictEqual(findSpanTermSlugs("regression and p-value", index, new Set()), []);
});

test("인덱스가 없으면 빈 배열", () => {
  assert.deepStrictEqual(findSpanTermSlugs("p-value", null), []);
});
