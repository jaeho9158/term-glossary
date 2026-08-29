// normalizeWord / extractWords 는 용어 매칭 파이프라인의 맨 앞 단계다.
// viewer.js에서 export되지 않아 추출 헬퍼로 테스트한다.
const assert = require("assert");
const { extract } = require("./helpers/extract-fn.js");

const { normalizeWord, extractWords } = extract("assets/viewer.js", {
  fns: ["normalizeWord", "extractWords"],
});

// 정상: 소문자화 + 공백·하이픈·언더스코어 제거
{
  assert.strictEqual(normalizeWord("P-Value"), "pvalue");
  assert.strictEqual(normalizeWord("표본 크기"), "표본크기");
  assert.strictEqual(normalizeWord("snake_case Word"), "snakecaseword");
}

// 경계: 이미 정규형이면 그대로
{
  assert.strictEqual(normalizeWord("anova"), "anova");
  assert.strictEqual(normalizeWord(""), "");
}

// 정상: 한글·영문·하이픈 연결어만 토큰으로, 중복 제거
{
  const words = Array.from(extractWords("유의확률(p-value)은 유의확률이다."));
  assert.ok(words.includes("유의확률"));
  assert.ok(words.includes("p-value"));
  assert.strictEqual(words.filter((w) => w === "유의확률").length, 1, "중복 제거");
}

// 경계: 숫자·기호만 있는 텍스트는 빈 목록 (throw 금지)
{
  assert.deepStrictEqual(Array.from(extractWords("123 !@# 456")), []);
  assert.deepStrictEqual(Array.from(extractWords("")), []);
}

console.log("viewer-normalize: all tests passed");
