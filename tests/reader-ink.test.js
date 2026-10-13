const test = require("node:test");
const assert = require("assert");
const { columnInk, columnInkLum, toLum, gaps, snapEdge, refinable, edgeFlags, edgeMode } = require("../assets/reader/ink.js");

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

// ---------- 안쪽 이동 제한(잉크 덩어리를 넘어 조이지 않는다) ----------
test("안쪽 이동은 잉크 없는 열 위에서만: 잉크 위 가장자리는 덩어리의 바깥 경계로", () => {
  const g = run(band(120, 12, WORD), 5);
  assert.strictEqual(snapEdge(43, g, 20, "left"), 40);
  assert.strictEqual(snapEdge(77, g, 20, "right"), 80);
});
test("두 덩어리 사이 틈을 향해 잉크를 넘어 조이지 않는다", () => {
  // 덩어리 A [20,40), 틈 [40,52), 덩어리 B [52,90)
  const g = run(band(120, 12, [[20, 40], [52, 90]]), 5);
  assert.strictEqual(snapEdge(25, g, 30, "left"), 20);
  assert.strictEqual(snapEdge(85, g, 30, "right"), 90);
  assert.strictEqual(snapEdge(35, g, 30, "right"), 40);
});
test("바깥 이동은 잉크를 넘어도 된다(maxMove 안에서)", () => {
  const g = run(band(120, 12, WORD), 5);
  assert.strictEqual(snapEdge(70, g, 30, "left"), 40);
  assert.strictEqual(snapEdge(50, g, 30, "right"), 80);
  assert.strictEqual(snapEdge(70, g, 20, "left"), 70);
});

// "(III)와" 사례: 얇은 "(" [30,33), 틈 [33,45), 몸통 [45,100)
const PAREN = [[8, 18], [30, 33], [45, 100]]; // 앞 낱말 꼬리, 틈 [18,30), "(", 틈 [33,45), 몸통
test("얇은 덩어리: 가장자리가 그 위에 있으면 덩어리 시작으로(잘리지 않는다)", () => {
  const g = run(band(140, 12, PAREN), 5);
  assert.strictEqual(snapEdge(31, g, 10, "left", 4), 30);
  assert.strictEqual(snapEdge(31, g, 10, "left"), 30);
});
test("얇은 덩어리와 몸통 사이 틈의 가장자리: 제자리(몸통 쪽으로 조이지 않는다)", () => {
  const g = run(band(140, 12, PAREN), 5);
  for (let x = 33; x <= 45; x++) {
    const r = snapEdge(x, g, 20, "left", 4);
    assert.strictEqual(r, x, "x=" + x + " -> " + r); // 제자리: 몸통(45) 쪽으로 안 간다
  }
  assert.strictEqual(snapEdge(45, g, 20, "left", 4), 45); // 몸통 시작에 정확히 있으면 그대로(이웃의 "(" 를 끌어들이지 않는다)
  assert.strictEqual(snapEdge(36, g, 20, "left"), 45); // thin 을 안 주면 몸통 쪽으로 조인다
  // 덩어리가 thin 보다 넓으면(진짜 한 글자 낱말) 예전처럼 몸통 시작으로
  const wide = run(band(140, 12, [[30, 40], [52, 100]]), 5);
  assert.strictEqual(snapEdge(44, wide, 20, "left", 4), 52);
});
test("얇은 덩어리 바깥 틈이 띠 가장자리까지 닿아도 몸통 쪽으로 조이지 않는다", () => {
  // 띠 [0,30) 빈 구간(가장자리까지), "(" [30,32), 틈 [32,45), 몸통 [45,100)
  const g = run(band(140, 12, [[30, 32], [45, 100]]), 5);
  for (let x = 32; x <= 45; x++) {
    const r = snapEdge(x, g, 20, "left", 4, 5, 140);
    assert.ok(r <= x && r < 45 || x === 45, "x=" + x + " -> " + r);
    assert.ok(r <= x, "x=" + x + " -> " + r);
  }
  assert.strictEqual(snapEdge(38, g, 20, "left", 4, 5, 140), 38);
});
test("얇은 덩어리 오른쪽 가장자리 대칭", () => {
  const g = run(band(140, 12, [[20, 80], [92, 95], [108, 125]]), 5);
  for (let x = 80; x <= 92; x++) {
    const r = snapEdge(x, g, 20, "right", 4);
    assert.strictEqual(r, x, "x=" + x + " -> " + r);
  }
  assert.strictEqual(snapEdge(86, g, 20, "right"), 80);
  assert.strictEqual(snapEdge(92, g, 20, "right", 4), 92); // 얇은 덩어리 시작에 정확히 있으면 그대로
  assert.strictEqual(snapEdge(94, g, 20, "right", 4), 95); // 얇은 덩어리 위: 그 덩어리의 바깥 경계(끝)로
});
test("얇은 덩어리가 maxMove 밖이면 따라가지 않는다", () => {
  const g = run(band(140, 12, PAREN), 5);
  assert.strictEqual(snapEdge(44, g, 8, "left", 4), 45);
});
test("\"10\" 사례: 가는 1 [30,33), 틈, 0 [40,52). 가장자리가 어디 있어도 1 이 잘리지 않는다", () => {
  const g = run(band(100, 12, [[5, 15], [30, 33], [40, 52]]), 5);
  for (let x = 30; x <= 40; x++) {
    const r = snapEdge(x, g, 10, "left", 4);
    assert.ok(r <= x, "x=" + x + " -> " + r); // 오른쪽(몸통 쪽)으로 가지 않는다
  }
});
test("글자 간격이 벌어진 한글 제목: 낱말 경계는 그대로 잡는다", () => {
  const bandImg = band(160, 14, [[10, 20], [40, 52], [58, 70], [76, 88], [124, 136]]);
  const g = run(bandImg, 8);
  assert.strictEqual(snapEdge(43, g, 10, "left", 4), 40);
  assert.strictEqual(snapEdge(85, g, 10, "right", 4), 88);
  assert.strictEqual(snapEdge(37, g, 10, "left", 4), 40);
  assert.strictEqual(snapEdge(91, g, 10, "right", 4), 88);
  assert.strictEqual(snapEdge(55, g, 10, "left", 4), 55);
});

