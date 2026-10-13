const assert = require("assert");
const { joinTextItems } = require("../assets/term-match.js");
const { buildPageText, buildCharBoxes } = require("../assets/reader/text-map.js");

// tests/viewer-jointextitems.test.js 의 item() 도우미
function item(str, x, y, width, fontSize = 12, extra = {}) {
  return { str, transform: [fontSize, 0, 0, fontSize, x, y], width, ...extra };
}

const PAGE_W = 600;

// tests/viewer-jointextitems.test.js 의 입력 사례들: buildPageText().text === joinTextItems()
const cases = [
  { name: "한 낱말이 두 조각", items: [item("분산", 0, 700, 24, 12), item("분석", 24, 700, 24, 12)] },
  { name: "진짜 띄어쓰기", items: [item("결론이", 0, 700, 36, 12), item("근거에", 40, 700, 36, 12)] },
  { name: "다른 줄", items: [item("첫줄", 0, 700, 24, 12), item("둘째줄", 0, 680, 30, 12)] },
  { name: "이미 공백으로 시작", items: [item("결론이", 0, 700, 36, 12), item(" 근거에", 40, 700, 42, 12)] },
  {
    name: "두 단 섞임",
    w: PAGE_W,
    items: [
      item("좌1", 50, 700, 100), item("우1", 320, 700, 100),
      item("좌2", 50, 680, 100), item("우2", 320, 680, 100),
      item("좌3", 50, 660, 100), item("우3", 320, 660, 100),
    ],
  },
  {
    name: "두 단 w 없음",
    items: [
      item("좌1", 50, 700, 100), item("우1", 320, 700, 100),
      item("좌2", 50, 680, 100), item("우2", 320, 680, 100),
      item("좌3", 50, 660, 100), item("우3", 320, 660, 100),
    ],
  },
  {
    name: "단일단",
    w: PAGE_W,
    items: [
      item("첫", 50, 700, 100), item("둘", 50, 680, 100), item("셋", 50, 660, 100),
      item("넷", 50, 640, 100), item("다", 50, 620, 100), item("섯", 50, 600, 100),
    ],
  },
  {
    name: "제목·꼬리말이 있는 두 단",
    w: PAGE_W,
    items: [
      item("제목", 100, 760, 400),
      item("좌1", 50, 700, 100), item("우1", 320, 700, 100),
      item("좌2", 50, 680, 100), item("우2", 320, 680, 100),
      item("좌3", 50, 660, 100), item("우3", 320, 660, 100),
      item("쪽번호", 100, 40, 400),
    ],
  },
  {
    name: "자간 한글",
    items: [
      item("혈 액", 82, 744, 34), item(" ", 117, 744, 8), item("응 고 의", 125, 744, 37),
      item(" ", 163, 744, 8), item("경 로", 217, 744, 24),
    ],
  },
  { name: "자간+구두점", items: [item("피 부 ,혈 관", 0, 0, 58)] },
  { name: "자간+숫자+라틴", items: [item("제 10인 자 (Xa)", 0, 0, 58)] },
  { name: "정상 문장", items: [item("혈액 응고의 외인성 경로", 0, 0, 120)] },
  { name: "hasEOL 과 빈 조각", items: [item("가나", 0, 700, 24, 12, { hasEOL: true }), item("", 0, 700, 0, 12, { hasEOL: true }), item("다라", 0, 680, 24)] },
  { name: "조각 없음", items: [] },
];

for (const c of cases) {
  const got = buildPageText(c.items, c.w);
  assert.strictEqual(got.text, joinTextItems(c.items, c.w), "text 일치: " + c.name);
  assert.strictEqual(got.charItem.length, got.text.length, "charItem 길이: " + c.name);
  assert.strictEqual(got.charOffset.length, got.text.length, "charOffset 길이: " + c.name);
  assert.ok(got.charItem instanceof Int32Array && got.charOffset instanceof Int32Array);
}

// 한 낱말이 두 조각으로 쪼개짐: charItem [0,0,1,1], 삽입 공백 없음
{
  const items = [item("분산", 0, 700, 24), item("분석", 24, 700, 24)];
  const r = buildPageText(items);
  assert.strictEqual(r.text, "분산분석");
  assert.deepStrictEqual(Array.from(r.charItem), [0, 0, 1, 1]);
  assert.deepStrictEqual(Array.from(r.charOffset), [0, 1, 0, 1]);
}

// 조각 사이에 공백이 삽입된 경우: 그 위치의 charItem 은 -1
{
  const items = [item("결론이", 0, 700, 36), item("근거에", 40, 700, 36)];
  const r = buildPageText(items);
  assert.strictEqual(r.text, "결론이 근거에");
  assert.deepStrictEqual(Array.from(r.charItem), [0, 0, 0, -1, 1, 1, 1]);
  assert.strictEqual(r.charOffset[3], -1);
}

