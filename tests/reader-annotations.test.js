const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeRecords, placeRecords } = require("../assets/reader/annotations.js");

test("sanitizeRecords: 배열이 아니면 빈 배열", () => {
  assert.deepEqual(sanitizeRecords(null), []);
  assert.deepEqual(sanitizeRecords(undefined), []);
  assert.deepEqual(sanitizeRecords("x"), []);
  assert.deepEqual(sanitizeRecords({ page: 1 }), []);
});

test("sanitizeRecords: 깨진 항목만 버리고 쓸 수 있는 기록은 그대로", () => {
  const good = { page: 2, startOffset: 1, endOffset: 4, quoteText: "abc" };
  const out = sanitizeRecords([null, 3, { page: 0 }, { page: "2" }, { page: 1.5 }, [], good]);
  assert.equal(out.length, 1);
  assert.equal(out[0], good);
});

const TEXT = "서론 연구 방법은 다음과 같다. 결과는 표 1에 있다.";

test("placeRecords: 위치가 맞으면 offset", () => {
  const start = TEXT.indexOf("연구 방법");
  const rec = { page: 1, startOffset: start, endOffset: start + 5, quoteText: "연구 방법" };
  const [p] = placeRecords([rec], TEXT);
  assert.equal(p.status, "offset");
  assert.equal(p.start, start);
  assert.equal(p.end, start + 5);
  assert.equal(p.record, rec);
});

test("placeRecords: 글이 밀려 위치가 어긋나도 글귀가 있으면 quote 와 새 위치", () => {
  const start = TEXT.indexOf("결과는");
  const rec = { page: 1, startOffset: start - 15, endOffset: start - 15 + 3, quoteText: "결과는" };
  const [p] = placeRecords([rec], TEXT);
  assert.equal(p.status, "quote");
  assert.equal(TEXT.slice(p.start, p.end), "결과는");
});

test("placeRecords: 글귀가 쪽에 없으면 lost", () => {
  const rec = { page: 1, startOffset: 3, endOffset: 9, quoteText: "없는 문장입니다" };
  const [p] = placeRecords([rec], TEXT);
  assert.equal(p.status, "lost");
  assert.equal(p.start, null);
  assert.equal(p.end, null);
});

test("placeRecords: 쪽 글이 비었거나 records 가 배열이 아니면 안전", () => {
  assert.equal(placeRecords([{ page: 1, startOffset: 0, endOffset: 3, quoteText: "abc" }], "")[0].status, "lost");
  assert.deepEqual(placeRecords(null, TEXT), []);
});
