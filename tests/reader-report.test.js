const test = require("node:test");
const assert = require("node:assert");
const { buildPayload, contextAround, createReportGuard, CAP } = require("../assets/reader/report.js");

test("contextAround: 앞뒤 100자 창, 끝에서 잘림", () => {
  const text = "가".repeat(300) + "용어" + "나".repeat(300);
  const c = contextAround(text, 300, 302);
  assert.strictEqual(c.length, 202);
  assert.ok(c.includes("용어"));
  assert.strictEqual(contextAround("짧은 글", 0, 2), "짧은 글");
  assert.strictEqual(contextAround("abc", -1, 2), null);
});

test("buildPayload: 길이 상한과 빈 값", () => {
  const p = buildPayload({ slug: "s".repeat(500), surface: "x".repeat(500), docField: "f".repeat(99), pageUrl: "u".repeat(999), text: "a".repeat(2000), start: 1000, end: 1010 });
  assert.strictEqual(p.slug.length, CAP.slug);
  assert.strictEqual(p.surface.length, CAP.surface);
  assert.strictEqual(p.doc_field.length, CAP.doc_field);
  assert.strictEqual(p.page_url.length, CAP.page_url);
  assert.ok(p.context.length <= CAP.context);
  const q = buildPayload({ slug: "a", text: "가나다라", start: 1, end: 3 });
  assert.strictEqual(q.surface, "나다");
  assert.strictEqual(q.context, "가나다라");
  assert.strictEqual(q.reason, null);
  assert.deepStrictEqual(Object.keys(q).sort(), ["context", "doc_field", "page_url", "reason", "slug", "surface"]);
});

test("createReportGuard: 같은 용어·쪽은 한 번, 저장소에 이어짐", () => {
  const data = {};
  const store = { getItem: (k) => data[k] || null, setItem: (k, v) => { data[k] = v; } };
  const g = createReportGuard(store);
  assert.strictEqual(g.sent("a", 1), false);
  g.mark("a", 1);
  assert.strictEqual(g.sent("a", 1), true);
  assert.strictEqual(g.sent("a", 2), false);
  assert.strictEqual(createReportGuard(store).sent("a", 1), true);
  g.unmark("a", 1);
  assert.strictEqual(g.sent("a", 1), false);
});
