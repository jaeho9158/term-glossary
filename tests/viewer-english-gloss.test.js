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

// 라운드 5 리뷰 항목 2: 규칙 6 완화 — 구 단위 병기·하이픈·로마자 표기는 보류.
test("englishGlossVerdict: 구 단위 병기는 보류(굽힘 강성 bending rigidity)", () => {
  const t = "굽힘 강성(bending rigidity)이 크다";
  assert.strictEqual(englishGlossVerdict(m(t, "강성", "stiffness"), t), "none");
  const t2 = "두통으로 발현되는 경련(ictal epileptic headache)";
  assert.strictEqual(englishGlossVerdict(m(t2, "경련", "Seizure"), t2), "none");
});

test("englishGlossVerdict: 하이픈이 든 병기는 보류(p-value)", () => {
  const t = "유의 확률(p-value)이 0.05 미만";
  assert.strictEqual(englishGlossVerdict(m(t, "확률", "Probability"), t), "none");
});

test("englishGlossVerdict: 상위 분야군에 한의학이 있으면 규칙 비활성(명문 mingmen, 단전 dantian)", () => {
  const t = "명문(mingmen)으로부터 기를 단전(dantian)으로 유도";
  assert.strictEqual(englishGlossVerdict(m(t, "명문", "Gate of Vitality"), t, ["한의학"]), "none");
  assert.strictEqual(englishGlossVerdict(m(t, "단전", "Elixir Field"), t, ["의학·생명", "한의학"]), "none");
  assert.strictEqual(englishGlossVerdict(m(t, "명문", "Gate of Vitality"), t, ["의학·생명"]), "mismatch", "한의학이 없으면 그대로");
});

test("englishGlossVerdict: 모음 비율이 비정상이고 표제어와 앞 3글자가 안 겹치면 로마자로 보고 보류", () => {
  const t = "태극(taiji) 수련";
  assert.strictEqual(englishGlossVerdict(m(t, "태극", "Supreme Ultimate"), t), "none");
});

test("englishGlossVerdict: 동의어 병기는 못 가린다(경련 convulsion ≠ Seizure → mismatch 허용)", () => {
  const t = "열성 경련(convulsion) 병력";
  assert.strictEqual(englishGlossVerdict(m(t, "경련", "Seizure"), t), "mismatch");
});
