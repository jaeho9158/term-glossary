// 실제 논문 말뭉치 통계 파이프라인(scripts/oa/*)과 인덱스 생성기 연동 (a)(b)(c).
const test = require("node:test");
const assert = require("node:assert");
const { parseIssue, parseJournalList, fieldOf } = require("../scripts/oa/collect-koreamed.js");
const { stripExcluded, hangulCount } = require("../scripts/oa/extract-text.js");
const { buildStats } = require("../scripts/oa/build-stats.js");
const gen = require("../scripts/generate-viewer-index.js");
const { applySenseContextRule, decodeDefChunk } = require("../assets/viewer.js");

test("수집기: 저널 이름으로 분야 코드", () => {
  assert.strictEqual(fieldOf("Korean Journal of Adult Nursing"), "nursing");
  assert.strictEqual(fieldOf("Journal of Korean Academy of Oral Health"), "dent");
  assert.strictEqual(fieldOf("Korean Journal of Community Nutrition"), "food");
  assert.strictEqual(fieldOf("The Korean Journal of Gastroenterology"), "med");
});

test("수집기: 저널 목록 행 파싱(이름의 이상한 문자는 버린다)", () => {
  const html = `<tr><td><a href="/journals/28/" x><span title="The Korean Journal of Gastroenterology&curl x">A</span></a></td>
    <td><a href="/issues/11934/" style="">
    v. 86(3)<br/>
    Jul 2026</a></td></tr>`;
  const [j] = parseJournalList(html);
  assert.deepStrictEqual({ ...j }, { jid: "28", name: "The Korean Journal of Gastroenterology&curl x", latestIssue: "11934", year: 2026 });
});

test("수집기: 호 페이지에서 국문 제목·KMSID·PDF 링크", () => {
  const html = `<tr class="issu_tr"><td>
    <a class="articleTitle" href="/articles/1"><span class="titelEn">Eng</span><span class="titelKo" style="display:none;">식도 <em>질환</em></span></a>
    KMSID: 1516096672&nbsp;<a href='/journals/28/'>Korean J Gastroenterol.</a> 2026;86(3):193-198.
    <a href="/func/download.php?path=AAA=&amp;filename=BBB==")'><img/></a></td></tr>`;
  const [a] = parseIssue(html);
  assert.strictEqual(a.id, "1516096672");
  assert.strictEqual(a.title, "식도 질환");
  assert.strictEqual(a.year, 2026);
  assert.strictEqual(a.url, "https://synapse.koreamed.org/func/download.php?path=AAA=&filename=BBB==");
});

test("추출기: 참고문헌 구간을 빼고 한글 수를 센다", () => {
  const text = "서론\n본문 내용이다.\n참고문헌\nKim J. Title. 2020;35:1-5.\n";
  const out = stripExcluded(text);
  assert.ok(out.includes("본문 내용"));
  assert.ok(!out.includes("Kim J."));
  assert.strictEqual(hangulCount("가나 abc 다"), 3);
});

const TERMS = [
  { slug: "stress", title_ko: "스트레스", title_en: "Stress", categories: ["psych"], common: 0, common_en: 0 },
  { slug: "cortisol", title_ko: "코르티솔", title_en: "Cortisol", categories: ["med"], common: 0, common_en: 0 },
];

test("통계: df·fields·count·cooc(2편 이상에서 같이 나온 명사만)", () => {
  const docs = [
    { id: "1", field: "nursing", source: "koreamed", text: "환자의 스트레스와 코르티솔 수치를 측정하였다. 스트레스가 높았다." },
    { id: "2", field: "med", source: "koreamed", text: "스트레스 반응에서 코르티솔 분비가 늘었다." },
    { id: "3", field: "med", source: "koreamed", text: "수술 후 회복을 보았다." },
  ];
  const s = buildStats(docs, TERMS);
  assert.strictEqual(s.docs, 3);
  assert.strictEqual(s.terms.stress.df, 2);
  assert.strictEqual(s.terms.stress.count, 3);
  assert.deepStrictEqual(s.terms.stress.fields, { nursing: 1, med: 1 });
  assert.ok(s.terms.stress.cooc.includes("코르티솔"));
  assert.ok(!s.terms.stress.cooc.includes("스트레스"));
});

