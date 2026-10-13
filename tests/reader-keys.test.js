// assets/reader/reader.js 의 순수 부분(keyAction) 검증: 스펙 §3.4 키보드 표.
const test = require("node:test");
const assert = require("node:assert");
const { keyAction } = require("../assets/reader/reader.js");

function k(key, extra) {
  return keyAction(Object.assign({ key: key, ctrlKey: false, metaKey: false, shiftKey: false, targetIsInput: false, inSearchInput: false }, extra || {}));
}

test("Ctrl+F / Cmd+F: 검색 입력으로 (입력란 안에서도)", () => {
  assert.strictEqual(k("f", { ctrlKey: true }), "search");
  assert.strictEqual(k("F", { ctrlKey: true }), "search");
  assert.strictEqual(k("f", { metaKey: true }), "search");
  assert.strictEqual(k("f", { ctrlKey: true, targetIsInput: true }), "search");
  assert.strictEqual(k("f"), null);
  assert.strictEqual(k("f", { ctrlKey: true, shiftKey: true }), null);
});

test("검색 입력에서 Enter / Shift+Enter: 다음 / 이전 결과", () => {
  assert.strictEqual(k("Enter", { inSearchInput: true, targetIsInput: true }), "search-next");
  assert.strictEqual(k("Enter", { inSearchInput: true, targetIsInput: true, shiftKey: true }), "search-prev");
  assert.strictEqual(k("Enter"), null);
  assert.strictEqual(k("Enter", { targetIsInput: true }), null);
});

test("Ctrl + + / − / 0: 확대 / 축소 / 너비 맞춤 (Mac 의 Cmd 도 같다)", () => {
  assert.strictEqual(k("+", { ctrlKey: true }), "zoom-in");
  assert.strictEqual(k("=", { ctrlKey: true }), "zoom-in");
  assert.strictEqual(k("-", { ctrlKey: true }), "zoom-out");
  assert.strictEqual(k("_", { ctrlKey: true, shiftKey: true }), "zoom-out");
  assert.strictEqual(k("0", { ctrlKey: true }), "fit-width");
  assert.strictEqual(k("+", { metaKey: true }), "zoom-in");
  assert.strictEqual(k("-", { metaKey: true }), "zoom-out");
  assert.strictEqual(k("0", { metaKey: true }), "fit-width");
  assert.strictEqual(k("+"), null);
  assert.strictEqual(k("0"), null);
  assert.strictEqual(k("a", { ctrlKey: true }), null);
});

test("← → PageUp PageDown: 쪽 이동", () => {
  assert.strictEqual(k("ArrowRight"), "page-next");
  assert.strictEqual(k("PageDown"), "page-next");
  assert.strictEqual(k("ArrowLeft"), "page-prev");
  assert.strictEqual(k("PageUp"), "page-prev");
  assert.strictEqual(k("ArrowDown"), null);
  assert.strictEqual(k("ArrowUp"), null);
  // 글자 선택을 넓히는 Shift+화살표는 가로채지 않는다
  assert.strictEqual(k("ArrowRight", { shiftKey: true }), null);
  assert.strictEqual(k("ArrowRight", { altKey: true }), null);
});

test("[ ]: 왼쪽 / 오른쪽 패널 여닫기", () => {
  assert.strictEqual(k("["), "toggle-left");
  assert.strictEqual(k("]"), "toggle-right");
  assert.strictEqual(k("[", { ctrlKey: true }), null);
});

test("Esc: 항상 escape", () => {
  assert.strictEqual(k("Escape"), "escape");
  assert.strictEqual(k("Escape", { targetIsInput: true }), "escape");
  assert.strictEqual(k("Escape", { inSearchInput: true, targetIsInput: true }), "escape");
});

test("입력란에 초점이 있으면 [ ] 와 화살표·PageUp/PageDown 은 null (Esc 와 Ctrl+F 는 동작)", () => {
  ["[", "]", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"].forEach((key) => {
    assert.strictEqual(k(key, { targetIsInput: true }), null, key);
  });
  assert.strictEqual(k("Escape", { targetIsInput: true }), "escape");
  assert.strictEqual(k("f", { ctrlKey: true, targetIsInput: true }), "search");
});

test("그 밖의 키는 null", () => {
  ["a", "Enter", "Tab", " ", "Home", "End", "F5", "ArrowUp", "ArrowDown"].forEach((key) => assert.strictEqual(k(key), null, key));
  assert.strictEqual(keyAction(null), null);
});
