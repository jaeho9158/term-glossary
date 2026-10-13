const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../assets/reader/refs.js");

// ---------- findReferenceSection ----------
test("findReferenceSection: 제목 줄 다음 위치를 돌려준다", () => {
  const pages = ["서론 …결론…\nReferences\n[1] Kim, A. Title. 2020.\n[2] Lee, B. Other. 2019."];
  const sec = R.findReferenceSection(pages);
  assert.equal(sec.page, 1);
  assert.equal(pages[0].slice(sec.offset, sec.offset + 3), "[1]");
  assert.equal(sec.endPage, 1);
  assert.equal(sec.endOffset, pages[0].length);
});

test("findReferenceSection: 제목 변형 (참고문헌, 참고 문헌, REFERENCES, 인용문헌, Bibliography, 번호가 붙은 제목)", () => {
  ["참고문헌", "참 고 문 헌", "참고 문헌", "REFERENCES", "인용문헌", "Bibliography", "6. References", "Ⅵ. 참고문헌", "References:"].forEach((h) => {
    const sec = R.findReferenceSection(["본문 끝.\n" + h + "\n[1] Kim, A. Title. 2020. Journal of X, 1(2), 3-4."]);
    assert.ok(sec, h);
    assert.equal(sec.page, 1, h);
  });
});

test("findReferenceSection: 본문 중 문장은 제목이 아니다 (줄 전체가 제목일 때만)", () => {
  const pages = ["…as described in the references section of the guide. See References for details.\n참고문헌은 뒤에 있다.\n그 밖의 말이 이어진다. 충분히 긴 글이 필요하다 충분히."];
  assert.equal(R.findReferenceSection(pages), null);
});

test("findReferenceSection: 제목이 없으면 null, 빈 입력도 null", () => {
  assert.equal(R.findReferenceSection(["그냥 본문", "또 본문"]), null);
  assert.equal(R.findReferenceSection([]), null);
  assert.equal(R.findReferenceSection(undefined), null);
});

test("findReferenceSection: Appendix/부록 제목 줄에서 끝난다", () => {
  const body = "결론\nReferences\n[1] Kim, A. Title. 2020. Journal 1(2).\n[2] Lee, B. Other. 2019. Journal 3(4).\nAppendix A\n추가 자료";
  const sec = R.findReferenceSection([body]);
  assert.equal(body.slice(sec.endOffset, sec.endOffset + 10), "Appendix A");
  const body2 = "참고문헌\n[1] 김철수. 제목. 2020. 학술지 1(2) 3-4쪽.\n부록\n표";
  const sec2 = R.findReferenceSection([body2]);
  assert.equal(body2.slice(sec2.endOffset, sec2.endOffset + 2), "부록");
});

test("findReferenceSection: 여러 쪽에 걸친 구역, 끝은 마지막 쪽 끝", () => {
  const pages = ["본문", "마무리\nReferences\n[1] A. Kim, Title. 2020, Journal.", "[2] B. Lee, Title two. 2019, Journal.\n[3] C. Park, Title. 2018, Journal."];
  const sec = R.findReferenceSection(pages);
  assert.equal(sec.page, 2);
  assert.equal(sec.endPage, 3);
  assert.equal(sec.endOffset, pages[2].length);
});

test("findReferenceSection: 쪽마다 반복되는 머리말 'References' 는 첫 쪽에서 시작", () => {
  const pages = ["본문", "References\n[1] A. Kim, Title one is here. 2020, Journal.", "References\n[2] B. Lee, Title two is here. 2019, Journal.", "References\n[3] C. Park, Title three is here. 2018, Journal."];
  const sec = R.findReferenceSection(pages);
  assert.equal(sec.page, 2);
  assert.equal(sec.endPage, 4 - 0);
});

test("findReferenceSection: NUL 이 공백 대신 들어간 글에서도 제목을 찾는다", () => {
  const sec = R.findReferenceSection(["본문\nReferences\u0000\n[1] Kim, A. Title. 2020. Journal of Things 1(2)."]);
  assert.ok(sec);
});

// ---------- splitReferences ----------
test("splitReferences: [n] 번호, 둘째는 줄바꿈 포함", () => {
  const src = "[1] A. Kim, Title, 2020.\n[2] B. Lee,\n  Long title, 2019.";
  const refs = R.splitReferences(src);
  assert.equal(refs.length, 2);
  assert.deepEqual(refs.map((r) => r.n), [1, 2]);
  assert.ok(refs[1].text.includes("\n"));
  assert.equal(src.slice(refs[1].start, refs[1].end), refs[1].text);
  assert.ok(refs[0].text.startsWith("[1]"));
});

test("splitReferences: 'n.' 번호 두 건", () => {
  const refs = R.splitReferences("1. Kim, A. Title. Journal 2020.\n2. Lee, B. Other. Journal 2019.");
  assert.equal(refs.length, 2);
  assert.deepEqual(refs.map((r) => r.n), [1, 2]);
});

test("splitReferences: 'n)' 와 '(n)' 번호", () => {
  assert.equal(R.splitReferences("1) Kim, A. Title. Journal 2020.\n2) Lee, B. Other. Journal 2019.\n3) Park, C. Third. Journal 2018.").length, 3);
  assert.equal(R.splitReferences("(1) Kim, A. Title. Journal 2020.\n(2) Lee, B. Other. Journal 2019.").length, 2);
});

test("splitReferences: 번호가 이어지지 않는 줄 머리 숫자('2.5 mg')는 새 항목이 아니다", () => {
  const refs = R.splitReferences("1. Kim, A. Dose study of\n2.5 mg tablets. Journal 2020.\n2. Lee, B. Other. Journal 2019.");
  assert.equal(refs.length, 2);
  assert.ok(refs[0].text.includes("2.5 mg"));
});

test("splitReferences: 대괄호 번호는 빠진 번호([2] 없음)를 건너뛰어도 이어간다", () => {
  const refs = R.splitReferences("[1] A. Kim, Title one. 2020.\n[3] C. Park, Title three. 2018.\n[4] D. Choi, Title four. 2017.");
  assert.deepEqual(refs.map((r) => r.n), [1, 3, 4]);
});

test("splitReferences: 번호 없는 저자-연도 목록 두 건", () => {
  const refs = R.splitReferences("Kim, A. (2020). Title.\nLee, B. (2019). Other.");
  assert.equal(refs.length, 2);
  assert.deepEqual(refs.map((r) => r.n), [null, null]);
});

test("splitReferences: 한글 저자-연도, 줄바꿈으로 이어진 항목, 같은 저자 표시(____.)", () => {
  const src = "김철수, 이영희(2020). 제목이 긴 연구. 학술지, 12(3),\n45-67.\n박민수. (2019). 다른 연구. 학술지, 1(2): 3-4.\n______. (2018). 또 다른 연구. 학술지, 1(2): 5-6.";
  const refs = R.splitReferences(src);
  assert.equal(refs.length, 3);
  assert.ok(refs[0].text.includes("45-67"));
});

test("splitReferences: 저자 목록이 줄 끝에서 이어지는 줄('Niwa, M. (1985)')은 새 항목이 아니다", () => {
  const src = "Kawabata, S., Postle, R., &\nNiwa, M. (1985). Object measurement. Journal 1(2).\nSmith, J. (1990). Other thing. Journal 3(4).";
  const refs = R.splitReferences(src);
  assert.equal(refs.length, 2);
});

test("splitReferences: 하위 제목 줄(1. 국내문헌)은 항목이 아니다", () => {
  const src = "1. 국내문헌\n김용석. (2014). 제목. ｢학술지｣, 40(2): 232-241.\n박성수. (2013). 다른 제목. ｢학술지｣, 3(1): 1-24.\n2. 국외문헌\nKim, A. (2020). Title. Journal 1(2).";
  const refs = R.splitReferences(src);
  assert.equal(refs.length, 3);
  assert.deepEqual(refs.map((r) => r.n), [null, null, null]);
  assert.ok(!refs[1].text.includes("국외문헌"));
});

test("splitReferences: 빈 입력은 []", () => {
  assert.deepEqual(R.splitReferences(""), []);
  assert.deepEqual(R.splitReferences(null), []);
});

