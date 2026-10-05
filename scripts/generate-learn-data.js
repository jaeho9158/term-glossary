// scripts/generate-learn-data.js — 퀴즈·로드맵용 "핵심 용어" 학습 데이터 생성.
//
// 범위: data/index-tiers.json 의 archive 에 없는 용어 = core(약 3,969개). 사람들이
// 실제로 마주치는 용어만 학습 대상으로 삼는다. 한 용어는 속한 분야마다 들어간다.
//
// 출력(커밋 대상):
//   data/learn/<분야코드>.json  — core 용어가 있는 분야마다 하나 (배열)
//   data/learn/index.json       — { code: { label, group, core } }
//   data/learn/slug-index.json  — { slug: 첫 분야코드 } (quiz.html?slugs= 조회용)
//
// 용어 한 건: { slug, title_ko, title_en, meaning, subcategory, level, related,
//   prerequisites, pop?, aliases? }
//   meaning       = scripts/short-text.js 의 한 줄 요약(정의를 70자 안팎으로)
//   related / prerequisites = core 용어 slug 만 (archive 로 빠진 것은 제거)
//   pop           = data/popular-terms.json[분야] 안의 순위(1이 가장 인기). 없으면 생략
//
// 난이도 규칙(level): terms.json 의 difficulty(1·2·3)를 그대로 쓴다. 값이 없거나
// 1~3이 아니면 2. 별도 추정식은 두지 않는다 — 이미 용어마다 편집된 값이 있다.
const fs = require("fs");
const path = require("path");
const { shortenText } = require("./short-text");

const ROOT = path.join(__dirname, "..");

function deriveLevel(term) {
  const d = Number(term && term.difficulty);
  return d === 1 || d === 2 || d === 3 ? d : 2;
}

// 순수 함수: terms(전체) + archive slug 배열 + popular 맵 + 라벨/그룹 → 분야별 데이터
function buildLearnData({ terms, archive, popular, labels, groups }) {
  const archiveSet = new Set(archive || []);
  const core = terms.filter((t) => t && t.slug && !archiveSet.has(t.slug));
  const coreSet = new Set(core.map((t) => t.slug));
  const groupOf = {};
  for (const g of groups || []) for (const c of g.codes) groupOf[c] = g.label;

  const popRank = {};
  for (const [code, list] of Object.entries(popular || {})) {
    if (!Array.isArray(list)) continue;
    popRank[code] = new Map(list.map((s, i) => [s, i + 1]));
  }

  const byCat = {};
  const slugIndex = {};
  for (const t of core) {
    for (const c of t.categories || []) {
      if (!labels[c]) continue;
      const entry = {
        slug: t.slug,
        title_ko: t.title_ko || t.slug,
        title_en: t.title_en || "",
        meaning: shortenText(t.definition, 70),
        subcategory: t.subcategory || "",
        level: deriveLevel(t),
        related: (t.related || []).filter((s) => coreSet.has(s) && s !== t.slug),
        prerequisites: (t.prerequisites || []).filter((s) => coreSet.has(s) && s !== t.slug),
      };
      const pr = popRank[c] && popRank[c].get(t.slug);
      if (pr) entry.pop = pr;
      if (t.aliases && t.aliases.length) entry.aliases = t.aliases;
      (byCat[c] = byCat[c] || []).push(entry);
      if (!slugIndex[t.slug]) slugIndex[t.slug] = c;
    }
  }
  const index = {};
  for (const c of Object.keys(byCat)) {
    index[c] = { label: labels[c], group: groupOf[c] || "", core: byCat[c].length };
  }
  return { byCat, index, slugIndex };
}

function main() {
  const cat = require(path.join(ROOT, "assets", "category-data.js"));
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const tiers = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "index-tiers.json"), "utf8"));
  const popular = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "popular-terms.json"), "utf8"));
  const { byCat, index, slugIndex } = buildLearnData({
    terms, archive: tiers.archive, popular,
    labels: cat.CATEGORY_LABELS, groups: cat.CATEGORY_GROUPS,
  });
  const out = path.join(ROOT, "data", "learn");
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (f.endsWith(".json")) fs.unlinkSync(path.join(out, f));
  for (const [c, list] of Object.entries(byCat)) {
    fs.writeFileSync(path.join(out, c + ".json"), JSON.stringify(list));
  }
  fs.writeFileSync(path.join(out, "index.json"), JSON.stringify(index));
  fs.writeFileSync(path.join(out, "slug-index.json"), JSON.stringify(slugIndex));
  console.log(`learn data: ${Object.keys(byCat).length} categories, ${Object.keys(slugIndex).length} core terms`);
}

if (require.main === module) main();
module.exports = { buildLearnData, deriveLevel };
