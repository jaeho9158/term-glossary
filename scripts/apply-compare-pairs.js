// scripts/apply-compare-pairs.js
// .compare-drafts/*.json (콘텐츠 초안)을 검증 후 compare/*.html 생성 +
// data/compare-pairs.json 갱신.
//
// usage: node scripts/apply-compare-pairs.js <dir> [--dry]
const fs = require("fs");
const path = require("path");
const { pairSlug } = require("./compare-page-core.js");
const { renderComparePage } = require("./build-compare-page.js");
const { buildContext } = require("./build-term-page.js");
const { CATEGORY_LABELS } = require("../assets/category-data.js");

const ROOT_DIR = path.join(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT_DIR, "data", "compare-pairs.json");

function validateComparePair(content, terms) {
  const bySlug = new Map(terms.map((t) => [t.slug, t]));
  const a = bySlug.get(content.slugA);
  const b = bySlug.get(content.slugB);
  if (!a || !b) return { ok: false, reason: `존재하지 않는 슬러그: ${!a ? content.slugA : content.slugB}` };
  if (a.subcategory !== b.subcategory) {
    return { ok: false, reason: `하위분류가 다름 (${a.subcategory} vs ${b.subcategory})` };
  }
  if (a.title_ko !== content.titleA || b.title_ko !== content.titleB) {
    return { ok: false, reason: "제목이 terms.json과 다름(오타 의심)" };
  }
  if (!Array.isArray(content.rows) || content.rows.length !== 4) {
    return { ok: false, reason: `행 개수 ${content.rows ? content.rows.length : 0} (정확히 4개여야 함)` };
  }
  for (const r of content.rows) {
    if (!r.label || !r.a || !r.b) return { ok: false, reason: "행에 빈 필드가 있음" };
  }
  for (const field of ["headline", "whenA", "whenB", "confusion"]) {
    if (!content[field] || !String(content[field]).trim()) {
      return { ok: false, reason: `${field} 필드가 비어 있음` };
    }
  }
  return { ok: true, category: a.categories[0] };
}

function main() {
  const dir = process.argv[2];
  const dry = process.argv.includes("--dry");
  if (!dir) {
    console.error("usage: node scripts/apply-compare-pairs.js <dir> [--dry]");
    process.exit(1);
  }

  const terms = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "terms.json"), "utf8"));
  const manifest = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) : [];
  const existingSlugs = new Set(manifest.map((p) => p.pairSlug));

  const files = fs.readdirSync(dir).filter((f) => /\.json$/i.test(f));
  const accepted = [];
  for (const f of files) {
    const content = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const r = validateComparePair(content, terms);
    if (!r.ok) { console.log(`[반려] ${f}: ${r.reason}`); continue; }
    const slug = pairSlug(content.slugA, content.slugB);
    if (existingSlugs.has(slug)) { console.log(`[반려] ${f}: 이미 존재하는 짝(${slug})`); continue; }
    accepted.push({ ...content, category: r.category, pairSlug: slug });
  }

  console.log(`수집 ${files.length}건 → 승인 ${accepted.length}`);
  if (dry || !accepted.length) { console.log(dry ? "(dry run — 파일 미변경)" : "반영할 항목 없음."); return; }

  const outDir = path.join(ROOT_DIR, "compare");
  fs.mkdirSync(outDir, { recursive: true });

  const newManifestEntries = [];
  for (const content of accepted) {
    const ctx = buildContext(terms, [content.slugA, content.slugB]);
    const categoryLabel = CATEGORY_LABELS[content.category] || content.category;
    const html = renderComparePage({ ...content, categoryLabel }, ctx);
    fs.writeFileSync(path.join(outDir, `${content.pairSlug}.html`), html, "utf8");

    const [firstSlug, firstTitle, secondSlug, secondTitle] =
      content.slugA < content.slugB
        ? [content.slugA, content.titleA, content.slugB, content.titleB]
        : [content.slugB, content.titleB, content.slugA, content.titleA];
    newManifestEntries.push({
      slugA: firstSlug, slugB: secondSlug, titleA: firstTitle, titleB: secondTitle,
      pairSlug: content.pairSlug, category: content.category,
      subcategory: terms.find((t) => t.slug === content.slugA).subcategory,
    });
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify([...manifest, ...newManifestEntries], null, 2) + "\n", "utf8");
  console.log(`compare/*.html ${accepted.length}개 생성, data/compare-pairs.json 갱신`);
}

if (require.main === module) main();
module.exports = { validateComparePair };
