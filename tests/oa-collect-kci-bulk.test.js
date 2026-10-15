const test = require("node:test");
const assert = require("node:assert");
const { buildTasks, pickNext, makeRecord, redactWith } = require("../scripts/oa/collect-kci-bulk.js");

test("buildTasks: 질의어 x 연도, 고유 키", () => {
  const t = buildTasks("math", "수학 통계");
  assert.ok(t.length >= 10);
  assert.strictEqual(new Set(t.map((x) => x.key)).size, t.length);
});
test("pickNext: 부족한 분야 우선, 목표 도달 분야와 완료 작업 건너뜀", () => {
  const queues = { a: [{ key: "a1" }], b: [{ key: "b1" }, { key: "b2" }] };
  const done = new Set(["b1"]);
  assert.strictEqual(pickNext(queues, { a: 5, b: 1 }, 10, done).key, "b2");
  assert.strictEqual(pickNext(queues, { a: 10, b: 10 }, 10, done), null);
});
test("makeRecord 형태와 redact", () => {
  const r = makeRecord({ id: "X", journal: "J", title: "T", year: 2020, url: "u", citations: 1 }, "math", "q");
  assert.strictEqual(r.id, "kci-X"); assert.strictEqual(r.lang, "ko"); assert.strictEqual(r.sampling, "neutral");
  assert.strictEqual(redactWith("sekret")("a sekret b"), "a <KEY> b");
});
