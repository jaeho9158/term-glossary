const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCE = path.join(ROOT_DIR, "terms-index.json");
const OUTPUT = path.join(ROOT_DIR, "home-data.json");

// 홈페이지는 분야별 용어 개수(카드)와 "오늘의 단어" 후보만 있으면 되는데,
// 이 둘을 위해 7MB짜리 terms-index.json 전체를 두 번 받고 있었다.
// 홈이 실제로 쓰는 것만 따로 뽑아 수십 KB로 줄인다.
// 오늘의 단어는 날짜를 시드로 삼아 고르므로, 후보 풀을 고정 크기로
// 잘라 두어도 매일 같은 결과를 재현할 수 있다.
const DAILY_POOL = 2000;

function run() {
  const terms = JSON.parse(fs.readFileSync(SOURCE, "utf8"));

  const counts = {};
  for (const t of terms) {
    for (const code of t.categories || []) counts[code] = (counts[code] || 0) + 1;
  }

  // 제목이 온전한 것만 후보로. slug 순으로 고정해 빌드마다 풀이 흔들리지 않게 한다.
  const daily = terms
    .filter((t) => t.title_ko && t.title_en)
    .sort((a, b) => (a.slug < b.slug ? -1 : 1))
    .filter((_, i) => i % Math.ceil(terms.length / DAILY_POOL) === 0)
    .slice(0, DAILY_POOL)
    .map((t) => ({ slug: t.slug, title_ko: t.title_ko, title_en: t.title_en }));

  fs.writeFileSync(OUTPUT, JSON.stringify({ counts, daily }), "utf8");
  console.log(`home-data.json 생성 완료: 분야 ${Object.keys(counts).length}개, 오늘의 단어 후보 ${daily.length}개`);
}

run();
