// assets/reader/doc.js 의 순수 부분(planWindow) 검증.
const test = require("node:test");
const assert = require("node:assert");
const { planWindow, anchorScrollTop, anchorOf } = require("../assets/reader/doc.js");

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

test("anchorOf: 문서 맨 위(쪽 윗변이 칸 안, 위 여백 16px)에서 줄여도 scrollTop 이 0 으로 돌아온다", () => {
  // 확대 전: scrollTop 0, 쪽 1 윗변이 칸 윗변에서 16px 아래
  const a = anchorOf(16, 1000);
  const pageTopAfter = 16; // 쪽 1 은 위 여백 16px 뒤에서 시작한다
  const newHeight = 500; // 줄였다
  assert.strictEqual(anchorScrollTop(pageTopAfter, newHeight, a.ratio, a.offset), 0);
  // 예전 식(비율만): 줄이면 위 여백 일부가 남았다
  assert.ok(anchorScrollTop(pageTopAfter, newHeight, -16 / 1000, 0) > 0);
});

test("anchorOf: 쪽 안을 읽는 중이면 쪽 비율을 지킨다", () => {
  assert.deepStrictEqual(anchorOf(-200, 800), { ratio: 0.25, offset: 0 });
  assert.deepStrictEqual(anchorOf(0, 800), { ratio: -0, offset: 0 });
});
