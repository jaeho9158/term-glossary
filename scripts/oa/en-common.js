// 영문 초록 수집기 공용 모듈 (Europe PMC / arXiv / Semantic Scholar).
// 말뭉치 폴더는 메인 리포의 data/oa-corpus(gitignore) — 원문은 절대 커밋하지 않는다.
// 개인정보(이메일 등)는 헤더·URL·UA 어디에도 넣지 않는다.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CORPUS = process.env.OA_CORPUS_DIR || "C:/Users/hssh9/용돈벌이/data/oa-corpus";
const TEXT_DIR = path.join(CORPUS, "text");
const LOG_DIR = path.join(ROOT, ".superpowers", "tmp-review", "oa");
const UA = "termglossary-corpus/1.0 (+https://termglossary.kr)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0; return h; }

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function cleanText(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : " "; }
      return ENT[e.toLowerCase()] ?? " ";
    })
    .replace(/\s+/g, " ").trim();
}

// 영어 판정: 한글/CJK/키릴 없음 + ASCII 글자 비율 + 흔한 영단어 포함.
function isEnglish(s) {
  if (!s || /[가-힣\u3040-\u30ff\u4e00-\u9fff\u0400-\u04ff]/.test(s)) return false;
  const letters = (s.match(/\p{L}/gu) || []).length;
  if (letters < 50) return false;
  const ascii = (s.match(/[A-Za-z]/g) || []).length;
  if (ascii / letters < 0.9) return false;
  const common = (s.toLowerCase().match(/\b(the|of|and|in|to|is|a|with|for|that|we|this)\b/g) || []).length;
  return common >= 5;
}

const MIN_ABSTRACT = 200;
const BAD_TITLE = /^(correction|erratum|corrigendum|retraction|retracted|withdrawn|publisher correction|author correction)\b/i;
function acceptable(title, abstract) {
  return !!title && !BAD_TITLE.test(title) && abstract.length >= MIN_ABSTRACT && isEnglish(`${title} ${abstract}`);
}

function loadCategoryGroups() {
  return require(path.join(ROOT, "assets", "category-data.js")).CATEGORY_GROUPS;
}

function sanitizeQueryTerm(t) {
  const s = String(t || "").replace(/\s*\([^)]*\)/g, "").replace(/[^A-Za-z0-9 \-']/g, " ").replace(/\s+/g, " ").trim();
  return s.length >= 4 && s.length <= 40 ? s : null;
}

// 코드별 영문 표제어 질의 후보(결정적 섞기). 해당 카테고리가 하나뿐인 용어 우선.
function termTitlesFor(terms, code, n) {
  const single = [], multi = [];
  for (const t of terms) {
    if (!t.categories || !t.categories.includes(code)) continue;
    const q = sanitizeQueryTerm(t.title_en);
    if (!q) continue;
    (t.categories.length === 1 ? single : multi).push(q);
  }
  const uniq = (a) => [...new Set(a)].sort((x, y) => hash(x + code) - hash(y + code));
  return [...uniq(single), ...uniq(multi)].slice(0, n);
}

function loadTerms() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
}

// 예의 있는 fetch: 요청 간 지연, 429/5xx 지수 백오프(Retry-After 존중), 상한.
function makeFetcher({ delayMs, maxRequests, backoffBaseMs = 30000, maxRetries = 5, timeoutMs = 90000, fetchImpl = fetch, sleepImpl = sleep }) {
  let last = 0;
  const f = { requests: 0 };
  f.get = async function (url) {
    for (let attempt = 0; ; attempt++) {
      if (f.requests >= maxRequests) { const e = new Error("요청 상한 도달"); e.fatal = true; throw e; }
      const wait = last + delayMs - Date.now();
      if (wait > 0) await sleepImpl(wait);
      last = Date.now();
      f.requests++;
      let res;
      try {
        res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        if (attempt >= 2) throw new Error(`network: ${err.message}`);
        await sleepImpl(backoffBaseMs / 5 * 2 ** attempt);
        continue;
      }
      if (res.ok) return res.text();
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxRetries) { const e = new Error(`HTTP ${res.status} 재시도 소진`); e.fatal = true; throw e; }
        const ra = Number(res.headers && res.headers.get && res.headers.get("retry-after"));
        await sleepImpl(Math.max(backoffBaseMs * 2 ** attempt, Number.isFinite(ra) ? ra * 1000 : 0));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    }
  };
  return f;
}

