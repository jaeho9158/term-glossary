// 로컬 말뭉치에서 용어가 실제로 쓰인 문장 후보를 찾는다(네트워크 호출 없음, 말뭉치는 읽기 전용).
//
// 말뭉치: data/oa-corpus/index.jsonl(메타) + text/<id>.txt (KCI 초록·KoreaMed 본문 추출),
//        data/oa-corpus/examples/{index.jsonl,text/} 가 있으면 함께 본다. (모두 gitignore)
// 검색어: terms.json 의 title_ko, title_en, aliases (괄호 안 표기는 따로 분리).
// 출력: <out>/<slug>.candidates.json — data/term-usage 항목과 같은 모양의 배열
//        {quote,title,journal,year,url,kciId|source+koreamedId} + matched(어떤 표기에 걸렸는지).
//        사람이 골라 data/term-usage/<slug>.json 에 옮긴다(여기서는 term-usage 를 건드리지 않는다).
// 거르기: 길이 30–220자, 참고문헌 줄·표 찌꺼기 제외, 중복 제거, 논문당 최대 2문장, 용어당 최대 15문장.
//        (term-usage 에 옮길 때 quote 는 160자 이하여야 한다는 테스트가 있으니 고를 때 유의.)
//
// 사용: node scripts/oa/find-usage-candidates.js --out <dir> (--slugs a,b | --from-queue N) [--max 15] [--corpus <dir>] [--terms <terms.json>]
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const MIN_LEN = 30, MAX_LEN = 220, PER_DOC = 2;

const hangul = (s) => (s.match(/[가-힣]/g) || []).length;
const isAlnum = (c) => /[0-9A-Za-z]/.test(c || "");
const isHangul = (c) => /[가-힣]/.test(c || "");

// 검색어 목록: [{text, kind:"ko"|"en"}]
function needlesFor(t) {
  const raw = [t.title_ko, t.title_en, ...(t.aliases || [])].filter(Boolean);
  const titles = new Set([t.title_ko, t.title_en].filter(Boolean).map((x) => String(x).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().toLowerCase()));
  const set = new Map();
  const add = (s) => {
    s = String(s).replace(/\s+/g, " ").trim();
    if (!s) return;
    const ko = hangul(s) > 0;
    if (ko ? s.length < 2 : s.length < 3) return;
    // 두 글자 한글 별칭은 일반어와 겹치기 쉬워(예: 무용) 제목 자체일 때만 쓴다.
    if (ko && s.length < 3 && !titles.has(s.toLowerCase())) return;
    set.set(s.toLowerCase(), { text: s, kind: ko ? "ko" : "en" });
  };
  for (const r of raw) {
    add(r.replace(/\([^)]*\)/g, " "));
    for (const m of r.matchAll(/\(([^)]*)\)/g)) add(m[1]);
  }
  return [...set.values()];
}

// 위치 검사: 앞 글자가 같은 문자 종류(한글/영숫자)면 다른 단어의 일부로 보고 제외. 영문은 뒤도 확인.
function matchNeedle(sent, lower, n) {
  // 짧은 영문 약어(AGE, PCR 등)는 대소문자를 구분한다(일반 단어 age 와 섞이지 않게).
  const cs = n.kind === "en" && n.text.length <= 5;
  const key = cs ? n.text : n.text.toLowerCase();
  const hay = cs ? sent : lower;
  let i = 0;
  while ((i = hay.indexOf(key, i)) >= 0) {
    const before = sent[i - 1], after = sent[i + key.length];
    const first = n.text[0];
    const okBefore = isHangul(first) ? !isHangul(before) : !isAlnum(before);
    const okAfter = n.kind === "en" ? !isAlnum(after) : true;
    if (okBefore && okAfter) return true;
    i += key.length;
  }
  return false;
}

function splitSentences(text) {
  const t = text
    .replace(/([A-Za-z])-\r?\n([a-z])/g, "$1$2")
    .replace(/([가-힣])-\r?\n(?=[가-힣])/g, "$1")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ");
  return t.split(/(?<=[.!?。])\s+(?=[^\s])/);
}

