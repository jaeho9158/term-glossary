// 위험한 표면형(일상어와 겹치는 표제어, 2026-10): 문서 안 강한 증거가 있을 때만 표시한다.
// 증거 = (a) 저자 병기 + 뜻 키워드 1개 이상 (b) 뜻 키워드 2개 이상 (c) 같은 쪽의 같은 세부 분야 용어 2개 이상.
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
function fillers(text) {
  return FILLER.map((w, i) => term(text, w, { slug: "f" + i, title_ko: w, title_en: "Filler Term " + i, categories: [i % 2 ? "med" : "bio"] }));
}
const BASE = FILLER.join(" 그리고 ");
const TOP = ["의학·생명"];

function agency(text) {
  return term(text, "대리", { slug: "agency-civil-law", title_ko: "대리", title_en: "Agency", categories: ["law"], sense: ["법학", "본인", "대리인", "법률행위", "무권대리"] });
}

test("목록: 작업 대상 슬러그가 들어 있고 60개 안팎", () => {
  const s = TM.RISKY_SURFACE_SLUGS;
  for (const slug of ["agency-civil-law", "spread-effect", "modeling-imitation", "pet-imaging", "sensitivity"]) assert.ok(s.has(slug), slug);
  assert.ok(s.size >= 12 && s.size <= 65, "크기 " + s.size);
});

test("증거 없는 위험 표제어는 강등(demotedBy=risky)", () => {
  const text = BASE + " 구매 지불 대리 지갑 수수료 후기.";
  const m = agency(text);
  const list = fillers(text).concat([m]);
  TM.applyRiskyRule(list, text, TOP);
  assert.equal(m.distant, true);
  assert.equal(m.demotedBy, "risky");
  assert.ok(list.slice(0, 6).every((x) => !x.distant), "목록 밖 용어는 그대로");
});

test("(a) 문서가 영문 표제를 병기하면 유지", () => {
  const text = BASE + " 법률행위의 대리(Agency)에 관한 규정을 검토하였다.";
  const m = agency(text);
  const list = fillers(text).concat([m]);
  TM.applyRiskyRule(list, text, TOP);
  assert.ok(!m.distant);
  assert.equal(TM.riskyEvidence(m, text, list, TOP), "gloss");
});

test("(b) 뜻 키워드가 둘레에 2개 이상이면 유지, 1개면 강등", () => {
  const two = BASE + " 본인을 위한 대리인이 법률행위를 한다. 대리 권한.";
  const m2 = agency(two);
  TM.applyRiskyRule(fillers(two).concat([m2]), two, TOP);
  assert.ok(!m2.distant);
  const one = BASE + " 본인이 대리 권한을 준다.";
  const m1 = agency(one);
  TM.applyRiskyRule(fillers(one).concat([m1]), one, TOP);
  assert.equal(m1.distant, true);
});

test("(b) 표제어 안에 든 키워드(부적응⊃적응)와 2글자 키워드는 증거가 아니다", () => {
  const text = BASE + " 학교 부적응과 환경 문제, 적응 곤란.";
  const m = term(text, "부적응", { slug: "maladaptation", title_ko: "부적응", title_en: "Maladaptation", categories: ["env"], sense: ["환경학", "환경", "적응", "적응역량", "기후변화"] });
  TM.applyRiskyRule(fillers(text).concat([m]), text, TOP);
  assert.equal(m.distant, true);
});

test("(c) 같은 쪽의 같은 세부 분야 용어가 있으면 유지, 연구 기초·방법 용어는 동료로 치지 않는다", () => {
  const text = BASE + " 법률 대리 와 계약 그리고 소송.";
  const m = agency(text);
  const peer = term(text, "계약", { slug: "contract", title_ko: "계약", title_en: "Contract", categories: ["law"] });
  const peer2 = term(text, "소송", { slug: "lawsuit", title_ko: "소송", title_en: "Lawsuit", categories: ["law"] });
  const list = fillers(text).concat([m, peer, peer2]);
  TM.applyRiskyRule(list, text, TOP);
  assert.ok(!m.distant);
  // 이웃이 하나뿐이면 우연한 겹침일 수 있어 유지하지 않는다.
  const m1 = agency(text);
  TM.applyRiskyRule(fillers(text).concat([m1, peer]), text, TOP);
  assert.equal(m1.distant, true);
  const m2 = agency(text);
  const basic = term(text, "계약", { slug: "stat-thing", title_ko: "계약", title_en: "X", categories: ["law", "method"] });
  TM.applyRiskyRule(fillers(text).concat([m2, basic]), text, TOP);
  assert.equal(m2.distant, true);
});

test("목록 밖 용어와 6개 미만 문서는 건드리지 않는다", () => {
  const text = BASE + " 구매 지불 대리 지갑.";
  const other = term(text, "대리", { slug: "not-listed", title_ko: "대리", title_en: "X", categories: ["law"] });
  TM.applyRiskyRule(fillers(text).concat([other]), text, TOP);
  assert.ok(!other.distant);
  const short = "구매 지불 대리 지갑";
  const m = agency(short);
  TM.applyRiskyRule([m], short, TOP);
  assert.ok(!m.distant, "잡힌 용어 6개 미만이면 옛 동작");
});
