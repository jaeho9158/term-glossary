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
  assert.deepStrictEqual(snapToWords("가나 다라", 3, 5), { start: 3, end: 5 });
  // 빈 범위·범위 밖
  assert.deepStrictEqual(snapToWords("가나", 1, 1), { start: 1, end: 1 });
  assert.deepStrictEqual(snapToWords("가나 다", -5, 99), { start: 0, end: 4 });
  assert.deepStrictEqual(snapToWords("", 0, 3), { start: 0, end: 0 });
}

// 앞뒤 공백은 결과에서 뺀다
assert.deepStrictEqual(snapToWords(" 감염", 0, 2), { start: 1, end: 3 });
assert.deepStrictEqual(snapToWords("감염 ", 0, 3), { start: 0, end: 2 });
assert.deepStrictEqual(snapToWords("가 나 다", 1, 4), { start: 2, end: 3 });
// 공백뿐인 범위·빈 범위는 그대로(start === end 의미 유지)
assert.deepStrictEqual(snapToWords("가나  다라", 2, 4), { start: 2, end: 4 });
assert.deepStrictEqual(snapToWords("가나 다라", 2, 2), { start: 2, end: 2 });
assert.deepStrictEqual(snapToWords("가나 다라", 4, 2), { start: 4, end: 4 });
// 줄바꿈은 언제나 낱말 경계: 이웃 줄의 낱말을 끌어들이지 않는다
{
  const t0 = "했다\n그리고";
  assert.deepStrictEqual(snapToWords(t0, 4, 6), { start: 3, end: 6 });
  const t = "가나\n다라\n마바\n사아";
  const r = snapToWords(t, 4, 5);
  assert.strictEqual(t.slice(r.start, r.end), "다라");
  const r2 = snapToWords(t, 7, 8);
  assert.strictEqual(t.slice(r2.start, r2.end), "마바");
  const r3 = snapToWords(t0, 1, 5); // 했다 안쪽 ~ 그리고 안쪽
  assert.strictEqual(t0.slice(r3.start, r3.end), "했다\n그리고");
  const r4 = snapToWords(t0, 0, 2); // 줄 끝에서 정확히 끝남
  assert.strictEqual(t0.slice(r4.start, r4.end), "했다");
}
// 줄 끝에서 정확히 끝나거나 줄 처음에서 시작하는 범위는 이웃 줄로 끌려가지 않는다
assert.deepStrictEqual(snapToWords("마약류\n범죄 관리", 0, 3), { start: 0, end: 3 });
assert.deepStrictEqual(snapToWords("마약류\n범죄 관리", 4, 6), { start: 4, end: 6 });

// 괄호는 낱말 확장을 멈춘다.
function snapped(text, word) {
  const i = text.indexOf(word);
  const r = snapToWords(text, i, i + word.length);
  return text.slice(r.start, r.end);
}
assert.strictEqual(snapped("국제 기구는 있다(UNODC, 이다", "UNODC"), "UNODC");
assert.strictEqual(snapped("세계보건기구(WHO)의 설립", "WHO"), "WHO");
assert.strictEqual(snapped("분류(ICD)에서는 쓴다", "ICD"), "ICD");
assert.strictEqual(snapped("세계보건기구(WHO)의 설립", "세계보건기구"), "세계보건기구");
assert.strictEqual(snapped("세계보건기구(WHO)의 설립", "의"), "의");
assert.strictEqual(snapped("그는 「법률」을 봤다", "법률"), "법률");
assert.strictEqual(snapped("I don’t know", "don"), "don’t", "낱말 속 아포스트로피는 괄호가 아니다");
assert.strictEqual(snapped("끝 문장이다. 다음", "이다"), "문장이다".slice(2) === "이다" ? "문장이다" : "", "마침표가 없으면 어절 전체");
assert.strictEqual(snapped("앞 단어, 뒤", "단"), "단어", "끝의 쉼표는 뺀다");
assert.strictEqual(snapped("앞 단어. 뒤", "단"), "단어", "끝의 마침표는 뺀다");

// 제어 문자(U+0000)는 공백처럼 낱말 경계다.
{
  const t = "치매 환자 수";
  const r = snapToWords(t, 3, 4);
  assert.strictEqual(t.slice(r.start, r.end), "환자");
}

// 같은 줄에서 앞 덩어리 안쪽에서 시작해 겹치는 조각은 하나로 잇는다(조각 상자가 글자보다 넓은 PDF: 겹친 채 따로 그리면 곱하기 섞임으로 진해진다).
{
  const boxes = [
    { x: 0, y: 0, w: 80, h: 10, p: 1 },
    { x: 40, y: 0, w: 80, h: 10, p: 2 }, // 앞 조각 안쪽에서 시작해 오른쪽으로 더 간다
    { x: 100, y: 0, w: 60, h: 10, p: 3 },
  ];
  assert.deepStrictEqual(rangeRects(boxes, 0, 3), [{ x: 0, y: 0, w: 160, h: 10 }]);
  // 앞 덩어리보다 왼쪽에서 시작하는 것(다른 단)은 잇지 않는다.
  const back = [{ x: 200, y: 0, w: 40, h: 10, p: 1 }, { x: 20, y: 0, w: 40, h: 10, p: 2 }];
  assert.strictEqual(rangeRects(back, 0, 2).length, 2);
}

// text 를 주면 사이가 공백뿐인 같은 줄 조각은 간격이 커도(겹공백) 하나로 잇는다. 줄바꿈은 건너지 않는다. 글자가 끼면 잇지 않는다.
{
  const mk = () => [{ x: 0, y: 0, w: 20, h: 10, p: 1 }, null, null, { x: 40, y: 0, w: 20, h: 10, p: 2 }];
  assert.strictEqual(rangeRects(mk(), 0, 4).length, 2, "text 없이는 기존대로 끊긴다");
  assert.deepStrictEqual(rangeRects(mk(), 0, 4, "가  나"), [{ x: 0, y: 0, w: 60, h: 10 }]);
  assert.strictEqual(rangeRects(mk(), 0, 4, "가\n 나").length, 2, "줄바꿈이 있으면 잇지 않는다");
  assert.strictEqual(rangeRects(mk(), 0, 4, "가XY나").length, 2, "공백이 아닌 글자가 있으면 잇지 않는다");
  // 너무 멀리 벌어지면(탭 리더·단 사이) 공백뿐이어도 끊는다
  const far = [{ x: 0, y: 0, w: 20, h: 10, p: 1 }, null, { x: 120, y: 0, w: 20, h: 10, p: 2 }];
  assert.strictEqual(rangeRects(far, 0, 3, "가 나").length, 2);
}

console.log("reader-geometry: all tests passed");