// ---------- findNumericCitations ----------
test("findNumericCitations: [3], [4,7], [10–12]", () => {
  const t = "as shown [3], [4,7] and [10–12].";
  const out = R.findNumericCitations(t, 12);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((c) => c.numbers), [[3], [4, 7], [10, 11, 12]]);
  assert.equal(t.slice(out[0].start, out[0].end), "[3]");
  assert.equal(t.slice(out[2].start, out[2].end), "[10–12]");
});

test("findNumericCitations: Review Focus 4 — 연도·0·소괄호·범위 밖은 인용이 아니다", () => {
  assert.deepEqual(R.findNumericCitations("in [2020] we", 12), []);
  assert.deepEqual(R.findNumericCitations("the [0] value", 12), []);
  assert.deepEqual(R.findNumericCitations("식 (5) 와 (5)", 12), []);
  assert.deepEqual(R.findNumericCitations("see [13]", 12), []);
  assert.deepEqual(R.findNumericCitations("see [3] and [4]", 0), []);
  assert.deepEqual(R.findNumericCitations("see [3]", undefined), []);
  assert.deepEqual(R.findNumericCitations("see [1, 2020]", 12), []);
  assert.deepEqual(R.findNumericCitations("see [5-3]", 12), []);
});

test("findNumericCitations: 글자가 섞인 대괄호, 수식 첨자는 제외", () => {
  assert.deepEqual(R.findNumericCitations("range [1-3 mg] and x[1] and (f)[2]", 12), []);
  assert.equal(R.findNumericCitations("연구[3]에서 보고", 12).length, 1);
  assert.equal(R.findNumericCitations("results.[4]", 12).length, 1);
});

test("findNumericCitations: 공백·NUL·줄바꿈이 낀 [ 3 , 4 ]", () => {
  const out = R.findNumericCitations("본문 [ 3 ,\u00004 ] 끝", 12);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].numbers, [3, 4]);
});

// ---------- findAuthorYearCitations ----------
const ay = (s) => R.findAuthorYearCitations(s);

test("findAuthorYearCitations: (Kim, 2020), (Kim & Lee, 2020)", () => {
  const a = ay("as in (Kim, 2020) and (Kim & Lee, 2020).");
  assert.equal(a.length, 2);
  assert.deepEqual(a[0].authors, ["Kim"]);
  assert.equal(a[0].year, "2020");
  assert.deepEqual(a[1].authors, ["Kim", "Lee"]);
});

test("findAuthorYearCitations: (Kim et al., 2020; Park, 2019) 는 두 건", () => {
  const t = "(Kim et al., 2020; Park, 2019)";
  const a = ay(t);
  assert.equal(a.length, 2);
  assert.equal(a[0].etAl, true);
  assert.equal(t.slice(a[0].start, a[0].end), "Kim et al., 2020");
  assert.equal(t.slice(a[1].start, a[1].end), "Park, 2019");
});

test("findAuthorYearCitations: Kim et al. (2020), Kim and Lee (2020)", () => {
  const a = ay("Kim et al. (2020) showed; Kim and Lee (2021) found.");
  assert.equal(a.length, 2);
  assert.deepEqual(a[0].authors, ["Kim"]);
  assert.equal(a[0].etAl, true);
  assert.deepEqual(a[1].authors, ["Kim", "Lee"]);
  assert.equal(a[1].year, "2021");
});

test("findAuthorYearCitations: 한글 (김철수, 2020), (김철수 외, 2020), (김철수･이영희, 2020), 김철수(2020)", () => {
  const a = ay("(김철수, 2020) 와 (김철수 외, 2020) 와 (김철수･이영희, 2019) 그리고 박민수(2018)는 보고했다.");
  assert.equal(a.length, 4);
  assert.deepEqual(a[0].authors, ["김철수"]);
  assert.equal(a[1].etAl, true);
  assert.deepEqual(a[2].authors, ["김철수", "이영희"]);
  assert.deepEqual(a[3].authors, ["박민수"]);
});

test("findAuthorYearCitations: 저자가 아닌 말은 제외 (Figure, Table, Eq, 그림, 표)", () => {
  assert.deepEqual(ay("(Figure 3, 2020) (Table 2, 2019) (Eq 5, 2018) (그림 3, 2020) (표 2, 2020) (Fig, 2020)"), []);
  assert.deepEqual(ay("(2020) (p < 0.05) (n = 2020) (January 2020) (In 2020) (since 2019)"), []);
});

test("findAuthorYearCitations: 연도 꼬리표 2020a, 쪽 번호 ', p. 12'", () => {
  const a = ay("(Kim, 2020a) (Lee, 2019, p. 12)");
  assert.equal(a.length, 2);
  assert.equal(a[0].year, "2020a");
  assert.equal(a[1].year, "2019");
});

test("findAuthorYearCitations: 줄바꿈이 낀 인용", () => {
  const a = ay("as shown (Kim et al.,\n2020) here");
  assert.equal(a.length, 1);
});

test("findAuthorYearCitations: 'Moreover, Kim (2020)' 의 앞 낱말은 저자가 아니다", () => {
  const a = ay("Moreover, Kim (2020) argued");
  assert.equal(a.length, 1);
  assert.deepEqual(a[0].authors, ["Kim"]);
});

// ---------- matchAuthorYear ----------
const refsOf = (...texts) => texts.map((text, i) => ({ n: null, text, start: i, end: i }));

test("matchAuthorYear: 하나일 때만 연결한다", () => {
  const refs = refsOf("Kim, A. (2020). Title. Journal.", "Lee, B. (2019). Other. Journal.");
  assert.equal(R.matchAuthorYear(ay("(Kim, 2020)")[0], refs), 0);
  assert.equal(R.matchAuthorYear(ay("(Lee, 2019)")[0], refs), 1);
});

test("matchAuthorYear: Kim 2020a/2020b 둘이면 -1, 꼬리표가 있으면 정확히 하나", () => {
  const refs = refsOf("Kim, A. (2020a). First. Journal.", "Kim, A. (2020b). Second. Journal.");
  assert.equal(R.matchAuthorYear(ay("(Kim, 2020)")[0], refs), -1);
  assert.equal(R.matchAuthorYear(ay("(Kim, 2020b)")[0], refs), 1);
});

test("matchAuthorYear: 없으면 -1, 연도가 다르면 -1", () => {
  const refs = refsOf("Kim, A. (2020). Title. Journal.");
  assert.equal(R.matchAuthorYear(ay("(Park, 2020)")[0], refs), -1);
  assert.equal(R.matchAuthorYear(ay("(Kim, 2019)")[0], refs), -1);
  assert.equal(R.matchAuthorYear(null, refs), -1);
  assert.equal(R.matchAuthorYear(ay("(Kim, 2020)")[0], []), -1);
});

test("matchAuthorYear: 저자 수가 어긋나면 연결하지 않는다 ((Kim, 2020) vs 'Kim, A., & Lee, B. (2020)')", () => {
  const refs = refsOf("Kim, A., & Lee, B. (2020). Title. Journal.");
  assert.equal(R.matchAuthorYear(ay("(Kim, 2020)")[0], refs), -1);
  assert.equal(R.matchAuthorYear(ay("(Kim & Lee, 2020)")[0], refs), 0);
  assert.equal(R.matchAuthorYear(ay("(Kim & Park, 2020)")[0], refs), -1);
  // 서양식 "et al." 은 저자 셋 이상: 저자가 꼭 둘인 항목에는 붙이지 않는다
  assert.equal(R.matchAuthorYear(ay("(Kim et al., 2020)")[0], refs), -1);
});

test("matchAuthorYear: 단독 저자 항목과 공저 항목이 함께 있으면 저자 수가 맞는 쪽", () => {
  const refs = refsOf("Kim, A. (2020). Solo. Journal.", "Kim, A., & Lee, B. (2020). Pair. Journal.");
  assert.equal(R.matchAuthorYear(ay("(Kim, 2020)")[0], refs), 0);
  assert.equal(R.matchAuthorYear(ay("(Kim & Lee, 2020)")[0], refs), 1);
});

