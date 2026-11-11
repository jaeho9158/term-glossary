const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { applyToHtml, levelOf, readMap } = require("../scripts/apply-reviewed-badge.js");

const ROOT = path.join(__dirname, "..");
const reviewed = readMap("reviewed.json");
const checked = readMap("source-checked.json");
const count = (html) => (html.match(/<!-- reviewed:start -->/g) || []).length;

test("검수 목록 슬러그마다 배지 블록이 정확히 1개이고 단계가 맞으며, 그 밖의 페이지엔 없음", () => {
  const dir = path.join(ROOT, "terms");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".html"))) {
    const slug = f.slice(0, -5);
    const html = fs.readFileSync(path.join(dir, f), "utf8");
    const lv = levelOf(slug, reviewed, checked);
    assert.strictEqual(count(html), lv ? 1 : 0, slug);
    if (lv) assert.ok(html.includes(lv[1] === "operator" ? "운영자 검수</a>" : "출처 대조</a>"), slug);
  }
});

test("두 단계: 운영자 검수가 출처 대조보다 우선하고, 단계마다 문구가 다르다", () => {
  assert.deepStrictEqual(levelOf("a", { a: "2026-11-01" }, { a: "2026-11-02" }), ["2026-11-01", "operator"]);
  assert.deepStrictEqual(levelOf("a", {}, { a: "2026-11-02" }), ["2026-11-02", "source"]);
  assert.strictEqual(levelOf("a", {}, {}), null);
  const page = "<h1>t</h1>\n";
  assert.match(applyToHtml(page, "2026-11-09", "source"), /출처 대조/);
  assert.match(applyToHtml(page, "2026-11-09"), /운영자 검수/);
  assert.throws(() => applyToHtml(page, "2026-11-09", "x"), /단계/);
});

test("applyToHtml: 멱등, 날짜 변경 시 교체, 날짜 없으면 제거, CRLF 유지", () => {
  const page = '<h1>t</h1>\n  <div class="category-badges">\n    <a>x</a>\n  </div>\n\n  <button>b</button>\n';
  const once = applyToHtml(page, "2026-11-09");
  assert.strictEqual(count(once), 1);
  assert.strictEqual(applyToHtml(once, "2026-11-09"), once);
  assert.match(applyToHtml(once, "2026-12-01"), /2026-12-01/);
  assert.strictEqual(applyToHtml(once, null), page);
  const crlf = applyToHtml(page.replace(/\n/g, "\r\n"), "2026-11-09");
  assert.ok(!/[^\r]\n/.test(crlf));
});
