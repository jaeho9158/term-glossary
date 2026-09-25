const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCE = path.join(ROOT_DIR, "terms.json");
const OUTPUT = path.join(ROOT_DIR, "viewer-index.json");
const DEFS_DIR = path.join(ROOT_DIR, "viewer-defs");

// 논문 뷰어(viewer.js)는 "용어 찾기" 한 번에 terms-lite.json(16MB)을 통째로
// 받고 있었다. 정작 매칭(buildExactIndex/matchTermsWithIndex)에 쓰이는 값은
// slug·title_ko·title_en뿐이고, definition(전체 2.6MB)과 categories는
// "매칭된 용어"에만 필요하다. 그래서 파일을 둘로 나눈다.
//
//  1) viewer-index.json    : 매칭 + 카테고리 필터에 필요한 최소 데이터(전량 로드)
//  2) viewer-defs/NNN.json : definition을 slug 해시로 쪼갠 청크(지연 로드)
//
// viewer-index.json은 키 이름 반복(37,416 × {"slug":...,"title_ko":...})만으로
// 수 MB가 붙기 때문에 배열-of-배열로 저장하고, 카테고리 코드도 98종짜리
// 사전의 인덱스 숫자로 치환한다. 디코더는 assets/viewer.js의
// decodeViewerIndex()이며, 형식을 바꾸면 그쪽도 같이 고쳐야 한다.
//
// aliases는 넣지 않는다 — buildExactIndex()가 title_ko/title_en만 인덱싱하므로
// 현재 매칭에 전혀 쓰이지 않는데, 넣으면 2.8MB → 3.6MB로 목표(3MB)를 넘긴다.
// 나중에 별칭 매칭을 도입하면 행 끝에 한 칸 덧붙이면 된다.

// definition 청크 개수. 청크 하나가 약 14KB라, 한 논문에서 찾은 용어 N개는
// 최대 N개 청크(≈ N × 14KB)만 받는다 — 청크를 적게(=크게) 가져가면
// 용어 몇 개 때문에 수백 KB를 받게 되므로 잘게 쪼개는 쪽이 싸다.
const DEF_BUCKETS = 512;

// FNV-1a. assets/viewer.js의 defBucket()과 반드시 같은 결과를 내야 한다.
function defBucket(slug) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % DEF_BUCKETS;
}

// ---- 일반어 등급 (0~3) -------------------------------------------------
// 뷰어는 "강도"(운동 강도) 같은 일상어가 사전의 좁은 뜻(강도죄)으로 잡히는
// 오탐을 손으로 만든 60여 개 블록리스트로 막고 있었다. 사람이 계속 늘려야
// 하고 근거도 남지 않으므로, 리포 안 데이터만으로 등급을 계산해 대체한다.
// 외부 빈도 목록은 쓰지 않는다(라이선스·오프라인 빌드).
//
// 신호 셋(계획 3단계 1번):
//  (a) df      — 그 표제어가 "다른" 항목 몇 개의 본문(definition/why/deeper)에
//                일반 명사로 등장하는가. 정의문 4만 편은 학술 산문 말뭉치다.
//  (b) fields  — 그 등장이 몇 개 분야(categories[0])에 걸치는가. 일상어는
//                분야를 가리지 않고 나오고, 전문용어는 제 분야에 몰린다.
//  (c) compounds — 다른 표제어의 접두/접미로 몇 번 쓰이는가("분석", "관리").
//  (d) length  — 2음절 한글은 가산, 4음절 이상은 감산(긴 말은 일상어가 드물다).
const KOREAN_PARTICLES = [
  "에서", "으로", "부터", "까지", "이나", "이랑",
  "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도", "만", "나", "랑",
];

// 인덱스에 들어가는 한글 표제어만 대상(한 글자짜리는 매칭 단계에서 이미 버린다).
function isGradableTitle(title) {
  return !!title && /[가-힣]/.test(title) && [...title].length >= 2;
}

