const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCE = path.join(ROOT_DIR, "terms.json");
const OUTPUT = path.join(ROOT_DIR, "terms-lite.json");

// 퀴즈·로드맵·논문뷰어·내기록 네 페이지는 terms.json(24MB)을 통째로 받고 있었다.
// 정작 쓰는 필드는 아래 KEEP_FIELDS뿐이고, 용량의 큰 부분을 차지하는 related(3.2MB
// + 키 반복 오버헤드)와 definition_en은 이 페이지들에서 한 번도 읽지 않는다.
// (related는 용어 상세 페이지에 이미 HTML로 박혀 있어 JS가 받을 이유가 없다.)
//
// 각 페이지가 실제로 참조하는 필드 — 빼면 조용히 깨지는 것들이라 근거를 남긴다:
//   quiz.js      categories, definition, slug, title_en, title_ko
//                + aliases (quiz-core.js의 acceptedAnswers가 주관식 채점에 사용)
//   roadmap.js   categories, difficulty, prerequisites, slug, subcategory, title_ko
//   viewer.js    categories, definition, slug, title_en, title_ko
//   history.js   categories, slug
const KEEP_FIELDS = [
  "slug",
  "title_ko",
  "title_en",
  "definition",
  "categories",
  "subcategory",
  "difficulty",
  "prerequisites",
  "aliases",
];

function run() {
  const terms = JSON.parse(fs.readFileSync(SOURCE, "utf8"));

  const lite = terms.map((term) => {
    const out = {};
    for (const key of KEEP_FIELDS) {
      const value = term[key];
      // 빈 배열·빈 값은 키 자체를 생략한다. 3만7천 개에 곱해지면 키 이름만으로도
      // 수 MB가 되기 때문에, 소비자 쪽 `|| []` 기본값에 맡기는 편이 싸다.
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;
      out[key] = value;
    }
    return out;
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(lite));

  const before = fs.statSync(SOURCE).size;
  const after = fs.statSync(OUTPUT).size;
  const mb = (n) => (n / 1048576).toFixed(1);
  console.log(
    `terms-lite.json 생성: ${lite.length}개 용어, ` +
      `${mb(before)}MB → ${mb(after)}MB (${Math.round((1 - after / before) * 100)}% 감소)`
  );
}

run();
