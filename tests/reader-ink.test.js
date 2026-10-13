const test = require("node:test");
const assert = require("assert");
const { columnInk, gaps, snapEdge } = require("../assets/reader/ink.js");

// 합성 띠: 한 줄 높이 h, 폭 W. words = [[시작,끝)...] 열 범위에 잉크를 칠한다.
function band(W, h, words, dark) {
  const bgv = dark ? 20 : 250, fg = dark ? 235 : 10;
  const data = new Uint8ClampedArray(W * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    let v = bgv;
    for (const [a, b] of words) if (x >= a && x < b && y > 2 && y < h - 2) v = fg;
    const p = (y * W + x) * 4;
    data[p] = data[p + 1] = data[p + 2] = v; data[p + 3] = 255;
  }
  return { data, width: W, height: h };
}
const WORD = [[40, 80]]; // 낱말 잉크 열 40..79
const run = (img, minGap) => gaps(columnInk(img, 0, 0, img.width, img.height), minGap);

test("columnInk: 잉크 열만 1", () => {
  const c = columnInk(band(120, 12, WORD), 0, 0, 120, 12);
  assert.strictEqual(c.length, 120);
  for (let x = 0; x < 120; x++) assert.strictEqual(c[x], x >= 40 && x < 80 ? 1 : 0);
});

test("columnInk: 부분 구간(x0,w)은 구간 기준 인덱스", () => {
  const c = columnInk(band(120, 12, WORD), 30, 0, 60, 12);
  assert.strictEqual(c.length, 60);
  assert.strictEqual(c[9], 0); assert.strictEqual(c[10], 1); assert.strictEqual(c[49], 1); assert.strictEqual(c[50], 0);
});

test("gaps: 양 끝 빈 구간도 틈, 짧은 안쪽 틈은 무시", () => {
  const col = new Uint8Array(30);
  col.fill(1, 10, 14); col.fill(1, 16, 20); // 안쪽 틈 [14,16) 폭 2
  assert.deepStrictEqual(gaps(col, 5), [{ start: 0, end: 10 }, { start: 20, end: 30 }]);
  assert.deepStrictEqual(gaps(col, 2), [{ start: 0, end: 10 }, { start: 14, end: 16 }, { start: 20, end: 30 }]);
});

test("왼쪽 가장자리: 잉크 3px 안쪽 -> 잉크 시작으로", () => {
  const g = run(band(120, 12, WORD), 5);
  assert.strictEqual(snapEdge(43, g, 8, "left"), 40);
});
test("오른쪽 가장자리: 잉크 3px 안쪽 -> 잉크 끝으로", () => {
  const g = run(band(120, 12, WORD), 5);
  assert.strictEqual(snapEdge(77, g, 8, "right"), 80);
});
test("왼쪽 가장자리: 잉크 3px 바깥(틈 안) -> 조임", () => {
  const g = run(band(120, 12, WORD), 5);
  assert.strictEqual(snapEdge(37, g, 8, "left"), 40);
});
test("오른쪽 가장자리: 잉크 3px 바깥 -> 조임", () => {
  const g = run(band(120, 12, WORD), 5);
  assert.strictEqual(snapEdge(83, g, 8, "right"), 80);
});
test("가장 가까운 틈이 maxMove 보다 멀면 그대로", () => {
  const g = run(band(120, 12, WORD), 5);
  assert.strictEqual(snapEdge(50, g, 8, "left"), 50);
  assert.strictEqual(snapEdge(50, g, 8, "right"), 50);
});
test("조건에 맞는 틈이 없으면 그대로", () => {
  assert.strictEqual(snapEdge(43, [], 8, "left"), 43);
  const full = new Uint8Array(60).fill(1);
  assert.strictEqual(snapEdge(30, gaps(full, 5), 20, "right"), 30);
});
test("어두운 바탕 + 밝은 글자도 같은 결과", () => {
  const a = run(band(120, 12, WORD, false), 5);
  const b = run(band(120, 12, WORD, true), 5);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(snapEdge(43, b, 8, "left"), 40);
  assert.strictEqual(snapEdge(77, b, 8, "right"), 80);
});
test("글자 사이 좁은 틈(minGap 미만)은 무시: 낱말 한가운데로 끌려가지 않는다", () => {
  // 한글 낱말처럼 음절 사이 2px 틈, 낱말 사이 12px
  const hangul = [[40, 52], [54, 66], [68, 80]];
  const g = run(band(140, 12, hangul), 6);
  assert.strictEqual(snapEdge(53, g, 8, "left"), 53); // 음절 사이 근처: 8px 안에 낱말 시작(40)은 13 떨어져 있어 그대로
  assert.strictEqual(snapEdge(43, g, 8, "left"), 40);
  assert.strictEqual(snapEdge(77, g, 8, "right"), 80);
  // minGap 이 너무 작으면 음절 사이 틈으로 끌려간다(이 시험이 minGap 의 필요성을 보인다)
  const g2 = run(band(140, 12, hangul), 2);
  assert.strictEqual(snapEdge(55, g2, 8, "left"), 54);
});
test("좌우 대칭: 거울상 띠에서 대칭인 결과", () => {
  const W = 120;
  const g = run(band(W, 12, WORD), 5);
  const gm = run(band(W, 12, [[W - 80, W - 40]]), 5); // 거울상
  for (const d of [-6, -3, 0, 3, 6]) {
    const l = snapEdge(40 + d, g, 8, "left");
    const r = snapEdge(W - (40 + d), gm, 8, "right");
    assert.strictEqual(W - r, l);
  }
});
