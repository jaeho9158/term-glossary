const test = require("node:test");
const assert = require("node:assert/strict");
const { guessHeadings, linesFromItems, classifyHeading, buildTree, flattenTree, findCurrentEntry } = require("../assets/reader/outline.js");

function L(text, fontSize, bold, y, x) {
  return { text, fontSize, bold: !!bold, x: x === undefined ? 70 : x, y };
}
function body(n, y0) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(L("본 연구는 대상자의 특성을 살펴보기 위하여 설문을 실시하였다", 10, false, y0 + i * 14));
  return out;
}

test("guessHeadings: 크기·굵기·번호 형식에 맞는 제목만 고른다", () => {
  const pages = [
    { page: 1, lines: [L("Abstract", 10, true, 100), ...body(30, 120)] },
    { page: 2, lines: [L("1. 서론", 13, false, 80), ...body(30, 100), L("1.1 연구 배경", 11, true, 520), ...body(5, 540)] },
    { page: 3, lines: [
      L("본 연구는 대상자를 모집하여 하였다.", 10, false, 80),
      L("3. 표본은 다음과 같다", 10, false, 100),
      L("가".repeat(85), 13, true, 120),
      ...body(30, 140),
      L("참고문헌", 12, false, 600),
    ] },
  ];
  const r = guessHeadings(pages);
  assert.deepEqual(r.map((e) => [e.title, e.page, e.level]), [
    ["Abstract", 1, 1],
    ["1. 서론", 2, 1],
    ["1.1 연구 배경", 2, 2],
    ["참고문헌", 3, 1],
  ]);
  assert.ok(r.every((e) => e.y >= 0));
});

test("guessHeadings: 쪽마다 반복되는 머리말은 제외(쪽 번호가 달라도)", () => {
  const pages = [];
  for (let p = 1; p <= 5; p++) {
    pages.push({ page: p, lines: [
      L("1. 서론 " + (200 + p), 13, true, 30), // 머리말: 같은 높이에 반복, 숫자만 다름
      ...body(30, 100),
    ] });
  }
  pages[0].lines.push(L("Abstract", 10, true, 80));
  pages[1].lines.push(L("2. 연구방법", 13, false, 80));
  pages[2].lines.push(L("참고문헌", 12, false, 80));
  const r = guessHeadings(pages);
  assert.deepEqual(r.map((e) => e.title), ["Abstract", "2. 연구방법", "참고문헌"]);
});

test("guessHeadings: 결과가 3개 미만이면 빈 배열", () => {
  const pages = [{ page: 1, lines: [L("1. 서론", 13, false, 80), L("참고문헌", 12, false, 600), ...body(30, 100)] }];
  assert.deepEqual(guessHeadings(pages), []);
  assert.deepEqual(guessHeadings([]), []);
});

test("guessHeadings: 번호+표제어는 본문 크기여도 제목, 번호만 있는 본문 항목은 제외", () => {
  const pages = [
    { page: 1, lines: [L("Ⅰ. 서론", 10, false, 80), ...body(30, 100)] },
    { page: 2, lines: [L("1. 표본의 크기를 정하였다", 10, false, 80), L("Ⅱ. 연구방법", 10, true, 300), ...body(30, 320)] },
    { page: 3, lines: [L("Ⅲ. 결론", 10, false, 80), L("2020. 3. 15", 13, true, 300), ...body(10, 320)] },
  ];
  const r = guessHeadings(pages);
  assert.deepEqual(r.map((e) => e.title), ["Ⅰ. 서론", "Ⅱ. 연구방법", "Ⅲ. 결론"]);
});

test("guessHeadings: 문장 부호로 끝나는 줄, 영문 표제", () => {
  const pages = [
    { page: 1, lines: [L("Abstract", 10, true, 80), L("1 Introduction", 14, true, 200), L("1. 긴 문장 같은 제목이다.", 14, true, 250), ...body(40, 300)] },
    { page: 2, lines: [L("2.1 Study design", 11, true, 80), L("References", 12, true, 500), ...body(40, 100)] },
  ];
  const r = guessHeadings(pages);
  assert.deepEqual(r.map((e) => [e.title, e.level]), [["Abstract", 1], ["1 Introduction", 1], ["2.1 Study design", 2], ["References", 1]]);
});

test("guessHeadings: 최상위 단계가 1이 되도록 단계를 당긴다", () => {
  const pages = [
    { page: 1, lines: [L("1.1 가나 배경", 11, true, 80), L("1.2 다라 방법", 11, true, 200), L("1.3 마바 결과", 11, true, 300), ...body(40, 320)] },
  ];
  const r = guessHeadings(pages);
  assert.deepEqual(r.map((e) => e.level), [1, 1, 1]);
});

