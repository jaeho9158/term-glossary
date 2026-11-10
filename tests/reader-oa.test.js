const test = require("node:test");
const assert = require("node:assert");
const { parseOaInput, findDoi, findArxiv, topCited, oaPdfOf } = require("../assets/reader/oa.js");

test("parseOaInput: arXiv 번호·주소", () => {
  assert.deepStrictEqual(parseOaInput("1706.03762"), { type: "arxiv", id: "1706.03762" });
  assert.deepStrictEqual(parseOaInput(" arXiv:1706.03762v5 "), { type: "arxiv", id: "1706.03762v5" });
  assert.deepStrictEqual(parseOaInput("https://arxiv.org/abs/2301.12345"), { type: "arxiv", id: "2301.12345" });
  assert.deepStrictEqual(parseOaInput("arxiv.org/pdf/1706.03762v1.pdf"), { type: "arxiv", id: "1706.03762v1" });
  assert.deepStrictEqual(parseOaInput("https://doi.org/10.48550/arXiv.1706.03762"), { type: "arxiv", id: "1706.03762" });
});

test("parseOaInput: DOI·doi.org 주소, 잘못된 입력", () => {
  assert.deepStrictEqual(parseOaInput("10.1038/nature14539"), { type: "doi", doi: "10.1038/nature14539" });
  assert.deepStrictEqual(parseOaInput("doi: 10.1371/journal.pone.0001234."), { type: "doi", doi: "10.1371/journal.pone.0001234" });
  assert.deepStrictEqual(parseOaInput("https://dx.doi.org/10.1002/ABC%28x%29"), { type: "doi", doi: "10.1002/abc(x)" });
  assert.strictEqual(parseOaInput(""), null);
  assert.strictEqual(parseOaInput("attention is all you need"), null);
  assert.strictEqual(parseOaInput("11.1234/x"), null);
});

test("findDoi·findArxiv: 본문에서 찾는다", () => {
  assert.strictEqual(findDoi("Published ... https://doi.org/10.1016/J.CELL.2020.01.001, Elsevier"), "10.1016/j.cell.2020.01.001");
  assert.strictEqual(findDoi("(see 10.1000/xyz123)."), "10.1000/xyz123");
  assert.strictEqual(findDoi("no identifier here"), null);
  assert.strictEqual(findArxiv("arXiv:1706.03762v7 [cs.CL] 2 Aug 2023"), "1706.03762v7");
  assert.strictEqual(findArxiv("nothing"), null);
});

test("topCited: 인용 수 상위 3편, 같으면 원래 순서, 숫자 없는 항목 제외", () => {
  const ws = [{ id: "a", cited_by_count: 5 }, { id: "b", cited_by_count: 50 }, { id: "c" }, { id: "d", cited_by_count: 50 },
    { id: "e", cited_by_count: 1 }, { id: "f", cited_by_count: 7 }];
  assert.deepStrictEqual(topCited(ws).map((w) => w.id), ["b", "d", "f"]);
  assert.deepStrictEqual(topCited([{ id: "x", cited_by_count: 0 }]).map((w) => w.id), ["x"]);
  assert.deepStrictEqual(topCited(null), []);
});

test("oaPdfOf: PDF 주소와 공개 쪽", () => {
  assert.deepStrictEqual(oaPdfOf({ best_oa_location: { pdf_url: "p", landing_page_url: "l" } }), { pdf: "p", page: "l" });
  assert.deepStrictEqual(oaPdfOf({ best_oa_location: null, open_access: { oa_url: null } }), { pdf: null, page: null });
  assert.deepStrictEqual(oaPdfOf({ best_oa_location: { landing_page_url: "l" }, locations: [{ is_oa: false, pdf_url: "x" }, { is_oa: true, pdf_url: "r" }] }), { pdf: "r", page: "l" });
});
