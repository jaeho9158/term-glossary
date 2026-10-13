const test = require("node:test");
const assert = require("node:assert/strict");
const { firstPerPage, planPageSpans, wordEdges } = require("../assets/reader/terms-layer.js");
const { computeKeptSpans, splitMatchesByPage, buildPageOffsets } = require("../assets/term-match.js");

test("firstPerPage: 용어마다 가장 앞의 등장 하나만", () => {
  const out = firstPerPage([
    { slug: "a", start: 5, end: 7 },
    { slug: "a", start: 20, end: 22 },
    { slug: "b", start: 9, end: 12 },
  ]);
  assert.deepEqual(out.map((m) => [m.slug, m.start, m.end]), [["a", 5, 7], ["b", 9, 12]]);
});

test("firstPerPage: 빈 입력은 []", () => {
  assert.deepEqual(firstPerPage([]), []);
  assert.deepEqual(firstPerPage(undefined), []);
  assert.deepEqual(firstPerPage(null), []);
});

test("firstPerPage: 입력 순서와 상관없이 가장 앞을 고르고 시작 순으로 돌려준다", () => {
  const out = firstPerPage([
    { slug: "a", start: 30, end: 32 },
    { slug: "b", start: 9, end: 12 },
    { slug: "a", start: 5, end: 7 },
  ]);
  assert.deepEqual(out.map((m) => [m.slug, m.start]), [["a", 5], ["b", 9]]);
});

test("firstPerPage: 길이 0이거나 깨진 항목은 버린다", () => {
  const out = firstPerPage([{ slug: "a", start: 5, end: 5 }, null, { start: 1, end: 2 }, { slug: "b", start: 1, end: 3 }]);
  assert.deepEqual(out.map((m) => m.slug), ["b"]);
});

test("planPageSpans: 같은 자리에서 겹치면 긴 용어가 이긴다(computeKeptSpans 기준)", () => {
  // tests/viewer-keptspans.test.js 의 사례: 분산(0,2) 과 분산분석(0,4)
  const matches = [
    { slug: "분산", firstStart: 0, firstLength: 2 },
    { slug: "분산분석", firstStart: 0, firstLength: 4 },
  ];
  const kept = computeKeptSpans("분산분석", matches);
  assert.equal(kept.length, 1);
  const out = planPageSpans("분산분석", matches);
  assert.equal(out.length, 1);
  assert.equal(out[0].slug, "분산분석");
  assert.equal(out[0].start, 0);
  assert.equal(out[0].end, 4);
  assert.deepEqual(out[0].covered, ["분산분석", "분산"]);
});

test("planPageSpans: 같은 용어가 여러 번 나와도 처음 한 곳만, 앞 자리가 긴 용어에 덮이면 다음 자리", () => {
  const text = "분산분석 그리고 분산 그리고 분산";
  const matches = [
    { slug: "분산", firstStart: 0, firstLength: 2, occurrences: [{ start: 0, length: 2 }, { start: 10, length: 2 }, { start: 17, length: 2 }] },
    { slug: "분산분석", firstStart: 0, firstLength: 4, occurrences: [{ start: 0, length: 4 }] },
  ];
  const out = planPageSpans(text, matches);
  assert.deepEqual(out.map((m) => [m.slug, m.start, m.end]), [["분산분석", 0, 4], ["분산", 10, 12]]);
});

test("planPageSpans: 문서 전체 매치를 쪽으로 나눈 사본으로도 쪽 기준 위치가 나온다", () => {
  const pages = ["서론 유의확률은 작다", "표본 크기와 유의확률"];
  const offsets = buildPageOffsets(pages);
  const whole = pages.join("\n");
  const at = whole.indexOf("유의확률");
  const at2 = whole.lastIndexOf("유의확률");
  const matches = [{ slug: "p-value", firstStart: at, firstLength: 4, occurrences: [{ start: at, length: 4 }, { start: at2, length: 4 }], count: 2 }];
  const byPage = splitMatchesByPage(matches, offsets);
  const p2 = planPageSpans(pages[1], byPage.get(2));
  assert.deepEqual(p2.map((m) => [m.slug, m.start, m.end]), [["p-value", pages[1].indexOf("유의확률"), pages[1].indexOf("유의확률") + 4]]);
});

test("wordEdges: 낱말 경계는 앞뒤가 글자·숫자가 아닐 때", () => {
  const t = "표본 유의확률은 작다";
  const s = t.indexOf("유의확률");
  const e = wordEdges(t, s, s + 4);
  assert.equal(e.left, true, "앞이 공백");
  assert.equal(e.right, false, "뒤가 조사 '은'");
  assert.deepEqual(wordEdges("분산", 0, 2), { left: true, right: true });
  assert.deepEqual(wordEdges("(분산)", 1, 3), { left: true, right: true });
  assert.equal(wordEdges("ANOVA2", 0, 5).right, false);
});
