// 실제 PDF 문장 단위 회귀: 검수에서 나온 틀린 뜻 표시가 다시 살아나지 않게 한다.
// viewer-index.json·viewer-defs 로 실제 매칭 파이프라인(matchTermsWithIndex → applySenseToMatches → pruneMatches)을 돌린다.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const TM = require("../assets/term-match.js");
const { pruneMatches } = require("../assets/reader/terms-layer.js");

const ROOT = path.join(__dirname, "..");
const terms = TM.decodeViewerIndex(JSON.parse(fs.readFileSync(path.join(ROOT, "viewer-index.json"), "utf8")));
const index = TM.buildExactIndex(terms);
const chunks = new Map();
function attach(ms) {
  for (const m of ms) {
    const b = TM.defBucket(m.slug);
    if (!chunks.has(b)) {
      const f = path.join(ROOT, "viewer-defs", String(b).padStart(3, "0") + ".json");
      chunks.set(b, fs.existsSync(f) ? TM.decodeDefChunk(JSON.parse(fs.readFileSync(f, "utf8"))) : new Map());
    }
    const e = chunks.get(b).get(m.slug);
    m.sense = e ? e.sense : m.sense || [];
    if (e && e.outside) m.oaOutside = true;
  }
  return ms;
}
function marked(text) {
  const exact = attach(TM.matchTermsWithIndex(text, index));
  return pruneMatches(TM.applySenseToMatches(exact, text), text).filter((m) => !m.distant).map((m) => m.slug);
}

// 의학 증례 문서의 뒷받침 문장 + 시험 문장
const MED = [
  "초음파 유도하 세침흡인검사(fine needle aspiration; FNA)를 시행하였다.",
  "면역조직화학염색에서 CD5가 양성이었다. 감별진단이 어렵고 림프구 침윤이 동반된다.",
  "수술 후 보조 방사선치료를 시행하였다. 고혈압 외에 당뇨병이나 간염의 병력은 없었다.",
  "Immunohistochemistry showed positivity. 초음파검사와 PET-CT를 시행하였다.",
].join(" ");

test("미분화 갑상선암의 미분화는 약학 미분화(micronization)가 아니다", () => {
  const got = marked(MED + " 임상적 소견이 미분화 갑상선암 등과 유사하여 감별진단이 어렵다.");
  assert.ok(!got.includes("micronization"), got.join());
});
test("석회화나 낭성 변화 — 해양 석회화로 잡히지 않는다", () => {
  const got = marked(MED + " 초음파에서 석회화나 낭성 변화를 거의 보이지 않는다.");
  assert.ok(!got.includes("calcification-marine"), got.join());
});
test("single nucleotide polymorphism 속 polymorphism 은 결정다형성이 아니다", () => {
  const got = marked(MED + " 일염기유전자다형성(sin- gle nucleotide polymorphism, 이하 SNP)에 대한 데이터를 구성한다. 이 polymorphism 은 흔하다.");
  assert.ok(!got.includes("polymorphism-pharm"), got.join());
});
test("transcription factor 속 transcription 은 따로 표시하지 않는다", () => {
  const got = marked(MED + " 뇌에서 발현되는 전사인자(transcription factor)인 myelin transcription fac-\ntor 1)로 예측된다.");
  assert.ok(!got.includes("transcription"), got.join());
});
test("Interferon gamma 의 gamma 는 옵션 감마가 아니다", () => {
  const rows = "Specific Ag induced Interferon gamma (IGRA) (15, 51.7%), Interferon gamma test, stimulated gamma value. 국가건강검진 및 효소면역측정법(EIA) 검사 항목 표준화 방안";
  const got = marked(rows + " " + MED);
  assert.ok(!got.includes("gamma-option"), got.join());
});
test("[Presence] 열(LOINC 속성)은 무용·공연 현존으로 잡히지 않는다", () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push("5196-" + i + " Hepatitis B virus surface Ag [Presence] in Serum or Plasma");
  const got = marked(rows.join("\n") + "\n" + MED);
  assert.ok(!got.includes("presence-dance") && !got.includes("presence-performance"), got.join());
});
test("검사 항목의 통일성은 디자인의 통일성이 아니다", () => {
  const got = marked("이를 활용한 표준화는 검사 항목의 통일성과 정확성을 높이고 의료 데이터의 국제적 교환과 협력을 돕는다. " + MED);
  assert.ok(!got.includes("visual-unity"), got.join());
});
test("뒷받침이 충분한 정상 용어는 유지된다", () => {
  const got = marked(MED);
  for (const slug of ["differential-diagnosis", "lymphocyte", "ultrasonography"]) assert.ok(got.includes(slug), slug + " ∉ " + got.join());
});
