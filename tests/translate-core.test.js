// tests/translate-core.test.js
// 번역 기능의 순수 로직. 모델 응답과 무관하게 결정론적으로 동작해야 하는 부분만 모았다.
const assert = require("assert");
const { truncateSelection, isLikelyEnglish, mergeGlossary, linkTerms } =
  require("../assets/translate-core.js");
const { matchTerms, escapeHtml } = require("../assets/viewer.js");

// ---- truncateSelection: 2,000자 상한, 문장 중간에서 자르지 않고 마지막 문장 경계로 후퇴 ----
{
  assert.strictEqual(truncateSelection("short text."), "short text.");
  const s = "Sentence one. " + "x".repeat(1470) + ". " + "y".repeat(500) + ". Sentence three.";
  const out = truncateSelection(s, 2000);
  assert.ok(out.length <= 2000);
  assert.ok(out.endsWith("."), "문장 경계에서 끝나야 함: " + out.slice(-10));
  // 문장 경계가 없는 긴 덩어리는 그냥 상한에서 자른다
  assert.strictEqual(truncateSelection("y".repeat(3000), 2000).length, 2000);
  assert.strictEqual(truncateSelection("", 2000), "");
  assert.strictEqual(truncateSelection(null, 2000), "");
}

// ---- isLikelyEnglish: 라틴 문자 비율 60% 기준, 최소 20자 ----
{
  assert.strictEqual(isLikelyEnglish("The p-value was below 0.05 in all three experimental conditions."), true);
  assert.strictEqual(isLikelyEnglish("본 연구는 유의확률이 0.05 미만인 경우를 유의하다고 보았다."), false);
  // 영문 논문 안의 짧은 한글 인용은 영어로 판정
  assert.strictEqual(isLikelyEnglish("We used the 표본크기 estimator described in Section 2 for the analysis."), true);
  // 숫자·기호만 있으면 영어 아님(번역할 게 없음)
  assert.strictEqual(isLikelyEnglish("12345 67890 ---- ==== 0.05 0.01"), false);
  assert.strictEqual(isLikelyEnglish("ok"), false, "20자 미만은 판정 불가 → false");
  assert.strictEqual(isLikelyEnglish(""), false);
}

// ---- mergeGlossary: 누적 병합, 충돌 시 먼저 확정된 역어 유지 ----
{
  const merged = mergeGlossary({ "p-value": "유의확률" }, { "anova": "분산분석", "p-value": "p값" });
  assert.deepStrictEqual(merged, { "p-value": "유의확률", "anova": "분산분석" });
  // 원본 불변
  const base = { a: "가" };
  mergeGlossary(base, { b: "나" });
  assert.deepStrictEqual(base, { a: "가" });
  // 빈 값·비문자열은 버린다
  assert.deepStrictEqual(mergeGlossary({}, { x: "", y: null, z: 3, ok: "좋음" }), { ok: "좋음" });
  assert.deepStrictEqual(mergeGlossary(null, undefined), {});
}

// ---- linkTerms: 사전 용어를 링크로 감싼다. 실제 matchTerms 결과를 그대로 먹인다 ----
{
  const terms = [
    { slug: "p-value", title_ko: "유의확률", title_en: "p-value", categories: ["stat"] },
    { slug: "anova", title_ko: "분산분석", title_en: "ANOVA", categories: ["stat"] },
  ];
  const text = "분산분석 결과 유의확률이 0.05 미만이었다. <script>alert(1)</script>";
  const html = linkTerms(text, matchTerms(text, terms), escapeHtml);
  assert.ok(html.includes('<a href="terms/anova.html" class="tr-term" target="_blank" rel="noopener">분산분석</a>'));
  assert.ok(html.includes('<a href="terms/p-value.html" class="tr-term" target="_blank" rel="noopener">유의확률</a>'));
  assert.ok(html.includes("&lt;script&gt;"), "링크 밖 텍스트도 이스케이프");
  assert.ok(!html.includes("<script>"), "원시 스크립트 태그 금지");
  // 매치가 없으면 이스케이프된 평문
  assert.strictEqual(linkTerms("a < b", [], escapeHtml), "a &lt; b");
  // 접두사 지정(뷰어는 사이트 루트에 있어 terms/ 지만 다른 경로에서도 쓸 수 있게)
  assert.ok(linkTerms(text, matchTerms(text, terms), escapeHtml, "../terms/").includes('href="../terms/anova.html"'));
}

console.log("translate-core: all tests passed");
