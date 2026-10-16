// 문서 분야 관문: 말뭉치에서 실제 쓰인 분야군(match.fieldGroups)에 문서 상위 분야군이 없고 등장이 적으며
// 문서 안 뜻 증거가 없으면 강등한다. 통계가 없으면(fieldGroups 없음) 건드리지 않는다.
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
const MED = TM.fieldGroupCode("의학·생명");
const SOC = TM.fieldGroupCode("사회과학");

function pluralism(text, fieldGroups) {
  return term(text, "다원주의", { slug: "pluralism", title_ko: "다원주의", title_en: "Pluralism", categories: ["socialecon"], sense: ["정치", "사회", "가치"], fieldGroups });
}

test("fieldGroupCode: 분야군마다 서로 다른 한 글자", () => {
  assert.ok(MED && SOC && MED !== SOC);
  assert.strictEqual(TM.fieldGroupCode("없는 분야군"), "");
});

test("문서 분야가 말뭉치 사용 분야에 없고 증거도 없으면 강등(demotedBy=field)", () => {
  const text = BASE + " 이 연구에서 다원주의 를 언급한다.";
  const m = pluralism(text, SOC);
  TM.applyFieldGateRule(fillers(text).concat([m]), text, TOP, 7);
  assert.ok(m.distant);
  assert.strictEqual(m.demotedBy, "field");
});

test("문서 분야가 말뭉치 사용 분야에 들어 있으면 유지", () => {
  const text = BASE + " 이 연구에서 다원주의 를 언급한다.";
  const m = pluralism(text, SOC + MED);
  TM.applyFieldGateRule(fillers(text).concat([m]), text, TOP, 7);
  assert.ok(!m.distant);
});

test("말뭉치 통계 없음(fieldGroups 없음)이면 판단하지 않는다", () => {
  const text = BASE + " 이 연구에서 다원주의 를 언급한다.";
  const m = pluralism(text, undefined);
  TM.applyFieldGateRule(fillers(text).concat([m]), text, TOP, 7);
  assert.ok(!m.distant);
});

test("문서 안 뜻 키워드 증거가 있으면 유지, 등장이 많아도 유지", () => {
  const ev = BASE + " 정치 사회 다원주의 가치.";
  const m1 = pluralism(ev, SOC);
  TM.applyFieldGateRule(fillers(ev).concat([m1]), ev, TOP, 7);
  assert.ok(!m1.distant, "뜻 키워드 1개 이상");
  const many = BASE + " 다원주의 그리고 다원주의 그리고 다원주의 그리고 다원주의.";
  const m2 = pluralism(many, SOC);
  TM.applyFieldGateRule(fillers(many).concat([m2]), many, TOP, 7);
  assert.ok(!m2.distant, "등장 4회");
});

test("분야 추정이 없거나 잡힌 용어가 적으면 건드리지 않는다", () => {
  const text = BASE + " 다원주의.";
  const m = pluralism(text, SOC);
  TM.applyFieldGateRule([m], text, TOP, 3);
  assert.ok(!m.distant);
  TM.applyFieldGateRule(fillers(text).concat([m]), text, [], 7);
  assert.ok(!m.distant);
});

test("decodeDefChunk: g 필드를 fieldGroups 로 읽는다('-'는 빈 문자열)", () => {
  const out = TM.decodeDefChunk({ a: { s: "x y", g: "fh" }, b: { s: "x", g: "-" }, c: { s: "x" } });
  assert.strictEqual(out.get("a").fieldGroups, "fh");
  assert.strictEqual(out.get("b").fieldGroups, "");
  assert.strictEqual(out.get("c").fieldGroups, undefined);
});
