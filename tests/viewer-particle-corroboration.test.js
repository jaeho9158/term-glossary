// 조사를 떼어 2음절만 남는 매칭("제대로"→제대, "빈도로"→빈도)은 일상 부사·조사
// 결합과 겹치기 쉽다. 그 2음절 표제어가 문서 안에 조사 없이 단독으로도 1회 이상
// 나올 때만 인정한다.
const assert = require("assert");
const { matchTerms, needsBareCorroboration } = require("../assets/viewer.js");

const terms = [
  { slug: "echelon", title_ko: "제대", title_en: "Echelon", categories: ["military"] },
  { slug: "correlation", title_ko: "상관관계", title_en: "Correlation", categories: ["stat"] },
];
const slugs = (text) => matchTerms(text, terms).map((m) => m.slug);

assert.ok(!slugs("실험을 제대로 하였다.").includes("echelon"), "제대로 단독 → 안 잡힘");
assert.ok(slugs("제대 편성을 바꾸었다. 이번에는 제대로 하였다.").includes("echelon"), "단독 등장이 있으면 잡힘");
{
  const r = matchTerms("제대 편성을 바꾸었다. 이번에는 제대로 하였다.", terms).find((m) => m.slug === "echelon");
  assert.strictEqual(r.count, 2, "뒷받침되면 조사 붙은 자리도 센다");
}
// 3음절 이상은 조사 제거만으로도 인정(기존 동작)
assert.ok(slugs("상관관계가 유의하였다.").includes("correlation"));
// 영문 표기도 단독 등장으로 친다
assert.ok(slugs("Echelon 구조에서 제대로 배치").includes("echelon"));

assert.strictEqual(needsBareCorroboration("제대"), true);
assert.strictEqual(needsBareCorroboration("상관관계"), false);
assert.strictEqual(needsBareCorroboration("ab"), false);

console.log("particle corroboration: all tests passed");
