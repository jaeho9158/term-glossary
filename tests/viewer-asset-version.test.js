const test = require("node:test");
const assert = require("node:assert");
const { assetVersionFromSrc, withAssetVersion } = require("../assets/viewer.js");
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
  const html = '<script src="assets/viewer-storage.js"></script>\n<script src="assets/viewer.js"></script>';
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
});
