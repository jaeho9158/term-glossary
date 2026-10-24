// 영문 초록 수집기(OpenAlex). 영문 논문 문맥에서 영어 표제어 매칭·공기어를 보정하기 위한 말뭉치.
//
// 요금(https://help.openalex.org/access/example-costs, 확인 2026-10): 무료 키 하루 $1 = 10,000 크레딧.
// 목록+필터 1크레딧, search 파라미터 10크레딧, 단건 무료. 이 수집기는 search 대신 필터
// (title_and_abstract.search)만 쓴다(실측: 이 필터는 요청당 10크레딧, 연도·분야 필터만이면 1크레딧). 응답 헤더 X-RateLimit-Remaining이
// MIN_REMAINING 아래로 내려가면 그날은 멈춘다(선충전 크레딧이 없으니 초과 과금은 없다).
//
// 비밀 규칙: 키는 .env.local의 OPENALEX_API_KEY를 실행 때만 읽는다(api_key 쿼리). 로그·오류·파일에 남기지 않는다.
// 이메일 등 식별자는 보내지 않는다(polite pool 미사용).
//
// 사용: node scripts/oa/collect-openalex.js [--per-category N=150] [--max-requests N=3000] [--delay-ms 250]
//   환경: OA_CORPUS_DIR(말뭉치 폴더, 기본 data/oa-corpus), OA_ENV_FILE(.env.local 경로), OA_LOG(로그 파일)
// 재실행 안전: index.jsonl에 있는 oalex-<id>는 건너뛴다.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const API = "https://api.openalex.org/works";
const MIN_REMAINING = 1500; // 이 아래면 그날 중단
const QUERIES_PER_CODE = 6; // 카테고리당 표제어 질의 수(필터+search는 10크레딧이라 하루 허용량 안에서 정함)
const PER_QUERY_TAKE = 15; // 질의 하나에서 가져올 새 논문 상한(질의어 다양화)
const MIN_ABSTRACT_CHARS = 200;

// 우리 카테고리 코드 -> OpenAlex field id(topics.field.id).
const F = { agri: 11, arts: 12, biochem: 13, biz: 14, cheme: 15, chem: 16, cs: 17, decision: 18, earth: 19, econ: 20, energy: 21,
  eng: 22, env: 23, immuno: 24, mat: 25, math: 26, med: 27, neuro: 28, nurs: 29, pharm: 30, phys: 31, psych: 32, soc: 33, vet: 34, dent: 35, health: 36 };
const CODE_FIELDS = {
  stat: ["math", "decision"], method: ["math", "soc"], tool: ["cs"], ethics: ["arts", "soc"], math: ["math"],
  phys: ["phys"], chem: ["chem"], bio: ["biochem", "agri"], earth: ["earth"], geo: ["earth"], env: ["env"],
  med: ["med"], pubhealth: ["med", "health"], neuro: ["neuro"], biotech: ["biochem"], biomed: ["biochem", "med"], pharm: ["pharm"], nursing: ["nurs"], dent: ["dent"],
  vet: ["vet"], kmed: ["med"], medlab: ["med", "health"], radio: ["med"], ems: ["med", "health"], rehab: ["health"], toxicol: ["pharm", "env"],
  eng: ["eng"], mechanical: ["eng"], electrical: ["eng"], chemeng: ["cheme"], materials: ["mat"], optics: ["phys"], robotics: ["eng", "cs"], aviation: ["eng"], naval: ["eng"],
  nuclear: ["eng", "energy"], indeng: ["eng", "decision"], fire: ["eng"],
  cs: ["cs"], libinfo: ["cs", "soc"],
  socialecon: ["soc", "econ"], psych: ["psych"], polisci: ["soc"], pubadmin: ["soc"], law: ["soc"], demog: ["soc"],
  gender: ["soc"], intdev: ["soc", "econ"], media: ["soc"], military: ["soc"],
  biz: ["biz"], acct: ["biz"], logis: ["biz", "decision"],
  consumer: ["biz"], tourism: ["biz"],
  philo: ["arts"], history: ["arts"], lit: ["arts"], religion: ["arts"], ling: ["arts"],
  artstudy: ["arts"], music: ["arts"], film: ["arts"], dance: ["arts"], design: ["arts"], cosmetic: ["chem"], gamestudy: ["cs", "arts"], sports: ["health"],
  edu: ["soc"], childdev: ["psych"], geronto: ["med", "psych"],
  agri: ["agri"], forestry: ["agri"], livestock: ["agri"], food: ["agri"],
  arch: ["eng", "soc"], landscape: ["env"], 
};
const fieldIds = (code) => (CODE_FIELDS[code] || []).map((k) => F[k]).join("|");

