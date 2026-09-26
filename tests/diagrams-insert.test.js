// 도식 페이지 삽입: 위치, 범용 도식 교체, 재실행 안전성, 제거
const assert = require("assert");
const { applyDiagram, removeDiagram, START, END } = require("../scripts/diagrams/insert.js");

const page = `<main>
  <h1>용어</h1>
  <div class="definition-box">
    <strong>한 줄 정의:</strong> 설명
  </div>

  <figure class="term-figure">
    <svg viewBox="0 0 1 1"></svg>
    <figcaption>범용</figcaption>
  </figure>

  <h2>쉽게 풀면</h2>
</main>`;

// 정의 박스 바로 뒤에 들어가고, 범용 도식은 빠진다
const once = applyDiagram(page, '<figure class="concept-diagram">A</figure>');
assert.ok(once.includes(START) && once.includes(END));
assert.ok(!once.includes("term-figure"), "범용 도식은 교체돼야 함");
assert.ok(once.indexOf(START) > once.indexOf("definition-box") && once.indexOf(START) < once.indexOf("쉽게 풀면"));

// 재실행 안전: 같은 입력이면 그대로, 다른 도식이면 블록만 교체(중복 없음)
assert.strictEqual(applyDiagram(once, '<figure class="concept-diagram">A</figure>'), once);
const twice = applyDiagram(once, '<figure class="concept-diagram">B</figure>');
assert.strictEqual((twice.match(/concept-diagram:start/g) || []).length, 1);
assert.ok(twice.includes(">B<") && !twice.includes(">A<"));

// 제거하면 마커가 사라지고 나머지 본문은 유지
const gone = removeDiagram(twice);
assert.ok(!gone.includes("concept-diagram") && gone.includes("쉽게 풀면") && gone.includes("definition-box"));

// 윈도 체크아웃(CRLF)에서도 찾아서 넣고, 새 줄도 CRLF로 쓴다
{
  const crlf = page.replace(/\n/g, "\r\n");
  const out = applyDiagram(crlf, '<figure class="concept-diagram">A</figure>');
  assert.ok(out, "CRLF 페이지에서 정의 박스를 못 찾음");
  assert.ok(!/[^\r]\n/.test(out), "LF 단독 줄끝이 섞이면 안 됨");
  assert.ok(!out.includes("term-figure"));
  assert.ok(!removeDiagram(out).includes("concept-diagram"));
}

// 정의 박스가 없는 페이지(리다이렉트 스텁)는 null
assert.strictEqual(applyDiagram("<html><body>moved</body></html>", "<figure/>"), null);

console.log("diagrams-insert: all tests passed");
