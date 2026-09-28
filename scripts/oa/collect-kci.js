// 실제 논문 말뭉치 수집기(2차: KCI Open API 초록). 계획: 뷰어 OA 파이프라인.
//
// 왜 KCI인가: KoreaMed는 의학 계열뿐이라 분야 분포가 한쪽으로 쏠린다. KCI는 전 분야 국내
// 학술지를 덮고, 검색 응답(articleSearch)에 초록과 피인용수(citation-count)가 함께 들어 있어
// 상세 조회 없이 한 번의 요청으로 논문 100편 분량을 받는다. 키워드는 이 응답에 없어 받지 않는다.
//
// 비밀 규칙: 키는 .env.local의 KCI_API_KEY를 실행 때만 읽는다. 로그·오류·파일 어디에도 키를
// 남기지 않는다(URL을 찍을 때는 <KEY>로 가린다). 키는 IP에 묶여 있어 등록된 기계에서만 된다.
//
// 방법: 우리 카테고리마다 그 분야 전용 표제어(카테고리가 하나뿐인 것)를 질의어로 제목 검색 →
// 한글 초록이 있는 논문 중 피인용수가 높은 것부터 질의당 최대 PER_QUERY편. 대분류(CATEGORY_GROUPS)
// 당 GROUP_TARGET편을 소속 카테고리에 고르게 나눈다. field는 "질의한 카테고리"다(근사).
//
// 사용: node scripts/oa/collect-kci.js [--max-requests N]
// 재실행 안전: index.jsonl에 있는 kci-<id>는 건너뛰고, 이미 채운 카테고리는 질의하지 않는다.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "data", "oa-corpus");
const TEXT_DIR = path.join(OUT_DIR, "text");
const INDEX = path.join(OUT_DIR, "index.jsonl");
const API = "https://open.kci.go.kr/po/openapi/openApiSearch.kci";
const DELAY_MS = 1100; // 요청 간 1초 이상
const GROUP_TARGET = 60; // 대분류당 목표 편수(40~80)
const MIN_PER_CODE = 3;
const PER_QUERY = 3; // 한 질의어에서 가져올 최대 편수(질의어 다양화)
const QUERIES_PER_CODE = 8;
const MIN_HANGUL = 150; // 이보다 한글이 적은 초록은 영문 초록으로 본다
const argMax = process.argv.indexOf("--max-requests");
const MAX_REQUESTS = argMax > 0 ? Number(process.argv[argMax + 1]) : 5000;

function loadKey() {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^KCI_API_KEY=(.*)$/m);
  if (!m || !m[1].trim()) throw new Error(".env.local에 KCI_API_KEY가 없습니다");
  return m[1].trim();
}
const KEY = loadKey();
const redact = (s) => String(s).split(KEY).join("<KEY>");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;
let requests = 0;
async function politeFetch(params) {
  const url = `${API}?apiCode=articleSearch&key=${encodeURIComponent(KEY)}&${params}`;
  for (let attempt = 0; attempt < 2; attempt++) { // 실패 시 재시도 1회
    if (requests >= MAX_REQUESTS) throw new Error("요청 상한 도달");
    const wait = lastRequest + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    requests++;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === 1) throw new Error(redact(err.message));
      console.warn(`  재시도: ${redact(params)} (${redact(err.message)})`);
    }
  }
}

const cdata = (s) => (s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
const hangul = (s) => (s.match(/[가-힣]/g) || []).length;

function parseRecords(xml) {
  const out = [];
  for (const rec of xml.split("<record>").slice(1)) {
    const id = (rec.match(/article-id="([^"]+)"/) || [])[1];
    if (!id) continue;
    const titles = [...rec.matchAll(/<article-title[^>]*>([\s\S]*?)<\/article-title>/g)].map((m) => cdata(m[1]));
    const abstracts = [...rec.matchAll(/<abstract[^>]*>([\s\S]*?)<\/abstract>/g)].map((m) => cdata(m[1]));
    const abs = abstracts.find((a) => hangul(a) >= MIN_HANGUL);
    if (!abs) continue;
    const cite = rec.match(/<citation-count[^>]*>(\d+)</);
    out.push({
      id,
      journal: cdata((rec.match(/<journal-name>([\s\S]*?)<\/journal-name>/) || [])[1]),
      title: titles.find((t) => hangul(t) > 0) || titles[0] || "",
      year: Number((rec.match(/<pub-year>(\d+)/) || [])[1]) || null,
      citations: cite ? Number(cite[1]) : 0,
      url: cdata((rec.match(/<url>([\s\S]*?)<\/url>/) || [])[1]),
      abstract: abs,
    });
  }
  return out;
}

// 결정적 섞기: 실행마다 같은 질의어 순서(재실행이 같은 카테고리를 이어서 채우게).
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0; return h; }

function loadGroups() {
  const src = fs.readFileSync(path.join(ROOT, "assets", "category-data.js"), "utf8");
  const body = src.match(/const CATEGORY_GROUPS = (\[[\s\S]*?\n\s*\]);/)[1];
  return Function(`return ${body}`)();
}

function queriesFor(terms, code) {
  return terms.filter((t) => t.categories && t.categories.length === 1 && t.categories[0] === code
      && /^[가-힣]{2,8}$/.test(t.title_ko || ""))
    .map((t) => t.title_ko).sort((a, b) => hash(a) - hash(b)).slice(0, QUERIES_PER_CODE);
}

async function main() {
  fs.mkdirSync(TEXT_DIR, { recursive: true });
  const lines = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, "utf8").split("\n").filter((l) => l.trim()) : [];
  const known = new Set(lines.map((l) => JSON.parse(l).id));
  const perCode = {};
  for (const l of lines) { const r = JSON.parse(l); if (r.source === "kci") perCode[r.field] = (perCode[r.field] || 0) + 1; }
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const groups = loadGroups();
  let added = 0;
  try {
    for (const g of groups) {
      const quota = Math.max(MIN_PER_CODE, Math.round(GROUP_TARGET / g.codes.length));
      for (const code of g.codes) {
        for (const q of queriesFor(terms, code)) {
          if ((perCode[code] || 0) >= quota) break;
          const xml = await politeFetch(`title=${encodeURIComponent(q)}&page=1&displayCount=100`);
          const recs = parseRecords(xml).filter((r) => !known.has(`kci-${r.id}`))
            .sort((a, b) => b.citations - a.citations || (b.year || 0) - (a.year || 0))
            .slice(0, Math.min(PER_QUERY, quota - (perCode[code] || 0)));
          for (const r of recs) {
            const id = `kci-${r.id}`;
            known.add(id);
            fs.writeFileSync(path.join(TEXT_DIR, `${id}.txt`), `${r.title}\n\n${r.abstract}\n`);
            fs.appendFileSync(INDEX, JSON.stringify({ id, source: "kci", journal: r.journal, field: code,
              title: r.title, year: r.year, citations: r.citations, url: r.url, query: q }) + "\n");
            perCode[code] = (perCode[code] || 0) + 1;
            added++;
          }
        }
        console.log(`${g.label} / ${code}: ${perCode[code] || 0}/${quota} (요청 누계 ${requests})`);
      }
    }
  } catch (err) {
    console.error(`중단: ${redact(err.message)} — 다시 실행하면 이어서 받습니다`);
  }
  console.log(`추가 ${added}편, 요청 ${requests}회`);
}

main();
