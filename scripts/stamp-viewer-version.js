// viewer.html의 `assets/viewer.js?v=...` 버전 문자열을 갱신한다.
//
// 왜: GitHub Pages는 정적 파일에 캐시 헤더를 붙여, 배포 직후에도 브라우저가
// 옛 viewer.js·viewer-index.json·viewer-defs 청크를 섞어 쓸 수 있다. 라운드 4처럼
// 청크 형식이 바뀌면 옛 코드 + 새 청크(또는 반대)가 되어 뜻 키워드가 조용히
// 사라진다. 버전은 이 한 곳(viewer.html의 script src)에만 두고, viewer.js는 자기
// src에서 v를 읽어 인덱스·청크 URL에 같은 값을 붙인다.
//
// 값은 viewer.js + viewer-index.json + viewer-defs/ 내용의 해시 앞 10자라, 셋 중
// 하나라도 바뀌면 자동으로 달라지고 안 바뀌면 그대로다(불필요한 캐시 무효화 없음).
// generate-viewer-index.js가 끝에 호출하고, 코드만 고쳤을 때는 직접 실행한다.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const HTML = path.join(ROOT, "viewer.html");
const SCRIPT_SRC_RE = /(<script src="assets\/viewer\.js)(\?v=[0-9a-z]*)?(")/;

function computeViewerVersion(root = ROOT) {
  const hash = crypto.createHash("sha1");
  // 줄바꿈은 LF로 맞춰 해시한다 — git checkout이 CRLF로 바꿔 놓기만 해도 버전이
  // 달라지면 안 된다.
  const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  hash.update(read(path.join(root, "assets", "viewer.js")));
  hash.update(read(path.join(root, "viewer-index.json")));
  const defsDir = path.join(root, "viewer-defs");
  for (const name of fs.readdirSync(defsDir).sort()) {
    hash.update(name);
    hash.update(read(path.join(defsDir, name)));
  }
  return hash.digest("hex").slice(0, 10);
}

function stampHtml(html, version) {
  if (!SCRIPT_SRC_RE.test(html)) throw new Error("viewer.html에서 assets/viewer.js 로드를 찾지 못했습니다");
  return html.replace(SCRIPT_SRC_RE, `$1?v=${version}$3`);
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
