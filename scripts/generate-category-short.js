// 분야 페이지 목록의 한 줄 설명 데이터를 분야별 조각으로 만든다.
// terms-index.json에 싣지 않는 이유: 헤더 검색이 모든 페이지에서 그 파일을 받기
// 때문에 설명을 넣으면 전 사이트 전송량이 두 배가 된다. 분야 페이지는 자기
// 분야 조각(data/category-short/<code>.json = {slug: 설명})만 받는다.
const fs = require("fs");
const path = require("path");
const { shortenText } = require("./short-text.js");

const ROOT_DIR = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT_DIR, "data", "category-short");

function run() {
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "terms.json"), "utf8"));
  const byCat = {};
  for (const t of terms) {
    const d = shortenText(t.definition);
    if (!d) continue;
    for (const c of t.categories || []) (byCat[c] ||= {})[t.slug] = d;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let bytes = 0;
  for (const [c, map] of Object.entries(byCat)) {
    const s = JSON.stringify(map);
    bytes += Buffer.byteLength(s);
    fs.writeFileSync(path.join(OUT_DIR, `${c}.json`), s, "utf8");
  }
  console.log(`data/category-short: ${Object.keys(byCat).length}개 분야, ${bytes} bytes`);
}

if (require.main === module) run();
