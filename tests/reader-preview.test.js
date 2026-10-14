// preview.js(인용 카드·그림·표 미리보기)의 DOM 동작 시험. 브라우저 없이 가짜 DOM 으로 스크립트를 읽어 돌린다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const R = require("../assets/reader/refs.js");
const SRC = fs.readFileSync(path.join(__dirname, "..", "assets", "reader", "preview.js"), "utf8");

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this._cls = new Set();
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this._attrs = {};
    this._text = "";
    this._l = {};
    this.tabIndex = 0;
    this.scrollTop = 0;
    this.scrollLeft = 0;
    const self = this;
    this.classList = {
      add(...c) { c.forEach((x) => self._cls.add(x)); },
      remove(...c) { c.forEach((x) => self._cls.delete(x)); },
      contains(c) { return self._cls.has(c); },
      toggle(c, on) { const want = on === undefined ? !self._cls.has(c) : !!on; if (want) self._cls.add(c); else self._cls.delete(c); return want; },
    };
  }
  get className() { return Array.from(this._cls).join(" "); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join("") : this._text; }
  set textContent(v) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this._text = String(v); }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(c) { c.parentNode = this; this.children.push(c); this._text = ""; return c; }
  all() { const out = []; this.children.forEach((c) => { out.push(c); out.push(...c.all()); }); return out; }
  matches(sel) { return sel.split(",").some((s) => { s = s.trim(); if (s.startsWith(".")) return this._cls.has(s.slice(1)); return this.tagName === s.toUpperCase(); }); }
  querySelector(sel) { return this.all().find((n) => n.matches(sel)) || null; }
  querySelectorAll(sel) { return this.all().filter((n) => n.matches(sel)); }
  closest(sel) { let n = this; while (n) { if (n.matches(sel)) return n; n = n.parentNode; } return null; }
  contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  focus() { this.ownerDocument.activeElement = this; }
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
  fire(t, ev) { ev = Object.assign({ type: t, target: this, preventDefault() { this.prevented = true; }, stopPropagation() {} }, ev); (this._l[t] || []).forEach((f) => f(ev)); return ev; }
  getBoundingClientRect() { return this._rect || { left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800 }; }
}

function setup(opts) {
  opts = opts || {};
  const calls = [];
  const doc = { readyState: "complete", activeElement: null, _l: {}, createElement(t) { const e = new El(t); e.ownerDocument = doc; return e; }, addEventListener() {}, contains(n) { return !!n && (n === reader || reader.contains(n)); }, getElementById(id) { return id === "reader" ? reader : id === "rd-scroll" ? scroll : null; } };
  const reader = doc.createElement("div");
  const scroll = doc.createElement("div");
  scroll._rect = { left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800 };
  reader.appendChild(scroll);
  const rects = new Map();
  const jumps = [];
  const ctx = {
    document: doc,
    console: { error() {}, log: console.log },
    setTimeout, clearTimeout,
    CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; },
    matchMedia: () => ({ matches: false }),
    innerWidth: 1000, innerHeight: 800,
    getSelection: () => ({ isCollapsed: true, toString: () => "" }),
    ReaderRefs: R,
    ReaderTerms: { setSuppressed(v) { calls.push(!!v); } },
    ReaderGeometry: { rangeRects: () => [{ x: 1, y: 1, w: 5, h: 5 }] },
    ReaderOverlay: {
      setRects(page, layer, entries) { rects.set(page + ":" + layer, entries); },
      entryAt() { return opts.entryAt ? opts.entryAt() : null; },
    },
    ReaderDoc: {
      numPages: () => opts.pages || 4,
      currentPage: () => opts.current || 1,
      getPdf: () => null,
      pageToClient: (page, pt) => ({ x: pt.x, y: pt.y + (page - 1) * 1000 - scroll.scrollTop }),
      clientToPage: (cx, cy) => ({ page: 1, x: cx, y: cy }),
      goToPage(p, o) { jumps.push({ page: p, o }); },
      pageSize: () => ({ w: 600, h: 800 }),
      getPage: () => Promise.reject(new Error("테스트: 쪽 없음")),
      getTextContent: () => Promise.reject(new Error("테스트: 글 없음")),
    },
    ReaderNav: { jump(page, ratio) { jumps.push({ page, ratio }); } },
    ReaderTextMap: { get: (p) => Promise.resolve(opts.tm ? opts.tm(p) : null) },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const P = ctx.ReaderPreview;
  const S = P._state();
  S.analysis = { refs: [{ n: 1, page: 9, offset: 5 }, { n: 2, page: 9, offset: 50 }], refCount: 2, numericOk: true, section: null, targets: new Map() };
  S.display = ["Kim A. First paper title is here. J 2020;1:1-2.", "Lee B. Second paper title is here. J 2019;2:3-4."];
  return { P, S, ctx, doc, reader, scroll, calls, rects, jumps };
}

