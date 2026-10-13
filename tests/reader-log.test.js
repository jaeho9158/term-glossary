const test = require("node:test");
const assert = require("node:assert");
const { termCountBucket, historyTitle, createThrottle } = require("../assets/reader/log.js");
const { buildHighlightedHtml } = require("../assets/term-match.js");

test("termCountBucket: GA에는 용어 수 구간만 보낸다", () => {
  assert.strictEqual(termCountBucket(0), "0");
  assert.strictEqual(termCountBucket(1), "1-10");
  assert.strictEqual(termCountBucket(10), "1-10");
  assert.strictEqual(termCountBucket(11), "11-50");
  assert.strictEqual(termCountBucket(50), "11-50");
  assert.strictEqual(termCountBucket(51), "50+");
});

test("historyTitle: PDF는 파일 이름, 붙여넣은 글은 앞 40자(옛 뷰어와 같은 모양)", () => {
  assert.strictEqual(historyTitle("논문.pdf", "무시"), "논문.pdf...");
  assert.strictEqual(historyTitle("", "  " + "가".repeat(60)), "가".repeat(40) + "...");
  assert.strictEqual(historyTitle("", ""), "...");
});

test("createThrottle: 30초 안의 두 번째 호출은 막는다", () => {
  let t = 100000;
  const allow = createThrottle(30000, () => t);
  assert.strictEqual(allow(), true);
  t += 29999;
  assert.strictEqual(allow(), false);
  t += 1;
  assert.strictEqual(allow(), true);
});

test("붙여넣기 강조 HTML: 글에 든 마크업은 이스케이프된다", () => {
  const text = "<img src=x onerror=alert(1)> 회귀분석 & <b>x</b>";
  const html = buildHighlightedHtml(text, [{ slug: "regression", firstStart: text.indexOf("회귀분석"), firstLength: 4, count: 1 }]);
  assert.ok(!/<img|<b>/.test(html));
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&amp;"));
  assert.ok(html.includes('<mark class="dict-mark" data-slug="regression"'));
});
