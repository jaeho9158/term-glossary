// Temporary merge script for scheduled glossary expansion runs.
// Usage: node scripts/merge_round.js <round-json-path> <round-label>
const fs = require('fs');
const path = require('path');

const roundPath = process.argv[2];
const roundLabel = process.argv[3] || 'round';

const root = path.join(__dirname, '..');
const termsJsonPath = path.join(root, 'terms.json');
const sitemapPath = path.join(root, 'sitemap.xml');
const termsDir = path.join(root, 'terms');

const terms = JSON.parse(fs.readFileSync(termsJsonPath, 'utf8'));
const existingSlugs = new Set(terms.map(t => t.slug));

const newEntries = JSON.parse(fs.readFileSync(roundPath, 'utf8'));

const added = [];
const skipped = [];
const seenThisRound = new Set();

for (const entry of newEntries) {
  if (!entry.slug || !entry.title_ko || !entry.title_en || !entry.categories || !entry.definition) {
    skipped.push({ entry, reason: 'missing-fields' });
    continue;
  }
  if (existingSlugs.has(entry.slug)) {
    skipped.push({ entry, reason: 'dup-in-terms.json' });
    continue;
  }
  if (seenThisRound.has(entry.slug)) {
    skipped.push({ entry, reason: 'dup-in-this-round' });
    continue;
  }
  const htmlPath = path.join(termsDir, entry.slug + '.html');
  if (!fs.existsSync(htmlPath)) {
    skipped.push({ entry, reason: 'html-missing' });
    continue;
  }
  seenThisRound.add(entry.slug);
  existingSlugs.add(entry.slug);
  added.push(entry);
}

// Append to terms.json
const merged = terms.concat(added.map(e => ({
  slug: e.slug,
  title_ko: e.title_ko,
  title_en: e.title_en,
  categories: e.categories,
  definition: e.definition,
  related: e.related || []
})));
fs.writeFileSync(termsJsonPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');

// Append to sitemap.xml
let sitemap = fs.readFileSync(sitemapPath, 'utf8');
const today = process.env.MERGE_DATE || '2026-08-01';
const urlBlocks = added.map(e => `  <url>\n    <loc>https://termglossary.kr/terms/${e.slug}.html</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n`).join('');
sitemap = sitemap.replace('</urlset>', urlBlocks + '</urlset>');
fs.writeFileSync(sitemapPath, sitemap, 'utf8');

console.log(`[${roundLabel}] added=${added.length} skipped=${skipped.length}`);
if (skipped.length) {
  console.log('SKIPPED:', JSON.stringify(skipped.map(s => ({ slug: s.entry.slug, reason: s.reason })), null, 2));
}
console.log('Added slugs:', added.map(a => a.slug).join(', '));

// Keep the search/homepage index (terms-index.json) in sync with terms.json.
require('./generate-terms-index.js');
