const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCE = path.join(ROOT_DIR, "terms.json");
const OUTPUT = path.join(ROOT_DIR, "viewer-index.json");
const DEFS_DIR = path.join(ROOT_DIR, "viewer-defs");

// 논문 뷰어(viewer.js)는 "용어 찾기" 한 번에 terms-lite.json(16MB)을 통째로
// 받고 있었다. 정작 매칭(buildExactIndex/matchTermsWithIndex)에 쓰이는 값은
// slug·title_ko·title_en뿐이고, definition(전체 2.6MB)과 categories는
// "매칭된 용어"에만 필요하다. 그래서 파일을 둘로 나눈다.
//
//  1) viewer-index.json    : 매칭 + 카테고리 필터에 필요한 최소 데이터(전량 로드)
//  2) viewer-defs/NNN.json : definition을 slug 해시로 쪼갠 청크(지연 로드)
//
// viewer-index.json은 키 이름 반복(37,416 × {"slug":...,"title_ko":...})만으로
// 수 MB가 붙기 때문에 배열-of-배열로 저장하고, 카테고리 코드도 98종짜리
// 사전의 인덱스 숫자로 치환한다. 디코더는 assets/viewer.js의
// decodeViewerIndex()이며, 형식을 바꾸면 그쪽도 같이 고쳐야 한다.
//
// aliases는 넣지 않는다 — buildExactIndex()가 title_ko/title_en만 인덱싱하므로
// 현재 매칭에 전혀 쓰이지 않는데, 넣으면 2.8MB → 3.6MB로 목표(3MB)를 넘긴다.
// 나중에 별칭 매칭을 도입하면 행 끝에 한 칸 덧붙이면 된다.

// definition 청크 개수. 청크 하나가 약 14KB라, 한 논문에서 찾은 용어 N개는
// 최대 N개 청크(≈ N × 14KB)만 받는다 — 청크를 적게(=크게) 가져가면
// 용어 몇 개 때문에 수백 KB를 받게 되므로 잘게 쪼개는 쪽이 싸다.
const DEF_BUCKETS = 512;

// FNV-1a. assets/viewer.js의 defBucket()과 반드시 같은 결과를 내야 한다.
function defBucket(slug) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % DEF_BUCKETS;
}

function run() {
  const terms = JSON.parse(fs.readFileSync(SOURCE, "utf8"));

  const categoryCodes = [];
  const categoryIndex = new Map();
  const codeOf = (code) => {
    if (!categoryIndex.has(code)) {
      categoryIndex.set(code, categoryCodes.length);
      categoryCodes.push(code);
    }
    return categoryIndex.get(code);
  };

  const rows = terms.map((t) => [
    t.slug,
    t.title_ko || "",
    t.title_en || "",
    (t.categories || []).map(codeOf),
  ]);

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify({ v: 1, categories: categoryCodes, terms: rows }),
    "utf8"
  );

  // 청크는 매번 싹 다시 만든다 — 용어가 삭제됐을 때 옛 definition이 남지 않도록.
  fs.rmSync(DEFS_DIR, { recursive: true, force: true });
  fs.mkdirSync(DEFS_DIR, { recursive: true });

  const buckets = Array.from({ length: DEF_BUCKETS }, () => ({}));
  for (const t of terms) {
    if (!t.slug || !t.definition) continue;
    buckets[defBucket(t.slug)][t.slug] = t.definition;
  }

  let defsBytes = 0;
  buckets.forEach((bucket, i) => {
    const file = path.join(DEFS_DIR, `${String(i).padStart(3, "0")}.json`);
    const json = JSON.stringify(bucket);
    fs.writeFileSync(file, json, "utf8");
    defsBytes += Buffer.byteLength(json);
  });

  const mb = (n) => (n / 1048576).toFixed(2);
  const indexSize = fs.statSync(OUTPUT).size;
  console.log(
    `viewer-index.json 생성: ${rows.length}개 용어, ${mb(indexSize)}MB ` +
      `(카테고리 ${categoryCodes.length}종)`
  );
  console.log(
    `viewer-defs/ 생성: ${DEF_BUCKETS}개 청크, 합계 ${mb(defsBytes)}MB ` +
      `(청크 평균 ${Math.round(defsBytes / DEF_BUCKETS / 1024)}KB)`
  );
}

if (require.main === module) run();

module.exports = { defBucket, DEF_BUCKETS };
