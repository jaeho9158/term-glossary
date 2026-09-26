// 개념 계통: 검증(사이클·없는 slug), 경로·계통 블록 삽입, 재실행 안전성, 제거
const assert = require("assert");
const { validate, buildIndex, pathHtml, familyHtml, applyBlocks, mapPage } = require("../scripts/taxonomy/build.js");

const known = new Set(["ns", "pns", "sns", "ans", "symp", "para"]);
const links = {
  pns: { broader: "ns", relation: "part-of" },
  sns: { broader: "pns", relation: "part-of" },
  ans: { broader: "pns", relation: "part-of" },
  symp: { broader: "ans", relation: "part-of" },
  para: { broader: "ans", relation: "part-of" },
};
const titles = new Map([["ns", "신경계"], ["pns", "말초신경계"], ["sns", "체성신경계"], ["ans", "자율신경계"], ["symp", "교감신경계"], ["para", "부교감신경계"]]);

assert.deepStrictEqual(validate(links, known), []);
assert.ok(validate({ ...links, ns: { broader: "symp", relation: "part-of" } }, known).some((e) => e.includes("사이클")));
assert.ok(validate({ zz: { broader: "ns", relation: "type-of" } }, known).some((e) => e.includes("없음")));

const idx = buildIndex(links);
assert.deepStrictEqual(idx.ancestors("symp"), ["ns", "pns", "ans"]);
const p = pathHtml("symp", idx, titles);
assert.ok(p.indexOf("신경계") < p.indexOf("자율신경계") && p.includes('aria-current="page">교감신경계'));
assert.strictEqual(pathHtml("ns", idx, titles), "");
const f = familyHtml("ans", links, idx, titles, "../concept-map/neuro.html");
assert.ok(f.includes("상위 개념") && f.includes("말초신경계") && f.includes("체성신경계") && f.includes("교감신경계"));

const page = "<main>\r\n  <h1>자율신경계</h1>\r\n  <p>본문</p>\r\n  <h2>관련 용어</h2>\r\n</main>";
const once = applyBlocks(page, p, f);
assert.ok(once.indexOf("concept-path:start") > once.indexOf("</h1>"));
assert.ok(once.indexOf("concept-family:start") < once.indexOf("관련 용어"));
assert.strictEqual(applyBlocks(once, p, f), once, "재실행해도 같아야 함");
assert.ok(!/[^\r]\n/.test(once), "CRLF 유지");
const gone = applyBlocks(once, "", "");
assert.strictEqual(gone, page, "블록 제거 시 원문 복원");

// 같은 갈래가 12개를 넘으면 "외 N개"가 개념 지도의 뿌리 카드로 링크된다
{
  const many = {};
  const t2 = new Map([["root", "뿌리"]]);
  for (let i = 0; i < 15; i++) { many[`k${i}`] = { broader: "root", relation: "type-of" }; t2.set(`k${i}`, `갈래${i}`); }
  const ix = buildIndex(many);
  const fam = familyHtml("k0", many, ix, t2, "../concept-map/x.html");
  assert.ok(fam.includes('href="../concept-map/x.html#r-root"') && fam.includes("외 2개"));
  // 개념 지도: 갈래가 8개를 넘는 뿌리는 세부 없는 갈래를 칩 한 줄로 모으고, 카드에 앵커 id를 단다
  many.leaf = { broader: "k1", relation: "type-of" }; t2.set("leaf", "세부");
  const ix2 = buildIndex(many);
  const tpl = "<html><head><title>x</title><meta name=\"description\" content=\"\"><link rel=\"canonical\" href=\"\"></head><body><main></main></body></html>";
  const html = mapPage("x", "분야", Object.keys(many).concat("root"), ix2, t2, tpl, new Map());
  assert.ok(html.includes('id="r-root"'));
  assert.ok(html.includes("cmap-branch-flat"), "세부 없는 갈래는 칩 행으로");
  assert.ok((html.match(/cmap-leaf-branch/g) || []).length === 14);
  assert.ok((html.match(/class="cmap-branch"/g) || []).length === 1, "세부 있는 갈래만 행으로");
  assert.ok(html.includes("cmap-card-wide"), "큰 계통 카드는 격자 한 줄 전체");
}

console.log("taxonomy-build: all tests passed");
