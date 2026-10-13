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
  assert.equal(clampTarget(true, [L(3, -1), L(4, -1), L(5, 1)], { anchorPage: 3, where: "gap", nearPages: [4, 5] }), null);
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