test("matchAuthorYear: 한글은 이름 전체가 같아야 한다 (성만 같은 다른 사람은 연결하지 않는다)", () => {
  const refs = refsOf("김철수. (2020). 제목. 학술지, 1(2): 3-4.", "김철호, 이영희. (2020). 다른 제목. 학술지, 1(2): 3-4.");
  assert.equal(R.matchAuthorYear(ay("(김철수, 2020)")[0], refs), 0);
  assert.equal(R.matchAuthorYear(ay("(김철호 외, 2020)")[0], refs), 1);
  assert.equal(R.matchAuthorYear(ay("(김철, 2020)")[0], refs), -1);
});

test("matchAuthorYear: '____.' 같은 저자 표시는 앞 항목의 저자를 잇는다", () => {
  const refs = refsOf("박성수. (2013). 첫째. 학술지, 3(1): 1-24.", "______. (2019). 둘째. 학술지, 13(2): 227-258.");
  assert.equal(R.matchAuthorYear(ay("(박성수, 2019)")[0], refs), 1);
});

test("matchAuthorYear: 기관 저자·이니셜이 앞서는 항목은 연결하지 않는다", () => {
  const refs = refsOf("World Health Organization. (2020). Report.", "N. Y. Kim, H. S. Lee, Title, Journal, (2017).");
  assert.equal(R.matchAuthorYear(ay("World (2020)")[0] || { authors: ["World"], year: "2020" }, refs), -1);
  assert.equal(R.matchAuthorYear({ authors: ["Kim"], year: "2017" }, refs), -1);
});

// ---------- findCrossRefs ----------
test("findCrossRefs: Fig. 3, Table 2, Section 2.1, Eq. (5), 그림 4, 표 1 — 여섯 건과 label", () => {
  const t = "see Fig. 3 and Table 2, Section 2.1, Eq. (5), 그림 4, 표 1";
  const out = R.findCrossRefs(t);
  assert.equal(out.length, 6);
  assert.deepEqual(out.map((c) => c.kind), ["fig", "table", "sec", "eq", "fig", "table"]);
  assert.deepEqual(out.map((c) => c.label), ["Fig. 3", "Table 2", "Section 2.1", "Eq. (5)", "그림 4", "표 1"]);
  assert.deepEqual(out.map((c) => c.key), ["fig:3", "table:2", "sec:2.1", "eq:5", "fig:4", "table:1"]);
  assert.equal(t.slice(out[3].start, out[3].end), "Eq. (5)");
});

test("findCrossRefs: Figure/Equation/Sec./식 (5)/2.1절/로마 숫자 표", () => {
  const out = R.findCrossRefs("Figure 7, Equation 5, Sec. 3, 식 (12) 및 2.1절 그리고 TABLE II");
  assert.deepEqual(out.map((c) => c.key), ["fig:7", "eq:5", "sec:3", "eq:12", "sec:2.1", "table:2"]);
});

test("findCrossRefs: 단어 일부는 참조가 아니다 (대표 2, 발표 3, Config 3)", () => {
  assert.deepEqual(R.findCrossRefs("대표 2명, 발표 3회, Config 3, Tablet 4"), []);
});

// ---------- findTargets ----------
test("findTargets: 줄 머리의 캡션만 대상", () => {
  const pages = [
    "본문 문장이다.\nFigure 3. Overview of the system.\n계속\nFig. 4: Another one.\n본문이 이어진다.\nTable 2. Results table.",
    "그림 5. 한글 그림.\n본문이 이어진다.\n표 1. 한글 표.\n본문이 또 이어진다.\n<표 6> 꺾쇠 표.\n본문 문장이다.\n[그림 7] 대괄호 그림.",
  ];
  const m = R.findTargets(pages);
  ["fig:3", "fig:4", "table:2", "fig:5", "table:1", "table:6", "fig:7"].forEach((k) => assert.ok(m.has(k), k));
  assert.equal(pages[0].slice(m.get("fig:3").offset, m.get("fig:3").offset + 8), "Figure 3");
  assert.equal(m.get("fig:3").page, 1);
});

test("findTargets: 본문 중간의 'as in Figure 3. The…' 는 대상이 아니다", () => {
  const m = R.findTargets(["as in Figure 3. The model works. See also Table 2: values."]);
  assert.equal(m.size, 0);
});

test("findTargets: 본문 줄바꿈으로 줄 머리에 온 'Figure 3 shows' 는 대상이 아니다", () => {
  const m = R.findTargets(["The experimental setup and the corresponding results are\nFigure 3 shows the overview of the system and so on.\n"]);
  assert.equal(m.size, 0);
});

test("findTargets: 문장 중간에서 끊긴 긴 줄 다음의 'Figure 3. The' 는 대상이 아니다", () => {
  const long = "The experimental setup and the corresponding results are summarised as in";
  const m = R.findTargets([long + "\nFigure 3. The model works as expected."]);
  assert.equal(m.size, 0);
});

test("findTargets: 같은 번호가 두 번 나오면 첫 번째, 쪽을 넘어서도", () => {
  const pages = ["Figure 3. First.\n", "x\nFigure 3. Second.\n"];
  const m = R.findTargets(pages);
  assert.equal(m.get("fig:3").page, 1);
});

test("findTargets: 목차 점선 줄, 참고문헌 구역 안의 줄은 대상이 아니다", () => {
  const pages = ["그림 목차\n그림 1. 개요 ........ 12\n", "본문\nReferences\nFigure 9. Not a caption in refs. Journal 2020.\n[1] A. Kim, Title. 2020."];
  const m = R.findTargets(pages);
  assert.ok(!m.has("fig:1"));
  assert.ok(!m.has("fig:9"));
});

test("findTargets: 로마 숫자 표, 식 번호는 줄 오른쪽 끝의 (5) (수식 기호가 있는 줄만)", () => {
  const pages = ["TABLE II. Comparison.\nE = m c^2   (5)\n이 값은 문헌에서 보고되었다 (12)\nwe observe that the value of the signal was low, as shown (3)\n"];
  const m = R.findTargets(pages);
  assert.ok(m.has("table:2"));
  assert.equal(m.get("eq:5").page, 1);
  assert.ok(!m.has("eq:12"));
  assert.ok(!m.has("eq:3"));
});

test("findTargets: 빈 입력", () => {
  assert.equal(R.findTargets([]).size, 0);
  assert.equal(R.findTargets(undefined).size, 0);
});

// ---------- analyzeDocument ----------
test("analyzeDocument: 쪽에 걸친 목록, 머리말 줄 제거, 항목의 쪽·위치", () => {
  const head = "한국 학술지 제12권 제3호";
  const pages = [
    head + " 7\n본문 1쪽\n", head + " 8\n본문 2쪽\n",
    head + " 1\n본문 3쪽 끝\nReferences\n[1] A. Kim, Title one is long. 2020, Journal.\n[2] B. Lee, Title two is long enough that it wraps\n3",
    head + " 2\nhere for the next line. 2019, Journal.\n[3] C. Park, Title three. 2018, Journal.\n4",
  ];
  const d = R.analyzeDocument(pages);
  assert.equal(d.numbered, true);
  assert.equal(d.refs.length, 3);
  assert.equal(d.refCount, 3);
  assert.ok(!d.refs[1].text.includes(head));
  assert.ok(d.refs[1].text.includes("for the next line"));
  assert.equal(d.refs[2].page, 4);
  assert.equal(pages[3].slice(d.refs[2].offset, d.refs[2].offset + 3), "[3]");
});

test("analyzeDocument: 참고문헌 제목이 없으면 항목 없음", () => {
  const d = R.analyzeDocument(["본문뿐"]);
  assert.equal(d.section, null);
  assert.deepEqual(d.refs, []);
});

// ---------- 틀린 카드를 막는 규칙 (측정에서 나온 사례) ----------
test("findCrossRefs: Supplementary/부록 표는 본문 표가 아니다", () => {
  const out = R.findCrossRefs("부록표(Supplementary Table 1)에는, Supplementary Tables 3, 그리고 Table 2 는 본문, Appendix Fig. 4 도 제외");
  assert.deepEqual(out.map((c) => c.key), ["table:2"]);
});