function cite(start, label, refs) {
  return { id: "ref:" + start, rects: [{ x: 10, y: 20, w: 20, h: 10 }], className: "rd-ref-mark", data: { type: "cite", style: "numeric", refs: refs || [0], label } };
}
function xref(start, kind, label, page) {
  return { id: "ref:" + start, rects: [{ x: 10, y: 400, w: 20, h: 10 }], className: "rd-ref-mark", data: { type: "xref", kind, key: kind + ":1", label, target: { page, offset: 3 } } };
}

test("용어 카드: 표시 위를 스쳐 지나가는 것만으로는 막지 않고, 카드가 실제로 열릴 때만 막는다", async () => {
  let hit = { page: 1, layer: "ref", id: "ref:10", data: cite(10, "[1]").data };
  const env = setup({ entryAt: () => hit });
  env.S.entries.set(1, [cite(10, "[1]")]);
  env.scroll.fire("pointermove", { pointerType: "mouse", clientX: 15, clientY: 25 });
  assert.equal(env.calls.includes(true), false, "호버만으로는 용어 카드를 막지 않는다");
  // 표시를 벗어나면 여전히 막지 않는다
  hit = null;
  env.scroll.fire("pointermove", { pointerType: "mouse", clientX: 300, clientY: 300 });
  assert.equal(env.calls.includes(true), false);
  // 다시 올려 300ms 가 지나면 카드가 열리고 그때 막는다
  hit = { page: 1, layer: "ref", id: "ref:10", data: cite(10, "[1]").data };
  env.scroll.fire("pointermove", { pointerType: "mouse", clientX: 15, clientY: 25 });
  assert.equal(env.calls.includes(true), false);
  await new Promise((r) => setTimeout(r, 380));
  assert.equal(env.calls[env.calls.length - 1], true);
  assert.equal(env.P.closeCard(), true);
  assert.equal(env.calls[env.calls.length - 1], false);
});

test("focusNext / focusPrev: 읽는 순서로 옮기고, 초점 표시와 안내문을 낸다", () => {
  const env = setup({ current: 1 });
  [1, 2, 3, 4].forEach((p) => env.S.checked.add(p));
  env.S.entries.set(1, [cite(10, "[1]"), xref(40, "fig", "그림 2", 2)]);
  env.S.entries.set(3, [cite(5, "[2]", [1])]);
  assert.equal(env.P.focusNext(), true);
  assert.deepEqual([env.P._focused().page, env.P._focused().start], [1, 10]);
  const live = env.reader.querySelector(".rd-ref-live");
  assert.ok(live, "안내문 영역");
  assert.equal(live.getAttribute("aria-live"), "polite");
  assert.match(live.textContent, /인용 \[1\].*Kim A/);
  // 겹침층에 is-focus 표시가 올라간다
  let pushed = env.rects.get("1:ref");
  assert.match(pushed[0].className, /is-focus/);
  assert.equal(env.P.focusNext(), true);
  assert.deepEqual([env.P._focused().page, env.P._focused().start], [1, 40]);
  assert.match(live.textContent, /그림 2.*2쪽/);
  assert.doesNotMatch(env.rects.get("1:ref")[0].className, /is-focus/);
  assert.match(env.rects.get("1:ref")[1].className, /is-focus/);
  assert.equal(env.P.focusNext(), true);
  assert.deepEqual([env.P._focused().page, env.P._focused().start], [3, 5]);
  assert.equal(env.P.focusNext(), false);
  assert.match(live.textContent, /마지막/);
  assert.equal(env.P.focusPrev(), true);
  assert.deepEqual([env.P._focused().page, env.P._focused().start], [1, 40]);
  assert.equal(env.P.focusPrev(), true);
  assert.equal(env.P.focusPrev(), false);
  assert.match(live.textContent, /첫/);
});

test("focusNext: 표시 없이 시작하면 현재 쪽의 첫 표시부터, 화면 밖이면 스크롤해 보이게 한다", () => {
  const env = setup({ current: 3 });
  [1, 2, 3, 4].forEach((p) => env.S.checked.add(p));
  env.S.entries.set(1, [cite(10, "[1]")]);
  env.S.entries.set(3, [cite(5, "[2]", [1]), cite(9, "[1]")]);
  assert.equal(env.P.focusNext(), true);
  assert.deepEqual([env.P._focused().page, env.P._focused().start], [3, 5]);
  assert.ok(env.scroll.scrollTop > 1000, "3쪽 위치로 스크롤: " + env.scroll.scrollTop);
});

test("focusNext: 아직 찾지 않은 쪽이 사이에 있으면 그 쪽부터 찾은 뒤 옮긴다", async () => {
  const env = setup({ current: 1, tm: (p) => (p === 2 ? { text: "앞 문장 [1] 뒤 문장", charBoxes: [], items: [], charItem: null } : { text: "표시 없음", charBoxes: [], items: [], charItem: null }) });
  env.S.checked.add(1);
  env.S.entries.set(1, [cite(10, "[1]")]);
  env.P.focusNext();
  assert.equal(env.P._focused().page, 1);
  assert.equal(env.P.focusNext(), true);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(env.P._focused().page, 2);
  assert.equal(env.S.checked.has(2), true);
});

