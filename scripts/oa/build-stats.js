// 말뭉치 텍스트 → 표제어별 통계(data/oa-stats.json, 커밋함).
//
// 뷰어가 실제 논문에서 무엇을 잡는지를 그대로 세기 위해 매칭은 뷰어 함수
// (buildExactIndex + matchTermsWithIndex: wordOccurrences 토큰화, 조사 제거 후보,
// 참고문헌 제외)를 쓴다. 다만 인덱스의 일반어 등급 3 제외는 풀어 둔다 — 등급을 이
// 통계로 다시 매기려는 것이라, 이미 빠진 말도 세야 한다. 영문 일반어(등급 1) 제외는
// 그대로 둔다(treatment·function이 참고문헌 밖 영어 문장에서 세지지 않도록).
//
// 표제어(slug)마다:
//   df     — 등장 문서 수, fields — {분야 코드: 문서 수}, count — 총 등장 수
//   dfNeutral / fieldsNeutral — 중립 질의 표본(index.jsonl의 sampling:"neutral")만 센 df·분야별 문서 수.
//            표제어 질의로 모은 문서(sampling 없음)는 질의어 편향이 있어 가지치기 판단에서 뺀다.
//   cooc   — 등장 자리 ±COOC_WINDOW자 안 명사 토큰 상위 COOC_TOP개(문서 수 기준, 불용어 제외)
// 말뭉치 출처가 늘어도(KCI 초록 등) index.jsonl 형식만 맞추면 그대로 합산된다.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
// 말뭉치는 메인 저장소에만 있다(gitignore). 워크트리에서는 OA_CORPUS_DIR로 가리킨다. 통계 출력은 항상 ROOT/data.
const OUT_DIR = process.env.OA_CORPUS_DIR ? path.resolve(process.env.OA_CORPUS_DIR) : path.join(ROOT, "data", "oa-corpus");
const INDEX = path.join(OUT_DIR, "index.jsonl");
const TEXT_DIR = path.join(OUT_DIR, "text");
const OUTPUT = path.join(ROOT, "data", "oa-stats.json");
const viewer = require(path.join(ROOT, "assets", "term-match.js"));

const COOC_WINDOW = 200;
const COOC_TOP = 20;
// 문서의 이 비율 이상에 나오는 낱말은 어느 표제어 옆에나 있어 뜻을 가리지 못한다(불용어).
const COOC_STOP_SHARE = 0.3;
// 한 편에서만 같이 나온 낱말은 우연일 수 있어 공기어로 치지 않는다.
const COOC_MIN_DOCS = 2;
// 분야 조건부 공기어(coocField)는 자기 분야 문서 3편 이상 + 다른 분야보다 자기 분야에서 더 많이 나온 낱말만.
// 2편이면 우연히 겹친 일반어가 끼어 정답 손실이 늘었다(13편 채점: 2편 정답 246/손실 8, 3편 정답 247/손실 5, 오답 4 불변).
const COOC_FIELD_MIN_DOCS = 3;
// 명사 근거: 말뭉치에서 격조사가 붙은 꼴로 이만큼 이상 나온 어간(사전 표제어는 무조건 인정).
const NOUN_PARTICLES = ["을", "를", "의", "에", "와", "과", "으로", "에서", "에게"];
const NOUN_MIN_EVIDENCE = 3;

