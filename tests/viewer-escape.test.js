// escapeHtml은 사용자가 붙여넣은 논문 텍스트가 통과하는 XSS 최종 방어선인데
// 지금까지 직접 테스트가 없었다. 정상/경계/실패(악성 입력) 케이스를 고정한다.
const assert = require("assert");
const { escapeHtml } = require("../assets/viewer.js");

// 정상: 특수문자 없는 텍스트는 그대로
{
  assert.strictEqual(escapeHtml("유의확률 p-value 0.05"), "유의확률 p-value 0.05");
  assert.strictEqual(escapeHtml(""), "");
}

// 경계: 다섯 가지 위험 문자 전부 개별 치환
{
  assert.strictEqual(escapeHtml("&"), "&amp;");
  assert.strictEqual(escapeHtml("<"), "&lt;");
  assert.strictEqual(escapeHtml(">"), "&gt;");
  assert.strictEqual(escapeHtml('"'), "&quot;");
  assert.strictEqual(escapeHtml("'"), "&#39;");
}

// 경계: & 를 먼저 치환해야 이중 이스케이프가 안 생긴다 (치환 순서 회귀 방지)
{
  assert.strictEqual(escapeHtml("&lt;"), "&amp;lt;");
  assert.strictEqual(escapeHtml("a<b&c>d"), "a&lt;b&amp;c&gt;d");
}

// 실패(악성): 스크립트/속성 주입 페이로드가 무해한 텍스트가 되는지
{
  const out = escapeHtml('<script>alert("x")</script>');
  assert.ok(!out.includes("<script"), "script tag must not survive");
  assert.strictEqual(out, "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");

  const attr = escapeHtml('" onmouseover="steal()');
  assert.ok(!attr.includes('"'), "raw double quote must not survive for attribute contexts");
}

console.log("viewer-escape: all tests passed");
