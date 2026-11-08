const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { applyToHtml } = require("../scripts/apply-reviewed-badge.js");

const ROOT = path.join(__dirname, "..");
const reviewed = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "reviewed.json"), "utf8"));
const count = (html) => (html.match(/<!-- reviewed:start -->/g) || []).length;

test("reviewed.json 슬러그마다 배지 블록이 정확히 1개, 그 밖의 페이지엔 없음", () => {
  const dir = path.join(ROOT, "terms");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".html"))) {
    const slug = f.slice(0, -5);
    const n = count(fs.readFileSync(path.join(dir, f), "utf8"));
    assert.strictEqual(n, reviewed[slug] ? 1 : 0, slug);
  }
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
