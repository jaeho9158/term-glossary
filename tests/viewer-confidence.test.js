// 확신 등급: 짧은 한 낱말 표면형이 (동형어 있음 | 위험 표제어 | 말뭉치에서 여러 분야군에 두루 쓰임)이고
// 문서 안 강한 증거가 없으면 강등(demotedBy=confidence). 여러 낱말·3음절 이상·뜻 하나인 표제어는 건드리지 않는다.
const test = require("node:test");
const assert = require("node:assert");
const TM = require("../assets/term-match.js");

function occ(text, word) {
  const o = [];
  let i = -1;
  while ((i = text.indexOf(word, i + 1)) !== -1) o.push({ start: i, length: word.length });
  return o;
}
function term(text, word, fields) {
  const o = occ(text, word);
  return Object.assign({
    slug: fields.slug, title_ko: "", title_en: "", categories: [], sense: [], viaHangul: true,
    occurrences: o, count: o.length, firstStart: o[0] && o[0].start, firstLength: word.length,
  }, fields);
}
const FILLER = ["면역조직화학염색", "감별진단기준", "세침흡인검사법", "갑상선기능검사", "림프구침윤양상", "역전사중합효소"];
const fillers = (text) => FILLER.map((w, i) => term(text, w, { slug: "f" + i, title_ko: w, title_en: "Filler " + i, categories: [i % 2 ? "med" : "bio"] }));
const BASE = FILLER.join(" 그리고 ");
const TOP = ["의학·생명"];

function run(m, text) {
  TM.applyConfidenceRule(fillers(text).concat([m]), text, TOP, 7);
  return m;
}

test("짧은 한글 한 낱말 + 동형어 있음 + 증거 없음 -> 강등", () => {
  const text = BASE + " 이 글의 밀도 를 본다.";
  const m = run(term(text, "밀도", { slug: "density", title_ko: "밀도", title_en: "Density", categories: ["phys"], surfaceTerms: 2 }), text);
  assert.ok(m.distant);
  assert.strictEqual(m.demotedBy, "confidence");
});

test("말뭉치에서 여러 분야군에 두루 쓰이면(fieldGroups 3개 이상) 강등", () => {
  const text = BASE + " 이 글의 촉매 를 본다.";
  const m = run(term(text, "촉매", { slug: "catalyst", title_ko: "촉매", title_en: "Catalyst", categories: ["chem"], fieldGroups: "cik" }), text);
  assert.ok(m.distant);
});

test("강한 증거(뜻 키워드 2개 이상)가 있으면 유지", () => {
  const text = BASE + " 물질량 부피감 질량체 밀도 를 본다.";
  const m = run(term(text, "밀도", { slug: "density", title_ko: "밀도", categories: ["phys"], surfaceTerms: 2, sense: ["물질량", "부피감", "질량체"] }), text);
  assert.ok(!m.distant);
});

test("뜻이 하나이고 넓게 쓰이지 않는 짧은 표제어는 유지", () => {
  const text = BASE + " 이 글의 갯벌 을 본다.";
  const m = run(term(text, "갯벌", { slug: "tidal-flat", title_ko: "갯벌", title_en: "Tidal flat", categories: ["earth"], fieldGroups: "c" }), text);
  assert.ok(!m.distant);
});

test("3음절 이상 한글 합성어는 건드리지 않는다", () => {
  const text = BASE + " 이 글의 우도비 를 본다.";
  const m = run(term(text, "우도비", { slug: "lr", title_ko: "우도비", title_en: "Likelihood Ratio", categories: ["stat"], surfaceTerms: 2, fieldGroups: "bfkl" }), text);
  assert.ok(!m.distant);
});

test("영문 한 단어(영문으로만 잡힘) + 동형어 -> 강등, 여러 낱말 영문은 유지", () => {
  const text = BASE + " the replacement of rules; Risk Management plans.";
  const a = term(text, "replacement", { slug: "replacement-3r", title_ko: "대체", title_en: "Replacement", categories: ["law"], viaHangul: false, surfaceTerms: 2 });
  const b = term(text, "Risk Management", { slug: "rm", title_ko: "위험관리", title_en: "Risk Management", categories: ["law"], viaHangul: false, surfaceTerms: 2 });
  TM.applyConfidenceRule(fillers(text).concat([a, b]), text, TOP, 8);
  assert.ok(a.distant);
  assert.ok(!b.distant);
});

test("기초·방법 용어는 둘레에 방법 용어가 3개 이상이면 유지, 아니면 강등", () => {
  const base = "회귀 표본 가설 분산 검정";
  const mk = (slug, ko, extra) => ({ slug, title_ko: ko, title_en: "", categories: ["stat"], sense: [], viaHangul: true, ...extra });
  const text = BASE + " " + base;
  const peers = ["표본", "가설", "분산"].map((w) => term(text, w, mk("p" + w, w)));
  const reg = term(text, "회귀", mk("regression", "회귀", { fieldGroups: "bfi" }));
  assert.strictEqual(TM.fieldGroupOf("stat"), "연구 기초·방법");
  TM.applyConfidenceRule(fillers(text).concat(peers, [reg]), text, TOP, 10);
  assert.ok(!reg.distant);
  const reg2 = term(text, "회귀", mk("regression", "회귀", { fieldGroups: "bfi" }));
  TM.applyConfidenceRule(fillers(text).concat([reg2]), text, TOP, 10);
  assert.ok(reg2.distant);
});
