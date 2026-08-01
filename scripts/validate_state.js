const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const terms = JSON.parse(fs.readFileSync(path.join(root, 'terms.json'), 'utf8'));
console.log('total terms:', terms.length);

// duplicate slug check
const slugCounts = {};
terms.forEach(t => { slugCounts[t.slug] = (slugCounts[t.slug]||0)+1; });
const dupes = Object.entries(slugCounts).filter(([,c]) => c>1);
console.log('duplicate slugs:', dupes.length, dupes.slice(0,20));

// every slug has html file
const missingHtml = terms.filter(t => !fs.existsSync(path.join(root, 'terms', t.slug + '.html')));
console.log('terms.json entries missing html file:', missingHtml.length, missingHtml.slice(0,20).map(t=>t.slug));

// every html file (in terms dir) has terms.json entry
const htmlFiles = fs.readdirSync(path.join(root, 'terms')).filter(f => f.endsWith('.html'));
const slugSet = new Set(terms.map(t=>t.slug));
const orphanHtml = htmlFiles.filter(f => !slugSet.has(f.replace(/\.html$/, '')));
console.log('html files with no terms.json entry:', orphanHtml.length, orphanHtml.slice(0,20));

// category counts
const cats = {};
terms.forEach(t => t.categories.forEach(c => cats[c] = (cats[c]||0)+1));
console.log('category counts:', cats);

// sitemap well-formed check (basic)
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const openTags = (sitemap.match(/<url>/g)||[]).length;
const closeTags = (sitemap.match(/<\/url>/g)||[]).length;
console.log('sitemap <url> open/close:', openTags, closeTags);
console.log('sitemap has </urlset> at end:', sitemap.trim().endsWith('</urlset>'));

// missing fields check
const missingFields = terms.filter(t => !t.slug || !t.title_ko || !t.title_en || !t.categories || !t.definition);
console.log('entries missing required fields:', missingFields.length, missingFields.slice(0,10));
