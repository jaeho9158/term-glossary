// scripts/apply-term-extras.js : 멱등성, 이스케이프, 스텁 보호, 실제 논문 인용 렌더링, 파일럿 데이터 무결성.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { TYPE_HEADINGS, applyToHtml, renderUsage, renderTable, sanitizeFragment, linkify, stripAll } = require("../scripts/apply-term-extras.js");
const { fingerprints } = require("../scripts/review-data.js");

const ROOT = path.join(__dirname, "..");
const EXTRAS_DIR = path.join(ROOT, "data", "term-extras");
const USAGE_DIR = path.join(ROOT, "data", "term-usage");
const slugs = fs.readdirSync(EXTRAS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const PAGE = `<!DOCTYPE html>
<html lang="ko"><head>
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="../assets/term-nav.css">
</head><body><main>
  <h1>검정</h1>
  <div class="definition-box"><strong>한 줄 정의:</strong> 정의입니다.</div>

  <h2>쉽게 풀면</h2>
  <p>쉬운 설명.</p>

  <h2>왜 중요한가</h2>
  <p>중요.</p>

  <h2>논문에서는 이렇게 쓰입니다</h2>
  <div class="example">"예문"</div>
  <p>설명</p>

  <h2>조금 더 깊게 보면</h2>
  <p>깊게</p>

  <h2>주의할 점</h2>
  <p>주의</p>

  <h2>관련 용어</h2>
  <div class="related-terms"><a href="p-value.html">유의확률</a></div>
</main></body></html>
`;

const EXTRAS = {
  type: "test",
  sections: [
    { heading: "언제 쓰나", html: "<p>조건 <code>a &lt; b</code></p><table><thead><tr><th>가</th></tr></thead><tbody><tr><td>나</td></tr></tbody></table>" },
    { heading: "결과는 이렇게 읽는다", html: "<p>읽기</p>" },
    { heading: "논문에는 이렇게 보고한다", html: "<p>보고</p>" },
  ],
  compare: { headers: ["용어", "설명"], rows: [["[[p-value|유의확률]]", "<img src=x onerror=alert(1)> & \"따옴표\""]] },
  references: ["Mann, H. B., & Whitney, D. R. (1947). Title <b>x</b>. Journal, 18(1), 50–60.", "Second, A. (2000). Book."],
};
const USAGE = [{ quote: "결과는 <유의>했다 & \"그렇다\"", title: "제목 <i>", journal: "학술지", year: 2024, url: "https://www.kci.go.kr/x?a=1&b=2", kciId: "ART1" }];

test("멱등: 두 번 적용해도 같고, 마커를 지우면 원본으로 돌아간다", () => {
  const once = applyToHtml(PAGE, "x", EXTRAS, USAGE);
  const twice = applyToHtml(once, "x", EXTRAS, USAGE);
  assert.strictEqual(twice, once);
  assert.strictEqual(stripAll(once), PAGE);
  for (const name of ["sections", "usage", "tail"]) {
    assert.strictEqual(once.split(`<!-- term-extras:${name}:start -->`).length - 1, 1, name);
  }
  assert.strictEqual(once.split("term-extras.css").length - 1, 1);
});

test("삽입 위치: 섹션은 '논문에서는' 앞, 인용은 그 제목 뒤, 표·참고문헌은 '관련 용어' 앞", () => {
  const out = applyToHtml(PAGE, "x", EXTRAS, USAGE);
  const at = (s) => out.indexOf(s);
  assert.ok(at("왜 중요한가") < at("term-extras:sections:start"));
  assert.ok(at("term-extras:sections:end") < at("<h2>논문에서는 이렇게 쓰입니다</h2>"));
  assert.ok(at("<h2>논문에서는 이렇게 쓰입니다</h2>") < at("term-extras:usage:start"));
  assert.ok(at("term-extras:usage:end") < at('<div class="example">'));
  assert.ok(at("주의할 점") < at("term-extras:tail:start"));
  assert.ok(at("term-extras:tail:end") < at("<h2>관련 용어</h2>"));
  assert.ok(at("예시 문장") > at("실제 논문에서"));
});

test("이스케이프: 인용·표 칸·참고 문헌의 HTML 은 문자로 출력된다", () => {
  const out = applyToHtml(PAGE, "x", EXTRAS, USAGE);
  assert.ok(!out.includes("<img"));
  assert.ok(!out.includes("<b>x</b>"));
  assert.ok(!out.includes("<유의>"));
  assert.ok(out.includes("&lt;유의&gt;했다 &amp; &quot;그렇다&quot;"));
  assert.ok(out.includes("Title &lt;b&gt;x&lt;/b&gt;"));
  assert.ok(out.includes("제목 &lt;i&gt;"));
  assert.ok(out.includes('href="https://www.kci.go.kr/x?a=1&amp;b=2"'));
  assert.ok(out.includes('<a href="p-value.html">유의확률</a>'));
});

test("표는 가로 스크롤 래퍼 안에만 있다", () => {
  const out = applyToHtml(PAGE, "x", EXTRAS, USAGE);
  const tables = out.match(/<table/g) || [];
  const wraps = out.match(/<div class="te-table-wrap"[^>]*><table/g) || [];
  assert.strictEqual(tables.length, 2);
  assert.strictEqual(wraps.length, 2);
  assert.ok(renderTable(["a"], [["b"]]).startsWith('<div class="te-table-wrap"'));
  assert.throws(() => renderTable(["a", "b"], [["only-one"]]), /칸 수/);
});

test("저작 HTML 검사: 허용되지 않는 태그·속성·링크·& 는 거부", () => {
  assert.throws(() => sanitizeFragment("<script>1</script>"), /태그/);
  assert.throws(() => sanitizeFragment('<p onclick="x">a</p>'), /속성/);
  assert.throws(() => sanitizeFragment('<a href="javascript:alert(1)">a</a>'), /링크/);
  assert.throws(() => sanitizeFragment('<a href="http://insecure.example/">a</a>'), /링크/);
  assert.throws(() => sanitizeFragment("<p>A & B</p>"), /&/);
  assert.doesNotThrow(() => sanitizeFragment('<p>A &amp; B <a href="p-value.html">x</a> <a href="https://example.org/">y</a></p>'));
  assert.throws(() => linkify("[[no-such-term-xyz|가짜]]"), /존재하지 않는/);
});

test("스텁·앵커 없는 페이지는 건드리지 않는다(null)", () => {
  const stub = PAGE.replace("<h2>논문에서는 이렇게 쓰입니다</h2>", "<h2>다른 제목</h2>");
  assert.strictEqual(applyToHtml(stub, "x", EXTRAS, USAGE), null);
  assert.strictEqual(applyToHtml(PAGE.replace('<link rel="stylesheet" href="../assets/term-nav.css">', ""), "x", EXTRAS, USAGE), null);
});

test("fixes: 명시한 문구만 바꾸고, 다시 적용해도 그대로", () => {
  const ex = { ...EXTRAS, fixes: [{ find: "<p>주의</p>", replace: "<p>주의(교정)</p>" }] };
  const out = applyToHtml(PAGE, "x", ex, USAGE);
  assert.ok(out.includes("주의(교정)"));
  assert.strictEqual(applyToHtml(out, "x", ex, USAGE), out);
});

test("실제 논문 인용 렌더링: 제목·학술지·연도·출처·링크, 없으면 정직하게 표시", () => {
  const html = renderUsage(USAGE);
  assert.ok(html.includes("실제 논문에서") && html.includes("예시 문장"));
  assert.ok(html.includes("학술지, 2024"));
  assert.ok(html.includes("KCI 한국학술지인용색인"));
  assert.ok(html.includes('target="_blank" rel="noopener"'));
  assert.ok(html.includes("<blockquote"));
  const none = renderUsage([]);
  assert.ok(none.includes("수집하지 못했습니다") && !none.includes("<blockquote"));
  assert.throws(() => renderUsage([{ quote: "a", title: "t", journal: "j", year: 2020, url: "http://x" }]), /필요/);
  const kmed = renderUsage([{ quote: "q", title: "t", journal: "j", year: 2020, url: "https://synapse.koreamed.org/articles/1", source: "koreamed" }]);
  assert.ok(kmed.includes("KoreaMed Synapse"));
});

test("파일럿 데이터: 20개, 유형·참고 문헌·인용 형식이 맞다", () => {
  assert.ok(slugs.length >= 20);
  const archive = new Set(readJson(path.join(ROOT, "data", "index-tiers.json")).archive || []);
  for (const slug of slugs) {
    assert.ok(fs.existsSync(path.join(ROOT, "terms", `${slug}.html`)), `${slug} 페이지`);
    assert.ok(!archive.has(slug), `${slug} 는 보관 등급이면 안 됨`);
    const x = readJson(path.join(EXTRAS_DIR, `${slug}.json`));
    assert.ok(Object.keys(TYPE_HEADINGS).includes(x.type), slug);
    assert.ok(x.references.length >= 2 && x.references.length <= 5, `${slug} 참고 문헌 수`);
    for (const r of x.references) assert.ok(/\(\d{4}\)|\(\d{4}[a-z]?\)\./.test(r), `${slug}: 연도가 없는 참고 문헌 ${r}`);
    assert.ok(!/\bdoi\b|https?:/i.test(JSON.stringify(x.references)), `${slug}: 참고 문헌에 URL/DOI 금지`);
    const usage = readJson(path.join(USAGE_DIR, `${slug}.json`));
    assert.ok(Array.isArray(usage));
    for (const q of usage) {
      assert.ok(q.quote.length <= 160, `${slug}: 인용이 160자 초과(${q.quote.length})`);
      assert.ok(/^https:\/\//.test(q.url) && q.title && q.journal && q.year, slug);
      assert.ok(q.kciId || q.source, slug);
    }
  }
});

test("파일럿 페이지는 데이터와 일치(재적용해도 변화 없음)하고 CSS·마커가 정확히 한 번", () => {
  for (const slug of slugs) {
    const html = fs.readFileSync(path.join(ROOT, "terms", `${slug}.html`), "utf8");
    const next = applyToHtml(html, slug, readJson(path.join(EXTRAS_DIR, `${slug}.json`)), readJson(path.join(USAGE_DIR, `${slug}.json`)));
    assert.strictEqual(next, html, `${slug}: npm 대신 node scripts/apply-term-extras.js 를 다시 실행하세요`);
    assert.strictEqual(html.split("assets/term-extras.css").length - 1, 1, slug);
    // 마커 밖의 표는 없어야 하고, 마커 안의 표는 모두 래퍼 안에 있다
    const inside = [...html.matchAll(/<!-- term-extras:(\w+):start -->([\s\S]*?)<!-- term-extras:\1:end -->/g)].map((m) => m[2]).join("");
    assert.strictEqual((inside.match(/<table/g) || []).length, (inside.match(/class="te-table-wrap"/g) || []).length, slug);
    // 정의 상자·쉽게 풀면·주의할 점 지문은 삽입한 블록의 영향을 받지 않는다
    assert.strictEqual(fingerprints(html).core, fingerprints(stripAll(html)).core, `${slug}: 삽입 블록이 검수 지문 구간을 침범`);
  }
});

test("파일럿 밖 페이지에는 term-extras 가 없다(표본 검사)", () => {
  const dir = path.join(ROOT, "terms");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html") && !slugs.includes(f.slice(0, -5))).slice(0, 300);
  for (const f of files) {
    const html = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!html.includes("term-extras"), f);
  }
});

test("머리부가 CRLF 인 페이지(혼합 줄바꿈)에도 CSS 링크가 들어가고 멱등", () => {
  const crlf = PAGE.replace('<link rel="stylesheet" href="../style.css">\n<link rel="stylesheet" href="../assets/term-nav.css">\n', '<link rel="stylesheet" href="../style.css">\r\n<link rel="stylesheet" href="../assets/term-nav.css">\r\n');
  const out = applyToHtml(crlf, "x", EXTRAS, USAGE);
  assert.ok(out.includes('term-nav.css">\r\n<link rel="stylesheet" href="../assets/term-extras.css">\r\n'));
  assert.strictEqual(applyToHtml(out, "x", EXTRAS, USAGE), out);
  assert.strictEqual(stripAll(out), crlf);
});

test("삽입 블록의 용어 링크는 모두 terms.json 에 있는(스텁이 아닌) 용어를 가리킨다", () => {
  const known = new Set(readJson(path.join(ROOT, "terms.json")).map((t) => t.slug));
  for (const slug of slugs) {
    const html = fs.readFileSync(path.join(ROOT, "terms", `${slug}.html`), "utf8");
    for (const m of html.matchAll(/<!-- term-extras:(\w+):start -->([\s\S]*?)<!-- term-extras:\1:end -->/g)) {
      for (const l of m[2].matchAll(/href="([a-z0-9-]+)\.html"/g)) assert.ok(known.has(l[1]), `${slug} → ${l[1]}`);
    }
  }
});

test("유형 표: 기존 3유형 제목 유지 + 새 6유형, 제목이 다르면 거부, 새 유형도 렌더링", () => {
  assert.deepStrictEqual(TYPE_HEADINGS.test, ["언제 쓰나", "결과는 이렇게 읽는다", "논문에는 이렇게 보고한다"]);
  assert.deepStrictEqual(TYPE_HEADINGS.metric, ["계산과 범위", "해석 기준", "보고 방법"]);
  assert.deepStrictEqual(TYPE_HEADINGS.concept, ["핵심 정리", "예시로 보기", "자주 하는 오해"]);
  assert.deepStrictEqual(Object.keys(TYPE_HEADINGS), ["test", "metric", "concept", "method", "instrument", "disorder", "substance", "structure", "theory"]);
  for (const t of Object.keys(TYPE_HEADINGS)) {
    const x = { type: t, sections: TYPE_HEADINGS[t].map((h) => ({ heading: h, html: "<p>본문</p>" })), references: EXTRAS.references };
    const out = applyToHtml(PAGE, "x", x, []);
    for (const h of TYPE_HEADINGS[t]) assert.ok(out.includes(`<h2>${h}</h2>`), `${t}: ${h}`);
    assert.strictEqual(applyToHtml(out, "x", x, []), out);
  }
  const bad = { type: "method", sections: [{ heading: "언제 쓰나", html: "<p>a</p>" }], references: EXTRAS.references };
  assert.throws(() => applyToHtml(PAGE, "x", bad, []), /섹션 제목/);
  assert.throws(() => applyToHtml(PAGE, "x", { ...bad, type: "unknown" }, []), /type/);
});