test("findTargets: 'Table 5. Continued' 는 대상이 아니다 (이어진 쪽)", () => {
  const m = R.findTargets(["본문\n\nTable 5. Continued\n값", "Table 5. 실제 캡션\n"]);
  assert.equal(m.get("table:5").page, 2);
});

test("findTargets: 'Fig. 1.에서'·'<표 1>과' 처럼 조사가 붙은 본문 줄은 대상이 아니다", () => {
  const m = R.findTargets(["식 (1)\nFig. 1.에서 점좌표를 구한다\n<표 2>와 같이 정리하였다\n\nFig. 1. 실제 캡션\n<표 2> 실제 표 제목\n"]);
  assert.equal(m.get("fig:1").offset, "식 (1)\nFig. 1.에서 점좌표를 구한다\n<표 2>와 같이 정리하였다\n\n".length);
  assert.equal(m.get("table:2").offset, "식 (1)\nFig. 1.에서 점좌표를 구한다\n<표 2>와 같이 정리하였다\n\nFig. 1. 실제 캡션\n".length);
});

test("findTargets: '(Fig. 3)' 로 시작하는 본문 줄은 대상이 아니다", () => {
  assert.equal(R.findTargets(["(Fig. 3) shows the results of the experiments."]).size, 0);
});

test("splitReferences: 기관·약어 저자('APA. (2013)')도 새 항목으로 나눈다", () => {
  const refs = R.splitReferences("홍서아. (2018). 청소년의 약물중독 실태. 학술지, 8(2): 93-115.\nAPA. (2013). DSM-5 간편 정신질환진단통계편람. 서울: 학지사.\nUNODC. (2021). World drug report. Vienna.");
  assert.equal(refs.length, 3);
  const refs2 = refs.map((r) => ({ n: null, text: r.text }));
  assert.equal(R.matchAuthorYear({ authors: ["APA"], year: "2013" }, refs2), 1);
  assert.equal(R.matchAuthorYear({ authors: ["UNODC"], year: "2021" }, refs2), 2);
});

test("matchAuthorYear: 여러 낱말 기관명 항목에는 첫 낱말만으로 연결하지 않는다", () => {
  const refs = [{ n: null, text: "World Health Organization. (2020). Report. Geneva." }];
  assert.equal(R.matchAuthorYear({ authors: ["World"], year: "2020" }, refs), -1);
});

test("analyzeDocument: 번호가 5% 넘게 빠진 목록은 번호식 인용을 신뢰하지 않는다", () => {
  const gap = ["Intro\nReferences\n[1] A. Kim, Title one is long enough. 2020, Journal.\n[3] C. Park, Title three is long enough. 2018, Journal.\n[4] D. Choi, Title four is long enough. 2017, Journal.\n[7] E. Han, Title seven is long enough. 2016, Journal."];
  const d = R.analyzeDocument(gap);
  assert.equal(d.numbered, true);
  assert.equal(d.numericOk, false);
  const ok = ["Intro\nReferences\n[1] A. Kim, Title one is long enough. 2020, Journal.\n[2] C. Park, Title two is long enough. 2018, Journal.\n[3] D. Choi, Title three is long enough. 2017, Journal."];
  assert.equal(R.analyzeDocument(ok).numericOk, true);
});

test("analyzeDocument: 앞 저자와 같다는 표시로 시작하는 항목의 카드 문구에는 앞 저자를 채운다", () => {
  const d = R.analyzeDocument(["본문\n참고문헌\n박성수. (2013). 첫째 논문 제목이 길다. 학술지, 3(1): 1-24.\n______. (2019). 둘째 논문 제목이 길다. 학술지, 13(2): 227-258."]);
  assert.equal(d.refs.length, 2);
  assert.ok(d.display[1].startsWith("박성수. (2019)"), d.display[1]);
});

test("referenceUsable: 연도가 없거나 너무 짧은 항목 문구는 쓰지 않는다", () => {
  assert.equal(R.referenceUsable("K. A. Her, C casestudy of Biomimicry -"), false);
  assert.equal(R.referenceUsable("Kim, A. (2020). Title of the thing."), true);
  assert.equal(R.referenceUsable("Kim 2020"), false);
});

// =====================================================================
// 검수 반영(작업 7 보정 1차): 틀린 연결 배제. 아래 사례는 검수자의 재현 스크립트(adv.js)에서 가져왔다.
// =====================================================================
const numTexts = (s, n = 30) => R.findNumericCitations(s, n).map((c) => s.slice(c.start, c.end));
const xrKeys = (s) => R.findCrossRefs(s).map((x) => x.key);

// ---------- 9. 수식 대괄호 ----------
test("findNumericCitations: 수식·구간·배열 첨자의 대괄호는 인용이 아니다", () => {
  [
    "x in [1, 2] holds", "vector v = [1, 2, 3]", "range [1, 10] of scores", "scored on a scale [1–5]", "the interval [0, 1]",
    "[0.5, 1]", "[95% CI 1.2–3.4]", "y = ax + b [5]", "arr[3] and data[2]", "x[3]", "A[1,2]", "f(x)[2]", "word[3]", "Na[1]", "H2O[4]",
    "값의 범위 [1, 5] 이다", "척도 [1–5] 를", "(−1 ∈ [1, 2])",
  ].forEach((s) => assert.deepEqual(numTexts(s), [], s));
});

test("findNumericCitations: 인용으로 남는 것 — 한글 뒤 붙임, 쪽 표시, 이어진 대괄호, 범위", () => {
  assert.deepEqual(numTexts("연구[12]에 따르면"), ["[12]"]);
  assert.deepEqual(numTexts("as shown in [3] and described in [4]"), ["[3]", "[4]"]);
  assert.deepEqual(numTexts("as reported [3, 5]"), ["[3, 5]"]);
  assert.deepEqual(numTexts("see [12, p. 34]"), ["[12, p. 34]"]);
  assert.deepEqual(R.findNumericCitations("see [12, p. 34]", 30)[0].numbers, [12]);
  const rg = R.findNumericCitations("studies [12]–[15] show", 30);
  assert.equal(rg.length, 1);
  assert.deepEqual(rg[0].numbers, [12, 13, 14, 15]);
  assert.deepEqual(numTexts("건물외피 [3][4]. 이에"), ["[3]", "[4]"]);
  assert.deepEqual(numTexts("“연구”[7]"), ["[7]"]);
});

// ---------- 1. 병합된 참고문헌 항목 ----------
test("splitReferences: 이름을 다 쓴 서양식·머리글자 쉼표 없는 형식도 새 항목 시작으로 본다", () => {
  const cases = [
    ["Kim, A. (2020). Title one. Journal.\nKim, Min-Soo (2020). Title two.\nLee, B. (2019). Other.", 3],
    ["Kim, A. (2020). Title one. Journal.\nKim, Byung Ho. (2020). Title two.\nLee, B. (2019). Other.", 3],
    ["Kim A, Lee B. Title one. J Med. 2020;12:1-5.\nKim C. Title two. J Med. 2020;13:1-5.\nLee B. Other. 2019.", 3],
    ["Kim A. Title one. J Med. 2020 Jan;12:1-5.\nKim B. Title two. J Med. 2020 Feb;13:1-5.\nLee C. Other. J Med. 2019 Mar;1:2-3.", 3],
  ];
  cases.forEach(([t, n]) => assert.equal(R.splitReferences(t).length, n, t.slice(0, 40)));
});

test("matchAuthorYear: 같은 성·연도의 항목이 둘이면(예전엔 한 항목으로 합쳐졌다) 연결하지 않는다", () => {
  ["Kim, A. (2020). Title one. Journal.\nKim, Min-Soo (2020). Title two.\nLee, B. (2019). Other.",
    "Kim, A. (2020). Title one. Journal.\nKim, Byung Ho. (2020). Title two.\nLee, B. (2019). Other.",
    "Kim, A. (2020). Title one. Journal.\nKim B. Title two. J Med. 2020;13:1-5.\nLee, B. (2019). Other.",
  ].forEach((t) => {
    const refs = R.splitReferences(t);
    assert.equal(R.matchAuthorYear(ay("(Kim, 2020)")[0], refs), -1, t.slice(0, 50));
  });
});

