// 실제 논문 말뭉치 수집기(1차: KoreaMed Synapse). 계획: 뷰어 OA 파이프라인.
//
// 왜 Synapse인가: 정찰(2026-09-26)에서 robots.txt가 없고(404) 논문마다 Open-Access
// 문구가 박혀 있는 곳은 여기뿐이었다. KoreaScience는 robots.txt가 PDF를 막으므로 쓰지 않는다.
// 받은 PDF는 문서빈도·공기어 통계에만 쓰고 커밋하지 않는다(data/oa-corpus는 .gitignore).
//
// 사용: node scripts/oa/collect-koreamed.js [--dry] [--max N]
//   --dry  : 목록·호 페이지만 읽고 받을 목록을 출력(PDF는 받지 않음)
// 재실행 안전: 이미 받은 PDF는 건너뛰고, index.jsonl은 id 기준으로 합친다.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "data", "oa-corpus");
const PDF_DIR = path.join(OUT_DIR, "koreamed");
const INDEX = path.join(OUT_DIR, "index.jsonl");
const BASE = "https://synapse.koreamed.org";
// 사이트 운영자가 로그만 보고도 누가 왜 받는지 알 수 있게 한다.
const USER_AGENT = "termglossary-corpus/1.0 (+https://termglossary.kr; academic term-frequency statistics, low rate; contact jaeho9158@gmail.com)";
const DELAY_MS = 2000; // 요청 간 2초
const MAX_TOTAL = 150; // 총 편수 상한
const PER_JOURNAL = 8; // 저널당 5~10편
const ISSUES_PER_JOURNAL = 3; // 최근호부터 이만큼까지만 본다
const MIN_YEAR = 2015;

// 저널 영문명 → 우리 카테고리 코드. 위에서부터 처음 맞는 규칙. Synapse는 의학 계열
// 저널 모음이라 대부분 med지만, 간호·치의·보건·영양·체육·진단검사·수의·방사선 등
// 인접 분야를 따로 떼어 분야 분포(≥8종)를 만든다. 분야별 상한은 의학 편중을 줄이려는 것.
// 정신의학(조현병 연구 등) 저널은 psych(심리학)가 아니라 med다 — psych로 두었더니 조현병이
// "자기 분야 밖에서 주로 쓰이는 말"로 잘못 표시됐다(OA 연동 b).
const FIELD_RULES = [
  ["nursing", /nurs/i, 20],
  ["dent", /dent|orthodont|oral|periodont|prosthodont|endodont|maxillofacial/i, 16],
  ["pubhealth", /public health|health promotion|maternal and child health|infection control|occupational|preventive|epidemiol/i, 16],
  ["food", /nutrition/i, 12],
  ["sports", /sports/i, 8],
  ["medlab", /laboratory medicine|clinical microbiology|cytopathology/i, 12],
  ["vet", /veterinary|laboratory animal/i, 8],
  ["radio", /radiolog|ultrasonograph|magnetic resonance|medical physics/i, 12],
  ["rehab", /rehabilitation/i, 8],
  ["forensicsci", /legal medicine/i, 8],
  ["anthro", /anthropology/i, 8],
  ["pharm", /pharmacol|pharmacotherapy|pharmacy/i, 8],
  ["med", /./, 30],
];

function fieldOf(name) {
  for (const [code, re] of FIELD_RULES) if (re.test(name)) return code;
  return "med";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;
async function politeFetch(url, asBuffer) {
  for (let attempt = 0; attempt < 2; attempt++) { // 실패 시 재시도 1회
    const wait = lastRequest + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (err) {
      if (attempt === 1) throw err;
      console.warn(`  재시도: ${url} (${err.message})`);
    }
  }
}

function decodeEntities(s) {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

// 저널 목록: 행마다 /journals/<id>/ 링크(이름은 span title)와 최신호 /issues/<id>/.
function parseJournalList(html) {
  const out = [];
  for (const row of html.split("<tr>")) {
    const j = row.match(/href="\/journals\/(\d+)\/"[^>]*><span title="([^"]+)"/);
    const i = row.match(/href="\/issues\/(\d+)\/"[^>]*>\s*[^<]*<br\/>\s*([^<]*)</);
    if (!j || !i) continue;
    const year = Number((i[2].match(/(19|20)\d{2}/) || [0])[0]);
    // 저널 이름은 외부 데이터라 글자·숫자·공백·기본 문장부호만 남긴다.
    const name = decodeEntities(j[2]).replace(/[^A-Za-z0-9 &,.()\-:]/g, "").trim();
    out.push({ jid: j[1], name, latestIssue: i[1], year });
  }
  return out;
}

// 호 페이지: 논문마다 titelKo(국문 제목), KMSID, 연도, PDF 링크(func/download.php).
function parseIssue(html) {
  const out = [];
  for (const block of html.split('class="issu_tr"').slice(1)) {
    const ko = block.match(/<span class="titelKo"[^>]*>([\s\S]*?)<\/span>/);
    const id = block.match(/KMSID:\s*(\d+)/);
    const pdf = block.match(/href="(\/func\/download\.php\?[^"]+)"/);
    const year = block.match(/<\/a>\s*((?:19|20)\d{2});/);
    if (!ko || !id || !pdf) continue;
    out.push({ id: id[1], title: decodeEntities(ko[1]), url: BASE + pdf[1].replace(/&amp;/g, "&"), year: year ? Number(year[1]) : null });
  }
  return out;
}