// 수집기마다 자기 색인(index.<출처>.jsonl)에 쓴다 — index.jsonl과 index.*.jsonl을 모두 읽고,
// DOI(있으면) → 정규화한 제목 순으로 중복을 걸러 처음 것을 남긴다.
function indexFiles() {
  if (!fs.existsSync(OUT_DIR)) return [];
  return fs.readdirSync(OUT_DIR).filter((f) => f === "index.jsonl" || /^index\..+\.jsonl$/.test(f)).sort((a, b) => (a === "index.jsonl" ? -1 : b === "index.jsonl" ? 1 : a.localeCompare(b)));
}
const normTitle = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
function dedupe(rows) {
  const seen = new Set(), out = [];
  for (const r of rows) {
    const doi = r.doi ? "doi:" + String(r.doi).toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "") : null;
    const nt = normTitle(r.title).length >= 12 ? "t:" + normTitle(r.title) : null;
    if ((doi && seen.has(doi)) || (nt && seen.has(nt)) || seen.has("id:" + r.id)) continue;
    if (doi) seen.add(doi);
    if (nt) seen.add(nt);
    seen.add("id:" + r.id);
    out.push(r);
  }
  return out;
}
function loadDocs() {
  const rows = [];
  for (const f of indexFiles()) {
    for (const l of fs.readFileSync(path.join(OUT_DIR, f), "utf8").split("\n")) {
      if (!l.trim()) continue;
      try { rows.push(JSON.parse(l)); } catch (e) { /* 쓰는 중인 마지막 줄 */ }
    }
  }
  return dedupe(rows)
    .filter((r) => !r.skipped && fs.existsSync(path.join(TEXT_DIR, `${r.id}.txt`)))
    .map((r) => ({ ...r, text: fs.readFileSync(path.join(TEXT_DIR, `${r.id}.txt`), "utf8") }));
}

const EN_STOP = new Set(("a an the and or but if of in on at to for from by with without within between among about as is are was were be been being this that these those it its we our they their " +
  "he she his her not no nor so than then there here which who whom whose what when where how all any both each few more most other some such only own same too very can will just should would could may might must also " +
  "into over under again further once during before after above below up down out off per via using used use based study studies results result method methods analysis data paper research show shown shows found find however thus " +
  "et al fig table one two three").split(" "));
function enTokens(text) { return (text.toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).filter((w) => !EN_STOP.has(w)); }

function loadTerms() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "viewer-index.json"), "utf8"));
  return viewer.decodeViewerIndex(raw).map((t) => ({ ...t, common: 0 }));
}

// 낱말 → 명사 후보(2~4음절 중 가장 짧은 어간). generate-viewer-index.js nounOf와 같은 방식.
function nounOf(word) {
  let best = null;
  for (const stem of viewer.senseStems(word)) {
    if (stem.length >= 2 && stem.length <= 4 && (!best || stem.length < best.length)) best = stem;
  }
  return best;
}

function nounEvidence(docs) {
  const ev = new Map();
  for (const d of docs) {
    for (const w of d.text.match(/[가-힣]+/g) || []) {
      for (const p of NOUN_PARTICLES) {
        const stem = w.slice(0, -p.length);
        if (w.endsWith(p) && stem.length >= 2 && stem.length <= 4) ev.set(stem, (ev.get(stem) || 0) + 1);
      }
    }
  }
  return ev;
}

