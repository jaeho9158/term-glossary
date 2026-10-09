// 틀 렌더링: 접근성 구조, 링크/굵게/평문, 마커 삽입의 멱등·제거·개행 보존, 미리보기, CSS 변수 사용
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createResolver, resolveBox } = require("../scripts/navbox/resolve.js");
const { renderNavbox, insertNavbox, pagesFor, previewDoc } = require("../scripts/navbox/render.js");

const terms = [
  { slug: "hippocampus", title_ko: "해마", title_en: "Hippocampus" },
  { slug: "amygdala", title_ko: "편도체", title_en: "Amygdala" },
  { slug: "old-thing", title_ko: "옛것", title_en: "Old thing" },
];
const r = createResolver({ terms, archive: new Set(["old-thing"]) });
const box = { id: "mini", title: "미니 <틀>", groups: [
  { label: "구조", groups: [{ label: "피질하", items: ["해마", { label: "편도체", sub: ["핵"] }, "옛것", "없는말"] }] },
  { label: "기능", items: ["해마"] },
] };
const rep = resolveBox(box, r);
const html = renderNavbox(box, rep.results, { current: "hippocampus" });

assert.ok(/^<nav class="navbox" aria-labelledby="navbox-mini-t"/.test(html) && html.includes("<details>") && html.includes("<summary>"));
assert.ok(renderNavbox(box, rep.results, { open: true }).includes("<details open>"));
assert.ok(html.includes("미니 &lt;틀&gt;"), "제목 이스케이프");
assert.strictEqual((html.match(/<table /g) || []).length, 2, "최상위 표 + 중첩 표 1개");
assert.ok(/<th scope="row">구조<\/th>/.test(html) && /<th scope="row">피질하<\/th>/.test(html), "행 머리글");
assert.ok(html.includes('<a href="amygdala.html">편도체</a>') && html.includes('<span class="navbox-paren">(</span>'));
assert.ok(html.includes('<strong class="navbox-current" aria-current="page">해마</strong>'), "현재 페이지는 굵게");
assert.ok(html.includes('<a href="hippocampus.html">') === false || html.split('href="hippocampus.html"').length === 1, "현재 페이지 항목은 링크 없음");
assert.ok(html.includes('<span class="navbox-plain">없는말</span>') && html.includes('<span class="navbox-plain">핵</span>'), "용어 없음은 평문");
assert.ok(html.includes('<span class="navbox-plain">옛것</span>'), "보관 등급은 기본이 평문");
assert.ok(renderNavbox(box, rep.results, { archiveLinks: true }).includes('href="old-thing.html"'));
assert.ok(html.includes("6개 항목"), "항목 수 표시");
assert.deepStrictEqual([...pagesFor(rep)].sort(), ["amygdala", "hippocampus"]);
assert.deepStrictEqual([...pagesFor(rep, { archiveLinks: true })].sort(), ["amygdala", "hippocampus", "old-thing"]);

// 삽입: 개념 계통 뒤 → 없으면 '관련 용어' 앞 → 없으면 </main> 앞
const page = '<head>\r\n<link rel="stylesheet" href="../style.css">\r\n<link rel="stylesheet" href="../assets/term-nav.css">\r\n</head>\r\n<main>\r\n  <h1>해마</h1>\r\n  <!-- concept-family:start --><section>계통</section><!-- concept-family:end -->\r\n  <h2>관련 용어</h2>\r\n</main>';
const once = insertNavbox(page, html);
assert.ok(once.indexOf("concept-family:end") < once.indexOf("navbox:start") && once.indexOf("navbox:end") < once.indexOf("관련 용어"));
assert.ok(once.includes('<link rel="stylesheet" href="../assets/navbox.css">'));
assert.strictEqual(insertNavbox(once, html), once, "재실행해도 같음");
assert.ok(!/[^\r]\n/.test(once), "CRLF 유지");
assert.strictEqual(insertNavbox(once, ""), page, "제거하면 원문 복원(링크 포함)");
const lf = '<head>\n<link rel="stylesheet" href="../style.css">\n</head>\n<main>\n  <h1>x</h1>\n  <h2>관련 용어</h2>\n</main>';
const lf1 = insertNavbox(lf, html);
assert.ok(lf1.indexOf("navbox:start") < lf1.indexOf("관련 용어") && !lf1.includes("\r"));
assert.strictEqual(insertNavbox(lf1, ""), lf);
const noRel = insertNavbox("<main>\n  <h1>x</h1>\n</main>", html);
assert.ok(noRel.indexOf("navbox:end") < noRel.indexOf("</main>"));
assert.strictEqual(insertNavbox("<p>본문만</p>", html), null, "삽입 위치가 없으면 건드리지 않음(null)");

// 미리보기 문서
const doc = previewDoc(box, rep.results, { cssBase: "file:///x/", theme: "dark" });
assert.ok(doc.includes('data-theme="dark"') && doc.includes('href="file:///x/assets/navbox.css"') && doc.includes('name="viewport"') && doc.includes("<details open>"));

// CSS: 사이트 변수만 쓰고(하드코딩 색 없음), 폰 쌓기 규칙이 있다
const css = fs.readFileSync(path.join(__dirname, "..", "assets", "navbox.css"), "utf8");
assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(css), "하드코딩 색 금지");
for (const v of ["--card-bg", "--border", "--text", "--muted", "--accent", "--accent-soft", "--hover-tint"]) assert.ok(css.includes(`var(${v})`), v);
assert.ok(/@media \(max-width: 640px\)[\s\S]*display: block/.test(css));
