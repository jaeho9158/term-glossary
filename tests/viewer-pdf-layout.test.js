const assert = require("assert");
const { computeFitPageScale, clampPdfScale, clampPdfPageNumber } = require("../assets/viewer.js");

const MIN = 0.5;
const MAX = 3;

// 페이지맞춤: 세로가 더 빡빡한 일반적인 A4/레터 페이지에서는 높이 기준 배율이
// 선택돼야 한다. 그래야 한 페이지가 통째로 보인다.
{
  const scale = computeFitPageScale(612, 792, 600, 700, MIN, MAX, 1.5);
  assert.ok(Math.abs(scale - 700 / 792) < 1e-9, "세로가 더 빡빡하면 높이 기준");
  assert.ok(612 * scale <= 600 + 1e-9, "너비도 넘치지 않아야 한다");
}

// 가로로 긴 뷰어(넓고 낮음)에서는 여전히 높이가 제약이지만, 반대로 좁고 높은
// 뷰어에서는 너비 기준이 선택돼야 한다.
{
  const scale = computeFitPageScale(612, 792, 400, 2000, MIN, MAX, 1.5);
  assert.ok(Math.abs(scale - 400 / 612) < 1e-9, "좁고 높은 뷰어는 너비 기준");
}

// 뷰어가 아직 렌더되지 않아 크기가 0이면 계산이 불가능하므로 fallback 유지.
{
  assert.strictEqual(computeFitPageScale(612, 792, 0, 0, MIN, MAX, 1.5), 1.5);
  assert.strictEqual(computeFitPageScale(0, 0, 600, 700, MIN, MAX, 1.5), 1.5);
  assert.strictEqual(computeFitPageScale(612, 792, 0, 700, MIN, MAX), 1, "fallback 기본값은 1");
}

// 아주 작은 페이지가 과하게 확대되거나, 거대한 페이지가 과하게 축소되지 않도록
// 줌 버튼과 같은 상·하한을 적용한다.
{
  assert.strictEqual(computeFitPageScale(10, 10, 600, 700, MIN, MAX, 1.5), MAX);
  assert.strictEqual(computeFitPageScale(10000, 10000, 600, 700, MIN, MAX, 1.5), MIN);
}

// clampPdfScale: 줌 ±버튼이 범위를 벗어나도 안전해야 한다.
{
  assert.strictEqual(clampPdfScale(0.1, MIN, MAX), MIN);
  assert.strictEqual(clampPdfScale(10, MIN, MAX), MAX);
  assert.strictEqual(clampPdfScale(1.25, MIN, MAX), 1.25);
  assert.strictEqual(clampPdfScale(NaN, MIN, MAX), MIN, "NaN은 최소값으로");
}

// 페이지 번호 입력 clamp: 빈 값·0·음수·범위 초과·소수 모두 유효 범위로.
{
  assert.strictEqual(clampPdfPageNumber(5, 10), 5);
  assert.strictEqual(clampPdfPageNumber("7", 10), 7);
  assert.strictEqual(clampPdfPageNumber(0, 10), 1);
  assert.strictEqual(clampPdfPageNumber(-3, 10), 1);
  assert.strictEqual(clampPdfPageNumber(99, 10), 10);
  assert.strictEqual(clampPdfPageNumber("", 10), 1, "빈 입력은 1쪽");
  assert.strictEqual(clampPdfPageNumber("abc", 10), 1);
  assert.strictEqual(clampPdfPageNumber(3.7, 10), 3, "소수는 내림");
  assert.strictEqual(clampPdfPageNumber(2, 0), 1, "전체 쪽수가 비정상이면 1쪽");
}

console.log("viewer-pdf-layout: ok");
