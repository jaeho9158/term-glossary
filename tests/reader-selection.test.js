const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeRanges } = require("../assets/reader/selection.js");

test("쪽마다 정렬하고 쪽 오름차순으로 돌려준다", () => {
  assert.deepEqual(
    normalizeRanges([{ page: 2, a: 10, b: 3 }, { page: 1, a: 5, b: 9 }]),
    [{ page: 1, start: 5, end: 9 }, { page: 2, start: 3, end: 10 }]
  );
});

test("a === b 인 조각은 버리고 전부 버려지면 빈 배열", () => {
  assert.deepEqual(normalizeRanges([{ page: 1, a: 4, b: 4 }]), []);
  assert.deepEqual(normalizeRanges([{ page: 1, a: 4, b: 4 }, { page: 2, a: 0, b: 0 }]), []);
  assert.deepEqual(
    normalizeRanges([{ page: 1, a: 4, b: 4 }, { page: 2, a: 1, b: 3 }]),
    [{ page: 2, start: 1, end: 3 }]
  );
});

test("같은 쪽 조각이 둘이면 합친 최소~최대 하나", () => {
  assert.deepEqual(
    normalizeRanges([{ page: 1, a: 20, b: 30 }, { page: 1, a: 5, b: 8 }]),
    [{ page: 1, start: 5, end: 30 }]
  );
});

test("쪽이 잘못됐거나 숫자가 아닌 조각은 버린다", () => {
  assert.deepEqual(normalizeRanges(null), []);
  assert.deepEqual(normalizeRanges([null, { page: 0, a: 1, b: 2 }, { page: 1, a: "x", b: 2 }, { page: 1, a: NaN, b: 2 }]), []);
});
