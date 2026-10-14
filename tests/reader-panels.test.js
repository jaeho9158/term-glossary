const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function el() {
  const cls = new Set();
  return {
    classList: { toggle(c, on) { if (on) cls.add(c); else cls.delete(c); }, remove(c) { cls.delete(c); }, contains: (c) => cls.has(c) },
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    contains() { return false; },
  };
}

// 가짜 DOM·저장소·화면 폭으로 panels.js 를 새로 불러온다.
function load({ width, store = {}, throwing = false }) {
  const els = {};
  ["rd-body", "rd-left", "rd-right", "rd-left-toggle", "rd-right-toggle", "rd-scrim"].forEach((id) => { els[id] = el(); });
  const g = globalThis;
  const saved = { document: g.document, window: g.window, innerWidth: g.innerWidth, matchMedia: g.matchMedia, localStorage: g.localStorage };
  g.document = { getElementById: (id) => els[id] || null, contains: () => false, body: el(), activeElement: null, documentElement: { clientWidth: width } };
  g.innerWidth = width;
  g.matchMedia = () => ({ matches: width <= 767, addEventListener() {} });
  g.localStorage = {
    getItem(k) { if (throwing) throw new Error("denied"); return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { if (throwing) throw new Error("denied"); store[k] = String(v); },
  };
  const file = require.resolve(path.join("..", "assets", "reader", "panels.js"));
  delete require.cache[file];
  require(file);
  const P = g.ReaderPanels;
  delete g.ReaderPanels;
  const restore = () => { Object.keys(saved).forEach((k) => { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; }); delete require.cache[file]; };
  return { P, store, els, restore };
}

test("넓은 화면(1100px 이상)에서는 왼쪽 패널이 기본으로 열린다", () => {
  const t = load({ width: 1366 });
  try { t.P.init(); assert.equal(t.P.isOpen("left"), true); assert.equal(t.P.isOpen("right"), true); } finally { t.restore(); }
});

test("1100px 미만이면 왼쪽 패널은 기본으로 닫혀 있고 오른쪽 기본값은 그대로 열림", () => {
  const t = load({ width: 1024 });
  try { t.P.init(); assert.equal(t.P.isOpen("left"), false); assert.equal(t.P.isOpen("right"), true); } finally { t.restore(); }
});

test("767px 이하(서랍)에서는 둘 다 닫혀 있다", () => {
  const t = load({ width: 375 });
  try { t.P.init(); assert.equal(t.P.isOpen("left"), false); assert.equal(t.P.isOpen("right"), false); } finally { t.restore(); }
});

test("사용자가 닫은 선택은 쪽마다 따로 기억되어 다음에 기본값보다 우선한다", () => {
  const a = load({ width: 1440 });
  try {
    a.P.init();
    a.P.close("left");
    assert.equal(a.store["rd-panel-left"], "0");
    assert.equal(a.store["rd-panel-right"], undefined);
  } finally { a.restore(); }
  const b = load({ width: 1440, store: a.store });
  try { b.P.init(); assert.equal(b.P.isOpen("left"), false); assert.equal(b.P.isOpen("right"), true); } finally { b.restore(); }
});

test("좁은 폭에서 사용자가 연 선택도 기억되어 다음에 열린다", () => {
  const a = load({ width: 1024 });
  try { a.P.init(); a.P.open("left"); assert.equal(a.store["rd-panel-left"], "1"); } finally { a.restore(); }
  const b = load({ width: 1024, store: a.store });
  try { b.P.init(); assert.equal(b.P.isOpen("left"), true); } finally { b.restore(); }
});

test("저장소가 막혀 있어도 기본값으로 동작한다", () => {
  const t = load({ width: 1440, throwing: true });
  try { t.P.init(); assert.equal(t.P.isOpen("left"), true); t.P.close("left"); assert.equal(t.P.isOpen("left"), false); } finally { t.restore(); }
});