function commonWordSignals(terms) {
  const signals = new Map();
  const titles = new Set();
  for (const t of terms) {
    if (isGradableTitle(t.title_ko)) titles.add(t.title_ko);
  }

  const df = new Map();
  const fields = new Map();
  for (const t of terms) {
    const body = [t.definition, t.why, t.deeper].filter(Boolean).join(" ");
    if (!body) continue;
    const field = (t.categories || [])[0] || "";
    // 한 항목 안에서 몇 번 나오든 문서빈도는 1 — 한 항목이 유난히 길다고
    // 그 항목의 단어가 일반어가 되는 건 아니다.
    const tokens = new Set();
    for (const word of body.match(/[가-힣]+/g) || []) {
      tokens.add(word);
      for (const particle of KOREAN_PARTICLES) {
        if (word.endsWith(particle) && word.length > particle.length) {
          tokens.add(word.slice(0, -particle.length));
        }
      }
    }
    for (const token of tokens) {
      if (!titles.has(token) || token === t.title_ko) continue;
      df.set(token, (df.get(token) || 0) + 1);
      if (field) {
        let set = fields.get(token);
        if (!set) fields.set(token, (set = new Set()));
        set.add(field);
      }
    }
  }

  // 복합어 구성요소: 다른 표제어의 앞/뒤 2~4글자가 이 표제어와 같은 경우.
  // 형태소 분석 없이 문자열만 보지만, 한국어 학술 복합어는 대개 이 자리에
  // 붙는다("분산분석", "품질관리", "정책효과").
  const compounds = new Map();
  for (const title of titles) {
    const chars = [...title];
    for (let len = 2; len <= 4; len++) {
      if (chars.length <= len) continue;
      const prefix = chars.slice(0, len).join("");
      const suffix = chars.slice(-len).join("");
      if (titles.has(prefix)) compounds.set(prefix, (compounds.get(prefix) || 0) + 1);
      if (titles.has(suffix) && suffix !== prefix) compounds.set(suffix, (compounds.get(suffix) || 0) + 1);
    }
  }

  for (const title of titles) {
    signals.set(title, {
      df: df.get(title) || 0,
      fields: (fields.get(title) || new Set()).size,
      compounds: compounds.get(title) || 0,
      length: [...title].length,
    });
  }
  return signals;
}

// 임계값은 현 사전(41,227항목)의 실제 분포로 맞췄다. 기준점은 둘이다.
//  - 옛 블록리스트에서 신호가 강한 것들(단계·시점·요소·강도·대응·구분·
//    배경·검증)이 3이 될 것.
//  - 의도적으로 남긴 "감사"와 핵심 전문용어(분산·가설·신뢰도·응력)는
//    3이 되지 않을 것. 3은 인덱스에서 아예 빠지므로 미탐이 곧 손실이다.
function commonGrade(signals) {
  const { df = 0, fields = 0, compounds = 0, length = 0 } = signals || {};
  let points = 0;
  points += df >= 600 ? 2 : df >= 250 ? 1 : 0;
  points += fields >= 70 ? 2 : fields >= 45 ? 1 : 0;
  points += compounds >= 50 ? 1 : 0;
  points += length === 2 ? 1 : length >= 4 ? -1 : 0;
  if (points >= 5) return 3;
  if (points === 4) return 2;
  if (points >= 2) return 1;
  return 0;
}

// 신호로는 닿지 않는 잔여분. 옛 assets/viewer.js의
// AMBIGUOUS_COMMON_WORD_TITLES를 그대로 옮겨 온 것으로, 다섯 차례 수동
// 감사로 확인된 "사전의 뜻은 좁은데 일상어 뜻이 압도적인" 표제어들이다.
// 위 신호(df·분야·복합어)는 빈도가 높은 것만 잡아내므로, "직시"(df 1)나
// "렌치"(df 3)처럼 사전 안에서 드문 말은 계산으로 절대 걸러지지 않는다.
// 이걸 빼면 이미 고쳤던 오탐이 되살아나므로, 런타임 상수 대신 빌드 데이터로
// 남긴다 — 런타임(assets/viewer.js)에는 더 이상 블록리스트가 없다.
// "감사"는 옛 목록에서도 의도적으로 제외했다(감사 보고서류에서 실제로 쓰임).
const CURATED_COMMON_WORDS = [
  "단가", "보존", "등록", "복원", "열화", "환수", "후원", "유증", "응답",
  "요약", "접수", "소진", "점검", "균형", "대처", "자문", "환기", "경계",
  "직면", "강도", "배경", "시점", "단계", "갱신", "해결", "왜곡",
  "요소", "사료", "타자", "전사", "번역", "실속", "교차", "직시", "철창", "불안",
  "구분", "검증", "과실", "인수", "재발", "채권",
  "가구", "대조", "도식", "동화", "조절", "의지", "보장", "안정제", "구축",
  "산출", "성과", "적절성", "교란", "이력", "피로", "코어", "밀봉",
  "완화", "대비", "대응", "신속성", "강건성", "알선", "링크", "렌치",
];

function computeCommonGrades(terms) {
  const grades = new Map();
  for (const [title, signals] of commonWordSignals(terms)) {
    grades.set(title, commonGrade(signals));
  }
  for (const word of CURATED_COMMON_WORDS) {
    if (grades.has(word)) grades.set(word, 3);
  }
  return grades;
}

