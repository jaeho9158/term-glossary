const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../assets/reader/biblio.js");

const REF = "A. Kim and B. Lee, Deep learning for cats, J. Cat Sci., 2020.";

test("isMatch: 제목 낱말 80%와 연도", () => {
  const A = [{ family: "Kim" }];
  assert.equal(B.isMatch(REF, { title: "Deep Learning for Cats", year: "2020", author: A }), true);
  assert.equal(B.isMatch(REF, { title: "Deep Learning for Cats", year: "2019", author: A }), false);
  assert.equal(B.isMatch(REF, { title: "Deep Learning for Dogs", year: "2020", author: A }), false);
  assert.equal(B.isMatch(REF, { title: "Cats", year: "2020", author: A }), false);
});

test("isMatch: 제목 낱말이 3개 미만이면 false", () => {
  assert.equal(B.isMatch("Kim, Deep learning, 2020", { title: "Deep Learning", year: "2020" }), false);
});

test("isMatch: 첫 저자의 성이 서지 문구에 없으면 false", () => {
  const t = "Deep Learning for Cats";
  assert.equal(B.isMatch(REF, { title: t, year: "2020", author: [{ family: "Kim" }] }), true);
  assert.equal(B.isMatch(REF, { title: t, year: "2020", author: [{ family: "Park" }] }), false);
  assert.equal(B.isMatch(REF, { title: t, year: "2020", author: [{ name: "Some Consortium" }] }), false);
});

test("isMatch: 발음 기호를 접어 비교(Müller / Muller)", () => {
  const ref = "Muller, K. Learning of cats and dogs in the wild. Nature 2019";
  assert.equal(B.isMatch(ref, { title: "Learning of Cats and Dogs in the Wild", year: "2019", author: [{ family: "Müller" }] }), true);
  const ref2 = "Müller, K. Learning of cats and dogs in the wild. Nature 2019";
  assert.equal(B.isMatch(ref2, { title: "Learning of Cats and Dogs in the Wild", year: "2019", author: [{ family: "Muller" }] }), true);
});

test("pickMatch: 첫 일치를 고르고, 전부 불일치면 null", () => {
  const items = [
    { title: ["Something Else Entirely Here"], issued: { "date-parts": [[2020]] } },
    { title: ["Deep Learning for Cats"], issued: { "date-parts": [[2020]] }, author: [{ family: "Kim" }] },
    { title: ["Deep Learning for Cats"], issued: { "date-parts": [[2020]] } },
  ];
  assert.equal(B.pickMatch(REF, items), items[1]);
  assert.equal(B.pickMatch(REF, [items[0]]), null);
  assert.equal(B.pickMatch(REF, []), null);
  assert.equal(B.pickMatch(REF, undefined), null);
});

test("yearsIn / normalizeTitle", () => {
  assert.deepEqual(B.yearsIn("vol. 2020, pp. 1999–2005, 2021"), ["2020", "1999", "2005", "2021"]);
  assert.deepEqual(B.yearsIn("id 120201 and 1850"), []);
  assert.deepEqual(B.normalizeTitle("A Deep-Learning: for Cats!"), ["deep", "learning", "for", "cats"]);
});

test("trimRef: 앞 번호 제거, 공백 정리, 300자 낱말 경계", () => {
  assert.equal(B.trimRef("[12]  Kim,   A. Title 2020"), "Kim, A. Title 2020");
  assert.equal(B.trimRef("12. Kim A. Title 2020"), "Kim A. Title 2020");
  assert.equal(B.trimRef("2020 was a year"), "2020 was a year");
  const long = ("word ".repeat(100)).trim();
  const out = B.trimRef(long);
  assert.ok(out.length <= 300);
  assert.ok(/word$/.test(out));
});

test("validDoi / doiUrl", () => {
  assert.equal(B.validDoi("10.1038/nature14539"), true);
  assert.equal(B.validDoi("10.12/abc"), false);
  assert.equal(B.validDoi("javascript:alert(1)"), false);
  assert.equal(B.validDoi("10.1000/has space"), false);
  assert.equal(B.doiUrl("10.1002/(SICI)1097<x>"), "https://doi.org/10.1002/(SICI)1097%3Cx%3E");
  assert.equal(B.doiUrl("bad"), "");
});

test("stripTags: JATS 태그 제거", () => {
  assert.equal(B.stripTags("<jats:p>Text <jats:italic>x</jats:italic></jats:p>"), "Text x");
  assert.equal(B.stripTags("<jats:title>Abstract</jats:title><jats:p>A &amp; B &lt;3</jats:p>"), "A & B <3");
  assert.equal(B.stripTags("<script>alert(1)</script>hi"), "alert(1)hi");
});

test("cutAbstract: 600자 + 말줄임", () => {
  const out = B.cutAbstract("<jats:p>" + "a".repeat(700) + "</jats:p>");
  assert.equal(Array.from(out).length, 601);
  assert.ok(out.endsWith("…"));
  assert.equal(B.cutAbstract("short"), "short");
});

test("yearOf: issued.date-parts", () => {
  assert.equal(B.yearOf({ issued: { "date-parts": [[2020, 5, 1]] } }), "2020");
  assert.equal(B.yearOf({ issued: { "date-parts": [[2020]] } }), "2020");
  assert.equal(B.yearOf({ issued: { "date-parts": [[null]] } }), "");
  assert.equal(B.yearOf({ issued: { "date-parts": [[]] } }), "");
  assert.equal(B.yearOf({ issued: { "date-parts": [] } }), "");
  assert.equal(B.yearOf({ issued: {} }), "");
  assert.equal(B.yearOf({}), "");
  assert.equal(B.yearOf(null), "");
});

// ---------- 검수 반영 ----------

const T4 = "Deep Learning for Cats";

test("저자 성: 낱말 단위 일치(Li/Reliability, 김/김포교육)", () => {
  const smith = "Smith, J. Deep learning for cats. Reliability Engineering, 2020.";
  assert.equal(B.isMatch(smith, { title: T4, year: "2020", author: [{ family: "Li" }] }), false);
  const li = "Li, X. Deep learning for cats. Reliability Engineering, 2020.";
  assert.equal(B.isMatch(li, { title: T4, year: "2020", author: [{ family: "Li" }] }), true);
});

test("저자 성: 여러 낱말 성과 발음 기호", () => {
  const vdw = "van der Waals, J. Deep learning for cats. Physica, 2020.";
  assert.equal(B.isMatch(vdw, { title: T4, year: "2020", author: [{ family: "van der Waals" }] }), true);
  assert.equal(B.isMatch("Waals, J. Deep learning for cats. Physica, 2020.", { title: T4, year: "2020", author: [{ family: "van der Waals" }] }), false);
  const ds = "De Souza, A. Deep learning for cats. Brasil, 2020.";
  assert.equal(B.isMatch(ds, { title: T4, year: "2020", author: [{ family: "De Souza" }] }), true);
  assert.equal(B.isMatch("Muller K. Deep learning for cats. Nature, 2020.", { title: T4, year: "2020", author: [{ family: "Müller" }] }), true);
});

test("형제 논문 거짓 양성: Part 2 / Correction / 앞부분 / 한 낱말 차이", () => {
  const A = [{ family: "Kim" }];
  const ref = "Kim, A. Deep learning for cats, Part 1. J. Cat Sci., 2020.";
  assert.equal(B.isMatch(ref, { title: "Deep learning for cats, Part 1", year: "2020", author: A }), true);
  assert.equal(B.isMatch(ref, { title: "Deep learning for cats, Part 2", year: "2020", author: A }), false);
  assert.equal(B.isMatch("Kim, A. Deep learning for cats, Part II. J. Cat Sci., 2020.", { title: "Deep learning for cats, Part I", year: "2020", author: A }), false);
  const longT = "Deep learning for cats and dogs in the wild";
  const ref2 = "Kim, A. " + longT + ". Nature, 2020.";
  assert.equal(B.isMatch(ref2, { title: "Correction to: " + longT, year: "2020", author: A }), false);
  assert.equal(B.isMatch("Kim, A. Correction to: " + longT + ". Nature, 2020.", { title: "Correction to: " + longT, year: "2020", author: A }), true);
  assert.equal(B.isMatch(ref2, { title: "Erratum: " + longT, year: "2020", author: A }), false);
  assert.equal(B.isMatch(ref2, { title: "Reply to " + longT, year: "2020", author: A }), false);
  // 후보 제목이 인용된 제목의 앞부분
  const ref3 = "Kim, A. Deep learning for cats: a survey of whiskers. Nature, 2020.";
  assert.equal(B.isMatch(ref3, { title: T4, year: "2020", author: A }), false);
  assert.equal(B.isMatch("Kim, A. Deep learning for cats and dogs in the wild. Nature, 2020.", { title: T4, year: "2020", author: A }), false);
  // 여섯 낱말 제목에서 한 낱말만 다름
  const ref4 = "Kim, A. Deep learning for cats in homes. Nature, 2020.";
  assert.equal(B.isMatch(ref4, { title: "Deep learning for cats in barns", year: "2020", author: A }), false);
  assert.equal(B.isMatch(ref4, { title: "Deep learning for cats in homes", year: "2020", author: A }), true);
});

test("낱말이 흩어져 있기만 하면 불일치(순서)", () => {
  const ref = "Kim, A. Cats for learning deep. J. Cat Sci., 2020.";
  assert.equal(B.isMatch(ref, { title: T4, year: "2020", author: [{ family: "Kim" }] }), false);
  // 8낱말 이상: 순서가 뒤섞이면 80% 미만
  const t = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
  const rev = "Kim, A. kappa iota theta eta zeta epsilon delta gamma beta alpha. J, 2020.";
  assert.equal(B.isMatch(rev, { title: t, year: "2020", author: [{ family: "Kim" }] }), false);
});