test("matchAuthorYear: 병합된 것처럼 보이는 항목(첫 줄 뒤에 같은 성으로 시작하는 줄)은 분할이 놓쳤어도 연결하지 않는다", () => {
  const merged = [{ n: null, text: "Kim, A. (2020). Title one. Journal.\nKim, Min-Soo (2020). Title two.", start: 0, end: 1 }, { n: null, text: "Lee, B. (2019). Other. Journal.", start: 2, end: 3 }];
  assert.equal(R.matchAuthorYear(ay("(Kim, 2020)")[0], merged), -1);
  assert.equal(R.matchAuthorYear(ay("(Lee, 2019)")[0], merged), 1);
  // 저자 목록이 줄바꿈된 것은 병합이 아니다
  const wrapped = [{ n: null, text: "Kim, A., Kim,\nB., & Lee, C. (2020). Title. Journal.", start: 0, end: 1 }];
  assert.equal(R.matchAuthorYear(ay("Kim et al. (2020)")[0], wrapped), 0);
  // 저자 자리의 두 번째 (연도)
  const two = [{ n: null, text: "Kim, A. (2020). Title one is here. Journal.\nPark, C. (2019). Title two is here.", start: 0, end: 1 }];
  assert.equal(R.matchAuthorYear(ay("(Kim, 2020)")[0], two), -1);
});

// ---------- 2. 다저자 인용의 마지막 이름 ----------
test("findAuthorYearCitations: 'Kim, Lee, Park (2020)' 는 Park 한 사람이 아니라 세 저자로 읽는다", () => {
  const c = ay("Kim, Lee, Park (2020) showed")[0];
  assert.deepEqual(c.authors, ["Kim", "Lee", "Park"]);
  const refs = refsOf("Park, C. (2020). Single park paper.");
  assert.equal(R.matchAuthorYear(c, refs), -1);
  assert.equal(R.matchAuthorYear(ay("Park (2020)")[0], refs), 0);
});

test("findAuthorYearCitations: 'However, Park (2020)' 의 문장 머리 부사는 저자가 아니다", () => {
  const s = "However, Park (2020) argued";
  const c = ay(s)[0];
  assert.deepEqual(c.authors, ["Park"]);
  assert.equal(s.slice(c.start, c.end), "Park (2020)");
});

test("matchAuthorYear: 'Kim and Lee (2020)' 는 세 저자 항목에 붙지 않는다", () => {
  const refs = refsOf("Kim, A., Lee, B., & Park, C. (2020). Three authors. Journal.");
  assert.equal(R.matchAuthorYear(ay("Kim and Lee (2020)")[0], refs), -1);
  assert.equal(R.matchAuthorYear(ay("Kim, Lee, and Park (2020)")[0], refs), 0);
  assert.equal(R.matchAuthorYear(ay("Kim et al. (2020)")[0], refs), 0);
});

// ---------- 3. 그림·표 목록 ----------
test("findTargets: 쪽 번호로 끝나는 목차 줄(점선·공백·기호 무엇이든)은 대상이 아니다", () => {
  const lists = ["그림 3. 실험 장치 12", "<표 2> 결과 요약 ‥‥‥‥‥ 15", "표 4. 요약 ⋯⋯⋯⋯ 16", "Figure 7. Setup          9", "Table 8. Summary -------- 10", "표 9. 요약 ········ 16", "Fig. 5. 장치 . . . . 14"];
  // 공백 하나 뒤 숫자("… 12")는 목록 증거가 있는 쪽에서만 쪽 번호다: 줄 하나만 보면 캡션
  lists.filter((l) => !/^그림 3\./.test(l)).forEach((l) => assert.equal(R.captionOfLine(l, null), null, l));
  const m = R.findTargets(["본문\n" + lists.join("\n") + "\n", "그림 3. 실험 장치\n본문\n<표 2> 결과 요약\n"]);
  assert.equal(m.get("fig:3").page, 2);
  assert.equal(m.get("table:2").page, 2);
  assert.ok(!m.has("table:8") && !m.has("fig:7"));
});

test("findTargets: 캡션 모양 줄이 3줄 이상 이어지면 목록이다 / 목록 줄이 5개 넘는 쪽은 통째로 거른다", () => {
  assert.equal(R.findTargets(["그림 목차\nFigure 1. Setup\nFigure 2. Result\nFigure 3. Summary\n"]).size, 0);
  assert.equal(R.findTargets(["그림 1. 가\n본문\n그림 2. 나\n본문\n그림 3. 다\n본문\n그림 4. 라"]).size, 4);
  const listPage = ["그림 목차", "그림 1. 가 3", "그림 2. 나 4", "본문 한 줄", "그림 3. 다 5", "그림 4. 라 6", "그림 5. 마 7", "그림 6. 바\n본문\n그림 9. 진짜 캡션"].join("\n");
  assert.equal(R.findTargets([listPage]).size, 0);
});

test("findTargets: 쪽 번호 판정은 소수점·연도·붙임표 숫자를 쪽 번호로 보지 않는다", () => {
  ["Table 2. Mean value 3.5", "Table 2. Results in 2020", "Fig. 3. Tumor cells are negative for factor-1", "Fig. 4. Ratio 10:30", "Table 5. Costs, 1,200"].forEach((l) =>
    assert.ok(R.captionOfLine(l, null), l));
});

// ---------- 4. 줄바꿈된 본문 ----------
test("findTargets: 문장 중간에서 줄바꿈된 본문 줄('listed in / Table 2. The values')은 대상이 아니다", () => {
  const pages = [
    "The results are listed in\nTable 2. The values were\nhigher than those in [3]\nFig. 4. Then we",
    "Table 2. Real caption\n본문\nFig. 4. Real caption\n",
  ];
  const m = R.findTargets(pages);
  assert.equal(m.get("table:2").page, 2);
  assert.equal(m.get("fig:4").page, 2);
  assert.equal(R.captionOfLine("Table 2. The values", "listed in"), null);
  assert.equal(R.captionOfLine("Fig. 4. Then we", "higher than those in [3]"), null);
  assert.equal(R.captionOfLine("Table 2. The values", "as in [3])"), null);
  assert.ok(R.captionOfLine("Table 2. Results", "The model fits well."));
  assert.ok(R.captionOfLine("Table 2. Results", ""));
  assert.ok(R.captionOfLine("Table 2. Results", "2.1.1. 이론적 배경"));
  assert.ok(R.captionOfLine("<표 2> 마약류 사범 동향", "한국 청소년의 마약류 남용과 대응방안 69"));
});

test("findTargets: 줄 폭·글자 크기 정보가 있으면 본문 줄바꿈과 캡션을 더 정확히 가른다", () => {
  const body = (i) => "이 문장은 본문의 한 줄이며 폭을 꽉 채운다 그리고 더 길게 이어진다 " + i;
  const text = [body(1), body(2), "Table 2. The values are higher", body(3), body(4), body(5)].join("\n");
  const meta = text.split("\n").map((_, i) => ({ x0: 50, w: 400, fs: 10, y: 700 - i * 12 }));
  assert.equal(R.findTargets([text], [meta]).size, 0, "본문과 같은 크기로 폭을 채운 줄이 이어지면 본문");
  // 같은 글이라도 앞 줄이 짧게 끝나고 세로 간격이 벌어진 작은 글씨 줄이면 캡션(앞 줄이 문장 끝 표시 없이 끝나도)
  const text2 = [body(1), body(2), "충분히 짧게 끝나는 마지막 줄", "Table 2. The values are higher", body(3), body(4), body(5)].join("\n");
  const m2 = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x0: 50, w: 400, fs: 10, y: 700 - i * 12 }));
  m2[2] = { x0: 50, w: 120, fs: 10, y: 676 };
  m2[3] = { x0: 50, w: 180, fs: 8, y: 654 };
  assert.ok(R.findTargets([text2], [m2]).has("table:2"));
});

