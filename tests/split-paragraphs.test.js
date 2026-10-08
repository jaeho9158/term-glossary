const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { splitParagraph, splitSentences, splitPageHtml, strip } = require("../scripts/lib/split-paragraphs.js");
const { fingerprints } = require("../scripts/review-data.js");

const S = (n, tag = "문장입니다") => `${"가".repeat(n)} ${tag}.`; // 대략 길이 조절용
const long = (...sents) => sents.join(" ");
const A = "첫째 문장은 충분히 길게 써서 사십 자를 넘기도록 합니다 가나다라마바사 아자차카타파하 가나다라마바사 아자차카타파하.";
const B = "둘째 문장도 비슷하게 길게 써서 사십 자를 넘기도록 합니다 가나다라마바사 아자차카타파하 가나다라마바사 아자차카타파하.";
const C = "셋째 문장도 비슷하게 길게 써서 사십 자를 넘기도록 합니다 가나다라마바사 아자차카타파하 가나다라마바사 아자차카타파하.";
const D = "넷째 문장도 비슷하게 길게 써서 사십 자를 넘기도록 합니다 가나다라마바사 아자차카타파하 가나다라마바사 아자차카타파하.";
const E = "다섯째 문장도 비슷하게 길게 써서 사십 자를 넘기도록 합니다 가나다라마바사 아자차카타파하 가나다라마바사 아자차카타파하.";

test("짧은 단락(250자 이하)은 그대로", () => {
  assert.deepStrictEqual(splitParagraph(long(A, B)), [long(A, B)]);
});

test("250자 초과 + 3문장 이상이면 분할, 텍스트 보존", () => {
  const inner = long(A, B, C, D, E);
  const parts = splitParagraph(inner);
  assert.ok(parts.length >= 2);
  assert.strictEqual(parts.join(" "), inner);
  for (const p of parts) assert.ok((p.match(/\.(\s|$)/g) || []).length <= 3);
});

test("2문장 이하는 길어도 그대로", () => {
  const big = "가".repeat(200) + ". " + "나".repeat(200) + ".";
  assert.deepStrictEqual(splitParagraph(big), [big]);
});

test("괄호·따옴표 안의 마침표에서는 자르지 않는다", () => {
  const s = splitSentences('가는 (예: 이렇다. 저렇다.) 나다. “그렇다. 맞다.” 다. "또 그렇다. 맞다." 끝. 마지막입니다.');
  assert.strictEqual(s.length, 4);
});

test("소수점·약어·이니셜·번호에서는 자르지 않는다", () => {
  const txt = "값은 3.5 정도이다. e.g. 예시는 이렇다. Smith et al. 은 보고했다. A vs. B 비교다. J. Smith 는 말했다. 1. 첫 항목이다. 끝이다.";
  const s = splitSentences(txt).map((x) => x.html);
  assert.deepStrictEqual(s, ["값은 3.5 정도이다.", "e.g. 예시는 이렇다.", "Smith et al. 은 보고했다.", "A vs. B 비교다.", "J. Smith 는 말했다.", "1. 첫 항목이다.", "끝이다."]);
});

test("열린 인라인 요소 안에서는 자르지 않는다", () => {
  const s = splitSentences('<a href="x.html">링크 안. 문장</a> 이다. <strong>강조.</strong> 끝. 다음이다.');
  assert.strictEqual(s.length, 3);
  assert.ok(s[0].html.endsWith("이다."));
});

test("태그 속성의 마침표는 무시", () => {
  const s = splitSentences('<a href="a.b.html">가</a>다. 나다. 다다.');
  assert.strictEqual(s.length, 3);
});

test("한 문장짜리 짧은 꼬리 문단은 앞 문단에 합친다", () => {
  const inner = long(A, B, C, D, "짧은 끝.");
  const parts = splitParagraph(inner);
  assert.ok(!parts.includes("짧은 끝."));
  assert.strictEqual(parts.join(" "), inner);
});

test("페이지 단위: 속성·들여쓰기·CRLF 보존, 멱등, 텍스트 동일", () => {
  const inner = long(A, B, C, D, E);
  for (const eol of ["\n", "\r\n"]) {
    const html = `<main>${eol}  <h2>쉽게 풀면</h2>${eol}  <p class="x">${inner}</p>${eol}${eol}  <h2>관련 용어</h2>${eol}  <p>${inner}</p>${eol}</main>`;
    const r = splitPageHtml(html);
    assert.ok(r.changed === 1);
    assert.strictEqual(strip(r.html), strip(html));
    assert.ok(r.html.includes(`</p>${eol}  <p class="x">`));
    assert.ok(!/\r?\n/.test(r.html.replace(new RegExp(eol, "g"), "")), "섞인 줄바꿈 없음");
    assert.strictEqual(splitPageHtml(r.html).html, r.html);
  }
});

test("목록·그림·복수 <p> 섹션은 건드리지 않는다", () => {
  const inner = long(A, B, C, D, E);
  const cases = [
    `<h2>쉽게 풀면</h2>\n  <p>${inner}</p>\n  <ul><li>x</li></ul>\n\n  <h2>주의할 점</h2>\n  <p>짧다.</p>`,
    `<h2>쉽게 풀면</h2>\n  <p>${inner}</p>\n  <figure class="concept-diagram"></figure>\n\n  <h2>주의할 점</h2>\n  <p>짧다.</p>`,
    `<h2>쉽게 풀면</h2>\n  <p>${inner}</p>\n  <p>${inner}</p>\n\n  <h2>주의할 점</h2>\n  <p>짧다.</p>`,
  ];
  for (const c of cases) assert.strictEqual(splitPageHtml(c).changed, 0);
});

test("실제 페이지: 텍스트·검수 지문 동일, 멱등 (표본)", () => {
  const dir = path.join(__dirname, "..", "terms");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort().filter((_, i) => i % 150 === 0).slice(0, 25);
  for (const f of files) {
    const html = fs.readFileSync(path.join(dir, f), "utf8");
    const r = splitPageHtml(html);
    assert.strictEqual(strip(r.html), strip(html), f);
    assert.strictEqual(splitPageHtml(r.html).html, r.html, f);
    const a = fingerprints(html), b = fingerprints(r.html);
    if (a) assert.deepStrictEqual(b, a, f);
  }
});
