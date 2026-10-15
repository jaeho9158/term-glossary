// KCI 초록 대량 수집기(분야 균형 + 중립 표본). collect-kci-neutral.js의 질의 방식을 연도 창으로 확장.
// 출력: <OA_CORPUS_DIR>/index.kci2.jsonl, text/kci-<id>.txt (index.jsonl과 index.kci2.jsonl의 id는 건너뜀).
// 키는 .env.local(KCI_API_KEY)을 실행 때만 읽고 어디에도 남기지 않는다.
// 예의/상한: 요청 간 1.1초, 재시도 1회, 하루 요청 상한 DAILY_CAP(기본 5000; 공식 문서에 한도 명시 없음).
// 상태(분 단위 재개): <corpus>/kci2.state.json = {day, requests, done:[taskKey...]}.
// 사용: node scripts/oa/collect-kci-bulk.js [--daily-cap N] [--target-per-field N]
const fs = require("fs");
const path = require("path");
const { neutralQueries, parseRecords } = require("./collect-kci-neutral.js");

const ROOT = path.join(__dirname, "..", "..");
const CORPUS = process.env.OA_CORPUS_DIR || "C:/Users/hssh9/용돈벌이/data/oa-corpus";
const LOG = process.env.KCI2_LOG || path.join(ROOT, ".superpowers", "tmp-review", "oa", "kci2.log");
const API = "https://open.kci.go.kr/po/openapi/openApiSearch.kci";
const DELAY_MS = 1100;
const YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016];
const MAX_PAGES = 3;

const today = (d = new Date()) => d.toISOString().slice(0, 10);
const redactWith = (key) => (s) => (key ? String(s).split(key).join("<KEY>") : String(s));

// 한 분야의 작업 목록: 질의어 x 연도 창. 질의어 순서를 유지하며 연도를 번갈아 돌려 편향을 줄인다.
// 라벨 낱말의 어간(학/공학/과학 제거 뒤 앞 2자·뒤 2자). 합성어 라벨(전기전자공학)은 제목에 통째로 거의 안 나온다.
function stems(label) {
  const out = [];
  for (const w of String(label || "").split(/[s·‧・/]+/)) {
    const b = w.replace(/(공학|과학|학)$/, "");
    if (!/^[가-힣]{2,}$/.test(b)) continue;
    out.push(b);
    if (b.length >= 4) out.push(b.slice(0, 2), b.slice(-2));
  }
  return [...new Set(out)];
}

function queriesFor(label) {
  const base = neutralQueries(label, undefined, 99);
  const st = stems(label);
  const combos = [];
  for (const n of ["연구", "분석", "효과", "영향", "특성", "평가"]) for (const t of st) combos.push(`${t} ${n}`);
  return [...new Set([...base.slice(0, 1), ...st, ...base.slice(1), ...combos])].slice(0, 24);
}

function buildTasks(code, label) {
  const qs = queriesFor(label);
  const tasks = [];
  for (const y of YEARS) for (const q of qs) tasks.push({ code, q, year: y, key: `${code}|${q}|${y}` });
  return tasks;
}

// 분야별 큐를 부족한 분야부터 라운드로빈. counts: code->현재 편수. 목표 이상인 분야는 건너뜀.
function pickNext(queues, counts, target, done) {
  const codes = Object.keys(queues).filter((c) => (counts[c] || 0) < target)
    .sort((a, b) => (counts[a] || 0) - (counts[b] || 0));
  for (const c of codes) {
    const q = queues[c];
    while (q.length && done.has(q[0].key)) q.shift();
    if (q.length) return q.shift();
  }
  return null;
}

function makeRecord(r, code, q) {
  return { id: `kci-${r.id}`, source: "kci", lang: "ko", journal: r.journal, field: code, title: r.title,
    year: r.year, url: r.url, license: "kci-open-api", sampling: "neutral", citations: r.citations, query: q };
}

function readJsonl(f) {
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
}

