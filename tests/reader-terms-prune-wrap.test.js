// pruneMatches: 영문 표제 덮개 — 줄바꿈 하이픈을 이어 읽고, 같은 길이의 다른 용어끼리는 덮지 않는다.
const test = require("node:test");
const assert = require("node:assert");
const { pruneMatches } = require("../assets/reader/terms-layer.js");

function m(slug, en, text, word) {
  const occ = [];
  let i = -1;
  while ((i = text.indexOf(word, i + 1)) !== -1) occ.push({ start: i, length: word.length });
  return { slug, title_ko: slug, title_en: en, occurrences: occ, firstStart: occ[0] ? occ[0].start : -1, firstLength: word.length, count: occ.length };
}

test("줄바꿈 하이픈으로 갈라진 영문 표제도 덮개로 쓴다(transcription fac- tor)", () => {
  const text = "domain, class 3, transcription fac-\ntor 1) 전사인자(transcription factor)";
  const list = [m("tf", "Transcription Factor", text, "전사인자"), m("tr", "transcription", text, "transcription")];
  list[0].occurrences = [{ start: text.indexOf("전사인자"), length: 4 }];
  list[0].firstStart = list[0].occurrences[0].start;
  const out = pruneMatches(list, text);
  const tr = out.find((x) => x.slug === "tr");
  // 줄바꿈 속 첫 등장은 덮이고, 두 번째(괄호 안 "transcription factor")도 덮여 남지 않는다
  assert.equal(tr, undefined);
  assert.ok(out.find((x) => x.slug === "tf"));
});

test("공백 하이픈 줄바꿈(sin- gle)도 이어 읽는다", () => {
  const text = "일염기유전자다형성(sin- gle nucleotide polymorphism, SNP)";
  const poly = m("poly", "polymorphism", text, "polymorphism");
  const snp = { slug: "snp", title_ko: "snp", title_en: "Single nucleotide polymorphism (SNP)", occurrences: [{ start: 0, length: 4 }], firstStart: 0, firstLength: 4, count: 1 };
  const out = pruneMatches([poly, snp], text);
  assert.equal(out.find((x) => x.slug === "poly"), undefined);
});

test("같은 영문 표제를 가진 두 용어가 같은 자리를 차지해도 서로를 덮어 없애지 않는다", () => {
  const text = "Hepatitis B surface Ag Presence in Serum";
  const a = m("pa", "Presence", text, "Presence");
  const b = m("pb", "Presence", text, "Presence");
  const out = pruneMatches([a, b], text);
  assert.deepEqual(out.map((x) => x.slug), ["pa", "pb"]);
});

test("하이픈 뒤가 대문자면 이어 붙이지 않는다", () => {
  const text = "transcription- Factor";
  const inner = m("tr", "transcription", text, "transcription");
  const tf = { slug: "tf", title_ko: "tf", title_en: "Transcription Factor", occurrences: [{ start: 99, length: 4 }], firstStart: 99, firstLength: 4, count: 1 };
  const out = pruneMatches([inner, tf], text);
  assert.ok(out.find((x) => x.slug === "tr"));
});
