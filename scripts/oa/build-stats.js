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
//   cooc   — 등장 자리 ±COOC_WINDOW자 안 명사 토큰 상위 COOC_TOP개(문서 수 기준, 불용어 제외)
// 말뭉치 출처가 늘어도(KCI 초록 등) index.jsonl 형식만 맞추면 그대로 합산된다.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "data", "oa-corpus");
const INDEX = path.join(OUT_DIR, "index.jsonl");
const TEXT_DIR = path.join(OUT_DIR, "text");
const OUTPUT = path.join(ROOT, "data", "oa-stats.json");
const viewer = require(path.join(ROOT, "assets", "viewer.js"));

const COOC_WINDOW = 200;
const COOC_TOP = 20;
// 문서의 이 비율 이상에 나오는 낱말은 어느 표제어 옆에나 있어 뜻을 가리지 못한다(불용어).
const COOC_STOP_SHARE = 0.3;
// 한 편에서만 같이 나온 낱말은 우연일 수 있어 공기어로 치지 않는다.
const COOC_MIN_DOCS = 2;
// 명사 근거: 말뭉치에서 격조사가 붙은 꼴로 이만큼 이상 나온 어간(사전 표제어는 무조건 인정).
const NOUN_PARTICLES = ["을", "를", "의", "에", "와", "과", "으로", "에서", "에게"];
const NOUN_MIN_EVIDENCE = 3;

function loadDocs() {
  if (!fs.existsSync(INDEX)) return [];
  return fs.readFileSync(INDEX, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
    .filter((r) => !r.skipped && fs.existsSync(path.join(TEXT_DIR, `${r.id}.txt`)))
    .map((r) => ({ ...r, text: fs.readFileSync(path.join(TEXT_DIR, `${r.id}.txt`), "utf8") }));
}

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

function buildStats(docs, terms) {
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

  const stats = new Map();
  docs.forEach((d) => {
    const matches = viewer.matchTermsWithIndex(d.text, index);
    for (const m of matches) {
      let s = stats.get(m.slug);
      if (!s) stats.set(m.slug, (s = { title_ko: m.title_ko, title_en: m.title_en, df: 0, count: 0, fields: {}, cooc: new Map() }));
      s.df++;
      s.count += (m.occurrences || []).length || m.count || 1;
      s.fields[d.field] = (s.fields[d.field] || 0) + 1;
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
      for (const n of near) s.cooc.set(n, (s.cooc.get(n) || 0) + 1);
    }
  });

  const out = {};
  for (const slug of [...stats.keys()].sort()) {
    const s = stats.get(slug);
    const cooc = [...s.cooc.entries()]
      .filter(([, c]) => c >= COOC_MIN_DOCS)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, COOC_TOP)
      .map(([w]) => w);
    const entry = { df: s.df, count: s.count, fields: s.fields };
    if (cooc.length) entry.cooc = cooc;
    out[slug] = entry;
  }
  const fieldDocs = {};
  for (const d of docs) fieldDocs[d.field] = (fieldDocs[d.field] || 0) + 1;
  return { v: 1, docs: docs.length, fieldDocs, sources: [...new Set(docs.map((d) => d.source))].sort(), terms: out };
}

function main() {
  const docs = loadDocs();
  if (!docs.length) { console.log("말뭉치 텍스트가 없습니다 — extract-text.js를 먼저 돌리세요."); return; }
  const result = buildStats(docs, loadTerms());
  // 한 줄에 표제어 하나: diff를 읽을 수 있고 크기도 들여쓰기 전체보다 작다.
  const body = Object.entries(result.terms).map(([k, v]) => JSON.stringify(k) + ":" + JSON.stringify(v)).join(",\n");
  const json = `{"v":1,"docs":${result.docs},"fieldDocs":${JSON.stringify(result.fieldDocs)},"sources":${JSON.stringify(result.sources)},"terms":{\n${body}\n}}\n`;
  fs.writeFileSync(OUTPUT, json, "utf8");
  console.log(`oa-stats.json: 문서 ${result.docs}편, 표제어 ${Object.keys(result.terms).length}개, ${(Buffer.byteLength(json) / 1024).toFixed(0)}KB`);
}

if (require.main === module) main();

module.exports = { buildStats, nounOf, COOC_WINDOW, COOC_TOP };
