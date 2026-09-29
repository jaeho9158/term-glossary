// 실제 논문 말뭉치 수집기(3차: KCI 중립 질의 표본). collect-kci.js의 편향 제거판.
// 계획: docs/superpowers/plans/2026-09-29-term-prune-merge.md Phase 1.
//
// 왜 새로 만들었나: 기존 수집기는 그 분야 전용 표제어를 질의어로 써서, 질의어가 제목에 든 논문만
// 오고(df가 질의어 쪽으로 부풀고) 피인용 정렬로 유명 주제에 쏠렸다. 이 수집기는
//   - 질의어에 용어 표제어를 쓰지 않는다: 분야 라벨 낱말 + 중립어("연구","분석",...)의 결합만 쓴다.
//   - 연도 층화(dateFrom/dateTo)를 시도한다. 탐침 결과는 아래 "KCI 파라미터 탐침" 참고.
//   - 한글 초록이 있는 레코드는 피인용 정렬 없이 전부 채택한다(분야당 TARGET_PER_CODE편까지).
//   - index.jsonl 행에 "sampling":"neutral"을 붙인다(없으면 "headword"로 취급).
//
// KCI 파라미터 탐침(2026-09-29): dateFrom/dateTo는 지원되지만 6자리 YYYYMM만 받는다(4자리 연도는
// resultMsg "발행년월(시작)은 6자리 숫자만 가능합니다"로 거부되어 레코드 0건). 그래서 201601~202512.
// page/displayCount(100)는 정상 동작(제목 "통계" 총 4,062건).
//
// 비밀 규칙: 키는 .env.local의 KCI_API_KEY를 실행 때만 읽는다. 로그·오류·파일 어디에도 키를
// 남기지 않는다(redact). URL은 콘솔에 찍지 않는다. 키는 IP에 묶여 있어 등록된 기계에서만 된다.
//
// 사용: node scripts/oa/collect-kci-neutral.js [--max-requests N]   (전체 실행은 사용자 승인 후 컨트롤러가)
// 재실행 안전: index.jsonl의 id 중복은 건너뛰고, 분야별 neutral 편수가 TARGET_PER_CODE 이상이면 질의를 생략한다.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "data", "oa-corpus");
const TEXT_DIR = path.join(OUT_DIR, "text");
const INDEX = path.join(OUT_DIR, "index.jsonl");
const API = "https://open.kci.go.kr/po/openapi/openApiSearch.kci";
const DELAY_MS = 1100; // 요청 간 1초 이상
const TARGET_PER_CODE = 300;
const MAX_QUERIES_PER_CODE = 12;
const PAGES = [1, 2];
const DISPLAY_COUNT = 100;
const DATE_PARAMS = "dateFrom=201601&dateTo=202512";
const NEUTRAL_WORDS = ["연구", "분석", "효과", "영향", "관계", "특성", "평가", "비교"];
const MIN_HANGUL = 150; // 이보다 한글이 적은 초록은 영문 초록으로 본다
const PROBE_NOTE = "dateFrom/dateTo=YYYYMM 6자리; page/displayCount 지원";

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

// 분야 라벨 → 중립 질의어(최대 MAX_QUERIES_PER_CODE개). 용어 표제어는 쓰지 않는다.
function neutralQueries(label, neutralWords = NEUTRAL_WORDS, max = MAX_QUERIES_PER_CODE) {
  const words = [...new Set(String(label || "").split(/[\s·‧・/]+/).filter((w) => /[가-힣]/.test(w) && w.length >= 2))];
  const queries = [...words];
  if (words.length) for (const n of neutralWords) queries.push(`${words[0]} ${n}`);
  return [...new Set(queries)].slice(0, max);
}

function loadGroups() {
  const data = require(path.join(ROOT, "assets", "category-data.js"));
  return { groups: data.CATEGORY_GROUPS, labels: data.CATEGORY_LABELS };
}

function main() {
  const argMax = process.argv.indexOf("--max-requests");
  const MAX_REQUESTS = argMax > 0 ? Number(process.argv[argMax + 1]) : 3500;
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const km = env.match(/^KCI_API_KEY=(.*)$/m);
  if (!km || !km[1].trim()) throw new Error(".env.local에 KCI_API_KEY가 없습니다");
  const KEY = km[1].trim();
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
        console.warn(`  재시도 (${redact(err.message)})`);
      }
    }
  }

  return (async () => {
    fs.mkdirSync(TEXT_DIR, { recursive: true });
    const lines = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, "utf8").split("\n").filter((l) => l.trim()) : [];
    const known = new Set(lines.map((l) => JSON.parse(l).id));
    const perCode = {};
    for (const l of lines) {
      const r = JSON.parse(l);
      if (r.sampling === "neutral") perCode[r.field] = (perCode[r.field] || 0) + 1;
    }
    const { groups, labels } = loadGroups();
    let added = 0;
    try {
      for (const g of groups) {
        for (const code of g.codes) {
          for (const q of neutralQueries(labels[code])) {
            for (const page of PAGES) {
              if ((perCode[code] || 0) >= TARGET_PER_CODE) break;
              const xml = await politeFetch(`title=${encodeURIComponent(q)}&${DATE_PARAMS}&page=${page}&displayCount=${DISPLAY_COUNT}`);
              const all = parseRecords(xml);
              const msg = (xml.match(/<resultMsg>([^<]*)<\/resultMsg>/) || [])[1];
              if (msg) console.warn(`  KCI 응답 메시지: ${redact(msg)}`);
              const years = all.map((r) => r.year).filter(Boolean);
              console.log(`  [${code}] "${q}" p${page}: 한글 초록 ${all.length}편, 연도 ${years.length ? Math.min(...years) + "~" + Math.max(...years) : "-"}`);
              for (const r of all) {
                const id = `kci-${r.id}`;
                if (known.has(id) || (perCode[code] || 0) >= TARGET_PER_CODE) continue;
                known.add(id);
                fs.writeFileSync(path.join(TEXT_DIR, `${id}.txt`), `${r.title}\n\n${r.abstract}\n`);
                fs.appendFileSync(INDEX, JSON.stringify({ id, source: "kci", journal: r.journal, field: code,
                  title: r.title, year: r.year, citations: r.citations, url: r.url, query: q, sampling: "neutral" }) + "\n");
                perCode[code] = (perCode[code] || 0) + 1;
                added++;
              }
            }
          }
          console.log(`${g.label} / ${code}: ${perCode[code] || 0}/${TARGET_PER_CODE} (요청 누계 ${requests})`);
        }
      }
    } catch (err) {
      console.error(`중단: ${redact(err.message)} — 다시 실행하면 이어서 받습니다`);
    }
    console.log(`추가 ${added}편, 요청 ${requests}회`);
  })();
}

if (require.main === module) main();

module.exports = { neutralQueries, parseRecords, NEUTRAL_WORDS, TARGET_PER_CODE, PROBE_NOTE };
