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
  const primaryCat = {};
  for (const t of terms) primaryCat[t.slug] = (t.categories && t.categories[0]) || "etc";
  let gsc = null;
  const gscPath = path.join(ROOT, "data/gsc-indexed.json");
  if (fs.existsSync(gscPath)) gsc = rd("data/gsc-indexed.json");
  else console.warn("경고: data/gsc-indexed.json 없음 - 'Google 기색인' 기준 생략");
  const { core: keep, archive } = computeTiers({
    slugs: terms.map((t) => t.slug), ga: rd("data/prune/ga4.json"), stats, primaryCat, gsc,
  });
  const keepSet = new Set(keep);
  const perCat = {};
  for (const t of terms) {
    const c = (t.categories && t.categories[0]) || "etc";
    perCat[c] = perCat[c] || { core: 0, archive: 0 };
    perCat[c][keepSet.has(t.slug) ? "core" : "archive"]++;
  }
  const out = { generatedAt: new Date().toISOString(), counts: { core: keep.length, archive: archive.length, perCategory: perCat }, archive: archive.sort() };
  fs.writeFileSync(path.join(ROOT, "data/index-tiers.json"), JSON.stringify(out) + "\n");
  const rows = Object.entries(perCat).sort((a, b) => b[1].core - a[1].core);
  console.log("core", keep.length, "archive", archive.length);
  console.log("top", rows.slice(0, 10).map(([c, v]) => `${c}:${v.core}`).join(" "));
  console.log("zero-core categories", rows.filter(([, v]) => v.core === 0).length, "of", rows.length);
  console.log("bottom", rows.slice(-10).map(([c, v]) => `${c}:${v.core}`).join(" "));
}
module.exports = { main };
if (require.main === module) main();