test("pickMatch: 서로 다른 제목이 둘 이상 통과하면 null", () => {
  const ref = "Kim, A. Deep learning for cats. J. Cat Sci., 2020. Deep learning for cats in homes.";
  const a = { title: ["Deep learning for cats"], issued: { "date-parts": [[2020]] }, author: [{ family: "Kim" }] };
  const b = { title: ["Deep learning for cats in homes"], issued: { "date-parts": [[2020]] }, author: [{ family: "Kim" }] };
  assert.equal(B.pickMatch(ref, [a]), a);
  assert.equal(B.pickMatch(ref, [b]), b);
  assert.equal(B.pickMatch(ref, [a, b]), null);
  assert.equal(B.pickMatch(ref, [a, Object.assign({}, a)]), a); // 같은 제목이면 첫 항목
});

test("첫 저자 정보 없음: 단체명·null·빈 배열", () => {
  const t8 = "Deep learning for cats and dogs in the wild";
  const ref = "Some Consortium. " + t8 + ". Nature, 2020.";
  assert.equal(B.isMatch(ref, { title: t8, year: "2020", author: [{ name: "The Some Consortium" }] }), true);
  assert.equal(B.isMatch(ref, { title: t8, year: "2020", author: [{ name: "Other Group" }] }), false);
  // 저자 정보가 전혀 없으면 긴 제목(8낱말 이상)이 전부 맞을 때만
  assert.equal(B.isMatch(ref, { title: t8, year: "2020", author: [null] }), true);
  assert.equal(B.isMatch(ref, { title: t8, year: "2020", author: [] }), true);
  assert.equal(B.isMatch(ref, { title: t8, year: "2020" }), true);
  assert.equal(B.isMatch(REF, { title: T4, year: "2020", author: [null] }), false);
  assert.equal(B.isMatch(REF, { title: T4, year: "2020" }), false);
  const off = "Some. Deep learning for cats and dogs in the wild. Nature, 2020.";
  assert.equal(B.isMatch(off, { title: "Deep learning for cats and dogs in the mild", year: "2020" }), false);
});

test("trimRef: 코드 포인트 단위로 자름, 서로게이트 안 깨짐", () => {
  const s = "a".repeat(299) + "\u{1F600}" + " tail";
  assert.doesNotThrow(() => encodeURIComponent(B.trimRef(s)));
  const s2 = "word ".repeat(59) + "xxxx" + "\u{1F600}\u{1F600}" + "y".repeat(10);
  assert.doesNotThrow(() => encodeURIComponent(B.trimRef(s2)));
});

test("doiUrl: 짝 없는 서로게이트는 빈 문자열", () => {
  assert.equal(B.doiUrl("10.1000/abc\ud800"), "");
});

test("lookup: 짝 없는 서로게이트 입력은 error, fetch 안 함", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("no"); };
  try {
    B.reset();
    const r = await B.lookup("Kim, A. bad \ud800 text 2020");
    assert.equal(r.status, "error");
    assert.equal(calls, 0);
  } finally { globalThis.fetch = real; B.reset(); }
});

test("제목 마크업 제거와 일치 판정", () => {
  const raw = "Effects of CO<sub>2</sub> on <i>Escherichia coli</i> growth";
  const ref = "Kim, A. Effects of CO2 on Escherichia coli growth. Microbiology, 2020.";
  assert.equal(B.stripTags(raw), "Effects of CO2 on Escherichia coli growth");
  const items = [{ title: [raw], issued: { "date-parts": [[2020]] }, author: [{ family: "Kim" }], "container-title": ["<i>Microbiology</i>"], DOI: "10.1000/x" }];
  assert.equal(B.pickMatch(ref, items), items[0]);
  const d = B.toData(items[0]);
  assert.equal(d.title, "Effects of CO2 on Escherichia coli growth");
  assert.equal(d.journal, "Microbiology");
});

test("stripTags: 태그처럼 보이는 것만 제거", () => {
  assert.equal(B.stripTags("a < b and c > d"), "a < b and c > d");
  assert.equal(B.stripTags("if a<b and c>d then"), "if a<b and c>d then");
  assert.equal(B.stripTags("x <jats:p"), "x <jats:p");
  assert.equal(B.stripTags("<b><i>nested</i></b> text"), "nested text");
  assert.equal(B.stripTags('<a href="x" class=y>link</a>!'), "link!");
  assert.equal(B.stripTags("<<b>x</b>"), "<x");
  assert.equal(B.stripTags("Abstract algebra"), "algebra"); // 머리말 제거는 초록 전용(stripTags)
});

test("toData: 유형 라벨", () => {
  const base = { title: ["T"], issued: { "date-parts": [[2020]] } };
  const lab = (type) => B.toData(Object.assign({ type }, base)).typeLabel;
  assert.equal(lab("book-chapter"), "책의 장");
  assert.equal(lab("book"), "책");
  assert.equal(lab("monograph"), "책");
  assert.equal(lab("dissertation"), "학위논문");
  assert.equal(lab("proceedings-article"), "학술대회 논문");
  assert.equal(lab("posted-content"), "프리프린트");
  assert.equal(lab("journal-article"), "");
  assert.equal(lab("constructor"), "기타 자료");
  assert.equal(lab(undefined), "");
});

test("apiBaseFor: 시험용 호스트 훅은 localhost에서만", () => {
  const hook = "?biblio_host=127.0.0.1:8099";
  assert.equal(B.apiBaseFor({ hostname: "localhost", search: hook }), "https://127.0.0.1:8099/works");
  assert.equal(B.apiBaseFor({ hostname: "127.0.0.1", search: hook }), "https://127.0.0.1:8099/works");
  assert.equal(B.apiBaseFor({ hostname: "termglossary.kr", search: hook }), "https://api.crossref.org/works");
  assert.equal(B.apiBaseFor({ hostname: "localhost", search: "?biblio_host=evil.com/x" }), "https://api.crossref.org/works");
  assert.equal(B.apiBaseFor({ hostname: "localhost", search: "" }), "https://api.crossref.org/works");
  assert.equal(B.apiBaseFor(null), "https://api.crossref.org/works");
});

// ---------- lookup (fetch 스텁) ----------

function stubFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (url, opts) => { calls.push({ url, opts }); return handler(url, opts); };
  B.setRetryDelay(() => Promise.resolve()); // 재시도 대기 없음
  return { calls, restore: () => { globalThis.fetch = real; B.setRetryDelay(null); B.reset(); } };
}
const okRes = (json) => ({ ok: true, status: 200, json: async () => json });
const GOOD = { message: { items: [{ title: ["Deep learning for cats"], issued: { "date-parts": [[2020]] }, author: [{ family: "Kim", given: "A." }], "container-title": ["J. Cat Sci."], DOI: "10.1000/cat", type: "journal-article" }] } };
const LREF = "Kim, A. Deep learning for cats. J. Cat Sci., 2020.";

test("lookup: 일치 → ok, 요청 URL·옵션 점검", async () => {
  B.reset();
  const s = stubFetch(async () => okRes(GOOD));
  try {
    const r = await B.lookup(LREF);
    assert.equal(r.status, "ok");
    assert.equal(r.data.title, "Deep learning for cats");
    assert.equal(r.data.doi, "10.1000/cat");
    assert.equal(s.calls.length, 1);
    const u = new URL(s.calls[0].url);
    assert.equal(u.origin + u.pathname, "https://api.crossref.org/works");
    assert.deepEqual([...u.searchParams.keys()].sort(), ["query.bibliographic", "rows", "select"]);
    assert.equal(u.searchParams.get("query.bibliographic"), LREF);
    assert.equal(u.searchParams.get("select"), "title,subtitle,author,issued,published-print,published-online,published,created,container-title,DOI,abstract,type");
    const o = s.calls[0].opts;
    assert.equal(o.headers, undefined);
    assert.deepEqual(Object.keys(o).sort(), ["credentials", "referrerPolicy", "signal"]);
  } finally { s.restore(); }
});

test("lookup: 불일치 → nomatch이고 캐시됨", async () => {
  B.reset();
  const s = stubFetch(async () => okRes({ message: { items: [{ title: ["Unrelated Thing Entirely"], issued: { "date-parts": [[2020]] } }] } }));
  try {
    assert.equal((await B.lookup(LREF)).status, "nomatch");
    assert.equal((await B.lookup(LREF)).status, "nomatch");
    assert.equal(s.calls.length, 1);
  } finally { s.restore(); }
});

test("lookup: 429 → 한 번 재시도 후 error(reason 포함), 캐시 안 됨", async () => {
  B.reset();
  const s = stubFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }));
  try {
    const r1 = await B.lookup(LREF);
    assert.equal(r1.status, "error");
    assert.equal(r1.reason, "http 429");
    assert.equal((await B.lookup(LREF)).status, "error");
    assert.equal(s.calls.length, 4); // 조회마다 시도 둘(변경: 재시도 도입 전에는 2)
  } finally { s.restore(); }
});

test("lookup: 깨진 JSON·모양 이상 → error", async () => {
  B.reset();
  let mode = 0;
  const s = stubFetch(async () => mode++ === 0
    ? { ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } }
    : okRes({ message: {} }));
  try {
    assert.equal((await B.lookup(LREF)).status, "error");
    assert.equal((await B.lookup(LREF)).status, "error");
  } finally { s.restore(); }
});