const OA = {
  fieldDocs: { med: 80, nursing: 10, food: 10 },
  docs: 100,
  terms: {
    // (a) 40% 이상 문서 + 4개 분야 이상 → 등급 2
    everywhere: { df: 45, fields: { med: 20, nursing: 10, dent: 10, food: 5 } },
    narrow: { df: 45, fields: { med: 45 } },
    // (b) 자기 분야군(의학·생명) 문서가 20% 미만 — 식품 논문에서만 주로 나옴
    med_elsewhere: { df: 10, fields: { food: 9, med: 1 } },
    // 자기 분야군(자연과학·연구 기초)이 말뭉치에 거의 없으면 판단하지 않는다
    phys_term: { df: 10, fields: { med: 9, food: 1 } },
    stat_term: { df: 10, fields: { med: 9, food: 1 } },
    med_term: { df: 10, fields: { med: 9, food: 1 }, cooc: ["환자", "수술", "치료"] },
  },
};

test("연동 (a): 말뭉치 문서빈도·분야 폭으로 등급 2 승격(3은 만들지 않음)", () => {
  const grades = new Map([["어디나", 0], ["좁은말", 0], ["이미3", 3]]);
  const terms = [
    { slug: "everywhere", title_ko: "어디나", categories: ["med"] },
    { slug: "narrow", title_ko: "좁은말", categories: ["med"] },
    { slug: "already", title_ko: "이미3", categories: ["med"] },
  ];
  gen.applyOaGrades(grades, terms, { ...OA, terms: { ...OA.terms, already: OA.terms.everywhere } });
  assert.strictEqual(grades.get("어디나"), 2);
  assert.strictEqual(grades.get("좁은말"), 0);
  assert.strictEqual(grades.get("이미3"), 3);
  // 말뭉치 없음 → no-op
  const g2 = new Map([["어디나", 0]]);
  gen.applyOaGrades(g2, terms, null);
  assert.strictEqual(g2.get("어디나"), 0);
});

test("연동 (b): 자기 분야군 밖에서 주로 쓰이는 용어 표시", () => {
  const terms = [
    { slug: "med_elsewhere", title_ko: "탄성", categories: ["med"] },
    { slug: "phys_term", title_ko: "응력", categories: ["phys"] },
    { slug: "stat_term", title_ko: "신뢰도", categories: ["stat"] },
    { slug: "med_term", title_ko: "수술", categories: ["med"] },
  ];
  const flags = gen.oaOutsideFlags(terms, OA);
  assert.deepStrictEqual([...flags], ["med_elsewhere"]);
  assert.strictEqual(gen.oaOutsideFlags(terms, null).size, 0);
});

test("연동 (b): 청크 항목 o:1 → 뷰어가 상위 분야군 안에서도 규칙 1 검사", () => {
  const buckets = gen.buildDefBuckets([{ slug: "phys_term", definition: "정의" }], new Map([["phys_term", ["응력"]]]), new Set(["phys_term"]));
  const entry = buckets[gen.defBucket("phys_term")].phys_term;
  assert.deepStrictEqual(entry, { d: "정의", s: "응력", o: 1 });
  assert.strictEqual(decodeDefChunk({ x: entry }).get("x").outside, true);
  const text = "탄성 섬유가 풍부한 피부 조직을 관찰하였다.";
  const mk = (outside) => ({ slug: "phys_term", title_ko: "탄성", title_en: "Elasticity", categories: ["phys"],
    sense: ["응력", "변형"], viaHangul: true, occurrences: [{ start: 0, length: 2 }], oaOutside: outside });
  // 자연과학이 상위 분야군이면 보통은 검사를 건너뛴다
  assert.ok(!applySenseContextRule([mk(false)], text, ["자연과학"])[0].distant);
  assert.strictEqual(applySenseContextRule([mk(true)], text, ["자연과학"])[0].distant, true);
});

test("연동 (c): cooc 상위 토큰을 뜻 키워드에 합집합(한글 12개 상한, cooc 우선)", () => {
  const senses = new Map([["med_term", ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "surgery"]]]);
  const terms = [{ slug: "med_term", title_ko: "수술", title_en: "Surgery", categories: ["med"] }];
  gen.mergeOaCooc(senses, terms, OA);
  const s = senses.get("med_term");
  assert.deepStrictEqual(s.slice(0, 2), ["환자", "치료"]); // 제 표제어(수술)는 뺀다
  assert.strictEqual(s.filter((w) => /[가-힣]/.test(w)).length, 12);
  assert.ok(s.includes("surgery"));
  const before = new Map(senses);
  gen.mergeOaCooc(senses, terms, null);
  assert.deepStrictEqual(senses, before);
});
