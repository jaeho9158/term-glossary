const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { computeTiers, applyIndexTier, filterRelatedLinks } = require("../scripts/lib/index-tier.js");
const { main: applyMain } = require("../scripts/apply-index-tiers.js");
const { buildGoogleSitemaps } = require("../scripts/generate-google-sitemap.js");
const meta = require("../scripts/lib/term-meta.js");

const PAGE = '<!DOCTYPE html><html><head>\n<title>t</title>\n<link rel="canonical" href="https://termglossary.kr/terms/a.html">\n<link rel="stylesheet" href="x.css">\n</head><body><main>\n<aside class="stage-link">x</aside>\n</main></body></html>\n';
const STUB = '<html><head><link rel="canonical" href="https://termglossary.kr/terms/a.html"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=b.html"></head></html>';

test("computeTiers: GA/df/주력분야/기색인 기준", () => {
  const r = computeTiers({
    slugs: ["ga2", "ga1df", "ga1", "focus", "focus2", "other3", "gsc", "none"],
    ga: { "/terms/ga2.html": 2, "/terms/ga1df.html": 1, "/terms/ga1.html": 1, "/index.html": 9 },
    stats: { ga1df: { dfNeutral: 1 }, focus: { dfNeutral: 3 }, focus2: { dfNeutral: 2 }, other3: { dfNeutral: 5 } },
    primaryCat: { focus: "psych", focus2: "psych", other3: "phys" },
    gsc: ["gsc"],
  });
  assert.deepStrictEqual(r.core.sort(), ["focus", "ga1df", "ga2", "gsc"]);
  assert.deepStrictEqual(r.archive.sort(), ["focus2", "ga1", "none", "other3"]);
  const noGsc = computeTiers({ slugs: ["gsc"], ga: {}, stats: {}, primaryCat: {} });
  assert.deepStrictEqual(noGsc.archive, ["gsc"]);
});

test("filterRelatedLinks: core 페이지에서 archive 링크 제거, 멱등, 빈 블록 제거", () => {
  const NL = String.fromCharCode(10);
  const mk = (links) => ["<main>", "  <h2>관련 용어</h2>", "  <div class=" + "\"" + "related-terms" + "\"" + ">", ...links.map((l) => `    <a href="${l}.html">${l}</a>`), "  </div>", "<aside>x</aside>", "</main>"].join(NL);
  const arch = new Set(["x", "y"]);
  const r = filterRelatedLinks(mk(["a", "x", "b"]), arch);
  assert.strictEqual(r.removed, 1);
  assert.strictEqual(r.html, mk(["a", "b"]));
  assert.strictEqual(filterRelatedLinks(r.html, arch).removed, 0);
  const e = filterRelatedLinks(mk(["x", "y"]), arch);
  assert.ok(e.blockRemoved && !e.html.includes("관련 용어") && !e.html.includes("related-terms") && e.html.includes("<aside>"));
  assert.strictEqual(filterRelatedLinks(e.html, arch).removed, 0);
});

test("applyIndexTier: googlebot만, 멱등, 왕복", () => {
  const a = applyIndexTier(PAGE, "archive");
  assert.match(a, /<meta name="googlebot" content="noindex">/);
  assert.ok(!/name="robots"/.test(a));
  assert.ok(a.indexOf("canonical") < a.indexOf("googlebot") && a.indexOf("googlebot") < a.indexOf("stylesheet"));
  assert.strictEqual(applyIndexTier(a, "archive"), a);
  assert.strictEqual(applyIndexTier(a, "core"), PAGE);
  assert.strictEqual(applyIndexTier(PAGE, "core"), PAGE);
});

test("스텁은 건드리지 않는다", () => {
  assert.strictEqual(applyIndexTier(STUB, "archive"), null);
});

test("apply 스크립트: 왕복·스텁 불변", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tiers-"));
  fs.writeFileSync(path.join(dir, "a.html"), PAGE);
  fs.writeFileSync(path.join(dir, "b.html"), PAGE);
  fs.writeFileSync(path.join(dir, "s.html"), STUB);
  const log = console.log; console.log = () => {};
  try {
    let c = applyMain([], { termsDir: dir, tiers: { archive: ["a", "s"] } });
    assert.strictEqual(c.toArchive, 1); assert.strictEqual(c.stubs, 1);
    assert.strictEqual(applyMain([], { termsDir: dir, tiers: { archive: ["a", "s"] } }).changed, 0);
    assert.strictEqual(fs.readFileSync(path.join(dir, "s.html"), "utf8"), STUB);
    assert.strictEqual(fs.readFileSync(path.join(dir, "b.html"), "utf8"), PAGE);
    c = applyMain([], { termsDir: dir, tiers: { archive: [] } });
    assert.strictEqual(c.toCore, 1);
    assert.strictEqual(fs.readFileSync(path.join(dir, "a.html"), "utf8"), PAGE);
  } finally { console.log = log; }
});

test("insert-term-meta 재적용 후에도 마커가 남는다", () => {
  const withMeta = '<!DOCTYPE html><html><head>\n<title>t</title>\n<link rel="canonical" href="https://termglossary.kr/terms/a.html">\n</head><body><main>\n<div class="related-terms"></div>\n<aside class="stage-link">x</aside>\n</main></body></html>\n';
  const term = { slug: "a", title_ko: "가", title_en: "a", aliases: [], categories: ["stat"], definition: "정의입니다." };
  const arch = applyIndexTier(withMeta, "archive");
  const once = meta.applyTermMeta(arch, term, { categoryLabels: { stat: "통계" } });
  const twice = meta.applyTermMeta(once, term, { categoryLabels: { stat: "통계" } });
  assert.ok(once && twice === once);
  assert.strictEqual((twice.match(/name="googlebot"/g) || []).length, 1);
  assert.ok(meta.stripTermMeta(twice).includes('name="googlebot"'));
});

test("구글 사이트맵에 archive slug 없음", () => {
  const e = (p) => ({ loc: `https://termglossary.kr/${p}`, lastmod: "2026-09-01" });
  const r = buildGoogleSitemaps([e(""), e("about.html"), e("terms/k.html"), e("terms/x.html")], new Set(["x"]));
  const all = r.files.map((f) => f.xml).join("");
  assert.ok(all.includes("terms/k.html") && all.includes("about.html"));
  assert.ok(!all.includes("terms/x.html"));
  assert.strictEqual(r.termCount, 1);
});
