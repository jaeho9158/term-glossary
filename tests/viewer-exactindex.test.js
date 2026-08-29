// buildExactIndex는 PDF/텍스트 매칭의 입구다. 짧은 키·조사·모호한 일반어를
// 걸러내는 안전장치가 회귀하면 예전의 "격조사까지 하이라이트" 버그가 재발한다.
const assert = require("assert");
const { buildExactIndex } = require("../assets/viewer.js");

const mk = (slug, ko, en) => ({ slug, title_ko: ko, title_en: en });

// 정상: 한글 제목과 영문 제목이 정규화(소문자·공백/하이픈 제거)된 키로 들어간다
{
  const map = buildExactIndex([mk("p-value", "유의확률", "P-Value")]);
  assert.ok(map.has("유의확률"));
  assert.ok(map.has("pvalue"), "영문 키는 소문자화 + 하이픈 제거");
  assert.strictEqual(map.get("유의확률")[0].slug, "p-value");
}

// 경계: 1글자 키는 인덱스에서 제외 (조사·단음절 오탐 방지)
{
  const map = buildExactIndex([mk("ro", "로", "rho-x")]);
  assert.ok(!map.has("로"), "1글자 한글 제목은 인덱스 제외");
}

// 경계: 모호한 일반어 목록(예: "코어")은 한글 키에서 제외되지만 영문 키는 유지
{
  const map = buildExactIndex([mk("core", "코어", "Core")]);
  assert.ok(!map.has("코어"), "AMBIGUOUS_COMMON_WORD_TITLES 제외");
  assert.ok(map.has("core"), "영문 제목은 그대로 인덱싱");
}

// 경계: 같은 키에 같은 slug가 두 번 들어가지 않는다 (중복 방지)
{
  const t = mk("anova", "분산분석", "분산분석"); // ko/en 이 같은 키로 정규화되는 경우
  const map = buildExactIndex([t]);
  assert.strictEqual(map.get("분산분석").length, 1, "동일 slug 중복 제거");
}

// 실패: 제목이 없는 항목은 조용히 건너뛴다 (throw 금지)
{
  const map = buildExactIndex([{ slug: "empty" }, mk("ok", "상관관계", null)]);
  assert.ok(map.has("상관관계"));
  assert.strictEqual([...map.keys()].length, 1);
}

console.log("viewer-exactindex: all tests passed");