test("lookup: reset이 진행 중 요청을 중단 → error, 캐시 없음", async () => {
  B.reset();
  const s = stubFetch((url, opts) => new Promise((_, rej) => {
    opts.signal.addEventListener("abort", () => rej(new Error("aborted")));
  }));
  try {
    const p = B.lookup(LREF);
    B.reset();
    assert.equal((await p).status, "error");
  } finally { s.restore(); }
  const s2 = stubFetch(async () => okRes(GOOD));
  try {
    assert.equal((await B.lookup(LREF)).status, "ok");
    assert.equal(s2.calls.length, 1);
  } finally { s2.restore(); }
});

// ---------- 재검수 2차 ----------

const KIM = [{ family: "Kim" }];
const LONG = "Deep learning for cats and dogs in the wild";
const ok = (ref, title, extra) => B.isMatch(ref, Object.assign({ title, year: "2020", author: KIM }, extra));

test("한글 문헌: 조회하지 않음, 한글 후보 제목 배제", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return okRes(GOOD); };
  try {
    B.reset();
    const ko = "김철수·이영희 (2018). 청소년의 스마트폰 과의존이 학업성취에 미치는 영향. 교육학연구, 56(2), 1-25.";
    assert.equal((await B.lookup(ko)).status, "nomatch");
    assert.equal(calls, 0);
    // 영문이 대부분이고 한글 낱말이 조금 섞인 서지는 보통 경로
    const mixed = "Kim, A. Deep learning for cats. J. Cat Sci. (고양이 연구), 2020.";
    assert.equal(B.mostlyHangul(mixed), false);
    assert.equal((await B.lookup(mixed)).status, "ok");
    assert.equal(calls, 1);
  } finally { globalThis.fetch = real; B.reset(); }
  assert.equal(B.isMatch("Kim 청소년의 스마트폰 과의존이 학업성취에 미치는 영향 2018", { title: "청소년의 스마트폰 과의존이 학업성취에 미치는 영향", year: "2018", author: [{ family: "김" }] }), false);
  assert.equal(B.isMatch(REF, { title: "고양이를 위한 깊은 학습 연구 방법", year: "2020", author: KIM }), false);
});

test("정정·답글류: 앞 세 낱말 안의 표지어", () => {
  const ref = "Kim, A. " + LONG + ". Nature, 2020.";
  for (const p of ["Author Correction: ", "Publisher Correction: ", "Addendum: ", "Book review: ", "Decision letter: ",
    "Discussion of ", "Peer review of ", "Review for ", "Author response: ", "Expression of concern: ", "Comment on ", "Retracted: ", "Withdrawal notice: "]) {
    assert.equal(ok(ref, p + LONG), false, p);
  }
  // 서지 문구에도 그 낱말이 있으면 통과
  assert.equal(ok("Kim, A. Addendum: " + LONG + ". Nature, 2020.", "Addendum: " + LONG), true);
  // 제목 뒤쪽의 response는 정상 논문
  const t = "Plant growth and the stress response of cats in wild habitats";
  assert.equal(ok("Kim, A. " + t + ". Nature, 2020.", t), true);
});

test("Crossref 유형: peer-review 배제, 호·학술지·총서·구성요소는 불일치", () => {
  const ref = "Kim, A. " + LONG + ". Nature, 2020.";
  for (const type of ["peer-review", "journal-issue", "journal", "book-series", "component"]) {
    assert.equal(ok(ref, LONG, { type }), false, type);
  }
  assert.equal(ok(ref, LONG, { type: "journal-article" }), true);
});

test("번호·로마 숫자: 제목 구간 안에서 정렬", () => {
  const ref = "Kim, A. Deep learning for cats, Part 1. J Mech 2, 33, 2020.";
  assert.equal(ok(ref, "Deep learning for cats, Part 1"), true);
  assert.equal(ok(ref, "Deep learning for cats, Part 2"), false);
  assert.equal(ok("Kim, A. Deep learning for cats, Part II. J Cat 2020", "Deep learning for cats, Part II"), true);
  assert.equal(ok("Kim, A. Deep learning for cats, Part II. J Cat 2020", "Deep learning for cats, Part I"), false);
  assert.equal(ok("Kim, A. Cats and their habits, Study 2. J Cat 2020", "Cats and their habits, Study 3"), false);
  assert.equal(ok("Kim, A. COVID-19 vaccine effectiveness in adults. Lancet 2020", "COVID-19 vaccine effectiveness in adults"), true);
  assert.equal(ok("Kim, A. 2D imaging methods for cats. Lancet 2020", "2D imaging methods for cats"), true);
  assert.equal(ok("Kim, A. The 2008 financial crisis and bank lending. Fin 2008, 2020", "The 2008 financial crisis and bank lending"), true);
});

test("기관 저자: 의미 낱말 전부 또는 약어", () => {
  const t = LONG;
  const org = (name) => B.isMatch("World Health Organization. " + t + ". Geneva, 2020.", { title: t, year: "2020", author: [{ name }] });
  assert.equal(org("World Health Organization"), true);
  assert.equal(org("World Bank"), false);
  assert.equal(org("National Health Organization"), false);
  assert.equal(B.isMatch("WHO. " + t + ". Geneva, 2020.", { title: t, year: "2020", author: [{ name: "World Health Organization" }] }), true);
  assert.equal(B.isMatch("Who said so? " + t + ". Geneva, 2020.", { title: t, year: "2020", author: [{ name: "World Health Organization" }] }), false);
  assert.equal(B.isMatch("Centers for Disease Control & Prevention. " + t + ". 2020.", { title: t, year: "2020", author: [{ name: "Centers for Disease Control and Prevention" }] }), true);
  // 두 글자 약어: 대문자이고 의미 낱말이 정확히 둘일 때만(재검수 3차에서 허용으로 변경)
  assert.equal(B.isMatch("UN. " + t + ". 2020.", { title: t, year: "2020", author: [{ name: "United Nations" }] }), true);
});

test("라틴 저자: 합자·전사·아포스트로피·하이픈", () => {
  const r = (name) => name + ", A. " + LONG + ". Nature, 2020.";
  assert.equal(ok(r("Mueller"), LONG, { author: [{ family: "Müller" }] }), true);
  assert.equal(ok(r("Müller"), LONG, { author: [{ family: "Mueller" }] }), true);
  assert.equal(ok(r("Muller"), LONG, { author: [{ family: "Müller" }] }), true);
  assert.equal(ok(r("OBrien"), LONG, { author: [{ family: "O'Brien" }] }), true);
  assert.equal(ok(r("O'Brien"), LONG, { author: [{ family: "OBrien" }] }), true);
  assert.equal(ok(r("O Brien"), LONG, { author: [{ family: "O’Brien" }] }), true);
  assert.equal(ok(r("Smith Jones"), LONG, { author: [{ family: "Smith-Jones" }] }), true);
  assert.equal(ok(r("Smith-Jones"), LONG, { author: [{ family: "Smith Jones" }] }), true);
  assert.equal(ok(r("Smith"), LONG, { author: [{ family: "Smith-Jones" }] }), false);
  assert.equal(ok("L. I. Smith. " + LONG + ". Nature, 2020.", LONG, { author: [{ family: "Li" }] }), false);
  // 합자 ﬁ
  assert.equal(ok("Kim, A. Scientiﬁc deep learning for cats in homes. Nature, 2020.", "Scientific deep learning for cats in homes"), true);
  assert.equal(ok("Kim, A. Scientific deep learning for cats in homes. Nature, 2020.", "Scientiﬁc deep learning for cats in homes"), true);
});

test("제목: 하이픈 결합/분리, 부제 필드, 부제 생략", () => {
  assert.equal(ok("Kim, A. 2-D imaging methods for cats. Lancet 2020", "2D imaging methods for cats"), true);
  assert.equal(ok("Kim, A. 2D imaging methods for cats. Lancet 2020", "2-D imaging methods for cats"), true);
  assert.equal(ok("Kim, A. COVID 19 vaccine effectiveness in adults. Lancet 2020", "COVID-19 vaccine effectiveness in adults"), true);
  assert.equal(ok("Kim, A. COVID19 vaccine effectiveness in adults. Lancet 2020", "COVID-19 vaccine effectiveness in adults"), true);
  // 부제가 별도 필드
  const full = "Kim, A. Deep learning for cats: a survey of whiskers. Nature, 2020.";
  assert.equal(ok(full, "Deep learning for cats", { subtitle: "a survey of whiskers" }), true);
  assert.equal(ok(full, "Deep learning for cats", { subtitle: "something else entirely" }), false);
  assert.equal(ok(full, "Deep learning for cats"), false); // 부제 정보 없이 앞부분만: 배제 유지
  // 인용에 부제가 없고 후보에 있음: 앞부분이 낱말 5개 이상일 때만
  const short = "Kim, A. Deep learning for cats in homes. Nature, 2020.";
  assert.equal(ok(short, "Deep learning for cats in homes: a survey of whiskers"), true);
  assert.equal(ok(short, "Deep learning for cats in homes – a survey of whiskers"), true);
  assert.equal(ok("Kim, A. Deep learning for cats. Nature, 2020.", "Deep learning for cats: a survey of whiskers"), false);
  // 형제 부제는 여전히 배제
  assert.equal(ok("Kim, A. Deep learning for cats in homes: part one. Nature, 2020.", "Deep learning for cats in homes: part two"), false);
  // 철자 변형: 편집 거리 1은 허용(재검수 3차에서 변경), 거리 2는 불허
  assert.equal(ok("Kim, A. Organization of deep learning for cats. Nature, 2020.", "Organisation of deep learning for cats"), true);
});