test("classifyHeading", () => {
  assert.equal(classifyHeading("1.2.3 방법").depth, 3);
  assert.equal(classifyHeading("제2장 연구방법").depth, 1);
  assert.equal(classifyHeading("제2절 표본").depth, 2);
  assert.equal(classifyHeading("서 론").kind, "keyword");
  assert.equal(classifyHeading("10 mg 투여"), null);
  assert.equal(classifyHeading("2020 년도 조사"), null);
  assert.equal(classifyHeading("일반적인 문장입니다"), null);
});

test("linesFromItems: 조각을 줄로 묶고 굵기·크기·위치를 구한다", () => {
  // 쪽 높이 800 의 뷰포트 변환(배율 1): y 뒤집힘
  const vt = [1, 0, 0, -1, 0, 800];
  const it = (str, x, y, size, font, w, eol) => ({ str, transform: [size, 0, 0, size, x, y], width: w, height: size, fontName: font, hasEOL: !!eol });
  const items = [
    it("1.", 70, 700, 13, "f1", 12),
    it("서론", 90, 700, 13, "f1", 26, true),
    it("본문 첫 줄이다", 70, 680, 10, "f2", 70, true),
    // 같은 밑선의 다른 단(간격이 넓다)
    it("오른쪽 단", 320, 680, 10, "f2", 40, true),
  ];
  const lines = linesFromItems(items, vt, { f1: "ABCDEF+NanumGothic-Bold", f2: "ABCDEF+Batang" });
  assert.equal(lines.length, 3);
  assert.equal(lines[0].text, "1. 서론");
  assert.equal(lines[0].bold, true);
  assert.equal(lines[0].fontSize, 13);
  assert.equal(lines[0].y, 100);
  assert.equal(lines[0].x, 70);
  assert.equal(lines[1].text, "본문 첫 줄이다");
  assert.equal(lines[1].bold, false);
  assert.equal(lines[2].text, "오른쪽 단");
});

test("linesFromItems: 같은 밑선의 조각 사이 공백, 세로 글자와 빈 조각 무시", () => {
  const vt = [1, 0, 0, -1, 0, 800];
  const it = (str, x, y, w) => ({ str, transform: [10, 0, 0, 10, x, y], width: w, fontName: "f" });
  const lines = linesFromItems([it("Materials", 70, 700, 45), it("and", 120, 700, 15), it("Methods", 140, 700, 35), it("  ", 175, 700, 3),
    { str: "세로", transform: [0, 10, -10, 0, 30, 500], width: 20, fontName: "f" }], vt, {});
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, "Materials and Methods");
});

test("buildTree / flattenTree / findCurrentEntry", () => {
  const flat = [
    { title: "A", page: 1, y: 100, level: 1 },
    { title: "A1", page: 1, y: 300, level: 2 },
    { title: "B", page: 2, y: 50, level: 1 },
    { title: "B1x", page: 3, y: 20, level: 3 },
  ];
  const tree = buildTree(flat);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].children[0].title, "A1");
  assert.equal(tree[1].children[0].title, "B1x");
  assert.deepEqual(flattenTree(tree).map((e) => e.title), ["A", "A1", "B", "B1x"]);
  const f = flattenTree(tree);
  assert.equal(findCurrentEntry(f, 1, 50), -1);
  assert.equal(findCurrentEntry(f, 1, 100), 0);
  assert.equal(findCurrentEntry(f, 1, 400), 1);
  assert.equal(findCurrentEntry(f, 2, 0), 1);
  assert.equal(findCurrentEntry(f, 5, 0), 3);
});

test("guessHeadings: 목차 쪽의 되풀이 항목은 본문 것만 남기고, 로마 숫자 아래 아라비아 번호·괄호 번호는 한 단계씩 내려간다", () => {
  const pages = [
    { page: 1, lines: [L("Ⅰ. 서론", 8, false, 200), L("Ⅱ. 연구방법", 8, false, 212), ...body(30, 240)] },
    { page: 2, lines: [L("Ⅰ. 서론", 15, true, 80), ...body(20, 100), L("1. 연구 배경", 12, true, 400), ...body(8, 420), L("1) 세부 사항", 11, true, 540), ...body(8, 560)] },
    { page: 3, lines: [L("Ⅱ. 연구방법", 15, true, 80), ...body(30, 100)] },
  ];
  const r = guessHeadings(pages);
  assert.deepEqual(r.map((e) => [e.title, e.page, e.level]), [
    ["Ⅰ. 서론", 2, 1], ["1. 연구 배경", 2, 2], ["1) 세부 사항", 2, 3], ["Ⅱ. 연구방법", 3, 1],
  ]);
});

