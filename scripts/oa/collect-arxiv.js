// arXiv API(키 없음) — 제목+초록만 (메타데이터는 CC0). 약관: 3초에 1요청, 단일 연결.
// 사용: node scripts/oa/collect-arxiv.js [--max-requests N]
// 재실행 안전: index.arxiv.jsonl / state.arxiv.json 으로 이어받음.
const C = require("./en-common");

const API = "https://export.arxiv.org/api/query";
const DELAY_MS = 3300; // 약관: 3초에 1회 이하
const QUOTA_PER_CODE = 400;
const PAGE = 100;
const TASK_CAP = 150;

// 우리 카테고리 코드 -> arXiv 분류(search_query 용)
const MAP = {
  math: ["math.PR", "math.CO", "math.NT", "math.AG", "math.NA", "math.DS", "math.OC"],
  stat: ["stat.ME", "stat.AP", "stat.TH", "stat.ML"],
  method: ["stat.CO"],
  phys: ["cond-mat.mes-hall", "cond-mat.stat-mech", "quant-ph", "hep-th", "hep-ph", "physics.atom-ph", "physics.plasm-ph", "nlin.CD", "gr-qc", "nucl-th"],
  materials: ["cond-mat.mtrl-sci", "cond-mat.soft"],
  optics: ["physics.optics"],
  astro: ["astro-ph.GA", "astro-ph.CO", "astro-ph.SR", "astro-ph.EP", "astro-ph.HE"],
  meteor: ["physics.ao-ph"],
  earth: ["physics.geo-ph"],
  chem: ["physics.chem-ph"],
  mechanical: ["physics.flu-dyn"],
  eng: ["physics.app-ph", "physics.ins-det"],
  bio: ["q-bio.PE", "q-bio.MN", "q-bio.GN", "q-bio.CB", "physics.bio-ph"],
  neuro: ["q-bio.NC"],
  biotech: ["q-bio.QM", "q-bio.BM"],
  biomed: ["physics.med-ph"],
  cs: ["cs.LG", "cs.AI", "cs.DS", "cs.SE", "cs.DB", "cs.DC", "cs.PL", "cs.CV", "cs.NE", "cs.IR", "cs.HC"],
  ling: ["cs.CL"],
  cyber: ["cs.CR"],
  libinfo: ["cs.DL"],
  robotics: ["cs.RO"],
  electrical: ["eess.SP", "eess.SY", "eess.AS", "cs.IT"],
  socialecon: ["econ.GN", "physics.soc-ph", "cs.SI"],
  edu: ["physics.ed-ph", "cs.CY"],
  finance: ["q-fin.GN", "q-fin.PM", "q-fin.TR", "q-fin.ST", "q-fin.CP"],
  insur: ["q-fin.RM"],
  biz: ["q-fin.MF", "q-fin.EC"],
};
MAP.stat.push("econ.EM");
MAP.polisci = ["cs.GT", "econ.TH"];

function parseAtom(xml) {
  const recs = [];
  for (const e of xml.split("<entry>").slice(1)) {
    const idUrl = (e.match(/<id>([^<]+)<\/id>/) || [])[1];
    if (!idUrl) continue;
    const m = idUrl.match(/abs\/(.+?)(v\d+)?$/);
    if (!m) continue;
    const title = C.cleanText((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const abstract = C.cleanText((e.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]);
    const pub = (e.match(/<published>(\d{4})/) || [])[1];
    const cat = (e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/) || [])[1] || "";
    const jr = C.cleanText((e.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/) || [])[1]);
    const doi = C.cleanText((e.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/) || [])[1]);
    recs.push({ rawId: m[1].replace("/", "_"), title, abstract, journal: jr || `arXiv ${cat}`.trim(), year: Number(pub) || null,
      url: `https://arxiv.org/abs/${m[1]}`, license: "metadata CC0-1.0", doi });
  }
  const total = Number((xml.match(/<opensearch:totalResults[^>]*>(\d+)</) || [])[1]) || 0;
  return { recs, total };
}

function buildTasks() {
  const tasks = [];
  for (const [code, cats] of Object.entries(MAP)) for (const c of cats) tasks.push({ key: `c:${code}:${c}`, code, cat: c, cap: TASK_CAP });
  // 코드별로 분류를 번갈아 쓰도록 crawl 이 find 로 첫 미완료를 고르므로 순서만 유지
  return tasks;
}

async function main() {
  const fetcher = C.makeFetcher({ delayMs: DELAY_MS, maxRequests: C.argNum("--max-requests", 1200), backoffBaseMs: 60000, maxRetries: 4 });
  const store = C.makeStore("arxiv");
  await C.crawl({
    source: "arxiv", tasks: buildTasks(), store, fetcher, quotaPerCode: QUOTA_PER_CODE,
    fetchPage: async (task, st) => {
      const start = Number(st.next) || 0;
      const url = `${API}?search_query=cat:${encodeURIComponent(task.cat)}&start=${start}&max_results=${PAGE}&sortBy=submittedDate&sortOrder=descending`;
      const { recs, total } = parseAtom(await fetcher.get(url));
      const nextStart = start + PAGE;
      return { recs, next: recs.length && nextStart < total && nextStart < 2000 ? String(nextStart) : null };
    },
  });
}

module.exports = { parseAtom, buildTasks, MAP };
if (require.main === module) main();
