// Phase 2: 중복 후보(MERGE) 찾기 → data/prune/merge-candidates.json (커밋 안 함).
// 규칙 R1~R5, 임계값(0.55 / 0.3 / 그룹>4), 대표 선정 순서는 계획서 Phase 2 그대로다.
// 구현 메모(R5): 전체 3-gram 역색인에서 문서빈도가 POSTING_CAP 이하인 희귀 gram만 후보 생성에 쓰고
// (공통 gram은 후보 수만 폭발시킨다), 공유 희귀 gram 가중치 상위 50개만 실제 코사인을 계산한다.
// 사용: node scripts/prune/find-duplicates.js
const fs = require("fs");
const path = require("path");
const lib = require("./lib.js");

const norm = lib.norm;
const SIM_MIN = 0.55;
const TITLE_JACCARD_MIN = 0.3;
const TOP_CANDIDATES = 50;
const POSTING_CAP = 300;
const GROUP_MAX = 4;
const CONF_RANK = { low: 0, medium: 1, high: 2 };

// 대립쌍: 접두가 다르고 나머지가 같으면 반의어로 본다(기존 병합 라운드가 유지한 패턴).
const ANTONYM_PREFIXES = [["상향", "하향"], ["정", "역"], ["내", "외"]];
function antonymPair(a, b) {
  const pairs = [[norm(a.title_ko), norm(b.title_ko)], [norm(a.title_en), norm(b.title_en)]];
  for (const [x, y] of pairs) {
    if (!x || !y || x === y) continue;
    for (const [p, q] of ANTONYM_PREFIXES) {
      if (x.length > p.length && x.startsWith(p) && y.startsWith(q) && x.slice(p.length) === y.slice(q.length)) return true;
      if (x.length > q.length && x.startsWith(q) && y.startsWith(p) && x.slice(q.length) === y.slice(p.length)) return true;
    }
    // FIFO/LIFO 등: 한쪽의 fifo를 lifo로 바꾸면 다른 쪽과 같아진다.
    if (x.includes("fifo") && x.replace(/fifo/g, "lifo") === y) return true;
    if (x.includes("lifo") && x.replace(/lifo/g, "fifo") === y) return true;
  }
  return false;
}