// ---------- 저해상도 건너뛰기 ----------
test("refinable: 틈 기준이 2.5 픽셀 미만이면 보정하지 않는다", () => {
  assert.strictEqual(refinable(11.5, 1), false); // 1.7px
  assert.strictEqual(refinable(11.5, 1.5), true); // 2.6px
  assert.strictEqual(refinable(11.5, 2), true);
  assert.strictEqual(refinable(11.5, 4), true);
  assert.strictEqual(refinable(2.5 / 0.15, 1), true);
  assert.strictEqual(refinable(2.49 / 0.15, 1), false);
  assert.strictEqual(refinable(11.5, 1, { minGap: 0.15, minGapPx: 1.5 }), true);
});

// ---------- 밝기 버퍼 ----------
test("columnInkLum 은 RGBA columnInk 와 같은 열을 낸다", () => {
  const img = band(120, 12, [[40, 80], [90, 95]]);
  const a = columnInk(img, 10, 0, 100, 12);
  const b = columnInkLum(toLum(img, 0, 0), 10, 0, 100, 12);
  assert.deepStrictEqual(Array.from(a), Array.from(b));
});
test("toLum: 크기·원점 보존", () => {
  const l = toLum(band(10, 4, []), 7, 3);
  assert.strictEqual(l.lum.length, 40); assert.strictEqual(l.ox, 7); assert.strictEqual(l.oy, 3);
});

// ---------- 낱말 안쪽 가장자리는 보정하지 않는다 ----------
test("edgeFlags: 낱말 안쪽에서 끝난 가장자리만 끈다", () => {
  const t = "the control point";
  const s = t.indexOf("contro");
  assert.deepStrictEqual(edgeFlags(t, s, s + 6), { refineLeft: true, refineRight: false });
  assert.deepStrictEqual(edgeFlags(t, s + 1, s + 7), { refineLeft: false, refineRight: true });
  assert.deepStrictEqual(edgeFlags(t, s + 1, s + 5), { refineLeft: false, refineRight: false });
  assert.deepStrictEqual(edgeFlags(t, s, s + 7), { refineLeft: true, refineRight: true });
  assert.deepStrictEqual(edgeFlags(t, 0, 3), { refineLeft: true, refineRight: true });
  assert.deepStrictEqual(edgeFlags(t, t.length - 5, t.length), { refineLeft: true, refineRight: true });
  assert.deepStrictEqual(edgeFlags("감염병은", 0, 2), { refineLeft: true, refineRight: false });
  assert.deepStrictEqual(edgeFlags("감염\n관리", 0, 2), { refineLeft: true, refineRight: true });
  assert.deepStrictEqual(edgeFlags(undefined, 0, 0), { refineLeft: true, refineRight: true });
});

