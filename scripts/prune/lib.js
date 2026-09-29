// 용어 정리(가지치기·병합) 공용 함수. 계획: docs/superpowers/plans/2026-09-29-term-prune-merge.md
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PRUNE_DIR = path.join(ROOT, "data", "prune");

// merge-term-round.js의 normTitle과 같은 정규화.
const norm = (s) => String(s || "").toLowerCase().replace(/[\s\-–—_·.()（）,'"]/g, "");

// 끝 접미 제거는 별도 키(normStem)에만 쓴다(과병합 방지). 남는 글자가 2자 미만이면 제거하지 않는다.
const STEM_SUFFIXES = ["이론", "효과", "현상", "모형", "모델", "기법", "방법", "분석", "검정", "법"];
function normStem(s) {
  const n = norm(s);
  for (const suf of STEM_SUFFIXES) {
    if (n.endsWith(suf) && n.length - suf.length >= 2) return n.slice(0, -suf.length);
  }
  return n;
}

const BODY_FIELDS = ["definition", "easy", "why", "deeper", "caution"];
const bodyLength = (t) => BODY_FIELDS.reduce((n, f) => n + (typeof t[f] === "string" ? t[f].length : 0), 0);

// 들어오는 참조 수: 다른 용어의 related + prerequisites에 이 slug가 들어 있는 횟수(자기 참조 제외).
function inboundCounts(terms) {
  const inbound = new Map();
  for (const t of terms) {
    const seen = new Set();
    for (const s of [...(t.related || []), ...(t.prerequisites || [])]) {
      if (s === t.slug || seen.has(s)) continue;
      seen.add(s);
      inbound.set(s, (inbound.get(s) || 0) + 1);
    }
  }
  return inbound;
}

// GA4 JSON({"/terms/<slug>.html": views}) → Map(slug → views)
function loadGa(file = path.join(PRUNE_DIR, "ga4.json")) {
  const ga = new Map();
  if (!fs.existsSync(file)) return ga;
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [k, v] of Object.entries(raw)) {
    const m = k.match(/^\/terms\/(.+)\.html$/);
    if (!m) continue;
    let slug = m[1];
    try { slug = decodeURIComponent(slug); } catch (e) { /* 그대로 쓴다 */ }
    ga.set(slug, (ga.get(slug) || 0) + v);
  }
  return ga;
}

function charNgrams(s, n) {
  const str = String(s || "").replace(/\s+/g, "");
  const out = [];
  for (let i = 0; i + n <= str.length; i++) out.push(str.slice(i, i + n));
  return out;
}

function jaccard2(a, b) {
  const A = new Set(charNgrams(norm(a), 2));
  const B = new Set(charNgrams(norm(b), 2));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

// 문자 3-gram TF-IDF. 각 문서는 Map(gramId → 정규화된 가중치), idf는 전체 문서에서 계산.
function buildTfidf(texts) {
  const ids = new Map();
  const df = [];
  const docsTf = texts.map((text) => {
    const tf = new Map();
    for (const g of charNgrams(text, 3)) {
      let id = ids.get(g);
      if (id === undefined) { id = ids.size; ids.set(g, id); df.push(0); }
      tf.set(id, (tf.get(id) || 0) + 1);
    }
    for (const id of tf.keys()) df[id]++;
    return tf;
  });
  const N = texts.length;
  const idf = df.map((d) => Math.log(1 + N / d));
  const vectors = docsTf.map((tf) => {
    const v = new Map();
    let sum = 0;
    for (const [id, c] of tf) { const w = (1 + Math.log(c)) * idf[id]; v.set(id, w); sum += w * w; }
    const len = Math.sqrt(sum) || 1;
    for (const [id, w] of v) v.set(id, w / len);
    return v;
  });
  return { vectors, df, idf };
}

function cosine(a, b) {
  const [s, l] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [id, w] of s) { const o = l.get(id); if (o) dot += w * o; }
  return dot;
}

module.exports = { ROOT, PRUNE_DIR, norm, normStem, STEM_SUFFIXES, bodyLength, BODY_FIELDS, inboundCounts, loadGa,
  charNgrams, jaccard2, buildTfidf, cosine };