// ---- 순수 함수 --------------------------------------------------------------
function invertedToText(inv) {
  if (!inv || typeof inv !== "object") return "";
  const words = [];
  for (const [w, poss] of Object.entries(inv)) for (const p of poss) words[p] = w;
  return words.filter((w) => w !== undefined).join(" ").replace(/\s+/g, " ").trim();
}
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0; return h; }
function queryTitles(terms, code, n = QUERIES_PER_CODE) {
  return terms.filter((t) => (t.categories || []).includes(code) && /^[A-Za-z][A-Za-z -]{3,38}[A-Za-z]$/.test(t.title_en || ""))
    .map((t) => t.title_en.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => hash(a + code) - hash(b + code)).slice(0, n);
}
function workToRecord(w, code) {
  const abstract = invertedToText(w.abstract_inverted_index);
  if (abstract.length < MIN_ABSTRACT_CHARS || w.language !== "en" || !w.title) return null;
  const id = "oalex-" + String(w.id).split("/").pop();
  const loc = w.primary_location || {};
  return { id, text: `${w.title}\n\n${abstract}\n`, meta: { id, source: "openalex", lang: "en", journal: (loc.source && loc.source.display_name) || "",
    field: code, title: w.title, year: w.publication_year || null, url: (w.open_access && w.open_access.oa_url) || w.doi || w.id,
    license: loc.license || "" } };
}
function loadKnown(indexPath) {
  const known = new Set(); const perCode = {};
  if (!fs.existsSync(indexPath)) return { known, perCode };
  for (const l of fs.readFileSync(indexPath, "utf8").split("\n")) {
    if (!l.trim()) continue;
    const r = JSON.parse(l); known.add(r.id);
    if (r.source === "openalex") perCode[r.field] = (perCode[r.field] || 0) + 1;
  }
  return { known, perCode };
}

// ---- 실행 -------------------------------------------------------------------
function loadKey() {
  const cands = [process.env.OA_ENV_FILE, path.join(ROOT, ".env.local")].filter(Boolean);
  for (const f of cands) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, "utf8").match(/^OPENALEX_API_KEY=(.*)$/m);
    if (m && m[1].trim()) return m[1].trim();
  }
  throw new Error(".env.local에 OPENALEX_API_KEY가 없습니다");
}
function loadGroups() {
  const src = fs.readFileSync(path.join(ROOT, "assets", "category-data.js"), "utf8");
  return Function(`return ${src.match(/const CATEGORY_GROUPS = (\[[\s\S]*?\n\s*\]);/)[1]}`)();
}
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };

