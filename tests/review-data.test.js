const test = require("node:test");
const assert = require("node:assert");
const { fingerprints } = require("../scripts/review-data.js");

const page = (def, easy, caution, extra) => `<main><div class="definition-box"><p>${def}</p></div>
<h2>쉽게 풀면</h2><p>${easy}</p>
<h2>조금 더 깊게 보면</h2><p>심화 ${extra || ""}</p>
<h2>주의할 점</h2><p>${caution}</p>
<h2>관련 용어</h2><div class="related-terms"><a href="x.html">엑스</a></div></main>`;

test("덧붙이기만 하면 core 지문은 그대로, full 만 바뀐다", () => {
  const a = fingerprints(page("정의", "풀이", "주의"));
  const b = fingerprints(page("정의", "풀이", "주의", "새 문단"));
  assert.strictEqual(a.core, b.core);
  assert.notStrictEqual(a.full, b.full);
});

test("정의·쉬운 풀이·주의할 점이 바뀌면 core 지문이 바뀐다", () => {
  const a = fingerprints(page("정의", "풀이", "주의"));
  assert.notStrictEqual(a.core, fingerprints(page("정의 수정", "풀이", "주의")).core);
  assert.notStrictEqual(a.core, fingerprints(page("정의", "풀이 수정", "주의")).core);
  assert.notStrictEqual(a.core, fingerprints(page("정의", "풀이", "주의 수정")).core);
});

test("관련 용어 블록과 태그·공백 차이는 지문에 영향을 주지 않는다", () => {
  const a = fingerprints(page("정의", "풀이", "주의"));
  const b = fingerprints(page("정의", "풀이", "주의").replace('<a href="x.html">엑스</a>', '<a href="y.html">와이</a>').replace("<p>정의</p>", "<p>\n  정의\n</p>"));
  assert.strictEqual(a.core, b.core);
  assert.strictEqual(a.full, b.full);
});
