// 문서 분야 분포 기준 오탐 배제(2026-10-13): ① 뒷받침 없는 낯선 뜻(stray) ② 같은 자리 동형어(same-span)
// ③ 영문으로만 잡힌 자리의 제 낱말은 뜻 증거가 아님(senseOverlap 자기 제외).
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
// 의학 문서: 뒷받침이 되는 긴 표제어 6개(med/bio 세부 분야) + 시험할 용어
const FILLER = ["면역조직화학염색", "감별진단기준", "세침흡인검사법", "갑상선기능검사", "림프구침윤양상", "역전사중합효소"];
function medText(extra) { return FILLER.join(" 그리고 ") + " " + extra; }
function fillers(text) {
  return FILLER.map((w, i) => term(text, w, { slug: "f" + i, title_ko: w, title_en: "Filler Term " + i, categories: i % 2 ? ["med"] : ["bio"] }));
}
const TOP = ["의학·생명"];

test("stray: 세부 분야 동료도 뜻 키워드도 없는 짧은 표제어는 강등", () => {
  const text = medText("미분화 갑상선암과 유사하여 감별이 어렵다.");
  const micro = term(text, "미분화", { slug: "micronization", title_ko: "미분화", title_en: "micronization", categories: ["pharm"], sense: ["약학", "용해속도", "입자크기", "나노입자제제"] });
  const list = fillers(text).concat([micro]);
  TM.applySenseContextRule(list, text, TOP);
  assert.equal(micro.distant, true);
  assert.equal(micro.demotedBy, "stray");
  assert.ok(list.slice(0, 6).every((m) => !m.distant), "긴 표제어 동료는 그대로");
});

test("stray: 같은 세부 분야 동료가 있으면 유지", () => {
  const text = medText("미분화 갑상선암과 유사하여 감별이 어렵다.");
  const m = term(text, "미분화", { slug: "x", title_ko: "미분화", title_en: "x", categories: ["med"], sense: ["약학", "용해속도"] });
  const list = fillers(text).concat([m]);
  TM.applySenseContextRule(list, text, TOP);
  assert.ok(!m.distant);
});

test("stray: 뜻 키워드가 둘레에 있으면 유지", () => {
  const text = medText("미분화 입자크기 와 용해속도를 비교하였다.");
  const m = term(text, "미분화", { slug: "x", title_ko: "미분화", title_en: "micronization", categories: ["pharm"], sense: ["입자크기", "용해속도"] });
  const list = fillers(text).concat([m]);
  TM.applySenseContextRule(list, text, TOP);
  assert.ok(!m.distant);
});

test("stray: 연구 기초·방법 용어와 뜻 키워드 없는 용어는 건드리지 않는다", () => {
  const text = medText("백분율로 나타내었다. 임피던스를 쟀다.");
  const pct = term(text, "백분율", { slug: "pct", title_ko: "백분율", title_en: "Percentage", categories: ["math"], sense: ["수학", "비율"] });
  const nosense = term(text, "임피던스", { slug: "imp", title_ko: "임피던스", title_en: "Impedance", categories: ["eng"], sense: [] });
  // math 는 CATEGORY_GROUPS 에서 연구 기초·방법 → 제외, sense 비면 판단 보류
  const list = fillers(text).concat([pct, nosense]);
  TM.applySenseContextRule(list, text, TOP);
  assert.ok(!nosense.distant, "뜻 키워드 없음 → 보류");
  assert.ok(!pct.distant || TM.fieldGroupOf("math") !== "연구 기초·방법", "기초 분야 용어 제외");
});

test("stray: 저자가 괄호로 영문 병기한 뜻은 인정", () => {
  const text = medText("신경조절술(Neuromodulation) 효과를 평가하였다.");
  const m = term(text, "Neuromodulation", { slug: "nm", title_ko: "신경조절술", title_en: "Neuromodulation", categories: ["biomed"], sense: ["생체의공학", "전기자극"], viaHangul: false });
  const list = fillers(text).concat([m]);
  TM.applySenseContextRule(list, text, TOP);
  assert.ok(!m.distant);
});

