// scripts/compare-page-core.js
// 비교 페이지 조립에 쓰는 순수 로직. DOM·파일시스템 없음 —
// scripts/build-compare-page.js가 이 함수들의 출력을 조합해 최종 HTML을 만든다.

// 두 슬러그로 결정론적 파일명을 만든다. 입력 순서와 무관하게 항상 같은 파일명이
// 나와야 같은 짝을 두 번 다른 이름으로 만드는 사고가 안 생긴다.
function pairSlug(slugA, slugB) {
  const [a, b] = [slugA, slugB].sort((x, y) => x.localeCompare(y));
  return `${a}-vs-${b}`;
}

function renderComparisonRow(row, escapeHtml) {
  return `      <tr><th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(row.a)}</td><td>${escapeHtml(row.b)}</td></tr>`;
}

function renderComparisonTable(rows, escapeHtml) {
  return rows.map((r) => renderComparisonRow(r, escapeHtml)).join("\n");
}

module.exports = { pairSlug, renderComparisonRow, renderComparisonTable };
