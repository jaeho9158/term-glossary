const assert = require("assert");
const { matchTerms } = require("../assets/viewer.js");

const terms = [
  { slug: "p-value", title_ko: "유의확률", title_en: "p-value", categories: ["stat"] },
  { slug: "correlation", title_ko: "상관관계", title_en: "Correlation", categories: ["stat"] },
  { slug: "anova", title_ko: "분산분석", title_en: "ANOVA", categories: ["stat"] },
];

// Test 1: matches Korean and English occurrences, counts both, skips non-matches
{
  const text = "이 연구는 유의확률(p-value)이 0.05 미만일 때 상관관계가 유의하다고 보았다. 상관관계 분석을 두 번 반복했다.";
  const result = matchTerms(text, terms);
  assert.strictEqual(result.length, 2, "should match exactly 2 distinct terms");
  const bySlug = Object.fromEntries(result.map((r) => [r.slug, r]));
  assert.strictEqual(bySlug["p-value"].count, 2, "p-value: 유의확률 + p-value = 2 occurrences");
  assert.strictEqual(bySlug["correlation"].count, 2, "correlation: 상관관계 appears twice");
  assert.strictEqual(bySlug["anova"], undefined, "anova should not match (not present in text)");
}

// Test 2: results sorted by count descending
{
  const text = "상관관계, 상관관계, 상관관계는 유의확률과 다르다.";
  const result = matchTerms(text, terms);
  assert.strictEqual(result[0].slug, "correlation", "correlation (count 3) should sort first");
  assert.ok(result[0].count > result[1].count, "first result should have higher count than second");
}

// Test 3: English matching uses word boundaries, no partial-word match
{
  const text = "ANOVAtest is not the same as ANOVA test.";
  const result = matchTerms(text, terms);
  const anova = result.find((r) => r.slug === "anova");
  assert.strictEqual(anova.count, 1, "ANOVAtest must not count; only 'ANOVA test' counts");
}

// Test 4: firstStart/firstLength point at the earliest occurrence
{
  const text = "먼저 상관관계, 그리고 Correlation.";
  const result = matchTerms(text, terms);
  const correlation = result.find((r) => r.slug === "correlation");
  assert.strictEqual(text.slice(correlation.firstStart, correlation.firstStart + correlation.firstLength), "상관관계");
}

// Test 5: matchTerms carries the `definition` field through from the input term
{
  const termsWithDefs = [
    { slug: "p-value", title_ko: "유의확률", title_en: "p-value", categories: ["stat"], definition: "우연히 나왔을 가능성을 나타내는 숫자입니다." },
  ];
  const text = "유의확률이 중요하다.";
  const result = matchTerms(text, termsWithDefs);
  assert.strictEqual(result[0].definition, "우연히 나왔을 가능성을 나타내는 숫자입니다.", "matchTerms should carry the definition field through to its output");
}

// Test 6: a dictionary entry that is itself a bare Korean particle (e.g. a
// term whose title_ko happens to be "로") must never match ordinary
// particle-attached words in unrelated text — see rho-option/"로" bug.
{
  const termsWithParticle = [
    { slug: "rho-option", title_ko: "로", title_en: "Rho", categories: ["finance"] },
    { slug: "correlation", title_ko: "상관관계", title_en: "Correlation", categories: ["stat"] },
  ];
  const text = "95%로 나타났다. 그래프로 표현하면 상관관계가 뚜렷하게 보인다.";
  const result = matchTerms(text, termsWithParticle);
  const rho = result.find((r) => r.slug === "rho-option");
  assert.strictEqual(rho, undefined, "bare-particle dictionary entry must not match particle occurrences in text");
}

// Test 7: an unrelated Korean word must not match a dictionary term just
// because it shares a 2-character prefix with it. "불성실" (insincere) is
// not a compound of "불성" (Buddha-nature) — sharing a prefix is
// coincidence, not a real relationship, and highlighting it as a hit is a
// false positive the user sees as "random" highlighting.
{
  const termsWithShortEntry = [
    { slug: "buddha-nature", title_ko: "불성", title_en: "Buddha-nature", categories: ["religion"] },
  ];
  const text = "응답자 중 불성실 응답을 제외한 285부를 최종 분석에 사용하였다.";
  const result = matchTerms(text, termsWithShortEntry);
  assert.strictEqual(result.length, 0, "'불성실' must not prefix-match the unrelated term '불성'");
}

// Test 8: a curated ambiguous-common-word title (e.g. "단가", the everyday
// business word for "unit price", also used as the title of a niche pansori
// music term) must not exact-match its everyday sense in unrelated text.
{
  const termsWithAmbiguous = [
    { slug: "danga-pansori", title_ko: "단가", title_en: "Danga (Pansori Prelude Song)", categories: ["lit"] },
    { slug: "correlation", title_ko: "상관관계", title_en: "Correlation", categories: ["stat"] },
  ];
  const text = "항목별 단가는 다음과 같으며, 상관관계 분석 결과도 함께 제시한다.";
  const result = matchTerms(text, termsWithAmbiguous);
  const danga = result.find((r) => r.slug === "danga-pansori");
  assert.strictEqual(danga, undefined, "curated ambiguous-common-word title must not match its everyday sense");
  assert.ok(result.some((r) => r.slug === "correlation"), "unrelated real matches should still work");
}

// Test 9: further curated ambiguous-common-word titles found via a follow-up
// audit — each is a narrow-domain term (archaeology/criminology/social work/
// forestry/music/translation) whose title is also a much more common
// everyday word, confirmed by testing against unrelated sample text.
{
  const ambiguousTitles = [
    ["archaeological-phase", "단계"],
    ["robbery", "강도"],
    ["setting-literary", "배경"],
    ["point-of-view", "시점"],
    ["forest-regeneration", "갱신"],
    ["resolution", "해결"],
    ["distortion-in-interpreting", "왜곡"],
  ];
  const dummyTerms = ambiguousTitles.map(([slug, title_ko]) => ({
    slug,
    title_ko,
    title_en: slug,
    categories: ["x"],
  }));
  const text = "운동 강도를 3단계로 나누었고, 연구 배경과 측정 시점을 명시하였으며, 계약을 갱신하고 문제를 해결하였으나 정보 왜곡은 없었다.";
  const result = matchTerms(text, dummyTerms);
  assert.strictEqual(result.length, 0, "none of the curated ambiguous-common-word titles should match their everyday sense");
}

// Test 10: full-site follow-up audit (all 103 categories) — a further batch
// of curated ambiguous-common-word titles, one representative pick per
// source category so a regression in any of the five audit batches is caught.
{
  const ambiguousTitles = [
    ["sahyo", "사료"], // history — "animal feed" in ordinary text
    ["claim-right", "채권"], // law — "bonds" in ordinary/finance text
    ["assimilation", "동화"], // childdev — "fairy tale" in ordinary text
    ["force-of-interest", "이력"], // actuarial — "history/record" in ordinary text
    ["link-robot", "링크"], // robotics — a web hyperlink in ordinary text
  ];
  const dummyTerms = ambiguousTitles.map(([slug, title_ko]) => ({
    slug,
    title_ko,
    title_en: slug,
    categories: ["x"],
  }));
  const text = "강아지 사료를 샀고, 회사채 채권을 발행했으며, 아이는 동화를 좋아하고, 검색 이력을 분석했고, 아래 링크를 클릭했다.";
  const result = matchTerms(text, dummyTerms);
  assert.strictEqual(result.length, 0, "none of this audit batch's curated ambiguous-common-word titles should match their everyday sense");
}

console.log("matchTerms: all tests passed");
