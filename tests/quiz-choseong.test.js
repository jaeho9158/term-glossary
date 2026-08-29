// 시간 경과 시 자동 공개되는 초성 힌트 변환. 한글 음절 → 초성 매핑이 틀리면
// 힌트가 오히려 오답을 유도한다.
const assert = require("assert");
const { toChoseong } = require("../assets/quiz-core.js");

// 정상: 일반 한글 용어
{
  assert.strictEqual(toChoseong("노외검출기"), "ㄴㅇㄱㅊㄱ");
  assert.strictEqual(toChoseong("유의확률"), "ㅇㅇㅎㄹ");
}

// 경계: 쌍자음 초성(ㄲ·ㄸ·ㅃ·ㅆ·ㅉ)이 정확히 매핑되는지
{
  assert.strictEqual(toChoseong("까따빠싸짜"), "ㄲㄸㅃㅆㅉ");
}

// 경계: 음절 범위 양끝 (가 = 0xAC00, 힣 = 0xD7A3)
{
  assert.strictEqual(toChoseong("가"), "ㄱ");
  assert.strictEqual(toChoseong("힣"), "ㅎ");
}

// 경계: 한글이 아닌 글자(영문·숫자·공백)는 그대로 통과
{
  assert.strictEqual(toChoseong("p값 2종"), "pㄱ 2ㅈ");
  assert.strictEqual(toChoseong("ANOVA"), "ANOVA");
}

// 실패: 빈 문자열은 빈 문자열
{
  assert.strictEqual(toChoseong(""), "");
}

console.log("quiz-choseong: all tests passed");
