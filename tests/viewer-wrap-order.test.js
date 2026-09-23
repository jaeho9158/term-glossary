const test = require("node:test");
const assert = require("node:assert");

const { orderRangesForWrapping } = require("../assets/viewer.js");

// wrapPageRange 에 오프셋 맵을 한 번 만들어 돌려 쓰려면 "시작 오프셋 내림차순"
// 이어야 한다. 이 불변식이 깨지면 하이라이트가 조용히 엉뚱한 자리에 그어지므로,
// 던지지 말고 console.error 로 알린 뒤 정렬해서 진행하는 것이 계약이다.

function captureErrors(fn) {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try {
    return { value: fn(), calls };
  } finally {
    console.error = original;
  }
}

test("orderRangesForWrapping: 내림차순이면 그대로 두고 아무 말도 하지 않는다", () => {
  const ranges = [{ startOffset: 40 }, { startOffset: 20 }, { startOffset: 5 }];
  const { value, calls } = captureErrors(() => orderRangesForWrapping(ranges));
  assert.deepStrictEqual(value.map((r) => r.startOffset), [40, 20, 5]);
  assert.strictEqual(calls.length, 0);
});

test("orderRangesForWrapping: 같은 오프셋이 이어져도 위반이 아니다", () => {
  const { value, calls } = captureErrors(() =>
    orderRangesForWrapping([{ startOffset: 9 }, { startOffset: 9 }, { startOffset: 1 }])
  );
  assert.deepStrictEqual(value.map((r) => r.startOffset), [9, 9, 1]);
  assert.strictEqual(calls.length, 0);
});

test("orderRangesForWrapping: 오름차순이면 알리고 내림차순으로 고쳐 준다", () => {
  const { value, calls } = captureErrors(() =>
    orderRangesForWrapping([{ startOffset: 3 }, { startOffset: 50 }, { startOffset: 12 }])
  );
  assert.deepStrictEqual(value.map((r) => r.startOffset), [50, 12, 3]);
  assert.strictEqual(calls.length, 1);
});

test("orderRangesForWrapping: 오프셋이 없는 항목은 버리고 빈 입력에도 안 터진다", () => {
  const { value } = captureErrors(() =>
    orderRangesForWrapping([null, { startOffset: "x" }, { startOffset: 7 }])
  );
  assert.deepStrictEqual(value.map((r) => r.startOffset), [7]);
  assert.deepStrictEqual(orderRangesForWrapping(null), []);
  assert.deepStrictEqual(orderRangesForWrapping([]), []);
});
