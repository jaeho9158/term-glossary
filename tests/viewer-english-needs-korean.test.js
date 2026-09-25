// 영문 동음이의어 등급 4("영문 단독 불가"): plasma·shape·substance 같은 짧은 일반
// 영어 단어는 영문만으로는 잡지 않고, 같은 문서에 국문 표제어도 나올 때만 인정한다.
// 목록은 생성 스크립트의 데이터, 런타임(viewer.js)은 6번째 칸 등급만 본다.
const assert = require("assert");
const { matchTerms } = require("../assets/viewer.js");
const { englishGrade, ENGLISH_NEEDS_KOREAN } = require("../scripts/generate-viewer-index.js");

// 생성 스크립트: 목록에 있으면 4, 일반어(computeEnglishCommon)면 1이 우선, 그 밖은 0
assert.ok(ENGLISH_NEEDS_KOREAN.has("substance"));
assert.strictEqual(englishGrade({ title_en: "Substance" }, new Set()), 4);
assert.strictEqual(englishGrade({ title_en: "Substance" }, new Set(["substance"])), 1);
assert.strictEqual(englishGrade({ title_en: "Hyperthermia" }, new Set()), 0);
assert.strictEqual(englishGrade({ title_en: "" }, new Set()), 0);

// 런타임
const terms = [
  { slug: "substance", title_ko: "실체", title_en: "Substance", categories: ["philo"], common_en: 4 },
  { slug: "hyperthermia", title_ko: "온열요법", title_en: "Hyperthermia", categories: ["med"], common_en: 0 },
  { slug: "treatment", title_ko: "트리트먼트", title_en: "Treatment", categories: ["gamestudy"], common_en: 1 },
];
const slugs = (text) => matchTerms(text, terms).map((m) => m.slug);

assert.ok(!slugs("물질사용장애(substance use disorder)로 분류한다.").includes("substance"), "영문 단독 → 안 잡힘");
assert.ok(slugs("현상 너머의 실체 문제. 이를 (substance)라 부른다.").includes("substance"), "국문 공동 출현 → 잡힘");
{
  const r = matchTerms("현상 너머의 실체 문제. 이를 (substance)라 부른다.", terms).find((m) => m.slug === "substance");
  assert.strictEqual(r.count, 2, "공동 출현이면 영문 자리도 센다");
}
assert.ok(slugs("hyperthermia was applied").includes("hyperthermia"), "등급 0 영문은 그대로");
assert.ok(!slugs("treatment group").includes("treatment"), "등급 1 영문은 인덱스 제외 그대로");

console.log("english needs korean: all tests passed");
