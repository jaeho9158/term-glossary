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

const { clampTarget } = require("../assets/reader/selection.js");

const L = (page, rel) => ({ page, rel });

test("clampTarget: 같은 쪽 안의 끝점은 그 쪽 글자 층의 끝/처음으로", () => {
  const layers = [L(3, -1), L(4, -1), L(5, 1)];
  assert.deepEqual(clampTarget(true, layers, { anchorPage: 4, where: "page", pointPage: 4 }), { page: 4, edge: "end" });
  assert.deepEqual(clampTarget(false, [L(4, 1), L(5, 1)], { anchorPage: 4, where: "page", pointPage: 4 }), { page: 4, edge: "start" });
});

test("clampTarget: 다른 쪽 요소 안의 끝점은 당기지 않는다(여러 쪽 미리보기 방지)", () => {
  assert.equal(clampTarget(true, [L(3, -1), L(4, -1)], { anchorPage: 3, where: "page", pointPage: 4 }), null);
  assert.equal(clampTarget(false, [L(3, 1), L(4, 1)], { anchorPage: 4, where: "page", pointPage: 3 }), null);
});

test("clampTarget: 쪽 사이 틈은 안쪽 끝점의 쪽에 바로 붙은 틈일 때만", () => {
  assert.deepEqual(clampTarget(true, [L(3, -1), L(4, 1)], { anchorPage: 3, where: "gap", nearPages: [3, 4] }), { page: 3, edge: "end" });
  // 앵커 쪽에 붙지 않은 틈도 앵커 쪽의 끝/처음으로 당긴다(선택 전체를 버리지 않는다)
  assert.deepEqual(clampTarget(true, [L(3, -1), L(4, -1), L(5, 1)], { anchorPage: 3, where: "gap", nearPages: [4, 5] }), { page: 3, edge: "end" });
  assert.deepEqual(clampTarget(false, [L(3, 1), L(4, 1), L(5, -1)], { anchorPage: 4, where: "gap", nearPages: [2, 3] }), { page: 4, edge: "start" });
  // 층이 끝점의 반대쪽에 있으면 당기지 않는다
  assert.equal(clampTarget(true, [L(3, 1)], { anchorPage: 3, where: "gap", nearPages: [1, 2] }), null);
});

test("clampTarget: 패널·도구 막대 같은 본문 밖 끝점은 안쪽 끝점의 쪽 끝/처음으로만", () => {
  const layers = [L(1, -1), L(2, -1), L(3, -1), L(7, -1)];
  assert.deepEqual(clampTarget(true, layers, { anchorPage: 2, where: "outside" }), { page: 2, edge: "end" });
  assert.deepEqual(clampTarget(false, [L(1, 1), L(2, 1), L(3, 1)], { anchorPage: 2, where: "outside" }), { page: 2, edge: "start" });
});

test("clampTarget: 안쪽 끝점의 쪽 정보가 없거나 입력이 이상하면 null (두 끝점이 모두 층 밖이면 무시)", () => {
  assert.equal(clampTarget(true, [L(3, -1)], null), null);
  assert.equal(clampTarget(true, [L(3, -1)], { anchorPage: 0, where: "outside" }), null);
  assert.equal(clampTarget(true, [L(3, -1)], { anchorPage: 5, where: "outside" }), null);
  assert.equal(clampTarget(true, [L(3, -1)], { anchorPage: 3, where: "elsewhere" }), null);
  assert.equal(clampTarget(true, null, { anchorPage: 3, where: "outside" }), null);
  assert.equal(clampTarget(true, [null, { page: 0, rel: -1 }], { anchorPage: 3, where: "outside" }), null);
});

test("여러 쪽에 걸친 진짜 드래그(양 끝점이 글자 층 안)는 clampTarget 과 무관하게 그대로 쪽별 범위", () => {
  assert.deepEqual(
    normalizeRanges([{ page: 2, a: 10, b: 50 }, { page: 3, a: 0, b: 40 }, { page: 4, a: 0, b: 5 }]),
    [{ page: 2, start: 10, end: 50 }, { page: 3, start: 0, end: 40 }, { page: 4, start: 0, end: 5 }]
  );
});

test("nearestCaret: 가장 가까운 줄의 가장 가까운 글자 앞뒤로 읽는다(공백은 건너뜀)", () => {
  const { nearestCaret } = require("../assets/reader/selection.js");
  // 두 줄: "ab cd"(y 0~10) 와 "ef"(y 14~24)
  const text = "ab cdef";
  const boxes = [
    { x: 0, y: 0, w: 5, h: 10 }, { x: 5, y: 0, w: 5, h: 10 }, { x: 10, y: 0, w: 5, h: 10 },
    { x: 15, y: 0, w: 5, h: 10 }, { x: 20, y: 0, w: 5, h: 10 },
    { x: 0, y: 14, w: 5, h: 10 }, { x: 5, y: 14, w: 5, h: 10 },
  ];
  assert.equal(nearestCaret(boxes, text, 1, 5), 0, "첫 글자 왼쪽 절반: 글자 앞");
  assert.equal(nearestCaret(boxes, text, 4, 5), 1, "첫 글자 오른쪽 절반: 글자 뒤");
  assert.equal(nearestCaret(boxes, text, 12, 5), 2, "공백 상자 위: 더 가까운 이웃 글자 b 의 뒤(공백은 건너뜀)");
  assert.equal(nearestCaret(boxes, text, 9, 12) <= 5, true, "틈 위쪽(y 12)은 첫 줄");
  assert.equal(nearestCaret(boxes, text, 9, 13) >= 5, true, "틈 아래쪽(y 13)은 둘째 줄");
  assert.equal(nearestCaret(boxes, text, 100, 200), 7, "범위 밖: 가장 가까운 끝(마지막 글자 뒤)");
  assert.equal(nearestCaret([], "", 0, 0), -1);
});

test("pickRange: 두 읽기가 비슷하면 DOM, 어긋나거나 한쪽만 있으면 지점 읽기", () => {
  const { pickRange } = require("../assets/reader/selection.js");
  const dom = { ps: 2, os: 100, pe: 2, oe: 160 };
  assert.equal(pickRange(dom, { ps: 2, os: 103, pe: 2, oe: 158 }), dom);
  const pts = { ps: 2, os: 100, pe: 2, oe: 1400 };
  assert.equal(pickRange(dom, pts), pts, "끝이 크게 어긋남");
  assert.equal(pickRange(dom, { ps: 3, os: 0, pe: 3, oe: 5 }).ps, 3, "쪽이 다름");
  assert.equal(pickRange(null, pts), pts);
  assert.equal(pickRange(dom, null), dom);
});
