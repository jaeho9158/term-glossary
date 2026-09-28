// generate-category-pages.js를 단독으로 돌려도 개념 지도 링크(taxonomy/build.js가 넣는 블록)가 남는다.
const test = require("node:test");
const assert = require("assert");
const { preserveHubLink } = require("../scripts/generate-category-pages.js");

const block = '<p class="concept-map-cta"><a href="../concept-map/med.html">개념 지도로 계통 한눈에 보기 →</a></p>';
const oldHtml = `<main>\n  <h1>의학</h1>\n  <p class="subtitle">소개</p>\n  <!-- concept-map-link:start -->${block}<!-- concept-map-link:end -->\n  <p>총 1개</p>\n</main>`;
const fresh = `<main>\n  <h1>의학</h1>\n  <p class="subtitle">소개</p>\n  <p>총 2개</p>\n</main>`;

test("기존 블록을 새 페이지의 부제 아래에 다시 넣는다", () => {
  const out = preserveHubLink(oldHtml, fresh);
  assert.ok(out.includes(`<p class="subtitle">소개</p>\n  <!-- concept-map-link:start -->${block}<!-- concept-map-link:end -->\n  <p>총 2개</p>`));
  assert.strictEqual(preserveHubLink(out, out), out, "재실행해도 같다");
});

test("기존 파일에 블록이 없거나 파일이 없으면 그대로 둔다", () => {
  assert.strictEqual(preserveHubLink(fresh, fresh), fresh);
  assert.strictEqual(preserveHubLink("", fresh), fresh);
});
