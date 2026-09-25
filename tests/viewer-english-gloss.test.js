const test = require("node:test");
const assert = require("node:assert");
const { englishGlossVerdict } = require("../assets/viewer.js");

const at = (text, word) => {
  const occ = [];
  for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) occ.push({ start: i, length: word.length });
  return occ;
};
const m = (text, word, title_en) => ({ title_ko: word, title_en, viaHangul: true, occurrences: at(text, word) });

test("englishGlossVerdict: 병기 영문이 표제어 영문과 겹치면 match", () => {
  const t = "청소년의 중독(Poisoning) 사례";
  assert.strictEqual(englishGlossVerdict(m(t, "중독", "Poisoning"), t), "match");
  const t2 = "급성 중독 (acute poisonings)";
  assert.strictEqual(englishGlossVerdict(m(t2, "중독", "Poisoning"), t2), "match", "복수형·공백 허용");
  const t3 = "아연 이온(zinc ion)";
  assert.strictEqual(englishGlossVerdict(m(t3, "이온", "Ions"), t3), "match", "ion·ions");
});

test("englishGlossVerdict: 병기 영문이 하나도 안 겹치면 mismatch", () => {
  const t = "인터넷 중독(addiction)과 또래";
  assert.strictEqual(englishGlossVerdict(m(t, "중독", "Poisoning"), t), "mismatch");
  const t2 = "응집(cohesion)이 높은 집단";
  assert.strictEqual(englishGlossVerdict(m(t2, "응집", "Coagulation"), t2), "mismatch");
});

test("englishGlossVerdict: 판단 보류(none)", () => {
  const t = "중독 사례가 늘었다(표 1).";
  assert.strictEqual(englishGlossVerdict(m(t, "중독", "Poisoning"), t), "none", "괄호가 없거나 영문이 아님");
  const t2 = "양전자(PET) 영상";
  assert.strictEqual(englishGlossVerdict(m(t2, "양전자", "Positron"), t2), "none", "약어는 판단하지 않음");
  const t3 = "중독(addiction) 연구";
  assert.strictEqual(englishGlossVerdict(m(t3, "중독", ""), t3), "none", "표제어 영문이 없으면 보류");
  assert.strictEqual(englishGlossVerdict({ ...m(t3, "중독", "Poisoning"), viaHangul: false }, t3), "none", "영문으로 잡힌 용어는 대상 아님");
});

test("englishGlossVerdict: 한 등장이라도 맞으면 match", () => {
  const t = "중독(addiction)과 급성 중독(poisoning)";
  assert.strictEqual(englishGlossVerdict(m(t, "중독", "Poisoning"), t), "match");
});
