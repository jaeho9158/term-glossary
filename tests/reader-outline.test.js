const test = require("node:test");
const assert = require("node:assert/strict");
const { guessHeadings, guessHeadingsAsync, linesFromItems, detectGutter, repeatKey, convertOutlineTree, thumbsToRelease, classifyHeading, buildTree, flattenTree, findCurrentEntry } = require("../assets/reader/outline.js");

// 브리프의 입력 모양 그대로: {text, fontSize, bold, x, y}. 굵은 줄은 bold === true 로 제목이 될 수 있다(입력 플래그, 결정적).
function L(text, fontSize, bold, y, x) {
  return { text, fontSize, bold: !!bold, font: "B", x: x === undefined ? 70 : x, y };
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
    { page: 1, lines: [L("1.1. 가나 배경", 11, true, 80), L("1.2. 다라 방법", 11, true, 200), L("1.3. 마바 결과", 11, true, 300), ...body(40, 320)] },
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
  // 브라우저 경로는 글꼴 이름으로 굵기를 만들지 않는다(렌더 순서에 따라 달라지므로)
  assert.ok(lines.every((l) => !("bold" in l) || l.bold === undefined));
  assert.equal(lines[0].fontSize, 13);
  assert.equal(lines[0].y, 100);
  assert.equal(lines[0].x, 70);
  assert.equal(lines[1].text, "본문 첫 줄이다");
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

// ---------- 검수 반영 ----------
const longBody = (x, y) => ({ text: "본 연구는 대상자의 특성을 살펴보기 위하여 설문을 실시하였다", fontSize: 10, font: "B", x, x2: x + 200, y });
const bodyAt = (n, y0, x) => Array.from({ length: n }, (_, i) => longBody(x === undefined ? 70 : x, y0 + i * 14));
const H = (text, size, y, x) => ({ text, fontSize: size, font: "H", x: x === undefined ? 70 : x, x2: (x === undefined ? 70 : x) + 100, y });
const titles = (r) => r.map((e) => e.title);

test("캡션: 굵은 '표 1.'·'그림 3.'·Table·Fig. 줄은 제목이 아니고 '표본 설계' 같은 제목은 남는다", () => {
  const caps = ["표 1. 일반적 특성", "그림 3. 처리 결과", "도 2 시스템 구성", "사진 1 현장 모습", "식 3 추정 모형", "Table 2 Characteristics", "Fig. 4 Overview", "Figure 5 Flow", "Scheme 1 Synthesis", "Chart 2 Trend", "Appendix Table 1 Items"];
  const pages = [
    { page: 1, lines: [H("1. 서론", 13, 60), ...bodyAt(20, 80)] },
    { page: 2, lines: [...caps.map((c, i) => H(c, 11, 60 + i * 20)), H("표본 설계", 11, 300), H("도입 배경", 11, 330), ...bodyAt(20, 360)] },
    { page: 3, lines: [H("결론", 13, 60), ...bodyAt(20, 80), H("참고문헌", 13, 400)] },
  ];
  assert.deepEqual(titles(guessHeadings(pages)), ["1. 서론", "표본 설계", "도입 배경", "결론", "참고문헌"]);
});

test("결정적: 같은 입력은 같은 결과(글꼴 번호가 정한 제목은 bold 플래그가 true/false/없음이어도 같다)", () => {
  const mk = (boldVal) => {
    const strip = (l) => { const o = { ...l }; if (boldVal === undefined) delete o.bold; else o.bold = boldVal; return o; };
    return [
      { page: 1, lines: [H("Abstract", 12, 60), ...bodyAt(20, 80)].map(strip) },
      { page: 2, lines: [H("1. 서론", 13, 60), longBody(70, 80), { ...longBody(70, 94), font: "B", text: "굵기 힌트가 있어도 본문 줄은 제목이 아니다 진짜로" }, ...bodyAt(20, 110)].map(strip) },
      { page: 3, lines: [H("참고문헌", 13, 60), ...bodyAt(5, 80)].map(strip) },
    ];
  };
  const a = guessHeadings(mk(undefined));
  assert.deepEqual(a, guessHeadings(mk(true)));
  assert.deepEqual(a, guessHeadings(mk(false)));
  assert.deepEqual(titles(a), ["Abstract", "1. 서론", "참고문헌"]);
  // 제목 줄에만 bold 플래그가 얹혀도 같은 제목이 나온다(이미 드문 글꼴이므로)
  const withHint = guessHeadings([{ page: 1, lines: [{ ...H("Abstract", 12, 60), bold: true }, { ...H("서론", 13, 100), bold: true }, { ...H("결론", 13, 140), bold: true }, ...bodyAt(20, 160)] }]);
  const noHint = guessHeadings([{ page: 1, lines: [H("Abstract", 12, 60), H("서론", 13, 100), H("결론", 13, 140), ...bodyAt(20, 160)] }]);
  assert.deepEqual(withHint, noHint);
  assert.equal(noHint.length, 3);
});

test("굵기 입력 계약: line.bold === true 는 드문 글꼴과 같은 신호이고, false/없음은 신호가 아니다", () => {
  const pg = (flag) => [{ page: 1, lines: [
    { text: "1. 서론", fontSize: 10, font: "B", x: 70, y: 60, ...(flag === undefined ? {} : { bold: flag }) },
    ...bodyAt(20, 80),
    { text: "2. 연구 방법", fontSize: 10, font: "B", x: 70, y: 400, ...(flag === undefined ? {} : { bold: flag }) },
    ...bodyAt(10, 420),
    { text: "3. 결과 요약", fontSize: 10, font: "B", x: 70, y: 600, ...(flag === undefined ? {} : { bold: flag }) },
  ] }];
  assert.deepEqual(titles(guessHeadings(pg(true))), ["1. 서론", "2. 연구 방법", "3. 결과 요약"]);
  assert.deepEqual(titles(guessHeadings(pg(false))), []); // 신호가 없으면 본문 크기의 번호 줄은 제목이 아니다
  assert.deepEqual(titles(guessHeadings(pg(undefined))), []);
  // 같은 입력은 몇 번을 돌려도 같다
  assert.deepEqual(guessHeadings(pg(true)), guessHeadings(pg(true)));
});

// 첫 제목이 나온 뒤(둘째 쪽)에 드문 글꼴·11.5pt(본문 10pt)로 나온 번호 없는 줄이 제목으로 받아들여지는지 본다.
function titleProbe(texts) {
  const pages = [
    { page: 1, lines: [H("Abstract", 12, 60), ...bodyAt(25, 80), H("1. Introduction", 13, 480), ...bodyAt(5, 500)] },
    { page: 2, lines: [...bodyAt(10, 60), ...texts.map((t, i) => H(t, 11.5, 220 + i * 40)), ...bodyAt(15, 220 + texts.length * 40 + 20),
      // "Men and Women" 처럼 두 낱말이 본문에 나오는 제목만 받는다(이름 줄 규칙)
      { text: "men women supply demand laboratory findings tests hospital course strengths limitations sample procedure measures instruments cells reagents animals housing", fontSize: 10, font: "B", x: 70, x2: 270, y: 900 }] },
    { page: 3, lines: [H("2. Methods", 13, 60), ...bodyAt(25, 80), H("References", 13, 480), ...bodyAt(5, 500)] },
  ];
  return titles(guessHeadings(pages)).filter((t) => texts.indexOf(t) >= 0);
}

test("번호 없는 제목 후보: 저자·날짜·학술지·식별자 줄은 받지 않는다", () => {
  const bad = ["Kim Jaeho and Lee Minsu", "김철수 이영희 박민수", "J. Kim, S. Lee", "Received 12 March 2020", "Journal of Korean Medicine", "Orcid",
    "김철수·이영희", "Smith & Jones", "Accepted: May 3, 2020", "한국의학회지"];
  assert.deepEqual(titleProbe(bad), []);
});

test("번호 없는 제목 후보: 진짜 짧은 제목은 계속 받는다", () => {
  const good = ["Pathogenesis and Treatment", "Risk Factors and Clinical Outcomes", "세균에서의 QS", "Clinical Implications", "연구 방법의 한계"];
  assert.deepEqual(titleProbe(good), good);
});

test("번호 없는 제목 후보: 표·그림 계열 캡션(Box/Algorithm/Equation/Scheme/Chart/Appendix Table)은 제목이 아니다", () => {
  const caps = ["Box 1 Key messages", "Algorithm 1 Training loop", "Equation 2 Loss function", "Scheme 1 Synthesis route", "Chart 1 Annual trend", "Appendix Table 1", "Table 2 Results", "Figure 3 Flow"];
  assert.deepEqual(titleProbe(caps), []);
  assert.deepEqual(titleProbe(["Boxing Training", "Equations of State"]), ["Boxing Training", "Equations of State"]);
});

test("번호 붙은 소속·참고문헌 항목: '1 Samsung Medical Research Labs', '3. 김철수․이영희. 청소년…'은 제목이 아니다", () => {
  assert.equal(classifyHeading("1 Samsung Medical Research Labs"), null);
  assert.equal(classifyHeading("2 Acme Corp"), null);
  assert.equal(classifyHeading("3. 김철수․이영희. 청소년 약물 남용의 실태"), null);
  assert.equal(classifyHeading("4. 김철수·이영희, 박민수. 청소년 약물"), null);
  assert.equal(classifyHeading("3. 청소년 약물 남용의 실태").kind, "num");
  assert.equal(classifyHeading("1 Introduction").kind, "num");
});

test("detectGutter: 반올림 창 가장자리 줄도 오른쪽 단으로 센다(natural-extract p3: 275 x28 / 284.88 x4 / 289 x1)", () => {
  const T = "본 연구는 청소년의 마약류 남용 실태를 분석하고 대응 방안을 제시하였다";
  const mk = (x, y) => ({ text: T, fontSize: 9.5, font: "B", x, x2: x === 57 ? 250 : x + 200, y });
  const lines = [];
  for (let i = 0; i < 30; i++) lines.push(mk(57, 100 + i * 12));
  for (let i = 0; i < 28; i++) lines.push(mk(275, 100 + i * 12));
  for (let i = 0; i < 4; i++) lines.push(mk(284.88, 460 + i * 12));
  lines.push(mk(289, 520));
  const g = detectGutter(lines);
  assert.equal(typeof g, "number");
  assert.ok(g > 250 && g < 275, "단 사이: " + g);
});

test("detectGutter: 내어쓰기·들여쓴 첫 줄이 갈라놓은 왼쪽 단(50 x14 / 70 x34)도 한 단 군집이다", () => {
  const T = "Quorum sensing regulates biofilm formation in many bacterial species worldwide";
  const lines = [];
  for (let i = 0; i < 14; i++) lines.push({ text: T, fontSize: 9, font: "B", x: 50, x2: 250, y: 60 + i * 11 });
  for (let i = 0; i < 34; i++) lines.push({ text: T, fontSize: 9, font: "B", x: 70, x2: 250, y: 220 + i * 11 });
  for (let i = 0; i < 48; i++) lines.push({ text: T, fontSize: 9, font: "B", x: 300, x2: 500, y: 60 + i * 11 });
  const g = detectGutter(lines);
  assert.equal(typeof g, "number");
  assert.ok(g > 250 && g < 300, "단 사이: " + g);
});

test("detectGutter: 한 단 쪽은 들여쓴 줄이 많아도 두 단으로 보지 않는다", () => {
  const T = "본 연구는 청소년의 마약류 남용 실태를 분석하고 대응 방안을 제시하였다";
  const lines = [];
  for (let i = 0; i < 30; i++) lines.push({ text: T, fontSize: 10, font: "B", x: 70, x2: 520, y: 100 + i * 14 });
  for (let i = 0; i < 12; i++) lines.push({ text: T, fontSize: 10, font: "B", x: 190, x2: 520, y: 540 + i * 14 }); // 인용 블록 들여쓰기
  assert.equal(detectGutter(lines), null);
  assert.equal(detectGutter(lines.slice(0, 30)), null); // 오른쪽 군집이 없으면 null
});

test("linesFromItems: 공백 조각이 있어도 실제 글자 사이 간격이 1em 을 넘으면 이어 붙이지 않는다", () => {
  const vt = [1, 0, 0, -1, 0, 800];
  const it = (str, x, w) => ({ str, transform: [10, 0, 0, 10, x, 100], width: w, fontName: "f" });
  // "AAAA"(70~100) 공백(102, 폭 10, 0.6em 인정) "BBBB"(116): 공백 뒤 틈은 0.8em 이지만 글자 사이는 1.6em → 둘로 갈라진다
  const far = linesFromItems([it("AAAA", 70, 30), it(" ", 102, 10), it("BBBB", 116, 30)], vt);
  assert.equal(far.length, 2);
  // 간격 0.9em 이면 공백을 끼고 한 줄
  const near = linesFromItems([it("AAAA", 70, 30), it(" ", 101, 9), it("BBBB", 109, 30)], vt);
  assert.equal(near.length, 1);
  assert.equal(near[0].text, "AAAA BBBB");
});

test("소속·주소 줄('1 Department…', '2 서울대학교 의과대학')과 저자 줄('I. Kim and J. Lee')은 제목이 아니다", () => {
  const pages = [
    { page: 1, lines: [
      H("Effects of Light on Growth", 18, 40),
      H("I. Kim and J. Lee", 12, 70),
      H("1 Department of Medicine, Seoul National University", 12, 90),
      H("2 서울대학교 의과대학", 12, 105),
      H("3 Jeju Health Sciences", 12, 120), // 소속 낱말이 없어도 첫 제목 앞의 점 없는 번호는 받지 않는다
      H("Abstract", 12, 150), ...bodyAt(10, 170),
      H("1 Introduction", 13, 330), ...bodyAt(10, 350),
    ] },
    { page: 2, lines: [H("2 Methods", 13, 60), ...bodyAt(10, 80), H("2.1 Study design", 12, 300), ...bodyAt(10, 320), H("References", 13, 500), ...bodyAt(5, 520)] },
  ];
  assert.deepEqual(titles(guessHeadings(pages)), ["Abstract", "1 Introduction", "2 Methods", "2.1 Study design", "References"]);
});

test("점 없는 번호 제목('1 Introduction')과 로마·한글 번호 제목은 정상으로 받는다", () => {
  assert.equal(classifyHeading("1 Introduction").kind, "num");
  assert.equal(classifyHeading("1 Introduction").nodot, true);
  assert.equal(classifyHeading("1. 서론").nodot, false);
  assert.equal(classifyHeading("I. INTRODUCTION").kind, "roman");
  assert.equal(classifyHeading("Ⅱ. 이론적 배경").kind, "roman");
  assert.equal(classifyHeading("I. Related Work").kind, "roman");
  assert.equal(classifyHeading("I. Design and implementation").kind, "roman");
  assert.equal(classifyHeading("II. Kim and Lee").kind, "roman"); // 두 글자 이상 로마 숫자는 이니셜이 아니다
  assert.equal(classifyHeading("1. Study design").kind, "num");
  const pages = [
    { page: 1, lines: [H("I. INTRODUCTION", 13, 60), ...bodyAt(10, 80), H("Ⅱ. 이론적 배경", 13, 300), ...bodyAt(10, 320)] },
    { page: 2, lines: [H("1. 서론", 13, 60), ...bodyAt(10, 80)] },
  ];
  assert.deepEqual(titles(guessHeadings(pages)), ["I. INTRODUCTION", "Ⅱ. 이론적 배경", "1. 서론"]);
});

test("저자 나열·참고문헌 항목 모양은 번호가 있어도 제목이 아니다", () => {
  ["I. Kim and J. Lee", "I. Kim, J. Lee, and S. Park", "V. Smith & Jones", "X. Kim et al", "I. Kim, J. Lee"].forEach((t) => assert.equal(classifyHeading(t), null, t));
  ["12. Smith AB, Jones C (2010) Title of paper", "3 Kim J, Lee S. Foo bar", "5. Rychert J. In support of interoperability", "4. 김철수 (2010) 연구", "7 Lee et al. studied this"].forEach((t) => assert.equal(classifyHeading(t), null, t));
  ["1 Department of Medicine", "2 서울대학교 의과대학", "3 Seoul, Korea", "4 kim@univ.ac.kr", "1 Institute of Science"].forEach((t) => assert.equal(classifyHeading(t), null, t));
  assert.equal(classifyHeading("2. Department of Medicine").kind, "num"); // 점이 붙은 번호는 소속 낱말만으로 거르지 않는다
});

test("참고문헌 구역 안의 점 없는 번호·번호 항목은 제목이 아니다", () => {
  const pages = [
    { page: 1, lines: [H("1. 서론", 13, 60), ...bodyAt(10, 80), H("2. 결과", 13, 300), ...bodyAt(10, 320)] },
    { page: 2, lines: [H("References", 13, 60), H("1 Lee Method for estimation", 12, 90), H("2 Kim Overview of topics", 12, 110), ...bodyAt(10, 130)] },
  ];
  assert.deepEqual(titles(guessHeadings(pages)), ["1. 서론", "2. 결과", "References"]);
});

test("머리말 판별: 쪽 번호 모양만 떼고 비교하므로 '1.1 개요/2.1 개요/3.1 개요'는 소절로 남는다", () => {
  assert.equal(repeatKey("- 3 -", 30), repeatKey("- 4 -", 30));
  assert.equal(repeatKey("3 / 12", 30), repeatKey("4 / 12", 30));
  assert.equal(repeatKey("연구방법 12", 30), repeatKey("연구방법 13", 30));
  assert.equal(repeatKey("3 연구방법", 30), repeatKey("4 연구방법", 30));
  assert.notEqual(repeatKey("1.1 개요", 200), repeatKey("2.1 개요", 200));
  const pages = [1, 2, 3].map((p) => ({ page: p, lines: [H(p === 1 ? "1. 서론" : p + ". 절차", 13, 60), H(p + ".1 개요", 12, 200), ...bodyAt(10, 220)] }));
  pages[2].lines.push(H("참고문헌", 13, 500));
  assert.deepEqual(titles(guessHeadings(pages)), ["1. 서론", "1.1 개요", "2. 절차", "2.1 개요", "3. 절차", "3.1 개요", "참고문헌"]);
});

function makeItems(rows, gap) {
  // 쪽 높이 800, 글자 10pt. 한 행: 왼쪽 단 조각(너비 200)과 오른쪽 단 조각
  const items = [];
  rows.forEach((r, i) => {
    const y = 700 - i * 14;
    items.push({ str: r.left, transform: [10, 0, 0, 10, 70, y], width: 200, fontName: "f", hasEOL: true });
    if (r.right) items.push({ str: r.right, transform: [10, 0, 0, 10, 270 + gap, y], width: 200, fontName: "f", hasEOL: true });
  });
  return items;
}

test("linesFromItems: 단 사이가 12pt(1.2em)여도 오른쪽 단 제목이 왼쪽 줄에 붙지 않는다", () => {
  const vt = [1, 0, 0, -1, 0, 800];
  const rows = [{ left: "본 연구는 대상자의 특성을 살펴보기 위하여 설문을 실시", right: "3. 연구결과" }, { left: "하였다" }];
  const lines = linesFromItems(makeItems(rows, 12), vt, {});
  assert.deepEqual(lines.map((l) => l.text), ["본 연구는 대상자의 특성을 살펴보기 위하여 설문을 실시", "3. 연구결과", "하였다"]);
});

test("linesFromItems: 두 단 쪽으로 보이면 1em 미만(8pt)의 좁은 단 사이도 넘어 붙이지 않는다", () => {
  const vt = [1, 0, 0, -1, 0, 800];
  const rows = Array.from({ length: 16 }, (_, i) => ({ left: "본 연구는 대상자의 특성을 살펴보기 위하여 설문", right: i === 3 ? "3. 연구결과" : "오른쪽 단의 본문도 비슷하게 길게 이어지는 글이다" }));
  const lines = linesFromItems(makeItems(rows, 8), vt, {});
  assert.equal(lines.length, 32);
  assert.ok(lines.some((l) => l.text === "3. 연구결과"));
  assert.equal(typeof lines.gutter, "number");
  assert.ok(lines.gutter > 270 && lines.gutter < 278);
  assert.equal(detectGutter(bodyAt(14, 60)), null); // 한 단은 null
});

test("두 단 쪽: 후보를 읽는 순서(왼쪽 단 위→아래, 오른쪽 단)로 내놓는다", () => {
  const left = bodyAt(14, 100, 70);
  const right = bodyAt(14, 100, 330);
  const pages = [{ page: 1, lines: [H("3. 결과", 13, 60, 330), H("1. 서론", 13, 80, 70), ...left, H("2. 방법", 13, 300, 70), ...right] }];
  const r = guessHeadings(pages);
  assert.deepEqual(r.map((e) => [e.title, e.col]), [["1. 서론", 0], ["2. 방법", 0], ["3. 결과", 1]]);
  assert.ok(r.every((e) => e.tc === true));
});

test("현재 항목: 두 단 쪽에서 왼쪽 단 1절을 읽는 동안 오른쪽 단의 3절을 가리키지 않는다", () => {
  const flat = [
    { title: "0. 앞쪽", page: 1, y: 40, level: 1 },
    { title: "1. 서론", page: 2, y: 100, level: 1, tc: true, col: 0 },
    { title: "2. 방법", page: 2, y: 400, level: 1, tc: true, col: 0 },
    { title: "3. 결과", page: 2, y: 120, level: 1, tc: true, col: 1 },
    { title: "4. 논의", page: 3, y: 100, level: 1 },
  ];
  assert.equal(findCurrentEntry(flat, 2, 50), 0, "쪽 맨 위: 이전 쪽 항목");
  assert.equal(findCurrentEntry(flat, 2, 300), 1, "왼쪽 단 1절 읽는 중(3절 y=120 은 지났지만 가리키지 않음)");
  assert.equal(findCurrentEntry(flat, 2, 395), 1);
  assert.equal(findCurrentEntry(flat, 2, 400), 3, "왼쪽 단 마지막 제목을 지나면 오른쪽 단 항목");
  assert.equal(findCurrentEntry(flat, 3, 0), 3, "다음 쪽 첫 항목 앞: 이전 쪽의 마지막(읽는 순서) 항목");
  assert.equal(findCurrentEntry(flat, 3, 200), 4);
});

test("guessHeadingsAsync: 동기 결과와 같고, 단계 사이에 pace 를 부르며, false 면 중단한다", async () => {
  const pages = [];
  for (let p = 1; p <= 30; p++) pages.push({ page: p, lines: [H(p === 1 ? "1. 서론" : p + ". 절차", 13, 60), ...bodyAt(10, 80)] });
  let calls = 0;
  const a = await guessHeadingsAsync(pages, () => { calls++; });
  assert.deepEqual(a, guessHeadings(pages));
  assert.ok(calls >= 8, "calls " + calls);
  let n = 0;
  assert.equal(await guessHeadingsAsync(pages, () => (++n < 3 ? true : false)), null);
});

test("convertOutlineTree: 대상 없는 항목의 자식은 조상 하나당 한 단계 올리고, 6단계보다 깊은 항목도 버리지 않는다", async () => {
  const resolve = async (d) => (d ? { page: 1, y: 0, yRatio: 0 } : null);
  const nodes = [{ title: "A", dest: 1, items: [{ title: "B(대상 없음)", items: [{ title: "C", dest: 1, items: [{ title: "D", dest: 1 }] }] }] }];
  const t = await convertOutlineTree(nodes, resolve);
  assert.equal(t[0].title, "A");
  assert.equal(t[0].children[0].title, "C");
  assert.equal(t[0].children[0].level, 2);
  assert.equal(t[0].children[0].children[0].level, 3);
  let deep = { title: "L9", dest: 1 };
  for (let i = 8; i >= 1; i--) deep = { title: "L" + i, dest: 1, items: [deep] };
  const dt = await convertOutlineTree([deep], resolve);
  const flat = flattenTree(dt);
  assert.equal(flat.length, 9);
  assert.deepEqual(flat.map((e) => e.level), [1, 2, 3, 4, 5, 6, 6, 6, 6]);
  // 건너뛴 조상이 둘이면 두 단계 올라간다
  const t2 = await convertOutlineTree([{ title: "x", items: [{ title: "y", items: [{ title: "Z", dest: 1 }] }] }], resolve);
  assert.deepEqual(t2.map((e) => [e.title, e.level]), [["Z", 1]]);
});

test("thumbsToRelease: 상한을 넘으면 현재 쪽에서 먼 것부터, 현재 쪽·보이는 것은 남긴다", () => {
  const done = Array.from({ length: 70 }, (_, i) => i + 1);
  assert.deepEqual(thumbsToRelease(done.slice(0, 60), 30, new Set(), 60), []);
  const rel = thumbsToRelease(done, 30, new Set([1, 2]), 60);
  assert.equal(rel.length, 10);
  assert.ok(!rel.includes(30) && !rel.includes(1) && !rel.includes(2));
  assert.ok(rel.includes(70) && rel.includes(69) && rel.includes(68));
  assert.ok(!rel.includes(31));
});

test("linesFromItems: 낱말 사이 공백 조각의 폭을 줄 끝에 더하므로 '2.8 혈전 수축 분석' 같은 제목이 갈라지지 않는다", () => {
  const vt = [1, 0, 0, -1, 0, 800];
  const it = (str, x, w) => ({ str, transform: [9.6, 0, 0, 9.6, x, 100], width: w, fontName: "f" });
  const lines = linesFromItems([it("2.8", 284.9, 13.5), it(" ", 298.4, 9.8), it("혈전", 308.2, 18.5), it(" ", 326.6, 9.6), it("수축", 336.2, 18.5), it(" ", 354.7, 9.6), it("분석", 364.3, 18.5)], vt, {});
  assert.deepEqual(lines.map((l) => l.text), ["2.8 혈전 수축 분석"]);
});

// ---------- 최종 검수 반영 (판정 규칙) ----------
test("linesFromItems: 자간을 벌리고 사이에 공백 조각이 낀 'I. 서 론'은 한 줄이다(O1)", () => {
  const vt = [1, 0, 0, -1, 0, 800];
  const it = (str, x, w) => ({ str, transform: [12, 0, 0, 12, x, 700], width: w, fontName: "f" });
  const lines = linesFromItems([it("I.", 148.5, 6), it(" ", 154.5, 0.2), it("서", 157.4, 12), it(" ", 169.4, 1.44), it("론", 186.7, 12)], vt, {});
  assert.deepEqual(lines.map((l) => l.text), ["I. 서 론"]);
  // 한 글자 조각이 아니면 종전 한계(1em+허용)를 그대로 쓴다
  const far = linesFromItems([it("서론", 100, 24), it(" ", 124, 1.4), it("본론", 170, 24)], vt, {});
  assert.equal(far.length, 2);
});

test("guessHeadings: 문헌 목록 줄('15) Headache Classification Committee…', '18) Bjørk MH, …')은 앞 번호가 없으면 제목이 아니다(O2)", () => {
  assert.deepEqual(titleProbe(["15) Headache Classification Committee of the International", "18) Bjørk MH, Stovner LJ, Hagen K, Sand T. What initiates a migraine"]), []);
  assert.equal(classifyHeading("18) Bjørk MH, Stovner LJ, Hagen K, Sand T. What initiates a migraine"), null);
  // 앞 번호가 후보로 있으면 연속 번호는 남는다
  assert.deepEqual(titleProbe(["1) Aims", "2) Subjects", "3) Analysis"]), ["1) Aims", "2) Subjects", "3) Analysis"]);
});

test("번호 없는 제목 후보: Laboratory Findings 같은 진짜 제목은 받고 기관·저자 줄은 계속 거른다(O3)", () => {
  const good = ["Laboratory Findings", "Laboratory Tests", "Hospital Course", "Strengths and Limitations", "Sample and Procedure", "Measures and Instruments",
    "Cells and Reagents", "Animals and Housing", "Men and Women", "Supply and Demand"];
  assert.deepEqual(titleProbe(good), good);
  const bad = ["Seoul National University Hospital", "Department of Medicine", "Yonsei University College of Medicine", "Hospital of the University of Pennsylvania",
    "Laboratory of Immunology", "Kim Jaeho and Lee Minsu", "Smith, Jones", "Smith & Jones", "Kim J and Lee S", "Smith et al"];
  assert.deepEqual(titleProbe(bad), []);
});

test("제목 후보: 줄표·밑줄 점선 줄과 라틴 3글자 이하 조각은 제외, 공백 차이만 있는 목차 되풀이는 본문 것만(O4)", () => {
  assert.deepEqual(titleProbe(["2. Methods ------------ 5", "3. Results ____________ 7", "4. Aims ─────── 9"]), []);
  assert.deepEqual(titleProbe(["Li"]), []);
  assert.deepEqual(titleProbe(["Aims"]), ["Aims"]);
  const pages = [
    { page: 1, lines: [H("1. 서론", 13, 60), H("2. 연구 방법", 13, 90), H("3. 결과", 13, 120), ...bodyAt(10, 150)] },
    { page: 2, lines: [H("1. 서론", 13, 60), ...bodyAt(25, 80), H("2. 연구방법", 13, 480), ...bodyAt(5, 500)] },
    { page: 3, lines: [...bodyAt(10, 60), H("3. 결과", 13, 300), ...bodyAt(10, 320), H("참고문헌", 13, 480)] },
  ];
  assert.deepEqual(titles(guessHeadings(pages)), ["1. 서론", "2. 연구방법", "3. 결과", "참고문헌"]);
});

// ---------- 잔여 결함 수정 (목차 추정) ----------
const { promoteDocTitle } = require("../assets/reader/outline.js");
// 본문 글꼴 B, 10pt, 폭 200 / 제목 글꼴 H
const plain = (text, y, x, x2) => ({ text, fontSize: 10, font: "B", x: x === undefined ? 70 : x, x2: x2 === undefined ? 170 : x2, y });
const outl = (pages) => guessHeadings(pages).map((e) => [e.title, e.page, e.level]);

test("본문 크기 소제목: 앞 번호가 이어지는 짧은 한 줄만 제목이다(1.1 은 1. 아래, 2.1 은 2. 아래)", () => {
  const pages = [
    { page: 1, lines: [H("Abstract", 12, 40), ...bodyAt(8, 60), H("1. 서론", 13, 200), plain("1.1 연구의 배경", 230), ...bodyAt(8, 262),
      plain("1.2 연구의 방법", 390), ...bodyAt(8, 420)] },
    { page: 2, lines: [H("2. 연구방법", 13, 60), plain("2.1 연구대상", 90), ...bodyAt(8, 122), plain("2.2 자료수집", 250), ...bodyAt(6, 280), H("참고문헌", 13, 600)] },
  ];
  assert.deepEqual(outl(pages), [
    ["Abstract", 1, 1], ["1. 서론", 1, 1], ["1.1 연구의 배경", 1, 2], ["1.2 연구의 방법", 1, 2],
    ["2. 연구방법", 2, 1], ["2.1 연구대상", 2, 2], ["2.2 자료수집", 2, 2], ["참고문헌", 2, 1],
  ]);
});

test("본문 크기 소제목: 윗 번호가 없거나 번호가 거슬러 오르거나 단위·수식·문장·옆 칸이 있으면 받지 않는다", () => {
  const sent = { text: "1.3 이 줄은 마침표로 끝나는 문장이다.", fontSize: 10, font: "B", x: 70, x2: 170, y: 440 };
  const pages = [
    { page: 1, lines: [H("Abstract", 12, 40), ...bodyAt(8, 60), H("1. 서론", 13, 200), plain("1.1 연구의 배경", 230), ...bodyAt(8, 262),
      plain("1.1 연구의 배경", 380), ...bodyAt(3, 410), // 번호가 거슬러 오름(되풀이)
      plain("3.1 윗 번호 없는 소절", 460), ...bodyAt(3, 490), // 3. 이 없다
      plain("1.5 Hz 자극", 540), ...bodyAt(3, 570), // 단위
      plain("1.6 Y = aX + b", 620), ...bodyAt(3, 650), // 수식
      sent, ...bodyAt(3, 470),
      plain("1.7 표 칸", 700), plain("12.5", 700, 200, 230), ...bodyAt(3, 730), // 같은 줄 옆 칸
    ] },
    { page: 2, lines: [H("2. 결과", 13, 60), ...bodyAt(8, 90), H("참고문헌", 13, 600)] },
  ];
  assert.deepEqual(outl(pages).map((e) => e[0]), ["Abstract", "1. 서론", "1.1 연구의 배경", "2. 결과", "참고문헌"]);
});

test("본문 크기 소제목: 본문 폭을 채우는 긴 줄·위아래가 붙은 줄은 받지 않는다", () => {
  const wide = { text: "1.2 이 소절 이름은 아주 길어서 본문 폭을 거의 다 채운다", fontSize: 10, font: "B", x: 70, x2: 270, y: 400 };
  const pages = [
    { page: 1, lines: [H("Abstract", 12, 40), ...bodyAt(8, 60), H("1. 서론", 13, 200), plain("1.1 연구의 배경", 230), ...bodyAt(8, 262), wide, ...bodyAt(3, 414)] },
    { page: 2, lines: [H("2. 결과", 13, 60), ...bodyAt(8, 90), plain("2.1 붙은 줄", 218, 70, 270), ...bodyAt(3, 232), H("참고문헌", 13, 600)] },
  ];
  assert.deepEqual(outl(pages).map((e) => e[0]), ["Abstract", "1. 서론", "1.1 연구의 배경", "2. 결과", "참고문헌"]);
});

test("단독 표제어: 본문 크기·보통 굵기여도 줄에 이 말만 있으면 제목(<참고문헌>, 【Abstract】, References, <ABSTRACT>)", () => {
  const heads = ["<참고문헌>", "【Abstract】", "References", "<ABSTRACT>", "참 고 문 헌", "REFERENCES", "초록", "요약", "감사의 글", "Acknowledgements", "부록", "Appendix"];
  const pages = [
    { page: 1, lines: [H("1. 서론", 13, 40), ...bodyAt(8, 60)] },
    ...heads.map((h, i) => ({ page: i + 2, lines: [...bodyAt(4, 60), plain(h, 130, 70, 140), ...bodyAt(4, 150)] })),
  ];
  assert.deepEqual(titles(guessHeadings(pages)).slice(1), heads.map((h) => h));
});

test("단독 표제어: 옆 칸이 있는 표 안의 말이나 문장 속의 말은 제목이 아니다", () => {
  const pages = [
    { page: 1, lines: [H("1. 서론", 13, 40), H("2. 방법", 13, 70), ...bodyAt(8, 100),
      plain("요약", 300, 70, 100), plain("12.4 ± 3.1", 300, 150, 200), // 표 칸
      plain("참고문헌을 따랐다", 330, 70, 150), // 문장
      ...bodyAt(4, 360)] },
    { page: 2, lines: [H("3. 결과", 13, 60), ...bodyAt(4, 90), H("결론", 13, 300)] },
  ];
  assert.deepEqual(titles(guessHeadings(pages)), ["1. 서론", "2. 방법", "3. 결과", "결론"]);
});

test("참고문헌 제목을 놓치지 않으면 그 아래 '1. 국내문헌' 같은 구분은 이전 장의 하위로 매달리지 않는다", () => {
  const pages = [
    { page: 1, lines: [H("Ⅰ. 서론", 13, 40), ...bodyAt(8, 60), H("Ⅱ. 결론", 13, 200), ...bodyAt(8, 220)] },
    { page: 2, lines: [plain("<참고문헌>", 60, 70, 140), H("1. 국내문헌", 11, 90), ...bodyAt(4, 110), H("2. 국외문헌", 11, 200), ...bodyAt(4, 220)] },
  ];
  assert.deepEqual(outl(pages), [["Ⅰ. 서론", 1, 1], ["Ⅱ. 결론", 1, 1], ["<참고문헌>", 2, 1]]);
});

test("표제어 아래에서 번호가 1 부터 다시 시작하면 그 표제어의 하위로 둔다(머리말·'1. 서론' 체계는 그대로)", () => {
  const pages = [
    { page: 1, lines: [H("Abstract", 12, 40), ...bodyAt(6, 60), H("1. 서론", 13, 160), ...bodyAt(6, 180), H("결과", 13, 280), ...bodyAt(4, 300),
      H("1. 검체 종류", 11.5, 360), ...bodyAt(4, 380), H("2. 유병률", 11.5, 450), ...bodyAt(4, 470), H("고찰", 13, 540), ...bodyAt(4, 560)] },
    { page: 2, lines: [H("참고문헌", 13, 60)] },
  ];
  assert.deepEqual(outl(pages), [
    ["Abstract", 1, 1], ["1. 서론", 1, 1], ["결과", 1, 1], ["1. 검체 종류", 1, 2], ["2. 유병률", 1, 2], ["고찰", 1, 1], ["참고문헌", 2, 1],
  ]);
});

test("두 줄 제목: 같은 글꼴·크기로 바로 아래 이어지는 줄을 잇는다(내어쓰기·가운데 맞춤 포함, 세 줄·120자까지)", () => {
  const h = (text, y, x, x2) => ({ text, fontSize: 11, font: "H", x, x2, y });
  const pages = [
    { page: 1, lines: [H("Abstract", 12, 40), ...bodyAt(6, 60),
      h("1. 서론 연구의 배경과 목적을 길게 쓴 제목의 첫째 줄", 200, 70, 270), h("둘째 줄", 213, 60, 110), ...bodyAt(4, 245),
      h("2. 가운데 맞춤 제목의 첫 줄과", 330, 100, 260), h("둘째 줄", 343, 150, 210), ...bodyAt(4, 375),
      h("3. 네 줄로 꺾인 제목의 첫 줄", 460, 70, 200), h("둘째 줄", 473, 70, 130), h("셋째 줄", 486, 70, 130), h("넷째 줄", 499, 70, 130), ...bodyAt(4, 530),
      H("4. 문장이 끝난 제목.", 11, 620), H("다음 제목이 아닌 줄", 11, 633), ...bodyAt(3, 660),
      H("참고문헌", 13, 800)] },
  ];
  const r = titles(guessHeadings(pages));
  assert.ok(r.includes("1. 서론 연구의 배경과 목적을 길게 쓴 제목의 첫째 줄 둘째 줄"));
  assert.ok(r.includes("2. 가운데 맞춤 제목의 첫 줄과 둘째 줄"));
  assert.ok(r.includes("3. 네 줄로 꺾인 제목의 첫 줄 둘째 줄 셋째 줄"));
  assert.ok(!r.some((t) => /다음 제목이 아닌 줄/.test(t)));
});

test("두 줄 제목: 단·쪽 끝에서 잘린 제목은 다음 단(쪽) 맨 위 줄이 이어질 때만 잇는다(소문자로 시작하거나 괄호가 열린 채)", () => {
  const h = (text, y, x) => ({ text, fontSize: 11, font: "H", x, x2: x + 200, y });
  const pages = [
    { page: 1, lines: [H("Abstract", 12, 40), ...bodyAt(6, 60), H("1. 서론", 13, 160), ...bodyAt(30, 180),
      h("2.1 폴리페놀 함량 (Polyphenol", 640, 70)] },
    { page: 2, lines: [h("and flavonoid content)", 60, 70), ...bodyAt(10, 90), H("2. 결과", 13, 400), ...bodyAt(10, 420)] },
    { page: 3, lines: [...bodyAt(3, 60), H("3. 결론", 13, 200), ...bodyAt(30, 220), h("3.1 열린 괄호 없는 제목", 640, 70)] },
    { page: 4, lines: [h("Capitalized Next Line", 60, 70), ...bodyAt(10, 90), H("참고문헌", 13, 500)] },
  ];
  const r = titles(guessHeadings(pages));
  assert.ok(r.includes("2.1 폴리페놀 함량 (Polyphenol and flavonoid content)"), r.join("|"));
  assert.ok(r.includes("3.1 열린 괄호 없는 제목"), r.join("|")); // 다음 쪽 줄이 대문자로 시작하고 괄호도 닫혀 있으니 잇지 않는다
  assert.ok(!r.some((t) => /Capitalized/.test(t) && /3\.1/.test(t)));
});

test("첫 쪽 논문 제목·저자 줄은 목차에서 뺀다, 'Men and Women' 은 본문에 나오는 낱말일 때만 제목이다", () => {
  const big = (text, y) => ({ text, fontSize: 18, font: "T", x: 70, x2: 300, y });
  const pages = [
    { page: 1, lines: [big("바이오 자성나노입자 연구의 현황과 전망", 60), H("Smith and Jones", 12, 100), H("Abstract", 12, 140), ...bodyAt(6, 160),
      H("1. 서론", 13, 260), ...bodyAt(6, 280)] },
    { page: 2, lines: [...bodyAt(3, 60), H("Smith and Jones", 12, 140), ...bodyAt(3, 160), H("Men and Women", 12, 240),
      { text: "men were compared with women in this study design", fontSize: 10, font: "B", x: 70, x2: 270, y: 280 },
      ...bodyAt(3, 300), H("2. 방법", 13, 400), ...bodyAt(4, 420), H("참고문헌", 13, 700)] },
  ];
  const r = titles(guessHeadings(pages));
  assert.ok(!r.includes("바이오 자성나노입자 연구의 현황과 전망"));
  assert.ok(!r.includes("Smith and Jones"));
  assert.ok(r.includes("Men and Women"), r.join("|"));
});

test("내장 목차 첫 항목이 첫 쪽의 논문 제목이면 문서 제목으로 표시하고 아래 장·절을 한 단계 올린다", () => {
  const mk = (title, page, level, children) => ({ title, page, y: 10, level, children: children || [] });
  const tree = [mk("바이오-메디컬 자성나노입자 연구의 현황과 전망", 1, 1, [mk("Ⅰ. 개요", 1, 2, [mk("1. 배경", 1, 3)]), mk("Ⅱ. 정책", 3, 2)]), mk("부록", 9, 1)];
  const lines = [{ text: "바이오-메디컬 자성나노입자", fontSize: 18, y: 60 }, { text: "연구의 현황과 전망", fontSize: 18, y: 84 }, { text: "저자", fontSize: 11, y: 120 }];
  const r = flattenTree(promoteDocTitle(tree, lines));
  assert.deepEqual(r.map((e) => [e.title, e.level, !!e.docTitle]), [
    ["바이오-메디컬 자성나노입자 연구의 현황과 전망", 1, true], ["Ⅰ. 개요", 1, false], ["1. 배경", 2, false], ["Ⅱ. 정책", 1, false], ["부록", 1, false],
  ]);
  // 첫 쪽 제목과 다르면 그대로
  const other = [mk("Ⅰ. 개요", 1, 1, [mk("1. 배경", 1, 2)]), mk("Ⅱ. 정책", 3, 1)];
  assert.deepEqual(flattenTree(promoteDocTitle(other, lines)).map((e) => e.title), ["Ⅰ. 개요", "1. 배경", "Ⅱ. 정책"]);
});

test("번호 뒤에 단위나 수식이 오는 줄과 번호 순서가 이어지지 않는 점 없는 번호는 제목이 아니다", () => {
  const pages = [
    { page: 1, lines: [H("1. 서론", 13, 40), ...bodyAt(6, 60), H("2. 방법", 13, 160), ...bodyAt(4, 180),
      H("5 Hz stimulation", 11.5, 260), ...bodyAt(3, 280), H("2) Y = aX + b", 11.5, 340), ...bodyAt(3, 360),
      H("7 Results overview", 11.5, 440), ...bodyAt(3, 460), H("3. 결과", 13, 540), ...bodyAt(4, 560), H("참고문헌", 13, 700)] },
  ];
  assert.deepEqual(titles(guessHeadings(pages)), ["1. 서론", "2. 방법", "3. 결과", "참고문헌"]);
});

test("두 단 쪽의 전폭 제목은 y 순서로 두 단 본문 앞에 놓이고, 전폭 줄 위의 항목은 그 앞에 온다", () => {
  const w = (text, y, x, x2, size, font) => ({ text, fontSize: size || 12, font: font || "H", x, x2, y });
  const left = (n, y0) => Array.from({ length: n }, (_, i) => longBody(60, y0 + i * 14));
  const right = (n, y0) => Array.from({ length: n }, (_, i) => longBody(320, y0 + i * 14));
  const page1 = { page: 1, gutter: 300, lines: [
    ...left(6, 40), w("Abstract", 20, 60, 120), // 왼쪽 단 위쪽 제목
    w("Ⅰ. 전폭 제목은 양쪽 단에 걸친다", 130, 120, 500, 14), // 전폭 줄
    ...left(8, 150), w("1. 왼쪽 아래 제목", 300, 60, 160), ...left(4, 320),
    w("2. 오른쪽 위 제목", 160, 320, 420), ...right(8, 180),
  ] };
  const page2 = { page: 2, gutter: 300, lines: [...left(6, 60), ...right(6, 60), w("Ⅱ. 결론", 400, 60, 140, 14), ...left(5, 420), H("참고문헌", 13, 600, 60)] };
  const r = guessHeadings([page1, page2]);
  assert.deepEqual(r.map((e) => e.title), ["Abstract", "Ⅰ. 전폭 제목은 양쪽 단에 걸친다", "1. 왼쪽 아래 제목", "2. 오른쪽 위 제목", "Ⅱ. 결론", "참고문헌"]);
  const full = r[1];
  assert.equal(full.fw, true);
  assert.equal(full.col, 0);
  assert.ok(r[2].by === full.by && r[3].by === full.by);
});

test("findCurrentEntry: 전폭 줄은 쪽을 위아래 구간으로 가르고, 구간 안에서만 왼쪽→오른쪽 단 규칙을 쓴다", () => {
  const flat = [
    { page: 1, y: 20, tc: true, col: 0, title: "위 왼쪽" },
    { page: 1, y: 130, tc: true, col: 0, fw: true, by: 130, title: "전폭" },
    { page: 1, y: 300, tc: true, col: 0, by: 130, title: "아래 왼쪽" },
    { page: 1, y: 160, tc: true, col: 1, by: 130, title: "아래 오른쪽" },
  ];
  assert.equal(findCurrentEntry(flat, 1, 30), 0); // 전폭 줄 위, 왼쪽 단
  assert.equal(findCurrentEntry(flat, 1, 135), 1); // 전폭 줄을 지났고 두 단 제목은 아직
  assert.equal(findCurrentEntry(flat, 1, 200), 1); // 왼쪽 단 제목(300)을 지나기 전에는 오른쪽 단을 따르지 않는다
  assert.equal(findCurrentEntry(flat, 1, 310), 3); // 왼쪽 마지막 제목을 지나면 오른쪽 단 항목
  assert.equal(findCurrentEntry(flat, 2, 10), 3);
});

test("첫 제목 자리 판정은 읽는 순서로 한다: 오른쪽 단 위쪽의 번호 없는 제목은 왼쪽 단 아래의 첫 표제어 뒤에 놓여 받는다", () => {
  const w = (text, y, x, x2, size, font) => ({ text, fontSize: size, font: font || "H", x, x2, y });
  const left = (n, y0) => Array.from({ length: n }, (_, i) => longBody(60, y0 + i * 14));
  const right = (n, y0) => Array.from({ length: n }, (_, i) => longBody(320, y0 + i * 14));
  const pages = [
    { page: 1, gutter: 300, lines: [...left(25, 60), w("Abstract", 420, 60, 140, 12), ...left(6, 440), w("세균에서의 QS", 100, 320, 420, 12), ...right(8, 130)] },
    { page: 2, gutter: 300, lines: [w("1. 서론", 60, 60, 140, 13), ...left(8, 90), ...right(8, 90), w("참고문헌", 400, 60, 140, 13)] },
  ];
  assert.deepEqual(titles(guessHeadings(pages)), ["Abstract", "세균에서의 QS", "1. 서론", "참고문헌"]);
});

test("결정성: 쪽을 어떤 순서로 줘도(비동기 포함) 같은 목차가 나온다", async () => {
  const pages = [
    { page: 1, lines: [H("Abstract", 12, 40), ...bodyAt(8, 60), H("1. 서론", 13, 200), plain("1.1 연구의 배경", 230), ...bodyAt(8, 262)] },
    { page: 2, lines: [H("2. 연구방법", 13, 60), plain("2.1 연구대상", 90), ...bodyAt(8, 122), H("결과", 13, 260), H("1. 검체", 11.5, 290), ...bodyAt(4, 310)] },
    { page: 3, lines: [...bodyAt(5, 60), H("고찰", 13, 150), ...bodyAt(4, 170), H("참고문헌", 13, 300)] },
  ];
  const base = JSON.stringify(guessHeadings(pages));
  const orders = [[2, 0, 1], [1, 2, 0], [2, 1, 0]];
  for (const o of orders) assert.equal(JSON.stringify(guessHeadings(o.map((i) => pages[i]))), base);
  assert.equal(JSON.stringify(await guessHeadingsAsync([pages[2], pages[0], pages[1]])), base);
  assert.ok(JSON.parse(base).length >= 8);
});

// ---------- 번호 순서를 잇는 본문 크기 제목 · 제목 전용 글꼴 · 문서의 단 위치 ----------
const bl = (text, y, x, x2, font) => ({ text, fontSize: 10, font: font || "B", x, x2, y });
function seqDoc(head, tailText, afterX, heads) {
  // 1쪽: "1. 서론"(굵은 큰 글자) 다음 본문, 본문 크기 번호 제목 head(두 줄로 꺾임) + 끝줄 + 아래 문단
  return [{ page: 1, lines: [
    H("1. 서론", 13, 40), ...bodyAt(6, 60),
    bl(head, 160, 70, 250), bl(tailText, 174, 70, 100), bl("본 연구는 대상자의 특성을 살펴보기 위하여 설문을 실시하였다", 188, afterX, afterX + 200),
    ...bodyAt(5, 202), ...(heads || []), H("참고문헌", 13, 340),
  ] }];
}

test("본문 크기 번호 제목: 앞 제목(1.)에 정확히 이어지는 2. 가 두 줄로 꺾여도 제목이다(끝줄을 합친다)", () => {
  const r = guessHeadings(seqDoc("2. 휴대용 뇌파분석기와 아두이노를 이용한 집중력 향상", "시스템", 80));
  assert.deepEqual(titles(r), ["1. 서론", "2. 휴대용 뇌파분석기와 아두이노를 이용한 집중력 향상 시스템", "참고문헌"]);
});

test("본문 크기 번호 제목: 번호가 이어지지 않거나(3.) 아래가 새 문단이 아니거나 문장이면 제목이 아니다", () => {
  const has = (r) => titles(r).some((t) => /^[23]\. 휴대용/.test(t));
  const mid = [H("2. 방법", 13, 300)];
  assert.ok(!has(guessHeadings(seqDoc("3. 휴대용 뇌파분석기와 아두이노를 이용한 집중력 향상", "시스템", 80, mid))));
  assert.ok(!has(guessHeadings(seqDoc("2. 휴대용 뇌파분석기와 아두이노를 이용한 집중력 향상", "시스템", 70, mid)))); // 같은 왼쪽 끝: 번호 목록
  assert.ok(!has(guessHeadings(seqDoc("2. 휴대용 뇌파분석기와 아두이노를 이용한 집중력 향상", "시스템이다.", 80, mid))));
  // 앞 제목이 없으면(사슬 없음) 받지 않는다
  const pages = [{ page: 1, lines: [H("서론", 13, 40), ...bodyAt(6, 60), bl("2. 휴대용 뇌파분석기와 아두이노를 이용한 집중력 향상", 160, 70, 250), bl("시스템", 174, 70, 100), bl("본 연구는 대상자의 특성을 살펴보기 위하여 설문을 실시하였다", 188, 80, 280), ...bodyAt(5, 202), H("방법", 13, 300), H("참고문헌", 13, 340)] }];
  assert.ok(!has(guessHeadings(pages)));
});

test("본문 크기 번호 제목: 위아래가 트인 한 줄 3. 도 앞 번호에 이어질 때만 제목이다", () => {
  const mk = (num) => [{ page: 1, lines: [
    H("1. 서론", 13, 40), ...bodyAt(6, 60), H("2. 방법", 13, 160), ...bodyAt(4, 180),
    bl(num + ". 시스템 구성", 270, 70, 150), ...bodyAt(4, 300), H("참고문헌", 13, 400),
  ] }];
  assert.deepEqual(titles(guessHeadings(mk(3))), ["1. 서론", "2. 방법", "3. 시스템 구성", "참고문헌"]);
  assert.deepEqual(titles(guessHeadings(mk(5))), ["1. 서론", "2. 방법", "참고문헌"]);
});

test("제목 전용 글꼴: 이 글꼴이 짧은 제목 줄에만 쓰이면 본문 크기여도, 위가 트인 한 줄이면 제목이다", () => {
  const S = (text, y) => bl(text, y, 70, 70 + text.length * 8, "S");
  const mk = (page2) => [
    { page: 1, lines: [H("1. 서론", 13, 40), ...bodyAt(40, 60), H("2. 방법", 13, 640)] },
    { page: 2, lines: [...page2, H("참고문헌", 13, 500)] },
  ];
  const good = [...bodyAt(4, 60), S("효소 반응 연구", 130), ...bodyAt(4, 144), S("억제 전략의 개발", 230), ...bodyAt(4, 244), S("마지막 소제목 예시", 330), ...bodyAt(4, 344)];
  const r = titles(guessHeadings(mk(good)));
  assert.ok(r.includes("효소 반응 연구") && r.includes("억제 전략의 개발"), r.join("|"));
  // 같은 글꼴이 문장(마침표로 끝나는 줄)에도 쓰였으면 제목 전용 글꼴이 아니다
  const r2 = titles(guessHeadings(mk([...good, S("이 글꼴은 문장도 쓴다.", 430), ...bodyAt(1, 444)])));
  assert.ok(!r2.includes("효소 반응 연구"));
  // 위가 트이지 않은(앞 문단에 바로 붙은) 줄은 제목이 아니다
  const tight = [...bodyAt(4, 60), S("효소 반응 연구", 116), ...bodyAt(4, 130), S("억제 전략의 개발", 186), ...bodyAt(4, 200), S("세 번째 제목", 256), ...bodyAt(4, 270)];
  const r3 = titles(guessHeadings(mk(tight)));
  assert.ok(!r3.includes("억제 전략의 개발") && !r3.includes("효소 반응 연구"));
});

test("문서의 단 위치: 단을 못 찾은 쪽도 다른 쪽들과 같은 자리에서 두 단이면 읽는 순서(왼쪽 단 → 오른쪽 단)로 놓는다", () => {
  const left = (n, y0) => Array.from({ length: n }, (_, i) => longBody(60, y0 + i * 14));
  const right = (n, y0) => Array.from({ length: n }, (_, i) => longBody(320, y0 + i * 14));
  const w = (text, y, x) => ({ text, fontSize: 13, font: "H", x, x2: x + 100, y });
  const full = (n, y0) => Array.from({ length: n }, (_, i) => ({ text: "전폭으로 깔린 제목과 초록 줄이다 전폭으로 깔린 제목과 초록 줄이다", fontSize: 10, font: "B", x: 60, x2: 560, y: y0 + i * 14 }));
  const two = (pg, a, b) => ({ page: pg, lines: [...left(14, 60), ...right(14, 60), w(a, 300, 60), w(b, 120, 320)] });
  // 3쪽: 전폭 줄이 많아 쪽만으로는 단 위치를 못 찾는다
  const odd = { page: 3, lines: [...full(14, 40), ...left(6, 250), ...right(6, 250), w("Ⅳ. 넷째 장", 400, 60), w("Ⅴ. 다섯째 장", 270, 320)] };
  const last = { page: 4, lines: [...left(3, 60), w("참고문헌", 200, 60)] };
  assert.equal(detectGutter(odd.lines), null);
  const docs = [two(1, "Ⅰ. 첫째 장", "Ⅱ. 둘째 장"), two(2, "Ⅲ. 셋째 장", "Ⅲ. 셋째 장 계속"), odd, last];
  const r = guessHeadings(docs);
  assert.deepEqual(r.filter((e) => e.page === 3).map((e) => e.title), ["Ⅳ. 넷째 장", "Ⅴ. 다섯째 장"]);
  assert.deepEqual(r.filter((e) => e.page === 3).map((e) => e.col), [0, 1]);
  // 쪽 순서를 바꿔도 같다
  assert.equal(JSON.stringify(guessHeadings([docs[3], docs[1], docs[2], docs[0]])), JSON.stringify(r));
  // 다른 쪽에서 단 위치를 찾지 못하면(한 단 문서) 이 쪽에 단 위치를 주지 않는다
  const r1 = guessHeadings([{ page: 1, lines: [...bodyAt(14, 60), H("Ⅰ. 첫째 장", 13, 40)] }, { page: 2, lines: [...bodyAt(14, 60), H("Ⅱ. 둘째 장", 13, 40)] }, odd, last]);
  assert.ok(r1.filter((e) => e.page === 3).every((e) => e.col === undefined));
});