test("toData: 유형 라벨 전체 매핑과 기타", () => {
  const lab = (type) => B.toData({ title: ["T"], type, issued: { "date-parts": [[2020]] } }).typeLabel;
  for (const t of ["book-chapter", "book-section", "book-part", "reference-entry"]) assert.equal(lab(t), "책의 장");
  for (const t of ["book", "monograph", "edited-book", "reference-book"]) assert.equal(lab(t), "책");
  assert.equal(lab("report"), "보고서");
  assert.equal(lab("report-component"), "보고서");
  assert.equal(lab("dataset"), "데이터세트");
  assert.equal(lab("standard"), "표준");
  assert.equal(lab("journal-article"), "");
  assert.equal(lab("peer-review"), "기타 자료");
  assert.equal(lab(""), "");
  assert.equal(lab(undefined), "");
});

test("viewModel: 모든 항목, DOI 무효 시 링크 없음, 초록 600자, 저자 3명 + 외", () => {
  const item = {
    title: ["T <i>x</i>"], issued: { "date-parts": [[2020]] }, "container-title": ["J. Cat"], type: "book-chapter",
    author: [{ given: "A", family: "One" }, { given: "B", family: "Two" }, { given: "C", family: "Three" }, { family: "Four" }],
    abstract: "<jats:p>" + "a".repeat(700) + "</jats:p>", DOI: "10.1000/cat"
  };
  const vm = B.viewModel(B.toData(item));
  assert.equal(vm.title, "T x");
  assert.deepEqual(vm.lines.map((l) => l.label), ["저자", "연도", "학술지"]);
  assert.equal(vm.lines[0].value, "A One, B Two, C Three 외");
  assert.equal(vm.lines[2].typeLabel, "책의 장");
  assert.equal(Array.from(vm.abstract).length, 601);
  assert.ok(vm.abstract.endsWith("…"));
  assert.equal(vm.href, "https://doi.org/10.1000/cat");
  assert.equal(B.viewModel(B.toData(Object.assign({}, item, { DOI: "bad doi" }))).href, "");
  const bare = B.viewModel(B.toData({ title: ["T"], type: "dataset" }));
  assert.deepEqual(bare.lines, [{ label: "유형", value: "데이터세트" }]);
});

test("render: 가짜 DOM에서 textContent만 사용, 링크 속성", async () => {
  const mk = (tag) => {
    const n = { tag, children: [], className: "", attrs: {}, listeners: {}, _t: "" };
    n.classList = { add: (c) => { n.className += " " + c; } };
    n.setAttribute = (k, v) => { n.attrs[k] = v; };
    n.appendChild = (c) => { n.children.push(c); return c; };
    n.addEventListener = (k, f) => { n.listeners[k] = f; };
    Object.defineProperty(n, "textContent", { get: () => n._t, set: (v) => { n._t = String(v); n.children = []; } });
    Object.defineProperty(n, "innerHTML", { set: () => { throw new Error("innerHTML forbidden"); } });
    return n;
  };
  const realDoc = globalThis.document;
  globalThis.document = { createElement: mk };
  const s = stubFetch(async () => okRes({ message: { items: [{
    title: ["<i>Deep</i> learning for cats"], issued: { "date-parts": [[2020]] }, author: [{ family: "Kim", given: "A." }],
    "container-title": ["J. Cat Sci."], DOI: "10.1000/cat", type: "journal-article", abstract: "ab"
  }] } }));
  try {
    B.reset();
    const c = mk("div");
    B.render(c, LREF);
    assert.equal(c.children[0]._t, "불러오는 중…");
    await new Promise((r) => setTimeout(r, 20));
    const flat = [];
    const walk = (n) => { flat.push(n); n.children.forEach(walk); };
    walk(c);
    const link = flat.find((n) => n.className === "biblio-link");
    assert.equal(link.href, "https://doi.org/10.1000/cat");
    assert.equal(link.rel, "noopener noreferrer");
    assert.ok(flat.some((n) => n.className === "biblio-title" && n._t.indexOf("Deep learning for cats") !== -1));
    assert.ok(flat.some((n) => n.className === "biblio-abstract" && n._t === "ab"));
  } finally { s.restore(); globalThis.document = realDoc; }
});

// ---------- 재검수 3차: 제목 정렬 판정 ----------

const refOf = (t, tail) => "Kim, A., & Lee, B. (2020). " + t + (tail === undefined ? ". Journal of Things, 12(3), 45-67." : tail);
const accepts = (refTitle, cand, extra, tail) => B.isMatch(refOf(refTitle, tail), Object.assign({ title: cand, year: "2020", author: KIM }, extra));

test("자매 논문 아홉 쌍: 서로 배제, 자기 자신은 일치", () => {
  const pairs = [
    ["Effects of exercise training on bone density in children", "Effects of exercise training on bone density in adults"],
    ["Study protocol for a trial of cognitive therapy in insomnia", "Study results for a trial of cognitive therapy in insomnia"],
    ["Evolution of structure in bacterial ribosomes and antibiotics", "Evolution of function in bacterial ribosomes and antibiotics"],
    ["Vitamin supplementation and mortality: a randomized trial", "Vitamin supplementation and mortality: a cohort study"],
    ["Sleep duration and cardiovascular risk in men over fifty", "Sleep duration and cardiovascular risk in women over fifty"],
    ["Long-term outcomes of bariatric surgery in adolescents", "Short-term outcomes of bariatric surgery in adolescents"],
    ["Thermal decomposition of transition metal oxalates. Part 1", "Thermal decomposition of transition metal oxalates. Part 2"],
    ["Photochemistry of aromatic ketones: I. Theory", "Photochemistry of aromatic ketones: II. Experiments"],
    ["Acute effects of caffeine on working memory in students", "Chronic effects of caffeine on working memory in students"]
  ];
  for (const [x, y] of pairs) {
    assert.equal(accepts(x, y), false, x + " / " + y);
    assert.equal(accepts(y, x), false, y + " / " + x);
    assert.equal(accepts(x, x), true, x);
    assert.equal(accepts(y, y), true, y);
  }
});

test("줄 끝 하이픈 복구: 낱말 5·8·14개 제목", () => {
  const titles = [
    "Deep learning prediction of rainfall",
    "Machine learning for rainfall prediction in tropical catchments",
    "A comparative evaluation of machine learning approaches for rainfall prediction in tropical regions of Asia"
  ];
  assert.deepEqual(titles.map((t) => B.normalizeTitle(t).length), [5, 8, 14]);
  for (const t of titles) {
    assert.equal(accepts(t.replace("prediction", "predic- tion"), t), true, t);
    assert.equal(accepts(t.replace("prediction", "predic-tion"), t), true, t);
    assert.equal(accepts(t.replace("prediction", "predic tion"), t), true, t);
    assert.equal(accepts(t.replace("prediction", "predic- tin"), t), false, t); // 이어 붙여도 다른 낱말
  }
});

test("가운데 낱말 하나 생략은 허용, 둘·처음·끝은 불허, 구별 낱말은 생략 불가", () => {
  const t = "Effects of acute exercise on bone density in older adults";
  assert.equal(accepts("Effects of exercise on bone density in older adults", t), true);
  assert.equal(accepts("Effects of exercise on density in older adults", t), false);
  assert.equal(accepts("Effects of acute exercise on bone density in older", t), false); // 끝 생략
  assert.equal(accepts("of acute exercise on bone density in older adults", t), false); // 처음 생략
  assert.equal(accepts("Seven habits of effective cats in homes", "Seven habits of 2 effective cats in homes"), false);
  assert.equal(accepts("Cats and their habits in homes, Part", "Cats and their habits in homes, Part 2"), false);
});

test("오타·OCR: 6글자 이상은 거리 1까지, 거리 2는 불허, 짧은 낱말은 정확히", () => {
  const t = "Machine learning for rainfall prediction in tropical catchments";
  assert.equal(accepts(t.replace("rainfall", "rainfal"), t), true);
  assert.equal(accepts(t.replace("rainfall", "rainfa"), t), false);
  assert.equal(accepts(t.replace("tropical", "tropicl"), t), true);
  assert.equal(accepts(t.replace("tropical", "tropcl"), t), false);
  assert.equal(accepts("Sleep duration and cardiovascular risk in adults aged fifty", "Sleep duration and cardiovascular risk in adults aged fifth"), false);
  assert.equal(accepts("Symmetric catalysis of aromatic ketones in water", "Asymmetric catalysis of aromatic ketones in water"), false);
});

test("제목 낱말이 흩어져 있기만 하면 불일치(정렬 구간 안 여분 낱말 3개 이상)", () => {
  const t = "Machine learning for rainfall prediction in tropical catchments";
  assert.equal(accepts("Machine learning, Kim A. Journal of Things. For rainfall prediction in tropical catchments", t), false);
  assert.equal(accepts("Machine learning methods and tools for rainfall prediction in tropical catchments", t), false);
  assert.equal(accepts("Machine learning methods for rainfall prediction in tropical catchments", t), true); // 여분 하나는 허용
});