test("guessHeadings: 참고문헌 구역의 번호 항목은 제외하고, 두 줄로 꺾인 제목은 이어 붙인다", () => {
  const pages = [
    { page: 1, lines: [L("1. 서론", 13, true, 80), ...body(30, 100)] },
    { page: 2, lines: [L("2. 마약류 중독 관련 입법 추진 경과 및", 13, true, 80), L("법 제정의 필요성", 13, true, 96), ...body(30, 120)] },
    { page: 3, lines: [L("참고문헌", 13, true, 80), L("1. Rychert J. In support of interoperability", 11, true, 100), L("2. World Health Organization (WHO) Regional", 11, true, 120), ...body(20, 140)] },
  ];
  const r = guessHeadings(pages);
  assert.deepEqual(r.map((e) => e.title), ["1. 서론", "2. 마약류 중독 관련 입법 추진 경과 및 법 제정의 필요성", "참고문헌"]);
});

test("guessHeadings: 번호 없는 짧은 강조 줄은 첫 쪽의 표지를 빼고 받는다", () => {
  const f = (text, size, bold, y, font, x2) => ({ text, fontSize: size, bold, font, x: 70, x2: x2 || 150, y });
  const bodyLine = (y) => ({ text: "본 연구는 대상자의 특성을 살펴보기 위하여 설문을 실시하였다", fontSize: 10, bold: false, font: "b", x: 70, x2: 470, y });
  const mk = (n, y0) => Array.from({ length: n }, (_, i) => bodyLine(y0 + i * 14));
  const pages = [
    { page: 1, lines: [f("연구 동향 논문 제목", 18, true, 60, "t"), f("홍길동", 12, false, 90, "a"), f("서론", 12, true, 130, "h"), ...mk(30, 150)] },
    { page: 2, lines: [f("세균에서의 QS", 12, false, 80, "h"), ...mk(30, 100), f("생물막 형성 조절", 12, false, 540, "h"), ...mk(5, 560)] },
    { page: 3, lines: [mk(1, 80)[0], f("결론 및 전망", 12, true, 300, "h"), ...mk(10, 320), f("한 줄 전체를 채우는 긴 문장 같은 굵은 줄입니다만", 12, true, 500, "h", 470), f("참고문헌", 12, true, 600, "h")] },
  ];
  const r = guessHeadings(pages);
  assert.deepEqual(r.map((e) => e.title), ["서론", "세균에서의 QS", "생물막 형성 조절", "결론 및 전망", "참고문헌"]);
  assert.ok(r.every((e) => e.level === 1));
});

test("linesFromItems: 공백이 제어 문자로 온 글, 자간을 벌린 한 글자 조각", () => {
  const vt = [1, 0, 0, -1, 0, 800];
  const it = (str, x, y, w) => ({ str, transform: [12, 0, 0, 12, x, y], width: w, fontName: "f" });
  const lines = linesFromItems([it("1. 치매 원인", 70, 700, 60), it("본", 70, 600, 12), it("론", 120, 600, 12)], vt, {});
  assert.deepEqual(lines.map((l) => l.text), ["1. 치매 원인", "본 론"]);
  assert.equal(classifyHeading(lines[0].text).kind, "num");
  assert.equal(classifyHeading("본론").kind, "keyword");
  assert.equal(classifyHeading("< Abstract >").kind, "keyword");
});

test("guessHeadings: 저자 표시(*)가 붙은 줄과 표지의 줄은 번호 없는 제목이 아니다", () => {
  const f = (text, size, bold, y) => ({ text, fontSize: size, bold, font: "h", x: 70, x2: 150, y });
  const bodyLine = (y) => ({ text: "본 연구는 대상자의 특성을 살펴보기 위하여 설문을 실시하였다", fontSize: 10, bold: false, font: "b", x: 70, x2: 470, y });
  const mk = (n, y0) => Array.from({ length: n }, (_, i) => bodyLine(y0 + i * 14));
  const pages = [
    { page: 1, lines: [f("홍길동", 13, true, 60), f("서론", 12, true, 130), ...mk(30, 150), f("성용은**", 12, true, 600)] },
    { page: 2, lines: [f("결론", 12, true, 100), f("참고문헌", 12, true, 300), ...mk(5, 320)] },
  ];
  assert.deepEqual(guessHeadings(pages).map((e) => e.title), ["서론", "결론", "참고문헌"]);
});