test("얇은 덩어리 바깥 이웃 틈이 너무 좁거나 폭이 부족하면 따라가지 않는다", () => {
  // 가장자리 빈 구간 [0,3), 조각 [3,7), 틈 [7,20), 몸통 [20,70)
  const g = run(band(100, 12, [[3, 7], [20, 70]]), 5);
  assert.strictEqual(snapEdge(14, g, 20, "left", 5, 5, 100), 20);
  const gr = run(band(100, 12, [[20, 70], [80, 84]]), 5); // 몸통 끝 70, 틈 [70,80), 조각 [80,84), 가장자리 빈 구간 [84,100)
  assert.strictEqual(snapEdge(75, gr, 20, "right", 5, 5, 100), 75); // 띠 가장자리 틈이어도 얇은 글자를 보호한다
  // 바깥 이웃 틈이 낱말 사이 틈 폭보다 좁아도 마찬가지
  const narrow = run(band(100, 12, [[5, 10], [12, 15], [30, 70]]), 2); // 틈 [10,12) 폭 2
  assert.strictEqual(snapEdge(22, narrow, 20, "left", 5, 4, 100), 30);
});

test("edgeMode: 가장자리 플래그가 refine 보다 우선", () => {
  assert.deepStrictEqual(edgeMode(false, { refine: false, refineLeft: true, refineRight: false }), { left: true, right: false, any: true });
  assert.deepStrictEqual(edgeMode(false, { refine: false, refineLeft: false, refineRight: true }), { left: false, right: true, any: true });
  assert.deepStrictEqual(edgeMode(true, { refineLeft: false, refineRight: false }), { left: false, right: false, any: false });
  assert.deepStrictEqual(edgeMode(false, { refine: true }), { left: true, right: true, any: true });
  assert.deepStrictEqual(edgeMode(false, { refine: false }), { left: false, right: false, any: false });
  assert.deepStrictEqual(edgeMode(false, {}), { left: false, right: false, any: false });
  assert.deepStrictEqual(edgeMode(true, {}), { left: true, right: true, any: true });
  assert.deepStrictEqual(edgeMode(true, { refine: false, refineRight: true }), { left: false, right: true, any: true });
});

// ---------- 줄 처음·끝의 빈 여백 줄이기 ----------
const { refineRects } = require("../assets/reader/ink.js");

// 가짜 캔버스: 쪽 좌표 폭 W·높이 H 를 배율 sc 로 그린 것. words = 쪽 좌표 x 구간들, y 는 3..9 에 잉크.
function fakeCanvas(W, H, sc, words) {
  const cw = W * sc, ch = H * sc;
  return {
    width: cw, height: ch,
    getContext() {
      return {
        getImageData(x0, y0, w, h) {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const px = (x0 + x) / sc, py = (y0 + y) / sc;
            let v = 250;
            for (const [a, b] of words) if (px >= a && px < b && py > 3 && py < 9) v = 10;
            const p = (y * w + x) * 4;
            data[p] = data[p + 1] = data[p + 2] = v; data[p + 3] = 255;
          }
          return { data, width: w, height: h };
        },
      };
    },
  };
}

test("refineRects: 줄 끝 사각형이 마지막 잉크보다 한참 뒤까지 가면 마지막 잉크까지 줄인다", () => {
  const canvas = fakeCanvas(200, 20, 3, [[10, 60]]);
  const o = { canvas, pageW: 200, pageH: 20 };
  const [r] = refineRects(1, [{ x: 10, y: 0, w: 100, h: 12 }], o); // 오른쪽 50pt(높이의 4배)가 빈 여백
  assert.ok(r.x + r.w < 62, "오른쪽 가장자리가 마지막 잉크(60) 가까이로 줄어든다: " + (r.x + r.w));
  assert.ok(r.x + r.w > 59.5, "잉크를 자르지 않는다: " + (r.x + r.w));
  // 오른쪽 가장자리를 보정하지 않는 요청(낱말 안쪽에서 끝난 검색)은 그대로 둔다
  const [k] = refineRects(1, [{ x: 10, y: 0, w: 100, h: 12 }], Object.assign({ refineRight: false }, o));
  assert.strictEqual(k.x + k.w, 110);
});

test("refineRects: 줄 처음 쪽 빈 여백도 첫 잉크까지 줄인다", () => {
  const canvas = fakeCanvas(200, 20, 3, [[100, 150]]);
  const [r] = refineRects(1, [{ x: 50, y: 0, w: 100, h: 12 }], { canvas, pageW: 200, pageH: 20 });
  assert.ok(r.x > 98 && r.x < 100.5, "왼쪽 가장자리가 첫 잉크(100) 가까이로: " + r.x);
});

test("refineRects: 사각형 안에 잉크가 거의 없으면(깎을 근거가 없으면) 그대로", () => {
  const canvas = fakeCanvas(200, 20, 3, [[150, 190]]);
  const src = { x: 10, y: 0, w: 60, h: 12 };
  const [r] = refineRects(1, [src], { canvas, pageW: 200, pageH: 20 });
  assert.ok(r.x <= src.x && r.x + r.w >= src.x + src.w, "깎지 않는다");
});
