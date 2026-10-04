// data/index-tiers.json 에 따라 용어 페이지에 Googlebot 전용 noindex 마커를 넣거나 뺀다(멱등).
//   node scripts/apply-index-tiers.js [--dry] [--only slug,slug] [--list-out file]
const fs = require("fs");
const path = require("path");
const { applyIndexTier } = require("./lib/index-tier.js");
const ROOT = path.join(__dirname, "..");
const TERMS_DIR = path.join(ROOT, "terms");

function main(argv, opts = {}) {
  const dry = argv.includes("--dry");
  const oi = argv.indexOf("--only");
  const only = oi >= 0 ? new Set(argv[oi + 1].split(",").filter(Boolean)) : null;
  const li = argv.indexOf("--list-out");
  const listOut = li >= 0 ? argv[li + 1] : null;
  const dir = opts.termsDir || TERMS_DIR;
  const tiers = opts.tiers || JSON.parse(fs.readFileSync(path.join(ROOT, "data/index-tiers.json"), "utf8"));
  const archive = new Set(tiers.archive);
  const c = { total: 0, changed: 0, unchanged: 0, stubs: 0, malformed: 0, toArchive: 0, toKeep: 0 };
  const changed = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".html")) continue;
    const slug = f.slice(0, -5);
    if (only && !only.has(slug)) continue;
    c.total++;
    const p = path.join(dir, f);
    const html = fs.readFileSync(p, "utf8");
    const isArch = archive.has(slug);
    const out = applyIndexTier(html, isArch ? "archive" : "keep");
    if (out == null) { (/noindex/i.test(html) ? c.stubs++ : c.malformed++); continue; }
    if (out === html) { c.unchanged++; continue; }
    c.changed++; isArch ? c.toArchive++ : c.toKeep++;
    changed.push("terms/" + f);
    if (!dry) fs.writeFileSync(p, out, "utf8");
  }
  if (listOut) fs.writeFileSync(listOut, changed.join("\n") + (changed.length ? "\n" : ""));
  console.log(`${dry ? "[dry] " : ""}${JSON.stringify(c)}`);
  return c;
}
module.exports = { main };
if (require.main === module) main(process.argv.slice(2));
