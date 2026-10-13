const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { assetVersionFromSrc, withAssetVersion } = require("../assets/term-match.js");
const { stampHtml, computeViewerVersion } = require("../scripts/stamp-viewer-version.js");

test("assetVersionFromSrc: script src의 v 파라미터를 읽는다", () => {
  assert.strictEqual(assetVersionFromSrc("https://x.kr/assets/reader/terms-layer.js?v=abc123"), "abc123");
  assert.strictEqual(assetVersionFromSrc("https://x.kr/assets/reader/terms-layer.js"), "");
  assert.strictEqual(assetVersionFromSrc(""), "");
  assert.strictEqual(assetVersionFromSrc(undefined), "");
});

test("withAssetVersion: 버전이 있을 때만 ?v= 를 붙인다", () => {
  assert.strictEqual(withAssetVersion("viewer-defs/007.json", "abc"), "viewer-defs/007.json?v=abc");
  assert.strictEqual(withAssetVersion("viewer-index.json", ""), "viewer-index.json");
  assert.strictEqual(withAssetVersion("a.json?x=1", "abc"), "a.json?x=1&v=abc");
});

test("stampHtml: 리더 자산 태그에 같은 버전을 찍고 다시 찍으면 교체한다", () => {
  const html = [
    '<link rel="stylesheet" href="assets/reader/reader.css">',
    '<script src="assets/viewer-storage.js"></script>',
    '<script src="assets/term-match.js"></script>',
    '<script src="assets/reader/doc.js?v=old"></script>',
    '<script src="assets/reader/paste.js"></script>',
    '<script src="assets/escape.js"></script>',
  ].join("\n");
  const once = stampHtml(html, "aaa");
  assert.ok(once.includes('href="assets/reader/reader.css?v=aaa"'));
  assert.ok(once.includes('src="assets/term-match.js?v=aaa"'));
  assert.ok(once.includes('src="assets/viewer-storage.js?v=aaa"'));
  assert.ok(once.includes('src="assets/reader/doc.js?v=aaa"'));
  assert.ok(once.includes('src="assets/reader/paste.js?v=aaa"'));
  assert.ok(once.includes('src="assets/escape.js"'));
  assert.ok(stampHtml(once, "bbb").includes('doc.js?v=bbb"'));
  const imp = stampHtml('<script src="assets/term-match.js"></script>import("./assets/pdf-annotations.js")', "aaa");
  assert.ok(imp.includes('import("./assets/pdf-annotations.js?v=aaa")'));
  assert.ok(stampHtml(imp, "bbb").includes('pdf-annotations.js?v=bbb")'));
  assert.throws(() => stampHtml("<p></p>", "x"));
});

// 코드·생성물을 바꾸고 재스탬프를 빠뜨리면 브라우저가 옛 캐시를 쓴다.
const html = fs.readFileSync(path.join(__dirname, "..", "viewer.html"), "utf8");

test("viewer.html의 자산 스탬프가 현재 computeViewerVersion()과 같다", () => {
  const want = computeViewerVersion();
  const tm = html.match(/assets\/term-match\.js\?v=([^"'&]+)/);
  assert.ok(tm, "viewer.html에 term-match.js?v= 스탬프가 없다: node scripts/stamp-viewer-version.js 로 다시 찍을 것");
  assert.strictEqual(tm[1], want, "node scripts/stamp-viewer-version.js 로 다시 찍을 것");
  const tags = html.match(/(?:src|href)="assets\/(?:reader\/[\w-]+\.(?:js|css)|term-match\.js|viewer-storage\.js)[^"]*"/g) || [];
  assert.ok(tags.length > 0, "viewer.html에 assets/reader/ 태그가 없다");
  tags.forEach((t) => assert.ok(t.endsWith("?v=" + want + '"'), t + " 의 버전이 다르다: node scripts/stamp-viewer-version.js 로 다시 찍을 것"));
});

test("viewer.html의 pdf-annotations import 에 현재 버전이 붙는다", () => {
  assert.ok(html.includes('import("./assets/pdf-annotations.js?v=' + computeViewerVersion() + '")'));
});

test("viewer.html은 리더 스크립트를 모두 싣는다(paste·log 포함)", () => {
  fs.readdirSync(path.join(__dirname, "..", "assets", "reader"))
    .filter((n) => /\.(js|css)$/.test(n))
    .forEach((n) => assert.ok(html.includes('assets/reader/' + n + '?v='), n + " 태그가 viewer.html에 없다"));
});

test("옛 뷰어 스크립트는 더 이상 없다", () => {
  assert.ok(!fs.existsSync(path.join(__dirname, "..", "assets", "viewer.js")));
  assert.ok(!/assets\/viewer\.js/.test(html));
  assert.ok(!/name="robots"[^>]*noindex/.test(html), "viewer.html은 색인 대상이다");
});
