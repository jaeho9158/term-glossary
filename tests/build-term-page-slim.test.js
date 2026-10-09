const test = require("node:test");
const assert = require("node:assert/strict");
const { renderTermPage, buildContext } = require("../scripts/build-term-page.js");
const { verifySlim, slimPage } = require("../scripts/lib/slim-term-page.js");

const term = {
  slug: "slim-fixture-term",
  title_ko: "슬림시험용어",
  title_en: "Slim Fixture Term",
  aliases: [],
  categories: ["stat"],
  definition: "슬림 변환이 새 페이지에도 적용되는지 확인하기 위한 시험용 정의입니다.",
  easy: "시험용 쉬운 풀이입니다.",
  why: "시험용 중요성 설명입니다.",
  examples: [{ sentence: "시험 문장", explanation: "시험 해설입니다." }],
  deeper: "시험용 심화 설명입니다.",
  caution: "시험용 주의점입니다.",
  related: [],
};

test("renderTermPage: 새 페이지는 슬림으로 나오고(메모리에서만 렌더), 재변환해도 그대로다", () => {
  const html = renderTermPage(term, buildContext([term]));
  assert.ok(html.includes('<script src="../assets/site-head.js"></script>'));
  assert.ok(!html.includes("window.dataLayer"));
  assert.ok(!html.includes("localStorage.getItem"));
  for (const s of ["<!-- GA4 analytics:start -->", "<!-- theme-init:start -->", "<!-- AdSense:start -->", "googletagmanager.com/gtag/js?id=", "adsbygoogle.js?client=", "<!-- term-meta:start -->", '<link rel="canonical" href="https://termglossary.kr/terms/slim-fixture-term.html">']) {
    assert.ok(html.includes(s), s);
  }
  assert.equal(slimPage(html).html, html);
  assert.deepEqual(verifySlim(html, html), []);
});
