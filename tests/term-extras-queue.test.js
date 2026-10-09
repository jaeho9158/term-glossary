// scripts/term-extras-queue.js : 큐 구성(보관·스텁·완료 제외, 조회수순) 검사.
const test = require("node:test");
const assert = require("node:assert");
const { buildQueue, fieldCounts } = require("../scripts/term-extras-queue.js");

test("큐: 보관·스텁·이미 데이터 있는 용어 제외, 조회수 내림차순, 필드·limit 옵션", () => {
  const all = buildQueue();
  assert.ok(all.length > 3000);
  const slugs = new Set(all.map((r) => r.slug));
  assert.ok(!slugs.has("p-value") && !slugs.has("cohens-d"), "파일럿 완료분은 제외");
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].views >= all[i].views, "조회수 정렬");
  assert.deepStrictEqual(Object.keys(all[0]), ["slug", "title_ko", "title_en", "field", "views"]);
  const psych = buildQueue({ field: "psych", limit: 5 });
  assert.strictEqual(psych.length, 5);
  assert.ok(psych.every((r) => r.field === "psych"));
  assert.strictEqual(fieldCounts(all).reduce((a, [, n]) => a + n, 0), all.length);
});
