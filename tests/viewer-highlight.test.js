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
  assert.ok(html.includes('<mark data-slug="p-value">유의확률</mark>'), "p-value should be wrapped");
  assert.ok(html.includes('<mark data-slug="correlation">상관관계</mark>'), "correlation should be wrapped");
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

console.log("buildHighlightedHtml: all tests passed");
