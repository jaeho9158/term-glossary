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
  assert.equal(R.matchAuthorYear(ay("(Kim et al., 2020)")[0], refs), 0);
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
    "본문 문장이다.\nFigure 3. Overview of the system.\n계속\nFig. 4: Another one.\nTable 2. Results table.\n그림 5. 한글 그림.\n표 1. 한글 표.\n<표 6> 꺾쇠 표.\n[그림 7] 대괄호 그림.",
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