async function main() {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const DAILY_CAP = arg("--daily-cap", 5000);
  const TARGET = arg("--target-per-field", 500);
  const env = fs.readFileSync(path.join(process.env.KCI_ENV_ROOT || "C:/Users/hssh9/용돈벌이", ".env.local"), "utf8");
  const km = env.match(/^KCI_API_KEY=(.*)$/m);
  if (!km || !km[1].trim()) throw new Error(".env.local에 KCI_API_KEY가 없습니다");
  const KEY = km[1].trim();
  const redact = redactWith(KEY);
  const log = (s) => { try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, `${new Date().toISOString()} ${redact(s)}\n`); } catch {} };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const TEXT = path.join(CORPUS, "text");
  const IDX1 = path.join(CORPUS, "index.jsonl");
  const IDX2 = path.join(CORPUS, "index.kci2.jsonl");
  const STATE = path.join(CORPUS, "kci2.state.json");
  fs.mkdirSync(TEXT, { recursive: true });

  const known = new Set(), counts = {};
  const before = {};
  for (const f of [IDX1, IDX2]) for (const r of readJsonl(f)) {
    known.add(r.id);
    if (r.source === "kci") { counts[r.field] = (counts[r.field] || 0) + 1; }
  }
  Object.assign(before, counts);
  let state = { day: today(), requests: 0, done: [] };
  try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch {}
  if (state.day !== today()) state.day = today(), state.requests = 0;
  const done = new Set(state.done);
  const save = () => fs.writeFileSync(STATE, JSON.stringify({ day: state.day, requests: state.requests, done: [...done] }));

  const data = require(path.join(ROOT, "assets", "category-data.js"));
  const queues = {};
  for (const g of data.CATEGORY_GROUPS) for (const c of g.codes) queues[c] = buildTasks(c, data.CATEGORY_LABELS[c]);

  let last = 0, added = 0, next100 = 100;
  async function fetchPage(task, page) {
    const url = `${API}?apiCode=articleSearch&key=${encodeURIComponent(KEY)}&title=${encodeURIComponent(task.q)}`
      + `&dateFrom=${task.year}01&dateTo=${task.year}12&page=${page}&displayCount=100`;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (state.requests >= DAILY_CAP) throw new Error("DAILY_CAP");
      const w = last + DELAY_MS - Date.now(); if (w > 0) await sleep(w);
      last = Date.now(); state.requests++;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (e) { if (attempt === 1) throw new Error(redact(e.message)); }
    }
  }

  log(`start requests=${state.requests}/${DAILY_CAP} target=${TARGET}`);
  try {
    for (let task; (task = pickNext(queues, counts, TARGET, done));) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const xml = await fetchPage(task, page);
        const total = (xml.match(/<record>/g) || []).length;
        for (const r of parseRecords(xml)) {
          const id = `kci-${r.id}`;
          if (known.has(id) || (counts[task.code] || 0) >= TARGET) continue;
          known.add(id);
          fs.writeFileSync(path.join(TEXT, `${id}.txt`), `${r.title}\n\n${r.abstract}\n`);
          fs.appendFileSync(IDX2, JSON.stringify(makeRecord(r, task.code, task.q)) + "\n");
          counts[task.code] = (counts[task.code] || 0) + 1; added++;
          if (added >= next100) { log(`docs+${added} requests=${state.requests}/${DAILY_CAP}`); next100 += 100; }
        }
        if (total < 100) break;
      }
      done.add(task.key); save();
    }
    log("모든 분야가 목표에 도달했거나 작업이 소진됨");
  } catch (e) {
    log(e.message === "DAILY_CAP" ? `일일 상한 도달 requests=${state.requests}` : `중단: ${redact(e.message)}`);
  }
  save();
  log(`end added=${added} requests=${state.requests}`);
}

if (require.main === module) main().catch((e) => { console.error(String(e.message).slice(0, 200)); process.exit(1); });

module.exports = { stems, queriesFor, buildTasks, pickNext, makeRecord, today, redactWith };
