const test = require("node:test");
const assert = require("node:assert");
const { findSelectionInText } = require("../assets/viewer.js");

test("findSelectionInText: 정확히 일치하면 원문 오프셋을 돌려준다", () => {
  const t = "가나다 라마바 사아자";
  const r = findSelectionInText(t, "라마바");
  assert.strictEqual(t.slice(r.start, r.end), "라마바");
});

test("findSelectionInText: 공백·줄바꿈 차이를 무시한다", () => {
  const t = "alpha beta\n  gamma   delta";
  const r = findSelectionInText(t, "beta gamma delta");
  assert.strictEqual(t.slice(r.start, r.end), "beta\n  gamma   delta");
});

test("findSelectionInText: 긴 선택은 앞 20글자로 재시도한다", () => {
  const t = "The quick brown fox jumps over the lazy dog";
  const r = findSelectionInText(t, "The quick brown fox jumps over a different tail");
  assert.strictEqual(t.slice(r.start, r.end), "The quick brown fox");
});

test("findSelectionInText: 없거나 빈 입력이면 null", () => {
  assert.strictEqual(findSelectionInText("abc", "xyz"), null);
  assert.strictEqual(findSelectionInText("", "a"), null);
  assert.strictEqual(findSelectionInText("abc", "  "), null);
});
