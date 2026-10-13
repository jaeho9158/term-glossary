const test = require("node:test");
const assert = require("node:assert");
const { assetVersionFromSrc, withAssetVersion } = require("../assets/term-match.js");
const { stampHtml } = require("../scripts/stamp-viewer-version.js");

test("assetVersionFromSrc: script src의 v 파라미터를 읽는다", () => {
  assert.strictEqual(assetVersionFromSrc("https://x.kr/assets/viewer.js?v=abc123"), "abc123");
  assert.strictEqual(assetVersionFromSrc("https://x.kr/assets/viewer.js"), "");
  assert.strictEqual(assetVersionFromSrc(""), "");
  assert.strictEqual(assetVersionFromSrc(undefined), "");
});

test("withAssetVersion: 버전이 있을 때만 ?v= 를 붙인다", () => {
  assert.strictEqual(withAssetVersion("viewer-defs/007.json", "abc"), "viewer-defs/007.json?v=abc");
  assert.strictEqual(withAssetVersion("viewer-index.json", ""), "viewer-index.json");
  assert.strictEqual(withAssetVersion("a.json?x=1", "abc"), "a.json?x=1&v=abc");
});

test("stampHtml: viewer.js 로드에 버전을 찍고, 다시 찍으면 교체한다", () => {
  const html = '<script src="assets/viewer-storage.js"></script>\n<script src="assets/term-match.js"></script>\n<script src="assets/viewer.js"></script>';
  const once = stampHtml(html, "aaa");
  assert.ok(once.includes('<script src="assets/viewer.js?v=aaa"></script>'));
  assert.ok(once.includes('<script src="assets/viewer-storage.js"></script>'));
  assert.ok(stampHtml(once, "bbb").includes('assets/viewer.js?v=bbb"'));
  assert.throws(() => stampHtml("<p></p>", "x"));
});

// 리뷰 항목 4: viewer.js·생성물을 바꾸고 재스탬프를 빠뜨리면 브라우저가 옛 캐시를 쓴다.
test("viewer.html의 ?v= 스탬프가 현재 computeViewerVersion()과 같다", () => {
  const fs = require("fs");
  const path = require("path");
  const { computeViewerVersion } = require("../scripts/stamp-viewer-version.js");
  const html = fs.readFileSync(path.join(__dirname, "..", "viewer.html"), "utf8");
  const m = html.match(/assets\/viewer\.js\?v=([^"'&]+)/);
  assert.ok(m, "viewer.html에 viewer.js?v= 스탬프가 없다");
  assert.strictEqual(m[1], computeViewerVersion(), "node scripts/stamp-viewer-version.js 로 다시 찍을 것");
  const tm = html.match(/assets\/term-match\.js\?v=([^"'&]+)/);
  assert.ok(tm, "viewer.html에 term-match.js?v= 스탬프가 없다");
  assert.strictEqual(tm[1], m[1], "term-match.js와 viewer.js의 스탬프가 다르다");
});

test("stampReaderHtml: 리더 자산 태그에 같은 버전을 찍고 다시 찍으면 교체한다", () => {
  const { stampReaderHtml } = require("../scripts/stamp-viewer-version.js");
  const html = [
    '<link rel="stylesheet" href="assets/reader/reader.css">',
    '<script src="assets/term-match.js"></script>',
    '<script src="assets/reader/doc.js?v=old"></script>',
    '<script src="assets/escape.js"></script>',
  ].join("\n");
  const once = stampReaderHtml(html, "aaa");
  assert.ok(once.includes('href="assets/reader/reader.css?v=aaa"'));
  assert.ok(once.includes('src="assets/term-match.js?v=aaa"'));
  assert.ok(once.includes('src="assets/reader/doc.js?v=aaa"'));
  assert.ok(once.includes('src="assets/escape.js"'));
  assert.ok(stampReaderHtml(once, "bbb").includes('doc.js?v=bbb"'));
  assert.throws(() => stampReaderHtml("<p></p>", "x"));
});

test("reader.html의 자산 스탬프가 현재 computeReaderVersion()과 같다", () => {
  const fs = require("fs");
  const path = require("path");
  const { computeReaderVersion } = require("../scripts/stamp-viewer-version.js");
  const html = fs.readFileSync(path.join(__dirname, "..", "reader.html"), "utf8");
  const want = computeReaderVersion();
  const tm = html.match(/assets\/term-match\.js\?v=([^"'&]+)/);
  assert.ok(tm, "reader.html에 term-match.js?v= 스탬프가 없다: node scripts/stamp-viewer-version.js 로 다시 찍을 것");
  assert.strictEqual(tm[1], want, "node scripts/stamp-viewer-version.js 로 다시 찍을 것");
  const tags = html.match(/(?:src|href)="assets\/reader\/[\w-]+\.(?:js|css)[^"]*"/g) || [];
  assert.ok(tags.length > 0, "reader.html에 assets/reader/ 태그가 없다");
  tags.forEach((t) => assert.ok(t.endsWith("?v=" + want + '"'), t + " 의 버전이 다르다: node scripts/stamp-viewer-version.js 로 다시 찍을 것"));
});
