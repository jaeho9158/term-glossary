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
    { page: 2, lines: [...bodyAt(10, 60), ...texts.map((t, i) => H(t, 11.5, 220 + i * 40)), ...bodyAt(15, 220 + texts.length * 40 + 20)] },
    { page: 3, lines: [H("2. Methods", 13, 60), ...bodyAt(25, 80), H("References", 13, 480), ...bodyAt(5, 500)] },
  ];
  return titles(guessHeadings(pages)).filter((t) => texts.indexOf(t) >= 0);
}

test("번호 없는 제목 후보: 저자·날짜·학술지·식별자 줄은 받지 않는다", () => {
  const bad = ["Kim Jaeho and Lee Minsu", "김철수 이영희 박민수", "J. Kim, S. Lee", "Received 12 March 2020", "Journal of Korean Medicine", "Orcid",
    "김철수·이영희", "Smith and Jones", "Accepted: May 3, 2020", "한국의학회지"];
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
