// Phase 5: 체크리스트 문서 생성 → data/prune/checklist-docs.json (ArtifactData batch 입력, 커밋 안 함).
// 컬렉션 prune_groups: merge:<keeper> / prune:<code> / review:<code>:<nn>(50개씩). 기본 decision은 전부 "none".
// 컬렉션 prune_meta: 문서 id "summary".
// 출력 배열의 각 원소: { action:"set", collection, doc_id, data } — 컨트롤러가 ArtifactData batch로 쓴다.
// 사용: node scripts/prune/build-checklist-docs.js
const fs = require("fs");
const path = require("path");
const lib = require("./lib.js");

const REVIEW_SIZE = 50;

function itemOf(t, tier, role, extra) {
  return { slug: t.slug, title_ko: t.title_ko || "", title_en: t.title_en || "", role,
    ga: tier.ga, dfNeutral: tier.dfNeutral, inbound: tier.inbound, verdict: tier.verdict || "",
    note: "", redirect: "", decision: "default", ...extra };
}

// 리다이렉트 대상: 역링크를 준 용어(가지치기·병합 대상 제외) 중 GA 최다 → 없으면 분야 페이지.
function pruneRedirect(t, referrers, ga, tiers) {
  const refs = (referrers.get(t.slug) || []).filter((s) => tiers[s] && (tiers[s].tier === "keep"));
  const best = refs.map((s) => ({ s, g: ga.get(s) || 0 })).filter((x) => x.g > 0)
    .sort((a, b) => b.g - a.g || (a.s < b.s ? -1 : 1))[0];
  return best ? best.s : `category/${(t.categories && t.categories[0]) || "none"}.html`;
}

function buildDocs({ terms, tiers, groups, ga = new Map(), baseline = null }) {
  const bySlug = new Map(terms.map((t) => [t.slug, t]));
  const referrers = new Map();
  for (const t of terms) {
    for (const s of new Set([...(t.related || []), ...(t.prerequisites || [])])) {
      if (s === t.slug) continue;
      if (!referrers.has(s)) referrers.set(s, []);
      referrers.get(s).push(t.slug);
    }
  }
  const docs = [];
  const put = (id, data) => docs.push({ action: "set", collection: "prune_groups", doc_id: id, data });
  const counts = { merge: 0, prune: 0, review: 0 };
  const noteOf = (tier) => `GA ${tier.ga} · df ${tier.df} · 역링크 ${tier.inbound}` + (tier.verdict ? ` · LLM ${tier.verdict} ${tier.confidence}` : "");

  // merge: 흡수 전원이 tier merge인 그룹
  for (const g of groups) {
    if (!g.absorb.length || !g.absorb.every((s) => tiers[s] && tiers[s].tier === "merge")) continue;
    const keeper = bySlug.get(g.keeper);
    const items = [itemOf(keeper, tiers[g.keeper], "keeper", { note: noteOf(tiers[g.keeper]) })];
    for (const s of g.absorb) items.push(itemOf(bySlug.get(s), tiers[s], "absorb", { note: noteOf(tiers[s]), redirect: g.keeper }));
    put(`merge:${g.keeper}`, { kind: "merge", category: (keeper.categories || [])[0] || "none",
      title: `${keeper.title_ko} ← ${g.absorb.length}개 흡수 (${g.rules.join("+")})`, items,
      decision: "none", conf: g.conf, updatedBy: null, updatedAt: null });
    counts.merge += g.absorb.length;
  }

  // prune: 분야당 1문서
  const pruneBy = new Map();
  const reviewBy = new Map();
  for (const t of terms) {
    const tier = tiers[t.slug];
    if (!tier) continue;
    const code = (t.categories && t.categories[0]) || "none";
    if (tier.tier === "prune") {
      if (!pruneBy.has(code)) pruneBy.set(code, []);
      pruneBy.get(code).push(itemOf(t, tier, "prune", { note: noteOf(tier), redirect: pruneRedirect(t, referrers, ga, tiers) }));
    } else if (tier.tier === "needs-human") {
      if (!reviewBy.has(code)) reviewBy.set(code, []);
      const grp = groups.find((g) => g.id === tier.groupId);
      const isMerge = tier.reason === "merge-uncertain" && grp;
      reviewBy.get(code).push(itemOf(t, tier, isMerge ? "absorb" : "prune",
        { note: noteOf(tier) + (isMerge ? ` · 대표 ${grp.keeper}` : ""), redirect: isMerge ? grp.keeper : pruneRedirect(t, referrers, ga, tiers), choice: "keep" }));
    }
  }
  for (const code of [...pruneBy.keys()].sort()) {
    const items = pruneBy.get(code).sort((a, b) => (a.slug < b.slug ? -1 : 1));
    put(`prune:${code}`, { kind: "prune", category: code, title: `${code} 분야 정리 ${items.length}개`, items,
      decision: "none", conf: "high", updatedBy: null, updatedAt: null });
    counts.prune += items.length;
  }
  for (const code of [...reviewBy.keys()].sort()) {
    const items = reviewBy.get(code).sort((a, b) => (a.slug < b.slug ? -1 : 1));
    for (let i = 0, n = 1; i < items.length; i += REVIEW_SIZE, n++) {
      const chunk = items.slice(i, i + REVIEW_SIZE);
      put(`review:${code}:${String(n).padStart(2, "0")}`, { kind: "review", category: code,
        title: `${code} 판단 필요 ${n}묶음 (${chunk.length}개)`, items: chunk,
        decision: "none", conf: "low", updatedBy: null, updatedAt: null });
      counts.review += chunk.length;
    }
  }
  const docCounts = { merge: 0, prune: 0, review: 0 };
  for (const d of docs) docCounts[d.data.kind]++;
  docs.push({ action: "set", collection: "prune_meta", doc_id: "summary",
    data: { generatedAt: new Date().toISOString(), counts, docs: docCounts, baseline } });
  return docs;
}

function main() {
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(lib.PRUNE_DIR, f), "utf8"));
  const terms = JSON.parse(fs.readFileSync(path.join(lib.ROOT, "terms.json"), "utf8"));
  const tiers = rd("tiers.json");
  delete tiers.summary;
  const baseFile = path.join(lib.PRUNE_DIR, "baseline.json");
  const docs = buildDocs({ terms, tiers, groups: rd("merge-candidates.json").groups, ga: lib.loadGa(),
    baseline: fs.existsSync(baseFile) ? rd("baseline.json") : null });
  fs.writeFileSync(path.join(lib.PRUNE_DIR, "checklist-docs.json"), JSON.stringify(docs) + "\n");
  const n = docs.filter((d) => d.collection === "prune_groups").length;
  console.log(`prune_groups 문서 ${n}개 (merge ${docs.filter((d) => d.doc_id.startsWith("merge:")).length}, prune ${docs.filter((d) => d.doc_id.startsWith("prune:")).length}, review ${docs.filter((d) => d.doc_id.startsWith("review:")).length}), 전부 decision="none"`);
}

if (require.main === module) main();

module.exports = { buildDocs, REVIEW_SIZE };
