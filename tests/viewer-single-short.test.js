// 오탐 라운드 3 규칙 2: 한글 2음절 이하 표제어가 문서에 1회만 나오고 상위 분야군
// (+연구 기초·방법) 밖이면 강등한다. 인접 분야군이라도 1회뿐이면 근거가 약하다.
const assert = require("assert");
const { filterDistantFieldMatches, fieldGroupOf } = require("../assets/viewer.js");

const m = (slug, title_ko, cats, extra) => ({ slug, title_ko, title_en: "", categories: cats, viaHangul: true, count: 1, ...extra });

const doc = [
  ...Array.from({ length: 12 }, (_, i) => m(`med-${i}`, `의학용어${i}`, ["med"], { count: 3 })),
  m("food-once", "건조", ["food"]),                 // 인접(농림수산·식품)·1회 → 강등
  m("food-twice", "저장", ["food"], { count: 2 }),  // 2회 → 유지
  m("med-once", "예방", ["med"]),                   // 상위 분야군 → 유지
  m("stat-once", "분산", ["stat"]),                 // 연구 기초·방법 → 유지
  m("long-once", "항산화제", ["food"]),             // 3음절 이상 → 규칙 밖
];
assert.notStrictEqual(fieldGroupOf("food"), fieldGroupOf("med"));
const out = filterDistantFieldMatches(doc);
const distant = new Set(out.filter((x) => x.distant).map((x) => x.slug));
assert.ok(distant.has("food-once"), "인접 분야 짧은 표제어 1회는 강등");
assert.ok(!distant.has("food-twice"));
assert.ok(!distant.has("med-once"));
assert.ok(!distant.has("stat-once"));
assert.ok(!distant.has("long-once"));
