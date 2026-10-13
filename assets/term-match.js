// ---- 뷰어 상수 --------------------------------------------------------
// 흩어져 있으면 "이 0.18은 뭐고 저 17은 뭔가"를 매번 코드로 되짚게 된다.
// 값마다 "왜 이 값인지"를 한 줄로 적어 한곳에 둔다. 2단 조판 임계값·분야
// 그룹 최소 개수처럼 쓰이는 함수 바로 위에서만 뜻이 통하는 값은 그 함수
// 옆 블록에 남겨 뒀다(아래 COLUMN_*, FIELD_*).

// PDF 배율 하한/상한. 0.5 아래는 본문 글자가 읽히지 않고, 3 위는 캔버스
// 메모리만 먹고 읽기 모드가 이미 확대 역할을 한다.
const PDF_MIN_SCALE = 0.5;
const PDF_MAX_SCALE = 3;
// #pdf-viewer 의 좌우 padding(10px씩) 합. 화면맞춤 계산에서 빼야 가로 스크롤이 안 생긴다.
const PDF_VIEWER_PADDING_PX = 20;
// 세로 스크롤바 폭. 첫 화면맞춤은 페이지가 붙기 전에 계산되는데, 페이지가
// 붙으면서 스크롤바가 생기면 그만큼 폭이 줄어 가로 스크롤이 생겼다.
const PDF_SCROLLBAR_WIDTH_PX = 17;
// 페이지 위아래 margin 20px씩. 페이지맞춤은 이걸 빼야 한 쪽이 통째로 들어온다.
const PDF_PAGE_MARGIN_PX = 40;
// 뷰어 폭을 잴 수 없을 때(아직 화면에 없음) 쓰는 배율. A4를 노트북에서 읽을 만한 크기.
const PDF_FALLBACK_SCALE = 1.5;
// IntersectionObserver 임계값. 0만 주면 "조금이라도 보이면" 이라 페이지 경계에서
// 현재 페이지가 튀고, 촘촘히 주면 가장 많이 보이는 쪽을 고를 수 있다.
const PAGE_OBSERVER_THRESHOLDS = [0, 0.05, 0.25, 0.5, 0.9];
// 패널에 한 번에 그리는 용어 카드 수. 한 화면에 들어오는 만큼만 그리고
// 나머지는 "더 보기" 로 미뤄 첫 렌더를 가볍게 한다.
const TERM_CARD_PAGE_SIZE = 8;
// 타이핑이 멈춘 뒤 자동 분석까지의 대기. 한 문장을 치는 중에 끼어들지 않을 만큼 길고,
// 붙여넣고 기다리는 사람이 답답하지 않을 만큼 짧다.
const AUTO_ANALYSIS_DEBOUNCE_MS = 800;
// 카드에서 본문으로 뛰었을 때 그 자리를 반짝이는 시간. 눈이 따라오고 나면 지운다.
const MARK_FLASH_MS = 1200;
// #pdf-status 안내 문구를 띄워 두는 시간. 읽는 중에 계속 남아 있으면 방해가 된다.
const PDF_NOTICE_HOLD_MS = 8000;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWord(word) {
  return word.toLowerCase().replace(/[-_\s]/g, "");
}

function extractWords(text) {
  return [...new Set((text.match(/[가-힣A-Za-z-]+/g) || []))];
}

// Every token occurrence, mapped to the real offsets where it starts.
//
// The offsets come from the tokenizer's own match.index. They used to be
// recovered afterwards with text.indexOf(word), which finds the first place
// the *substring* occurs — frequently inside a longer word. Looking up "분산"
// in "분산분석을 실시하였다. 집단 간 분산 값이 크다." returned offset 0, so the
// highlight was painted over the "분산" inside "분산분석" while the real
// standalone "분산" went unmarked. Same for English: "ANOVA" resolved to the
// "ANOVA" inside "ANOVAtest".
//
// Keeping every start offset (not just the first) also lets the renderer mark
// all occurrences of a term rather than only its first one.
function wordOccurrences(text) {
  const tokenPattern = /[가-힣A-Za-z-]+/g;
  const occurrences = new Map();
  let match;
  while ((match = tokenPattern.exec(text)) !== null) {
    const starts = occurrences.get(match[0]);
    if (starts) starts.push(match.index);
    else occurrences.set(match[0], [match.index]);
  }
  return occurrences;
}

// ---- 매칭 제외 구간(참고문헌·영문 초록·감사의 글) ----------------------
// 말뭉치 10편의 오탐 170개 중 상당수가 본문이 아니라 참고문헌의 영어 제목
// ("Stress Hormones", "Walker NM", "Treatment Services")과 영문 초록에서
// 나왔다. 이 구간의 단어는 무관한 분야 영문 표제어(트리트먼트·보행기)와
// 맞을 뿐, 국문 논문의 주제어는 본문에 다시 나온다. 그래서 구간째 뺀다.
//  - 참고문헌 제목 줄부터: 다음 "본문으로 돌아오는" 제목(방법·부록 등,
//    Nature식 조판은 참고문헌 뒤에 방법이 온다)까지, 없으면 끝까지.
//  - 영문 초록: Abstract ~ Key words 줄 끝. Key words가 없으면 상한까지만
//    (제목 인식이 틀려도 본문 전체를 잃지 않도록).
//  - 감사의 글: 제목 줄부터 짧게(연구비 문단). "감사"(감사인)가 제목 자체에서 잡혔다.
const REFERENCE_HEADING = /^\s*(?:[0-9IVX]+\.?\s*)?(?:추가\s*)?(?:참\s*고\s*문\s*헌|인\s*용\s*문\s*헌|문\s*헌|references?|bibliography|literature\s+cited)\s*$/i;
const ACK_HEADING = /^\s*(?:감\s*사\s*의\s*글|사\s*사|acknowledge?ments?)\s*$/i;
// 복귀 제목: 방법·부록(Nature식) + 장별 참고문헌 뒤 다음 장(제N장·서론·결과·결론 …).
const RESUME_HEADING = /^\s*(?:[0-9IVXⅠ-Ⅻ]+\.?\s*)?(?:방법|연구\s*방법|methods?|부록|appendix|chapter\s*\d*|보충\s*자료|supplementary|확장\s*데이터|extended\s+data|box\s*\d|제\s*\d+\s*장|\d+\s*장|서\s*론|결\s*과|결\s*론|고\s*찰|논\s*의)(?![가-힣A-Za-z])/i;
// 참고문헌 항목 첫 줄이 "Methods for …"처럼 제목과 닮을 수 있어, 뒤 3줄에 참고문헌
// 형식(연도 괄호·pp.·vol.·doi, Vancouver식 2020;35 · 2020 Mar;35 · 12(3): 45)이 보이면 복귀 제목으로 보지 않는다.
const REFERENCE_FORMAT = /\((?:19|20)\d{2}[a-z]?\)|\bpp?\.\s*\d|\bvol\.|\bdoi\b|\b(?:19|20)\d{2}\s*;\s*\d+|\b(?:19|20)\d{2}\s+[A-Z][a-z]{2,3}\s*;\s*\d+|\d+\(\d+\)\s*:\s*\d+/i;
// 번호 붙은 한글 장 제목(제2장 …, Ⅱ. …)은 참고문헌 항목과 헷갈릴 일이 적고,
// 바로 뒤 본문이 "Lee (2019)는"처럼 인용을 담기 쉬워 형식 검사를 생략한다.
const NUMBERED_HEADING = /^\s*(?:제\s*\d+\s*장|[Ⅰ-Ⅻ]+\s*\.)\s*[가-힣]/;
// "2. …"는 번호 붙은 참고문헌 항목("2. 결론 및 제언에 관한 연구. 서울: 학지사.")과 겹친다.
// 그 줄 자체에 참고문헌 표지(형식·출판지·출판사)가 없을 때만 형식 검사를 생략한다.
const DIGIT_HEADING = /^\s*\d+\s*\.\s*[가-힣]/;
const PUBLISHER_MARK = /서울\s*:|출판|학지사|박영사|법문사|교육과학사|양서원|\bpress\b|\bpublish/i;
const ABSTRACT_HEADING = /^\s*(?:abstract|a\s*b\s*s\s*t\s*r\s*a\s*c\s*t)(?![a-z])/i;
// 초록 끝 표지: Key words·주제어·핵심어(앞 기호 □ 등 무시). 이 줄 끝까지 제외.
const KEYWORDS_LINE = /^\s*[^\w가-힣]*\s*(?:key\s*-?\s*words?|주\s*제\s*어|핵\s*심\s*어)/i;
// 서론 제목(Ⅰ. 서론 / 제1장 서론 / Ⅰ. 서론 및 … / 1. Introduction)이 나오면 초록은 그 앞에서 끝난다.
const INTRO_HEADING = /^\s*(?:(?:제\s*1\s*장|[Ⅰ1I]\s*\.?)\s*)?(?:서\s*론(?:\s+및\s.*)?|introduction)\s*$/i;
const ABSTRACT_MAX_CHARS = 1500;
const ACK_MAX_CHARS = 1500;
// 오픈액세스 라이선스 고지("This is an Open Access article … Creative Commons Attribution …",
// "저작자표시-비영리") 는 저널 상투문이라 제외한다. 그대로 두면 "Attribution"이 표제어로 잡혀
// OA 말뭉치 대부분 논문에 나왔다. 고지는 여러 줄에 걸치므로 문장이 끝나는 줄(마침표)까지 뺀다.
// 본문에서 라이선스를 논하는 문장이 걸리면 그 줄(문장)만 빠지는 손실은 감수한다.
const LICENSE_NOTICE = /open[\s-]*access\s+article|creative\s*commons|저작자\s*표시/i;
const LICENSE_MAX_LINES = 6;

