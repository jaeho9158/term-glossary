// 틀(navbox) 항목 라벨 → 용어 slug 해석기와 공백 보고서.
//
//   node scripts/navbox/resolve.js                 data/navboxes/*.json 전부의 공백 보고서
//   node scripts/navbox/resolve.js brain           한 틀만
//   node scripts/navbox/resolve.js --json brain    기계가 읽는 JSON
//
// 원칙: 추측하지 않는다. 같은 우선순위에서 서로 다른 용어가 둘 이상 걸리면 ambiguous 로 두고
// 후보를 보고한다(해결은 항목에 slug 를 직접 적거나 q 로 검색어를 좁혀서).
// 해석 순서(첫 번째로 후보가 나오는 단계에서 멈춘다):
//   1 title_ko  2 title_en  3 괄호를 뗀 title_ko  4 aliases  5 통합된 옛 페이지(리다이렉트 스텁)의 제목·slug
// 라벨 자체 → 동의어 묶음의 다른 표기 순으로 시도한다(뉴런=신경세포 등).
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const BOX_DIR = path.join(ROOT, "data", "navboxes");

// 공백·하이픈·가운뎃점·밑줄·슬래시를 지우고 소문자로 맞춘다. (한글은 NFC)
function norm(s) {
  return String(s == null ? "" : s).normalize("NFC").toLowerCase()
    .replace(/[\s\-‐‑‒–—―−·・‧•∙・_\/\\]+/g, "");
}
const stripParen = (s) => String(s).replace(/\s*[(（][^)）]*[)）]\s*/g, " ").trim();
const parenInside = (s) => { const m = /[(（]([^)）]+)[)）]/.exec(String(s)); return m ? m[1] : ""; };

// 같은 개념의 다른 표기. 필요한 것만 늘려 간다(한 묶음 안의 어느 표기든 서로 대신 검색된다).
const SYNONYMS = [
  ["뉴런", "신경세포", "neuron"],
  ["교세포", "신경아교세포", "glia", "glial cell"],
  ["성상세포", "별아교세포", "astrocyte"],
  ["희소돌기아교세포", "oligodendrocyte"],
  ["소교세포", "미세아교세포", "microglia"],
  ["대뇌겉질", "대뇌피질", "피질", "cerebral cortex"],
  ["겉질하", "피질하"],
  ["백색질", "백질", "white matter"],
  ["회백질", "gray matter"],
  ["시상하부", "hypothalamus"],
  ["이마엽", "전두엽", "frontal lobe"],
  ["마루엽", "두정엽", "parietal lobe"],
  ["관자엽", "측두엽", "temporal lobe"],
  ["뒤통수엽", "후두엽", "occipital lobe"],
  ["섬엽", "뇌섬엽", "insula", "insular cortex"],
  ["편도체", "편도핵", "amygdala"],
  ["선조체", "줄무늬체", "striatum"],
  ["창백핵", "담창구", "globus pallidus"],
  ["소뇌", "cerebellum"],
  ["뇌줄기", "뇌간", "brainstem", "brain stem"],
  ["도파민", "dopamine"],
  ["세로토닌", "serotonin"],
  ["노르에피네프린", "노르아드레날린", "norepinephrine", "noradrenaline"],
  ["아세틸콜린", "acetylcholine"],
  ["글루탐산", "글루타메이트", "glutamate"],
  ["감마아미노부티르산", "GABA", "가바"],
  ["t검정", "t-test", "t 검정", "스튜던트 t검정"],
  ["카이제곱", "카이제곱 검정", "chi-square", "chi-squared", "χ²"],
  ["분산분석", "ANOVA", "analysis of variance"],
  ["맨-휘트니 U 검정", "맨휘트니", "Mann-Whitney U test", "Mann–Whitney"],
  ["윌콕슨 부호순위 검정", "Wilcoxon signed-rank test"],
  ["크러스컬-월리스 검정", "Kruskal-Wallis test", "크루스칼-왈리스"],
  ["효과크기", "효과 크기", "effect size"],
  ["본페로니 보정", "Bonferroni correction"],
  ["표본추출", "표집", "sampling"],
  ["무작위대조시험", "RCT", "randomized controlled trial", "무작위 대조 시험"],
  ["근거이론", "grounded theory", "grounded-theory"],
  ["현상학적 연구", "현상학", "phenomenology"],
  ["내적 타당도", "internal validity"],
  ["외적 타당도", "external validity"],
];

