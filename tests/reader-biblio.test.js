const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../assets/reader/biblio.js");

const REF = "A. Kim and B. Lee, Deep learning for cats, J. Cat Sci., 2020.";

test("isMatch: 제목 낱말 80%와 연도", () => {
  assert.equal(B.isMatch(REF, { title: "Deep Learning for Cats", year: "2020" }), true);
  assert.equal(B.isMatch(REF, { title: "Deep Learning for Cats", year: "2019" }), false);
  assert.equal(B.isMatch(REF, { title: "Deep Learning for Dogs", year: "2020" }), false);
  assert.equal(B.isMatch(REF, { title: "Cats", year: "2020" }), false);
});

test("isMatch: 제목 낱말이 3개 미만이면 false", () => {
  assert.equal(B.isMatch("Kim, Deep learning, 2020", { title: "Deep Learning", year: "2020" }), false);
});

test("isMatch: 첫 저자의 성이 서지 문구에 없으면 false", () => {
  const t = "Deep Learning for Cats";
  assert.equal(B.isMatch(REF, { title: t, year: "2020", author: [{ family: "Kim" }] }), true);
  assert.equal(B.isMatch(REF, { title: t, year: "2020", author: [{ family: "Park" }] }), false);
  assert.equal(B.isMatch(REF, { title: t, year: "2020", author: [{ name: "Some Consortium" }] }), true);
});

test("isMatch: 발음 기호를 접어 비교(Müller / Muller)", () => {
  const ref = "Muller, K. Learning of cats and dogs in the wild. Nature 2019";
  assert.equal(B.isMatch(ref, { title: "Learning of Cats and Dogs in the Wild", year: "2019", author: [{ family: "Müller" }] }), true);
  const ref2 = "Müller, K. Learning of cats and dogs in the wild. Nature 2019";
  assert.equal(B.isMatch(ref2, { title: "Learning of Cats and Dogs in the Wild", year: "2019", author: [{ family: "Muller" }] }), true);
});

test("isMatch: 한글 서지와 한글 제목", () => {
  const ref = "김철수·이영희 (2018). 청소년의 스마트폰 과의존이 학업성취에 미치는 영향. 교육학연구, 56(2), 1-25.";
  assert.equal(B.isMatch(ref, { title: "청소년의 스마트폰 과의존이 학업성취에 미치는 영향", year: "2018", author: [{ family: "김" }] }), true);
  assert.equal(B.isMatch(ref, { title: "청소년의 스마트폰 과의존이 학업성취에 미치는 영향", year: "2017" }), false);
  assert.equal(B.isMatch(ref, { title: "성인의 인터넷 사용이 직무만족에 미치는 영향 연구", year: "2018" }), false);
  // 한글 서지에 영문 제목 후보는 한글 규칙을 통과하지 못하므로 false
  assert.equal(B.isMatch(ref, { title: "Smartphone overdependence of adolescents", year: "2018" }), false);
});

test("pickMatch: 첫 일치를 고르고, 전부 불일치면 null", () => {
  const items = [
    { title: ["Something Else Entirely Here"], issued: { "date-parts": [[2020]] } },
    { title: ["Deep Learning for Cats"], issued: { "date-parts": [[2020]] }, author: [{ family: "Kim" }] },
    { title: ["Deep Learning for Cats"], issued: { "date-parts": [[2020]] } },
  ];
  assert.equal(B.pickMatch(REF, items), items[1]);
  assert.equal(B.pickMatch(REF, [items[0]]), null);
  assert.equal(B.pickMatch(REF, []), null);
  assert.equal(B.pickMatch(REF, undefined), null);
});

test("yearsIn / normalizeTitle", () => {
  assert.deepEqual(B.yearsIn("vol. 2020, pp. 1999–2005, 2021"), ["2020", "1999", "2005", "2021"]);
  assert.deepEqual(B.yearsIn("id 120201 and 1850"), []);
  assert.deepEqual(B.normalizeTitle("A Deep-Learning: for Cats!"), ["deep", "learning", "for", "cats"]);
});

test("trimRef: 앞 번호 제거, 공백 정리, 300자 낱말 경계", () => {
  assert.equal(B.trimRef("[12]  Kim,   A. Title 2020"), "Kim, A. Title 2020");
  assert.equal(B.trimRef("12. Kim A. Title 2020"), "Kim A. Title 2020");
  assert.equal(B.trimRef("2020 was a year"), "2020 was a year");
  const long = ("word ".repeat(100)).trim();
  const out = B.trimRef(long);
  assert.ok(out.length <= 300);
  assert.ok(/word$/.test(out));
});

test("validDoi / doiUrl", () => {
  assert.equal(B.validDoi("10.1038/nature14539"), true);
  assert.equal(B.validDoi("10.12/abc"), false);
  assert.equal(B.validDoi("javascript:alert(1)"), false);
  assert.equal(B.validDoi("10.1000/has space"), false);
  assert.equal(B.doiUrl("10.1002/(SICI)1097<x>"), "https://doi.org/10.1002/(SICI)1097%3Cx%3E");
  assert.equal(B.doiUrl("bad"), "");
});

test("stripTags: JATS 태그 제거", () => {
  assert.equal(B.stripTags("<jats:p>Text <jats:italic>x</jats:italic></jats:p>"), "Text x");
  assert.equal(B.stripTags("<jats:title>Abstract</jats:title><jats:p>A &amp; B &lt;3</jats:p>"), "A & B <3");
  assert.equal(B.stripTags("<script>alert(1)</script>hi"), "alert(1)hi");
});

test("cutAbstract: 600자 + 말줄임", () => {
  const out = B.cutAbstract("<jats:p>" + "a".repeat(700) + "</jats:p>");
  assert.equal(Array.from(out).length, 601);
  assert.ok(out.endsWith("…"));
  assert.equal(B.cutAbstract("short"), "short");
});

test("yearOf: issued.date-parts", () => {
  assert.equal(B.yearOf({ issued: { "date-parts": [[2020, 5, 1]] } }), "2020");
  assert.equal(B.yearOf({ issued: { "date-parts": [[2020]] } }), "2020");
  assert.equal(B.yearOf({ issued: { "date-parts": [[null]] } }), "");
  assert.equal(B.yearOf({ issued: { "date-parts": [[]] } }), "");
  assert.equal(B.yearOf({ issued: { "date-parts": [] } }), "");
  assert.equal(B.yearOf({ issued: {} }), "");
  assert.equal(B.yearOf({}), "");
  assert.equal(B.yearOf(null), "");
});
