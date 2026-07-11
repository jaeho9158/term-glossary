const assert = require("assert");
const { matchTerms, buildHighlightedHtml } = require("../assets/viewer.js");

const terms = [
  { slug: "p-value", title_ko: "유의확률", title_en: "p-value", categories: ["stat"] },
  { slug: "correlation", title_ko: "상관관계", title_en: "Correlation", categories: ["stat"] },
];

// Test 1: wraps first occurrence of each matched term in <mark data-slug="...">
{
  const text = "유의확률이 낮으면 상관관계가 있다고 본다.";
  const matches = matchTerms(text, terms);
  const html = buildHighlightedHtml(text, matches);
  assert.ok(html.includes('data-slug="p-value"') && html.includes(">유의확률</mark>"), "p-value should be wrapped");
  assert.ok(html.includes('data-slug="correlation"') && html.includes(">상관관계</mark>"), "correlation should be wrapped");
}

// Test 2: escapes HTML special characters outside marks
{
  const text = "조건 a < b 이고 상관관계가 있다.";
  const matches = matchTerms(text, terms);
  const html = buildHighlightedHtml(text, matches);
  assert.ok(html.includes("a &lt; b"), "should escape < as &lt;");
  assert.ok(!html.includes("a < b"), "should not contain raw <");
}

// Test 3: only the first occurrence is wrapped, later ones stay plain text
{
  const text = "상관관계, 상관관계, 상관관계.";
  const matches = matchTerms(text, terms);
  const html = buildHighlightedHtml(text, matches);
  const markCount = (html.match(/<mark /g) || []).length;
  assert.strictEqual(markCount, 1, "only first occurrence should be wrapped");
}

// Test 4: overlap-suppressed term's slug is recorded in data-covers on the kept mark
{
  const overlapTerms = [
    { slug: "variance", title_ko: "분산", title_en: "Variance", categories: ["stat"] },
    { slug: "anova", title_ko: "분산분석", title_en: "ANOVA", categories: ["stat"] },
  ];
  const text = "이 연구는 분산분석 방법을 사용하였다.";
  const matches = matchTerms(text, overlapTerms);
  const html = buildHighlightedHtml(text, matches);

  const markCount = (html.match(/<mark /g) || []).length;
  assert.strictEqual(markCount, 1, "only one <mark> should exist for the overlapping position");

  const markMatch = html.match(/<mark[^>]*>/);
  assert.ok(markMatch, "a <mark> tag should exist");
  const markTag = markMatch[0];
  const coversMatch = markTag.match(/data-covers="([^"]*)"/);
  assert.ok(coversMatch, "data-covers attribute should exist");
  const covers = coversMatch[1].split(" ");
  assert.ok(covers.includes("variance"), "data-covers should include the suppressed slug 'variance'");
  assert.ok(covers.includes("anova"), "data-covers should include the kept slug 'anova'");
}

console.log("buildHighlightedHtml: all tests passed");
