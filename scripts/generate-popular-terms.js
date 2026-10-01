// 분야별 "많이 찾는 용어" 상위 20개를 data/popular-terms.json에 쓴다.
// 순위: GA 조회수(data/prune/ga4.json, 로컬 전용·없으면 생략) → 말뭉치 df
// (data/oa-stats.json) → 한글 제목. 한 용어는 속한 모든 분야에 센다.
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const TOP_N = 20;
const FIELDS_TOP_N = 8;

function rankPopular(terms, views, df, topN = TOP_N) {
  const byCat = {};
  for (const t of terms) {
    for (const c of t.categories || []) (byCat[c] ||= []).push(t);
  }
  const out = {};
  for (const c of Object.keys(byCat).sort()) {
    out[c] = byCat[c]
      .sort((a, b) =>
        (views[b.slug] || 0) - (views[a.slug] || 0) ||
        (df[b.slug] || 0) - (df[a.slug] || 0) ||
        String(a.title_ko).localeCompare(String(b.title_ko), "ko") ||
        (a.slug < b.slug ? -1 : 1))
      .slice(0, topN)
      .map((t) => t.slug);
  }
  return out;
}

// 허브의 "많이 찾는 분야": 각 분야 인기 용어(popular)의 조회수 합으로 상위 n개 분야 코드.
// 조회수 합이 전부 0이면(ga4 없음) 말뭉치 df 합으로 대신한다.
function rankFields(popular, views, df, n = FIELDS_TOP_N) {
  const sum = (map) => Object.entries(popular).map(([code, slugs]) =>
    [code, slugs.reduce((acc, s) => acc + (map[s] || 0), 0)]);
  let scored = sum(views);
  if (!scored.some(([, v]) => v > 0)) scored = sum(df);
  return scored
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n)
    .map(([code]) => code);
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

function run() {
  const terms = readJson(path.join(ROOT_DIR, "terms-index.json"), []);
  const ga = readJson(path.join(ROOT_DIR, "data", "prune", "ga4.json"), null);
  const stats = readJson(path.join(ROOT_DIR, "data", "oa-stats.json"), { terms: {} });
  const views = {};
  if (ga) {
    for (const [p, v] of Object.entries(ga)) {
      const m = /^\/terms\/(.+)\.html$/.exec(p);
      if (m) views[decodeURIComponent(m[1])] = Number(v) || 0;
    }
  } else {
    console.warn("ga4.json 없음: df만으로 순위를 매깁니다.");
  }
  const df = {};
  for (const [slug, s] of Object.entries(stats.terms || {})) df[slug] = (s && s.df) || 0;
  const out = rankPopular(terms, views, df);
  out._fields = rankFields(out, views, df);
  fs.writeFileSync(path.join(ROOT_DIR, "data", "popular-terms.json"), JSON.stringify(out), "utf8");
  console.log(`popular-terms.json: ${Object.keys(out).length - 1}개 분야, GA ${ga ? Object.keys(views).length : 0}건`);
}

if (require.main === module) run();
module.exports = { rankPopular, rankFields, TOP_N };
