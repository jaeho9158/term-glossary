const assert = require("assert");
const { validateComparePair } = require("../scripts/apply-compare-pairs.js");

const terms = [
  { slug: "t-test", title_ko: "t검정", title_en: "t-test", categories: ["stat"], subcategory: "추론통계·가설검정" },
  { slug: "anova", title_ko: "분산분석(ANOVA)", title_en: "ANOVA", categories: ["stat"], subcategory: "추론통계·가설검정" },
  { slug: "regression", title_ko: "회귀분석", title_en: "Regression", categories: ["stat"], subcategory: "회귀·상관분석" },
];

const good = {
  slugA: "t-test", slugB: "anova", titleA: "t검정", titleB: "분산분석(ANOVA)",
  headline: "핵심 차이 한 줄", whenA: "설명", whenB: "설명", confusion: "설명",
  rows: [
    { label: "비교 집단 수", a: "2개", b: "3개 이상" },
    { label: "검정 통계량", a: "t", b: "F" },
    { label: "귀무가설", a: "두 평균이 같다", b: "모든 평균이 같다" },
    { label: "사용 예시", a: "실험군·대조군 비교", b: "세 그룹 이상 비교" },
  ],
};

// 정상
{
  const r = validateComparePair(good, terms);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
}

// 실패: 존재하지 않는 슬러그
{
  const r = validateComparePair({ ...good, slugB: "no-such-term" }, terms);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /존재하지 않는/);
}

// 실패: 하위분류가 다름
{
  const r = validateComparePair({ ...good, slugB: "regression" }, terms);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /하위분류/);
}

// 실패: 제목 불일치(오타 방지)
{
  const r = validateComparePair({ ...good, titleA: "T검증" }, terms);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /제목/);
}

// 실패: 행 개수가 4개가 아님
{
  const r = validateComparePair({ ...good, rows: good.rows.slice(0, 2) }, terms);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /행/);
}

// 실패: 빈 필드
{
  const r = validateComparePair({ ...good, headline: "" }, terms);
  assert.strictEqual(r.ok, false);
}

console.log("apply-compare-pairs: all tests passed");
