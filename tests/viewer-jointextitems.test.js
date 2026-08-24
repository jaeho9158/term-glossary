const assert = require("assert");
const { joinTextItems } = require("../assets/viewer.js");

// pdf.js text items: {str, transform: [scaleX, skewY, skewX, scaleY, x, y], width, hasEOL}.
// height is derived from |transform[3]|; word-internal splits sit right next
// to each other (near-zero gap), a real space has a gap close to the glyph
// advance width of a space character (roughly comparable to font height).
function item(str, x, y, width, fontSize = 12, extra = {}) {
  return { str, transform: [fontSize, 0, 0, fontSize, x, y], width, ...extra };
}

// Test 1: a single word split across two adjacent items (font-run change,
// kerning) with no real gap between them must NOT get a space inserted.
// This is the exact bug that made "분산분석" extract as "분산 분석" and
// corrupted matching/highlighting.
{
  const items = [item("분산", 0, 700, 24, 12), item("분석", 24, 700, 24, 12)];
  const text = joinTextItems(items);
  assert.strictEqual(text, "분산분석", "no space should be inserted between items with no real gap");
}

// Test 2: two genuinely separate words with a normal inter-word gap DO get
// a space, so real word boundaries are still preserved.
{
  const items = [item("결론이", 0, 700, 36, 12), item("근거에", 40, 700, 36, 12)];
  const text = joinTextItems(items);
  assert.strictEqual(text, "결론이 근거에", "a real inter-word gap should still produce a space");
}

// Test 3: items on a different line (new row of a table, or a wrapped line)
// are joined with a newline rather than run together with no separator at all.
{
  const items = [item("첫줄", 0, 700, 24, 12), item("둘째줄", 0, 680, 30, 12)];
  const text = joinTextItems(items);
  assert.strictEqual(text, "첫줄\n둘째줄", "items on a different line should be separated by a newline");
}

// Test 4: an item whose str already starts with a space is not double-spaced.
{
  const items = [item("결론이", 0, 700, 36, 12), item(" 근거에", 40, 700, 42, 12)];
  const text = joinTextItems(items);
  assert.strictEqual(text, "결론이 근거에", "should not insert a duplicate space when the item text already has one");
}

console.log("joinTextItems: all tests passed");
