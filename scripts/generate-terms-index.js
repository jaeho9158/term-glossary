const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCE = path.join(ROOT_DIR, "terms.json");
const OUTPUT = path.join(ROOT_DIR, "terms-index.json");

// 홈페이지 목록(site.js)과 헤더 검색(header-search.js)은 definition 본문이
// 필요 없다 (개별 용어 페이지에 이미 정의가 박혀 있음). 검색/목록에는
// 이 경량 인덱스를 쓰고, 정의가 실제로 필요한 quiz.js/viewer.js는
// 계속 terms.json 전체를 fetch한다.
function run() {
  const terms = JSON.parse(fs.readFileSync(SOURCE, "utf8"));

  const index = terms.map((t) => ({
    slug: t.slug,
    title_ko: t.title_ko,
    title_en: t.title_en,
    categories: t.categories,
    aliases: t.aliases,
  }));

  fs.writeFileSync(OUTPUT, JSON.stringify(index), "utf8");
  console.log(`terms-index.json 생성 완료: ${index.length}개 항목`);
}

run();
