const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractContentRegion,
  hashContent,
  resolveLastmod
} = require("../scripts/lib/sitemap-lastmod.js");

const page = (body, related = "<a href=\"a.html\">A</a>") => `<!DOCTYPE html>
<html><head><title>t</title></head><body>
<nav>menu</nav>
<main class="delay-1">
  <h1>용어</h1>
  <p>${body}</p>
  <h2>관련 용어</h2>
  <div class="related-terms">
    ${related}
  </div>
<nav class="term-pager" aria-label="용어 이전/다음"><a href="x.html">이전</a></nav>
</main>
<footer>f</footer></body></html>`;

test("관련 용어·페이저·본문 바깥은 해시에서 제외된다", () => {
  const base = hashContent(page("본문"));
  assert.equal(hashContent(page("본문", "<a href=\"b.html\">B</a>")), base);
  assert.equal(
    hashContent(page("본문").replace("<footer>f</footer>", "<footer>광고</footer>")),
    base
  );
  assert.notEqual(hashContent(page("본문이 바뀜")), base);
  assert.equal(extractContentRegion(page("x")).includes("related-terms"), false);
});

test("연구할Lab 단계 링크(aside.stage-link)는 해시에서 제외된다", () => {
  const base = hashContent(page("본문"));
  const aside =
    '<aside class="stage-link">\n  이 용어가 쓰이는 연구 단계 — ' +
    '<a href="https://www.yeonguhallab.kr/guide/methodology?utm_source=termglossary">연구할Lab 연구 설계 가이드 →</a>\n</aside>\n';
  const withAside = page("본문").replace('<nav class="term-pager"', aside + '<nav class="term-pager"');
  assert.notEqual(withAside, page("본문"));
  assert.equal(hashContent(withAside), base);
  assert.equal(extractContentRegion(withAside).includes("stage-link"), false);
  // 관련 용어 블록에 같은 분야 링크가 덧붙어도 해시는 그대로다.
  const moreRelated = page("본문", '<a href="a.html">A</a>\n    <a href="c.html" class="related-same-field">C</a>');
  assert.equal(hashContent(moreRelated), base);
  // aside 밖 본문이 바뀌면 여전히 감지한다.
  assert.notEqual(hashContent(withAside.replace("<p>본문</p>", "<p>본문2</p>")), base);
});

test("해시가 같으면 저장된 날짜를 유지하고, 바뀌면 오늘로 갱신한다", () => {
  const store = {};
  const opts = { today: "2026-09-23", fallbackDate: "2026-08-01" };
  const first = resolveLastmod(store, "s", page("v1"), opts);
  assert.deepEqual(first, { date: "2026-08-01", changed: true });
  const again = resolveLastmod(store, "s", page("v1"), opts);
  assert.deepEqual(again, { date: "2026-08-01", changed: false });
  const edited = resolveLastmod(store, "s", page("v2"), opts);
  assert.deepEqual(edited, { date: "2026-09-23", changed: true });
  assert.equal(store.s.date, "2026-09-23");
});

test("처음 보는 슬러그에 부트스트랩 날짜가 없으면 오늘을 쓴다", () => {
  const store = {};
  const r = resolveLastmod(store, "n", page("v"), { today: "2026-09-23" });
  assert.equal(r.date, "2026-09-23");
});
