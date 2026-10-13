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

test("isMatch: 한글 서지와 한글 제목", () => {
  const ref = "김철수·이영희 (2018). 청소년의 스마트폰 과의존이 학업성취에 미치는 영향. 교육학연구, 56(2), 1-25.";
  assert.equal(B.isMatch(ref, { title: "청소년의 스마트폰 과의존이 학업성취에 미치는 영향", year: "2018", author: [{ family: "김" }] }), true);
  assert.equal(B.isMatch(ref, { title: "청소년의 스마트폰 과의존이 학업성취에 미치는 영향", year: "2017" }), false);
  assert.equal(B.isMatch(ref, { title: "성인의 인터넷 사용이 직무만족에 미치는 영향 연구", year: "2018" }), false);
  // 한글 서지에 영문 제목 후보는 한글 규칙을 통과하지 못하므로 false
  assert.equal(B.isMatch(ref, { title: "Smartphone overdependence of adolescents", year: "2018" }), false);
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
  const ko = "박영수 (2018). 청소년의 스마트폰 과의존이 학업성취에 미치는 영향. 김포교육연구, 56(2), 1-25.";
  const kt = "청소년의 스마트폰 과의존이 학업성취에 미치는 영향";
  assert.equal(B.isMatch(ko, { title: kt, year: "2018", author: [{ family: "김" }] }), false);
  const ko2 = "김철수, 이영희(2018). 청소년의 스마트폰 과의존이 학업성취에 미치는 영향. 교육학연구, 56(2), 1-25.";
  assert.equal(B.isMatch(ko2, { title: kt, year: "2018", author: [{ family: "김" }] }), true);
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
  assert.equal(lab("constructor"), "");
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
  return { calls, restore: () => { globalThis.fetch = real; B.reset(); } };
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
    assert.equal(u.searchParams.get("select"), "title,author,issued,container-title,DOI,abstract,type");
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

test("lookup: 429 → error, 캐시 안 됨", async () => {
  B.reset();
  const s = stubFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }));
  try {
    assert.equal((await B.lookup(LREF)).status, "error");
    assert.equal((await B.lookup(LREF)).status, "error");
    assert.equal(s.calls.length, 2);
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