function makeStore(source) {
  fs.mkdirSync(TEXT_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const indexFile = path.join(CORPUS, `index.${source}.jsonl`);
  const stateFile = path.join(CORPUS, `state.${source}.json`);
  const logFile = path.join(LOG_DIR, `${source}.log`);
  const known = new Set(), perField = {};
  if (fs.existsSync(indexFile)) {
    for (const l of fs.readFileSync(indexFile, "utf8").split("\n")) {
      if (!l.trim()) continue;
      try { const r = JSON.parse(l); known.add(r.id); perField[r.field] = (perField[r.field] || 0) + 1; } catch {}
    }
  }
  let state = {};
  try { state = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch {}
  const log = (msg) => { const line = `${new Date().toISOString()} ${msg}`; console.log(line); fs.appendFileSync(logFile, line + "\n"); };
  return {
    known, perField, state, log,
    saveState() { fs.writeFileSync(stateFile, JSON.stringify(state)); },
    save(rec, abstract) {
      fs.writeFileSync(path.join(TEXT_DIR, `${rec.id}.txt`), `${rec.title}\n\n${abstract}\n`);
      fs.appendFileSync(indexFile, JSON.stringify(rec) + "\n");
      known.add(rec.id); perField[rec.field] = (perField[rec.field] || 0) + 1;
    },
    total() { return known.size; },
  };
}

const safeId = (source, raw) => `${source}-${String(raw).replace(/[^A-Za-z0-9._-]/g, "_")}`;

// 라운드로빈 크롤러. tasks: [{key, code, cap?}] (코드별 우선순위 순).
// fetchPage(task, st) -> {recs:[{rawId,title,abstract,journal,year,url,license,doi}], next}; next==null이면 질의 소진.
async function crawl({ source, tasks, fetchPage, store, quotaPerCode, perTaskCap = Infinity, fetcher, logEvery = 100 }) {
  const byCode = new Map();
  for (const t of tasks) { if (!byCode.has(t.code)) byCode.set(t.code, []); byCode.get(t.code).push(t); }
  let added = 0, sinceLog = 0;
  store.log(`start ${source}: ${tasks.length} tasks, ${byCode.size} codes, 기존 ${store.total()}편`);
  try {
    for (let progress = true; progress;) {
      progress = false;
      for (const [code, list] of byCode) {
        if ((store.perField[code] || 0) >= quotaPerCode) continue;
        const task = list.find((t) => !(store.state[t.key] || {}).done);
        if (!task) continue;
        progress = true;
        const cap = task.cap ?? perTaskCap;
        const st = store.state[task.key] || (store.state[task.key] = { taken: 0, next: null, errs: 0, done: false });
        let page;
        try { page = await fetchPage(task, st); }
        catch (err) {
          if (err.fatal) throw err;
          store.log(`warn ${task.key}: ${err.message}`);
          if (++st.errs >= 2) st.done = true;
          store.saveState();
          continue;
        }
        for (const r of page.recs) {
          if (st.taken >= cap || (store.perField[code] || 0) >= quotaPerCode) break;
          const id = safeId(source, r.rawId);
          if (store.known.has(id) || !acceptable(r.title, r.abstract)) continue;
          store.save({ id, source, lang: "en", journal: r.journal || "", field: code, title: r.title, year: r.year || null, url: r.url || "", license: r.license || "", doi: r.doi || "" }, r.abstract);
          st.taken++; added++; sinceLog++;
          if (sinceLog >= logEvery) { sinceLog = 0; store.log(`progress +${added} (총 ${store.total()}편, 요청 ${fetcher.requests})`); }
        }
        st.next = page.next || null;
        if (!page.next || st.taken >= cap) st.done = true;
        store.saveState();
      }
    }
    store.log(`done ${source}: +${added}편 (총 ${store.total()}), 요청 ${fetcher.requests}`);
  } catch (err) {
    store.saveState();
    store.log(`stop ${source}: ${err.message} — +${added}편 (총 ${store.total()}), 요청 ${fetcher.requests}; 재실행하면 이어서 받음`);
  }
  return added;
}

function argNum(name, dflt) { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : dflt; }

module.exports = { CORPUS, TEXT_DIR, LOG_DIR, UA, sleep, hash, cleanText, isEnglish, acceptable, sanitizeQueryTerm, termTitlesFor, loadTerms, loadCategoryGroups, makeFetcher, makeStore, safeId, crawl, argNum };
