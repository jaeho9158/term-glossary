// data/seo-overrides.json: 손으로 쓴 title/description이 길이 규칙을 지키고 페이지에 반영돼 있어야 한다.
const test = require("node:test");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const seo = require("../scripts/lib/term-seo.js");
const { escapeHtml } = require("../assets/escape.js");

const ROOT = path.join(__dirname, "..");
const overrides = require("../data/seo-overrides.json");
const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));

test("seo-overrides: 형식·길이·페이지 반영", () => {
  for (const [slug, o] of Object.entries(overrides)) {
    if (slug.startsWith("_")) continue;
    const term = terms.find((t) => t.slug === slug);
    assert.ok(term, `terms.json에 없는 slug: ${slug}`);
    assert.ok(o.title.length <= 60 && o.title.endsWith(" | 논문용어사전") && o.title.includes(" 뜻"), `title 규칙: ${slug}`);
    assert.ok(o.description.length <= 150, `description 150자 초과: ${slug}`);
    assert.strictEqual(seo.buildTermTitle(term), o.title);
    const html = fs.readFileSync(path.join(ROOT, "terms", `${slug}.html`), "utf8");
    assert.ok(html.includes(`<title>${escapeHtml(o.title)}</title>`), `페이지 title 미반영: ${slug}`);
    assert.ok(html.includes(`<meta name="description" content="${escapeHtml(o.description)}">`), `페이지 description 미반영: ${slug}`);
  }
});
