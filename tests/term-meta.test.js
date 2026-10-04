const test = require("node:test");
const assert = require("node:assert");
const meta = require("../scripts/lib/term-meta.js");

const LABELS = { stat: "통계" };
const fixture = {
  slug: "p-value",
  title_ko: "p값",
  title_en: "p-value",
  aliases: ["유의확률"],
  categories: ["stat"],
  definition: "귀무가설이 참일 때 관측값 이상으로 극단적인 결과가 나올 확률입니다.",
};

const PAGE = [
  "<!DOCTYPE html><html><head>",
  '<title>t</title><link rel="canonical" href="https://termglossary.kr/terms/p-value.html">',
  "</head><body><main>",
  '<div class="related-terms"></div>',
  '<aside class="stage-link">x</aside>',
  "</main></body></html>",
].join("\n");

function ldOf(html) {
  const m = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.strictEqual(m.length, 1);
  return JSON.parse(m[0][1]);
}

test("buildJsonLd: DefinedTerm + BreadcrumbList 구조", () => {
  const ld = meta.buildJsonLd(fixture, { categoryLabels: LABELS, date: "2026-09-01" });
  const [dt, bc] = ld["@graph"];
  assert.strictEqual(dt["@type"], "DefinedTerm");
  assert.strictEqual(dt.name, "p값");
  assert.deepStrictEqual(dt.alternateName, ["p-value", "유의확률"]);
  assert.strictEqual(dt.url, "https://termglossary.kr/terms/p-value.html");
  assert.strictEqual(dt.dateModified, "2026-09-01");
  assert.strictEqual(dt.inDefinedTermSet.name, "논문용어사전");
  assert.deepStrictEqual(bc.itemListElement.map((i) => i.name), ["홈", "통계", "p값"]);
  assert.strictEqual(bc.itemListElement[1].item, "https://termglossary.kr/category.html?cat=stat");
});

test("날짜 없으면 dateModified 생략, 정의는 300자 이내", () => {
  const ld = meta.buildJsonLd({ ...fixture, definition: "가".repeat(500) }, { categoryLabels: LABELS });
  const dt = ld["@graph"][0];
  assert.ok(!("dateModified" in dt));
  assert.ok(Array.from(dt.description).length <= 300);
});

test("따옴표와 </script>가 든 제목도 JSON·HTML이 깨지지 않는다", () => {
  const evil = { ...fixture, title_ko: 'a"b</script><b>', title_en: "x</script>y" };
  const html = meta.applyTermMeta(PAGE, evil, { categoryLabels: LABELS, date: "2026-09-01" });
  const ld = ldOf(html); // 파싱되면 </script>가 블록을 끊지 않았다는 뜻
  assert.strictEqual(ld["@graph"][0].name, 'a"b</script><b>');
  const headBlock = html.slice(html.indexOf("<!-- term-meta:start -->"), html.indexOf("<!-- term-meta:end -->"));
  assert.strictEqual((headBlock.match(/<\/script>/g) || []).length, 1);
  assert.ok(headBlock.includes("<\\/script>"));
  assert.ok(headBlock.includes('content="a&quot;b&lt;/script&gt;&lt;b&gt; (x&lt;/script&gt;y) - 논문용어사전"'));
});

test("og 설명은 150자 이내, 이미지·카드 태그 포함", () => {
  const html = meta.applyTermMeta(PAGE, { ...fixture, definition: "나".repeat(400) }, { date: "2026-09-01" });
  const og = html.match(/property="og:description" content="([^"]*)"/)[1];
  assert.ok(Array.from(og).length <= 150);
  assert.match(html, /property="og:image" content="https:\/\/termglossary\.kr\/assets\/og-default\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /property="og:locale" content="ko_KR"/);
});

test("최종 수정 줄은 넣지 않고, 예전에 넣은 줄은 지운다", () => {
  const withDate = meta.applyTermMeta(PAGE, fixture, { date: "2026-09-01" });
  assert.ok(!withDate.includes("term-updated"));
  const old = PAGE.replace('<aside class="stage-link"', '<!-- term-updated:start --><p class="term-updated">최종 수정</p><!-- term-updated:end --><aside class="stage-link"');
  assert.ok(!meta.applyTermMeta(old, fixture, { date: "2026-09-01" }).includes("term-updated"));
});

test("멱등: 두 번 적용해도 동일하고, 날짜가 바뀌면 교체된다", () => {
  const opts = { categoryLabels: LABELS, date: "2026-09-01" };
  const once = meta.applyTermMeta(PAGE, fixture, opts);
  const twice = meta.applyTermMeta(once, fixture, opts);
  assert.strictEqual(twice, once);
  const newer = meta.applyTermMeta(once, fixture, { ...opts, date: "2026-10-01" });
  assert.strictEqual((newer.match(/term-meta:start/g) || []).length, 1);
  assert.ok(newer.includes("2026-10-01") && !newer.includes("2026-09-01"));
  assert.strictEqual(meta.stripTermMeta(once), PAGE);
});

test("리다이렉트 스텁은 건드리지 않는다", () => {
  const stub =
    '<html><head><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=a.html">' +
    '<link rel="canonical" href="https://termglossary.kr/terms/a.html"></head><body></body></html>';
  assert.strictEqual(meta.isStub(stub), true);
  assert.strictEqual(meta.applyTermMeta(stub, fixture, { date: "2026-09-01" }), null);
  assert.strictEqual(meta.isStub(PAGE), false);
});

test("최상위 페이지: 기존 OG는 보존하고 빠진 것만 추가, 멱등", () => {
  const top =
    '<html><head><title>소개 &amp; 안내 - 논문용어사전</title><meta name="description" content="설명">' +
    '<link rel="canonical" href="https://termglossary.kr/about.html">' +
    '<meta property="og:title" content="기존 제목"></head><body></body></html>';
  const out = meta.applyPageMeta(top);
  assert.strictEqual((out.match(/property="og:title"/g) || []).length, 1);
  assert.match(out, /property="og:type" content="website"/);
  assert.match(out, /property="og:url" content="https:\/\/termglossary\.kr\/about\.html"/);
  assert.strictEqual(meta.applyPageMeta(out), out);
});