async function main() {
  const PER_CAT = arg("--per-category", 150), MAX_REQ = arg("--max-requests", 3000), DELAY = Math.max(200, arg("--delay-ms", 250));
  const OUT = process.env.OA_CORPUS_DIR || path.join(ROOT, "data", "oa-corpus");
  const TEXT = path.join(OUT, "text"), INDEX = path.join(OUT, "index.openalex.jsonl");
  const LOG = process.env.OA_LOG || path.join(ROOT, ".superpowers", "tmp-review", "oa", "collect.log");
  fs.mkdirSync(TEXT, { recursive: true }); fs.mkdirSync(path.dirname(LOG), { recursive: true });
  const KEY = loadKey();
  const redact = (s) => String(s).split(KEY).join("<KEY>");
  const log = (m) => { const line = `${new Date().toISOString()} ${redact(m)}`; console.log(line); fs.appendFileSync(LOG, line + "\n"); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let last = 0, requests = 0, remaining = Infinity;
  class Stop extends Error {}

  async function get(filter, extra) {
    const url = `${API}?filter=${encodeURIComponent(filter).replace(/%2C/g, ",").replace(/%7C/g, "|").replace(/%3A/g, ":")}&per_page=${extra.per_page || 25}&page=${extra.page || 1}`
      + `&select=id,title,language,publication_year,doi,abstract_inverted_index,primary_location,open_access${extra.sort ? "&sort=" + extra.sort : ""}`
      + `&api_key=${encodeURIComponent(KEY)}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (requests >= MAX_REQ) throw new Stop("요청 상한 도달");
      const wait = last + DELAY - Date.now(); if (wait > 0) await sleep(wait);
      last = Date.now(); requests++;
      try {
        const res = await fetch(url);
        const rem = res.headers.get("x-ratelimit-remaining");
        if (rem !== null && !Number.isNaN(Number(rem))) remaining = Number(rem);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (remaining < MIN_REMAINING) log(`하루 허용량 잔여 ${remaining} — 오늘은 여기까지`);
        return (await res.json()).results || [];
      } catch (err) {
        if (err instanceof Stop) throw err;
        if (attempt === 1) throw new Stop(redact(err.message));
        await sleep(5000);
      }
    }
  }

  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const { known, perCode } = loadKnown(INDEX);
  const codes = loadGroups().flatMap((g) => g.codes);
  let added = 0;
  const take = (works, code, cap, total) => {
    let n = 0;
    for (const w of works) {
      if (n >= cap || (perCode[code] || 0) >= total) break;
      const r = workToRecord(w, code);
      if (!r || known.has(r.id)) continue;
      known.add(r.id);
      fs.writeFileSync(path.join(TEXT, `${r.id}.txt`), r.text);
      fs.appendFileSync(INDEX, JSON.stringify(r.meta) + "\n");
      perCode[code] = (perCode[code] || 0) + 1; n++; added++;
      if (added % 100 === 0) log(`works ${added} (요청 ${requests}, 잔여 허용량 ${remaining}) 마지막 분야 ${code}`);
    }
  };
  try {
    // 라운드 r: 분야마다 r*PER_CAT편까지(1라운드가 최소치, 이후는 허용량이 남는 한 계속). 라운드를 돌려
    // 허용량이 중간에 끊겨도 분야 간 분포가 고르다. 2라운드부터는 다른 표제어·다음 쪽을 쓴다.
    for (let round = 1; round <= 4; round++) {
      const cap = PER_CAT * round;
      for (const code of codes) {
        const fid = fieldIds(code); if (!fid) { log(`매핑 없음: ${code}`); continue; }
        const base = `language:en,has_abstract:true,type:article,is_oa:true,topics.field.id:${fid}`;
        const qs = queryTitles(terms, code, QUERIES_PER_CODE * round).slice(QUERIES_PER_CODE * (round - 1));
        for (const q of qs) {
          if ((perCode[code] || 0) >= cap) break;
          if (remaining < MIN_REMAINING) throw new Stop("허용량 부족");
          take(await get(`${base},title_and_abstract.search:${q}`, { sort: "cited_by_count:desc" }), code, PER_QUERY_TAKE, cap);
        }
        for (let y = 2024; y >= 2012 && (perCode[code] || 0) < cap; y--) {
          if (remaining < MIN_REMAINING) throw new Stop("허용량 부족");
          take(await get(`${base},publication_year:${y}`, { sort: "cited_by_count:desc", per_page: 100, page: round }), code, 12, cap);
        }
        log(`R${round} ${code}: ${perCode[code] || 0}/${cap} (요청 ${requests})`);
      }
    }
  } catch (err) {
    if (!(err instanceof Stop)) throw err;
    log(`중단: ${err.message} — 다시 실행하면 이어서 받습니다`);
  }
  log(`끝: 추가 ${added}편, 요청 ${requests}회, 잔여 허용량 ${remaining}`);
}

if (require.main === module) main().catch((e) => { console.error(String(e.message)); process.exit(1); });
module.exports = { invertedToText, queryTitles, workToRecord, loadKnown, fieldIds, CODE_FIELDS };