// ---------- 5·6. 교차 참조 ----------
test("findCrossRefs: 다른 논문·부록·다른 계열의 그림·표는 등록하지 않는다", () => {
  [
    "Table 2 of Kim et al. [5]", "Figure 3 in [12]", "Fig. 4 of Ref. 7", "(see Fig. 4 of Ref. 7)", "Table 1 in the Supplementary", "Extended Data Fig. 3",
    "S. Table 2", "Supplementary Fig. 2", "Appendix Table 1", "Table S1", "Fig. S3", "Table A1", "Online Table 2", "eTable 2", "부록 표 1", "Figure 3 in Smith (2020)",
    "Table 2 from Kim and Lee (2019)", "their Fig. 2",
  ].forEach((s) => assert.deepEqual(xrKeys(s), [], s));
  assert.deepEqual(xrKeys("Table 2 shows the results in 2019 and Fig. 3 in this paper"), ["table:2", "fig:3"]);
});

test("findCrossRefs: 복합 번호는 끝까지 읽고, 네 자리 이상은 자르지 않고 거절한다", () => {
  assert.deepEqual(xrKeys("Figure 3.2 shows"), ["fig:3.2"]);
  assert.deepEqual(xrKeys("Table 2.1"), ["table:2.1"]);
  assert.deepEqual(xrKeys("표 2-1 과 그림 3-2"), ["table:2-1", "fig:3-2"]);
  assert.deepEqual(xrKeys("Fig. 3A and Fig. 4b"), ["fig:3", "fig:4"]);
  assert.deepEqual(xrKeys("Fig. 1000"), []);
  assert.deepEqual(xrKeys("Table 1,000 won"), []);
  assert.deepEqual(xrKeys("Fig. 3.2000"), []);
  assert.deepEqual(xrKeys("Table IV and Table X"), ["table:4", "table:10"]);
  assert.deepEqual(xrKeys(" 표 3개와 그림 4"), ["fig:4"]);
});

test("findTargets: 복합 번호 캡션은 번호 전체로 등록한다", () => {
  const m = R.findTargets(["Figure 3.2. Setup\n본문\nTable 2-1. 결과\n본문\nFigure 3. Plain"]);
  assert.ok(m.has("fig:3.2") && m.has("table:2-1") && m.has("fig:3"));
  assert.ok(!m.has("table:2"));
});

// ---------- 7. 식·절 ----------
test("preview.js: 식·절 참조는 정밀도 근거가 없어 꺼 둔다", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../assets/reader/preview.js"), "utf8");
  assert.match(src, /eq: false,/);
  assert.match(src, /sec: false,/);
});

// ---------- 12. 한국어 절 ----------
test("findCrossRefs: '약 2 절반', '비용 3 절감' 은 절 참조가 아니다 (꺼져 있어도 패턴은 맞게)", () => {
  assert.deepEqual(xrKeys("약 2 절반"), []);
  assert.deepEqual(xrKeys("비용 3 절감"), []);
  assert.deepEqual(xrKeys("2.1절에서 보듯"), ["sec:2.1"]);
  assert.deepEqual(xrKeys("총 3절이 있다"), []);
});

// ---------- 11. 구두점 없는 캡션 ----------
test("captionOfLine: 'Table 3 Results of …', '표 5 제목' 처럼 구두점 없는 짧은 캡션을 인식한다", () => {
  assert.deepEqual(R.captionOfLine("Table 3 Results of the regression", null), { kind: "table", num: "3" });
  assert.deepEqual(R.captionOfLine("표 5 제목없음", null), { kind: "table", num: "5" });
  assert.deepEqual(R.captionOfLine("Fig. 6 Illustration of the model", null), { kind: "fig", num: "6" });
  assert.equal(R.captionOfLine("Table 4 shows the values", null), null);
  assert.equal(R.captionOfLine("Table 5 Shows that the values", null), null);
  assert.equal(R.captionOfLine("표 3 에서 보듯이 값이 높다", null), null);
  assert.equal(R.captionOfLine("Table 3 results", null), null);
  assert.equal(R.captionOfLine("표 5 " + "가".repeat(100), null), null);
});

// ---------- 10. 항목 경계와 뒤쪽 자료 ----------
function mkRefs(n) {
  const s = [];
  for (let i = 1; i <= n; i++) s.push("[" + i + "] Author" + i + ", A. Title number " + i + ". Journal, 20" + (10 + (i % 10)) + ".");
  return s.join("\n");
}

test("splitReferences: 이어진 줄이 '[n+1]' 로 시작하면 두 항목 모두 카드를 만들지 않는다", () => {
  const t = mkRefs(25).replace("[7] Author7", "[7] Author7, see\n[8] in the previous list, and");
  const d = R.analyzeDocument(["Body\nReferences\n" + t]);
  const at = (n) => d.refs.findIndex((r) => r.n === n);
  assert.equal(d.display[at(7)], "");
  assert.equal(d.display[at(8)], "");
  assert.ok(R.referenceUsable(d.display[at(9)]));
  assert.ok(R.referenceUsable(d.display[at(6)]));
});

test("splitReferences: 번호를 건너뛴 이어진 줄('[9] heavily;')과 그 안에 삼켜진 '(8)' 항목은 쓰지 않는다", () => {
  const t = mkRefs(25).replace("[7] Author7", "[7] Author7 cites\n[9] heavily;").replace("[8] Author8", "(8) Author8");
  const d = R.analyzeDocument(["Body\nReferences\n" + t]);
  d.refs.forEach((r, i) => { if (r.n === 7 || r.n === 9) assert.equal(d.display[i], "", "n=" + r.n); });
  assert.ok(!d.refs.some((r) => r.n === 8));
});

test("splitReferences: 쪽 범위가 줄바꿈된 '28-\\n35.' 의 숫자는 번호가 아니다", () => {
  const t = "1. Han D. First title here. J Med 2022;1:1-2.\n2. Park K, Ryu H. Lab Med Online 2025;15:28-\n35.\n3. Kim A, Lee B. Other title here. J Med 2024;1:2-3.\n4. Choi C. Third title here. J Med 2023;1:4-5.";
  const r = R.splitReferences(t);
  assert.deepEqual(r.map((x) => !!x.unreliable), [false, false, false, false]);
});

test("splitReferences: 마지막 항목은 감사의 글·부록·저자 소개·접수일 앞에서 끝난다", () => {
  const body = mkRefs(25);
  const tails = ["\nAcknowledgements\nThis work was supported by a grant.", "\nAppendix A. Survey\n1. Item one 2020", "\n부록\n설문지", "\n감사의 글\n도움을 주신 분께", "\nJohn Smith received his PhD in 2001 from MIT. He works on [3] things.",
    "\nReceived: 12 March 2021; Accepted: 3 May 2021", "\n\nAuthor biographies\nA. Smith is a professor.", "\nAuthor contributions\n26. Extra numbered note in the back matter 2021.\n27. Another numbered note 2021."];
  tails.forEach((tail) => {
    const d = R.analyzeDocument(["Body\nReferences\n" + body + tail]);
    assert.equal(d.refs.length, 25, JSON.stringify(tail));
    assert.ok(d.refs[24].text.endsWith("2015."), JSON.stringify(tail));
  });
});

test("splitReferences: 빈 줄로 갈린 문헌 같지 않은 덩어리(제목 줄·숫자 없는 문단)에서 마지막 항목이 끝난다", () => {
  const refs = "[1] Kim, A. Title one is long enough. Journal 2020;1:2-3.\n[2] Lee, B. Title two is long enough. Journal 2019;1:2-3.\n[3] Park, C. Title three is long enough. Journal 2018;1:2-3.";
  [refs + "\n\nAbout the Authors\nSmith works here", refs + "\n\n이 연구는 정부의 지원을 받아 수행되었으며 저자들은 이해 충돌이 없음을 밝힌다 그리고 더 쓴다"].forEach((t) => {
    const r = R.splitReferences(t);
    assert.equal(r.length, 3);
    assert.ok(r[2].text.endsWith("1:2-3."), r[2].text);
  });
});

