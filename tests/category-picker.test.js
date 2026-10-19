const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../assets/category-picker.js");
const { CATEGORY_GROUPS, CATEGORY_LABELS } = require("../assets/category-data.js");

const items = ["stat", "phys", "chem", "med", "zzz-old"].map((v) => ({ value: v, label: CATEGORY_LABELS[v] || v }));

test("묶음은 CATEGORY_GROUPS 순서를 따르고, 없는 코드는 '그 밖의 분야'로 간다", () => {
  const s = P.buildSections(items, CATEGORY_GROUPS, "", [], "전체 분야");
  assert.deepEqual(s.map((x) => x.label), ["", "연구 기초·방법", "자연과학", "의학·생명", "그 밖의 분야"]);
  assert.deepEqual(s[2].items.map((i) => i.value), ["phys", "chem"]);
  assert.equal(s[0].items[0].value, "");
});

test("최근 선택은 검색어가 없을 때 '전체' 아래에 붙는다", () => {
  const s = P.buildSections(items, CATEGORY_GROUPS, "", ["med", "gone"], "전체 분야");
  assert.deepEqual(s[0].items.map((i) => [i.value, !!i.recent]), [["", false], ["med", true]]);
});

test("검색어로 이름을 거르고 빈 묶음은 뺀다", () => {
  const s = P.buildSections(items, CATEGORY_GROUPS, "화학", ["med"], "전체 분야");
  assert.deepEqual(s.map((x) => x.label), ["자연과학"]);
  assert.deepEqual(s[0].items.map((i) => i.value), ["chem"]);
  assert.equal(P.buildSections(items, CATEGORY_GROUPS, "없는말", [], "전체 분야").length, 0);
});

test("그룹 렌더링: 묶음 제목·option role·선택 표시", () => {
  const html = P.sectionsHTML(P.buildSections(items, CATEGORY_GROUPS, "", [], "전체 분야"), "t", "chem");
  assert.match(html, /class="cat-picker-group"[^>]*>자연과학</);
  assert.equal((html.match(/role="option"/g) || []).length, items.length + 1);
  assert.match(html, /data-value="chem" aria-selected="true"/);
  assert.match(P.sectionsHTML([], "t", ""), /맞는 분야가 없어요/);
});

test("선택하면 select.value를 바꾸고 change를 한 번 쏜다", () => {
  const events = [];
  const select = { value: "", dispatchEvent(e) { events.push([e.type, e.bubbles, this.value]); return true; } };
  assert.equal(P.commit(select, "phys"), true);
  assert.deepEqual(events, [["change", true, "phys"]]);
  assert.equal(P.commit(select, "phys"), false);
  assert.equal(events.length, 1);
});

test("최근 선택은 3개까지, localStorage가 막혀도 던지지 않는다", () => {
  const saved = globalThis.localStorage;
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  ["a", "b", "c", "d", "b"].forEach(P.saveRecent);
  assert.deepEqual(P.loadRecent(), ["b", "d", "c"]);
  globalThis.localStorage = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } };
  assert.deepEqual(P.loadRecent(), []);
  assert.doesNotThrow(() => P.saveRecent("a"));
  globalThis.localStorage = saved;
});
