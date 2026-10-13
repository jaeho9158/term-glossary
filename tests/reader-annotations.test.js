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
  const good = { id: "g1", page: 2, startOffset: 1, endOffset: 4, quoteText: "abc" };
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

const { planMerge, shouldDeleteOld, finalizeRange, drawGroups, noteText } = require("../assets/reader/annotations.js");

test("sanitizeRecords: id 가 없거나 쓸 수 없는 기록은 버린다(문자열·숫자 id 는 통과)", () => {
  const ok1 = { id: "a1", page: 1 };
  const ok2 = { id: 7, page: 1 };
  const out = sanitizeRecords([{ page: 1 }, { id: null, page: 1 }, { id: {}, page: 1 }, { id: "", page: 1 }, { id: NaN, page: 1 }, ok1, ok2]);
  assert.deepEqual(out, [ok1, ok2]);
});

test("메모가 문자열이 아니면 빈 문자열(객체를 문자열로 바꾸지 않는다)", () => {
  assert.equal(noteText("가나"), "가나");
  assert.equal(noteText(null), "");
  assert.equal(noteText(undefined), "");
  assert.equal(noteText({ a: 1 }), "");
  assert.equal(noteText(5), "");
  const [r] = sanitizeRecords([{ id: "x", page: 1, note: { a: 1 } }]);
  assert.equal(r.note, "");
  const [r2] = sanitizeRecords([{ id: "y", page: 1, note: "메모" }]);
  assert.equal(r2.note, "메모");
});

const PT = "alpha beta gamma delta epsilon zeta";
const at = (w) => PT.indexOf(w);

test("shouldDeleteOld: 저장에 실패한(또는 없는) 새 기록이면 옛 기록을 지우지 않는다", () => {
  assert.equal(shouldDeleteOld(null), false);
  assert.equal(shouldDeleteOld(undefined), false);
  assert.equal(shouldDeleteOld({ id: "unsaved-1", unsaved: true }), false);
  assert.equal(shouldDeleteOld({ page: 1 }), false);
  assert.equal(shouldDeleteOld({ id: "real", page: 1 }), true);
});

test("planMerge: 겹치는 옛 기록만 합침 대상이 되고 범위는 합집합", () => {
  const e1 = { start: at("beta"), end: at("beta") + 4, id: "1", createdAt: "2026-01-01T00:00:00Z", note: "" };
  const e2 = { start: at("zeta"), end: at("zeta") + 4, id: "2", createdAt: "2026-01-02T00:00:00Z", note: "" };
  const p = planMerge([e1, e2], PT, at("beta") + 2, at("gamma") + 3, "");
  assert.deepEqual(p.olds, [e1]);
  assert.equal(PT.slice(p.start, p.end), "beta gamma");
});

test("planMerge: 겹치지 않으면 합침 대상 없음", () => {
  const e1 = { start: at("zeta"), end: at("zeta") + 4, id: "2", note: "" };
  const p = planMerge([e1], PT, at("alpha"), at("alpha") + 5, "");
  assert.deepEqual(p.olds, []);
  assert.equal(PT.slice(p.start, p.end), "alpha");
});

test("planMerge: 합쳐지는 옛 메모는 새 메모 앞에 이어 붙는다", () => {
  const e1 = { start: at("beta"), end: at("gamma") + 5, id: "1", note: "첫째" };
  const e2 = { start: at("delta"), end: at("delta") + 5, id: "2", note: "둘째" };
  const p = planMerge([e1, e2], PT, at("gamma"), at("delta") + 5, "새 메모");
  assert.equal(p.note, "첫째\n둘째\n새 메모");
  assert.equal(p.olds.length, 2);
  const none = planMerge([e1], PT, at("alpha"), at("alpha") + 5, "");
  assert.equal(none.note, "");
});

test("planMerge: 글자 단위로 저장된 옛 기록과 합쳐도 최종 범위는 낱말 경계", () => {
  // 옛 기록이 "gamma" 중간(am)에서 끝나는 글자 단위 범위
  const old = { start: at("gamma") + 1, end: at("gamma") + 3, id: "1", note: "" };
  const p = planMerge([old], PT, at("beta"), at("gamma") + 2, "");
  assert.equal(PT.slice(p.start, p.end), "beta gamma");
});

test("planMerge: 낱말 맞춤으로 넓어져 새로 닿게 된 기록도 함께 합친다", () => {
  const near = { start: at("delta") + 1, end: at("delta") + 3, id: "9", note: "" };
  // 새 범위가 gamma 의 끝 글자에서 끝나지만 낱말 맞춤으로 gamma 전체. delta 와는 공백 하나 떨어져 닿지 않는다.
  const p1 = planMerge([near], PT, at("beta"), at("gamma") + 4, "");
  assert.deepEqual(p1.olds, []);
  // 새 범위가 delta 한가운데에 닿으면 합친다.
  const p2 = planMerge([near], PT, at("gamma"), at("delta") + 2, "");
  assert.deepEqual(p2.olds, [near]);
  assert.equal(PT.slice(p2.start, p2.end), "gamma delta");
});

test("finalizeRange: 낱말 단위로 넓힌다", () => {
  const r = finalizeRange(PT, at("gamma") + 1, at("gamma") + 3);
  assert.equal(PT.slice(r.start, r.end), "gamma");
});

test("drawGroups: 겹치는 기록은 한 범위로 묶고 가장 나중 기록이 대표", () => {
  const g = drawGroups([
    { id: "a", start: 0, end: 10, createdAt: "2026-01-01T00:00:00Z" },
    { id: "b", start: 5, end: 15, createdAt: "2026-01-03T00:00:00Z" },
    { id: "c", start: 40, end: 50, createdAt: "2026-01-02T00:00:00Z" },
  ]);
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].start, g[0].end, g[0].primaryId], [0, 15, "b"]);
  assert.deepEqual(g[0].ids.slice().sort(), ["a", "b"]);
  assert.equal(g[1].primaryId, "c");
});
