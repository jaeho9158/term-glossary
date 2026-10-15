const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const c = require("../scripts/oa/collect-openalex.js");

test("inverted index -> text", () => {
  assert.strictEqual(c.invertedToText({ world: [1], Hello: [0], again: [2, 3] }), "Hello world again again");
  assert.strictEqual(c.invertedToText(null), "");
});
test("field mapping covers every category code", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "assets", "category-data.js"), "utf8");
  const g = Function(`return ${src.match(/const CATEGORY_GROUPS = (\[[\s\S]*?\n\s*\]);/)[1]}`)();
  for (const code of g.flatMap((x) => x.codes)) assert.ok(c.fieldIds(code), code);
  assert.strictEqual(c.fieldIds("nursing"), "29");
});
test("workToRecord filters and shapes", () => {
  const inv = {};
  for (let i = 0; i < 60; i++) inv["word" + i] = [i];
  const w = { id: "https://openalex.org/W123", title: "T", language: "en", publication_year: 2020, abstract_inverted_index: inv,
    primary_location: { source: { display_name: "J" }, license: "cc-by" }, open_access: { oa_url: "http://x" } };
  const r = c.workToRecord(w, "med");
  assert.strictEqual(r.meta.id, "oalex-W123");
  assert.deepStrictEqual([r.meta.source, r.meta.lang, r.meta.field, r.meta.license], ["openalex", "en", "med", "cc-by"]);
  assert.strictEqual(c.workToRecord({ ...w, language: "ko" }, "med"), null);
  assert.strictEqual(c.workToRecord({ ...w, abstract_inverted_index: { a: [0] } }, "med"), null);
});
test("queryTitles filters by category and is deterministic", () => {
  const terms = [{ title_en: "Mean Square", categories: ["stat"] }, { title_en: "한글", categories: ["stat"] }, { title_en: "Gene", categories: ["bio"] }];
  assert.deepStrictEqual(c.queryTitles(terms, "stat"), ["mean square"]);
});
test("loadKnown resumes from index", () => {
  const f = path.join(os.tmpdir(), `oa-idx-${process.pid}.jsonl`);
  fs.writeFileSync(f, '{"id":"oalex-W1","source":"openalex","field":"med"}\n{"id":"kci-1","source":"kci","field":"med"}\n');
  const { known, perCode } = c.loadKnown(f);
  fs.unlinkSync(f);
  assert.ok(known.has("oalex-W1"));
  assert.deepStrictEqual(perCode, { med: 1 });
});
