const assert = require("assert");
const { pairSlug, renderComparisonRow, renderComparisonTable } =
  require("../scripts/compare-page-core.js");
const { escapeHtml } = require("../assets/escape.js");

// 정상: 입력 순서와 무관하게 항상 같은 파일명(알파벳 순 고정)
{
  assert.strictEqual(pairSlug("t-test", "anova"), "anova-vs-t-test");
  assert.strictEqual(pairSlug("anova", "t-test"), "anova-vs-t-test");
}

// 경계: 같은 슬러그를 두 번 넣어도 죽지 않음(호출부 실수 방어)
{
  assert.strictEqual(pairSlug("a", "a"), "a-vs-a");
}

// 정상: 한 행 렌더링, 이스케이프 적용
{
  const row = { label: "비교 <기준>", a: "값A", b: "값B" };
  const html = renderComparisonRow(row, escapeHtml);
  assert.ok(html.includes("&lt;기준&gt;"));
  assert.ok(html.includes("<th scope=\"row\">"));
  assert.ok(html.includes("<td>값A</td>"));
}

// 정상: 여러 행 결합, 빈 배열은 빈 문자열
{
  const rows = [{ label: "l1", a: "a1", b: "b1" }, { label: "l2", a: "a2", b: "b2" }];
  const html = renderComparisonTable(rows, escapeHtml);
  assert.strictEqual((html.match(/<tr>/g) || []).length, 2);
  assert.strictEqual(renderComparisonTable([], escapeHtml), "");
}

console.log("compare-page-core: all tests passed");
