// 도식 생성 파이프라인 도구
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");

// ── 분야군: 98개 분야가 정확히 한 번씩 ─────────────────────
{
  const { GROUPS, groupOf } = require("../scripts/diagrams/pipeline/common.js");
  const src = fs.readFileSync(path.join(REPO, "assets", "category-data.js"), "utf8");
  const labels = eval("(" + src.match(/CATEGORY_LABELS\s*=\s*(\{[\s\S]*?\});/)[1] + ")");
  const all = Object.values(GROUPS).flat();
  assert.strictEqual(new Set(all).size, all.length, "분야가 두 군에 들어 있음");
  assert.deepStrictEqual([...all].sort(), Object.keys(labels).sort(), "분야군이 CATEGORY_LABELS와 다름");
  assert.strictEqual(Object.keys(GROUPS).length, 12);
  assert.strictEqual(groupOf(["stat", "psych"]), "stats");
  assert.strictEqual(groupOf("neuro"), "life");
  assert.strictEqual(groupOf(["nope"]), null);
}

// ── 시드 셔플은 재현된다 ───────────────────────────────────
{
  const { shuffle } = require("../scripts/diagrams/pipeline/common.js");
  const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], 42), b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], 42);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual([...a].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.notDeepStrictEqual(shuffle([1, 2, 3, 4, 5, 6, 7, 8], 43), a);
}

console.log("diagrams-pipeline: all tests passed");