test("부제 생략 비교 우회 차단: 편 번호·로마 숫자·뒤따르는 Part", () => {
  const A = { year: "2020", author: KIM };
  const cand = (title) => Object.assign({ title }, A);
  const ref1 = "Kim, A. Thermal decomposition of transition metal oxalates. Part 2. J Things, 2020.";
  assert.equal(B.isMatch(ref1, cand("Thermal decomposition of transition metal oxalates: Part 1")), false);
  const ref2 = "Kim, A. Photochemistry of aromatic ketones in water: II. Experiments. J Things, 2020.";
  assert.equal(B.isMatch(ref2, cand("Photochemistry of aromatic ketones in water: I. Theory")), false);
  // 부제에 번호 표지가 없어도, 서지 문구에서 제목 바로 뒤에 Part가 오면 다른 편
  assert.equal(B.isMatch(ref1, cand("Thermal decomposition of transition metal oxalates: a review")), false);
  const ref4 = "Kim, A. Thermal decomposition of transition metal oxalates. J Things, 2020.";
  for (const s of ["Part A", "Volume three", "Second edition", "Experiment B", "Vol. 4", "2nd edition"]) {
    assert.equal(B.isMatch(ref4, cand("Thermal decomposition of transition metal oxalates: " + s)), false, s);
  }
  // 정상: 인용에 부제가 없고 부제에 번호 표지가 없음
  assert.equal(B.isMatch(ref4, cand("Thermal decomposition of transition metal oxalates: a kinetic survey")), true);
  // 부제가 있어도 인용에 같은 부제가 있으면 일반 비교로 일치
  assert.equal(B.isMatch(ref1, cand("Thermal decomposition of transition metal oxalates: Part 2")), true);
  // 일반 비교에서도 제목 바로 뒤의 "Part 2"는 다른 편
  assert.equal(B.isMatch(ref1, cand("Thermal decomposition of transition metal oxalates")), false);
});

test("번호 표기: part two = part 2 != part 3, Part A != Part B, 2D != 3D, XI != XII", () => {
  const base = "Cats and their habits in homes";
  assert.equal(accepts(base + ", Part two", base + ", Part 2"), true);
  assert.equal(accepts(base + ", Part 2", base + ", Part two"), true);
  assert.equal(accepts(base + ", Part II", base + ", Part 2"), true);
  assert.equal(accepts(base + ", Part two", base + ", Part 3"), false);
  assert.equal(accepts(base + ", Part three", base + ", Part 2"), false);
  assert.equal(accepts(base + ", Part A", base + ", Part A"), true);
  assert.equal(accepts(base + ", Part A", base + ", Part B"), false);
  assert.equal(accepts(base + ", Part B", base + ", Part A"), false);
  assert.equal(accepts("3D imaging methods for cats", "2D imaging methods for cats"), false);
  assert.equal(accepts("3-D imaging methods for cats", "2-D imaging methods for cats"), false);
  assert.equal(accepts("2-D imaging methods for cats", "2D imaging methods for cats"), true);
  assert.equal(accepts(base + ", Part XII", base + ", Part XI"), false);
  assert.equal(accepts(base + ", Part XI", base + ", Part XI"), true);
  assert.equal(accepts(base + ", Study 4", base + ", Study four"), true);
  assert.equal(accepts(base + ", First study", base + ", Second study"), false);
});

test("공지류 표제: 새 접두 거부, 'Review of' 정상 논문은 위치가 맞을 때만 일치", () => {
  for (const p of ["Review: ", "Review of ", "Book review: ", "Re: ", "Letter: ", "Letter to the Editor: ", "In reply: ",
    "Authors' reply: ", "Author reply: ", "Obituary: ", "In memoriam: ", "Preface: ", "Foreword: ",
    "Introduction to the special issue: ", "Table of contents: ", "Index: ", "Abstracts: "]) {
    assert.equal(accepts(LONG, p + LONG), false, p);
  }
  const rv = "Review of machine learning methods for rainfall prediction";
  assert.equal(accepts(rv, rv), true);
  assert.equal(accepts("Machine learning methods for rainfall prediction", rv), false);
  // 다른 곳에 review가 있어도 제목 구간 앞머리가 아니면 불일치
  const other = "Kim, A. Machine learning methods for rainfall prediction. Review of Things, 2020.";
  assert.equal(B.isMatch(other, { title: rv, year: "2020", author: KIM }), false);
  assert.equal(B.isMatch(other, { title: "Machine learning methods for rainfall prediction", year: "2020", author: KIM }), true);
});

test("pickMatch: Crossref 유형·공지류로 배제된 후보는 모호성에 세지 않음", () => {
  const ref = "Kim, A. Deep learning for cats. J. Cat Sci., 2020. Deep learning for cats in homes.";
  const a = { title: ["Deep learning for cats"], issued: { "date-parts": [[2020]] }, author: [{ family: "Kim" }], type: "journal-article" };
  const b = { title: ["Deep learning for cats in homes"], issued: { "date-parts": [[2020]] }, author: [{ family: "Kim" }], type: "peer-review" };
  assert.equal(B.pickMatch(ref, [a, b]), a);
  assert.equal(B.pickMatch(ref, [b, a]), a);
  assert.equal(B.pickMatch(ref, [b]), null);
  const c = { title: ["Letter to the Editor: Deep learning for cats in homes"], issued: { "date-parts": [[2020]] }, author: [{ family: "Kim" }] };
  assert.equal(B.pickMatch(ref, [a, c]), a);
});

test("기관 저자: 괄호 약어, UN, 약어는 저자 자리에서만", () => {
  const t = LONG;
  const cdc = { name: "Centers for Disease Control and Prevention (CDC)" };
  const org = (ref, author) => B.isMatch(ref, { title: t, year: "2020", author: [author] });
  assert.equal(org("Centers for Disease Control and Prevention. " + t + ". MMWR, 2020.", cdc), true);
  assert.equal(org("CDC. " + t + ". MMWR, 2020.", cdc), true);
  assert.equal(org("Centers for Disease Control & Prevention (CDC). " + t + ". MMWR, 2020.", cdc), true);
  assert.equal(org("Cdc. " + t + ". MMWR, 2020.", cdc), false);
  assert.equal(org("UN. " + t + ". New York, 2020.", { name: "United Nations" }), true);
  assert.equal(org("EU. " + t + ". Brussels, 2020.", { name: "European Union" }), true);
  assert.equal(org("un. " + t + ". New York, 2020.", { name: "United Nations" }), false);
  // 두 글자 약어는 의미 낱말이 정확히 둘일 때만
  assert.equal(org("WB. " + t + ". 2020.", { name: "World Bank Group Institute" }), false);
  assert.equal(org("WB. " + t + ". 2020.", { name: "World Bank" }), true);
  // 약어가 제목 뒤(저자 자리가 아님)에 있으면 불일치
  assert.equal(org(t + ". WHO, Geneva, 2020.", { name: "World Health Organization" }), false);
  assert.equal(org(t + ". UN, New York, 2020.", { name: "United Nations" }), false);
  assert.equal(org("WHO. " + t + ". Geneva, 2020.", { name: "World Health Organization" }), true);
});

test("한글 문턱: 앞 120자의 한글이 정확히 절반이면 한글", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return okRes(GOOD); };
  try {
    B.reset();
    // 글자 수: 라틴 4(K,i,m,A) + 한글 4 = 정확히 50%
    const half = "Kim, A. 가나다라 2020";
    assert.equal(B.mostlyHangul(half), true);
    assert.equal((await B.lookup(half)).status, "nomatch");
    assert.equal(calls, 0);
    // 한글 3 / 전체 7 = 43%: 조회함
    const less = "Kim, A. 가나다 2020";
    assert.equal(B.mostlyHangul(less), false);
    await B.lookup(less);
    assert.equal(calls, 1);
    // 앞 120자만 본다
    const en = "Kim, A. Deep learning for cats and dogs in the wild and in the house of the cat people. J. Cat Sci. 2020. ";
    const head = en + "x".repeat(Math.max(0, 120 - en.length));
    assert.equal(B.mostlyHangul(head + "가나다라마바사아자차카타파하".repeat(20)), false);
    const ko = "김철수 이영희 청소년의 스마트폰 과의존이 학업성취에 미치는 영향 교육학연구 청소년 스마트폰 과의존 학업성취 영향 연구 방법 분석 ";
    assert.equal(B.mostlyHangul(ko + "english tail ".repeat(30)), true);
  } finally { globalThis.fetch = real; B.reset(); }
});

test("lookup catch: 내부 예외만 문서당 한 번 console.warn, 상태는 error", async () => {
  const realWarn = console.warn;
  const warns = [];
  console.warn = (...a) => { warns.push(a); };
  const boom = { get title() { throw new RangeError("internal boom"); } };
  const s = stubFetch(async () => okRes({ message: { items: [boom] } }));
  try {
    B.reset();
    assert.equal((await B.lookup(LREF)).status, "error");
    assert.equal((await B.lookup("Lee, B. Another cat paper about whiskers and tails. J, 2021.")).status, "error");
    assert.equal(warns.length, 1);
    assert.equal(warns[0][0], "[biblio]");
    B.reset(); // 문서가 바뀌면 다시 한 번
    assert.equal((await B.lookup(LREF)).status, "error");
    assert.equal(warns.length, 2);
  } finally { console.warn = realWarn; s.restore(); }
  // 네트워크 TypeError·HTTP·깨진 JSON은 경고 없음
  console.warn = (...a) => { warns.push(a); };
  const n0 = warns.length;
  const s2 = stubFetch(async () => { throw new TypeError("Failed to fetch"); });
  try { B.reset(); assert.equal((await B.lookup(LREF)).status, "error"); } finally { s2.restore(); }
  const s3 = stubFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }));
  try { assert.equal((await B.lookup(LREF)).status, "error"); } finally { s3.restore(); }
  const s4 = stubFetch(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } }));
  try { assert.equal((await B.lookup(LREF)).status, "error"); } finally { s4.restore(); }
  console.warn = realWarn;
  assert.equal(warns.length, n0);
});

