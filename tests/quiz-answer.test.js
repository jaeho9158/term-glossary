// 주관식 퀴즈 채점 — 사용자가 타이핑한 답을 직접 판정하는 유일한 지점.
// 오판정은 사용자 신뢰에 직결되는데 지금까지 테스트가 없었다.
const assert = require("assert");
const { extract } = require("./helpers/extract-fn.js");

const { normalizeAnswer, acceptedAnswers } = extract("assets/quiz.js", {
  fns: ["normalizeAnswer", "acceptedAnswers"],
});

// 정상: 대소문자·공백·하이픈·가운뎃점·괄호 차이 무시
{
  assert.strictEqual(normalizeAnswer("P Value"), "pvalue");
  assert.strictEqual(normalizeAnswer("p-value"), "pvalue");
  assert.strictEqual(normalizeAnswer("표본 크기"), "표본크기");
  assert.strictEqual(normalizeAnswer("가·나 (다)"), "가나다");
}

// 경계/실패: null·undefined·숫자·빈 문자열에도 throw 없이 문자열 반환
{
  assert.strictEqual(normalizeAnswer(null), "");
  assert.strictEqual(normalizeAnswer(undefined), "");
  assert.strictEqual(normalizeAnswer(""), "");
  assert.strictEqual(normalizeAnswer(0), ""); // falsy 숫자는 빈 답 취급
}

const term = {
  title_ko: "유의확률",
  title_en: "p-value",
  aliases: ["유의 확률", "P값"],
};

// 정상: 한글명·영문명·별칭 전부 정답 인정
{
  const ok = acceptedAnswers(term);
  assert.ok(ok.has(normalizeAnswer("유의확률")));
  assert.ok(ok.has(normalizeAnswer("P VALUE")));
  assert.ok(ok.has(normalizeAnswer("p값")));
}

// 경계: 별칭 없음 / 영문명 없음이어도 동작
{
  const ok = acceptedAnswers({ title_ko: "상관관계" });
  assert.ok(ok.has("상관관계"));
  assert.strictEqual(ok.size, 1, "빈 값은 정답 집합에 들어가면 안 됨");
}

// 실패: 오답·빈 답은 정답 집합에 없어야 함
{
  const ok = acceptedAnswers(term);
  assert.ok(!ok.has(normalizeAnswer("상관관계")));
  assert.ok(!ok.has(""), "빈 문자열이 정답으로 통하면 빈 제출이 정답 처리됨");
}

console.log("quiz-answer: all tests passed");