function buildStats(allDocs, terms) {
  const docs = allDocs.filter((d) => d.lang !== "en");
  const enDocs = allDocs.filter((d) => d.lang === "en");
  const index = viewer.buildExactIndex(terms);
  const titles = new Set(terms.map((t) => (t.title_ko || "").replace(/\s+/g, "")));
  const evidence = nounEvidence(docs);
  const isNoun = (w) => titles.has(w) || (evidence.get(w) || 0) >= NOUN_MIN_EVIDENCE;

  // 말뭉치 문서빈도(불용어 판정용)
  const tokenDf = new Map();
  const docNouns = docs.map((d) => {
    const set = new Set();
    for (const w of d.text.match(/[가-힣]+/g) || []) {
      const n = nounOf(w);
      if (n && isNoun(n)) set.add(n);
    }
    for (const n of set) tokenDf.set(n, (tokenDf.get(n) || 0) + 1);
    return set;
  });
  const stopDf = Math.max(COOC_MIN_DOCS + 1, Math.ceil(docs.length * COOC_STOP_SHARE));

  const catOf = new Map(terms.map((t) => [t.slug, new Set(t.categories || [])]));
  const ownCodes = (slug) => catOf.get(slug) || new Set();
  const stats = new Map();
  docs.forEach((d) => {
    const matches = viewer.matchTermsWithIndex(d.text, index);
    for (const m of matches) {
      let s = stats.get(m.slug);
      if (!s) stats.set(m.slug, (s = { title_ko: m.title_ko, title_en: m.title_en, df: 0, count: 0, fields: {}, dfNeutral: 0, fieldsNeutral: {}, cooc: new Map(), coocOwn: new Map(), coocOther: new Map() }));
      s.df++;
      s.count += (m.occurrences || []).length || m.count || 1;
      s.fields[d.field] = (s.fields[d.field] || 0) + 1;
      if (d.sampling === "neutral") {
        s.dfNeutral++;
        s.fieldsNeutral[d.field] = (s.fieldsNeutral[d.field] || 0) + 1;
      }
      const own = (m.title_ko || "").replace(/\s+/g, "");
      const near = new Set();
      for (const occ of m.occurrences || []) {
        const win = d.text.slice(Math.max(0, occ.start - COOC_WINDOW), occ.start + occ.length + COOC_WINDOW);
        for (const w of win.match(/[가-힣]+/g) || []) {
          const n = nounOf(w);
          if (!n || !isNoun(n) || n === own || own.includes(n)) continue;
          if ((tokenDf.get(n) || 0) >= stopDf) continue;
          near.add(n);
        }
      }
      const inOwn = ownCodes(m.slug).has(d.field);
      for (const n of near) {
        s.cooc.set(n, (s.cooc.get(n) || 0) + 1);
        const side = inOwn ? s.coocOwn : s.coocOther;
        side.set(n, (side.get(n) || 0) + 1);
      }
    }
  });

  const fieldDocsKo = {};
  for (const d of docs) fieldDocsKo[d.field] = (fieldDocsKo[d.field] || 0) + 1;
  const out = {};
  for (const slug of [...stats.keys()].sort()) {
    const s = stats.get(slug);
    const cooc = [...s.cooc.entries()]
      .filter(([, c]) => c >= COOC_MIN_DOCS)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, COOC_TOP)
      .map(([w]) => w);
    const entry = { df: s.df, count: s.count, fields: s.fields, dfNeutral: s.dfNeutral };
    if (s.dfNeutral) entry.fieldsNeutral = s.fieldsNeutral;
    if (cooc.length) entry.cooc = cooc;
    // 분야 조건부 공기어: 자기 분야 문서에서 2편 이상, 다른 분야 문서보다 자기 분야에서 더 많이 나온 낱말
    const coocField = [...s.coocOwn.entries()].filter(([w, c]) => c >= COOC_FIELD_MIN_DOCS && c > (s.coocOther.get(w) || 0))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, COOC_TOP).map(([w]) => w);
    if (coocField.length) entry.coocField = coocField;
    // 분야 균형 df: 분야별 출현율(그 분야 문서 중 몇 %)의 평균 x1000. 분야 쏠림을 보정한 인기도.
    const rates = Object.entries(fieldDocsKo).map(([f, n]) => (s.fields[f] || 0) / n);
    entry.dfBal = Math.round((1000 * rates.reduce((a, b) => a + b, 0)) / rates.length);
    out[slug] = entry;
  }
  const en = buildEnglish(enDocs, terms, out);
  const sourceDocs = {};
  for (const d of allDocs) { const k = d.source + "/" + (d.lang === "en" ? "en" : "ko"); sourceDocs[k] = (sourceDocs[k] || 0) + 1; }
  const fieldDocs = {};
  for (const d of docs) fieldDocs[d.field] = (fieldDocs[d.field] || 0) + 1;
  const neutralDocs = docs.filter((d) => d.sampling === "neutral");
  const fieldDocsNeutral = {};
  for (const d of neutralDocs) fieldDocsNeutral[d.field] = (fieldDocsNeutral[d.field] || 0) + 1;
  return { v: 3, sourceDocs, docsEn: enDocs.length, fieldDocsEn: en.fieldDocsEn, docs: docs.length, docsNeutral: neutralDocs.length, fieldDocs, fieldDocsNeutral, sources: [...new Set(docs.map((d) => d.source))].sort(), terms: out };
}