test("알려진 정상 사례: Watson&Crick 1953(부제 유무), Hochreiter&Schmidhuber 1997, Kahneman&Tversky 1979", async () => {
  const watson = { title: ["Molecular Structure of Nucleic Acids: A Structure for Deoxyribose Nucleic Acid"],
    author: [{ given: "J. D.", family: "Watson", sequence: "first" }, { given: "F. H. C.", family: "Crick", sequence: "additional" }],
    issued: { "date-parts": [[1953, 4]] }, "container-title": ["Nature"], DOI: "10.1038/171737a0", type: "journal-article" };
  const lstm = { title: ["Long Short-Term Memory"],
    author: [{ given: "Sepp", family: "Hochreiter", sequence: "first" }, { given: "Jürgen", family: "Schmidhuber", sequence: "additional" }],
    issued: { "date-parts": [[1997, 11, 1]] }, "container-title": ["Neural Computation"], DOI: "10.1162/neco.1997.9.8.1735", type: "journal-article" };
  const pt = { title: ["Prospect Theory: An Analysis of Decision under Risk"],
    author: [{ given: "Daniel", family: "Kahneman", sequence: "first" }, { given: "Amos", family: "Tversky", sequence: "additional" }],
    issued: { "date-parts": [[1979, 3]] }, "container-title": ["Econometrica"], DOI: "10.2307/1914185", type: "journal-article" };
  const noise = { title: ["The Double Helix: A Personal Account of the Discovery of the Structure of DNA"],
    author: [{ given: "James", family: "Watson" }], issued: { "date-parts": [[1968]] }, type: "book" };
  const refs = [
    ["Watson, J. D., & Crick, F. H. C. (1953). Molecular structure of nucleic acids: A structure for deoxyribose nucleic acid. Nature, 171(4356), 737-738.", watson],
    ["Watson JD, Crick FHC. Molecular structure of nucleic acids. Nature. 1953;171:737-738.", watson],
    ["Hochreiter, S., & Schmidhuber, J. (1997). Long short-term memory. Neural Computation, 9(8), 1735-1780.", lstm],
    ["Kahneman, D., & Tversky, A. (1979). Prospect theory: An analysis of decision under risk. Econometrica, 47(2), 263-291.", pt]
  ];
  for (const [ref, item] of refs) {
    assert.equal(B.pickMatch(ref, [noise, item]), item, ref);
    const s = stubFetch(async () => okRes({ message: { items: [noise, item] } }));
    try {
      B.reset();
      const r = await B.lookup(ref);
      assert.equal(r.status, "ok", ref);
      assert.equal(r.data.title, item.title[0]);
    } finally { s.restore(); }
  }
});

// ---------- 재검수 4차 ----------

const r4SM = [{ family: "Smith", given: "J" }];
const r4cand = (title, extra) => Object.assign({ title, year: "2015", author: r4SM }, extra);
const r4refOf = (title) => "Smith J, Lee K. " + title + ". Lancet 2015;385:100-110.";
const r4rej = (refTitle, candTitle, extra) => B.isMatch(r4refOf(refTitle), r4cand(candTitle, extra));
// 서로 배제(양방향)되어야 하고, 자기 자신은 일치해야 한다
function r4siblings(a, b) {
  assert.equal(r4rej(a, b), false, "ref[" + a + "] r4cand[" + b + "]");
  assert.equal(r4rej(b, a), false, "ref[" + b + "] r4cand[" + a + "]");
  assert.equal(r4rej(a, a), true, "self[" + a + "]");
  assert.equal(r4rej(b, b), true, "self[" + b + "]");
}

const r4DT = "Deep learning methods for protein folding prediction";
const r4DR = "Smith J, Lee K. " + r4DT + ". Nature 2020;1:2-10.";

test("공지 접미: 뒤쪽 표지어(– CORRIGENDUM, : Erratum …)는 앞부분 비교로 넘길 수 없다", () => {
  for (const suf of [" – CORRIGENDUM", " — ERRATUM", ": Erratum", ": Correction", ": Authors' reply", ": a commentary", " - Retraction",
    ": Retracted article", ": Reply to Jones", ": Addendum", " – Discussion", ": Expression of concern", " (Erratum)"]) {
    assert.equal(B.isMatch(r4DR, { title: r4DT + suf, year: "2020", author: r4SM }), false, suf);
    // 서지 문구가 그 공지 자체를 인용하면 일치
    assert.equal(B.isMatch("Smith J, Lee K. " + r4DT + suf + ". Nature 2020;1:2-10.", { title: r4DT + suf, year: "2020", author: r4SM }), true, "self " + suf);
  }
  // 부제 필드가 Erratum이면 제목만으로 비교하지 않는다
  assert.equal(B.isMatch(r4DR, { title: r4DT, subtitle: "Erratum", year: "2020", author: r4SM }), false);
  assert.equal(B.isMatch("Smith J. " + r4DT + ": Erratum. Nature 2020.", { title: r4DT, subtitle: "Erratum", year: "2020", author: r4SM }), true);
  // 표지어 없는 부제 생략은 그대로 허용
  assert.equal(B.isMatch(r4DR, { title: r4DT + ": methods and validation of cats", year: "2020", author: r4SM }), true);
  // pickMatch: 정정 공지와 본 논문이 함께 오면 본 논문만 고른다
  const it = (title, sub) => ({ title: [title], subtitle: sub ? [sub] : undefined, author: r4SM, issued: { "date-parts": [[2020]] } });
  const paper = it(r4DT), notice = it(r4DT + " – CORRIGENDUM"), n2 = it(r4DT, "Erratum");
  assert.equal(B.pickMatch(r4DR, [notice, n2, paper]), paper);
});

test("한 글자·그리스 문자 구분자는 정확히 일치해야 한다", () => {
  r4siblings("Global prevalence of hepatitis B virus infection in adults", "Global prevalence of hepatitis C virus infection in adults");
  r4siblings("Vitamin D supplementation and risk of fractures in adults", "Vitamin E supplementation and risk of fractures in adults");
  r4siblings("Antiviral activity of interferon-α against hepatitis viruses in vitro", "Antiviral activity of interferon-γ against hepatitis viruses in vitro");
  r4siblings("Epidemiology of influenza A virus infection in children", "Epidemiology of influenza B virus infection in children");
  // 구분자는 빼거나 끼울 수 없다
  assert.equal(r4rej("Global prevalence of hepatitis virus infection in adults", "Global prevalence of hepatitis B virus infection in adults"), false);
  assert.equal(r4rej("Global prevalence of hepatitis B virus infection in adults", "Global prevalence of hepatitis virus infection in adults"), false);
  // α ≡ alpha, 관사 a는 구분자가 아니다
  assert.equal(r4rej("Antiviral activity of interferon-alpha against hepatitis viruses in vitro", "Antiviral activity of interferon-α against hepatitis viruses in vitro"), true);
  assert.equal(r4rej("Antiviral activity of interferon-α against hepatitis viruses in vitro", "Antiviral activity of interferon-alpha against hepatitis viruses in vitro"), true);
  assert.equal(r4rej("Antiviral activity of interferon-alpha against hepatitis viruses in vitro", "Antiviral activity of interferon-γ against hepatitis viruses in vitro"), false);
  assert.equal(r4rej("Learning to navigate a maze with rats in cages", "Learning to navigate maze with rats in cages"), true);
  assert.equal(r4rej("Learning to navigate a maze with rats in cages", "Learning to navigate a maze with rats in cages"), true);
  // titleKey: 구분자가 다르면 다른 제목, pickMatch는 문구가 말하는 쪽을 고른다
  const it = (title) => ({ title: [title], author: r4SM, issued: { "date-parts": [[2015]] } });
  const hb = it("Global prevalence of hepatitis B virus infection in adults"), hc = it("Global prevalence of hepatitis C virus infection in adults");
  assert.equal(B.pickMatch(r4refOf("Global prevalence of hepatitis B virus infection in adults"), [hc, hb]), hb);
  assert.equal(B.pickMatch(r4refOf("Global prevalence of hepatitis C virus infection in adults"), [hc, hb]), hc);
  assert.notEqual(B.normalizeTitle(hb.title[0]).join(" "), B.normalizeTitle(hc.title[0]).join(" "));
  assert.deepEqual(B.normalizeTitle("Vitamin A and TGF-β in a cell"), ["vitamin", "a", "and", "tgf", "beta", "in", "cell"]);
});

test("제목 뒤의 연도 아닌 번호는 모든 비교에서 다른 편", () => {
  const T = "Fluid dynamics of turbulent jets in open channels";
  const c = (extra) => B.isMatch("Smith J. " + extra, { title: T, year: "2001", author: r4SM });
  assert.equal(c(T + ". II. Experiments. J Fluid Mech 2001."), false);
  assert.equal(c(T + " (2). J Fluid Mech 2001."), false);
  assert.equal(c(T + ": III. J Fluid Mech 2001."), false);
  assert.equal(c(T + ", Two. J Fluid Mech 2001."), false);
  assert.equal(c(T + ". J Fluid Mech 2001."), true);
  assert.equal(c(T + ". 2001. J Fluid Mech 12:3."), true);
  assert.equal(c(T + " (2001). J Fluid Mech 12:3."), true);
  assert.equal(c(T + ". J Fluid Mech 12 (2001) 3-10."), true);
  assert.equal(c(T + ". 12 (2001) 3-10."), true); // 번호 다음이 연도: 권호
});

