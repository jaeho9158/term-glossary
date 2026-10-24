// Semantic Scholar Graph API ?????놁씠(怨듭쑀 ?) /paper/search/bulk. ?몃Ц쨌?ы쉶쨌踰빧룰탳?≤룹삁?졖룰꼍?겶룰났??蹂닿컯.
// ?ㅻ뒗 ?쎌???蹂대궡吏???딅뒗?? ?붿껌 媛?3.5珥??댁긽, 429??吏??諛깆삤??30s,60s,...), ?곹븳 ??以묐떒.
// ?ъ슜: node scripts/oa/collect-s2.js [--max-requests N]
// ?ъ떎???덉쟾: index.s2.jsonl / state.s2.json ?쇰줈 ?댁뼱諛쏆쓬.
// ?댁슜: 珥덈줉? ?듦퀎 ?곗텧?⑹쑝濡쒕쭔 濡쒖뺄 蹂닿?(鍮꾧났媛? ?щ같???놁쓬). 寃곌낵臾??쇰Ц?먮뒗 "Semantic Scholar Open Data Platform" ?몄슜.
const C = require("./en-common");

const API = "https://api.semanticscholar.org/graph/v1/paper/search/bulk";
const DELAY_MS = 3500;
const QUOTA_PER_CODE = 150;
const TERM_CAP = 12;
const TERMS_PER_CODE = 20;
const FIELDS = "title,abstract,year,venue,fieldsOfStudy,externalIds,openAccessPdf,isOpenAccess";

// ?곕━ 移댄뀒怨좊━ 肄붾뱶 -> S2 fieldsOfStudy (?쇳몴 援щ텇 媛??
const FOS = {
  philo: "Philosophy", history: "History", lit: "Art,Linguistics", religion: "Philosophy,History", ling: "Linguistics",
  artstudy: "Art", music: "Art", film: "Art", dance: "Art", design: "Art,Engineering",
  gamestudy: "Computer Science,Psychology", sports: "Medicine,Psychology", cosmetic: "Medicine,Chemistry",
  edu: "Education", childdev: "Psychology,Education", geronto: "Psychology,Sociology",
  socialecon: "Sociology,Economics", psych: "Psychology", polisci: "Political Science", pubadmin: "Political Science,Business",
  law: "Law", demog: "Sociology,Geography",
  gender: "Sociology,Psychology", intdev: "Economics,Political Science",
  media: "Sociology,Art", military: "Political Science,History",
  biz: "Business", acct: "Business,Economics",
  logis: "Business,Engineering", consumer: "Business,Psychology",
  tourism: "Business,Geography",
  eng: "Engineering", mechanical: "Engineering", electrical: "Engineering,Physics", chemeng: "Engineering,Chemistry",
  materials: "Materials Science", optics: "Physics,Engineering", robotics: "Engineering,Computer Science", aviation: "Engineering",
  naval: "Engineering", nuclear: "Engineering,Physics", indeng: "Engineering,Business", fire: "Engineering,Environmental Science",
  arch: "Engineering,Art", landscape: "Environmental Science,Geography",
  geo: "Geography", earth: "Geology",
  env: "Environmental Science", agri: "Agricultural and Food Sciences", forestry: "Agricultural and Food Sciences,Environmental Science",
  livestock: "Agricultural and Food Sciences", food: "Agricultural and Food Sciences", libinfo: "Computer Science",
  ethics: "Philosophy", method: "Sociology,Psychology",
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
  const fetcher = C.makeFetcher({ delayMs: DELAY_MS, maxRequests: C.argNum("--max-requests", 600), backoffBaseMs: 30000, maxRetries: 7 });
  const store = C.makeStore("s2");
  await C.crawl({
    source: "s2", tasks: buildTasks(C.loadTerms()), store, fetcher, quotaPerCode: QUOTA_PER_CODE,
    fetchPage: async (task) => {
      // ??吏덉쓽??泥??섏씠吏(理쒕? 1000?? ?쇱씤????留??ъ슜 ???곸쐞 TERM_CAP?몃쭔 痍⑦븯誘濡??ㅼ쓬 ?좏겙? ?곗? ?딅뒗??
      const page = parseBulk(JSON.parse(await fetcher.get(buildUrl(task, null))));
      page.next = null;
      return page;
    },
  });
}

module.exports = { parseBulk, buildUrl, buildTasks, FOS };
if (require.main === module) main();
