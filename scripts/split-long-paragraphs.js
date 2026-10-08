// 코어 용어 페이지의 긴 단일 <p> 섹션을 문장 단위로 나눈다. (규칙: scripts/lib/split-paragraphs.js)
//   node scripts/split-long-paragraphs.js [--dry-run] [--skip=slug,slug] [--samples=N] [--only=slug,slug]
// 코어 = terms.json 의 slug 중 data/index-tiers.json 의 archive 가 아닌 것.
// 페이지마다 "태그 제거·공백 정리 텍스트가 전후 동일"을 검증하고, 다르면 그 페이지는 건드리지 않는다.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const { splitPageHtml, strip } = require("./lib/split-paragraphs.js");

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3).split(",").filter(Boolean) : []; };
  const skip = new Set(opt("skip"));
  const only = new Set(opt("only"));
  const nSamples = Number((args.find((x) => x.startsWith("--samples=")) || "").slice(10)) || 0;
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const archive = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "data", "index-tiers.json"), "utf8")).archive);
  let pages = 0, touched = 0, sections = 0, aborted = 0, missing = 0;
  const abortedSlugs = [];
  const samples = [];
  for (const t of terms) {
    if (!t || !t.slug || archive.has(t.slug) || skip.has(t.slug)) continue;
    if (only.size && !only.has(t.slug)) continue;
    const file = path.join(ROOT, "terms", `${t.slug}.html`);
    if (!fs.existsSync(file)) { missing++; continue; }
    pages++;
    const before = fs.readFileSync(file, "utf8");
    const { html: after, changed } = splitPageHtml(before);
    if (!changed) continue;
    if (strip(before) !== strip(after)) { aborted++; abortedSlugs.push(t.slug); continue; }
    touched++; sections += changed;
    if (samples.length < nSamples) samples.push({ slug: t.slug, before, after });
    if (!dry) fs.writeFileSync(file, after, "utf8");
  }
  console.log(`${dry ? "[dry-run] " : ""}core pages ${pages}, changed ${touched}, sections split ${sections}, aborted(text mismatch) ${aborted}, missing ${missing}`);
  if (abortedSlugs.length) console.log("aborted:", abortedSlugs.join(","));
  for (const s of samples) {
    const b = s.before.split(/\r?\n/), a = s.after.split(/\r?\n/);
    console.log(`\n=== ${s.slug}`);
    const bs = new Set(b);
    for (const l of a) if (!bs.has(l)) console.log("+ " + l.trim());
  }
}
if (require.main === module) main();
module.exports = { main };