test("부정·범위 낱말은 빼거나 끼울 수 없다(양방향)", () => {
  r4siblings("Treatment of non-small cell lung cancer in elderly patients", "Treatment of small cell lung cancer in elderly patients");
  r4siblings("Effects of drug treatment in rats and mice models", "Effects of drug treatment in rats and not mice models");
  r4siblings("Is there a role for surgery in pancreatic cancer care", "Is there no role for surgery in pancreatic cancer care");
  r4siblings("Surgery with adjuvant chemotherapy for gastric cancer outcomes", "Surgery without adjuvant chemotherapy for gastric cancer outcomes");
  r4siblings("Anti inflammatory drugs for chronic pain in older adults", "Inflammatory drugs for chronic pain in older adults");
  // 하이픈 표기 차이는 같은 낱말
  assert.equal(r4rej("Treatment of non small cell lung cancer in elderly patients", "Treatment of non-small cell lung cancer in elderly patients"), true);
});

test("오타 허용: 삽입·삭제, s↔z, o↔ou만. 한 글자 치환은 다른 낱말", () => {
  r4siblings("Removal of nitrate from drinking water by ion exchange", "Removal of nitrite from drinking water by ion exchange");
  r4siblings("Synthesis of substituted alkenes via palladium catalysis", "Synthesis of substituted alkynes via palladium catalysis");
  r4siblings("Adsorption of carbon dioxide on activated carbon fibers", "Absorption of carbon dioxide on activated carbon fibers");
  r4siblings("Microvascular complications of diabetes in young adults", "Macrovascular complications of diabetes in young adults");
  r4siblings("Hypertension during anesthesia in elderly surgical patients", "Hypotension during anesthesia in elderly surgical patients");
  const same = (a, b) => assert.equal(r4rej(a, b), true, a + " / " + b);
  same("Organisation of care for patients with heart failure", "Organization of care for patients with heart failure");
  same("Organization of care for patients with heart failure", "Organisation of care for patients with heart failure");
  same("We analyse mortality in tumour patients across hospitals", "We analyze mortality in tumor patients across hospitals");
  same("We analyze mortality in tumor patients across hospitals", "We analyse mortality in tumour patients across hospitals");
  same("Colour perception in children with reading difficulty", "Color perception in children with reading difficulty");
  same("Machine learning for rainfal prediction in tropical catchments", "Machine learning for rainfall prediction in tropical catchments");
  assert.equal(r4rej("Machine learning for rainfa prediction in tropical catchments", "Machine learning for rainfall prediction in tropical catchments"), false);
});

test("끝·처음 하이픈 분리와 쪼개진 화학식은 이웃한 낱말을 이어 붙여 복구", () => {
  const T = "ImageNet classification with deep convolutional neural networks";
  assert.equal(r4rej("ImageNet classification with deep convolutional neural net- works", T), true);
  assert.equal(r4rej("Immuno- therapy for advanced melanoma in adults", "Immunotherapy for advanced melanoma in adults"), true);
  assert.equal(r4rej("Deep learn- ing methods for protein fold- ing prediction", r4DT), true);
  assert.equal(r4rej("Electrochemical reduction of CO 2 on copper electrodes", "Electrochemical reduction of CO2 on copper electrodes"), true);
  assert.equal(r4rej("CO 2 reduction on copper electrodes in water", "CO2 reduction on copper electrodes in water"), true);
  // 이웃하지 않으면(사이에 낱말) 복구하지 않는다
  assert.equal(r4rej("Electrochemical reduction of CO and 2 on copper electrodes", "Electrochemical reduction of CO2 on copper electrodes"), false);
  assert.equal(r4rej("Electrochemical reduction of CO 3 on copper electrodes", "Electrochemical reduction of CO2 on copper electrodes"), false);
});

test("연도: Crossref의 인쇄·온라인·게시·발행·등록 연도 중 하나가 문구에 있으면 일치", () => {
  const item = (extra) => Object.assign({ title: [r4DT], author: r4SM, issued: { "date-parts": [[2020]] } }, extra);
  const ref21 = "Smith J, Lee K. " + r4DT + ". Nature 2021;1:2-10.";
  assert.equal(B.pickMatch(ref21, [item()]), null); // issued만 2020
  const pp = item({ "published-print": { "date-parts": [[2021, 3]] } });
  assert.equal(B.pickMatch(ref21, [pp]), pp);
  const po = item({ "published-online": { "date-parts": [[2021]] } });
  assert.equal(B.pickMatch(ref21, [po]), po);
  assert.equal(B.pickMatch(r4DR, [pp]), pp); // issued(2020)도 계속 통과
  assert.equal(B.pickMatch("Smith J, Lee K. " + r4DT + ". Nature 2019;1:2-10.", [pp]), null);
  assert.equal(B.isMatch(ref21, { title: r4DT, year: "2020", years: ["2021"], author: r4SM }), true);
  assert.equal(B.isMatch(ref21, { title: r4DT, year: "2020", years: ["20211"], author: r4SM }), false);
});

test("lookup 재시도: 일시 실패는 같은 약속 안에서 한 번만 다시", async () => {
  const delays = [];
  // 실패 뒤 성공 → ok, 요청 정확히 2번
  let n = 0;
  let s = stubFetch(async () => { if (n++ === 0) throw new TypeError("Failed to fetch"); return okRes(GOOD); });
  B.setRetryDelay((ms) => { delays.push(ms); return Promise.resolve(); });
  try {
    B.reset();
    const r = await B.lookup(LREF);
    assert.equal(r.status, "ok");
    assert.equal(s.calls.length, 2);
    assert.deepEqual(delays, [1200]);
    assert.equal((await B.lookup(LREF)).status, "ok"); // 캐시
    assert.equal(s.calls.length, 2);
  } finally { s.restore(); }
  // 두 번 실패 → error(reason), 캐시 안 됨
  s = stubFetch(async () => { throw new TypeError("Failed to fetch"); });
  try {
    B.reset();
    const r = await B.lookup(LREF);
    assert.equal(r.status, "error");
    assert.equal(r.reason, "network");
    assert.equal(s.calls.length, 2);
    assert.equal((await B.lookup(LREF)).status, "error");
    assert.equal(s.calls.length, 4);
  } finally { s.restore(); }
  // 502/503/504/429는 재시도, 404·500·400은 재시도 안 함
  for (const [st, calls] of [[502, 2], [503, 2], [504, 2], [429, 2], [404, 1], [500, 1], [400, 1]]) {
    s = stubFetch(async () => ({ ok: false, status: st, json: async () => ({}) }));
    try {
      B.reset();
      const r = await B.lookup(LREF);
      assert.equal(r.status, "error", String(st));
      assert.equal(r.reason, "http " + st);
      assert.equal(s.calls.length, calls, "http " + st);
    } finally { s.restore(); }
  }
  // 깨진 JSON·모양 이상·내부 예외는 재시도 안 함
  s = stubFetch(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } }));
  try { B.reset(); const r = await B.lookup(LREF); assert.deepEqual([r.status, r.reason, s.calls.length], ["error", "json", 1]); } finally { s.restore(); }
  s = stubFetch(async () => okRes({ message: {} }));
  try { B.reset(); const r = await B.lookup(LREF); assert.deepEqual([r.status, r.reason, s.calls.length], ["error", "shape", 1]); } finally { s.restore(); }
  const warn = console.warn; console.warn = () => {};
  s = stubFetch(async () => okRes({ message: { items: [{ get title() { throw new RangeError("boom"); } }] } }));
  try { B.reset(); const r = await B.lookup(LREF); assert.deepEqual([r.status, r.reason, s.calls.length], ["error", "internal", 1]); } finally { console.warn = warn; s.restore(); }
});

test("lookup 재시도: 대기 중 reset하면 두 번째 요청 없음, 두 번째 시도의 컨트롤러도 reset에 중단", async () => {
  // 대기 중 reset
  let release;
  let s = stubFetch(async () => { throw new TypeError("Failed to fetch"); });
  B.setRetryDelay(() => new Promise((res) => { release = res; }));
  try {
    B.reset();
    const p = B.lookup(LREF);
    await new Promise((r) => setImmediate(r));
    assert.equal(s.calls.length, 1);
    B.reset();
    release();
    const r = await p;
    assert.equal(r.status, "error");
    assert.equal(s.calls.length, 1);
    assert.equal(r.reason, "network");
  } finally { s.restore(); }
  // 실제 대기(타이머)도 reset이 깨운다: 1.2초를 기다리지 않고 끝난다
  s = stubFetch(async () => { throw new TypeError("Failed to fetch"); });
  B.setRetryDelay(null);
  try {
    B.reset();
    const t0 = Date.now();
    const p = B.lookup(LREF);
    await new Promise((r) => setImmediate(r));
    B.reset();
    assert.equal((await p).status, "error");
    assert.ok(Date.now() - t0 < 1000);
    assert.equal(s.calls.length, 1);
  } finally { s.restore(); }
  // 두 번째 시도 도중 reset → 중단
  let n = 0, aborted = false;
  s = stubFetch((url, opts) => {
    if (n++ === 0) throw new TypeError("Failed to fetch");
    return new Promise((_, r4rej) => opts.signal.addEventListener("abort", () => { aborted = true; r4rej(new Error("aborted")); }));
  });
  try {
    B.reset();
    const p = B.lookup(LREF);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(s.calls.length, 2);
    B.reset();
    assert.equal(aborted, true);
    assert.equal((await p).status, "error");
  } finally { s.restore(); }
});

