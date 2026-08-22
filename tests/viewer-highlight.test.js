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

// Test 4: overlap-suppressed term's slug is recorded in data-covers on the kept mark.
// (Previously exercised via the blind Korean prefix-matching heuristic — e.g.
// "분산분석" surfacing "분산" as a prefix hit — which was removed because it
// produced constant false positives on unrelated words sharing a 2-character
// prefix. Overlap suppression itself is still real without that heuristic:
// particle-stripping alone can yield two independent exact hits at the same
// start position — the word's own normalized form, and its particle-stripped
// form — when both happen to be dictionary keys.)
{
  const overlapTerms = [
    { slug: "sample-i", title_ko: "표본이", title_en: "", categories: ["stat"] },
    { slug: "sample", title_ko: "표본", title_en: "Sample", categories: ["stat"] },
  ];
  const text = "이 연구의 표본이 충분히 크다.";
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
  assert.ok(covers.includes("sample-i") && covers.includes("sample"), "data-covers should include both overlapping slugs");
}

console.log("buildHighlightedHtml: all tests passed");
