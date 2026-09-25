// 약어형 영문 표제어(DALY, VaR, EEG)는 대소문자까지 같아야 잡는다.
// 참고문헌의 저자 성 "Daly"가 DALY(장애보정생존년수)로, 학명의 "var."
// (변종)가 VaR(Value at Risk)로 잡히던 오탐(말뭉치 psychiatry, thesis-toc).
const assert = require("assert");
const { matchTerms } = require("../assets/viewer.js");

const terms = [
  { slug: "daly", title_ko: "장애보정생존년수", title_en: "DALY", categories: ["pubhealth"] },
  { slug: "value-at-risk", title_ko: "VaR", title_en: "Value at Risk", categories: ["finance"] },
  { slug: "eeg", title_ko: "뇌파검사", title_en: "EEG", categories: ["neuro"] },
  { slug: "fmri", title_ko: "기능적자기공명영상", title_en: "fMRI", categories: ["neuro"] },
];
const slugs = (text) => matchTerms(text, terms).map((m) => m.slug).sort();

assert.deepStrictEqual(slugs("Altshuler와 Daly는 보고했다."), []);
assert.deepStrictEqual(slugs("Polygonatum odoratum var. pluriflorum"), []);
assert.deepStrictEqual(slugs("DALY로 측정했다. VaR를 계산했다."), ["daly", "value-at-risk"]);
assert.deepStrictEqual(slugs("EEG와 fMRI를 함께 썼다."), ["eeg", "fmri"]);
assert.deepStrictEqual(slugs("eeg 신호"), [], "소문자 약어는 다른 말일 수 있다");

console.log("acronym case: all tests passed");
