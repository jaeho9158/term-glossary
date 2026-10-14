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

const { refineFlags, resolveAssetVersion } = require("../assets/reader/terms-layer.js");

test("wordEdges: 줄 처음·문장부호·쪽 글 끝", () => {
  assert.deepEqual(wordEdges("유의확률은 작다", 0, 4), { left: true, right: false }, "줄 처음 + 조사");
  assert.deepEqual(wordEdges("값(유의확률)이다", 2, 6), { left: true, right: true }, "괄호 안");
  assert.deepEqual(wordEdges("a, 분산. b", 3, 5), { left: true, right: true }, "마침표는 경계");
  assert.deepEqual(wordEdges("표본 분산", 3, 5), { left: true, right: true }, "쪽 글 끝");
  assert.deepEqual(wordEdges("표본분산", 2, 4), { left: false, right: true }, "앞이 글자");
});

test("refineFlags: refine 은 두 가장자리가 모두 경계일 때만, 가장자리별 표지는 그대로", () => {
  const t = "표본 유의확률은 작다";
  const s = t.indexOf("유의확률");
  assert.deepEqual(refineFlags(t, s, s + 4), { refine: false, refineLeft: true, refineRight: false });
  assert.deepEqual(refineFlags("분산", 0, 2), { refine: true, refineLeft: true, refineRight: true });
  assert.deepEqual(refineFlags("표본분산이", 2, 4), { refine: false, refineLeft: false, refineRight: false });
});

test("resolveAssetVersion: 자기 src 의 v → term-match.js 의 v → 빈 문자열", () => {
  assert.equal(resolveAssetVersion(["http://x/assets/reader/terms-layer.js?v=abc", "http://x/assets/term-match.js?v=zzz"]), "abc");
  assert.equal(resolveAssetVersion(["http://x/assets/reader/terms-layer.js", "http://x/assets/term-match.js?a=1&v=zzz"]), "zzz");
  assert.equal(resolveAssetVersion(["http://x/assets/reader/terms-layer.js", "http://x/assets/term-match.js"]), "");
  assert.equal(resolveAssetVersion([undefined, null]), "");
  assert.equal(resolveAssetVersion(), "");
});

test("pruneMatches: 주소 속 용어와 더 긴 다른 용어 속 용어는 뺀다", () => {
  const { pruneMatches } = require("../assets/reader/terms-layer.js");
  const text = "see https://example.org/aspiration-page and fine needle aspiration then aspiration alone";
  const at = (w, from) => text.indexOf(w, from || 0);
  const url = at("aspiration");
  const longStart = at("fine needle aspiration");
  const innerStart = longStart + "fine needle ".length;
  const alone = at("aspiration", innerStart + 5);
  const matches = [
    { slug: "asp", title_ko: "흡인", occurrences: [{ start: url, length: 10 }, { start: innerStart, length: 10 }, { start: alone, length: 10 }], firstStart: url, firstLength: 10, count: 3 },
    { slug: "fna", title_ko: "세침흡인검사", occurrences: [{ start: longStart, length: 22 }], firstStart: longStart, firstLength: 22, count: 1 },
  ];
  const out = pruneMatches(matches, text);
  assert.deepEqual(out[0].occurrences, [{ start: alone, length: 10 }]);
  assert.equal(out[0].firstStart, alone);
  assert.equal(out[0].count, 1);
  assert.equal(out[1], matches[1]);
  assert.equal(matches[0].occurrences.length, 3, "입력은 바꾸지 않는다");
});

test("pruneMatches: 영문 표제 구절 안에 든 다른 용어는 한글 표제로만 잡힌 경우에도 뺀다", () => {
  const { pruneMatches } = require("../assets/reader/terms-layer.js");
  const mk = (text) => {
    const a = text.indexOf("aspiration");
    return [
      { slug: "fna", title_ko: "세침흡인검사", title_en: "Fine Needle Aspiration (FNA)", occurrences: [{ start: 0, length: 6 }], firstStart: 0, firstLength: 6, count: 1 },
      { slug: "asp", title_ko: "기도흡인", title_en: "Aspiration", occurrences: [{ start: a, length: 10 }], firstStart: a, firstLength: 10, count: 1 },
    ];
  };
  const t1 = "세침흡인검사(fine needle aspiration; FNA)";
  assert.deepEqual(pruneMatches(mk(t1), t1).map((m) => m.slug), ["fna"]);
  const t2 = "세침흡인검사(FNA) 후 aspiration";
  assert.deepEqual(pruneMatches(mk(t2), t2).map((m) => m.slug), ["fna", "asp"]);
});

test("pruneMatches: 남은 등장이 없으면 목록에서 빼고, 같은 용어끼리·같은 길이는 건드리지 않는다", () => {
  const { pruneMatches } = require("../assets/reader/terms-layer.js");
  const text = "doi.org/10.1000/transcription factor transcription factor";
  const m = [
    { slug: "t", occurrences: [{ start: 15, length: 13 }], firstStart: 15, firstLength: 13 },
  ];
  assert.deepEqual(pruneMatches(m, text), [], "주소 속");
  const same = [
    { slug: "a", occurrences: [{ start: 0, length: 4 }], firstStart: 0, firstLength: 4 },
    { slug: "b", occurrences: [{ start: 0, length: 4 }], firstStart: 0, firstLength: 4 },
  ];
  assert.equal(pruneMatches(same, "abcd efg").length, 2);
  assert.deepEqual(pruneMatches(undefined, "x"), []);
});
