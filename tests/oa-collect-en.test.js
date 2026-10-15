const assert = require("assert");
const test = require("node:test");
const C = require("../scripts/oa/en-common.js");
const epmc = require("../scripts/oa/collect-europepmc.js");
const arxiv = require("../scripts/oa/collect-arxiv.js");
const s2 = require("../scripts/oa/collect-s2.js");

const EN = "We study the effect of the treatment on outcomes in a large cohort and show that the results are robust with respect to the choice of the model. This is the first study of its kind in the field and the data support the claim.";

test("cleanText strips tags and entities", () => {
  assert.strictEqual(C.cleanText("<h4>Aim</h4> a &amp; b &#x41;&lt;"), "Aim a & b A<");
});

test("isEnglish / acceptable", () => {
  assert.ok(C.isEnglish(EN));
  assert.ok(!C.isEnglish("이 연구는 한국어로 작성된 초록입니다. " + EN));
  assert.ok(!C.isEnglish("Le traitement de la maladie dans une grande cohorte montre que les resultats sont robustes pour le modele choisi par les auteurs."));
  assert.ok(C.acceptable("A study", EN));
  assert.ok(!C.acceptable("Correction: A study", EN));
  assert.ok(!C.acceptable("A study", "short abstract"));
});

test("sanitizeQueryTerm and termTitlesFor", () => {
  assert.strictEqual(C.sanitizeQueryTerm("Odds ratio (OR)"), "Odds ratio");
  assert.strictEqual(C.sanitizeQueryTerm("x"), null);
  const terms = [
    { title_en: "Odds ratio", categories: ["stat"] }, { title_en: "Mixed model", categories: ["stat", "med"] },
    { title_en: "Gene", categories: ["bio"] },
  ];
  const r = C.termTitlesFor(terms, "stat", 5);
  assert.deepStrictEqual(r, ["Odds ratio", "Mixed model"]);
  assert.deepStrictEqual(C.termTitlesFor(terms, "stat", 5), r);
});

test("europepmc parseResults keeps CC licensed with abstract", () => {
  const json = { nextCursorMark: "abc", resultList: { result: [
    { id: "1", source: "MED", pmcid: "PMC1", title: "T one.", abstractText: "<p>" + EN + "</p>", license: "cc by", pubYear: "2020", doi: "10/x", journalInfo: { journal: { title: "J" } } },
    { id: "2", source: "MED", title: "No lic", abstractText: EN },
    { id: "3", source: "MED", title: "No abs", license: "cc by" },
  ] } };
  const p = epmc.parseResults(json);
  assert.strictEqual(p.recs.length, 1);
  assert.strictEqual(p.recs[0].rawId, "PMC1");
  assert.strictEqual(p.recs[0].title, "T one");
  assert.strictEqual(p.recs[0].journal, "J");
  assert.strictEqual(p.next, "abc");
  assert.ok(epmc.buildQuery('"x"').includes("OPEN_ACCESS:y"));
});

test("arxiv parseAtom", () => {
  const xml = `<feed><opensearch:totalResults>500</opensearch:totalResults>
<entry><id>http://arxiv.org/abs/2101.00001v2</id><published>2021-01-01T00:00:00Z</published>
<title>Some
  Title</title><summary>  ${EN} </summary>
<arxiv:primary_category term="cs.LG"/><arxiv:doi>10.1/abc</arxiv:doi></entry></feed>`;
  const p = arxiv.parseAtom(xml);
  assert.strictEqual(p.total, 500);
  assert.strictEqual(p.recs[0].rawId, "2101.00001");
  assert.strictEqual(p.recs[0].title, "Some Title");
  assert.strictEqual(p.recs[0].year, 2021);
  assert.strictEqual(p.recs[0].journal, "arXiv cs.LG");
  assert.strictEqual(p.recs[0].doi, "10.1/abc");
});

test("s2 parseBulk requires abstract and open access", () => {
  const p = s2.parseBulk({ token: "tk", data: [
    { paperId: "p1", title: "T", abstract: EN, year: 2019, venue: "V", isOpenAccess: true, externalIds: { DOI: "10/y" }, openAccessPdf: { license: "CCBY" } },
    { paperId: "p2", title: "T", abstract: null, isOpenAccess: true },
    { paperId: "p3", title: "T", abstract: EN, isOpenAccess: false },
  ] });
  assert.strictEqual(p.recs.length, 1);
  assert.strictEqual(p.recs[0].license, "CCBY");
  assert.strictEqual(p.next, "tk");
  assert.ok(s2.buildUrl({ q: '"x"', fos: "Law" }, null).includes("search/bulk"));
});

test("makeFetcher backs off exponentially on 429 and stops at cap", async () => {
  const sleeps = [];
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: false, status: 429, headers: { get: () => null } }; };
  const f = C.makeFetcher({ delayMs: 0, maxRequests: 100, backoffBaseMs: 1000, maxRetries: 3, fetchImpl, sleepImpl: async (ms) => sleeps.push(ms) });
  await assert.rejects(() => f.get("http://x"), (e) => e.fatal === true);
  assert.strictEqual(calls, 4);
  assert.deepStrictEqual(sleeps.filter((s) => s >= 1000), [1000, 2000, 4000]);
  const g = C.makeFetcher({ delayMs: 0, maxRequests: 0, fetchImpl, sleepImpl: async () => {} });
  await assert.rejects(() => g.get("http://x"), (e) => e.fatal === true);
});
