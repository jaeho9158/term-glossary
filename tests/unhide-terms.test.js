const test = require("node:test");
const assert = require("node:assert");
const { restoreLinks, insertMissing } = require("../scripts/unhide-terms.js");
const { unlinkHidden } = require("../scripts/hide-terms.js");

const T = new Set(["alpha"]);
const tagHtml = '<p>앞 문장에서 <a href="alpha.html">알파 용어</a>를 쓴다. 그리고 다른 <a href="beta.html">베타</a>도 있다.</p>';

test("숨김으로 벗긴 링크를 같은 문맥에서 되돌리고, 다시 돌려도 그대로다", () => {
  const hidden = unlinkHidden(tagHtml, T);
  assert.notStrictEqual(hidden, tagHtml);
  const r = restoreLinks(tagHtml, hidden, T);
  assert.strictEqual(r.html, tagHtml);
  assert.deepStrictEqual([r.restored, r.failed], [1, 0]);
  const again = restoreLinks(tagHtml, r.html, T);
  assert.strictEqual(again.html, tagHtml);
  assert.deepStrictEqual([again.restored, again.already, again.failed], [0, 1, 0]);
});

test("문맥이 다르면 같은 글자라도 건드리지 않고 실패로 센다", () => {
  const cur = "<p>전혀 다른 문장에 알파 용어가 나온다.</p>";
  const r = restoreLinks(tagHtml, cur, T);
  assert.strictEqual(r.html, cur);
  assert.strictEqual(r.failed, 1);
});

test("span 없이 글자만 남은 목록 항목도 되돌린다", () => {
  const tag = '<ul>\n<li><a href="terms/alpha.html">알파 (Alpha)</a></li>\n</ul>';
  const cur = "<ul>\n<li>알파 (Alpha)</li>\n</ul>";
  assert.strictEqual(restoreLinks(tag, cur, T, { inTerms: false }).html, tag);
});

test("insertMissing은 태그 판 위치에 끼운다", () => {
  assert.deepStrictEqual(insertMissing(["a", "c"], ["a", "alpha", "c"], T), ["a", "alpha", "c"]);
  assert.deepStrictEqual(insertMissing(["a", "alpha", "c"], ["a", "alpha", "c"], T), ["a", "alpha", "c"]);
});