// 줄바꿈이 삽입된 경우도 -1
{
  const r = buildPageText([item("첫줄", 0, 700, 24), item("둘째줄", 0, 680, 30)]);
  assert.strictEqual(r.text, "첫줄\n둘째줄");
  assert.strictEqual(r.charItem[2], -1);
}

// Review Focus 2: 자간을 벌린 한글 — 쪽 글은 공백이 접히지만 charOffset 은 원래 str 위치
{
  const r = buildPageText([item("연 구 방 법", 0, 700, 60)]);
  assert.strictEqual(r.text, "연구방법");
  assert.deepStrictEqual(Array.from(r.charOffset), [0, 2, 4, 6]);
  assert.deepStrictEqual(Array.from(r.charItem), [0, 0, 0, 0]);
}
// 진짜 띄어쓰기(별도 " " 조각)는 남고, 뒤 조각의 charOffset 도 자기 str 기준
{
  const items = [item("혈 액", 82, 744, 34), item(" ", 117, 744, 8), item("응 고 의", 125, 744, 37)];
  const r = buildPageText(items);
  assert.strictEqual(r.text, "혈액 응고의");
  assert.deepStrictEqual(Array.from(r.charItem), [0, 0, 1, 2, 2, 2]);
  assert.deepStrictEqual(Array.from(r.charOffset), [0, 2, 0, 0, 2, 4]);
}
// 자간 조각의 구두점·숫자
{
  const r = buildPageText([item("피 부 ,혈 관", 0, 0, 58)]);
  assert.strictEqual(r.text, "피부 ,혈관");
  assert.deepStrictEqual(Array.from(r.charOffset), [0, 2, 3, 4, 5, 7]);
}

// 두 단: charItem 은 원래 배열 번호를 가리킨다
{
  const items = [
    item("좌1", 50, 700, 100), item("우1", 320, 700, 100),
    item("좌2", 50, 680, 100), item("우2", 320, 680, 100),
    item("좌3", 50, 660, 100), item("우3", 320, 660, 100),
  ];
  const r = buildPageText(items, PAGE_W);
  assert.strictEqual(r.text, "좌1\n좌2\n좌3\n우1\n우2\n우3");
  const seq = [];
  for (let i = 0; i < r.text.length; i++) if (r.charItem[i] >= 0 && r.charOffset[i] === 0) seq.push(r.charItem[i]);
  assert.deepStrictEqual(seq, [0, 2, 4, 1, 3, 5]);
  for (let i = 0; i < r.text.length; i++) {
    if (r.charItem[i] >= 0) assert.strictEqual(items[r.charItem[i]].str[r.charOffset[i]], r.text[i]);
  }
}

// 모든 사례에서 charItem/charOffset 이 가리키는 원래 글자가 쪽 글 글자와 같다(공백 접힘은 같은 글자만 남김)
for (const c of cases) {
  const r = buildPageText(c.items, c.w);
  for (let i = 0; i < r.text.length; i++) {
    if (r.charItem[i] < 0) continue;
    assert.strictEqual(c.items[r.charItem[i]].str[r.charOffset[i]], r.text[i], "글자 대응: " + c.name + " @" + i);
  }
}

// ---- buildCharBoxes ----
const VT = [1, 0, 0, -1, 0, 800]; // 배율 1, 높이 800 쪽의 viewport transform

