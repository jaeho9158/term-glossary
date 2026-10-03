const test = require("node:test");
const assert = require("node:assert");
const track = require("../assets/track.js");

test("gtag가 없어도 던지지 않는다", () => {
  delete globalThis.gtag;
  assert.doesNotThrow(() => track.trackEvent("x", { a: 1 }));
});

test("gtag가 던져도 삼킨다", () => {
  globalThis.gtag = () => { throw new Error("boom"); };
  assert.doesNotThrow(() => track.trackEvent("x", {}));
  delete globalThis.gtag;
});

test("문자열은 100자로 자르고 이메일은 버린다", () => {
  const calls = [];
  globalThis.gtag = (...a) => calls.push(a);
  track.trackEvent("e", { s: "가".repeat(300), mail: "a@b.com", n: 3, o: { x: 1 } });
  delete globalThis.gtag;
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], "event");
  assert.strictEqual(calls[0][2].s.length, 100);
  assert.ok(!("mail" in calls[0][2]));
  assert.ok(!("o" in calls[0][2]));
  assert.strictEqual(calls[0][2].n, 3);
});

test("search_no_result: 1.2초 정지 후 한 번, 같은 검색어 중복 없음", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  track._reset();
  const calls = [];
  globalThis.gtag = (...a) => calls.push(a);
  track.trackNoResult("  ZXQV ", "header", 0);
  t.mock.timers.tick(1000);
  track.trackNoResult("zxqvw", "header", 0); // 다시 입력 -> 타이머 재시작
  t.mock.timers.tick(1199);
  assert.strictEqual(calls.length, 0);
  t.mock.timers.tick(1);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][2].search_term, "zxqvw");
  assert.strictEqual(calls[0][2].source, "header");
  track.trackNoResult("zxqvw", "header", 0);
  t.mock.timers.tick(5000);
  assert.strictEqual(calls.length, 1);
  track.trackNoResult("a", "header", 0); // 2자 미만
  t.mock.timers.tick(5000);
  track.trackNoResult("abcd", "hub", 3); // 결과 있음
  t.mock.timers.tick(5000);
  assert.strictEqual(calls.length, 1);
  delete globalThis.gtag;
  track._reset();
});