// ---- 영문 표제어 일반어 판정 --------------------------------------------
// 한글 등급(위)은 title_ko만 본다. 그런데 말뭉치 오탐의 큰 몫은 참고문헌·표·
// 영문 병기 속 일반 영어 단어("treatment", "function", "frame", "tor")가
// 무관한 분야의 한 단어짜리 영문 표제어(트리트먼트·함수·늑골·토르)와 맞은
// 것이었다. 사전 본문의 영어는 대개 괄호 병기라 빈도가 낮으므로 문턱도 낮다.
//  - 사전 다른 항목 본문(definition/why/deeper)에 영어로 5곳 이상, 또는
//  - 4글자 이하(tor, reed, flow 같은 짧은 일반어)
// "3개 이상 분야에 등장" 신호도 시험했으나 말뭉치에서 오탐 1개를 더 막는 대신
// 미탐 2개(artifact·sensitivity류)를 늘려 뺐다(보고서 B단계 표).
// 대상은 알파벳만으로 된 한 단어. 약어형(EEG, DALY, VaR — 첫 글자 뒤에도
// 대문자가 있음)은 뷰어가 대소문자까지 맞춰 잡으므로 여기서 빼지 않는다.
// 두 단어 이상·하이픈 복합어(t-test)는 그 자체로 충분히 특정적이라 유지.
// 결과: 해당 행 6번째 칸 = 1 → 뷰어가 영문 키를 인덱스에 넣지 않는다.
const EN_COMMON_MIN_DF = 5;
// 통계·수학·방법론 표제어는 어느 분야 항목이든 영어 병기로 인용하는 게
// 정상이라(variance 9곳, correlation 6곳) 분야 밖 인용도 일반어 신호가 약하다.
// function(42곳)처럼 정말 흔한 단어만 거르도록 문턱을 따로 높인다. 같은 기초군이라도
// tool(sensor drift 등 기기 용어)은 넣지 않는다 — drift를 살리면 오탐이 1 늘었다.
const EN_COMMON_MIN_DF_METHOD = 15;
const METHOD_CODES = new Set(["stat", "math", "method"]);
const EN_COMMON_MAX_LENGTH = 4;

function isAcronymLike(word) {
  return /^.+[A-Z]/.test(word);
}

// 문서빈도는 그 표제어의 대분류(CATEGORY_GROUPS) 밖 항목에서만 센다.
// 같은 분야끼리 서로 인용하는 것(통계 항목들이 "regression"을, 천문 항목들이
// "supernova"를 쓰는 것)은 일반어 신호가 아니라 전문어라는 신호다.
// 분야를 모르는 코드(테스트 등)는 어느 분야와도 겹치지 않는 것으로 본다.
let groupOfCode = null;
function groupsOf(term) {
  if (!groupOfCode) {
    groupOfCode = new Map();
    const { CATEGORY_GROUPS } = require("../assets/category-data.js");
    for (const g of CATEGORY_GROUPS) for (const c of g.codes) groupOfCode.set(c, g.label);
  }
  return new Set((term.categories || []).map((c) => groupOfCode.get(c)).filter(Boolean));
}

function computeEnglishCommon(terms) {
  const candidates = new Map(); // 소문자 키 → 그 표제어들의 분야군 합집합
  const methodKeys = new Set(); // 통계·수학·방법론 표제어
  for (const t of terms) {
    const en = (t.title_en || "").trim();
    if (!/^[A-Za-z]+$/.test(en) || isAcronymLike(en)) continue;
    const key = en.toLowerCase();
    if (!candidates.has(key)) candidates.set(key, new Set());
    for (const g of groupsOf(t)) candidates.get(key).add(g);
    if ((t.categories || []).some((c) => METHOD_CODES.has(c))) methodKeys.add(key);
  }
  const df = new Map();
  for (const t of terms) {
    const body = [t.definition, t.why, t.deeper].filter(Boolean).join(" ");
    if (!body) continue;
    const own = (t.title_en || "").toLowerCase();
    const docGroups = groupsOf(t);
    for (const word of new Set((body.match(/[A-Za-z]+/g) || []).map((w) => w.toLowerCase()))) {
      if (word === own || !candidates.has(word)) continue;
      const headGroups = candidates.get(word);
      if ([...docGroups].some((g) => headGroups.has(g))) continue;
      df.set(word, (df.get(word) || 0) + 1);
    }
  }
  const common = new Set();
  for (const key of candidates.keys()) {
    const minDf = methodKeys.has(key) ? EN_COMMON_MIN_DF_METHOD : EN_COMMON_MIN_DF;
    if ((df.get(key) || 0) >= minDf || key.length <= EN_COMMON_MAX_LENGTH) common.add(key);
  }
  return common;
}