test("activateFocused: 카드가 열리고 초점이 카드로 들어가며, 닫으면 원래 자리로 돌아온다", () => {
  const env = setup({ current: 1 });
  [1, 2, 3, 4].forEach((p) => env.S.checked.add(p));
  env.S.entries.set(1, [cite(10, "[1]", [0, 1]), xref(40, "table", "표 1", 2)]);
  const other = env.doc.createElement("button");
  env.reader.appendChild(other);
  other.focus();
  assert.equal(env.P.activateFocused(), false, "초점 표시가 없으면 아무것도 안 한다");
  env.P.focusNext();
  assert.equal(env.P.activateFocused(), true);
  const card = env.reader.querySelector(".rd-ref-pop");
  assert.equal(card.getAttribute("role"), "dialog");
  assert.equal(card.hidden, false);
  assert.equal(env.doc.activeElement, card, "초점이 카드 안으로");
  assert.equal(env.calls[env.calls.length - 1], true, "용어 카드는 막힌다");
  assert.equal(card.querySelectorAll(".rd-ref-item").length, 2);
  assert.equal(env.P.closeCard(), true);
  assert.equal(env.doc.activeElement, other, "초점 복귀");
  assert.equal(env.calls[env.calls.length - 1], false);
  // 표 미리보기도 키보드로 열면 "이동" 단추가 붙고 클릭을 받는다
  env.P.focusNext();
  assert.equal(env.P.activateFocused(), true);
  assert.ok(card.classList.contains("is-kbd"));
  assert.ok(card.querySelector(".rd-ref-prev-go"));
});

test("카드의 '이동' 을 누르면(Enter 는 단추의 click) 그 항목으로 이동하고 카드를 닫는다", () => {
  const env = setup({ current: 1 });
  [1, 2, 3, 4].forEach((p) => env.S.checked.add(p));
  env.S.entries.set(1, [cite(10, "[1]", [1])]);
  env.S.pageInfo = null;
  env.P.focusNext();
  env.P.activateFocused();
  const card = env.reader.querySelector(".rd-ref-pop");
  const go = card.querySelector(".rd-ref-go");
  assert.ok(go);
  const li = go.closest(".rd-ref-item");
  assert.equal(li.dataset.refIndex, "1");
  card.fire("click", { target: go });
  assert.equal(card.hidden, true);
  return new Promise((r) => setTimeout(r, 20)).then(() => {
    assert.ok(env.jumps.length >= 1);
    assert.equal(env.jumps[0].page, 9);
  });
});

test("카드 안에서 Tab 은 카드 밖으로 새지 않는다", () => {
  const env = setup({ current: 1 });
  [1, 2, 3, 4].forEach((p) => env.S.checked.add(p));
  env.S.entries.set(1, [cite(10, "[1]", [0])]);
  env.P.focusNext();
  env.P.activateFocused();
  const card = env.reader.querySelector(".rd-ref-pop");
  const btns = card.querySelectorAll("button");
  assert.equal(btns.length, 2);
  btns[1].focus();
  const ev = card.fire("keydown", { key: "Tab", shiftKey: false });
  assert.equal(ev.prevented, true);
  assert.equal(env.doc.activeElement, btns[0]);
  card.focus();
  const ev2 = card.fire("keydown", { key: "Tab", shiftKey: true });
  assert.equal(ev2.prevented, true);
  assert.equal(env.doc.activeElement, btns[1]);
});

test("위첨자 번호 인용: 글자 조각의 크기·기준선이 맞으면 등록하고, 조각이 없으면 등록하지 않는다", async () => {
  const body = "이 문단은 본문 글자 크기를 정하기 위한 충분히 긴 글이다. ".repeat(3) + "한다.";
  const items = [
    { str: body, transform: [10, 0, 0, 10, 50, 700], width: 300 },
    { str: "2)", transform: [6, 0, 0, 6, 350, 704], width: 6 },
    { str: " 다음 문장", transform: [10, 0, 0, 10, 356, 700], width: 40 },
  ];
  const text = items.map((i) => i.str).join("");
  const charItem = [];
  items.forEach((it, i) => { for (let k = 0; k < it.str.length; k++) charItem.push(i); });
  const env = setup({ tm: () => ({ text, charBoxes: [], items, charItem: Int32Array.from(charItem) }) });
  // registerPage 는 내부 함수이므로 pagerendered 이벤트로 부른다
  env.S.pagesReady.add(1);
  env.reader.fire("reader:pagerendered", { detail: { page: 1 } });
  await new Promise((r) => setTimeout(r, 20));
  const list = env.S.entries.get(1) || [];
  assert.equal(list.length, 1);
  assert.equal(list[0].data.style, "superscript");
  assert.equal(JSON.stringify(list[0].data.refs), "[1]");
  // 조각이 없으면(기하를 모르면) 아무것도 등록하지 않는다
  const env2 = setup({ tm: () => ({ text, charBoxes: [], items: null, charItem: null }) });
  env2.reader.fire("reader:pagerendered", { detail: { page: 1 } });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((env2.S.entries.get(1) || []).length, 0);
});
