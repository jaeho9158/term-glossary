const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { computeUpdates, run, RELATED_BLOCK_RE } = require("../scripts/generate-related-html.js");
const { checkRelated } = require("../scripts/check-related-consistency.js");

function term(slug, related, extra = {}) {
  return { slug, title_ko: `제목-${slug}`, categories: ["stat"], subcategory: "검정", related, ...extra };
}

function page(links = [], eol = "\n") {
  return [
    "<html><body>",
    "  <h2>관련 용어</h2>",
    '  <div class="related-terms">',
    ...links,
    "  </div>",
    "</body></html>",
  ].join(eol);
}

function makeTerms() {
  // 12개 같은 분야 용어 — 채움 후보가 RELATED_TARGET(10)보다 많다.
  const slugs = Array.from({ length: 12 }, (_, i) => `t${String(i).padStart(2, "0")}`);
  return slugs.map((s, i) => term(s, i === 0 ? [] : [slugs[(i + 1) % 12]]));
}

test("(a) related가 빈 용어도 실패하지 않고 같은 분야 용어로 채운다", () => {
  const terms = makeTerms();
  const html = Object.fromEntries(terms.map((t) => [t.slug, page()]));
  const { updates, errors } = computeUpdates(terms, (s) => html[s]);
  assert.deepStrictEqual(errors, []);
  const t0 = updates.find((u) => u.slug === "t00");
  assert.ok(t0, "t00 페이지가 계산되어야 한다");
  const block = t0.html.match(RELATED_BLOCK_RE)[0];
  assert.strictEqual((block.match(/related-same-field/g) || []).length, 10);
});

test("(b) 오류가 하나라도 있으면 어떤 파일도 쓰지 않는다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "related-html-"));
  try {
    const terms = makeTerms();
    terms.push(term("broken", ["no-such-slug"]));
    for (const t of terms) fs.writeFileSync(path.join(dir, `${t.slug}.html`), page());
    const before = Object.fromEntries(terms.map((t) => [t.slug, fs.readFileSync(path.join(dir, `${t.slug}.html`), "utf8")]));
    assert.throws(() => run({ terms, termsDir: dir }), /no-such-slug/);
    for (const t of terms) {
      assert.strictEqual(fs.readFileSync(path.join(dir, `${t.slug}.html`), "utf8"), before[t.slug], `${t.slug}가 변경됨`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("(c) 멱등성: 두 번째 실행은 바꾸는 것이 없다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "related-html-"));
  try {
    const terms = makeTerms();
    for (const t of terms) fs.writeFileSync(path.join(dir, `${t.slug}.html`), page([], "\r\n"));
    const first = run({ terms, termsDir: dir });
    assert.ok(first.updates.length > 0);
    // CRLF 파일은 CRLF를 유지한다.
    assert.ok(!/[^\r]\n/.test(fs.readFileSync(path.join(dir, "t01.html"), "utf8")));
    const second = run({ terms, termsDir: dir });
    assert.strictEqual(second.updates.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("(c) 멱등성: 다른 용어의 related만 바뀌면 기존 채움 순서를 그대로 둔다", () => {
  const terms = makeTerms();
  const html = Object.fromEntries(terms.map((t) => [t.slug, page()]));
  for (const u of computeUpdates(terms, (s) => html[s]).updates) html[u.slug] = u.html;
  // 피인용 수를 바꿔 fieldFill 기본 순서를 뒤흔든다(t05가 아닌 다른 용어의 related만 변경).
  const changed = terms.map((t) => (t.slug === "t03" || t.slug === "t04" ? { ...t, related: ["t11", "t10", "t09"] } : t));
  const { updates } = computeUpdates(changed, (s) => html[s]);
  assert.ok(!updates.some((u) => u.slug === "t05"), "t05는 바뀌지 않아야 한다");
});

test("check:related — 단방향 링크는 오류가 아니고, 빈 related는 경고, 깨진 참조는 오류", () => {
  const terms = [
    term("a", ["b"]),
    term("b", []),
    term("c", ["ghost", "d"]),
    term("d", ["c"]),
  ];
  const state = (s) => (s === "d" ? "stub" : "ok");
  const { errors, warnings, oneWay } = checkRelated(terms, state);
  assert.deepStrictEqual(oneWay, ["a -> b"]);
  assert.ok(warnings.some((w) => w.startsWith("b:")));
  assert.ok(errors.some((e) => e.includes("ghost")));
  assert.ok(errors.some((e) => e.includes("스텁") && e.includes("d")));
  assert.ok(!errors.some((e) => e.includes("역방향")));
});
