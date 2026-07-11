const assert = require("assert");
const { termCardHTML } = require("../assets/viewer.js");

// Test 1: renders Korean name, English name, definition, and detail link
{
  const html = termCardHTML({
    slug: "p-value",
    title_ko: "유의확률",
    title_en: "p-value",
    definition: "지금 관찰된 결과가 우연히 나왔을 가능성을 나타내는 숫자입니다.",
  });
  assert.ok(html.includes('data-slug="p-value"'), "should carry the slug as a data attribute");
  assert.ok(html.includes("유의확률"), "should show the Korean name");
  assert.ok(html.includes("(p-value)"), "should show the English name in parentheses");
  assert.ok(
    html.includes("지금 관찰된 결과가 우연히 나왔을 가능성을 나타내는 숫자입니다."),
    "should show the one-line definition"
  );
  assert.ok(html.includes('href="terms/p-value.html"'), "should link to the detail page");
}

// Test 2: omits the definition paragraph entirely when definition is missing
{
  const html = termCardHTML({ slug: "unknown-term", title_ko: "알수없음", title_en: "" });
  assert.ok(!html.includes("term-card-definition"), "should not render a definition paragraph at all");
}

// Test 3: escapes HTML special characters in the definition text
{
  const html = termCardHTML({
    slug: "x",
    title_ko: "테스트",
    title_en: "",
    definition: 'a < b & "c"',
  });
  assert.ok(html.includes("a &lt; b &amp; &quot;c&quot;"), "should escape <, &, and \" in the definition");
  assert.ok(!html.includes('a < b & "c"'), "should not contain the raw unescaped definition");
}

console.log("termCardHTML: all tests passed");
