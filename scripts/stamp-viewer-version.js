// viewer.html 의 자산 태그(`?v=...`)에 버전 문자열을 찍는다.
//
// 왜: GitHub Pages는 정적 파일에 캐시 헤더를 붙여, 배포 직후에도 브라우저가 옛 스크립트·viewer-index.json·
// viewer-defs 청크를 섞어 쓸 수 있다. 청크 형식이 바뀌면 옛 코드 + 새 청크(또는 반대)가 되어 뜻 키워드가 조용히
// 사라진다. 버전은 이 한 곳(viewer.html의 태그)에만 두고, 용어 계층(assets/reader/terms-layer.js)은 자기 src에서
// v를 읽어 인덱스·청크 URL에 같은 값을 붙인다.
//
// 값은 아래 내용의 해시 앞 10자라, 하나라도 바뀌면 자동으로 달라지고 안 바뀌면 그대로다(불필요한 캐시 무효화 없음).
//   term-match.js · viewer-storage.js · pdf-annotations.js · assets/reader/*.js|css · viewer-index.json · viewer-defs/
// 찍는 곳: viewer.html 의 assets/reader/*.js|css, term-match.js, viewer-storage.js 태그와 pdf-annotations.js 모듈 import.
// generate-viewer-index.js가 끝에 호출하고, 코드만 고쳤을 때는 직접 실행한다.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const HTML = path.join(ROOT, "viewer.html");

function computeViewerVersion(root = ROOT) {
  const hash = crypto.createHash("sha1");
  // 줄바꿈은 LF로 맞춰 해시한다 — git checkout이 CRLF로 바꿔 놓기만 해도 버전이 달라지면 안 된다.
  const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  hash.update(read(path.join(root, "assets", "term-match.js")));
  hash.update(read(path.join(root, "viewer-index.json")));
  const defsDir = path.join(root, "viewer-defs");
  for (const name of fs.readdirSync(defsDir).sort()) {
    hash.update(name);
    hash.update(read(path.join(defsDir, name)));
  }
  const dir = path.join(root, "assets", "reader");
  for (const name of fs.readdirSync(dir).filter((n) => /\.(js|css)$/.test(n)).sort()) {
    hash.update(name);
    hash.update(read(path.join(dir, name)));
  }
  hash.update(read(path.join(root, "assets", "viewer-storage.js")));
  hash.update(read(path.join(root, "assets", "pdf-annotations.js")));
  hash.update(read(path.join(root, "assets", "category-picker.js")));
  hash.update(read(path.join(root, "assets", "category-picker.css")));
  return hash.digest("hex").slice(0, 10);
}

const ASSET_RE = /((?:src|href)="assets\/(?:reader\/[\w-]+\.(?:js|css)|term-match\.js|viewer-storage\.js|category-picker\.(?:js|css)))(\?v=[0-9a-z]*)?(")/g;
// 모듈 import("./assets/….js") 도 같은 버전을 받는다(pdf-annotations.js 는 버전 해시에 들어 있다).
const IMPORT_RE = /(import\("\.\/assets\/[\w-]+\.js)(\?v=[0-9a-z]*)?("\))/g;

function stampHtml(html, version) {
  if (!/assets\/term-match\.js/.test(html)) throw new Error("viewer.html에서 assets/term-match.js 로드를 찾지 못했습니다");
  return html.replace(ASSET_RE, "$1?v=" + version + "$3").replace(IMPORT_RE, "$1?v=" + version + "$3");
}

function run() {
  const version = computeViewerVersion();
  const before = fs.readFileSync(HTML, "utf8");
  const after = stampHtml(before, version);
  if (after !== before) fs.writeFileSync(HTML, after, "utf8");
  console.log(`viewer 버전: ${version}${after === before ? " (변경 없음)" : ""}`);
}

if (require.main === module) run();

module.exports = { computeViewerVersion, stampHtml, run };