function excludedRanges(text) {
  const src = text || "";
  const lines = [];
  const linePattern = /[^\n]*(?:\n|$)/g;
  let m;
  while ((m = linePattern.exec(src)) !== null) {
    if (m.index >= src.length) break;
    lines.push({ start: m.index, end: m.index + m[0].length, text: m[0].replace(/\r?\n$/, "") });
  }
  const ranges = [];
  const isResume = (j) => {
    if (!RESUME_HEADING.test(lines[j].text) || lines[j].text.trim().length > 30) return false;
    if (NUMBERED_HEADING.test(lines[j].text)) return true;
    if (DIGIT_HEADING.test(lines[j].text) && !REFERENCE_FORMAT.test(lines[j].text) && !PUBLISHER_MARK.test(lines[j].text)) return true;
    for (let k = j + 1; k <= j + 3 && k < lines.length; k++) if (REFERENCE_FORMAT.test(lines[k].text)) return false;
    return true;
  };
  const nextResume = (from) => {
    for (let j = from; j < lines.length; j++) {
      if (isResume(j)) return j;
      if (REFERENCE_HEADING.test(lines[j].text)) return j;
    }
    return lines.length;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (REFERENCE_HEADING.test(line.text)) {
      let j = i + 1;
      // 바로 다음 참고문헌 제목은 같은 구간으로 이어 붙인다
      for (; j < lines.length; j++) {
        if (isResume(j)) break;
      }
      ranges.push([line.start, j < lines.length ? lines[j].start : src.length]);
      i = j - 1;
    } else if (ACK_HEADING.test(line.text)) {
      const j = nextResume(i + 1);
      const end = Math.min(j < lines.length ? lines[j].start : src.length, line.start + ACK_MAX_CHARS);
      ranges.push([line.start, end]);
    } else if (LICENSE_NOTICE.test(line.text)) {
      let j = i;
      while (j < lines.length - 1 && j - i < LICENSE_MAX_LINES - 1 && !/[.。]\s*$/.test(lines[j].text)) j++;
      ranges.push([line.start, lines[j].end]);
      i = j;
    } else if (ABSTRACT_HEADING.test(line.text)) {
      let end = Math.min(src.length, line.start + ABSTRACT_MAX_CHARS);
      for (let j = i; j < lines.length && lines[j].start < line.start + ABSTRACT_MAX_CHARS; j++) {
        if (KEYWORDS_LINE.test(lines[j].text)) {
          end = lines[j].end;
          break;
        }
        if (j > i && INTRO_HEADING.test(lines[j].text)) {
          end = lines[j].start;
          break;
        }
      }
      ranges.push([line.start, end]);
    }
  }
  // 겹치는 구간을 합친다(감사의 글 바로 뒤 참고문헌 등)
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

function isInRanges(ranges, offset) {
  for (const [s, e] of ranges) {
    if (offset < s) return false;
    if (offset < e) return true;
  }
  return false;
}

// ---- 줄바꿈 조각(오탐 감축 D단계) ---------------------------------------
// PDF 추출 텍스트는 줄 끝에서 낱말을 그냥 끊는다. "단\n백질"(단백질)의
// "백질"이 백질(white matter)로, "동\n기화가"(동기화)의 "기화"가 한의학
// 기화로, "fac-\ntor"의 "tor"가 토르로 잡혔다. 줄 끝이 띄어쓰기 자리인지
// 낱말 중간인지는 텍스트만으로 알 수 없으므로, 확실한 두 경우만 조각으로 본다.
//  - 앞 줄이 한 글자 한글로 끝남(그 앞은 공백·문장부호): 한국어에서 한 글자
//    낱말은 드물고, 흔한 것(및·등·수 …)은 목록으로 뺀다.
//  - 영문 하이픈 줄넘김 "xx-\nyy": 앞 조각 "xx-"와 뒤 조각 "yy" 둘 다.
const STANDALONE_SYLLABLES = new Set(
  "및 등 수 것 더 또 각 그 이 저 두 세 네 한 약 총 즉 곧 잘 못 안 왜 좀 전 후 중 간 내 외 위 뒤 앞 때 곳 데 바 뿐 줄 채 편 쪽 제 본 새 첫 매 개 명 번 년 월 일 회 차 점 장 절 항 종 건 배 할 될 된 볼 할 뿐 대 비 겸 곳 만 분 초 시 쌍 " +
    // 떨어져 쓰인 조사: 한국어 논문 PDF에서 "GWAS 의\n유전형"처럼 영문·숫자 뒤
    // 조사를 띄어 쓰는 일이 흔하다. 조사로 끝난 줄은 띄어쓰기 자리다.
    "의 를 을 로 에 와 과 가 는 은 도".split(" ")
);

function isLineWrapFragment(text, start) {
  const src = text || "";
  const ch = src[start] || "";
  if (/[가-힣]/.test(ch)) {
    // "…␣단\n백질": start 바로 앞이 줄바꿈이고, 그 앞이 한 글자 한글 낱말
    // 줄바꿈은 \n 또는 \r\n(텍스트 모드 입력)
    if (src[start - 1] !== "\n") return false;
    const nl = src[start - 2] === "\r" ? 2 : 1;
    const prev = src[start - 1 - nl] || "";
    if (!/[가-힣]/.test(prev)) return false;
    if (/[가-힣]/.test(src[start - 2 - nl] || "")) return false;
    return !STANDALONE_SYLLABLES.has(prev);
  }
  if (/[A-Za-z]/.test(ch)) {
    // 뒤 조각: "-\n" 바로 뒤이고 하이픈 앞이 영문
    if (src[start - 1] === "\n") {
      const h = src[start - 2] === "\r" ? start - 3 : start - 2;
      if (src[h] === "-" && /[A-Za-z]/.test(src[h - 1] || "")) return true;
    }
    // 앞 조각: 이 토큰이 "-"로 끝나고 바로 줄바꿈 → "fac-\n"
    const token = /^[A-Za-z-]+/.exec(src.slice(start));
    if (token && token[0].endsWith("-") && /^\r?\n/.test(src.slice(start + token[0].length))) return true;
  }
  return false;
}

// Common Korean grammatical particles (조사) that attach directly to a noun
// with no space, e.g. "상관관계가" for "상관관계". The word-extraction regex
// can't separate these from the noun, so exact matching would otherwise miss
// every occurrence that isn't followed by a space or punctuation. Trying a
// short list of particle-stripped forms is O(1) per word and handles the
// overwhelming majority of real text — no fuzzy search needed for this case.
const KOREAN_PARTICLES = [
  "에서", "으로", "부터", "까지", "이나", "이랑",
  "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도", "만", "나", "랑",
];

// Yields { form, matchedLength } — matchedLength is how many characters of
// the *original* word correspond to this normalized form, so highlighting
// only wraps the noun itself and leaves a stripped particle as plain text.
function* candidateNormalizedForms(word) {
  const normalized = normalizeWord(word);
  yield { form: normalized, matchedLength: word.length };
  for (const particle of KOREAN_PARTICLES) {
    if (normalized.endsWith(particle) && normalized.length > particle.length) {
      yield { form: normalized.slice(0, -particle.length), matchedLength: word.length - particle.length };
    }
  }
}

// O(1)-per-word exact lookup, built once per matching run. Most terms in a
// real paper match a title exactly, so this fast path handles the vast
// majority of hits without ever touching a slower path.
// A dictionary key that is itself a bare Korean particle (or too short to
// mean anything on its own) makes ordinary particle-attached words match a
// completely unrelated term — e.g. the finance term "로" (Rho) exact-matching
// every stray "~로" in normal prose. Guard the index itself rather than the
// matcher, so this protects every caller (exact pass, prefix pass, PDF
// per-page pass) in one place.
const PARTICLE_SET = new Set(KOREAN_PARTICLES);

// 일상어 오탐("강도"가 운동 강도가 아니라 강도죄로 잡히는 식)은 손으로
// 관리하던 AMBIGUOUS_COMMON_WORD_TITLES 60여 개로 막고 있었다. 지금은
// scripts/generate-viewer-index.js가 사전 데이터만으로 계산한 "일반어 등급"
// (term.common, 0~3)이 그 자리를 대신한다.
//  - 3: 인덱스에 아예 넣지 않는다(옛 블록리스트와 같은 효과).
//  - 2: 잡되 패널에서 뒤로 민다(sortMatches).
// 등급은 viewer-index.json 각 행의 5번째 칸으로 들어온다.
const COMMON_GRADE_EXCLUDE = 3;
const COMMON_GRADE_DEMOTE = 2;
// 영문 등급(6번째 칸): 1 = 영문 키 제외, 4 = 같은 문서에 국문 표제어도 나와야 인정
// (plasma·substance 같은 영문 동음이의어, 목록은 generate-viewer-index.js).
const EN_GRADE_EXCLUDE = 1;
const EN_GRADE_NEEDS_KOREAN = 4;

function isUnsafeIndexKey(key) {
  return key.length < 2 || PARTICLE_SET.has(key);
}

function buildExactIndex(terms) {
  const map = new Map();
  const add = (key, term) => {
    if (!key || isUnsafeIndexKey(key)) return;
    if (!map.has(key)) map.set(key, []);
    const bucket = map.get(key);
    if (!bucket.some((t) => t.slug === term.slug)) bucket.push(term);
  };
  for (const term of terms) {
    if (term.title_ko && (term.common || 0) < COMMON_GRADE_EXCLUDE) {
      add(normalizeWord(term.title_ko), term);
    }
    // 영문 일반어(treatment·function·tor 등, 생성 스크립트가 판정, 등급 1)는 영문
    // 키만 뺀다. 한글 표제어로는 그대로 잡힌다. 등급 4는 넣되 매칭 뒤에 거른다.
    if (term.title_en && term.common_en !== EN_GRADE_EXCLUDE) add(normalizeWord(term.title_en), term);
    // 병합으로 흡수된 페이지의 제목(match_titles). 한글이면 대표의 일반어 등급, 영문이면 영문 등급을
    // 그대로 따른다. aliases는 여전히 인덱싱하지 않는다(용량).
    for (const title of term.match_titles || []) {
      if (/[가-힣]/.test(title) ? (term.common || 0) < COMMON_GRADE_EXCLUDE : term.common_en !== EN_GRADE_EXCLUDE) {
        add(normalizeWord(title), term);
      }
    }
  }
  return map;
}

// `starts` is every offset in the text where this term was matched. All of
// them are kept so the renderer can mark each occurrence; firstStart /
// firstLength stay in sync with the earliest one for callers that only care
// about "where does this term first appear" (the sidebar's scroll-to link).
function recordMatch(resultsMap, term, starts, wordLength, score) {
  let item = resultsMap.get(term.slug);
  if (!item) {
    item = {
      slug: term.slug,
      title_ko: term.title_ko,
      title_en: term.title_en,
      definition: term.definition,
      categories: term.categories,
      common: term.common || 0,
      common_en: term.common_en || 0,
      sense: term.sense,
      count: 0,
      score,
      occurrences: [],
      firstStart: -1,
      firstLength: 0,
    };
    resultsMap.set(term.slug, item);
  }

  for (const start of starts) {
    item.occurrences.push({ start, length: wordLength });
  }
  item.count += starts.length;
  item.score = Math.min(item.score, score);

  item.occurrences.sort((a, b) => a.start - b.start);
  item.firstStart = item.occurrences[0].start;
  item.firstLength = item.occurrences[0].length;
}

function sortMatches(resultsMap) {
  const results = [...resultsMap.values()];
  results.sort((a, b) => {
    // 일반어 등급 2는 "틀렸다"가 아니라 "아마 이 논문의 주제어는 아니다"다.
    // 그래서 숨기지 않고 뒤로만 민다.
    // 분야 거리로 강등된 용어는 맨 뒤("다른 분야" 그룹 맨 아래).
    if (!!a.distant !== !!b.distant) return a.distant ? 1 : -1;
    const aDemoted = (a.common || 0) >= COMMON_GRADE_DEMOTE ? 1 : 0;
    const bDemoted = (b.common || 0) >= COMMON_GRADE_DEMOTE ? 1 : 0;
    if (aDemoted !== bDemoted) return aDemoted - bDemoted;
    if (a.score !== b.score) return a.score - b.score;
    return b.count - a.count;
  });
  return orderNestedMatches(results);
}

// ---- 포함 관계(기초 용어) ---------------------------------------------
// '전단응력'이 잡힌 문서에서 '응력'이 더 자주 나온다는 이유로 패널 맨 위에
// 오면, 읽는 사람은 이 논문의 주제어를 거꾸로 보게 된다. 잡힌 용어끼리
// 표제어가 포함 관계면 긴 쪽을 대표로 올리고 짧은 쪽을 그 바로 아래
// "기초 용어"로 붙인다(숨기지 않는다).
//
// 본문 밑줄은 손대지 않아도 된다 — computeKeptSpans가 같은 자리에서 긴
// 일치를 우선하고, 애초에 매칭이 토큰 단위라 '전단응력' 자리에서 '응력'이
// 따로 잡히지 않는다. 그래서 짧은 용어의 count는 이미 단독 등장만 센다.
function orderNestedMatches(matches) {
  const list = (matches || []).map((m) => ({ ...m }));
  const norm = (m) => normalizeWord(m.title_ko || "");

  // 대표 고르기. 자기를 진부분문자열로 품는 용어들 중, 패널에서 가장 아래에
  // 놓이는 것의 밑에 붙인다 — 그래야 짧은 용어가 자기를 품는 어떤 용어보다도
  // 위에 뜨지 않는다. 예전에는 가장 긴 용어(국소장전위) 밑에 붙여서, 그보다
  // 순위가 낮은 활동전위보다 '전위'가 위에 떴다(말뭉치 nbome 정렬 오류).
  // 품는 용어가 자신도 접히는 경우(A ⊃ B ⊃ C)는 B가 아니라 B가 접힌 대표 A를
  // 기준으로 삼아 접기 단계가 두 겹이 되지 않게 한다. 긴 용어부터 처리하면
  // 품는 쪽의 대표가 항상 먼저 정해져 있다.
  const repOf = new Map();
  const indexOf = new Map(list.map((m, i) => [m.slug, i]));
  const anchorOf = (m) => (repOf.has(m.slug) ? repOf.get(m.slug) : m.slug);
  const byLengthDesc = list.map((m, i) => i).sort((a, b) => norm(list[b]).length - norm(list[a]).length || a - b);
  for (const i of byLengthDesc) {
    const short = list[i];
    const shortKey = norm(short);
    // 강등된 용어는 포함 관계로 묶지 않는다 — 묶이면 대표를 따라 위로 올라온다.
    if (!shortKey || short.distant) continue;
    let rep = null;
    list.forEach((long, j) => {
      if (i === j || long.distant) return;
      const longKey = norm(long);
      if (longKey.length <= shortKey.length || !longKey.includes(shortKey)) return;
      const anchor = anchorOf(long);
      if (rep === null || indexOf.get(anchor) > indexOf.get(rep)) rep = anchor;
    });
    if (rep) repOf.set(short.slug, rep);
  }

  const ordered = [];
  const emitted = new Set();
  for (const match of list) {
    if (repOf.has(match.slug)) continue; // 대표 차례에 함께 나간다
    // 기초 용어가 여럿이면 긴 것부터 — 대표에 가까운 순서가 읽기 편하다.
    const basics = list
      .filter((other) => repOf.get(other.slug) === match.slug)
      .sort((a, b) => norm(b).length - norm(a).length);
    if (basics.length) match.basics = basics.map((b) => b.slug);
    ordered.push(match);
    emitted.add(match.slug);
    for (const basic of basics) {
      basic.nestedUnder = match.slug;
      ordered.push(basic);
      emitted.add(basic.slug);
    }
  }
  // 포함 관계는 길이 순서라 순환이 생기지 않지만, 방어적으로 빠진 항목은
  // 원래 자리 순서대로 뒤에 붙인다.
  for (const match of list) if (!emitted.has(match.slug)) ordered.push(match);
  return ordered;
}

// ---- 문서 분야 추정 ---------------------------------------------------
// 잡힌 용어들의 대표 분야(categories[0]) 분포로 이 문서의 분야를 고른다.
// 철회된 시도(a4cdbf8d6)는 이걸로 다른 분야 용어를 "숨겨서" 문제였다.
// 여기서는 순서만 바꾸고, 나머지는 접힌 그룹으로 그대로 보여 준다.
const FIELD_MAX = 3;
const FIELD_MIN_SHARE = 0.15; // 1위 대비 이 비율 미만이면 곁가지로 본다
const FIELD_MIN_COUNT = 2; // 용어 하나짜리 분야는 "이 문서의 분야"가 아니다
// 잡힌 용어가 적으면 분포 자체가 표본이 안 된다(9개가 7개 분야에 흩어지는
// 식). 그럴 때 접으면 정작 주제어가 "다른 분야"로 밀려 내려간다 — 브라우저
// 확인에서 실제로 그렇게 나왔다. 짧은 목록은 그냥 다 보여 주는 게 낫다.
const FIELD_MIN_MATCHES = 10;
// 고른 분야가 전체의 이만큼도 덮지 못하면 "이 문서의 분야"라 할 수 없다.
const FIELD_MIN_COVERAGE = 0.4;

function estimateDocumentFields(matches, max) {
  const counts = new Map();
  for (const match of matches || []) {
    const primary = (match.categories || [])[0];
    if (!primary) continue;
    counts.set(primary, (counts.get(primary) || 0) + 1);
  }
  if (!counts.size) return [];
  const total = (matches || []).length;
  if (total < FIELD_MIN_MATCHES) return [];
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked[0][1];
  const picked = ranked
    .filter(([, n]) => n >= FIELD_MIN_COUNT && n / top >= FIELD_MIN_SHARE)
    .slice(0, max || FIELD_MAX);
  const covered = picked.reduce((n, [, c]) => n + c, 0);
  if (!picked.length || covered / total < FIELD_MIN_COVERAGE) return [];
  return picked.map(([code]) => code);
}

// 주 분야 용어를 앞으로, 나머지를 뒤로(순서는 원본 유지). 기초 용어는
// 대표 용어를 따라간다 — 분야가 다르다고 떼어놓으면 접기가 깨진다.
function groupMatchesByField(matches, fields) {
  const list = matches || [];
  const fieldSet = new Set(fields || []);
  const isPrimary = (match) => !fieldSet.size || fieldSet.has((match.categories || [])[0]);
  const bySlug = new Map(list.map((m) => [m.slug, m]));
  const primary = [];
  const others = [];
  const distant = []; // 분야 거리로 강등 — 추정 분야와 무관하게 "다른 분야" 맨 아래
  for (const match of list) {
    if (match.distant) { distant.push(match); continue; }
    const anchor = match.nestedUnder ? bySlug.get(match.nestedUnder) || match : match;
    (isPrimary(anchor) ? primary : others).push(match);
  }
  return { primary, others: others.concat(distant) };
}

// ---- 분야 거리 규칙(오탐 감축 C단계) --------------------------------------
// 짧은 표제어는 동음이의어가 많다: 의학 논문의 "감마 파"가 금융 옵션의
// 감마로, "제대로"가 군사 제대로, "이 기기"가 한의학 기기(氣機)로 잡혔다.
// 문서의 상위 분야군을 잡힌 용어들로 추정하고, 짧은 표제어의 categories가
// 전부 그 분야군·인접 분야군 밖이면 match.distant = true로 강등한다. 버리지
// 않는다 — 분야 추정이 틀려도 사용자가 잃는 것은 "다른 분야" 그룹 한 번
// 펼치기뿐이어야 한다. 강등된 용어는 본문 밑줄이 없고, 패널에서는 "다른 분야"
// 접힌 그룹 맨 아래에 온다(팝오버·검색은 그대로).
// 위 estimateDocumentFields(98개 세부 분야 단위)는 말뭉치 10편 중 7편에서
// "분야 없음"을 내 이 규칙에 쓸 수 없어서, 대분류(CATEGORY_GROUPS) 단위로 센다.
const FIELD_DISTANCE_MIN_MATCHES = 10; // 이보다 적으면 추정을 믿지 않는다(브리프)
const FIELD_GROUP_MAX = 3;
// 1위 분야군 대비 이 비율 이상이어야 상위로 본다. 말뭉치에서 0.2·0.3·0.4·0.5가
// 미탐 17·18·21·21 / 오탐 73·62·48·47 — 0.4에서 오탐이 부풀린 곁가지 분야군
// (법학 논문의 인문학 등)이 상위에서 빠진다. 말뭉치 9편 기준으로 고른 값이라
// 과적합 가능 — 말뭉치를 늘리면 다시 잰다.
const FIELD_GROUP_MIN_SHARE = 0.4;
const FIELD_GROUP_MIN_COUNT = 2;
const SHORT_TITLE_MAX_SYLLABLES = 2;
// 한의학은 CATEGORY_GROUPS에서 의학·생명에 들어 있지만, 기(氣)·혈(穴)·기체(氣滯)
// 같은 짧은 표제어가 의학 논문 일상어와 겹치므로 별도 분야군으로 뗀다.
const KMED_GROUP = "한의학";
const BASIC_GROUP = "연구 기초·방법"; // 통계·방법론은 어느 분야 논문에나 나온다
// 인접 분야군(방향 있음): 키 분야군이 문서의 상위일 때 값 분야군도 가깝다고 본다.
// 한의학 문서에서 의학은 가깝지만, 의학 문서에서 한의학은 가깝지 않다.
const FIELD_GROUP_NEIGHBORS = {
  "자연과학": ["의학·생명", "공학·기술", "농림수산·식품"],
  "의학·생명": ["자연과학", "농림수산·식품"],
  [KMED_GROUP]: ["의학·생명"],
  "공학·기술": ["자연과학", "컴퓨터·정보", "건축·도시·공간"],
  "컴퓨터·정보": ["공학·기술"],
  "사회과학": ["경영·경제", "교육·인간발달", "인문학"],
  "경영·경제": ["사회과학"],
  "인문학": ["사회과학", "예술·체육"],
  "예술·체육": ["인문학"],
  "교육·인간발달": ["사회과학"],
  "농림수산·식품": ["자연과학"],
  "건축·도시·공간": ["공학·기술"],
};

let fieldGroupMap = null;
function fieldGroupOf(code) {
  if (!fieldGroupMap) {
    fieldGroupMap = new Map();
    let groups = null;
    if (typeof CATEGORY_GROUPS !== "undefined") groups = CATEGORY_GROUPS; // 브라우저: category-data.js 전역
    else if (typeof module !== "undefined" && module.exports) groups = require("./category-data.js").CATEGORY_GROUPS;
    for (const group of groups || []) for (const c of group.codes) fieldGroupMap.set(c, group.label);
    fieldGroupMap.set("kmed", KMED_GROUP);
  }
  return fieldGroupMap.get(code) || null;
}

// allowed: 주면 그 분야군만 순위에 올린다(2패스에서 1차 집합의 부분집합만 허용).
function estimateFieldGroups(matches, allowed) {
  const list = matches || [];
  if (list.length < FIELD_DISTANCE_MIN_MATCHES) return [];
  const counts = new Map();
  for (const match of list) {
    // (짧은 표제어를 추정에서 빼 보기도 했으나 미탐 29로 늘어 전부 센다.)
    const group = fieldGroupOf((match.categories || [])[0]);
    if (!group || group === BASIC_GROUP) continue;
    if (allowed && !allowed.includes(group)) continue;
    counts.set(group, (counts.get(group) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked.length) return [];
  const top = ranked[0][1];
  return ranked
    .filter(([, n]) => n >= FIELD_GROUP_MIN_COUNT && n / top >= FIELD_GROUP_MIN_SHARE)
    .slice(0, FIELD_GROUP_MAX)
    .map(([group]) => group);
}

// 짧은 표제어: 한글 표제어가 2음절 이하이거나, 한 번도 한글로 잡히지 않고
// 영문 한 단어로만 잡힌 경우(표제어가 길어도 "Treatment" 한 단어가 근거의 전부다).
function isShortMatch(match) {
  const ko = (match.title_ko || "").replace(/[^가-힣]/g, "");
  if (match.viaHangul !== false) return ko.length > 0 && ko.length <= SHORT_TITLE_MAX_SYLLABLES;
  return /^[A-Za-z]+$/.test((match.title_en || "").trim());
}

function markDistant(list, top) {
  const related = new Set([BASIC_GROUP, ...top]);
  for (const group of top) for (const n of FIELD_GROUP_NEIGHBORS[group] || []) related.add(n);
  for (const match of list) {
    delete match.distant;
    if (!top.length || !isShortMatch(match)) continue;
    const groups = (match.categories || []).map(fieldGroupOf).filter(Boolean);
    if (groups.length && !groups.some((g) => related.has(g))) match.distant = true;
  }
}

// 반환값은 입력과 같은 목록(강등 표시만 붙음). 2패스: 1차로 강등된 용어와, 다른
// 상위 분야군이 뒷받침하지 않는 짧은 표제어를 빼고 상위 분야군을 다시 추정해 한 번 더 판정한다. 오탐 자체가 분야 추정을 오염시키는
// 경우(thesis-toc: 한의학 오탐 3개가 한의학을 상위로 올려 기기·기체가 살아남음)를 푼다.
function filterDistantFieldMatches(matches) {
  const list = matches || [];
  const first = estimateFieldGroups(list);
  markDistant(list, first);
  if (!first.length) return list;
  // 2차 추정에서는 짧은 표제어를, 자기 분야군을 뺀 나머지 상위 분야군(과 그 인접)에
  // 닿을 때만 센다. 1차만으로는 짧은 오탐이 제 분야군을 상위로 올려 스스로를
  // 살리는 순환(thesis-toc의 기기·기체·혈 → 한의학)이 풀리지 않는다.
  const supportedByOthers = (m) => {
    const own = fieldGroupOf((m.categories || [])[0]);
    const others = first.filter((g) => g !== own);
    const rel = new Set([BASIC_GROUP, ...others]);
    for (const g of others) for (const n of FIELD_GROUP_NEIGHBORS[g] || []) rel.add(n);
    return (m.categories || []).map(fieldGroupOf).some((g) => rel.has(g));
  };
  // 2차는 1차 상위 분야군 안에서만 다시 고른다(교체·신규 승격 금지). 1차 집합 밖
  // 분야군이 2차에서 올라오면 3개 한도에 밀려 멀쩡한 1차 분야군이 빠졌다
  // (psychiatry: 인문학이 올라와 사회과학이 밀려 copyright·screening 강등).
  const kept = list.filter((m) => !m.distant && (!isShortMatch(m) || supportedByOthers(m)));
  const second = estimateFieldGroups(kept, first);
  if (second.length) markDistant(list, second);
  // 뒤 규칙(문맥 뜻 판별 등)이 같은 상위 분야군을 쓰도록 목록에 달아 둔다.
  list.topFieldGroups = second.length ? second : first;
  return list;
}

// ---- 문맥 뜻 판별(오탐 라운드 3 규칙 1) -----------------------------------
// 분야 거리 규칙은 "이 문서의 상위 분야군"만 본다. 인접 분야 동음이의어(중독=
// poisoning, 응집=coagulation, 비중=specific-gravity)는 분야군이 가까워 그 체를
// 통과한다. 그래서 등장 자리 주변 낱말을 사전 쪽 뜻과 맞춰 본다: 빌드 때 각 짧은
// 표제어의 정의·관련어·분야명에서 뽑은 "뜻 키워드"(term.sense)가 등장 위치 앞뒤
// SENSE_WINDOW자 안에 하나도 없고 등장도 적으면, 그 뜻으로 쓰인 게 아니라고 보고
// 분야 거리와 같은 방식으로 강등한다(버리지 않음).
// 일상어를 손으로 목록에 넣는 대신 문서 안에서 판별하는 일반 규칙이다.
//
// 25편 조정표(기준선 오탐 125, 미탐 19 + 강등 미탐 18; 미탐 +3 이상이면 불합격):
//   창 ±200·낱말 일치·상위만 제외         오탐 81  강등 미탐 46
//   창 ±200·부분 문자열·상위만 제외       오탐 82  강등 미탐 41
//   문서 전체·부분 문자열·상위만 제외     오탐 105 강등 미탐 25
//   위 + 등장 1회만                       오탐 109 강등 미탐 23
//   문서 전체·부분 문자열·상위+인접 제외  오탐 119 강등 미탐 19  ← 채택
// ±200자 창은 한 번 나온 정상 용어(유치원·사교육·신뢰도)의 주변에 사전 쪽 키워드가
// 우연히 없는 경우가 많아 정답을 크게 잃었다. 창을 문서 전체로 넓히고(= 이 문서에
// 그 뜻의 낱말이 하나도 없다), 분야 거리 규칙처럼 인접 분야군도 제외해야 기준을 넘는다.
// 2026-09-26 사용자 결정: 정답지를 "사전 뜻과 같을 때만 정답"으로 바꾼 뒤 ±200자 창·
// 상위(+기초)만 제외로 다시 적용 — 오탐 101→69, 강등 미탐 12→29를 받아들임(강등은 접힌 그룹).
const SENSE_WINDOW = 200;
const SENSE_MAX_SYLLABLES = 3;
// 등장 수 한도(옛 SENSE_MAX_COUNT=2, 3회 이상이면 판단 없이 유지)는 라운드 5에서 뺐다:
// 여러 번 나와도 모든 등장 창을 합쳐 뜻 낱말이 하나도 없으면 다른 뜻으로 본다.
// 25편 오탐 66→62, 강등 미탐 14→17(접근성·루버·굴절률).
const SENSE_MIN_OVERLAP = 1;
// 빌드 스크립트가 사전 본문에서 뜻 키워드(명사)를 뽑을 때 조사·흔한 어미를 떼는 데 쓴다.
const SENSE_ENDINGS = [
  "으로써", "으로서", "에서의", "입니다", "합니다", "됩니다", "하였다", "되었다",
  "에서", "으로", "에게", "부터", "까지", "처럼", "보다", "이나", "이며", "이다",
  "하는", "되는", "하여", "하고", "하며", "하게", "하기", "한다", "된다", "했다", "되어", "되며", "적인", "적으로", "적",
  "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도", "만", "나", "한", "된", "들",
];
function senseStems(word) {
  const w = String(word || "");
  const out = [w];
  // "-주의"(자본주의·구조주의)의 "의"는 조사가 아니다 — 떼면 "자본주·구조주" 같은
  // 조각이 뜻 키워드로 들어간다(라운드 4 검수). "자본주의의"처럼 조사가 더 붙은 꼴은 뗀다.
  const ismTail = w.endsWith("주의");
  for (const end of SENSE_ENDINGS) {
    if (ismTail && end === "의") continue;
    if (w.endsWith(end) && w.length - end.length >= 2) out.push(w.slice(0, -end.length));
  }
  return out;
}

// 영문으로만 잡혀도(Variance → 분산) 한글 표제어 길이로 본다.
function isTwoSyllableHangul(match) {
  const ko = (match.title_ko || "").replace(/[^가-힣]/g, "");
  return ko.length > 0 && ko.length <= SHORT_TITLE_MAX_SYLLABLES;
}

function isSenseTarget(match) {
  const ko = (match.title_ko || "").replace(/[^가-힣]/g, "");
  if (match.viaHangul !== false) return ko.length > 0 && ko.length <= SENSE_MAX_SYLLABLES;
  return /^[A-Za-z]+$/.test((match.title_en || "").trim());
}

// 이 규칙에서 제외하는 분야군: 상위 + 연구 기초·방법(통계·방법론). 인접 분야군은 판별 대상.
function inTopGroups(match, top) {
  const set = new Set([BASIC_GROUP, ...top]);
  return (match.categories || []).some((c) => set.has(fieldGroupOf(c)));
}

function senseEnglishHit(lower, key) {
  for (let i = lower.indexOf(key); i !== -1; i = lower.indexOf(key, i + 1)) {
    if (i === 0 || !/[a-z]/.test(lower[i - 1])) return true;
  }
  return false;
}

// 등장 자리 창들과 뜻 키워드의 교집합 크기(전체 등장 합산, 키워드 중복 없이).
// 뜻 키워드가 없는 용어는 -1(판단 보류).
function senseOverlap(match, text) {
  const keys = new Set(match.sense || []);
  if (!keys.size) return -1;
  const hit = new Set();
  for (const occ of match.occurrences || []) {
    const from = Math.max(0, occ.start - SENSE_WINDOW);
    const to = Math.min(text.length, occ.start + occ.length + SENSE_WINDOW);
    // 영문으로 잡힌 용어는 등장 자리 자체를 뺀다: 제 영문 토큰이 키워드에 있어 자기
    // 자신과 늘 겹친다(라운드 4). 한글로 잡힌 경우는 그대로 둔다 — 표제어 안에 든
    // 키워드(사교육⊃교육, 부적응⊃적응)가 스스로 맞아 규칙을 비껴가는 셈인데, 빼 보니
    // 25편에서 정답 2개(사교육·부적응)만 강등되고 오탐은 줄지 않았다.
    const win = match.viaHangul === false
      ? text.slice(from, occ.start) + " " + text.slice(occ.start + occ.length, to)
      : text.slice(from, to);
    const lower = win.toLowerCase();
    for (const k of keys) {
      // 한글은 부분 문자열로 본다: 논문은 "독성물질"처럼 붙여 쓰는 복합어가 많아 낱말
      // 일치로는 놓친다. 영문 키(표제어 토큰, 소문자)는 대소문자 무시 + 낱말 앞 경계만
      // 본다 — 복수형(poisonings)은 인정하고 nonpoisoning 같은 중간 일치는 막는다.
      if (/^[a-z]+$/.test(k) ? senseEnglishHit(lower, k) : win.includes(k)) hit.add(k);
    }
  }
  return hit.size;
}

// 영문 병기 불일치(라운드 5 규칙 6): 짧은 한글 표제어 바로 뒤 괄호 속 영문
// "중독(addiction)"은 저자가 밝힌 뜻이라 문맥 낱말보다 직접적인 근거다. 병기 토큰이
// 표제어 영문 토큰과 하나도 안 겹치면 다른 뜻. 한쪽이 다른 쪽으로 시작하거나 앞 4글자가
// 같으면 겹친 것으로 본다(ion·ions, poisonings·poisoning). 약어(PET)·영문 없는 괄호는 판단하지 않는다.
// 반환: "match"(한 등장이라도 겹침) / "mismatch"(병기가 있는데 모두 불일치) / "none".
const GLOSS_RE = /^\s?\(\s*([A-Za-z][A-Za-z\s\-]{2,60})\)/;
function glossTokens(s) {
  return (String(s).toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !["the", "and", "for", "with", "from", "via", "non"].includes(w));
}
// 같은 낱말로 보는 기준: 한쪽이 다른 쪽으로 시작(ion·ions)하거나 앞 4글자가 같음.
function glossTokenMatch(a, b) {
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4);
}
// 병기가 로마자 표기(명문 mingmen·태극 taiji)로 보이는가. 영어 사전 없이 가리는
// 근사다: 표제어 영문 어느 토큰과도 앞 3글자가 안 겹치면서 모음 비율이 비정상(≥0.55).
function looksRomanized(tok, own) {
  if (own.some((b) => tok.slice(0, 3) === b.slice(0, 3))) return false;
  const vowels = (tok.match(/[aeiou]/g) || []).length;
  return vowels / tok.length >= 0.55;
}

// top: 상위 분야군. 한의학이 있으면 병기가 로마자 표기(mingmen·dantian)이기 쉬워 규칙을 끈다.
function englishGlossVerdict(match, text, top) {
  if (match.viaHangul === false) return "none";
  if (top && top.includes(KMED_GROUP)) return "none";
  const ko = (match.title_ko || "").replace(/[^가-힣]/g, "");
  if (!ko || ko.length > SENSE_MAX_SYLLABLES) return "none";
  const own = glossTokens(match.title_en || "");
  if (!own.length) return "none";
  let seen = false;
  for (const occ of match.occurrences || []) {
    const g = GLOSS_RE.exec(text.slice(occ.start + occ.length, occ.start + occ.length + 70));
    if (!g || /^[A-Z]{2,}s?$/.test(g[1].trim())) continue;
    // 하이픈 낱말(p-value, 줄바꿈 screen-ing)은 토큰이 쪼개져 비교를 믿을 수 없다.
    if (/[A-Za-z]-[A-Za-z]/.test(g[1])) continue;
    const toks = glossTokens(g[1]);
    if (!toks.length) continue;
    if (toks.some((a) => own.some((b) => glossTokenMatch(a, b)))) return "match";
    // 구 단위 병기: "굽힘 강성(bending rigidity)"처럼 괄호가 앞 수식어까지 옮긴 것.
    // 브리프는 "표제어 토큰 + 1 초과"였지만 그러면 bending rigidity(2 vs 1)가 안 걸린다.
    // 25편 채점은 두 기준이 같아(오탐 59·강등 미탐 17) 더 넓은 쪽을 쓴다.
    if (toks.length > own.length) continue;
    if (toks.every((a) => looksRomanized(a, own))) continue;
    seen = true;
  }
  return seen ? "mismatch" : "none";
}

// top: 상위 분야군(filterDistantFieldMatches가 고른 것). 없으면 적용하지 않는다 —
// 잡힌 용어가 적은 문서에서는 "분야 밖"이라는 판단 자체를 믿을 수 없다.
// 상위 분야군에 속하는 용어는 제외한다(주제어 손실 방지).
// 동형 표제어(2026-09-26): 한글 표제어가 같은 두 용어(중독 = addiction / poisoning)는
// 같은 자리에서 함께 잡힌다. 둘 다 상위 분야군(의학·생명)에 들면 아래 뜻 규칙이 둘 다
// 건너뛰어 마약 논문에서도 poisoning이 남는다. 그래서 같은 표제어끼리는 분야와 무관하게
// 뜻 키워드 겹침을 비교해, 가장 많이 겹치는 쪽만 남기고 나머지는 강등한다(동점이면 보류).
function applyHomonymRule(list, text) {
  const groups = new Map();
  for (const match of list) {
    if (match.distant || match.viaHangul === false || !match.title_ko) continue;
    const key = normalizeWord(match.title_ko);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const scored = group.map((m) => ({ m, s: senseOverlap(m, text) }));
    const best = Math.max(...scored.map((x) => x.s));
    if (best <= 0 || scored.filter((x) => x.s === best).length > 1) continue;
    for (const x of scored) {
      if (x.s < best) { x.m.distant = true; x.m.demotedBy = "homonym"; }
    }
  }
}

function applySenseContextRule(list, text, top) {
  // 분야 추정이 없는 문서(잡힌 용어 < FIELD_DISTANCE_MIN_MATCHES): 예전엔 규칙을 통째로
  // 껐다. 2026-09-29 사용자 결정("틀린 용어보다 놓치는 게 낫다")으로 이런 문서에서도
  // 짧은 표제어는 등장 창에 뜻 낱말이 하나도 없으면 강등한다(상위 분야군 면제가 없음).
  // 25편: 오탐 49→43, 강등 미탐 14→19.
  if (!top || !top.length) {
    for (const match of list) {
      if (match.distant || !isSenseTarget(match)) continue;
      const overlap = senseOverlap(match, text);
      if (overlap >= 0 && overlap < SENSE_MIN_OVERLAP) { match.distant = true; match.demotedBy = "sense"; }
    }
    return list;
  }
  applyHomonymRule(list, text);
  for (const match of list) {
    // 규칙 6(영문 병기 불일치)은 상위 분야군 안에서도 쓴다: 저자가 괄호로 밝힌 뜻이
    // 다르면 분야가 맞아도 다른 용어다(응집 cohesion ≠ coagulation). 상위군 밖에만
    // 적용하면 25편에서 효과 0이었고, 전체 적용은 오탐 62→59, 강등 미탐 17→18(경련
    // "convulsion" ≠ Seizure — 동의어 병기는 못 가린다).
    if (!match.distant && englishGlossVerdict(match, text, top) === "mismatch") {
      match.distant = true;
      match.demotedBy = "gloss";
      continue;
    }
    // 상위 분야군 용어는 건너뛰되, 실제 논문에서 자기 분야 밖에서 주로 쓰이는 용어
    // (match.oaOutside, OA 연동 b)는 상위 분야군 안이어도 뜻을 확인한다.
    // 2음절 이하 한글 표제어(분산·개입·정제·집합)는 상위 분야군 안이어도 뜻을 확인한다
    // (2026-09-29 사용자 결정: 틀린 용어보다 놓치는 게 낫다). 25편: 오탐 43/470 → 34/438,
    // 강등 미탐 19 → 40. 3음절까지 넓히거나 1회 등장 전부로 넓히면 정답 손실이 오탐
    // 감소의 3~4배라 여기서 멈춘다.
    const topExempt = inTopGroups(match, top) && !match.oaOutside && !isTwoSyllableHangul(match);
    if (match.distant || !isSenseTarget(match) || topExempt) continue;
    const overlap = senseOverlap(match, text);
    if (overlap < 0) continue;
    if (overlap < SENSE_MIN_OVERLAP) { match.distant = true; match.demotedBy = "sense"; }
  }
  return list;
}

// All exact-index hits for a single word: the word itself, or a
// particle-stripped form of it (e.g. "상관관계가" -> "상관관계").
//
// This used to also try every shorter prefix of a Korean word (down to 2
// characters) on the theory that Korean compounds are commonly [shorter
// term][modifier/suffix] — e.g. "분산분석" (ANOVA) contains "분산" (variance).
// In practice that heuristic is not linguistically grounded (it's a blind
// string cut, not morpheme segmentation) and produced constant false
// positives on ordinary text: "불성실" (insincere) has nothing to do with
// "불성" (Buddha-nature), "빈도분석" incorrectly surfaced "빈도" (an
// advertising term) as if the paper were about advertising, etc. Two
// unrelated Korean words sharing a 2-character prefix is the common case,
// not the exception, so this was removed — exact + particle-stripped
// matching (plus the bounded fuzzy pass below for real typos) is what
// keeps highlights meaningful.
function findExactMatches(word, exactIndex) {
  const hits = [];
  const seenForms = new Set();

  for (const candidate of candidateNormalizedForms(word)) {
    if (seenForms.has(candidate.form)) continue;
    seenForms.add(candidate.form);
    const candidates = exactIndex.get(candidate.form);
    if (candidates) hits.push({ candidates, matchedLength: candidate.matchedLength });
  }

  return hits;
}

// 약어형 영문 표제어(DALY, VaR, EEG, fMRI — 첫 글자 뒤에도 대문자)는 대소문자까지
// 같아야 잡는다. 인덱스 키는 소문자라 참고문헌의 저자 성 "Daly"가 DALY로,
// 학명의 "var."가 VaR로 잡혔다. 영문 표제어가 아니라 한글 표제어로 맞은
// 경우(title_ko 자체가 "VaR"인 행 포함)도 원문 표기와 같아야 한다.
function isAcronymLikeTitle(title) {
  return /^[A-Za-z0-9-]+$/.test(title) && /^.+[A-Z]/.test(title);
}

function acronymCaseMatches(word, matchedLength, term) {
  const surface = word.slice(0, matchedLength).replace(/[-_\s]/g, "");
  const key = normalizeWord(surface);
  for (const title of [term.title_en, term.title_ko]) {
    if (!title || normalizeWord(title) !== key) continue;
    if (!isAcronymLikeTitle(title)) return true;
    if (title.replace(/[-_\s]/g, "") === surface) return true;
  }
  // 어느 표제어와도 맞춰 보지 못했다면(정규화 차이) 막지 않는다.
  return ![term.title_en, term.title_ko].some((t) => t && normalizeWord(t) === key);
}

// Exact-match pass only: fast, synchronous, no fuzzy search. This is the
// primary matcher — cheap enough to run on documents of any size without
// blocking the page.
//
// Takes a pre-built exact index rather than building one internally, so
// callers matching many texts against the same dictionary (e.g. one page at
// a time for a multi-page PDF) build the index once and reuse it — building
// it per call turns an O(dictionary size) cost into O(pages * dictionary
// size), which is what made large-PDF analysis stall.
// 조사 "로·도·나"를 떼어 한글 2음절만 남은 매칭("제대로"→제대, "빈도로"→빈도,
// "초점도"→초점)은 부사·일상 결합과 겹치기 쉽다. 이런 표제어는 문서 안에 조사 없이
// 단독으로(또는 영문 표기로) 1회 이상 나올 때만 인정한다. 을·를·은·는·이·의·에
// 까지 넓히면 25편 기준 미탐이 19→43으로 늘어(가설을·효소의 등) 이 셋만 둔다
// (로·도·나: 오탐 −8, 미탐 ±0; 가 추가 시 미탐 +1).
const CORROBORATION_PARTICLES = new Set(["로", "도", "나"]);
function needsBareCorroboration(form, particle) {
  return /^[가-힣]{2}$/.test(form) && (particle === undefined || CORROBORATION_PARTICLES.has(particle));
}
// 단독 등장 대신, 어간이 3~4음절 낱말의 앞부분(척도화·농도의존)으로 나와도 뒷받침으로 친다.
// 나머지가 조사(1개 또는 2개 연속: 제대로·제대로는)면 같은 조사 결합이라 제외한다.
function isParticleTail(rest) {
  if (PARTICLE_SET.has(rest)) return true;
  for (let i = 1; i < rest.length; i++) if (PARTICLE_SET.has(rest.slice(0, i)) && PARTICLE_SET.has(rest.slice(i))) return true;
  return false;
}
function hasPrefixCorroboration(stem, words) {
  for (const w of words) {
    if (w.length < 3 || w.length > 4 || !w.startsWith(stem) || !/^[가-힣]+$/.test(w)) continue;
    if (!isParticleTail(w.slice(stem.length))) return true;
  }
  return false;
}

function matchTermsWithIndex(text, exactIndex) {
  const resultsMap = new Map();
  // 텍스트 모드·PDF 모드 모두 이 함수로 들어오므로 제외 구간도 여기서 한 번에.
  const excluded = excludedRanges(text);
  const keptWords = [];

  for (const [word, allStarts] of wordOccurrences(text)) {
    const starts = allStarts.filter((s) => !(excluded.length && isInRanges(excluded, s)) && !isLineWrapFragment(text, s));
    if (!starts.length) continue;
    keptWords.push(normalizeWord(word));
    const hits = findExactMatches(word, exactIndex);
    if (!hits.length) continue;
    for (const hit of hits) {
      // 한 글자짜리 표제어("혈", "힘" 등)는 어떤 문서에서든 걸리는 잡음이라
      // 본문 한 글자와 우연히 같아도 용어로 치지 않는다.
      if (hit.matchedLength < 2) continue;
      for (const term of hit.candidates) {
        if (!acronymCaseMatches(word, hit.matchedLength, term)) continue;
        recordMatch(resultsMap, term, starts, hit.matchedLength, 0);
        // 분야 거리 규칙이 "영문 한 단어로만 잡혔는가"를 본다.
        const item = resultsMap.get(term.slug);
        item.viaHangul = item.viaHangul || /[가-힣]/.test(word);
        const particle = normalizeWord(word).slice(hit.matchedLength);
        const stem = normalizeWord(word.slice(0, hit.matchedLength));
        if (!particle || !needsBareCorroboration(stem, particle)) item.bare = true;
        else item.stem = stem;
      }
    }
  }

  for (const [slug, item] of resultsMap) {
    const needsKorean = item.common_en === EN_GRADE_NEEDS_KOREAN && !item.viaHangul;
    if (!item.bare && item.stem && hasPrefixCorroboration(item.stem, keptWords)) item.bare = true;
    if (!item.bare || needsKorean) resultsMap.delete(slug);
    else delete item.bare;
    delete item.stem;
  }
  const matchedList = filterDistantFieldMatches([...resultsMap.values()]);
  // 문맥 뜻 판별(규칙 1)은 여기서 하지 않는다: 뜻 키워드가 인덱스가 아니라 viewer-defs
  // 청크에 있어서(라운드 4), 매칭된 용어의 청크를 받은 뒤 applySenseToMatches로 돌린다.
  const sorted = sortMatches(resultsMap);
  sorted.topFieldGroups = matchedList.topFieldGroups || [];
  return sorted;
}

// 매칭 결과에 뜻 키워드(match.sense)를 채운 뒤 부른다. 규칙 1로 강등된 것이 맨 뒤로
// 가도록 다시 정렬하고, 상위 분야군 표시는 그대로 옮겨 단다.
function applySenseToMatches(matches, text) {
  const top = matches.topFieldGroups;
  applySenseContextRule(matches, text, top);
  const sorted = sortMatches(new Map(matches.map((m) => [m.slug, m])));
  sorted.topFieldGroups = top;
  return sorted;
}

function matchTerms(text, terms) {
  return matchTermsWithIndex(text, buildExactIndex(terms));
}

// 공용 escapeHtml: 브라우저에서는 assets/escape.js가 먼저 로드돼 전역 함수로
// 제공된다(아래 var 선언은 기존 전역을 덮어쓰지 않는 no-op). Node 테스트에서
// viewer.js를 require하면 이 블록이 실행돼 공용본을 불러온다.
if (typeof module !== "undefined" && module.exports) {
  var escapeHtml = require("./escape.js").escapeHtml;
}

// basics는 이 용어 안에 포함된 짧은 용어들(예: '전단응력' 카드 아래의 '응력').
// 지우지 않고 접어 둔다 — 기초 용어를 모르는 사람에게는 그게 답일 수 있다.
function termCardHTML(match, basics) {
  const enPart = match.title_en ? ` <span class="term-en">(${escapeHtml(match.title_en)})</span>` : "";
  const definitionPart = match.definition
    ? `<p class="term-card-definition">${escapeHtml(match.definition)}</p>`
    : "";
  const basicList = (basics || []).filter(Boolean);
  const basicsPart = basicList.length
    ? `<details class="term-card-basics"><summary>기초 용어 ${basicList.length}개</summary>` +
      `<ul class="term-card-basics-list">${basicList.map((b) => termCardHTML(b)).join("")}</ul></details>`
    : "";
  return `<li class="term-card" data-slug="${match.slug}">
        <button type="button" class="term-card-hide-btn" data-hide-slug="${match.slug}" title="이 용어 숨기기" aria-label="이 용어 숨기기">✕</button>
        <span class="term-card-name">${escapeHtml(match.title_ko)}${enPart}</span>
        ${definitionPart}
        <a href="terms/${match.slug}.html" class="term-card-detail" target="_blank" rel="noopener">자세히 보기 →</a>
        ${basicsPart}
      </li>`;
}

// 본문 mark를 눌렀을 때 그 자리에 뜨는 팝오버의 내용. 오른쪽 카드와 달리
// "한 줄만 보고 다시 읽던 자리로 돌아가는" 용도라 숨기기 버튼 없이
// 이름·정의·상세 링크만 둔다. coveredMatches는 같은 자리에서 겹쳐 밀려난
// 다른 용어들(data-covers)이며, 있을 때만 작은 목록으로 덧붙인다.
// options.count는 이 문서 전체에서의 등장 횟수, options.basics는 포함 관계로
// 딸려 있는 짧은 용어들(3단계의 '기초 용어')이다. 둘 다 없으면 그 줄을 아예
// 만들지 않는다 — 빈 칸이 남으면 팝오버가 커 보여 읽던 자리를 더 가린다.
// DOM 없이 문자열만 만들므로 테스트에서 그대로 검증할 수 있다.
function popoverHTML(match, coveredMatches, options) {
  const opts = options || {};
  const docCount = Number(opts.count) || 0;
  const metaPart = docCount > 0 ? `<p class="dict-popover-meta">이 문서에서 ${docCount}번</p>` : "";
  const basicList = (opts.basics || []).filter(Boolean);
  const basicsPart = basicList.length
    ? `<p class="dict-popover-basics">기초 용어: ${basicList
        .map(
          (b) =>
            `<a href="terms/${encodeURIComponent(b.slug)}.html" target="_blank" rel="noopener">${escapeHtml(
              b.title_ko || b.slug
            )}</a>`
        )
        .join(", ")}</p>`
    : "";
  const enPart = match.title_en ? ` <span class="term-en">(${escapeHtml(match.title_en)})</span>` : "";
  const definitionPart = match.definition
    ? `<p class="dict-popover-definition">${escapeHtml(match.definition)}</p>`
    : "";
  // computeKeptSpans의 covered에는 자기 자신도 들어 있어 그대로 쓰면 팝오버에
  // 같은 용어가 한 번 더 나온다. 여기서 걸러 낸다.
  const covered = (coveredMatches || []).filter((c) => c && c.slug !== match.slug);
  const coveredPart = covered.length
    ? `<ul class="dict-popover-covered">${covered
        .map(
          (c) =>
            `<li><a href="terms/${encodeURIComponent(c.slug)}.html" target="_blank" rel="noopener">${escapeHtml(
              c.title_ko || c.slug
            )}</a></li>`
        )
        .join("")}</ul>`
    : "";
  return `<div class="dict-popover-head">
        <span class="dict-popover-name">${escapeHtml(match.title_ko || match.slug)}${enPart}</span>
        <button type="button" class="dict-popover-close" aria-label="닫기">✕</button>
      </div>
      ${definitionPart}
      ${metaPart}
      ${basicsPart}
      ${coveredPart}
      <a href="terms/${encodeURIComponent(match.slug)}.html" class="dict-popover-detail" target="_blank" rel="noopener">자세히 보기 →</a>`;
}

// Resolves overlapping matches down to a non-overlapping list, keeping the
// earliest-starting match at each position and recording which other slugs
// were suppressed there (via `covered`). Shared by the plain-text renderer
// (buildHighlightedHtml) and the PDF text-layer renderer.
function computeKeptSpans(text, matches) {
  // Expand each match into every place it occurs, so a term used five times
  // on a page is highlighted five times instead of only at its first hit.
  const spans = [];
  for (const match of matches) {
    const occurrences =
      match.occurrences && match.occurrences.length
        ? match.occurrences
        : match.firstStart >= 0
          ? [{ start: match.firstStart, length: match.firstLength }]
          : [];
    for (const occurrence of occurrences) {
      if (occurrence.start < 0) continue;
      spans.push({ ...match, firstStart: occurrence.start, firstLength: occurrence.length });
    }
  }

  // Earliest first; on a tie the longer span wins, so "분산분석" is kept as the
  // highlight and the "분산" starting at the same offset is folded into it.
  spans.sort((a, b) => a.firstStart - b.firstStart || b.firstLength - a.firstLength);

  const kept = [];
  let lastEnd = -1;
  let lastKept = null;
  for (const span of spans) {
    if (span.firstStart >= lastEnd) {
      const entry = { ...span, covered: [span.slug] };
      kept.push(entry);
      lastEnd = span.firstStart + span.firstLength;
      lastKept = entry;
    } else if (
      lastKept &&
      span.firstStart >= lastKept.firstStart &&
      span.firstStart < lastKept.firstStart + lastKept.firstLength
    ) {
      if (!lastKept.covered.includes(span.slug)) lastKept.covered.push(span.slug);
    }
  }
  return kept;
}

function buildHighlightedHtml(text, matches) {
  const kept = computeKeptSpans(text, matches);

  let html = "";
  let cursor = 0;
  // 같은 용어가 한 문서에 열 번 나오면 밑줄 열 개가 똑같이 진하게 깔려
  // 읽기를 방해한다. 첫 등장만 그대로 두고 이후는 얇게(dict-mark--again).
  const seen = new Set();
  for (const span of kept) {
    html += escapeHtml(text.slice(cursor, span.firstStart));
    const matchedText = text.slice(span.firstStart, span.firstStart + span.firstLength);
    const again = seen.has(span.slug) ? " dict-mark--again" : "";
    seen.add(span.slug);
    html += `<mark class="dict-mark${again}" data-slug="${span.slug}" data-covers="${span.covered.join(" ")}">${escapeHtml(matchedText)}</mark>`;
    cursor = span.firstStart + span.firstLength;
  }
  html += escapeHtml(text.slice(cursor));

  return html;
}

// 포함 관계(orderNestedMatches)로 붙은 기초 용어를 대표 카드에 묶어 준다.
// 필터·숨기기로 대표가 빠진 기초 용어는 혼자 남으므로 단독 카드로 돌린다.
function buildCardUnits(matches) {
  const list = matches || [];
  const bySlug = new Map(list.map((m) => [m.slug, m]));
  const units = [];
  for (const match of list) {
    if (match.nestedUnder && bySlug.has(match.nestedUnder)) continue;
    const basics = (match.basics || []).map((slug) => bySlug.get(slug)).filter(Boolean);
    units.push({ match, basics });
  }
  return units;
}

// Reconstructs a page’s plain text from pdf.js getTextContent() items,
// the same way buildOffsetMap() reconstructs it from the rendered DOM: a
// space is inserted between two items only when the horizontal gap between
// them (relative to text height) is wide enough to be a real inter-word
// gap, not just because they are two separate items. pdf.js commonly splits
// one visual word across multiple items (font-run changes, kerning), and
// items.map(i => i.str).join(" ") used to insert a space at every one of
// those splits, corrupting the extracted text with words broken in half.
// ---- 2단 조판 열 복원 -------------------------------------------------
// pdf.js의 getTextContent는 PDF에 기록된 순서대로 item을 준다. 2단 조판
// 논문은 그 순서가 "좌열 한 줄 → 우열 한 줄"로 번갈아 나오는 경우가 많아,
// 그대로 이으면 문장이 두 단을 오가며 토막 난다. 읽기 모드는 픽셀 위치가
// 아니라 "읽는 순서"만 있으면 되므로 x좌표 클러스터링으로 충분하다.
// pageWidth(축척 1의 페이지 폭)를 주지 않으면 이 보정을 건너뛰고 기존
// 동작을 그대로 유지한다.
const COLUMN_MIN_ITEMS = 3; // 한 열로 인정할 최소 item 수
const COLUMN_MIN_RATIO = 0.15; // 전체 item 대비 각 열의 최소 비중
const COLUMN_SPAN_MAX_RATIO = 0.2; // 본문 한가운데를 가로지르는 item의 허용 비율
const COLUMN_EDGE_TOLERANCE = 0.02; // 가운데 선 판정 여유(페이지 폭 대비)

function textItemX(item) {
  return item.transform ? item.transform[4] : 0;
}

function textItemY(item) {
  return item.transform ? item.transform[5] : 0;
}

function orderTextItemsByColumn(items, pageWidth) {
  if (!items || !(pageWidth > 0)) return items;
  if (items.length < COLUMN_MIN_ITEMS * 2) return items;

  const mid = pageWidth / 2;
  const tolerance = pageWidth * COLUMN_EDGE_TOLERANCE;
  const left = [];
  const right = [];
  const spanning = [];
  for (const item of items) {
    const x = textItemX(item);
    const width = item.width || 0;
    if (x + width <= mid + tolerance) left.push(item);
    else if (x >= mid - tolerance) right.push(item);
    else spanning.push(item);
  }

  // 아래 조건 중 하나라도 어긋나면 2단이라고 볼 근거가 약하다. 단일단
  // 페이지를 잘못 재배열하면 본문이 통째로 뒤섞이므로 보수적으로 간다.
  const total = items.length;
  if (left.length < COLUMN_MIN_ITEMS || right.length < COLUMN_MIN_ITEMS) return items;
  if (left.length / total < COLUMN_MIN_RATIO || right.length / total < COLUMN_MIN_RATIO) return items;

  // 가운데 선을 물고 있어 어느 열에도 못 넣은 item(spanning)을 y 로만 가른다.
  //  - 열 맨 윗줄보다 위:  제목·초록 → 맨 앞(header)
  //  - 열 맨 아랫줄보다 아래: 쪽번호·각주 → 맨 뒤(footer)
  //  - 두 열의 y 범위 안:   폭이 넓은 표·그림 설명 → 좌열 다음(middle)
  // 마지막 경우는 어느 쪽에 붙여도 정답이 없다. 원문 순서상 좌열을 다 읽은
  // 뒤가 가장 덜 어색해서 left 와 right 사이에 끼운다.
  let topY = -Infinity;
  let bottomY = Infinity;
  for (const item of left.concat(right)) {
    const y = textItemY(item);
    if (y > topY) topY = y;
    if (y < bottomY) bottomY = y;
  }
  const header = [];
  const middle = [];
  const footer = [];
  for (const item of spanning) {
    const y = textItemY(item);
    if (y > topY) header.push(item);
    else if (y < bottomY) footer.push(item);
    else middle.push(item);
  }

  // 본문 한가운데를 가로지르는 item이 많으면 2단이라는 판단 자체가 의심스럽다
  // (제목·쪽번호처럼 열 위아래에 있는 것은 정상이므로 세지 않는다).
  if (middle.length / total > COLUMN_SPAN_MAX_RATIO) return items;

  return header.concat(left, middle, right, footer);
}

// 자간이 큰 PDF(학위논문에 흔함)는 pdf.js가 글자 사이를 띄어쓰기로 오인해
// "혈 액 응 고 의"처럼 item 하나에 한 글자마다 공백을 끼운다. 그대로 두면
// 사전의 어떤 표제어와도 맞지 않아 용어가 거의 안 잡힌다(말뭉치 thesis-toc:
// 26쪽에서 12개). 진짜 띄어쓰기는 별도 " " item으로 오므로, item 안에서
// 한글끼리 "모두" 한 칸씩 떨어져 있을 때만 그 공백을 걷어낸다. 정상 문장은
// 한글이 붙어 있는 구간이 있어 건드리지 않는다.
function collapseLetterSpacedHangul(str) {
  const spaced = (str.match(/[가-힣] [가-힣]/g) || []).length;
  if (spaced < 1 || /[가-힣][가-힣]/.test(str)) return str;
  return str.replace(/([가-힣]) (?=[가-힣])/g, "$1");
}

function joinTextItems(items, pageWidth) {
  const ordered = orderTextItemsByColumn(items, pageWidth);
  const NEWLINE = String.fromCharCode(10);
  let text = "";
  let prevItem = null;
  let prevEndX = 0;
  let prevY = 0;
  for (const item of ordered) {
    const str = collapseLetterSpacedHangul(item.str || "");
    if (!str) {
      if (item.hasEOL) text += NEWLINE;
      continue;
    }
    const x = item.transform ? item.transform[4] : 0;
    const y = item.transform ? item.transform[5] : 0;
    const height = item.transform ? Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10 : 10;
    const startsWithSpace = str.charCodeAt(0) === 32;
    const textEndsWithSpace = text.length > 0 && (text.charCodeAt(text.length - 1) === 32 || text.charCodeAt(text.length - 1) === 10);
    if (prevItem && !startsWithSpace && !textEndsWithSpace) {
      const sameLine = Math.abs(y - prevY) < height * 0.5;
      if (!sameLine) {
        text += NEWLINE;
      } else if (x - prevEndX > height * 0.18) {
        text += " ";
      }
    }
    text += str;
    if (item.hasEOL) text += NEWLINE;
    prevItem = item;
    prevEndX = x + (item.width || 0);
    prevY = y;
  }
  return text;
}

// ---- PDF text-layer offset mapping -----------------------------------
// The PDF text layer is made of one <span> per extracted text item ("leaf"
// spans; PDF.js also inserts non-leaf <span class="markedContent"> wrapper
// groups which we skip). We rebuild a flat "page text" string by
// concatenating each leaf span's text, and keep a start/end offset for every
// underlying Text node so we can turn a character range back into a DOM
// Range. This map is rebuilt from the live DOM every time it's needed, so it
// stays correct even after earlier highlights have split text nodes.
//
// PDF.js frequently splits a single visual word across several adjacent
// spans (font-run changes, kerning, per-glyph positioning) with no space
// character in either span's text. Unconditionally joining every span with a
// space (the previous behavior here) inserted a bogus space into the middle
// of those words, corrupting the text handed to the term matcher and
// shifting every highlight after it — the "highlight lands mid-word or on
// the wrong stretch of text" reports were coming from this, specifically
// for PDFs whose generator fragments text runs (common with tables and
// Hangul word-processor exports). A space is now inserted only when the
// horizontal gap between two spans on the same line is wide enough to be a
// real inter-word gap, using the same gap-vs-line-height heuristic text
// extraction tools commonly use — not just because two DOM spans happen to
// be adjacent.
function buildOffsetMap(container) {
  const leafSpans = container.querySelectorAll("span:not(.markedContent)");
  let text = "";
  const map = [];
  let prevSpan = null;
  let prevRect = null;
  const NEWLINE = String.fromCharCode(10);
  for (const span of leafSpans) {
    const spanText = span.textContent;
    const spanStartsWithSpace = spanText.length > 0 && spanText.charCodeAt(0) === 32;
    const textEndsWithSpace = text.length > 0 && (text.charCodeAt(text.length - 1) === 32 || text.charCodeAt(text.length - 1) === 10);
    if (prevSpan && spanText && !spanStartsWithSpace && !textEndsWithSpace) {
      const rect = span.getBoundingClientRect();
      const sameLine = Math.abs(rect.top - prevRect.top) < prevRect.height * 0.5;
      if (!sameLine) {
        text += NEWLINE;
      } else {
        const gap = rect.left - prevRect.right;
        if (gap > prevRect.height * 0.18) text += " ";
      }
      prevRect = span.getBoundingClientRect();
    } else if (spanText) {
      prevRect = span.getBoundingClientRect();
    }
    prevSpan = span;

    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const start = text.length;
      text += node.nodeValue;
      map.push({ start, end: text.length, node });
    }
  }
  return { text, map };
}

// 읽기 모드 섹션은 pdf.js 텍스트 레이어와 달리 span 기하가 없다. DOM 텍스트가
// 곧 페이지 텍스트 그대로이므로(buildHighlightedHtml 이 글자를 더하거나 빼지
// 않는다) 텍스트 노드를 이어 붙이기만 하면 오프셋 맵이 된다.
function buildTextNodeOffsetMap(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let text = "";
  const map = [];
  let node;
  while ((node = walker.nextNode())) {
    const start = text.length;
    text += node.nodeValue;
    map.push({ start, end: text.length, node });
  }
  return { text, map };
}

function resolvePosition(map, pos) {
  for (const entry of map) {
    if (pos <= entry.end) {
      const clamped = Math.max(pos, entry.start);
      return { node: entry.node, offset: clamped - entry.start };
    }
  }
  const last = map[map.length - 1];
  if (!last) return null;
  return { node: last.node, offset: last.end - last.start };
}

// Wraps the page-text range [startOffset, endOffset) with mark elements
// created by makeMark(). Returns the created <mark> elements (there can be
// more than one if the range spans multiple underlying text items).
// `precomputedMap` lets a caller that's wrapping several ranges in the same
// container (e.g. every dictionary match on one PDF page) build the offset
// map once and reuse it, instead of paying a full DOM walk per range. This
// is only safe when ranges are wrapped in descending start-offset order —
// wrapping splits DOM text nodes at/after the range, which invalidates node
// identity for anything at a higher offset but leaves lower-offset nodes
// (still to come) untouched.
function wrapPageRange(container, startOffset, endOffset, makeMark, precomputedMap) {
  if (endOffset <= startOffset) return [];
  const map = precomputedMap || buildOffsetMap(container).map;
  if (map.length === 0) return [];
  const startPos = resolvePosition(map, startOffset);
  const endPos = resolvePosition(map, endOffset);
  if (!startPos || !endPos) return [];

  if (startPos.node === endPos.node) {
    if (startPos.offset >= endPos.offset) return [];
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    if (range.collapsed) return [];
    const mark = makeMark();
    range.surroundContents(mark);
    return [mark];
  }

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node;
  let inRange = false;
  const nodesToWrap = [];
  while ((node = walker.nextNode())) {
    if (node === startPos.node) inRange = true;
    if (inRange) nodesToWrap.push(node);
    if (node === endPos.node) break;
  }

  const created = [];
  for (const n of nodesToWrap) {
    const range = document.createRange();
    range.setStart(n, n === startPos.node ? startPos.offset : 0);
    range.setEnd(n, n === endPos.node ? endPos.offset : n.nodeValue.length);
    if (range.collapsed) continue;
    const mark = makeMark();
    range.surroundContents(mark);
    created.push(mark);
  }
  return created;
}

// wrapPageRange 에 같은 precomputedMap 을 돌려 쓰려면 "시작 오프셋 내림차순"
// 이어야 한다(위 주석의 불변식). 이걸 어기면 증상이 "하이라이트 하나가 엉뚱한
// 자리에 그어진다"로만 나타나 원인을 찾기 어렵다. 그래서 던지지 않고 —
// 읽는 사람의 하이라이트를 통째로 날리는 것보다 낫다 — console.error 로
// 알린 뒤 정렬해서 진행한다.
function orderRangesForWrapping(ranges) {
  const list = (ranges || []).filter((r) => r && Number.isFinite(Number(r.startOffset)));
  let violated = false;
  for (let i = 1; i < list.length; i++) {
    if (Number(list[i].startOffset) > Number(list[i - 1].startOffset)) {
      violated = true;
      break;
    }
  }
  if (violated) {
    console.error(
      "[wrapPageRange] 감쌀 범위가 시작 오프셋 내림차순이 아닙니다. 정렬해서 진행합니다.",
      list.map((r) => r.startOffset)
    );
    return [...list].sort((a, b) => Number(b.startOffset) - Number(a.startOffset));
  }
  return list;
}

function unwrapMark(mark) {
  const parent = mark.parentNode;
  if (!parent) return;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  parent.normalize();
}

// `arrayBuffer` is the already-read file contents. Passing it in avoids a
// second full read of the file just to hash it — the upload path reads the
// PDF once and reuses that buffer for hashing and for parsing.
async function computeDocHash(file, arrayBuffer) {
  try {
    const buf = arrayBuffer || (await file.arrayBuffer());
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (err) {
    console.error(err);
    return `${file.name}:${file.size}`;
  }
}

// viewer-index.json은 키 반복 오버헤드를 없애려고 배열-of-배열로 저장돼 있다
// (scripts/generate-viewer-index.js 참고). 여기서 기존 term 객체 모양으로
// 되돌려 주면 buildExactIndex/matchTermsWithIndex/termCardHTML은 형식이
// 바뀐 줄 모른 채 그대로 동작한다. definition은 이 인덱스에 없고,
// 매칭된 용어 것만 viewer-defs/ 청크에서 나중에 채운다.
function decodeViewerIndex(data) {
  const categories = data.categories || [];
  // 5번째 칸(일반어 등급)은 0일 때 생략돼 있다 — 4칸짜리 옛 인덱스도
  // 그대로 읽히도록 없으면 0으로 본다.
  // 6번째 칸(영문 일반어 표시, B단계)도 같은 방식으로 없으면 0.
  // 7번째 칸(문맥 뜻 키워드, 공백 구분)은 라운드 3 인덱스에만 있다. 라운드 4부터는
  // viewer-defs 청크로 옮겨 생성하지 않지만(decodeDefChunk), 옛 인덱스도 읽히게 둔다.
  // 8번째 칸(match_titles, 용어 정리 병합으로 흡수된 제목들)은 있을 때만 붙는다.
  return (data.terms || []).map(([slug, titleKo, titleEn, catIdx, common, commonEn, sense, matchTitles]) => {
    const term = {
      slug,
      title_ko: titleKo || "",
      title_en: titleEn || "",
      categories: (catIdx || []).map((i) => categories[i]).filter(Boolean),
      common: common || 0,
      common_en: commonEn || 0,
      sense: sense ? sense.split(" ") : [],
    };
    if (Array.isArray(matchTitles) && matchTitles.length) term.match_titles = matchTitles;
    return term;
  });
}

// viewer-defs/NNN.json 청크 한 개를 slug → {definition, sense} 로 푼다.
// 항목은 문자열(정의만)이거나, 뜻 키워드가 있는 짧은 표제어면 {d: 정의, s: "공백 구분
// 키워드"}다(라운드 4에서 인덱스 7번째 칸을 이리로 옮김). 문자열만 있는 옛 청크도 읽힌다.
function decodeDefChunk(map) {
  const out = new Map();
  for (const [slug, v] of Object.entries(map || {})) {
    if (typeof v === "string") out.set(slug, { definition: v, sense: [] });
    else if (v && typeof v === "object") {
      const entry = { definition: v.d || "", sense: v.s ? v.s.split(" ") : [] };
      // o: 1 = 실제 논문 말뭉치에서 자기 분야군 밖에서 주로 쓰인 용어(OA 연동 b).
      if (v.o) entry.outside = true;
      out.set(slug, entry);
    }
  }
  return out;
}

// 캐시 버전. viewer.html이 `assets/viewer.js?v=<해시>`로 이 파일을 부르고
// (scripts/stamp-viewer-version.js가 찍음), 인덱스·청크 요청에도 같은 v를 붙인다.
// 배포 뒤 옛 코드와 새 청크가 섞이지 않게 하려는 것 — 버전은 HTML 한 곳에만 둔다.
function assetVersionFromSrc(src) {
  if (!src) return "";
  const m = /[?&]v=([^&#]+)/.exec(String(src));
  return m ? m[1] : "";
}
function withAssetVersion(url, version) {
  if (!version) return url;
  return url + (url.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(version);
}

// definition 청크 번호. scripts/generate-viewer-index.js의 같은 이름 함수와
// 반드시 동일한 값을 내야 한다(FNV-1a).
const DEF_BUCKETS = 512;
function defBucket(slug) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % DEF_BUCKETS;
}


// ---- PDF 뷰어 레이아웃 계산 (순수 함수, 테스트 대상) ------------------
// "페이지맞춤"은 한 페이지 전체가 뷰어 안에 들어오는 배율이다. 너비·높이
// 중 더 빡빡한 쪽에 맞춰야 페이지가 잘리지 않으므로 둘 중 작은 비율을 쓴다.
// 뷰어가 아직 보이지 않아 clientWidth/Height가 0으로 읽히는 경우(‥has-pdf가
// 붙기 전)에는 계산이 무의미하므로 fallback을 그대로 돌려준다.
function computeFitPageScale(pageWidth, pageHeight, availableWidth, availableHeight, minScale, maxScale, fallback) {
  const fb = typeof fallback === "number" ? fallback : 1;
  if (!(pageWidth > 0) || !(pageHeight > 0)) return fb;
  if (!(availableWidth > 0) || !(availableHeight > 0)) return fb;
  const scale = Math.min(availableWidth / pageWidth, availableHeight / pageHeight);
  return clampPdfScale(scale, minScale, maxScale);
}

function clampPdfScale(scale, minScale, maxScale) {
  if (!Number.isFinite(scale)) return minScale;
  return Math.max(minScale, Math.min(maxScale, scale));
}

// ---- 페이지 오프셋 변환 (순수 함수, 테스트 대상) ----------------------
// 읽기 모드는 페이지마다 <section>을 따로 두지만, 용어 매칭은 페이지를 모두
// 이어 붙인 텍스트 하나에서 한 번에 돈다(사전 인덱스를 페이지 수만큼 훑지
// 않기 위해서). 그래서 "전체 오프셋 ↔ (페이지, 페이지 오프셋)" 변환이
// renderPdf가 페이지를 잇는 규칙과 한 글자라도 어긋나면 밑줄이 통째로 밀린다.
// 잇는 문자열은 이 상수 한 곳에서만 정한다.
const PDF_PAGE_JOINER = "\n";

function buildPageOffsets(pageTexts, joiner) {
  const sepLength = (joiner === undefined ? PDF_PAGE_JOINER : joiner).length;
  const offsets = [];
  let cursor = 0;
  (pageTexts || []).forEach((text, index) => {
    const start = cursor;
    const end = start + (text || "").length;
    offsets.push({ page: index + 1, start, end });
    cursor = end + sepLength;
  });
  return offsets;
}

function offsetToPageOffset(pageOffsets, offset) {
  for (const entry of pageOffsets || []) {
    if (offset >= entry.start && offset <= entry.end) {
      return { page: entry.page, offset: offset - entry.start };
    }
  }
  return null;
}

function pageOffsetToGlobal(pageOffsets, page, offset) {
  const entry = (pageOffsets || []).find((e) => e.page === page);
  if (!entry) return -1;
  return entry.start + offset;
}

// 전체 텍스트 기준으로 잡힌 match들을 페이지별로 쪼개고 오프셋을 페이지
// 기준으로 다시 매긴다. 원본 match는 사이드바가 계속 전체 오프셋으로 쓰므로
// 건드리지 않고 복사본을 만든다.
function splitMatchesByPage(matches, pageOffsets) {
  const collected = new Map(); // page -> Map(slug -> match 사본)
  for (const match of matches || []) {
    const occurrences =
      match.occurrences && match.occurrences.length
        ? match.occurrences
        : match.firstStart >= 0
          ? [{ start: match.firstStart, length: match.firstLength }]
          : [];
    for (const occurrence of occurrences) {
      if (occurrence.start < 0) continue;
      const location = offsetToPageOffset(pageOffsets, occurrence.start);
      if (!location) continue;
      const entry = pageOffsets[location.page - 1];
      // 페이지 경계를 넘는 일치는 읽기 모드에서 감쌀 자리가 없다(페이지가
      // 각각 다른 section이다). 드물기도 하고, 억지로 반만 긋는 것보다 빼는
      // 편이 "표시가 어긋나 보이는" 문제를 안 만든다.
      if (occurrence.start + occurrence.length > entry.end) continue;
      let page = collected.get(location.page);
      if (!page) {
        page = new Map();
        collected.set(location.page, page);
      }
      let copy = page.get(match.slug);
      if (!copy) {
        copy = { ...match, occurrences: [], firstStart: -1, firstLength: 0, count: 0 };
        page.set(match.slug, copy);
      }
      copy.occurrences.push({ start: location.offset, length: occurrence.length });
    }
  }

  const byPage = new Map();
  for (const [page, slugMap] of collected) {
    const list = [...slugMap.values()];
    for (const copy of list) {
      copy.occurrences.sort((a, b) => a.start - b.start);
      copy.firstStart = copy.occurrences[0].start;
      copy.firstLength = copy.occurrences[0].length;
      copy.count = copy.occurrences.length;
    }
    byPage.set(page, list);
  }
  return byPage;
}

// 읽기 모드에서 "지금 보고 있는 페이지의 용어"를 패널 맨 위에 올리기 위한 표.
// 스크롤할 때마다 다시 계산하면 페이지가 바뀔 때마다 전체 match를 훑게 되므로,
// 분석이 끝난 시점에 한 번 만들어 두고 이후에는 Map.get(page)만 한다.
// splitMatchesByPage와 달리 오프셋을 페이지 기준으로 다시 매기지 않는다 —
// 패널은 본문을 감쌀 일이 없고 "어떤 용어가 이 페이지에 몇 번" 만 알면 된다.
function termsOnPage(matches, pageOffsets) {
  const collected = new Map(); // page -> Map(slug -> {match, count, firstStart})
  for (const match of matches || []) {
    const occurrences =
      match.occurrences && match.occurrences.length
        ? match.occurrences
        : match.firstStart >= 0
          ? [{ start: match.firstStart, length: match.firstLength }]
          : [];
    for (const occurrence of occurrences) {
      if (occurrence.start < 0) continue;
      const location = offsetToPageOffset(pageOffsets, occurrence.start);
      if (!location) continue;
      let page = collected.get(location.page);
      if (!page) {
        page = new Map();
        collected.set(location.page, page);
      }
      const entry = page.get(match.slug);
      if (entry) {
        entry.count += 1;
        entry.firstStart = Math.min(entry.firstStart, location.offset);
      } else {
        page.set(match.slug, { match, count: 1, firstStart: location.offset });
      }
    }
  }

  const byPage = new Map();
  for (const page of [...collected.keys()].sort((a, b) => a - b)) {
    const list = [...collected.get(page).values()]
      .sort((a, b) => a.firstStart - b.firstStart)
      // 원본 match는 사이드바가 전체 오프셋으로 계속 쓰므로 복사본에 얹는다.
      .map((entry) => ({ ...entry.match, pageCount: entry.count }));
    byPage.set(page, list);
  }
  return byPage;
}

// 페이지 번호 입력은 사람이 직접 치는 값이라 빈 값·0·소수·범위 밖이 모두
// 들어온다. 범위를 벗어나면 막지 말고 가장 가까운 쪽으로 붙인다(clamp).
function clampPdfPageNumber(value, totalPages) {
  const total = Math.max(1, Math.floor(totalPages || 1));
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(total, n));
}
// ── 하이라이트·메모 앵커 (5단계) ──────────────────────────────────────
// 앵커는 {page, startOffset, endOffset, quoteText} 로, 읽기 모드 페이지 텍스트
// 안의 문자 오프셋이다. 픽셀도 DOM range 도 쓰지 않으므로 줌·재렌더와 무관하다.
// 다만 오프셋만 믿을 수는 없다 — 텍스트 추출 규칙이 바뀌거나(joinTextItems 개선)
// 옛 텍스트 레이어 기준으로 저장된 레코드면 같은 자리가 다른 글자를 가리킨다.
// 그래서 복원은 언제나 "오프셋 자리의 글자가 quote 와 같은가"를 먼저 확인하고,
// 다르면 quote 로 페이지 안을 다시 훑는다.

// 여러 번 나오는 인용문은 원래 저장 위치에 가장 가까운 것이 맞을 확률이 높다
// (같은 용어가 한 페이지에 여러 번 나오는 일은 흔하다).
function findNearestOccurrence(text, quote, hintOffset) {
  if (typeof text !== "string" || typeof quote !== "string" || !text || !quote) return -1;
  const hint = Number.isFinite(hintOffset) ? hintOffset : 0;
  let best = -1;
  let bestDist = Infinity;
  let from = 0;
  for (;;) {
    const at = text.indexOf(quote, from);
    if (at === -1) break;
    const dist = Math.abs(at - hint);
    if (dist < bestDist) {
      bestDist = dist;
      best = at;
    }
    from = at + 1;
  }
  return best;
}

// 연속 공백을 하나로 줄인 뒤 다시 찾아본다. 읽기 모드와 텍스트 레이어는
// 띄어쓰기를 넣는 규칙이 달라서, 같은 문장인데 공백 개수만 다른 경우가 있다.
function findLooseOccurrence(text, quote, hintOffset) {
  const collapsed = quote.replace(/\s+/g, " ").trim();
  if (!collapsed || collapsed === quote) return -1;
  return findNearestOccurrence(text, collapsed, hintOffset);
}

// 겹친 하이라이트는 한 범위로 합쳐서 그린다. 겹친 채로 하나씩 감싸면 먼저 감싼
// mark 가 텍스트 노드를 쪼개 뒤 범위의 오프셋 맵이 무효가 되고(surroundContents
// 가 예외를 던진다), 그 한 건이 문서 전체 복원을 막았다.
// 반환: [{startOffset, endOffset, records[], primary}] — startOffset 오름차순, 서로 안 겹침.
// primary 는 그룹에서 가장 나중에 만든 레코드(createdAt, 없으면 id 순) — 사용자가
// 마지막으로 고른 색이 보이도록 렌더가 이것을 대표로 쓴다.
function mergeOverlappingRanges(records) {
  const valid = (records || [])
    .filter((r) => r && Number.isFinite(Number(r.startOffset)) && Number.isFinite(Number(r.endOffset)) && Number(r.endOffset) > Number(r.startOffset))
    .map((r) => ({ record: r, start: Number(r.startOffset), end: Number(r.endOffset) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const item of valid) {
    const last = merged[merged.length - 1];
    if (last && item.start < last.endOffset) {
      last.endOffset = Math.max(last.endOffset, item.end);
      last.records.push(item.record);
    } else {
      merged.push({ startOffset: item.start, endOffset: item.end, records: [item.record] });
    }
  }
  const createdKey = (r) => {
    const t = Date.parse(r.createdAt);
    return Number.isFinite(t) ? t : -Infinity;
  };
  for (const group of merged) {
    group.primary = group.records.reduce((best, r) => {
      const d = createdKey(r) - createdKey(best);
      if (d > 0) return r;
      if (d < 0 || Number.isNaN(d)) return best;
      return String(r.id) > String(best.id) ? r : best;
    });
  }
  return merged;
}

// 재탐색으로 옮긴 앵커를 되저장해도 되는지. 공백을 뺀 인용문이 너무 짧으면
// (예: "값", "p<") 같은 글자가 페이지에 여러 번 나와 엉뚱한 자리를 짚었을
// 가능성이 커서, 그 결과를 저장해 굳히지 않는다.
function shouldPersistReanchor(quoteText) {
  if (typeof quoteText !== "string") return false;
  return quoteText.replace(/\s+/g, "").length >= 4;
}

const ANNOTATION_LOST = { startOffset: null, endOffset: null, status: "lost" };

// status: "offset"(오프셋 그대로) | "quote"(재탐색으로 살림) | "lost"(못 찾음)
function resolveAnnotationAnchor(pageText, anchor) {
  if (typeof pageText !== "string" || !pageText || !anchor) return ANNOTATION_LOST;
  const start = Number(anchor.startOffset);
  const end = Number(anchor.endOffset);
  const quote = typeof anchor.quoteText === "string" ? anchor.quoteText : "";
  const inRange = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= pageText.length;

  if (quote) {
    if (inRange && pageText.slice(start, end) === quote) {
      return { startOffset: start, endOffset: end, status: "offset" };
    }
    const hint = Number.isFinite(start) ? start : 0;
    const at = findNearestOccurrence(pageText, quote, hint);
    if (at !== -1) return { startOffset: at, endOffset: at + quote.length, status: "quote" };
    const collapsed = quote.replace(/\s+/g, " ").trim();
    const loose = findLooseOccurrence(pageText, quote, hint);
    if (loose !== -1) return { startOffset: loose, endOffset: loose + collapsed.length, status: "quote" };
    return ANNOTATION_LOST;
  }

  // quote 가 없던 아주 옛 레코드. 범위가 이 페이지 안이면 그대로 믿는 수밖에 없고,
  // 페이지 길이를 넘으면 다른 좌표계에서 온 값이므로 버린다.
  if (inRange) return { startOffset: start, endOffset: end, status: "offset" };
  return ANNOTATION_LOST;
}

// 원본 보기에서 선택한 글을 읽기 모드 본문에서 다시 찾는다. 줄바꿈·공백 차이는
// 무시하고(공백을 하나로 접어 비교) 못 찾으면 앞 20글자로 재시도한다.
// 반환: 본문(bodyText) 기준 { start, end } 또는 null.
function findSelectionInText(bodyText, selected) {
  const body = String(bodyText || "");
  const want = String(selected || "").replace(/\s+/g, " ").trim();
  if (!body || !want) return null;
  // 공백을 접은 문자열과 원문 오프셋 대응표
  let collapsed = "";
  const map = [];
  let prevSpace = true;
  for (let i = 0; i < body.length; i++) {
    const isSpace = /\s/.test(body[i]);
    if (isSpace) {
      if (prevSpace) continue;
      collapsed += " ";
      map.push(i);
      prevSpace = true;
    } else {
      collapsed += body[i];
      map.push(i);
      prevSpace = false;
    }
  }
  const locate = (needle) => {
    if (!needle) return null;
    const at = collapsed.indexOf(needle);
    if (at === -1) return null;
    return { start: map[at], end: map[at + needle.length - 1] + 1 };
  };
  const exact = locate(want);
  if (exact) return exact;
  // 원본 화면의 텍스트 레이어는 줄 사이에 공백이 없고 읽기 화면은 줄바꿈이 있다.
  // 공백을 아예 뺀 문자열끼리 한 번 더 맞춰 본다(두 줄 이상 선택이 앞 20자로 줄어들지 않게).
  let bare = "";
  const bareMap = [];
  for (let i = 0; i < body.length; i++) {
    if (/\s/.test(body[i])) continue;
    bare += body[i];
    bareMap.push(i);
  }
  const bareWant = want.replace(/\s+/g, "");
  if (bareWant) {
    const at = bare.indexOf(bareWant);
    if (at !== -1) return { start: bareMap[at], end: bareMap[at + bareWant.length - 1] + 1 };
  }
  if (want.length > 20) return locate(want.slice(0, 20).trim());
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { findSelectionInText, englishGlossVerdict, assetVersionFromSrc, withAssetVersion, applySenseContextRule, applySenseToMatches, decodeDefChunk, senseStems, excludedRanges, isLineWrapFragment, needsBareCorroboration, filterDistantFieldMatches, estimateFieldGroups, fieldGroupOf, orderRangesForWrapping, findNearestOccurrence, resolveAnnotationAnchor, mergeOverlappingRanges, shouldPersistReanchor, buildCardUnits, orderNestedMatches, estimateDocumentFields, groupMatchesByField, sortMatches, orderTextItemsByColumn, buildPageOffsets, offsetToPageOffset, pageOffsetToGlobal, splitMatchesByPage, termsOnPage, escapeRegExp, matchTerms, matchTermsWithIndex, buildExactIndex, escapeHtml, buildHighlightedHtml, computeKeptSpans, termCardHTML, popoverHTML, wrapPageRange, buildOffsetMap, joinTextItems, decodeViewerIndex, defBucket, computeFitPageScale, clampPdfScale, clampPdfPageNumber, computeDocHash, collapseLetterSpacedHangul, textItemX, textItemY };
}