test("lookup 재시도: 8초 시간 초과도 한 번 재시도, reason은 timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const tick = () => new Promise((r) => setImmediate(r));
  const s = stubFetch((url, opts) => new Promise((_, r4rej) => {
    opts.signal.addEventListener("abort", () => r4rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
  }));
  try {
    B.reset();
    const p = B.lookup(LREF);
    await tick();
    assert.equal(s.calls.length, 1);
    t.mock.timers.tick(8000);
    await tick(); await tick();
    assert.equal(s.calls.length, 2);
    t.mock.timers.tick(8000);
    const r = await p;
    assert.deepEqual([r.status, r.reason], ["error", "timeout"]);
  } finally { s.restore(); t.mock.timers.reset(); }
});

// 재검수가 모은 정상 사례 28건: 회귀 방지(통과 25건, 설계상 불일치 3건)
test("정상 사례 28건 회귀 블록", () => {
  const item = (title, authors, y, sub, extra) => Object.assign({ title: [title], subtitle: sub ? [sub] : undefined, author: authors, issued: { "date-parts": [[y]] }, type: "journal-article", DOI: "10.1000/x" }, extra);
  const P = (f, g) => ({ family: f, given: g });
  const cases = [
    ["APA", "Kahneman, D., & Tversky, A. (1979). Prospect theory: An analysis of decision under risk. Econometrica, 47(2), 263–291.", item("Prospect Theory: An Analysis of Decision under Risk", [P("Kahneman", "Daniel"), P("Tversky", "Amos")], 1979), true],
    ["Vancouver", "12. Hochreiter S, Schmidhuber J. Long short-term memory. Neural Comput. 1997;9(8):1735-80.", item("Long Short-Term Memory", [P("Hochreiter", "Sepp")], 1997), true],
    ["IEEE quotes", "[7] K. He, X. Zhang, S. Ren, and J. Sun, “Deep residual learning for image recognition,” in Proc. IEEE CVPR, 2016, pp. 770–778.", item("Deep Residual Learning for Image Recognition", [P("He", "Kaiming")], 2016), true],
    ["Harvard", "Watson, J.D. and Crick, F.H.C., 1953. Molecular structure of nucleic acids: a structure for deoxyribose nucleic acid. Nature, 171(4356), pp.737-738.", item("Molecular Structure of Nucleic Acids: A Structure for Deoxyribose Nucleic Acid", [P("Watson", "J. D.")], 1953), true],
    ["Chicago", "Granovetter, Mark S. “The Strength of Weak Ties.” American Journal of Sociology 78, no. 6 (1973): 1360–80.", item("The Strength of Weak Ties", [P("Granovetter", "Mark S.")], 1973), true],
    ["subtitle field", "Page MJ, McKenzie JE, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ. 2021;372:n71.", item("The PRISMA 2020 statement", [P("Page", "Matthew J")], 2021, "an updated guideline for reporting systematic reviews"), true],
    ["subtitle only in crossref (one-word title: nomatch by design)", "Thaler RH, Sunstein CR. Nudge. Yale University Press; 2008.", item("Nudge", [P("Thaler", "R")], 2008, "Improving decisions about health, wealth, and happiness"), false],
    ["main-title fallback", "Jumper J, et al. Highly accurate protein structure prediction with AlphaFold. Nature 2021;596:583–589.", item("Highly accurate protein structure prediction with AlphaFold: methods and validation", [P("Jumper", "John")], 2021), true],
    ["et al + abbreviated journal", "Vaswani A et al. Attention is all you need. Adv Neural Inf Process Syst. 2017;30.", item("Attention Is All You Need", [P("Vaswani", "Ashish")], 2017), true],
    ["interior hyphenation", "Silver D, Huang A, et al. Mastering the game of Go with deep neural net- works and tree search. Nature 2016;529:484.", item("Mastering the game of Go with deep neural networks and tree search", [P("Silver", "David")], 2016), true],
    ["last-word hyphenation", "Krizhevsky A, Sutskever I, Hinton GE. ImageNet classification with deep convolutional neural net- works. Commun ACM 2017;60:84.", item("ImageNet classification with deep convolutional neural networks", [P("Krizhevsky", "Alex")], 2017), true],
    ["dropped 'the'", "Fama EF. Efficient capital markets: a review of theory and empirical work. J Finance 1970;25:383.", item("Efficient Capital Markets: A Review of the Theory and Empirical Work", [P("Fama", "Eugene F.")], 1970), true],
    ["curly apostrophe", "McKhann GM, et al. The diagnosis of dementia due to Alzheimer’s disease. Alzheimers Dement. 2011;7:263.", item("The diagnosis of dementia due to Alzheimer's disease", [P("McKhann", "Guy M.")], 2011), true],
    ["period inside quotes", "D. Kingma and J. Ba, “Adam: A method for stochastic optimization.” arXiv 2014.", item("Adam: A Method for Stochastic Optimization", [P("Kingma", "Diederik")], 2014), true],
    ["diacritics both", "Schrödinger E. Die gegenwärtige Situation in der Quantenmechanik. Naturwissenschaften 1935;23:807.", item("Die gegenwärtige Situation in der Quantenmechanik", [P("Schrödinger", "E.")], 1935), true],
    ["diacritics lost in ref", "Schrodinger E, Muller K. Etude de la diffusion des electrons dans les metaux. J Phys 1935;23:807.", item("Étude de la diffusion des électrons dans les métaux", [P("Schrödinger", "E.")], 1935), true],
    ["& vs and", "Deci EL, Ryan RM. The “what” & “why” of goal pursuits: human needs & the self-determination of behavior. Psychol Inq 2000;11:227.", item("The \"What\" and \"Why\" of Goal Pursuits: Human Needs and the Self-Determination of Behavior", [P("Deci", "Edward L.")], 2000), true],
    ["one & vs and", "Ostrom E. Rules, games & common-pool resources in practice. Univ Michigan Press 1994.", item("Rules, Games, and Common-Pool Resources in Practice", [P("Ostrom", "Elinor")], 1994), true],
    ["numbers", "Sung H, et al. Global cancer statistics 2020: GLOBOCAN estimates of incidence and mortality worldwide for 36 cancers in 185 countries. CA Cancer J Clin 2021;71:209.", item("Global Cancer Statistics 2020: GLOBOCAN Estimates of Incidence and Mortality Worldwide for 36 Cancers in 185 Countries", [P("Sung", "Hyuna")], 2021), true],
    ["greek spelled out in ref", "Massagué J. TGF-beta signalling in context of tumour biology. Nat Rev Mol Cell Biol 2012;13:616.", item("TGF-β signalling in context of tumour biology", [P("Massagué", "Joan")], 2012), true],
    ["greek in ref, spelled in crossref", "Selkoe DJ. The amyloid β-protein hypothesis of Alzheimer disease at 25 years. EMBO Mol Med 2016;8:595.", item("The amyloid beta-protein hypothesis of Alzheimer disease at 25 years", [P("Selkoe", "Dennis J")], 2016), true],
    ["formula w/ JATS sub", "Fujishima A, Honda K. Electrochemical photolysis of water at a TiO2 semiconductor electrode. Nature 1972;238:37.", item("Electrochemical Photolysis of Water at a TiO<sub>2</sub> Semiconductor Electrode", [P("Fujishima", "Akira")], 1972), true],
    ["formula split in PDF text", "Hori Y. Electrochemical reduction of CO 2 on metal electrodes in aqueous media. Mod Asp Electrochem 2008;42:89.", item("Electrochemical reduction of CO2 on metal electrodes in aqueous media", [P("Hori", "Y.")], 2008), true],
    ["UK/US spelling", "Moher D, et al. Randomised trials of behaviour change interventions in tumour patients. BMJ 2010;340:c332.", item("Randomized trials of behavior change interventions in tumor patients", [P("Moher", "David")], 2010), true],
    ["two-word title (nomatch by design)", "LeCun Y, Bengio Y, Hinton G. Deep learning. Nature 2015;521:436–444.", item("Deep learning", [P("LeCun", "Yann")], 2015), false],
    ["print year != issued, fixture has no print date (nomatch)", "Smith J. Outcomes of early rhythm control in atrial fibrillation patients. Heart 2021;107:10.", item("Outcomes of early rhythm control in atrial fibrillation patients", [P("Smith", "J")], 2020), false],
    ["title case + compound surname", "van der Maaten L, Hinton G. Visualizing Data Using t-SNE. J Mach Learn Res 2008;9:2579.", item("Visualizing data using t-SNE", [P("van der Maaten", "Laurens")], 2008), true],
    ["org author", "World Health Organization. Global status report on road safety 2018. Geneva: WHO; 2018.", item("Global status report on road safety 2018", [{ name: "World Health Organization" }], 2018), true]
  ];
  assert.equal(cases.length, 28);
  for (const [label, ref, it, expectHit] of cases) {
    assert.equal(!!B.pickMatch(B.trimRef(ref), [it]), expectHit, label);
  }
  // 같은 논문인데 Crossref에 인쇄 연도가 있으면 통과
  const pr = item("Outcomes of early rhythm control in atrial fibrillation patients", [P("Smith", "J")], 2020, null, { "published-print": { "date-parts": [[2021]] } });
  assert.ok(B.pickMatch("Smith J. Outcomes of early rhythm control in atrial fibrillation patients. Heart 2021;107:10.", [pr]));
});