function loadIndex() {
  const map = new Map();
  if (fs.existsSync(INDEX)) {
    for (const line of fs.readFileSync(INDEX, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line);
      map.set(rec.id, rec);
    }
  }
  return map;
}

function saveIndex(map) {
  fs.writeFileSync(INDEX, [...map.values()].map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const maxArg = args.indexOf("--max");
  const maxTotal = Math.min(MAX_TOTAL, maxArg >= 0 ? Number(args[maxArg + 1]) : MAX_TOTAL);
  fs.mkdirSync(PDF_DIR, { recursive: true });
  const index = loadIndex();

  const journals = parseJournalList(await politeFetch(`${BASE}/journals/list.php`))
    .filter((j) => j.year >= MIN_YEAR)
    .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
  // 같은 이름이 옛 판·새 판으로 두 줄 나오면 최신 것만.
  const seen = new Set();
  const byField = new Map();
  for (const j of journals) {
    const key = j.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    j.field = fieldOf(j.name);
    if (!byField.has(j.field)) byField.set(j.field, []);
    byField.get(j.field).push(j);
  }

  // 분야마다 할당량을 채울 때까지 저널을 돈다. 이미 받은 편수도 할당량에 센다.
  const have = new Map();
  for (const r of index.values()) if (r.source === "koreamed") have.set(r.field, (have.get(r.field) || 0) + 1);
  let total = index.size;
  const full = (code) => total >= maxTotal || (have.get(code) || 0) >= capOf(code);
  for (const [code] of FIELD_RULES) {
    for (const j of byField.get(code) || []) {
      if (full(code)) break;
      let issues = [j.latestIssue];
      try {
        const page = await politeFetch(`${BASE}/journals/${j.jid}/`);
        const ids = [...new Set((page.match(/\/issues\/(\d+)\//g) || []).map((s) => Number(s.match(/\d+/)[0])))];
        issues = [...new Set([Number(j.latestIssue), ...ids.sort((a, b) => b - a)])].slice(0, ISSUES_PER_JOURNAL);
      } catch (err) {
        console.warn(`  저널 페이지 실패: ${j.name} (${err.message})`);
      }
      let fromJournal = [...index.values()].filter((r) => r.journal === j.name).length;
      for (const issue of issues) {
        if (fromJournal >= PER_JOURNAL || full(code)) break;
        let articles;
        try {
          articles = parseIssue(await politeFetch(`${BASE}/issues/${issue}/`));
        } catch (err) {
          console.warn(`  호 페이지 실패: ${issue} (${err.message})`);
          continue;
        }
        // 국문 논문만: 국문 제목 칸에 한글이 있어야 한다(영문 논문은 이 칸에 영문 제목이 복사돼 있다).
        for (const a of articles.filter((x) => /[가-힣]/.test(x.title))) {
          if (fromJournal >= PER_JOURNAL || full(code)) break;
          if (index.has(a.id)) continue;
          const file = path.join(PDF_DIR, `${a.id}.pdf`);
          const rec = { id: a.id, source: "koreamed", journal: j.name, field: code, title: a.title, year: a.year, url: a.url, license: "OA statement" };
          if (dry) {
            console.log(`[dry] ${code}\t${j.name}\t${a.id}\t${a.title.slice(0, 40)}`);
          } else if (!fs.existsSync(file)) {
            try {
              const buf = await politeFetch(a.url, true);
              if (buf.slice(0, 4).toString() !== "%PDF") throw new Error("PDF 아님");
              fs.writeFileSync(file, buf);
              console.log(`${code}\t${a.id}\t${Math.round(buf.length / 1024)}KB\t${a.title.slice(0, 40)}`);
            } catch (err) {
              console.warn(`  PDF 실패: ${a.id} (${err.message})`);
              continue;
            }
          }
          index.set(a.id, rec);
          if (!dry) saveIndex(index); // 중간에 끊겨도 받은 것까지는 남도록
          fromJournal++;
          total++;
          have.set(code, (have.get(code) || 0) + 1);
        }
      }
    }
  }
  const dist = {};
  for (const r of index.values()) dist[r.field] = (dist[r.field] || 0) + 1;
  console.log(`${dry ? "[dry] 예정" : "완료"}: ${total}편`, JSON.stringify(dist));
}

function capOf(code) {
  const rule = FIELD_RULES.find(([c]) => c === code);
  return rule ? rule[2] : 0;
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { parseJournalList, parseIssue, fieldOf };
