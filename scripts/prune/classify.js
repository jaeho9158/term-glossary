// Phase 4: 등급 산정 → data/prune/tiers.json (커밋 안 함).
// 규칙은 계획서 Phase 4 표를 위에서부터 적용하고 첫 일치를 쓴다. 값은 계획서 고정.
// 추가 가드(계획서 표에 없음): MERGE 그룹의 대표(keeper)는 흡수 페이지가 리다이렉트로 모이는 곳이라
// 규칙 3 이전에 keep으로 고정한다(대표가 prune되면 병합 리다이렉트가 끊긴다).
// 불변식(assert): tier==='prune'이면 ga=0, 그룹 대표가 아님.
// 사용: node scripts/prune/classify.js
const fs = require("fs");
const path = require("path");
const lib = require("./lib.js");

const CONF_PRUNE = 0.8;
const INBOUND_KEEP = 3;
const DF_KEEP = 2;
const GROUP_MAX = 4;

function classify({ terms, ga = new Map(), stats = { terms: {} }, groups = [], verdicts = {} }) {
  const inbound = lib.inboundCounts(terms);
  const absorbGroup = new Map();
  const keepers = new Set();
  for (const g of groups) {
    keepers.add(g.keeper);
    for (const s of g.absorb) absorbGroup.set(s, g);
  }
  const tiers = {};
  const recat = [];
  const summary = { keep: 0, merge: 0, prune: 0, needsHuman: 0, byCategory: {} };
  for (const t of terms) {
    const slug = t.slug;
    const st = (stats.terms && stats.terms[slug]) || {};
    const v = verdicts[slug] || null;
    const info = { ga: ga.get(slug) || 0, dfNeutral: st.dfNeutral || 0, df: st.df || 0, inbound: inbound.get(slug) || 0,
      verdict: v ? v.label : null, confidence: v ? v.confidence : null };
    const g = absorbGroup.get(slug) || null;
    let tier, reason;
    if (g && g.conf === "high" && g.members.length <= GROUP_MAX && !g.needsHuman) { tier = "merge"; reason = "duplicate-high"; }
    else if (g) { tier = "needs-human"; reason = "merge-uncertain"; }
    else if (keepers.has(slug)) { tier = "keep"; reason = "merge-keeper"; }
    else if (info.ga >= 1) { tier = "keep"; reason = "ga"; }
    else if (info.inbound >= INBOUND_KEEP) { tier = "keep"; reason = "inbound"; }
    else if (info.dfNeutral >= 1 || info.df >= DF_KEEP) { tier = "keep"; reason = "corpus-df"; }
    else if (v && (v.label === "everyday" || v.label === "proper_noun") && v.confidence >= CONF_PRUNE) { tier = "prune"; reason = v.label; }
    else if (v && v.label === "niche" && v.confidence >= CONF_PRUNE && info.inbound === 0) { tier = "prune"; reason = "niche"; }
    else if (v && (v.label === "everyday" || v.label === "proper_noun" || v.label === "niche")) { tier = "needs-human"; reason = "llm-low-conf"; }
    else if (v && v.label === "wrong_category") { tier = "keep"; reason = "wrong-category"; recat.push({ slug, suggest_category: v.suggest_category || null }); }
    else { tier = "keep"; reason = "default"; }

    if (tier === "prune" && (info.ga >= 1 || keepers.has(slug))) throw new Error(`불변식 위반: prune인데 GA≥1 또는 그룹 대표 — ${slug}`);
    tiers[slug] = { tier, reason, ...info, groupId: g ? g.id : null };
    const code = (t.categories && t.categories[0]) || "none";
    const key = tier === "needs-human" ? "needsHuman" : tier;
    summary[key]++;
    if (key !== "keep") {
      const c = (summary.byCategory[code] = summary.byCategory[code] || { prune: 0, needsHuman: 0, merge: 0 });
      c[key]++;
    }
  }
  summary.recat = recat;
  return { tiers, summary };
}

function main() {
  const terms = JSON.parse(fs.readFileSync(path.join(lib.ROOT, "terms.json"), "utf8"));
  const stats = JSON.parse(fs.readFileSync(path.join(lib.ROOT, "data", "oa-stats.json"), "utf8"));
  const readOpt = (f, dflt) => { const p = path.join(lib.PRUNE_DIR, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : dflt; };
  const groups = readOpt("merge-candidates.json", { groups: [] }).groups;
  const verdicts = readOpt("verdicts.json", {});
  if (!Object.keys(verdicts).length) console.warn("verdicts.json 없음/비어 있음 — LLM 판정 없이 등급 산정(prune 0개가 정상)");
  const { tiers, summary } = classify({ terms, ga: lib.loadGa(), stats, groups, verdicts });
  if (Object.prototype.hasOwnProperty.call(tiers, "summary")) throw new Error("slug 'summary'가 있어 tiers.json 스키마와 충돌");
  fs.writeFileSync(path.join(lib.PRUNE_DIR, "tiers.json"), JSON.stringify({ ...tiers, summary }) + "\n");
  // 실데이터 assert(classify 안에서 이미 검사) — 재확인
  const bad = Object.entries(tiers).filter(([, v]) => v.tier === "prune" && v.ga >= 1);
  if (bad.length) throw new Error(`prune ∧ ga≥1 = ${bad.length}`);
  console.log(`keep ${summary.keep}, merge ${summary.merge}, prune ${summary.prune}, needs-human ${summary.needsHuman} (prune ∧ ga≥1 = 0)`);
}

if (require.main === module) main();

module.exports = { classify };
