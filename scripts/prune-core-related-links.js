// core 페이지의 "관련 용어" 블록에서 archive 페이지로 가는 링크를 제거한다(Google 크롤이 core 안에 머물도록).
//   node scripts/prune-core-related-links.js [--dry] [--only slug,slug]
// - archive 페이지, 이전/다음 링크, 카테고리 허브, 본문 링크는 건드리지 않는다. terms.json도 수정하지 않는다.
// - 멱등. 링크가 모두 사라지면 <h2>관련 용어</h2>와 블록을 함께 제거한다.
// - generate-related-html.js 가 같은 필터를 data/index-tiers.json 기준으로 자동 적용하므로
//   build:related-html 이후에 다시 살아나지 않는다. index-tiers.json 이 바뀌면(색인 등급 재산출) 이 스크립트를 다시 실행할 것.
const fs = require("fs");
const path = require("path");
const { filterRelatedLinks, isStub } = require("./lib/index-tier.js");
const ROOT = path.join(__dirname, "..");

function main(argv, opts = {}) {
  const dry = argv.includes("--dry");
  const oi = argv.indexOf("--only");
  const only = oi >= 0 ? new Set(argv[oi + 1].split(",").filter(Boolean)) : null;
  const dir = opts.termsDir || path.join(ROOT, "terms");
  const tiers = opts.tiers || JSON.parse(fs.readFileSync(path.join(ROOT, "data/index-tiers.json"), "utf8"));
  const archive = new Set(tiers.archive);
  const c = { corePages: 0, pagesChanged: 0, linksRemoved: 0, blocksRemoved: 0 };
  const changed = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".html")) continue;
    const slug = f.slice(0, -5);
    if (archive.has(slug) || (only && !only.has(slug))) continue;
    const p = path.join(dir, f);
    const html = fs.readFileSync(p, "utf8");
    if (isStub(html)) continue;
    c.corePages++;
    const r = filterRelatedLinks(html, archive);
    if (!r.removed) continue;
    c.pagesChanged++; c.linksRemoved += r.removed; if (r.blockRemoved) c.blocksRemoved++;
    changed.push("terms/" + f);
    if (!dry) fs.writeFileSync(p, r.html, "utf8");
  }
  if (opts.listOut) fs.writeFileSync(opts.listOut, changed.join("\n") + "\n");
  console.log(`${dry ? "[dry] " : ""}${JSON.stringify(c)}`);
  return { ...c, changed };
}
module.exports = { main };
if (require.main === module) {
  const li = process.argv.indexOf("--list-out");
  main(process.argv.slice(2), { listOut: li >= 0 ? process.argv[li + 1] : null });
}