function buildSynonymIndex(groups) {
  const m = new Map();
  for (const g of groups) {
    const keys = g.map(norm);
    for (const k of keys) {
      if (!m.has(k)) m.set(k, new Set());
      for (const o of g) m.get(k).add(o);
    }
  }
  return m;
}

// terms: [{slug,title_ko,title_en,aliases}]  archive: Set<slug>
// stubs: { <옛 slug>: { target, title } }  (리다이렉트 스텁; terms.json 에 없는 페이지)
// redirectOf(slug) → 대상 slug | null  (terms 에 있는 slug 가 스텁일 수도 있어 한 번 더 따라간다)
function createResolver({ terms, archive = new Set(), stubs = {}, synonyms = SYNONYMS, redirectOf = null }) {
  const bySlug = new Map(terms.map((t) => [t.slug, t]));
  const tiers = [new Map(), new Map(), new Map(), new Map(), new Map()];
  const add = (tier, key, slug) => {
    const k = norm(key);
    if (!k) return;
    if (!tiers[tier].has(k)) tiers[tier].set(k, new Set());
    tiers[tier].get(k).add(slug);
  };
  for (const t of terms) {
    add(0, t.title_ko, t.slug);
    add(1, t.title_en, t.slug);
    if (/[(（]/.test(t.title_ko || "")) add(2, stripParen(t.title_ko), t.slug);
    for (const a of t.aliases || []) add(3, a, t.slug);
  }
  for (const [old, s] of Object.entries(stubs)) {
    if (!s.target) continue;
    add(4, old, s.target);
    if (s.title) add(4, s.title, s.target);
  }
  const syn = buildSynonymIndex(synonyms);

  // 스텁 체인을 대상 slug 로 따라간다. terms.json 에 없는 대상이면 null.
  function follow(slug) {
    let cur = slug;
    for (let i = 0; i < 5; i++) {
      const next = (stubs[cur] && stubs[cur].target) || (redirectOf && redirectOf(cur)) || null;
      if (!next || next === cur) break;
      cur = next;
    }
    return bySlug.has(cur) ? cur : null;
  }

  function lookup(q) {
    const k = norm(q);
    for (let tier = 0; tier < tiers.length; tier++) {
      const hit = tiers[tier].get(k);
      if (!hit) continue;
      const finals = [...new Set([...hit].map(follow).filter(Boolean))];
      if (finals.length) return { tier, slugs: finals };
    }
    return null;
  }

  const status = (slug) => (archive.has(slug) ? "archive" : "core");

  // item: { label, slug?, q? }  →  { status, slug?, via?, candidates? }
  function resolve(item) {
    if (item.slug) {
      const s = follow(item.slug);
      return s ? { status: status(s), slug: s, via: "pinned" } : { status: "none", note: `slug ${item.slug} 없음` };
    }
    const base = item.q || item.label;
    const queries = [base];
    const inner = parenInside(base);
    if (inner) queries.push(stripParen(base), inner);
    for (const q of [...queries]) for (const s of syn.get(norm(q)) || []) queries.push(s);
    for (const q of queries) {
      const r = lookup(q);
      if (!r) continue;
      if (r.slugs.length === 1) return { status: status(r.slugs[0]), slug: r.slugs[0], via: `tier${r.tier + 1}:${q}` };
      return { status: "ambiguous", candidates: r.slugs.map((s) => ({ slug: s, title: bySlug.get(s).title_ko, tier: status(s) })), via: `tier${r.tier + 1}:${q}` };
    }
    return { status: "none" };
  }

  return { resolve, follow, bySlug };
}

// 문자열 항목("해마")을 { label } 로 바꾼다. 제자리에서 고치고 여러 번 불러도 같다.
function normalizeBox(box) {
  const fix = (list) => (list || []).map((it) => {
    const o = typeof it === "string" ? { label: it } : it;
    if (o.sub) o.sub = fix(o.sub);
    return o;
  });
  const groups = (list) => (list || []).forEach((g) => { if (g.items) g.items = fix(g.items); groups(g.groups); });
  groups(box.groups);
  return box;
}

// 틀 안의 모든 항목을 앞에서부터 방문한다. visit(item, trail)
function walkItems(box, visit) {
  const items = (list, trail) => {
    for (const it of list || []) { visit(it, trail); items(it.sub, trail.concat(it.label)); }
  };
  const groups = (list, trail) => {
    for (const g of list || []) {
      const t = trail.concat(g.label);
      items(g.items, t);
      groups(g.groups, t);
    }
  };
  groups(box.groups, []);
}

// 틀 전체를 해석한다. 결과 맵(WeakMap-like): item 객체 → 해석 결과
function resolveBox(box, resolver) {
  normalizeBox(box);
  const results = new Map();
  const rows = [];
  walkItems(box, (item, trail) => {
    const r = resolver.resolve(item);
    results.set(item, r);
    rows.push({ label: item.label, path: trail.join(" › "), ...r });
  });
  const count = (st) => rows.filter((r) => r.status === st).length;
  const linked = rows.filter((r) => r.slug);
  const unique = (list) => new Set(list.map((r) => r.slug)).size;
  return {
    id: box.id, results, rows,
    counts: {
      items: rows.length, core: count("core"), archive: count("archive"), none: count("none"), ambiguous: count("ambiguous"),
      uniqueCore: unique(linked.filter((r) => r.status === "core")),
    },
  };
}

function formatReport(rep) {
  const c = rep.counts;
  const lines = [`# ${rep.id}: 항목 ${c.items} · 핵심 ${c.core} · 보관(archive)만 ${c.archive} · 용어 없음 ${c.none} · 모호 ${c.ambiguous}`];
  const sec = (title, list, fmt) => { if (list.length) { lines.push(`## ${title} (${list.length})`); list.forEach((r) => lines.push("- " + fmt(r))); } };
  sec("용어 없음", rep.rows.filter((r) => r.status === "none"), (r) => `${r.label}  [${r.path}]${r.note ? " " + r.note : ""}`);
  sec("보관 등급만 있음", rep.rows.filter((r) => r.status === "archive"), (r) => `${r.label} → ${r.slug}  [${r.path}]`);
  sec("모호(후보 확인 필요)", rep.rows.filter((r) => r.status === "ambiguous"), (r) => `${r.label}  [${r.path}] 후보: ${r.candidates.map((x) => `${x.slug}(${x.title},${x.tier})`).join(", ")}`);
  return lines.join("\n");
}

// ---- 디스크에서 실제 데이터 읽기 -------------------------------------------------
function loadStubs(termsDir, known) {
  const stubs = {};
  for (const f of fs.readdirSync(termsDir)) {
    if (!f.endsWith(".html")) continue;
    const slug = f.slice(0, -5);
    if (known.has(slug)) continue; // 본 페이지는 건너뛴다(스텁은 terms.json 에 없음)
    const head = fs.readFileSync(path.join(termsDir, f), "utf8").slice(0, 1500);
    const m = /http-equiv="refresh"[^>]*url=([^"'>\s]+)/i.exec(head);
    if (!m) continue;
    const t = /<title>([^<]*)<\/title>/.exec(head);
    stubs[slug] = { target: decodeURIComponent(m[1]).replace(/\.html$/, ""), title: t ? t[1].replace(/\s*-\s*논문용어사전\s*$/, "") : "" };
  }
  return stubs;
}

function loadResolver(root = ROOT) {
  const terms = JSON.parse(fs.readFileSync(path.join(root, "terms.json"), "utf8"));
  const archive = new Set(JSON.parse(fs.readFileSync(path.join(root, "data", "index-tiers.json"), "utf8")).archive);
  const stubs = loadStubs(path.join(root, "terms"), new Set(terms.map((t) => t.slug)));
  return createResolver({ terms, archive, stubs });
}

function loadBoxes(dir = BOX_DIR, ids = []) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json") && (!ids.length || ids.includes(f.slice(0, -5))))
    .map((f) => normalizeBox(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))));
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const ids = args.filter((a) => !a.startsWith("--"));
  const resolver = loadResolver();
  const reports = loadBoxes(BOX_DIR, ids).map((b) => resolveBox(b, resolver));
  if (json) console.log(JSON.stringify(reports.map((r) => ({ id: r.id, counts: r.counts, rows: r.rows })), null, 2));
  else console.log(reports.map(formatReport).join("\n\n"));
}

if (require.main === module) main();
module.exports = { norm, SYNONYMS, createResolver, normalizeBox, walkItems, resolveBox, formatReport, loadStubs, loadResolver, loadBoxes, BOX_DIR };