test("stray: 4글자 이상 대문자 약어는 제외", () => {
  const text = medText("Editorial ORCID: https://orcid.org/0000 로 식별한다.");
  const m = term(text, "ORCID", { slug: "orcid", title_ko: "ORCID", title_en: "ORCID", categories: ["ethics"], sense: ["연구윤리", "식별"], viaHangul: false });
  const list = fillers(text).concat([m]);
  TM.applySenseContextRule(list, text, TOP);
  assert.ok(!m.distant);
});

test("stray: 살아 있는 용어가 6개 미만이면 쓰지 않는다(붙여넣기 짧은 글)", () => {
  const text = "미분화 갑상선암과 유사하여 감별이 어렵다. 면역조직화학염색 시행.";
  const micro = term(text, "미분화", { slug: "micronization", title_ko: "미분화", title_en: "micronization", categories: ["pharm"], sense: ["약학", "용해속도"] });
  const f = term(text, "면역조직화학염색", { slug: "f", title_ko: "면역조직화학염색", title_en: "IHC", categories: ["bio"] });
  const list = [f, micro];
  TM.applyStrayRule(list, text, TOP);
  assert.ok(!micro.distant);
});

test("same-span: 같은 영문 표제 Presence 두 용어는 뒷받침이 없으면 모두 강등", () => {
  const text = medText("Hepatitis B surface Ag Presence in Serum, HBsAg Presence in Serum");
  const mk = (slug, ko, cat, sense) => term(text, "Presence", { slug, title_ko: ko, title_en: "Presence", categories: [cat], sense, viaHangul: false });
  const a = mk("presence-dance", "무용 현존성", "dance", ["무용학", "무용수"]);
  const b = mk("presence-performance", "현존", "film", ["공연예술학", "관객"]);
  const list = fillers(text).concat([a, b]);
  TM.applySameSpanRule(list, text);
  assert.equal(a.distant, true);
  assert.equal(b.distant, true);
});

test("same-span: 한쪽만 문서가 뒷받침하면 그쪽만 남긴다", () => {
  const text = medText("Presence 관객 무용수 ");
  const mk = (slug, cat, sense) => term(text, "Presence", { slug, title_ko: slug, title_en: "Presence", categories: [cat], sense, viaHangul: false });
  const a = mk("p-dance", "dance", ["무용수", "관객"]);
  const b = mk("p-film", "film", ["촬영", "감독"]);
  const list = fillers(text).concat([a, b]);
  TM.applySameSpanRule(list, text);
  assert.ok(!a.distant);
  assert.equal(b.distant, true);
});

test("영문으로만 잡힌 용어: 둘레에 같은 낱말이 또 나와도 뜻 증거가 아니다(gamma)", () => {
  const text = medText("Interferon gamma (IGRA) 와 Interferon gamma 양성, stimulated gamma 값");
  const g = term(text, "gamma", { slug: "gamma-option", title_ko: "감마", title_en: "Gamma", categories: ["finance"], sense: ["금융학", "옵션", "델타", "gamma"], viaHangul: true });
  const list = fillers(text).concat([g]);
  TM.applySenseContextRule(list, text, TOP);
  assert.equal(g.distant, true);
});

test("한글 자리가 하나라도 있으면 병기한 영문은 증거로 남는다(촉매 … (catalyst))", () => {
  const text = medText("촉매(catalyst) 와 자성유체");
  const o = occ(text, "촉매").concat(occ(text, "catalyst"));
  const m = Object.assign(term(text, "촉매", { slug: "cat", title_ko: "촉매", title_en: "Catalyst", categories: ["chem"], sense: ["화학", "catalyst"] }), { occurrences: o, count: o.length });
  const list = fillers(text).concat([m]);
  TM.applySenseContextRule(list, text, ["자연과학"]);
  assert.ok(!m.distant, "병기 영문이 뜻 키워드로 센다");
});