const REF_RES = [
  /https?:\/\/|doi\s*[:.]|\bdoi\.org|\bpp?\.\s*\d|\bVol\.|\bNo\.\s*\d|\bet al\b|\bISSN\b/i,
  /^\s*\[?\d{1,3}[\].)]\s/,
  /\b(19|20)\d\d\s*[;:]\s*\d+/,
  /\(\s*(19|20)\d\d\s*\)\s*[.,]/,
  /[가-힣]{2,4}\s*(,|·)\s*[가-힣]{2,4}\s*(,|·)\s*[가-힣]{2,4}\s*\(/,
  /Journal of|\bJ\s[A-Z][a-z]+\s/,
  /참고\s*문헌|References/,
];
function looksLikeDebris(s) {
  if (s.length < MIN_LEN || s.length > MAX_LEN) return true;
  if (REF_RES.some((r) => r.test(s))) return true;
  const digits = (s.match(/[0-9]/g) || []).length;
  if (digits / s.length > 0.25) return true;
  if ((s.match(/\b\d+(\.\d+)?\b/g) || []).length >= 7) return true;
  if (/\s{3,}|\t/.test(s)) return true;
  if (/[|_]{2,}|\.{4,}|·{3,}|-{4,}/.test(s)) return true;
  if (hangul(s) < 8) return true;
  if ((s.match(/[,;]/g) || []).length >= 8) return true;
  if (/^[^가-힣A-Za-z(“"'‘]/.test(s)) return true;
  return false;
}

const normKey = (s) => s.toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");

function loadCorpus(corpusDir) {
  const docs = new Map();
  for (const dir of [corpusDir, path.join(corpusDir, "examples")]) {
    const idx = path.join(dir, "index.jsonl");
    if (!fs.existsSync(idx)) continue;
    for (const line of fs.readFileSync(idx, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (m.skipped || docs.has(m.id)) continue;
      const f = path.join(dir, "text", `${m.id}.txt`);
      if (!fs.existsSync(f)) continue;
      docs.set(m.id, { meta: m, file: f });
    }
  }
  return docs;
}

function entryFor(meta, quote, matched) {
  const e = { quote, title: meta.title, journal: meta.journal, year: meta.year, url: meta.url };
  if (meta.source === "kci") e.kciId = String(meta.id).replace(/^kci-/, "");
  else {
    e.source = meta.source;
    if (meta.source === "koreamed") { e.koreamedId = String(meta.id); e.url = `https://synapse.koreamed.org/articles/${meta.id}`; }
  }
  e.matched = matched;
  return e;
}

// terms: [{slug,title_ko,title_en,aliases}] → { slug: entries[] }
function findCandidates(terms, corpusDir, opts = {}) {
  const max = opts.max || 15;
  const docs = loadCorpus(corpusDir);
  const specs = terms.map((t) => ({ slug: t.slug, needles: needlesFor(t), found: [], seen: new Set(), perDoc: new Map() }));
  for (const { meta, file } of docs.values()) {
    const text = fs.readFileSync(file, "utf8");
    const lowerAll = text.toLowerCase();
    const live = specs.filter((s) => s.found.length < max * 4 && s.needles.some((n) => lowerAll.includes(n.text.toLowerCase())));
    if (!live.length) continue;
    for (const raw of splitSentences(text)) {
      const sent = raw.trim();
      if (sent.length < MIN_LEN || sent.length > MAX_LEN) continue;
      const lower = sent.toLowerCase();
      let bad = null;
      for (const s of live) {
        if ((s.perDoc.get(meta.id) || 0) >= PER_DOC) continue;
        const hit = s.needles.find((n) => matchNeedle(sent, lower, n));
        if (!hit) continue;
        if (bad === null) bad = looksLikeDebris(sent);
        if (bad) break;
        const k = normKey(sent);
        if (s.seen.has(k)) continue;
        s.seen.add(k);
        s.perDoc.set(meta.id, (s.perDoc.get(meta.id) || 0) + 1);
        s.found.push({ e: entryFor(meta, sent, hit.text), ko: hit.kind === "ko", cit: meta.citations || 0, len: sent.length });
      }
    }
  }
  const out = {};
  for (const s of specs) {
    s.found.sort((a, b) => (b.ko - a.ko) || (b.cit - a.cit) || (Math.abs(a.len - 110) - Math.abs(b.len - 110)));
    out[s.slug] = s.found.slice(0, max).map((f) => f.e);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const outDir = val("--out");
  if (!outDir) { console.error("--out <dir> 필요"); process.exit(1); }
  const termsAll = JSON.parse(fs.readFileSync(val("--terms") || path.join(ROOT, "terms.json"), "utf8"));
  const bySlug = new Map(termsAll.map((t) => [t.slug, t]));
  let slugs = val("--slugs") ? val("--slugs").split(",").filter(Boolean) : [];
  if (val("--from-queue")) slugs = slugs.concat(require("../term-extras-queue.js").buildQueue({ limit: Number(val("--from-queue")) }).map((r) => r.slug));
  if (!slugs.length) { console.error("--slugs a,b 또는 --from-queue N 필요"); process.exit(1); }
  const terms = slugs.map((s) => bySlug.get(s)).filter(Boolean);
  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length) console.warn(`terms.json 에 없는 슬러그: ${missing.join(",")}`);
  const res = findCandidates(terms, val("--corpus") || path.join(ROOT, "data", "oa-corpus"), { max: Number(val("--max")) || 15 });
  fs.mkdirSync(outDir, { recursive: true });
  let ge2 = 0;
  for (const [slug, arr] of Object.entries(res)) {
    fs.writeFileSync(path.join(outDir, `${slug}.candidates.json`), JSON.stringify(arr, null, 2) + "\n");
    if (arr.length >= 2) ge2++;
  }
  console.log(`${terms.length}개 용어 처리, 후보 2문장 이상: ${ge2}, 0문장: ${Object.values(res).filter((a) => !a.length).length} → ${outDir}`);
}

module.exports = { findCandidates, needlesFor, splitSentences, looksLikeDebris, matchNeedle };
if (require.main === module) main();
