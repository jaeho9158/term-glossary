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

console.log("matchTerms: all tests passed");
