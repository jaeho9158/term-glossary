// 한 글자 표제어는 본문에 같은 글자가 있어도 매칭하지 않는다.
const assert = require("assert");
const { matchTerms } = require("../assets/viewer.js");

{
  const terms = [
    { slug: "blood", title_ko: "혈", title_en: "Blood", categories: ["kmed"] },
    { slug: "bbb", title_ko: "혈액뇌장벽", title_en: "Blood-Brain Barrier", categories: ["neuro"] },
  ];
  const found = matchTerms("혈 이라는 글자와 혈액뇌장벽 개방", terms).map((x) => x.slug);
  assert.deepStrictEqual(found, ["bbb"]);
}

console.log("viewer-short-title: all tests passed");
