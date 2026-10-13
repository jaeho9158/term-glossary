// assets/reader/doc.js 의 순수 부분(planWindow) 검증.
const test = require("node:test");
const assert = require("node:assert");
const { planWindow } = require("../assets/reader/doc.js");

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
