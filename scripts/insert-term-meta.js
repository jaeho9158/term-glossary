// 모든 용어 페이지에 JSON-LD / OG·Twitter / 최종 수정 줄을 넣는다(멱등, 스텁 제외).
//   node scripts/insert-term-meta.js [--dry] [--only slug,slug] [--list-out file]
// 최상위 페이지(index/category/viewer/about)는 --only 없이 실행할 때만 처리한다.
const fs = require("fs");
const path = require("path");
const { applyTermMeta, applyPageMeta, isStub } = require("./lib/term-meta.js");

const ROOT = path.join(__dirname, "..");
const TERMS_DIR = path.join(ROOT, "terms");
const TOP_PAGES = ["index.html", "category.html", "viewer.html", "about.html"];

function main(argv) {
  const dry = argv.includes("--dry");
  const oi = argv.indexOf("--only");
  const only = oi >= 0 ? new Set(argv[oi + 1].split(",").filter(Boolean)) : null;
  const li = argv.indexOf("--list-out");
  const listOut = li >= 0 ? argv[li + 1] : null;

  const { CATEGORY_LABELS } = require("../assets/category-data.js");
  const lastmod = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "term-lastmod.json"), "utf8"));
  const bySlug = new Map();
  for (const t of JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"))) bySlug.set(t.slug, t);

  const files = fs.readdirSync(TERMS_DIR).filter((f) => f.endsWith(".html"));
  const c = { total: 0, updated: 0, unchanged: 0, stubs: 0, noTerm: 0, noDate: 0, malformed: 0 };
  const changed = [];
  for (const f of files) {
    const slug = f.slice(0, -5);
    if (only && !only.has(slug)) continue;
    c.total++;
    const p = path.join(TERMS_DIR, f);
    const html = fs.readFileSync(p, "utf8");
    if (isStub(html)) { c.stubs++; continue; }
    const term = bySlug.get(slug);
    if (!term) { c.noTerm++; continue; }
    const date = lastmod[slug] && lastmod[slug].date;
    if (!date) c.noDate++;
    const out = applyTermMeta(html, term, { categoryLabels: CATEGORY_LABELS, date });
    if (out == null) { c.malformed++; continue; }
    if (out === html) { c.unchanged++; continue; }
    c.updated++;
    changed.push("terms/" + f);
    if (!dry) fs.writeFileSync(p, out, "utf8");
  }
  if (!only) {
    for (const f of TOP_PAGES) {
      const p = path.join(ROOT, f);
      const html = fs.readFileSync(p, "utf8");
      const out = applyPageMeta(html);
      if (out == null || out === html) continue;
      changed.push(f);
      if (!dry) fs.writeFileSync(p, out, "utf8");
    }
  }
  if (listOut) fs.writeFileSync(listOut, changed.join("\n") + (changed.length ? "\n" : ""));
  console.log(`${dry ? "[dry] " : ""}처리 ${c.total} / 갱신 ${c.updated} / 변화없음 ${c.unchanged} / 스텁 ${c.stubs} / terms.json 없음 ${c.noTerm} / 수정일 없음 ${c.noDate} / 구조 이상 ${c.malformed}`);
  return c;
}

module.exports = { main };
if (require.main === module) main(process.argv.slice(2));
