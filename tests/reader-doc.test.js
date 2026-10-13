// assets/reader/doc.js 의 순수 부분(planWindow) 검증.
const test = require("node:test");
const assert = require("node:assert");
const { planWindow, anchorScrollTop } = require("../assets/reader/doc.js");

test("planWindow: 가운데 쪽은 앞뒤 radius만큼", () => {
  assert.deepStrictEqual(planWindow(5, 20, 2), [3, 4, 5, 6, 7]);
});

test("planWindow: 처음과 끝에서 범위를 넘지 않는다", () => {
  assert.deepStrictEqual(planWindow(1, 20, 2), [1, 2, 3]);
  assert.deepStrictEqual(planWindow(20, 20, 2), [18, 19, 20]);
});

test("planWindow: 한 쪽 문서와 빈 문서", () => {
  assert.deepStrictEqual(planWindow(1, 1, 2), [1]);
  assert.deepStrictEqual(planWindow(0, 0, 2), []);
});

test("anchorScrollTop: 기하가 그대로면 원래 scrollTop 을 정확히 되돌린다", () => {
  // 쪽 윗변 1000, 높이 800, scrollTop 1400 → 쪽 안 비율 0.5, 칸 윗변에서 0
  const ratio = (1400 - 1000) / 800;
  assert.strictEqual(anchorScrollTop(1000, 800, ratio, 0), 1400);
  assert.strictEqual(anchorScrollTop(1000, 800, 0, 0), 1000);
});

test("anchorScrollTop: 쪽 높이가 두 배가 돼도 같은 지점이 같은 칸 위치에 남는다", () => {
  const top = 1000, h = 800, scrollTop = 1400, off = 30;
  const ratio = (scrollTop + off - top) / h;
  const next = anchorScrollTop(top * 2, h * 2, ratio, off);
  assert.strictEqual(next + off - top * 2, ratio * h * 2);
  assert.strictEqual(next, 2830);
});
