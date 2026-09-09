// tests/apply-category-intro.test.js
// 에이전트가 쓴 분야 소개 문단을 그대로 믿지 않고 검증한다: 길이 범위,
// 하위분류 이름을 실제로 언급하는지(엉뚱한 분야 복붙 방지), 빈 값 거부.
const assert = require("assert");
const { validateIntro } = require("../scripts/apply-category-intro.js");

const item = { code: "stat", label: "통계", subcategories: ["추론통계·가설검정", "기술통계·확률분포"] };

// 정상: 길이 범위 안, 하위분류 이름 하나 이상 언급
{
  const ok = "통계는 평균과 분산 같은 값으로 데이터를 요약하고, 추론통계·가설검정처럼 표본에서 모집단을 추정하는 방법을 다룹니다. 회귀분석과 상관분석으로 변수 간의 관계를 파악하고, 다변량 분석 및 고급기법도 함께 다룹니다. 논문의 결과 섹션을 이해하고자 하는 독자가 주로 찾습니다.";
  const r = validateIntro(item, ok);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
}

// 실패: 너무 짧음(150자 미만)
{
  const r = validateIntro(item, "통계 용어를 모았습니다.");
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /길이/);
}

// 실패: 너무 김(320자 초과)
{
  const r = validateIntro(item, "가".repeat(321));
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /길이/);
}

// 실패: 하위분류 이름을 하나도 언급하지 않음
{
  const r = validateIntro(item, "이 분야는 매우 중요하고 다양한 곳에서 쓰이며 논문을 읽을 때 자주 등장하는 개념들을 폭넓게 다루고 있어 많은 독자들이 찾는 인기 있는 학술 분야입니다. 데이터 분석과 정보 활용은 현대 사회에서 점점 더 중요해지고 있으며, 모든 분야에 적용되는 핵심 도구가 되었습니다.");
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /하위분류/);
}

// 실패: HTML 태그 포함(원시 마크업 금지)
{
  const r = validateIntro(item, "통계는 <b>추론통계·가설검정</b>처럼 표본에서 모집단을 추정하는 방법과 평균·분산 같은 요약값을 다루는 분야입니다. 비모수 분석과 범주형 데이터 분석도 포함되며, 실험설계와 표본추출 방법론도 다룹니다. 결과 섹션의 숫자를 해석하려는 독자가 주로 찾는 내용을 담고 있습니다.");
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /태그/);
}

// 실패: 빈 값·비문자열
{
  assert.strictEqual(validateIntro(item, "").ok, false);
  assert.strictEqual(validateIntro(item, null).ok, false);
}

console.log("apply-category-intro: all tests passed");
