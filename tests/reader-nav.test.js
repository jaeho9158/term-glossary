const test = require("node:test");
const assert = require("node:assert/strict");
const { createNav, BACK_MS, hideButton } = require("../assets/reader/nav.js");

function makeEnv() {
  const env = {
    pos: { page: 3, yRatio: 0.4 },
    top: 1000,
    vh: 800,
    clock: 0,
    shown: false,
    gone: [],
    timers: [],
    position() { return env.pos; },
    go(page, yRatio) { env.gone.push([page, yRatio]); env.pos = { page, yRatio }; env.top = page * 1000; },
    scrollTop() { return env.top; },
    viewportH() { return env.vh; },
    show() { env.shown = true; },
    hide() { env.shown = false; },
    now() { return env.clock; },
    setTimer(fn, ms) { env.timers.push({ fn, ms, live: true }); return env.timers.length - 1; },
    clearTimer(id) { if (env.timers[id]) env.timers[id].live = false; },
  };
  return env;
}

test("jump 는 읽던 자리를 기억하고 버튼을 8초 보인다", () => {
  const env = makeEnv();
  const nav = createNav(env);
  assert.equal(nav.canGoBack(), false);
  nav.jump(9, 0.25);
  assert.deepEqual(env.gone[0], [9, 0.25]);
  assert.equal(env.shown, true);
  assert.equal(nav.canGoBack(), true);
  assert.equal(env.timers[0].ms, BACK_MS);
  assert.equal(BACK_MS, 8000);
  env.timers[0].fn();
  assert.equal(env.shown, false);
  assert.equal(nav.canGoBack(), false);
});

test("back 은 원래 자리로 돌아가고 버튼을 숨긴다", () => {
  const env = makeEnv();
  const nav = createNav(env);
  nav.jump(9, 0.25);
  nav.back();
  assert.deepEqual(env.gone[env.gone.length - 1], [3, 0.4]);
  assert.equal(env.shown, false);
  assert.equal(nav.canGoBack(), false);
  const n = env.gone.length;
  nav.back();
  assert.equal(env.gone.length, n, "버튼이 없으면 아무 데도 가지 않는다");
});

test("연달아 이동해도 처음 자리로 돌아가고, 타이머는 다시 시작된다", () => {
  const env = makeEnv();
  const nav = createNav(env);
  nav.jump(9, 0.25);
  nav.jump(12, 0.5);
  assert.equal(env.timers[0].live, false);
  assert.equal(env.timers[1].live, true);
  nav.back();
  assert.deepEqual(env.gone[env.gone.length - 1], [3, 0.4]);
});

test("스스로 한 화면 넘게 스크롤하면 버튼이 사라진다(이동 직후의 이벤트는 무시)", () => {
  const env = makeEnv();
  const nav = createNav(env);
  nav.jump(9, 0.25);
  const target = env.top;
  env.top = target + 100;
  env.clock = 100;
  nav.onScroll();
  assert.equal(nav.canGoBack(), true, "이동 직후는 안착 중");
  env.clock = 1000;
  const settled = env.top; // 안착 중에 따라간 이동 지점
  env.top = settled + 700;
  nav.onScroll();
  assert.equal(nav.canGoBack(), true, "한 화면 이내");
  env.top = settled + 900;
  nav.onScroll();
  assert.equal(nav.canGoBack(), false);
  assert.equal(env.shown, false);
});

test("reset(문서 닫힘)은 버튼을 숨기고 기억을 지운다", () => {
  const env = makeEnv();
  const nav = createNav(env);
  nav.jump(9, 0);
  nav.reset();
  assert.equal(env.shown, false);
  assert.equal(nav.canGoBack(), false);
});

test("잘못된 쪽 번호는 무시하고, 현재 위치를 모르면 이동만 한다", () => {
  const env = makeEnv();
  const nav = createNav(env);
  nav.jump(NaN, 0);
  nav.jump(0, 0);
  assert.equal(env.gone.length, 0);
  env.pos = null;
  nav.jump(5, 2);
  assert.deepEqual(env.gone[0], [5, 1]);
  assert.equal(nav.canGoBack(), false);
});

test("hideButton: 단추가 초점을 가진 채 숨겨지면 읽는 영역으로 초점을 옮긴다", () => {
  const btn = { hidden: false };
  const calls = [];
  const sc = { focus: (o) => calls.push(o) };
  hideButton(btn, { activeElement: btn }, () => sc);
  assert.equal(btn.hidden, true);
  assert.deepEqual(calls, [{ preventScroll: true }]);
});

test("hideButton: 초점이 다른 곳에 있으면 초점을 건드리지 않는다", () => {
  const btn = { hidden: false };
  const calls = [];
  hideButton(btn, { activeElement: {} }, () => ({ focus: () => calls.push(1) }));
  assert.equal(btn.hidden, true);
  assert.equal(calls.length, 0);
});
