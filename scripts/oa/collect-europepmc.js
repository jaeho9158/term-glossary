// Europe PMC REST API(키 없음) — 오픈액세스(CC 라이선스) 생의학·보건·심리 논문의 제목+초록.
// 사용: node scripts/oa/collect-europepmc.js [--max-requests N]
// 재실행 안전: index.europepmc.jsonl / state.europepmc.json 으로 이어받음.
const C = require("./en-common");

const API = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const DELAY_MS = 1200;
const QUOTA_PER_CODE = 400;
const KEYWORD_CAP = 40; // 키워드 질의당 최대 편수
const TERM_CAP = 6;     // 표제어 질의당 최대 편수
const TERMS_PER_CODE = 25;

const KEYWORDS = {
  med: ["clinical medicine", "internal medicine", "surgery", "oncology", "cardiology"],
  pubhealth: ["public health", "epidemiology", "health policy", "preventive medicine"],
  neuro: ["neuroscience", "brain imaging", "neurology", "synaptic plasticity"],
  biotech: ["biotechnology", "genome editing", "synthetic biology", "bioprocess"],
  biomed: ["biomedical engineering", "medical device", "biomaterials", "tissue engineering"],
  pharm: ["pharmacology", "drug delivery", "pharmacokinetics", "clinical pharmacy"],
  nursing: ["nursing care", "nursing education", "patient safety nurses"],
  dent: ["dentistry", "periodontal disease", "dental implant", "orthodontics"],
  vet: ["veterinary medicine", "animal disease", "companion animals"],
  kmed: ["traditional Chinese medicine", "acupuncture", "herbal medicine"],
  medlab: ["clinical laboratory diagnostics", "biomarker assay", "laboratory medicine"],
  radio: ["radiology", "medical imaging", "radiotherapy", "magnetic resonance imaging"],
  ems: ["emergency medical services", "cardiac arrest", "prehospital care", "trauma care"],
  rehab: ["rehabilitation", "physical therapy", "stroke recovery", "musculoskeletal pain"],
  toxicol: ["toxicology", "environmental toxicant", "toxicity assessment"],
  bio: ["molecular biology", "cell biology", "ecology", "evolutionary biology", "microbiology"],
  psych: ["psychology", "cognition", "depression anxiety", "psychotherapy", "mental health"],
  childdev: ["child development", "early childhood", "adolescent development"],
  geronto: ["aging older adults", "gerontology", "dementia care"],
  food: ["food science", "nutrition", "food safety", "dietary intake"],
  agri: ["agriculture crop", "plant breeding", "soil"],
  env: ["environmental health", "air pollution", "climate change health"],
  sports: ["sports medicine", "exercise physiology", "physical activity"],
  socwelfare: ["social support", "social work", "social determinants of health"],
  demog: ["population health", "fertility mortality", "migration health"],
  pubadmin: ["health systems", "health services research"],
  libinfo: ["bibliometrics", "scholarly communication", "medical informatics"],
  edu: ["medical education", "health professions education"],
  stat: ["statistical methods biomedical", "meta-analysis", "Bayesian analysis"],
  method: ["systematic review methodology", "randomized controlled trial design", "qualitative research"],
  ethics: ["research ethics", "bioethics", "research integrity"],
};

function buildQuery(q) { return `(${q}) AND OPEN_ACCESS:y AND HAS_ABSTRACT:y AND LANG:eng`; }

function parseResults(json) {
  const list = (json && json.resultList && json.resultList.result) || [];
  const recs = [];
  for (const r of list) {
    const lic = r.license || "";
    if (!/^cc/i.test(lic)) continue; // 라이선스가 명시된 CC 문헌만
    const abstract = C.cleanText(r.abstractText);
    if (!abstract) continue;
    const ji = r.journalInfo || {};
    recs.push({
      rawId: r.pmcid || `${r.source}${r.id}`,
      title: C.cleanText(r.title).replace(/\.$/, ""),
      abstract,
      journal: (ji.journal && ji.journal.title) || r.journalTitle || "",
      year: Number(r.pubYear || ji.yearOfPublication) || null,
      url: `https://europepmc.org/article/${r.source}/${r.id}`,
      license: lic, doi: r.doi || "",
    });
  }
  return { recs, next: (json && json.nextCursorMark && list.length ? json.nextCursorMark : null) };
}

function buildTasks(terms) {
  const tasks = [];
  for (const code of Object.keys(KEYWORDS)) {
    for (const k of KEYWORDS[code]) tasks.push({ key: `k:${code}:${k}`, code, q: `"${k}"`, cap: KEYWORD_CAP });
    for (const t of C.termTitlesFor(terms, code, TERMS_PER_CODE)) tasks.push({ key: `t:${code}:${t}`, code, q: `"${t}"`, cap: TERM_CAP });
  }
  return tasks;
}

async function main() {
  const fetcher = C.makeFetcher({ delayMs: DELAY_MS, maxRequests: C.argNum("--max-requests", 2500), backoffBaseMs: 20000 });
  const store = C.makeStore("europepmc");
  await C.crawl({
    source: "europepmc", tasks: buildTasks(C.loadTerms()), store, fetcher, quotaPerCode: QUOTA_PER_CODE,
    fetchPage: async (task, st) => {
      const url = `${API}?query=${encodeURIComponent(buildQuery(task.q))}&format=json&resultType=core&pageSize=100&cursorMark=${encodeURIComponent(st.next || "*")}`;
      return parseResults(JSON.parse(await fetcher.get(url)));
    },
  });
}

module.exports = { parseResults, buildQuery, buildTasks, KEYWORDS };
if (require.main === module) main();