test("splitReferences: 항목 하나가 700자를 넘으면 믿을 수 없는 항목으로 표시한다", () => {
  const long = "[2] Lee, B. " + "Very long continuing text of something. ".repeat(25) + "2019.";
  const r = R.splitReferences("[1] Kim, A. Title one. Journal 2020.\n" + long + "\n[3] Park, C. Third. Journal 2018.");
  assert.deepEqual(r.map((x) => !!x.unreliable), [false, true, false]);
  const d = R.analyzeDocument(["Body\nReferences\n[1] Kim, A. Title one is long enough. Journal 2020.\n" + long + "\n[3] Park, C. Third title is long enough. Journal 2018."]);
  assert.equal(d.display[1], "");
});

test("splitReferences: 저자-연도 목록 뒤에 붙은 번호 목록(부록 설문 항목)은 참고문헌이 아니다", () => {
  const r = R.splitReferences("Kim, A. (2020). Title one. Journal.\nLee, B. (2019). Other.\nPark, C. (2018). Third.\n1. First survey item\n2. Second survey item\n3. Third survey item\n4. Fourth");
  assert.equal(r.length, 3);
  assert.ok(r.every((x) => x.n === null));
});

// ---------- 15. 두 단 참고문헌 ----------
test("analyzeDocument: 글 순서가 단별로 정리된 두 단 목록(실제 text-map 출력 모양)은 번호식 인용을 유지한다", () => {
  // quorum-sensing-2col 의 모양: 왼쪽 단 1~3, 이어서 오른쪽 단 4~6 (단 안에서 줄바꿈된 항목)
  const colText = [
    "1. Aguilar, C., A. Carlier, K. Riedel, and L. Eberl. 2010. Cell-",
    "to-cell communication in bacteria. Microbiology 148: 1119-1127.",
    "2. Bassler, B. L. 1999. How bacteria talk to each other. Curr.",
    "Opin. Microbiol. 2: 582-587.",
    "3. Boyer, M. and F. Wisniewski-Dye. 2009. Cell-cell signalling in",
    "bacteria. FEMS Microbiol. Ecol. 70: 1-19.",
    "4. Camilli, A. and B. L. Bassler. 2006. Bacterial small-molecule",
    "signaling pathways. Science 311: 1113-1116.",
    "5. Chen, X. 2002. Structural identification of a bacterial quorum",
    "sensing signal. Nature 415: 545-549.",
    "6. Davies, D. G. 1998. The involvement of cell-to-cell signals. Science 280: 295-298.",
  ].join("\n");
  const d = R.analyzeDocument(["본문 [1]-[3]\nReferences\n" + colText]);
  assert.equal(d.refs.length, 6);
  assert.equal(d.numericOk, true);
  assert.ok(d.refs.every((r) => !r.unreliable));
});

test("analyzeDocument: 줄 단위로 섞인 두 단 목록(kci-3017798 모양, 번호가 어긋남)은 번호식 인용을 끈다", () => {
  const inter = [
    "[1] N. Y. Kim, H. S. Lee, Biomimicry Based Facade Design Process Development",
    "[6] Y. C. Kwon, High insulation technology of building envelope, 2010, Vol.4, No.4, pp.17",
    "Buildings, Architectural Institute of Korea, (2017), Vol.33, No.1, pp.11",
    "[2] S. Cho, Comprehensive energy performance measurement technology for building",
    "[7] D. W. Kim, C. S. Park, Performance Assessment of Building Envelopes, 2009, pp.77",
    "Architectural Sustainable Environment and Building Systems, (2011), Vol.5, No.2, pp.19",
    "[3] S. Y. Lee, J. S. Kang, K. S. Kim, Energy Performance Evaluation of a Double Skin, 2010",
    "[8] A. Choi, Residential Buildings, Jounal of the Korean Solar Society, (2010), Vol.30, No.6, pp.1",
    "[4] Y. Yoon, Another study of facades, 2012, Vol.1, pp.1-2",
    "[9] Z. Han, And one more study of facades, 2013, Vol.2, pp.3-4",
  ].join("\n");
  const d = R.analyzeDocument(["본문\nReferences\n" + inter]);
  assert.equal(d.numericOk, false);
  d.refs.forEach((r, i) => { if (r.unreliable) assert.equal(d.display[i], ""); });
  assert.ok(d.refs.filter((r) => r.unreliable).length >= 3);
});

test("splitReferences: 두 단 목록이 [1] [6] [2] [7] … 으로 섞이면 섞인 항목은 믿을 수 없는 항목이다", () => {
  const r = R.splitReferences("[1] A. Kim, T, 2020.\n[6] F. Six, 2015.\n[2] B. Lee, 2019.\n[7] G. Seven, 2014.\n[3] C. Park, 2018.\n[8] H. Eight 2013.\n[4] D 2017\n[5] E 2016");
  assert.ok(r[0].unreliable && r[1].unreliable && r[2].unreliable);
});

// ---------- 줄 정보 입력 ----------
test("lineMetaFromItems: 줄마다 왼쪽 x·폭·글자 크기·세로 위치를 뽑는다", () => {
  const items = [
    { str: "Fig", transform: [10, 0, 0, 10, 50, 700], width: 20 },
    { str: " 1.", transform: [10, 0, 0, 10, 72, 700], width: 18 },
    { str: "body", transform: [12, 0, 0, 12, 50, 680], width: 100 },
  ];
  const pt = { text: "Fig 1.\nbody", charItem: [0, 0, 0, 1, 1, 1, -1, 2, 2, 2, 2] };
  const m = R.lineMetaFromItems(pt, items);
  assert.equal(m.length, 2);
  assert.deepEqual([m[0].x0, m[0].w, m[0].fs, m[0].y], [50, 40, 10, 700]);
  assert.deepEqual([m[1].x0, m[1].w, m[1].fs, m[1].y], [50, 100, 12, 680]);
});

// ---------- 재검수 2 ----------
const crossKeys = (t) => R.findCrossRefs(t).map((c) => c.key);

test("findCrossRefs: 다른 논문의 그림·표를 가리키는 말(앞·뒤)은 등록하지 않는다", () => {
  [
    "Fig. 3 in Ref. [5]", "Kim et al.'s Fig. 2", "(Kim et al., 2020, Fig. 3)", "(see Kim, 2020, Table 2)", "[5, Fig. 3]", "Figure 2 by Kim et al.",
    "Table 2 of the original paper", "Table 2 of the previous study", "Kim (2020)의 표 2", "[5]의 그림 3", "김철수(2020)의 <표 3>", "선행연구의 표 2",
  ].forEach((s) => assert.deepEqual(crossKeys(s), [], s));
});

test("findCrossRefs: 이 논문의 그림·표 지칭은 그대로 등록한다", () => {
  assert.deepEqual(crossKeys("as shown in Fig. 3"), ["fig:3"]);
  assert.deepEqual(crossKeys("(Fig. 3)"), ["fig:3"]);
  assert.deepEqual(crossKeys("(see Table 2)"), ["table:2"]);
  assert.deepEqual(crossKeys("표 2의 결과"), ["table:2"]);
  assert.deepEqual(crossKeys("<표 3>에서"), ["table:3"]);
  assert.deepEqual(crossKeys("그림 3과 같이"), ["fig:3"]);
  assert.deepEqual(crossKeys("Table 2 of this study"), ["table:2"]);
  assert.deepEqual(crossKeys("본 연구의 표 2"), ["table:2"]);
  assert.deepEqual(crossKeys("(In 2020, Fig. 3 shows)"), ["fig:3"]);
});

