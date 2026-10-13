const assert = require("assert");
const { charWeights, splitWidth, rangeRects, hitTest, unionRect, snapToWords } = require("../assets/reader/geometry.js");

function row(xs, w, y, h, p) {
  return xs.map((x) => (p === undefined ? { x, y, w, h } : { x, y, w, h, p }));
}

// splitWidth
assert.deepStrictEqual(splitWidth(100, [1, 1, 1, 1]), [0, 25, 50, 75, 100]);
assert.deepStrictEqual(splitWidth(0, []), [0]);
{
  const b = splitWidth(90, [1, 0.5, 0.5]);
  assert.strictEqual(b.length, 4);
  assert.strictEqual(b[0], 0);
  assert.strictEqual(b[3], 90);
  assert.ok(Math.abs(b[1] - 45) < 1e-9);
}

// charWeights: 한글 1, 라틴 대문자 0.7, 공백 0.3, 소문자 0.55, 그 밖 0.5
assert.deepStrictEqual(charWeights("가A a"), [1, 0.7, 0.3, 0.55]);
assert.deepStrictEqual(charWeights("7,漢あ"), [0.55, 0.5, 1, 1]);
assert.deepStrictEqual(charWeights(""), []);

// rangeRects: 한 줄 5글자 중 (1,4)
{
  const boxes = row([0, 10, 20, 30, 40], 10, 0, 12);
  assert.deepStrictEqual(rangeRects(boxes, 1, 4), [{ x: 10, y: 0, w: 30, h: 12 }]);
}

// 두 줄에 걸친 범위 -> 사각형 2개
{
  const boxes = row([0, 10, 20], 10, 0, 12).concat(row([0, 10, 20], 10, 20, 12));
  const rects = rangeRects(boxes, 1, 5);
  assert.strictEqual(rects.length, 2);
  assert.deepStrictEqual(rects[0], { x: 10, y: 0, w: 20, h: 12 });
  assert.deepStrictEqual(rects[1], { x: 0, y: 20, w: 20, h: 12 });
}

// Review Focus 1: 같은 y 에서 왼쪽 단(x 0~40)과 오른쪽 단(x 300~340)이 이어진 배열
for (const withPiece of [false, true]) {
  const left = row([0, 10, 20, 30], 10, 100, 12, withPiece ? 1 : undefined);
  const right = row([300, 310, 320, 330], 10, 100, 12, withPiece ? 2 : undefined);
  const boxes = left.concat(right);
  const rects = rangeRects(boxes, 0, boxes.length);
  assert.strictEqual(rects.length, 2, "단 사이 여백은 끊는다");
  for (const r of rects) {
    const covers = r.x < 300 && r.x + r.w > 40;
    assert.ok(!covers, "어느 사각형도 x 40~300 구간을 덮지 않는다");
  }
  assert.deepStrictEqual(rects[0], { x: 0, y: 100, w: 40, h: 12 });
  assert.deepStrictEqual(rects[1], { x: 300, y: 100, w: 40, h: 12 });
}

// 서로 다른 조각이라도 같은 줄에서 간격이 글자 높이의 0.6 미만이면 하나
{
  const a = row([0, 10], 10, 0, 12, 1);
  const b = row([24, 34], 10, 0, 12, 2); // 간격 4 < 7.2
  const rects = rangeRects(a.concat(b), 0, 4);
  assert.deepStrictEqual(rects, [{ x: 0, y: 0, w: 44, h: 12 }]);
  const c = row([40, 50], 10, 0, 12, 2); // 간격 20 >= 7.2
  assert.strictEqual(rangeRects(a.concat(c), 0, 4).length, 2);
}

// null 상자는 건너뛴다. 오류 없음.
{
  const boxes = [{ x: 0, y: 0, w: 10, h: 12 }, null, { x: 10, y: 0, w: 10, h: 12 }, null, { x: 20, y: 0, w: 10, h: 12 }];
  const rects = rangeRects(boxes, 0, 5);
  assert.deepStrictEqual(rects, [{ x: 0, y: 0, w: 30, h: 12 }]);
  assert.deepStrictEqual(rangeRects([null, null], 0, 2), []);
}

// 빈 범위, 범위가 배열을 넘는 경우
{
  const boxes = row([0, 10, 20], 10, 0, 12);
  assert.deepStrictEqual(rangeRects(boxes, 2, 2), []);
  assert.deepStrictEqual(rangeRects(boxes, 3, 1), []);
  assert.deepStrictEqual(rangeRects(boxes, -5, 99), [{ x: 0, y: 0, w: 30, h: 12 }]);
  assert.deepStrictEqual(rangeRects([], 0, 3), []);
  assert.deepStrictEqual(rangeRects(null, 0, 3), []);
}

// hitTest
{
  const boxes = [{ x: 0, y: 0, w: 10, h: 12 }, null, { x: 20, y: 0, w: 10, h: 12 }];
  assert.strictEqual(hitTest(boxes, 5, 6), 0);
  assert.strictEqual(hitTest(boxes, 25, 6), 2);
  assert.strictEqual(hitTest(boxes, 15, 6), -1);
  assert.strictEqual(hitTest(boxes, 5, 50), -1);
  assert.strictEqual(hitTest([], 1, 1), -1);
}

// unionRect
{
  assert.strictEqual(unionRect([]), null);
  assert.strictEqual(unionRect(null), null);
  assert.deepStrictEqual(unionRect([{ x: 0, y: 0, w: 10, h: 5 }, { x: 20, y: 10, w: 10, h: 5 }]), { x: 0, y: 0, w: 30, h: 15 });
}

// snapToWords: 낱말(공백·줄바꿈 단위, 한글은 어절) 경계로 넓힌다
{
  const t = "청소년 마약류범죄에 대하여는\nthe drug-abuse policy";
  const at = (w) => t.indexOf(w);
  // 낱말 안쪽 -> 낱말 전체
  assert.deepStrictEqual(snapToWords(t, at("약류") , at("약류") + 2), { start: at("마약류범죄에"), end: at("마약류범죄에") + 6 });
  // 이미 경계면 그대로
  assert.deepStrictEqual(snapToWords(t, at("마약류범죄에"), at("마약류범죄에") + 6), { start: at("마약류범죄에"), end: at("마약류범죄에") + 6 });
  // 여러 낱말에 걸치면 양끝만 넓힌다
  assert.deepStrictEqual(snapToWords(t, at("범죄에") , at("하여는") + 2), { start: at("마약류범죄에"), end: at("대하여는") + 4 });
  // 줄바꿈도 경계
  assert.deepStrictEqual(snapToWords(t, at("하여는") + 1, at("하여는") + 3), { start: at("대하여는"), end: at("대하여는") + 4 });
  assert.deepStrictEqual(snapToWords(t, at("the") + 1, at("the") + 2), { start: at("the"), end: at("the") + 3 });
  // 하이픈 낱말은 하나로 본다
  assert.deepStrictEqual(snapToWords(t, at("drug") + 1, at("drug") + 2), { start: at("drug-abuse"), end: at("drug-abuse") + 10 });
  // 공백 위에서 시작·끝나면 넓히지 않는다
  assert.deepStrictEqual(snapToWords("가나 다라", 2, 5), { start: 2, end: 5 });
  // 빈 범위·범위 밖
  assert.deepStrictEqual(snapToWords("가나", 1, 1), { start: 1, end: 1 });
  assert.deepStrictEqual(snapToWords("가나 다", -5, 99), { start: 0, end: 4 });
  assert.deepStrictEqual(snapToWords("", 0, 3), { start: 0, end: 0 });
}

console.log("reader-geometry: all tests passed");
