// 용어 페이지의 "실제 논문에서" 인용용 말뭉치 수집기(KCI Open API 초록).
//
// 기존 말뭉치(data/oa-corpus/index.jsonl)는 "통계 보정용 무작위 표본"이라 용어별 검색으로 채우면
// 분포가 쏠린다. 그래서 이 수집기는 별도 저장소 data/oa-corpus/examples/ 에만 쓰고, 레코드마다
// sampling:"example" 을 붙인다(index.jsonl 에는 절대 추가하지 않는다).
//
// 방법: 용어마다 (a) keyword= 검색 (b) title= 검색으로 후보를 받고, **초록에 용어(또는 변형)가
// 실제로 들어 있는** 한글 초록만 남긴다. (KCI API 는 abstract= 검색을 지원하지 않는다.)
//
// 비밀 규칙: 키는 .env.local 의 KCI_API_KEY 를 실행 때만 읽는다. 로그·오류·파일에 남기지 않는다
// (URL 을 찍을 때는 <KEY> 로 가린다).
//
// 예산: 용어당 40회, 전체 600회, 요청 간 1.1초 이상. 재실행 안전(state.json 에 끝낸 질의를 기록).
// 사용: node scripts/oa/collect-kci-examples.js --slug cohens-d,eta-squared [--max-total 600] [--dry]
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "data", "oa-corpus", "examples");
const TEXT_DIR = path.join(OUT_DIR, "text");
const INDEX = path.join(OUT_DIR, "index.jsonl");
const STATE = path.join(OUT_DIR, "state.json");
const API = "https://open.kci.go.kr/po/openapi/openApiSearch.kci";
const DELAY_MS = 1100;
const PER_TERM_BUDGET = 40;
const TOTAL_BUDGET = 600;
const TARGET_MATCHES = 12; // 용어당 이만큼 모이면 멈춘다
const MIN_HANGUL = 150;

// slug → { variants: 초록에 있어야 하는 표기, queries: [{kind, q}] }
const SPECS = {
  "cohens-d": {
    variants: ["코헨의 d", "코헨의d", "Cohen's d", "Cohen’s d", "Cohen d", "코헨 d", "Cohen's d"],
    queries: [{ kind: "keyword", q: "Cohen's d" }, { kind: "title", q: "Cohen's d" }, { kind: "keyword", q: "효과크기" }, { kind: "keyword", q: "효과 크기" }],
  },
  "eta-squared": {
    variants: ["η2", "η²", "ηp", "에타제곱", "에타 제곱", "eta squared", "eta-squared", "partial η"],
    queries: [{ kind: "keyword", q: "에타제곱" }, { kind: "keyword", q: "효과크기" }, { kind: "keyword", q: "분산분석" }],
  },
  "durbin-watson-test": {
    variants: ["더빈", "Durbin", "DW 통계량"],
    queries: [{ kind: "keyword", q: "Durbin-Watson" }, { kind: "title", q: "Durbin-Watson" }, { kind: "keyword", q: "자기상관" }, { kind: "keyword", q: "다중회귀분석" }],
  },
  "likelihood-ratio-test": {
    variants: ["우도비", "가능도비", "likelihood ratio", "Likelihood ratio"],
    queries: [{ kind: "keyword", q: "우도비검정" }, { kind: "keyword", q: "우도비" }, { kind: "title", q: "우도비" }, { kind: "keyword", q: "likelihood ratio test" }],
  },
};

function loadKey() {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^KCI_API_KEY=(.*)$/m);
  if (!m || !m[1].trim()) throw new Error(".env.local에 KCI_API_KEY가 없습니다");
  return m[1].trim();
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

const totalOf = (xml) => Number((xml.match(/<total>(\d+)</) || [])[1]) || 0;

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch (e) { return { requests: 0, perTerm: {}, done: {} }; }
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const slugs = (arg("--slug") || "").split(",").filter(Boolean);
  const dry = argv.includes("--dry");
  const maxTotal = Number(arg("--max-total")) || TOTAL_BUDGET;
  if (!slugs.length || slugs.some((s) => !SPECS[s])) {
    console.error(`--slug 필요. 가능: ${Object.keys(SPECS).join(", ")}`);
    process.exit(1);
  }
  fs.mkdirSync(TEXT_DIR, { recursive: true });
  const state = loadState();
  const known = new Set(fs.existsSync(INDEX)
    ? fs.readFileSync(INDEX, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.term}|${r.id}`; })
    : []);
  const KEY = dry ? "" : loadKey();
  const redact = (s) => (KEY ? String(s).split(KEY).join("<KEY>") : String(s));
  let last = 0;

  async function fetchXml(kind, q, page) {
    const url = `${API}?apiCode=articleSearch&key=${encodeURIComponent(KEY)}&${kind}=${encodeURIComponent(q)}&page=${page}&displayCount=100`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const wait = last + DELAY_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      state.requests++;
      state.perTerm[currentSlug] = (state.perTerm[currentSlug] || 0) + 1;
      fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (err) {
        if (attempt === 1) throw new Error(redact(err.message));
      }
    }
  }

  let currentSlug = "";
  for (const slug of slugs) {
    currentSlug = slug;
    const spec = SPECS[slug];
    let matches = [...known].filter((k) => k.startsWith(slug + "|")).length;
    for (const { kind, q } of spec.queries) {
      let page = (state.done[`${slug}|${kind}|${q}`] || 0) + 1;
      while (matches < TARGET_MATCHES) {
        if ((state.perTerm[slug] || 0) >= PER_TERM_BUDGET || state.requests >= maxTotal) break;
        if (dry) { console.log(`[dry] ${slug} ${kind}="${q}" page ${page}`); break; }
        let xml;
        try { xml = await fetchXml(kind, q, page); } catch (err) { console.error(`중단: ${err.message}`); return; }
        state.done[`${slug}|${kind}|${q}`] = page;
        const recs = parseRecords(xml);
        for (const r of recs) {
          if (!spec.variants.some((v) => r.abstract.includes(v))) continue;
          const key = `${slug}|kci-${r.id}`;
          if (known.has(key)) continue;
          known.add(key);
          matches++;
          fs.writeFileSync(path.join(TEXT_DIR, `kci-${r.id}.txt`), `${r.title}\n\n${r.abstract}\n`);
          fs.appendFileSync(INDEX, JSON.stringify({ id: `kci-${r.id}`, source: "kci", sampling: "example", term: slug,
            journal: r.journal, title: r.title, year: r.year, citations: r.citations, url: r.url, query: `${kind}=${q}` }) + "\n");
        }
        fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
        if (page * 100 >= totalOf(xml)) break; // 마지막 쪽
        page++;
      }
    }
    console.log(`${slug}: 일치 ${matches}편 (요청 ${state.perTerm[slug] || 0}회)`);
  }
  console.log(`요청 누계 ${state.requests}회`);
}

main();