// 영어 초록: 뷰어 매칭을 영어 본문에 그대로 쓰고(영문 표제어·별칭만 걸린다), 공기어는 소문자 낱말(불용어 제외).
function buildEnglish(enDocs, terms, out) {
  const fieldDocsEn = {};
  for (const d of enDocs) fieldDocsEn[d.field] = (fieldDocsEn[d.field] || 0) + 1;
  if (!enDocs.length) return { fieldDocsEn };
  const index = viewer.buildExactIndex(terms);
  const tokDf = new Map();
  for (const d of enDocs) for (const w of new Set(enTokens(d.text))) tokDf.set(w, (tokDf.get(w) || 0) + 1);
  const stopDf = Math.max(COOC_MIN_DOCS + 1, Math.ceil(enDocs.length * COOC_STOP_SHARE));
  const st = new Map();
  for (const d of enDocs) {
    for (const m of viewer.matchTermsWithIndex(d.text, index)) {
      let s = st.get(m.slug);
      if (!s) st.set(m.slug, (s = { df: 0, fields: {}, cooc: new Map() }));
      s.df++; s.fields[d.field] = (s.fields[d.field] || 0) + 1;
      const own = new Set(enTokens(m.title_en || ""));
      const near = new Set();
      for (const occ of m.occurrences || []) {
        const win = d.text.slice(Math.max(0, occ.start - COOC_WINDOW), occ.start + occ.length + COOC_WINDOW);
        for (const w of enTokens(win)) if (!own.has(w) && (tokDf.get(w) || 0) < stopDf) near.add(w);
      }
      for (const w of near) s.cooc.set(w, (s.cooc.get(w) || 0) + 1);
    }
  }
  for (const [slug, s] of st) {
    const e = out[slug] || (out[slug] = { df: 0, count: 0, fields: {}, dfNeutral: 0 });
    e.dfEn = s.df; e.fieldsEn = s.fields;
    const c = [...s.cooc.entries()].filter(([, n]) => n >= COOC_MIN_DOCS).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, COOC_TOP).map(([w]) => w);
    if (c.length) e.coocEn = c;
  }
  return { fieldDocsEn };
}

function main() {
  const docs = loadDocs();
  if (!docs.length) { console.log("말뭉치 텍스트가 없습니다 — extract-text.js를 먼저 돌리세요."); return; }
  const result = buildStats(docs, loadTerms());
  // 한 줄에 표제어 하나: diff를 읽을 수 있고 크기도 들여쓰기 전체보다 작다.
  const body = Object.entries(result.terms).map(([k, v]) => JSON.stringify(k) + ":" + JSON.stringify(v)).join(",\n");
  const json = `{"v":${result.v},"docs":${result.docs},"docsEn":${result.docsEn},"fieldDocsEn":${JSON.stringify(result.fieldDocsEn)},"sourceDocs":${JSON.stringify(result.sourceDocs)},"docsNeutral":${result.docsNeutral},"fieldDocs":${JSON.stringify(result.fieldDocs)},"fieldDocsNeutral":${JSON.stringify(result.fieldDocsNeutral)},"sources":${JSON.stringify(result.sources)},"terms":{\n${body}\n}}\n`;
  const outArg = process.argv.indexOf("--out");
  const output = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : OUTPUT;
  fs.writeFileSync(output, json, "utf8");
  console.log(`${path.basename(output)}: 문서 ${result.docs}편, 표제어 ${Object.keys(result.terms).length}개, ${(Buffer.byteLength(json) / 1024).toFixed(0)}KB`);
}

if (require.main === module) main();

module.exports = { buildStats, nounOf, COOC_WINDOW, COOC_TOP };