test("findTargets: 목차 제목이 있거나 점선 쪽 번호 줄이 3줄 이상인 쪽의 후보는 모두 버린다", () => {
  const a = "List of Figures\nFigure 1. A long title of the first figure that wraps onto\nthe next line ........ 12\nFigure 2. Second ........ 14\nFigure 3. Third ........ 15\n";
  assert.equal(R.findTargets([a]).size, 0);
  const b = "List of Tables\nTable 1. Short .... 3\nTable 2. Short .... 4\nTable 3. A long title that wraps onto\nthe next line .... 5\nTable 4. Short .... 6\nTable 5. Another long title wraps\nagain .... 7";
  assert.equal(R.findTargets([b]).size, 0);
  assert.equal(R.findTargets(["표 목차\n표 1. 요약\n표 2. 결과"]).size, 0);
  ["그림 목차", "그림 차례", "표 차례", "목차", "차례", "Contents", "Table of Contents"].forEach((h) => assert.equal(R.findTargets([h + "\n그림 1. 가\n본문\n표 2. 나"]).size, 0, h));
  // 목록 쪽이 먼저 와도 뒤 쪽의 진짜 캡션이 대상이 된다
  const m = R.findTargets([a, "본문\nFigure 1. 실제 캡션 제목\n본문"]);
  assert.equal(m.get("fig:1").page, 2);
  // 점선 줄이 둘뿐이면 목록 쪽이 아니다
  assert.ok(R.findTargets(["Figure 1. Real caption here\n본문\nSetup ..... 3\nMethods ..... 5\n"]).has("fig:1"));
});

test("findTargets: 글자 크기는 바로 앞 줄과 견줘 줄 머리를 판정한다 (본문과만 다르다고 줄 머리가 아니다)", () => {
  const body = [];
  const meta = [];
  for (let i = 0; i < 8; i++) { body.push("This is a normal body line number " + i + " of the paper text."); meta.push({ x0: 50, w: 400, fs: 10, y: 700 - i * 12 }); }
  body.push("and the text says the values are listed in", "Table 2. The values were higher than those reported before", "one more line of small print");
  meta.push({ x0: 50, w: 250, fs: 8, y: 600 }, { x0: 50, w: 280, fs: 8, y: 590 }, { x0: 50, w: 200, fs: 8, y: 580 });
  assert.equal(R.findTargets([body.join("\n")], [meta]).has("table:2"), false);
  // 앞 줄이 본문 크기이고 캡션만 작으면(크기 변화) 캡션
  const b2 = body.slice(0, 8).concat(["Table 2. The values were higher than those reported before", "one more line of small print"]);
  const m2 = meta.slice(0, 8).concat([{ x0: 50, w: 280, fs: 8, y: 590 }, { x0: 50, w: 200, fs: 8, y: 580 }]);
  assert.ok(R.findTargets([b2.join("\n")], [m2]).has("table:2"));
});

test("findTargets: 단 바꿈(세로 위치가 크게 달라짐)은 앞 줄이 문장 중간에서 끊겼으면 줄 머리가 아니다", () => {
  const lines = [];
  const meta = [];
  for (let i = 0; i < 6; i++) { lines.push("Left column body line number " + i + " with some more words."); meta.push({ x0: 50, w: 200, fs: 10, y: 700 - i * 12 }); }
  lines.push("the tables are listed in");
  meta.push({ x0: 50, w: 120, fs: 10, y: 628 });
  lines.push("Table 2. The values were");
  meta.push({ x0: 320, w: 120, fs: 10, y: 700 });
  lines.push("higher in the second group of runs here.");
  meta.push({ x0: 320, w: 200, fs: 10, y: 688 });
  assert.equal(R.findTargets([lines.join("\n")], [meta]).has("table:2"), false);
  // 앞 줄이 문장으로 끝났으면 단 바꿈 뒤의 캡션은 그대로
  lines[6] = "These tables are listed above.";
  assert.ok(R.findTargets([lines.join("\n")], [meta]).has("table:2"));
});

test("looksMerged: 연도가 나온 뒤 쉼표로 끝난 줄 다음 같은 성 항목은 병합으로 본다", () => {
  const refs = R.splitReferences("Kim, A. (2020). Title one. Journal of Things, 1,\nKim, B. (2020). Title two. Journal.\nLee, C. (2019). Other work. Journal.");
  assert.equal(R.matchAuthorYear(R.findAuthorYearCitations("(Kim, 2020)")[0], refs), -1);
});

test("findNumericCitations: 통계 구간·집합·행렬 대괄호는 인용이 아니다", () => {
  ["95% CI [2, 4]", "OR 1.5 [1, 3]", "Likert [1-5]", "takes values in [1, 5]", "normalized to [1, 10]", "the set [1, 2, 3]", "indices [1, 2]", "[1, 2; 3, 4]"]
    .forEach((s) => assert.deepEqual(numTexts(s), [], s));
  assert.deepEqual(numTexts("shown in [1, 5]"), ["[1, 5]"]);
  assert.deepEqual(numTexts("reported in [3]"), ["[3]"]);
});

test("findNumericCitations: 영어 낱말에 붙은 인용은 엄격한 조건에서만 인용이다", () => {
  assert.deepEqual(numTexts("FlowScan[10]"), ["[10]"]);
  assert.deepEqual(numTexts("FlowScan[10]은 좋다"), ["[10]"]);
  assert.deepEqual(numTexts("MRTG[9]와 FlowScan[10]."), ["[9]", "[10]"]);
  assert.deepEqual(numTexts("ISO[3]"), ["[3]"]);
  assert.deepEqual(numTexts("Kim[3] showed"), ["[3]"]);
  assert.deepEqual(numTexts("머신(SVM)[3]"), ["[3]"]);
  assert.deepEqual(numTexts("연구(2020)[3]"), ["[3]"]);
  ["a[10]", "x[i]", "arr[3]", "data[2]", "word[3]", "A[1]", "Na[1]", "DP[3]", "H2O[4]", "f(x)[2]", "obj.Arr[3]", "Arr[3] = 5", "Arr[3][4]", "Arr[3].len", "my_Arr[3]", "if Arr[3] > Arr[i]"]
    .forEach((s) => assert.deepEqual(numTexts(s), [], s));
});

test("findTargets: 번호로 끝나는 실제 캡션은 목록 증거가 없으면 대상이다", () => {
  ["Table 2. Demographic characteristics of group 1", "Fig. 3. Results of experiment 2", "표 3. 실험 2", "Figure 4. Comparison of Model 1 and Model 2"].forEach((c) => {
    const m = R.findTargets(["본문\n\n" + c + "\n본문"]);
    assert.equal(m.size, 1, c);
  });
  // 목록 증거(점선 쪽 번호 줄)가 함께 있으면 숫자 꼬리는 쪽 번호
  assert.equal(R.findTargets(["Table 2. Demographic characteristics of group 1\nSetup ..... 3\nTable 3. Other ........ 5"]).has("table:2"), false);
});

test("findTargets: 줄 위치를 알면 나란한 캡션·그림 간격이 큰 캡션은 목록이 아니다", () => {
  const lines = [];
  const meta = [];
  for (let i = 0; i < 6; i++) { lines.push("Body line number " + i + " with enough words to count as long."); meta.push({ x0: 50, w: 300, fs: 10, y: 700 - i * 12 }); }
  lines.push("Figure 1. First", "Figure 2. Second", "Figure 3. Third");
  meta.push({ x0: 50, w: 80, fs: 9, y: 500 }, { x0: 50, w: 80, fs: 9, y: 300 }, { x0: 50, w: 80, fs: 9, y: 100 });
  assert.equal(R.findTargets([lines.join("\n")], [meta]).size, 3);
  // 같은 높이에 나란한 캡션
  const l2 = lines.slice(0, 6).concat(["Figure 1. First", "Figure 2. Second", "Figure 3. Third"]);
  const m2 = meta.slice(0, 6).concat([{ x0: 50, w: 80, fs: 9, y: 500 }, { x0: 200, w: 80, fs: 9, y: 500 }, { x0: 350, w: 80, fs: 9, y: 500 }]);
  assert.equal(R.findTargets([l2.join("\n")], [m2]).size, 3);
  // 줄 간격으로 쌓인 같은 x 의 캡션은 목록
  const m3 = meta.slice(0, 6).concat([{ x0: 50, w: 80, fs: 9, y: 500 }, { x0: 50, w: 80, fs: 9, y: 488 }, { x0: 50, w: 80, fs: 9, y: 476 }]);
  assert.equal(R.findTargets([l2.join("\n")], [m3]).size, 0);
  // 줄 위치가 없으면 지금처럼 3줄 연속은 목록
  assert.equal(R.findTargets([l2.join("\n")]).size, 0);
});
