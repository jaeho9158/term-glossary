// Semantic Scholar Graph API — 키 없이(공유 풀) /paper/search/bulk. 인문·사회·법·교육·예술·경영·공학 보강.
// 키는 읽지도 보내지도 않는다. 요청 간 3.5초 이상, 429는 지수 백오프(30s,60s,...), 상한 후 중단.
// 사용: node scripts/oa/collect-s2.js [--max-requests N]
// 재실행 안전: index.s2.jsonl / state.s2.json 으로 이어받음.
// 이용: 초록은 통계 산출용으로만 로컬 보관(비공개, 재배포 없음). 결과물/논문에는 "Semantic Scholar Open Data Platform" 인용.
const C = require("./en-common");

const API = "https://api.semanticscholar.org/graph/v1/paper/search/bulk";
const DELAY_MS = 3500;
const QUOTA_PER_CODE = 150;
const TERM_CAP = 12;
const TERMS_PER_CODE = 20;
const FIELDS = "title,abstract,year,venue,fieldsOfStudy,externalIds,openAccessPdf,isOpenAccess";

// 우리 카테고리 코드 -> S2 fieldsOfStudy (쉼표 구분 가능)
const FOS = {
  philo: "Philosophy", history: "History", lit: "Art,Linguistics", religion: "Philosophy,History", ling: "Linguistics",
  translation: "Linguistics", archaeo: "History,Geology", museum: "History,Art",
  artstudy: "Art", music: "Art", film: "Art", dance: "Art", design: "Art,Engineering", textile: "Materials Science,Art",
  gamestudy: "Computer Science,Psychology", sports: "Medicine,Psychology", cosmetic: "Medicine,Chemistry",
  edu: "Education", childdev: "Psychology,Education", geronto: "Psychology,Sociology",
  socialecon: "Sociology,Economics", psych: "Psychology", polisci: "Political Science", pubadmin: "Political Science,Business",
  law: "Law", crimin: "Sociology,Law", forensicsci: "Law,Chemistry", demog: "Sociology,Geography", anthro: "Sociology,History",
  gender: "Sociology,Psychology", socwelfare: "Sociology", labor: "Economics,Sociology", intdev: "Economics,Political Science",
  media: "Sociology,Art", military: "Political Science,History",
  biz: "Business", acct: "Business,Economics", finance: "Economics,Business", trade: "Economics,Business", tax: "Economics,Law",
  insur: "Economics,Business", logis: "Business,Engineering", realestate: "Economics,Business", consumer: "Business,Psychology",
  ip: "Law,Business", tourism: "Business,Geography",
  eng: "Engineering", mechanical: "Engineering", electrical: "Engineering,Physics", chemeng: "Engineering,Chemistry",
  materials: "Materials Science", optics: "Physics,Engineering", robotics: "Engineering,Computer Science", aviation: "Engineering",
  naval: "Engineering", nuclear: "Engineering,Physics", indeng: "Engineering,Business", fire: "Engineering,Environmental Science",
  disaster: "Environmental Science,Geography", arch: "Engineering,Art", landscape: "Environmental Science,Geography",
  cartography: "Geography", geo: "Geography", earth: "Geology", ocean: "Geology,Environmental Science", meteor: "Environmental Science,Physics",
  env: "Environmental Science", agri: "Agricultural and Food Sciences", forestry: "Agricultural and Food Sciences,Environmental Science",
  livestock: "Agricultural and Food Sciences", food: "Agricultural and Food Sciences", libinfo: "Computer Science",
  cyber: "Computer Science", ethics: "Philosophy", method: "Sociology,Psychology",
};

function parseBulk(json) {
  const recs = [];
  for (const p of (json && json.data) || []) {
    if (!p.abstract || !p.isOpenAccess) continue;
    const ex = p.externalIds || {};
    const oa = p.openAccessPdf || {};
    recs.push({
      rawId: p.paperId, title: C.cleanText(p.title), abstract: C.cleanText(p.abstract),
      journal: p.venue || "", year: p.year || null,
      url: `https://www.semanticscholar.org/paper/${p.paperId}`,
      license: oa.license || oa.status || "OA", doi: ex.DOI || "",
    });
  }
  return { recs, next: (json && json.token) || null };
}

function buildUrl(task, token) {
  let u = `${API}?query=${encodeURIComponent(task.q)}&fields=${FIELDS}&openAccessPdf&sort=citationCount:desc&minCitationCount=3&fieldsOfStudy=${encodeURIComponent(task.fos)}`;
  if (token) u += `&token=${encodeURIComponent(token)}`;
  return u;
}

function buildTasks(terms) {
  const tasks = [];
  for (const [code, fos] of Object.entries(FOS))
    for (const t of C.termTitlesFor(terms, code, TERMS_PER_CODE)) tasks.push({ key: `t:${code}:${t}`, code, fos, q: `"${t}"`, cap: TERM_CAP });
  return tasks;
}

async function main() {
  const fetcher = C.makeFetcher({ delayMs: DELAY_MS, maxRequests: C.argNum("--max-requests", 600), backoffBaseMs: 30000, maxRetries: 5 });
  const store = C.makeStore("s2");
  await C.crawl({
    source: "s2", tasks: buildTasks(C.loadTerms()), store, fetcher, quotaPerCode: QUOTA_PER_CODE,
    fetchPage: async (task) => {
      // 한 질의당 첫 페이지(최대 1000편, 피인용 순)만 사용 — 상위 TERM_CAP편만 취하므로 다음 토큰은 쓰지 않는다.
      const page = parseBulk(JSON.parse(await fetcher.get(buildUrl(task, null))));
      page.next = null;
      return page;
    },
  });
}

module.exports = { parseBulk, buildUrl, buildTasks, FOS };
if (require.main === module) main();
