// 사이트 공용 HTML 이스케이프. 페이지마다 복붙돼 있던 8개 구현을 하나로
// 통합한 단일 출처다 — 이스케이프 문자 집합이 파일마다 어긋나면 그 파일에만
// XSS 구멍이 생기므로, 새 스크립트는 반드시 이 파일을 로드해서 쓸 것.
// (치환 순서 중요: & 를 먼저 바꿔야 이중 이스케이프가 없다.
//  tests/viewer-escape.test.js 가 집합과 순서를 고정한다.)
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { escapeHtml };
}
