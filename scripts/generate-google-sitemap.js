// Google 전용 사이트맵: keep 등급 용어 + 용어 외 페이지만 담는다. 기존 sitemap.xml/sitemaps/ 는 건드리지 않는다(네이버용).
//   node scripts/generate-google-sitemap.js   -> sitemap-google.xml + sitemaps-google/
const fs = require("fs");
const path = require("path");
const { BASE_URL } = require("./site-config.js");
const ROOT = path.join(__dirname, "..");
const CHUNK = 5000;

function parseUrlset(xml) {
  return [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/g)].map((m) => ({ loc: m[1], lastmod: m[2] }));
}
const TERM_RE = /\/terms\/([^/]+)\.html$/;
function slugOf(loc) { const m = TERM_RE.exec(loc); if (!m) return null; try { return decodeURIComponent(m[1]); } catch { return m[1]; } }

function urlset(entries) {
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((e) => `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>`), "</urlset>", ""].join("\n");
}
function index(files) {
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...files.map((f) => `  <sitemap>\n    <loc>${BASE_URL}/sitemaps-google/${f.name}</loc>\n    <lastmod>${f.lastmod}</lastmod>\n  </sitemap>`), "</sitemapindex>", ""].join("\n");
}

// allEntries: 기존 전체 사이트맵의 모든 {loc,lastmod}. 순수 함수.
function buildGoogleSitemaps(allEntries, archiveSet) {
  const pages = [], terms = [];
  for (const e of allEntries) {
    const s = slugOf(e.loc);
    if (s === null) pages.push(e); else if (!archiveSet.has(s)) terms.push(e);
  }
  const maxLm = (l) => l.reduce((a, e) => (e.lastmod > a ? e.lastmod : a), "");
  const files = [{ name: "pages.xml", xml: urlset(pages), count: pages.length, lastmod: maxLm(pages) }];
  for (let i = 0, n = 1; i < terms.length; i += CHUNK, n++) {
    const part = terms.slice(i, i + CHUNK);
    files.push({ name: `terms-keep-${n}.xml`, xml: urlset(part), count: part.length, lastmod: maxLm(part) });
  }
  return { files, indexXml: index(files), pageCount: pages.length, termCount: terms.length };
}

function main() {
  const dir = path.join(ROOT, "sitemaps");
  const all = [];
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".xml")) all.push(...parseUrlset(fs.readFileSync(path.join(dir, f), "utf8")));
  const archive = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "data/index-tiers.json"), "utf8")).archive);
  const r = buildGoogleSitemaps(all, archive);
  const out = path.join(ROOT, "sitemaps-google");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out);
  for (const f of r.files) fs.writeFileSync(path.join(out, f.name), f.xml, "utf8");
  fs.writeFileSync(path.join(ROOT, "sitemap-google.xml"), r.indexXml, "utf8");
  console.log(`sitemap-google.xml: ${r.files.length} files; pages ${r.pageCount}, keep terms ${r.termCount}`);
  r.files.forEach((f) => console.log(" ", f.name, f.count));
}
module.exports = { buildGoogleSitemaps, parseUrlset, slugOf };
if (require.main === module) main();