// 폭 40짜리 4글자 조각, measure [10,10,10,10] -> 상자 x 가 10씩 증가
{
  const items = [item("가나다라", 100, 700, 40, 12)];
  const pt = buildPageText(items);
  const boxes = buildCharBoxes(items, VT, pt, () => [10, 10, 10, 10]);
  assert.strictEqual(boxes.length, 4);
  boxes.forEach((b, i) => {
    assert.ok(Math.abs(b.x - (100 + 10 * i)) < 1e-9);
    assert.ok(Math.abs(b.w - 10) < 1e-9);
  });
  // 세로: 기준선 y = 800-700 = 100. 위쪽 = 100 - 12*0.85, 높이 = 12*1.15
  assert.ok(Math.abs(boxes[0].y - (100 - 12 * 0.85)) < 1e-9);
  assert.ok(Math.abs(boxes[0].h - 12 * 1.15) < 1e-9);
}
// measure [5,5,5,5] (합 20) -> 비율 보정으로 여전히 10씩
{
  const items = [item("가나다라", 100, 700, 40, 12)];
  const boxes = buildCharBoxes(items, VT, buildPageText(items), () => [5, 5, 5, 5]);
  boxes.forEach((b, i) => {
    assert.ok(Math.abs(b.x - (100 + 10 * i)) < 1e-9);
    assert.ok(Math.abs(b.w - 10) < 1e-9);
  });
  // 측정값이 불균등하면 그 비율로 나뉜다
  const uneven = buildCharBoxes(items, VT, buildPageText(items), () => [1, 1, 1, 1].map((v, i) => (i === 0 ? 3 : 1)));
  assert.ok(Math.abs(uneven[0].w - 20) < 1e-9);
  assert.ok(Math.abs(uneven[3].x + uneven[3].w - 140) < 1e-9);
}
// measure null -> charWeights 분할(한글은 모두 1 이므로 균등)
{
  const items = [item("가나다라", 100, 700, 40, 12)];
  const boxes = buildCharBoxes(items, VT, buildPageText(items), null);
  boxes.forEach((b, i) => assert.ok(Math.abs(b.x - (100 + 10 * i)) < 1e-9));
  const mixed = [item("가Aa", 0, 700, 21, 12)]; // 가중치 1, 0.7, 0.55 -> 합 2.25
  const mb = buildCharBoxes(mixed, VT, buildPageText(mixed), () => null);
  assert.ok(Math.abs(mb[0].w - 21 / 2.25) < 1e-9);
  assert.ok(Math.abs(mb[1].w - (21 * 0.7) / 2.25) < 1e-9);
  assert.ok(Math.abs(mb[2].x + mb[2].w - 21) < 1e-9);
}
// measure 가 전부 0 을 돌려주면(글꼴이 글자를 모름) 가중치 분할로 돌아간다
{
  const items = [item("가나다라", 100, 700, 40, 12)];
  const boxes = buildCharBoxes(items, VT, buildPageText(items), () => [0, 0, 0, 0]);
  boxes.forEach((b, i) => assert.ok(Math.abs(b.x - (100 + 10 * i)) < 1e-9));
}
// 삽입 공백·줄바꿈은 null
{
  const items = [item("결론이", 0, 700, 36), item("근거에", 40, 700, 36), item("셋째", 0, 680, 24)];
  const pt = buildPageText(items);
  const boxes = buildCharBoxes(items, VT, pt, null);
  assert.strictEqual(boxes.length, pt.text.length);
  for (let i = 0; i < boxes.length; i++) {
    if (pt.charItem[i] < 0) assert.strictEqual(boxes[i], null);
    else assert.ok(boxes[i] && boxes[i].w > 0);
  }
  assert.strictEqual(pt.text, "결론이 근거에\n셋째");
}
// 자간 한글: 상자는 원래 str 위치 기준(공백 자리를 건너뜀)
{
  const items = [item("연 구 방 법", 0, 700, 70, 12)];
  const pt = buildPageText(items);
  const boxes = buildCharBoxes(items, VT, pt, () => [10, 10, 10, 10, 10, 10, 10]);
  assert.strictEqual(boxes.length, 4);
  assert.deepStrictEqual(boxes.map((b) => b.x), [0, 20, 40, 60]);
}
// 같은 조각의 상자는 같은 p 를 가진다
{
  const items = [item("가나", 0, 700, 24), item("다라", 24, 700, 24)];
  const boxes = buildCharBoxes(items, VT, buildPageText(items), null);
  assert.deepStrictEqual(boxes.map((b) => b.p), [0, 0, 1, 1]);
}
// 회전된 조각은 전체 상자를 글자 수로 균등 분할(여기서는 90도: 아래에서 위로 쓰는 글)
{
  const rot = { str: "가나다라", transform: [0, 12, -12, 0, 100, 500], width: 40 };
  const pt = buildPageText([rot]);
  const boxes = buildCharBoxes([rot], VT, pt, () => [1, 5, 1, 1]);
  assert.strictEqual(boxes.length, 4);
  const hs = boxes.map((b) => b.h);
  hs.forEach((h) => assert.ok(Math.abs(h - 10) < 1e-6, "균등 분할: " + h));
  // 아래에서 위로 쓰므로 viewport 에서는 y 가 줄어드는 방향으로 진행한다.
  assert.ok(boxes[0].y > boxes[3].y);
}
// 쪽 글 밖의 조각이 없고 폭 정보가 전혀 없으면 null (오류 없음)
{
  const items = [{ str: "가나", transform: [12, 0, 0, 12, 0, 700] }];
  const boxes = buildCharBoxes(items, VT, buildPageText(items), null);
  assert.deepStrictEqual(boxes, [null, null]);
}

console.log("reader-text-map: all tests passed");