function findDuplicates(terms, { ga = new Map() } = {}) {
  const n = terms.length;
  const edges = new Map();
  const excluded = [];
  const addEdge = (i, j, rule, sim) => {
    if (i === j) return;
    const [a, b] = i < j ? [i, j] : [j, i];
    const key = `${a}|${b}`;
    let e = edges.get(key);
    if (!e) edges.set(key, (e = { a, b, rules: new Set(), sim: 0 }));
    e.rules.add(rule);
    if (sim) e.sim = Math.max(e.sim, sim);
  };
  const bucketPairs = (keyFn, rule, minLen) => {
    const buckets = new Map();
    terms.forEach((t, i) => {
      const k = keyFn(t);
      if (!k || k.length < minLen) return;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    });
    for (const list of buckets.values()) {
      for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) addEdge(list[x], list[y], rule);
    }
  };

  bucketPairs((t) => norm(t.title_ko), "R1", 1);
  bucketPairs((t) => norm(t.title_en), "R2", 3);
  bucketPairs((t) => lib.normStem(t.title_ko), "R4", 2);

  // R3: 한 용어의 제목이 다른 용어의 aliases와 일치
  const aliasIndex = new Map();
  terms.forEach((t, i) => {
    for (const al of t.aliases || []) {
      const k = norm(al);
      if (k.length < 2) continue;
      if (!aliasIndex.has(k)) aliasIndex.set(k, new Set());
      aliasIndex.get(k).add(i);
    }
  });
  terms.forEach((t, i) => {
    for (const title of [t.title_ko, t.title_en]) {
      const k = norm(title);
      if (k.length < 2 || !aliasIndex.has(k)) continue;
      for (const j of aliasIndex.get(k)) addEdge(i, j, "R3");
    }
  });

  // R5: 정의문 3-gram TF-IDF 코사인 + 카테고리 교집합 + 제목 2-gram Jaccard
  const { vectors, df } = lib.buildTfidf(terms.map((t) => t.definition || ""));
  const postings = new Map();
  vectors.forEach((v, i) => {
    for (const id of v.keys()) {
      if (df[id] > POSTING_CAP) continue;
      let p = postings.get(id);
      if (!p) postings.set(id, (p = []));
      p.push(i);
    }
  });
  const score = new Float64Array(n);
  const catSets = terms.map((t) => new Set(t.categories || []));
  const hasCat = (i, j) => [...catSets[i]].some((c) => catSets[j].has(c));
  for (let i = 0; i < n; i++) {
    const touched = [];
    for (const [id, w] of vectors[i]) {
      const p = postings.get(id);
      if (!p) continue;
      for (const j of p) {
        if (j <= i) continue;
        if (score[j] === 0) touched.push(j);
        score[j] += w * (vectors[j].get(id) || 0);
      }
    }
    touched.sort((a, b) => score[b] - score[a] || a - b);
    for (const j of touched.slice(0, TOP_CANDIDATES)) {
      if (!hasCat(i, j)) continue;
      const cos = lib.cosine(vectors[i], vectors[j]);
      if (cos >= SIM_MIN && lib.jaccard2(terms[i].title_ko, terms[j].title_ko) >= TITLE_JACCARD_MIN) addEdge(i, j, "R5", cos);
    }
    for (const j of touched) score[j] = 0;
  }

  // 자동 제외 + 신뢰도 + union-find
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const kept = [];
  for (const e of edges.values()) {
    const A = terms[e.a], B = terms[e.b];
    const rules = [...e.rules].sort();
    const overlap = hasCat(e.a, e.b);
    if (antonymPair(A, B)) { excluded.push({ a: A.slug, b: B.slug, rules, reason: "antonym" }); continue; }
    if (rules.length === 1 && rules[0] === "R2" && !overlap) { excluded.push({ a: A.slug, b: B.slug, rules, reason: "homonym-other-field" }); continue; }
    let conf;
    if (e.rules.has("R1") || (e.rules.has("R2") && overlap) || e.rules.has("R3")) conf = "high";
    else if (e.rules.has("R5")) conf = "medium";
    else conf = "low";
    kept.push({ a: e.a, b: e.b, sim: e.sim, rules, conf });
    parent[find(e.a)] = find(e.b);
  }

  const inbound = lib.inboundCounts(terms);
  const info = terms.map((t) => ({
    slug: t.slug, title_ko: t.title_ko || "", title_en: t.title_en || "", categories: t.categories || [],
    ga: ga.get(t.slug) || 0, len: lib.bodyLength(t), inbound: inbound.get(t.slug) || 0,
  }));
  const byRoot = new Map();
  for (const e of kept) {
    const r = find(e.a);
    if (!byRoot.has(r)) byRoot.set(r, { members: new Set(), rules: new Set(), conf: "high", sim: 0 });
    const g = byRoot.get(r);
    g.members.add(e.a);
    g.members.add(e.b);
    for (const rule of e.rules) g.rules.add(rule);
    if (CONF_RANK[e.conf] < CONF_RANK[g.conf]) g.conf = e.conf; // 그룹 신뢰도 = 가장 약한 연결
    g.sim = Math.max(g.sim, e.sim);
  }
  const groups = [];
  for (const g of byRoot.values()) {
    // 대표 선정: GA 조회수 → 본문 글자수 → 역링크 수 → slug 사전순
    const members = [...g.members].map((i) => info[i]).sort((x, y) =>
      y.ga - x.ga || y.len - x.len || y.inbound - x.inbound || (x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0));
    const keeper = members[0].slug;
    const out = { id: `m-${keeper}`, keeper, absorb: members.slice(1).map((m) => m.slug).sort(),
      rules: [...g.rules].sort(), conf: g.conf, sim: Math.round(g.sim * 100) / 100, members };
    if (members.length > GROUP_MAX) out.needsHuman = true; // 쪼개지 않고 사람 판단으로 넘긴다
    groups.push(out);
  }
  groups.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { groups, excluded };
}

function main() {
  const terms = JSON.parse(fs.readFileSync(path.join(lib.ROOT, "terms.json"), "utf8"));
  const { groups, excluded } = findDuplicates(terms, { ga: lib.loadGa() });
  fs.mkdirSync(lib.PRUNE_DIR, { recursive: true });
  const out = { generated: new Date().toISOString(), groups, excluded };
  fs.writeFileSync(path.join(lib.PRUNE_DIR, "merge-candidates.json"), JSON.stringify(out) + "\n");
  const byConf = { high: 0, medium: 0, low: 0 };
  for (const g of groups) byConf[g.conf]++;
  console.log(`그룹 ${groups.length}개 (high ${byConf.high}, medium ${byConf.medium}, low ${byConf.low}, 크기>${GROUP_MAX} ${groups.filter((g) => g.needsHuman).length}), 자동 제외 ${excluded.length}쌍`);
}

if (require.main === module) main();

module.exports = { findDuplicates, antonymPair, SIM_MIN, TITLE_JACCARD_MIN };
