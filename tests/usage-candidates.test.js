// scripts/oa/find-usage-candidates.js : 작은 가짜 말뭉치로 검색어·거르기·중복·출처 모양을 검사한다.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { findCandidates, needlesFor, looksLikeDebris, splitSentences } = require("../scripts/oa/find-usage-candidates.js");

const CORPUS = path.join(__dirname, "fixtures", "usage-corpus");
const cohen = { slug: "cohens-d", title_ko: "코헨의 디 (Cohen's d)", title_en: "Cohen's d", aliases: ["코헨 d", "디"] };

test("검색어: 괄호 분리, 두 글자 한글 별칭 제외, 영문 최소 3자", () => {
  const n = needlesFor(cohen).map((x) => x.text);
  assert.ok(n.includes("코헨의 디") && n.includes("Cohen's d") && n.includes("코헨 d"));
  assert.ok(!n.includes("디"));
  assert.ok(!needlesFor({ slug: "a", title_ko: "가", title_en: "ab" }).length);
});

test("문장 분리: 줄바꿈으로 끊긴 문장을 잇는다", () => {
  const s = splitSentences("가나다라 마바사\n아자차카타 파하다. 둘째 문장이다.");
  assert.strictEqual(s[0], "가나다라 마바사 아자차카타 파하다.");
});

test("찌꺼기 판별: 참고문헌·숫자표·너무 짧은 문장은 제외", () => {
  assert.ok(looksLikeDebris("김철수, 이영희, 박민수 (2019). 코헨의 디에 관한 고찰. 한국통계학회지, 12(3), 45-67."));
  assert.ok(looksLikeDebris("1.2 3.4 5.6 7.8 9.1 2.3 4.5 6.7 코헨의 디 8.9 1.1 2.2 3.3 4.4"));
  assert.ok(looksLikeDebris("짧은 코헨의 디."));
  assert.ok(!looksLikeDebris("본 연구에서는 효과크기로 코헨의 디를 산출하여 집단 간 차이의 크기를 비교하였다."));
});

test("후보 탐색: 중복 제거, 참고문헌 줄 제외, 출처 모양(kciId / koreamed)", () => {
  const res = findCandidates([cohen, { slug: "none", title_ko: "존재하지않는용어", title_en: "Nonexistent term" }], CORPUS, { max: 15 });
  const c = res["cohens-d"];
  assert.strictEqual(c.length, 2); // KCI 1(중복 합침) + KoreaMed 1
  assert.ok(c.every((e) => e.quote.length >= 30 && e.quote.length <= 220));
  assert.ok(!c.some((e) => /한국통계학회지|\(2019\)/.test(e.quote)));
  const kci = c.find((e) => e.kciId), km = c.find((e) => e.source === "koreamed");
  assert.deepStrictEqual(Object.keys(kci), ["quote", "title", "journal", "year", "url", "kciId", "matched"]);
  assert.strictEqual(kci.kciId, "ART000001");
  assert.strictEqual(km.koreamedId, "7777");
  assert.strictEqual(km.url, "https://synapse.koreamed.org/articles/7777");
  assert.deepStrictEqual(res.none, []);
});

test("영문 검색어는 단어 경계를 지킨다(Mann-Whitney U test)", () => {
  const hit = findCandidates([{ slug: "mw", title_ko: "맨-휘트니 U 검정", title_en: "Mann-Whitney U test" }], CORPUS);
  assert.strictEqual(hit.mw.length, 1);
  const miss = findCandidates([{ slug: "x", title_ko: "없는말", title_en: "Whitney U tes" }], CORPUS);
  assert.deepStrictEqual(miss.x, []);
});

test("짧은 영문 약어는 대소문자를 구분한다", () => {
  const { matchNeedle: mn } = require("../scripts/oa/find-usage-candidates.js");
  const n = { text: "AGE", kind: "en" };
  assert.ok(!mn("연령집단 age cohort 차원에서 분석하였다", "연령집단 age cohort 차원에서 분석하였다", n));
  assert.ok(mn("최종당화산물 AGE 가 축적되었다", "최종당화산물 age 가 축적되었다", n));
});