// 영문 동음이의어(등급 4 = "영문 단독 불가"): 사전 안 문서빈도로는 일반어로 안
// 걸리지만(분야 밖 인용이 적음) 논문 본문·참고문헌에서는 흔한 영어 단어다.
// "substance use disorder"의 substance가 철학 '실체'로, "blood flow"의 blood가
// 다른 분야 표제어로 잡혔다. 이 단어들은 같은 문서에 국문 표제어도 나올 때만 영문
// 등장을 인정한다(판정은 viewer.js matchTermsWithIndex). 손으로 고른 소규모 목록이다.
const ENGLISH_NEEDS_KOREAN = new Set([
  "plasma", "shape", "delta", "fraction", "coverage", "contrast", "theme", "symbol",
  "genre", "duration", "equity", "inventory", "attachment", "blood", "rolling", "stall",
  "reach", "friction", "substance",
]);

// viewer-index.json 6번째 칸: 1 = 영문 키 제외(일반어), 4 = 국문 공동 출현 시에만, 0 = 그대로.
function englishGrade(term, englishCommon) {
  const key = (term.title_en || "").trim().toLowerCase();
  if (!key) return 0;
  if (englishCommon.has(key)) return 1;
  if (ENGLISH_NEEDS_KOREAN.has(key)) return 4;
  return 0;
}

function run() {
  const terms = JSON.parse(fs.readFileSync(SOURCE, "utf8"));

  const categoryCodes = [];
  const categoryIndex = new Map();
  const codeOf = (code) => {
    if (!categoryIndex.has(code)) {
      categoryIndex.set(code, categoryCodes.length);
      categoryCodes.push(code);
    }
    return categoryIndex.get(code);
  };

  // 5번째 칸이 일반어 등급. 0은 대다수라 넣어 봐야 용량만 늘기 때문에
  // 생략하고, 디코더(decodeViewerIndex)가 없으면 0으로 읽는다 — 덕분에
  // 4칸짜리 옛 인덱스도 그대로 읽힌다.
  const grades = computeCommonGrades(terms);
  const englishCommon = computeEnglishCommon(terms);
  const rows = terms.map((t) => {
    const row = [t.slug, t.title_ko || "", t.title_en || "", (t.categories || []).map(codeOf)];
    const grade = grades.get(t.title_ko) || 0;
    // 6번째 칸(영문 일반어)도 대부분 0이라 있을 때만 붙인다. 붙일 때는
    // 5번째 칸 자리를 0으로라도 채워야 순서가 맞는다.
    const enGrade = englishGrade(t, englishCommon);
    if (grade || enGrade) row.push(grade);
    if (enGrade) row.push(enGrade);
    return row;
  });

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify({ v: 1, categories: categoryCodes, terms: rows }),
    "utf8"
  );

  // 청크는 매번 싹 다시 만든다 — 용어가 삭제됐을 때 옛 definition이 남지 않도록.
  fs.rmSync(DEFS_DIR, { recursive: true, force: true });
  fs.mkdirSync(DEFS_DIR, { recursive: true });

  const buckets = Array.from({ length: DEF_BUCKETS }, () => ({}));
  for (const t of terms) {
    if (!t.slug || !t.definition) continue;
    buckets[defBucket(t.slug)][t.slug] = t.definition;
  }

  let defsBytes = 0;
  buckets.forEach((bucket, i) => {
    const file = path.join(DEFS_DIR, `${String(i).padStart(3, "0")}.json`);
    const json = JSON.stringify(bucket);
    fs.writeFileSync(file, json, "utf8");
    defsBytes += Buffer.byteLength(json);
  });

  const mb = (n) => (n / 1048576).toFixed(2);
  const indexSize = fs.statSync(OUTPUT).size;
  console.log(
    `viewer-index.json 생성: ${rows.length}개 용어, ${mb(indexSize)}MB ` +
      `(카테고리 ${categoryCodes.length}종)`
  );
  console.log(
    `viewer-defs/ 생성: ${DEF_BUCKETS}개 청크, 합계 ${mb(defsBytes)}MB ` +
      `(청크 평균 ${Math.round(defsBytes / DEF_BUCKETS / 1024)}KB)`
  );
}

if (require.main === module) run();

module.exports = { defBucket, DEF_BUCKETS, CURATED_COMMON_WORDS, commonWordSignals, commonGrade, computeCommonGrades, computeEnglishCommon, englishGrade, ENGLISH_NEEDS_KOREAN };
