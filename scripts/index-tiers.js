// 색인 등급 산출: node scripts/index-tiers.js  -> data/index-tiers.json
const fs = require("fs");
const path = require("path");
const { computeTiers } = require("./lib/index-tier.js");
const ROOT = path.join(__dirname, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

function main() {
  const gaPath = path.join(ROOT, "data/prune/ga4.json");
  if (!fs.existsSync(gaPath)) throw new Error("data/prune/ga4.json 이 없습니다(GA 조회수 필수 입력)");
  const neutral = path.join(ROOT, "data/prune/oa-stats-neutral.json");
  const stats = fs.existsSync(neutral) ? rd("data/prune/oa-stats-neutral.json").terms : rd("data/oa-stats.json").terms;
  const terms = rd("terms.json");
  const { keep, archive } = computeTiers({
    slugs: terms.map((t) => t.slug), ga: rd("data/prune/ga4.json"), stats, popular: rd("data/popular-terms.json"),
  });
  const keepSet = new Set(keep);
  const perCat = {};
  for (const t of terms) {
    const c = (t.categories && t.categories[0]) || "etc";
    perCat[c] = perCat[c] || { keep: 0, archive: 0 };
    perCat[c][keepSet.has(t.slug) ? "keep" : "archive"]++;
  }
  const out = { generatedAt: new Date().toISOString(), counts: { keep: keep.length, archive: archive.length, perCategory: perCat }, archive: archive.sort() };
  fs.writeFileSync(path.join(ROOT, "data/index-tiers.json"), JSON.stringify(out) + "\n");
  const rows = Object.entries(perCat).sort((a, b) => b[1].keep - a[1].keep);
  console.log("keep", keep.length, "archive", archive.length);
  console.log("top", rows.slice(0, 10).map(([c, v]) => `${c}:${v.keep}`).join(" "));
  console.log("bottom", rows.slice(-10).map(([c, v]) => `${c}:${v.keep}`).join(" "));
}
module.exports = { main };
if (require.main === module) main();
