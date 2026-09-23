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
    if (term.title_en) add(normalizeWord(term.title_en), term);
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

  // 자기를 진부분문자열로 품는 것 중 가장 긴 용어가 대표. A ⊃ B ⊃ C 일 때
  // C를 B가 아니라 A에 붙여 접기 단계가 두 겹이 되지 않게 한다.
  const repOf = new Map();
  list.forEach((short, i) => {
    const shortKey = norm(short);
    if (!shortKey) return;
    let rep = null;
    list.forEach((long, j) => {
      if (i === j) return;
      const longKey = norm(long);
      if (longKey.length <= shortKey.length || !longKey.includes(shortKey)) return;
      if (!rep || norm(rep).length < longKey.length) rep = long;
    });
    if (rep) repOf.set(short.slug, rep.slug);
  });

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
  for (const match of list) {
    const anchor = match.nestedUnder ? bySlug.get(match.nestedUnder) || match : match;
    (isPrimary(anchor) ? primary : others).push(match);
  }
  return { primary, others };
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

// Exact-match pass only: fast, synchronous, no fuzzy search. This is the
// primary matcher — cheap enough to run on documents of any size without
// blocking the page.
//
// Takes a pre-built exact index rather than building one internally, so
// callers matching many texts against the same dictionary (e.g. one page at
// a time for a multi-page PDF) build the index once and reuse it — building
// it per call turns an O(dictionary size) cost into O(pages * dictionary
// size), which is what made large-PDF analysis stall.
function matchTermsWithIndex(text, exactIndex) {
  const resultsMap = new Map();

  for (const [word, starts] of wordOccurrences(text)) {
    const hits = findExactMatches(word, exactIndex);
    if (!hits.length) continue;
    for (const hit of hits) {
      // 한 글자짜리 표제어("혈", "힘" 등)는 어떤 문서에서든 걸리는 잡음이라
      // 본문 한 글자와 우연히 같아도 용어로 치지 않는다.
      if (hit.matchedLength < 2) continue;
      for (const term of hit.candidates) {
        recordMatch(resultsMap, term, starts, hit.matchedLength, 0);
      }
    }
  }

  return sortMatches(resultsMap);
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

function joinTextItems(items, pageWidth) {
  const ordered = orderTextItemsByColumn(items, pageWidth);
  const NEWLINE = String.fromCharCode(10);
  let text = "";
  let prevItem = null;
  let prevEndX = 0;
  let prevY = 0;
  for (const item of ordered) {
    const str = item.str || "";
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
  return (data.terms || []).map(([slug, titleKo, titleEn, catIdx, common]) => ({
    slug,
    title_ko: titleKo || "",
    title_en: titleEn || "",
    categories: (catIdx || []).map((i) => categories[i]).filter(Boolean),
    common: common || 0,
  }));
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
// 반환: [{startOffset, endOffset, records[]}] — startOffset 오름차순, 서로 안 겹침.
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { orderRangesForWrapping, findNearestOccurrence, resolveAnnotationAnchor, mergeOverlappingRanges, shouldPersistReanchor, buildCardUnits, orderNestedMatches, estimateDocumentFields, groupMatchesByField, sortMatches, orderTextItemsByColumn, buildPageOffsets, offsetToPageOffset, pageOffsetToGlobal, splitMatchesByPage, termsOnPage, escapeRegExp, matchTerms, matchTermsWithIndex, buildExactIndex, escapeHtml, buildHighlightedHtml, computeKeptSpans, termCardHTML, popoverHTML, wrapPageRange, buildOffsetMap, joinTextItems, decodeViewerIndex, defBucket, computeFitPageScale, clampPdfScale, clampPdfPageNumber };
}

if (typeof document !== "undefined") {
  (function () {
    let cachedTerms = null;
    let exactIndex = null;
    let currentMatches = [];
    let lastPdfFilename = null;
    let currentDocHash = null;
    let pdfTextLayerDivs = [];
    let pdfDoc = null;
    let pdfScale = null; // null until the first render picks a fit-to-width value
    let pdfTextContentCache = new Map(); // page number -> pdf.js TextContent, reused across zoom re-renders
    let pdfSearchMatches = []; // [{mark}] in document order, rebuilt per search
    let pdfSearchIndex = -1;
    let annotationsCache = [];
    let pendingSelection = null;
    let activeMemo = null; // { record, marks }
    let pdfPageTexts = new Map(); // page number -> joined text
    let pdfPageTextList = []; // 페이지 순서대로의 텍스트(읽기 모드가 그리는 원본)
    let pdfPageOffsets = []; // buildPageOffsets 결과. 전체 오프셋 ↔ 페이지 변환용
    let pdfTermsByPage = new Map(); // termsOnPage 결과. 읽기 모드 패널 동기화용
    let readingPageObserver = null;
    let readingCurrentPage = 0;
    let pdfOriginalVisible = false; // "원본 보기" 토글 상태

    async function logPaperHistory(text) {
      try {
        const { supabase, getSession } = await import("./auth.js");
        const session = await getSession();
        if (!session) return;

        const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const title = lastPdfFilename
          ? `${lastPdfFilename}...`
          : `${text.trim().slice(0, 40)}...`;

        await supabase.from("tg_reading_history").insert({
          user_id: session.user.id,
          item_type: "paper",
          item_key: key,
          item_title: title,
        });
      }
      catch (err) {
        // History logging is a side-effect of viewing a paper, not the term
        // matching feature itself — a failure here (offline, blocked CDN,
        // no session) must never clobber the already-rendered match results.
        console.error("[logPaperHistory]", err);
      }
    }

    const textarea = document.getElementById("paper-text");
    const findBtn = document.getElementById("find-terms-btn");
    const inputPane = document.getElementById("viewer-input-pane");
    const renderedPane = document.getElementById("viewer-rendered");

    // 5단계 "무음 실패 0": 저장·불러오기 실패처럼 사용자가 알아야 하는 일은
    // #pdf-status(aria-live) 에 한 줄로 띄운다. 진행 상황 메시지와 같은 자리를
    // 쓰므로, 렌더가 끝난 뒤에만 부르고 잠시 뒤 스스로 사라진다.
    let pdfNoticeTimer = null;
    function showPdfNotice(message, holdMs) {
      const el = document.getElementById("pdf-status");
      if (!el) return;
      el.textContent = message;
      el.hidden = false;
      clearTimeout(pdfNoticeTimer);
      pdfNoticeTimer = setTimeout(() => {
        if (el.textContent === message) el.hidden = true;
      }, holdMs || PDF_NOTICE_HOLD_MS);
    }
    const editTextBtn = document.getElementById("edit-text-btn");
    const filterInput = document.getElementById("term-filter");
    const countHeading = document.getElementById("matched-count");
    const termsList = document.getElementById("matched-terms");
    const categoryFilterSelect = document.getElementById("category-filter-select");
    const englishOnlyFilter = document.getElementById("english-only-filter");
    const showHiddenTermsBtn = document.getElementById("show-hidden-terms-btn");

    // "이 용어 숨기기" is per-browser, not per-account — no login required to
    // stop seeing terms the reader already knows well.
    const HIDDEN_TERMS_KEY = "viewerHiddenTermSlugs";
    function loadHiddenSlugs() {
      try {
        return new Set(JSON.parse(localStorage.getItem(HIDDEN_TERMS_KEY) || "[]"));
      } catch (err) {
        return new Set();
      }
    }
    function saveHiddenSlugs(slugs) {
      try {
        localStorage.setItem(HIDDEN_TERMS_KEY, JSON.stringify([...slugs]));
      } catch (err) {
        // Storage unavailable (private browsing, quota) — filtering still
        // works for this session, it just won't persist. Not worth surfacing.
      }
    }
    let hiddenSlugs = loadHiddenSlugs();

    // Sidebar tabs (찾은 용어 / 내 메모)
    const tabButtons = document.querySelectorAll(".viewer-tab");
    const tabPanels = {
      terms: document.getElementById("tab-panel-terms"),
      notes: document.getElementById("tab-panel-notes"),
    };
    const notesBadge = document.getElementById("notes-count-badge");
    const noteList = document.getElementById("note-list");
    const notesEmptyMsg = document.getElementById("notes-empty-msg");

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
        const tab = btn.dataset.tab;
        Object.entries(tabPanels).forEach(([key, panel]) => {
          if (panel) panel.hidden = key !== tab;
        });
      });
    });

    // Highlight color toolbar + memo popover
    const highlightToolbar = document.getElementById("highlight-toolbar");
    const memoPopover = document.getElementById("memo-popover");
    const memoTextarea = document.getElementById("memo-textarea");
    const memoSaveBtn = document.getElementById("memo-save-btn");
    const memoDeleteBtn = document.getElementById("memo-delete-btn");

    function hideHighlightToolbar() {
      if (highlightToolbar) highlightToolbar.hidden = true;
      pendingSelection = null;
    }

    function showHighlightToolbar(rect) {
      if (!highlightToolbar) return;
      highlightToolbar.hidden = false;
      const top = Math.max(8, rect.top - highlightToolbar.offsetHeight - 8);
      const left = Math.min(
        Math.max(8, rect.left + rect.width / 2 - highlightToolbar.offsetWidth / 2),
        window.innerWidth - highlightToolbar.offsetWidth - 8
      );
      highlightToolbar.style.top = `${top}px`;
      highlightToolbar.style.left = `${left}px`;
    }

    function hideMemoPopover() {
      if (memoPopover) memoPopover.hidden = true;
      activeMemo = null;
    }

    function showMemoPopover(record, marks, anchorRect) {
      if (!memoPopover) return;
      activeMemo = { record, marks: Array.from(marks) };
      memoTextarea.value = record.note || "";
      memoPopover.hidden = false;
      const rect = anchorRect || (marks[0] && marks[0].getBoundingClientRect());
      if (rect) {
        const top = Math.min(rect.bottom + 8, window.innerHeight - memoPopover.offsetHeight - 8);
        const left = Math.min(
          Math.max(8, rect.left),
          window.innerWidth - memoPopover.offsetWidth - 8
        );
        memoPopover.style.top = `${Math.max(8, top)}px`;
        memoPopover.style.left = `${left}px`;
      }
      memoTextarea.focus();
    }

    if (highlightToolbar) {
      highlightToolbar.addEventListener("click", async (e) => {
        const btn = e.target.closest(".hl-color");
        if (!btn || !pendingSelection) return;
        const { container, page, range, quoteText } = pendingSelection;
        const color = btn.dataset.color;
        hideHighlightToolbar();
        window.getSelection().removeAllRanges();

        // 읽기 모드 DOM 은 텍스트 노드가 곧 페이지 텍스트다(buildHighlightedHtml
        // 이 글자를 더하거나 빼지 않는다). 그래서 오프셋 맵도 텍스트 노드 기준.
        const { text: containerText, map } = buildTextNodeOffsetMap(container);
        const startEntry = map.find((entry) => entry.node === range.startContainer);
        const endEntry = map.find((entry) => entry.node === range.endContainer);
        if (!startEntry || !endEntry) return;
        let startOffset = startEntry.start + range.startOffset;
        let endOffset = endEntry.start + range.endOffset;
        if (endOffset <= startOffset) return;

        // 기존 하이라이트를 물고 있는 선택도 막지 않는다. 대신 저장 전에 겹친
        // 것들을 한 범위로 합친다 — 겹친 레코드를 둘 다 남기면 다음에 열 때
        // 감싸기가 깨진다(Critical-1과 같은 원인).
        const overlapped = annotationsCache.filter(
          (a) => !a.lost && a.page === page && Number(a.endOffset) > startOffset && Number(a.startOffset) < endOffset
        );
        let mergedQuote = quoteText;
        if (overlapped.length) {
          for (const a of overlapped) {
            startOffset = Math.min(startOffset, Number(a.startOffset));
            endOffset = Math.max(endOffset, Number(a.endOffset));
          }
          mergedQuote = containerText.slice(startOffset, endOffset) || quoteText;
        }

        const { createAnnotation, deleteAnnotation } = await import("./pdf-annotations.js");
        for (const old of overlapped) {
          try {
            await deleteAnnotation(currentDocHash, old.id);
          } catch (err) {
            console.error("[deleteAnnotation/merge]", err);
          }
          annotationsCache = annotationsCache.filter((a) => a.id !== old.id);
          container
            .querySelectorAll(`mark.user-mark[data-annotation-id="${CSS.escape(String(old.id))}"]`)
            .forEach(unwrapMark);
        }

        let record = null;
        try {
          record = await createAnnotation(currentDocHash, lastPdfFilename, {
            page,
            startOffset,
            endOffset,
            quoteText: mergedQuote,
            color,
            note: "",
          });
        } catch (err) {
          console.error("[createAnnotation]", err);
        }
        if (!record) {
          showPdfNotice("하이라이트를 저장하지 못했습니다. 저장 공간이 가득 찼거나 차단된 상태일 수 있습니다.");
          return;
        }

        // map 을 넘기지 않으면 wrapPageRange 가 텍스트 레이어용 span 기반
        // buildOffsetMap 으로 떨어져 읽기 모드에서는 빈 맵이 된다(하이라이트 0개).
        // 겹친 것을 걷어내면(unwrapMark → normalize) 위에서 만든 map 의 텍스트
        // 노드가 더 이상 DOM 에 없다. 그 경우에는 맵을 다시 만든다.
        const wrapMap = overlapped.length ? buildTextNodeOffsetMap(container).map : map;
        const marks = wrapPageRange(container, startOffset, endOffset, () => {
          const mark = document.createElement("mark");
          mark.className = "user-mark";
          mark.dataset.color = color;
          mark.dataset.annotationId = String(record.id);
          return mark;
        }, wrapMap);

        annotationsCache.push(record);
        renderNotesList();
        if (marks.length) showMemoPopover(record, marks);
      });
    }

    if (memoSaveBtn) {
      memoSaveBtn.addEventListener("click", async () => {
        if (!activeMemo) return;
        const { record } = activeMemo;
        const note = memoTextarea.value.trim();
        const { updateAnnotationNote } = await import("./pdf-annotations.js");
        let ok = false;
        try {
          ok = await updateAnnotationNote(currentDocHash, record.id, note);
        } catch (err) {
          console.error("[updateAnnotationNote]", err);
        }
        if (!ok) showPdfNotice("메모를 저장하지 못했습니다. 화면에는 반영했지만 다음에 열면 사라질 수 있습니다.");
        record.note = note;
        renderNotesList();
        hideMemoPopover();
      });
    }

    if (memoDeleteBtn) {
      memoDeleteBtn.addEventListener("click", async () => {
        if (!activeMemo) return;
        const { record, marks } = activeMemo;
        const { deleteAnnotation } = await import("./pdf-annotations.js");
        let deleted = false;
        try {
          deleted = await deleteAnnotation(currentDocHash, record.id);
        } catch (err) {
          console.error("[deleteAnnotation]", err);
        }
        if (!deleted) showPdfNotice("하이라이트를 지우지 못했습니다. 다음에 열면 다시 나타날 수 있습니다.");
        annotationsCache = annotationsCache.filter((a) => a.id !== record.id);
        marks.forEach(unwrapMark);
        renderNotesList();
        hideMemoPopover();
      });
    }

    function noteCardHTML(record) {
      const noteText = record.note
        ? `<p class="note-card-memo">${escapeHtml(record.note)}</p>`
        : `<p class="note-card-memo note-card-memo-empty">메모 없음</p>`;
      // 본문에서 자리를 못 찾은 메모도 목록에는 남긴다 — 조용히 버리면
      // 사용자는 메모가 사라진 것으로 본다(5단계 요구사항).
      const lost = record.lost
        ? `<span class="note-card-lost">본문에서 위치를 못 찾음</span>`
        : "";
      return `<li class="note-card${record.lost ? " note-card-is-lost" : ""}" data-id="${escapeHtml(String(record.id))}">
        <span class="note-card-dot" data-color="${escapeHtml(record.color)}"></span>
        <div class="note-card-body">
          <p class="note-card-quote">${escapeHtml(record.quoteText || "")}</p>
          ${noteText}
          <span class="note-card-page">p.${record.page}</span>${lost}
        </div>
      </li>`;
    }

    function renderNotesList() {
      if (!noteList) return;
      noteList.innerHTML = annotationsCache.map(noteCardHTML).join("");
      if (notesBadge) {
        notesBadge.hidden = annotationsCache.length === 0;
        notesBadge.textContent = String(annotationsCache.length);
      }
      if (notesEmptyMsg) notesEmptyMsg.hidden = annotationsCache.length > 0;
    }

    if (noteList) {
      noteList.addEventListener("click", (e) => {
        const card = e.target.closest(".note-card");
        if (!card) return;
        const id = card.dataset.id;
        const mark = document.querySelector(`#viewer-rendered mark.user-mark[data-annotation-id="${CSS.escape(id)}"]`);
        if (!mark) {
          // 위치를 못 찾은 메모는 본문에 표시가 없다. 아무 반응이 없으면
          // "클릭이 안 먹는다"로 읽히므로 이유를 적어 준다.
          showPdfNotice("이 메모는 본문에서 위치를 찾지 못했습니다.");
          return;
        }
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        mark.classList.add("mark-flash");
        setTimeout(() => mark.classList.remove("mark-flash"), MARK_FLASH_MS);
      });
    }

    // 5단계부터 하이라이트는 읽기 모드(#viewer-rendered)에만 그린다. 원본
    // 보기(canvas + 텍스트 레이어)는 표시 자리를 신뢰할 수 없어 세 번 걷어낸
    // 경로다 — 선택은 되지만 새 하이라이트도 만들지 않고 기존 것도 안 그린다.
    function readingPageBody(page) {
      if (!renderedPane || !renderedPane.classList.contains("pdf-reading")) return null;
      const section = renderedPane.querySelector(`section.pdf-page-text[data-page="${page}"]`);
      return section ? section.querySelector(".pdf-page-text-body") : null;
    }

    // 캐시에 있는 하이라이트를 읽기 모드 DOM 에 다시 그린다. renderReadingPane
    // 이 innerHTML 을 새로 쓰면 mark 가 전부 날아가므로 그 뒤에 부른다.
    function renderAnnotationMarks() {
      if (!renderedPane || !renderedPane.classList.contains("pdf-reading")) return;
      const byPage = new Map();
      for (const record of annotationsCache) {
        if (record.lost) continue;
        if (!byPage.has(record.page)) byPage.set(record.page, []);
        byPage.get(record.page).push(record);
      }
      for (const [page, records] of byPage) {
        const body = readingPageBody(page);
        if (!body) continue;
        // 오프셋 맵은 페이지마다 한 번만 만들고, 뒤(큰 오프셋)에서부터 감싼다.
        // wrapPageRange 가 요구하는 불변식이다(앞을 먼저 감싸면 노드가 갈라져
        // 뒤쪽 map 항목이 무효가 된다).
        const map = buildTextNodeOffsetMap(body).map;
        // 겹친 것끼리 먼저 합친다 — 겹친 채로 각각 감싸면 두 번째가 예외를 던지고,
        // 예전에는 그 예외가 loadAndRenderAnnotations 까지 올라가 문서가 안 열렸다.
        const groups = orderRangesForWrapping(
          mergeOverlappingRanges(records).sort((a, b) => b.startOffset - a.startOffset)
        );
        for (const group of groups) {
          // 대표는 가장 나중에 만든 것(= 사용자가 마지막으로 고른 색).
          const rep = group.records[group.records.length - 1];
          try {
            wrapPageRange(body, group.startOffset, group.endOffset, () => {
              const mark = document.createElement("mark");
              mark.className = "user-mark";
              mark.dataset.color = rep.color;
              mark.dataset.annotationId = String(rep.id);
              return mark;
            }, map);
          } catch (err) {
            // 한 건이 실패해도 나머지 하이라이트와 문서 열기는 계속돼야 한다.
            console.error("[renderAnnotationMarks]", err);
          }
        }
      }
    }

    // 옛 저장분(텍스트 레이어 좌표)·추출 규칙이 바뀐 뒤의 저장분을 읽기 모드
    // 페이지 텍스트 기준으로 다시 앵커한다. 재탐색으로 살린 것은 곧바로 다시
    // 저장해 다음에 열 때는 오프셋 한 번으로 끝나게 한다.
    // docHash 는 호출 시점의 문서를 고정해 둔 값이다. 재탐색 도중 사용자가 다른
    // 문서를 열면 currentDocHash 가 바뀌는데, 그때 남은 await 가 이어서 저장하면
    // 이전 문서의 앵커가 새 문서 해시로 들어간다(문서 전환 레이스).
    async function reanchorAnnotations(docHash) {
      if (!annotationsCache.length) return { lost: 0, moved: 0 };
      let mod = null;
      let lost = 0;
      let moved = 0;
      for (const record of annotationsCache) {
        if (currentDocHash !== docHash) return { lost, moved };
        const pageText = pdfPageTextList[record.page - 1] || "";
        const res = resolveAnnotationAnchor(pageText, record);
        if (res.status === "lost") {
          record.lost = true;
          lost++;
          continue;
        }
        record.lost = false;
        if (res.status === "offset") continue;
        record.startOffset = res.startOffset;
        record.endOffset = res.endOffset;
        record.quoteText = pageText.slice(res.startOffset, res.endOffset);
        moved++;
        // 너무 짧은 인용문(공백 제외 4글자 미만)은 한 페이지에 우연히 같은 글자가
        // 여러 번 나와 엉뚱한 자리를 짚었을 수 있다. 화면에는 그리되 되저장하지
        // 않는다 — 다음에 열 때 다시 재탐색하는 편이 오염보다 낫다.
        if (!shouldPersistReanchor(record.quoteText)) continue;
        try {
          if (!mod) mod = await import("./pdf-annotations.js");
          if (currentDocHash !== docHash) return { lost, moved };
          await mod.updateAnnotationAnchor(docHash, record.id, record);
        } catch (err) {
          // 저장에 실패해도 이번 세션 화면에는 제대로 그려진다. 다음에 열 때
          // 같은 재탐색을 한 번 더 하면 그만이라 문구까지 띄우지는 않는다.
          console.error("[reanchorAnnotations]", err);
        }
      }
      return { lost, moved };
    }

    async function loadAndRenderAnnotations() {
      // 문서를 고정해 둔다. 아래 await 사이에 다른 문서를 열면 이 실행분의
      // 나머지는 남의 문서에 하이라이트를 그리거나 저장하게 된다.
      const docHash = currentDocHash;
      if (!docHash) return;
      let loaded = null;
      try {
        const { loadAnnotations } = await import("./pdf-annotations.js");
        loaded = await loadAnnotations(docHash);
      } catch (err) {
        console.error("[loadAnnotations]", err);
        if (currentDocHash !== docHash) return;
        annotationsCache = [];
        showPdfNotice("저장해 둔 하이라이트·메모를 불러오지 못했습니다.");
        renderNotesList();
        return;
      }
      if (currentDocHash !== docHash) return;
      annotationsCache = loaded;
      // 복원 중의 어떤 예외도 handlePdfFile 의 "열지 못했습니다" 경로로 올라가면
      // 안 된다 — 하이라이트 한 건 때문에 문서 전체를 못 여는 것이 5단계 리뷰의
      // 가장 큰 문제였다.
      try {
        const { lost } = await reanchorAnnotations(docHash);
        if (currentDocHash !== docHash) return;
        renderAnnotationMarks();
        renderNotesList();
        if (lost > 0) {
          showPdfNotice(`메모 ${lost}개는 본문에서 위치를 찾지 못해 '내 메모' 탭에만 남겼습니다.`);
        }
      } catch (err) {
        console.error("[loadAndRenderAnnotations]", err);
        if (currentDocHash !== docHash) return;
        renderNotesList();
        showPdfNotice("하이라이트를 본문에 표시하지 못했습니다. '내 메모' 탭에서는 볼 수 있습니다.");
      }
    }

    // Delegate clicks on existing user highlights to reopen the memo popover.
    if (renderedPane) {
      renderedPane.addEventListener("click", (e) => {
        const mark = e.target.closest("mark.user-mark");
        if (!mark) return;
        const id = mark.dataset.annotationId;
        const record = annotationsCache.find((a) => String(a.id) === String(id));
        if (!record) return;
        const marks = renderedPane.querySelectorAll(
          `mark.user-mark[data-annotation-id="${CSS.escape(id)}"]`
        );
        showMemoPopover(record, marks, mark.getBoundingClientRect());
      });
    }

    // The highlight-color toolbar must only appear after an actual click-
    // and-drag text selection — not a plain click (which collapses any
    // selection anyway) and not a double-click word-select, which produces
    // a non-collapsed selection with zero mouse movement. Tracking the
    // mousedown position and gating on a minimum drag distance is what
    // "collapsed" alone can't catch.
    let pdfMouseDownPos = null;
    if (renderedPane) {
      renderedPane.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        pdfMouseDownPos = { x: e.clientX, y: e.clientY };
      });
    }

    // Right-click-drag to pan: once fit-to-width no longer guarantees the
    // whole page is visible (zoomed in past 100%), scrollbars alone are a
    // clumsy way to navigate — grab-and-drag with the right button (left
    // button is already spoken for by text selection) is the control most
    // image/PDF viewers offer for this.
    {
      const viewerEl = document.getElementById("pdf-viewer");
      let panState = null;
      viewerEl.addEventListener("contextmenu", (e) => e.preventDefault());
      viewerEl.addEventListener("mousedown", (e) => {
        if (e.button !== 2) return;
        e.preventDefault();
        panState = { x: e.clientX, y: e.clientY, scrollLeft: viewerEl.scrollLeft, scrollTop: viewerEl.scrollTop };
        viewerEl.classList.add("pdf-panning");
      });
      document.addEventListener("mousemove", (e) => {
        if (!panState) return;
        viewerEl.scrollLeft = panState.scrollLeft - (e.clientX - panState.x);
        viewerEl.scrollTop = panState.scrollTop - (e.clientY - panState.y);
      });
      document.addEventListener("mouseup", (e) => {
        if (e.button !== 2 || !panState) return;
        panState = null;
        viewerEl.classList.remove("pdf-panning");
      });
    }

    // 하이라이트는 읽기 모드에서만 만든다. 원본 보기(캔버스)에서는 드래그
    // 선택은 되지만 색 툴바가 뜨지 않는다 — 텍스트 레이어 좌표에 표시를 얹는
    // 방식이 계속 어긋났기 때문에 표시 자체를 읽기 모드로 일원화했다.
    if (renderedPane) {
      renderedPane.addEventListener("mouseup", (e) => {
        const downPos = pdfMouseDownPos;
        pdfMouseDownPos = null;
        const dragDistance = downPos ? Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) : 0;
        setTimeout(() => {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed || sel.rangeCount === 0 || dragDistance < 4) {
            hideHighlightToolbar();
            return;
          }
          const range = sel.getRangeAt(0);
          const anchorEl =
            range.commonAncestorContainer.nodeType === 1
              ? range.commonAncestorContainer
              : range.commonAncestorContainer.parentElement;
          const section = anchorEl && anchorEl.closest("section.pdf-page-text");
          if (!section) {
            hideHighlightToolbar();
            return;
          }
          // 선택이 페이지 경계를 넘으면 앵커가 한 페이지에 담기지 않는다.
          const body = section.querySelector(".pdf-page-text-body");
          const quoteText = range.toString().trim();
          if (!body || !body.contains(range.startContainer) || !body.contains(range.endContainer) || !quoteText) {
            hideHighlightToolbar();
            return;
          }
          pendingSelection = {
            container: body,
            page: Number(section.dataset.page),
            range: range.cloneRange(),
            quoteText,
          };
          showHighlightToolbar(range.getBoundingClientRect());
        }, 0);
      });
    }

    document.addEventListener("mousedown", (e) => {
      if (highlightToolbar && !highlightToolbar.hidden && !highlightToolbar.contains(e.target)) {
        hideHighlightToolbar();
      }
      if (memoPopover && !memoPopover.hidden && !memoPopover.contains(e.target) && !e.target.closest("mark.user-mark")) {
        hideMemoPopover();
      }
    });

    textarea.addEventListener("input", () => {
      findBtn.disabled = textarea.value.trim().length === 0;
    });

    async function loadTerms() {
      if (cachedTerms) return cachedTerms;
      // terms-lite.json(16MB)에서 viewer-index.json(2.7MB)으로 갈아탔다.
      // 매칭에 필요한 slug/title_ko/title_en과 카테고리 필터용 categories만
      // 들어 있고, definition은 매칭된 용어 것만 loadDefinitions()가 채운다.
      const res = await fetch("viewer-index.json");
      // 404/500이면 res.json()의 SyntaxError 대신 명확한 에러로 던진다 —
      // 두 호출부(용어 찾기, PDF 업로드) 모두 try/catch로 사용자에게 안내한다.
      if (!res.ok) throw new Error(`용어 데이터 로드 실패 (HTTP ${res.status})`);
      cachedTerms = decodeViewerIndex(await res.json());
      exactIndex = buildExactIndex(cachedTerms);

      return cachedTerms;
    }

    // definition은 결과 카드에만 쓰이므로, 찾은 용어가 속한 청크만 받아 온다.
    // 청크는 한 번 받으면 세션 내내 재사용한다(같은 논문을 다시 분석하거나
    // 필터를 만질 때 다시 받지 않도록).
    const definitionCache = new Map(); // slug -> definition
    const loadedDefBuckets = new Set();
    let defLoadWarned = false; // 정의 청크 실패 문구는 문서당 한 번만
    async function loadDefinitions(slugs) {
      const needed = new Set();
      for (const slug of slugs) {
        const bucket = defBucket(slug);
        if (!loadedDefBuckets.has(bucket)) needed.add(bucket);
      }
      await Promise.all(
        [...needed].map(async (bucket) => {
          // 성공·실패와 무관하게 "시도했음"으로 표시한다 — 정의 하나 때문에
          // 매번 같은 404를 반복해서 때리지 않도록.
          loadedDefBuckets.add(bucket);
          try {
            const res = await fetch(`viewer-defs/${String(bucket).padStart(3, "0")}.json`);
            if (!res.ok) return;
            const map = await res.json();
            for (const [slug, definition] of Object.entries(map)) {
              definitionCache.set(slug, definition);
            }
          } catch (err) {
            // 정의는 부가 정보라 용어 목록 자체는 그대로 보여준다. 다만 뜻이
            // 비어 보이는 이유는 알려야 한다(5단계 "무음 실패 0").
            console.error("[loadDefinitions]", err);
            if (!defLoadWarned) {
              defLoadWarned = true;
              showPdfNotice("용어 뜻을 일부 불러오지 못했습니다. 잠시 뒤 새로고침해 보세요.");
            }
          }
        })
      );
    }

    // 매칭 결과(recordMatch가 만든 객체)에 definition을 채워 넣는다.
    async function attachDefinitions(matches) {
      if (!matches.length) return;
      await loadDefinitions(matches.map((m) => m.slug));
      for (const match of matches) {
        match.definition = definitionCache.get(match.slug) || "";
      }
    }
    // Writes the highlighted reading view into its own container and hides the
    // textarea behind it.
    //
    // This used to assign to inputPane.innerHTML, which wiped out everything
    // in #viewer-input-pane — the textarea, the PDF viewer, the "용어 찾기"
    // button and the PDF upload input all included. Running one text search
    // therefore removed the PDF upload control from the page entirely, so a
    // reader who pasted text first could never switch to a PDF afterwards.
    // Renders a read-only copy of the text with no inline highlighting.
    // Highlighting terms inline (both here and in the PDF text layer) was
    // removed: several rounds of position/word-boundary fixes still left
    // real documents surfacing new "highlight lands on the wrong stretch of
    // text" cases, so the exact position of a match in the original text
    // just isn't reliable enough to promise visually. The "찾은 용어"
    // sidebar list doesn't have that problem — it only needs to know a term
    // is present, not exactly where — so that's the one place terms are
    // still shown.
    // 위 주석의 "배경색 하이라이트"는 되살리지 않는다. 대신 매칭된 자리에는
    // 얇은 점선 밑줄만 그어 두고(style.css의 .dict-mark), 눌렀을 때만 뜻이
    // 뜨게 한다. 위치가 한 글자쯤 어긋나도 형광펜처럼 시끄럽지 않고, 읽는
    // 흐름을 끊지 않으면서 "여기 사전에 있는 말이 있다"만 알려주는 방식.
    // ── 업로드 진입(드래그앤드롭) ─────────────────────────────────────
    // 첫 화면에서만 보이는 영역이다. 본문이 뜬 뒤에도 남겨 두면 읽는 자리를
    // 차지하기만 한다.
    const dropzoneEl = document.getElementById("pdf-dropzone");

    function setDropzoneVisible(visible) {
      if (dropzoneEl) dropzoneEl.hidden = !visible;
    }

    if (dropzoneEl) {
      // 브라우저 기본 동작(파일을 그대로 열어 버림)을 막아야 drop이 우리에게 온다.
      for (const type of ["dragenter", "dragover"]) {
        dropzoneEl.addEventListener(type, (e) => {
          e.preventDefault();
          dropzoneEl.classList.add("dragover");
        });
      }
      for (const type of ["dragleave", "dragend"]) {
        dropzoneEl.addEventListener(type, () => dropzoneEl.classList.remove("dragover"));
      }
      dropzoneEl.addEventListener("drop", async (e) => {
        e.preventDefault();
        dropzoneEl.classList.remove("dragover");
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
          pdfStatus.hidden = false;
          pdfStatus.textContent = "PDF 파일만 열 수 있습니다.";
          return;
        }
        renderedPdfScale = null;
        await handlePdfFile(file);
      });
    }

    function renderRenderedPane(text) {
      if (!renderedPane) return;
      closeTermPopover();
      setDropzoneVisible(false);
      renderedPane.classList.remove("pdf-reading");
      const visible = currentMatches.filter((m) => !hiddenSlugs.has(m.slug));
      renderedPane.innerHTML = visible.length ? buildHighlightedHtml(text, visible) : escapeHtml(text);
      renderedPane.hidden = false;
      textarea.hidden = true;
      if (editTextBtn) editTextBtn.hidden = false;
    }

    // PDF 읽기 모드: 페이지별 텍스트를 <section data-page=N> 으로 흘리고,
    // 텍스트 모드와 똑같은 밑줄(dict-mark) HTML 을 쓴다. 표시 위치가 전부
    // 텍스트 오프셋에 걸려 있으므로 줌·재렌더·화면 폭과 무관하다 —
    // 텍스트 레이어 픽셀 위에 표시를 얹던 예전 방식이 틀어지던 이유를 피한다.
    function renderReadingPane() {
      if (!renderedPane || !pdfPageOffsets.length) return;
      closeTermPopover();
      const visible = currentMatches.filter((m) => !hiddenSlugs.has(m.slug));
      const byPage = splitMatchesByPage(visible, pdfPageOffsets);
      let html = "";
      for (const entry of pdfPageOffsets) {
        const pageText = pdfPageTextList[entry.page - 1] || "";
        const pageMatches = byPage.get(entry.page) || [];
        const body = pageMatches.length
          ? buildHighlightedHtml(pageText, pageMatches)
          : escapeHtml(pageText);
        html += `<section class="pdf-page-text" data-page="${entry.page}">` +
          `<div class="pdf-page-text-label">p.${entry.page}</div>` +
          `<div class="pdf-page-text-body">${body}</div></section>`;
      }
      renderedPane.innerHTML = html;
      renderedPane.classList.add("pdf-reading");
      renderedPane.hidden = false;
      textarea.hidden = true;
      setDropzoneVisible(false);
      // 패널 동기화용 표는 여기서 한 번만 만든다(스크롤 때 재계산 금지).
      pdfTermsByPage = termsOnPage(visible, pdfPageOffsets);
      readingCurrentPage = 0;
      setupReadingPageObserver();
      // innerHTML 을 새로 썼으므로 사용자 하이라이트도 다시 얹는다.
      renderAnnotationMarks();
      // PDF 모드에서는 "다시 입력"이 추출 텍스트를 편집하는 뜻이 되어 혼란스럽다.
      if (editTextBtn) editTextBtn.hidden = true;
    }

    // ── 읽기 모드 ↔ 용어 패널 동기화(4단계) ─────────────────────────────
    // 읽고 있는 페이지의 용어를 패널 맨 위에 따로 둔다. 페이지가 바뀔 때
    // 다시 그리는 것은 이 영역 하나뿐이다 — 분야 그룹까지 매번 다시 그리면
    // 스크롤이 눈에 띄게 끊긴다.
    const currentPageTermsEl = document.getElementById("current-page-terms");

    function renderCurrentPageTerms(page) {
      if (!currentPageTermsEl) return;
      readingCurrentPage = page || 0;
      const list = (pdfTermsByPage.get(readingCurrentPage) || []).filter((m) => !hiddenSlugs.has(m.slug));
      if (!list.length) {
        currentPageTermsEl.hidden = true;
        currentPageTermsEl.innerHTML = "";
        return;
      }
      currentPageTermsEl.hidden = false;
      currentPageTermsEl.innerHTML =
        `<h3 class="current-page-terms-title">이 페이지의 용어 (${list.length})</h3>` +
        `<ul class="current-page-terms-list">` +
        list
          .map((m) => {
            const repeat = m.pageCount > 1 ? ` <span class="current-page-term-count">${m.pageCount}번</span>` : "";
            return `<li><button type="button" class="current-page-term" data-slug="${escapeHtml(m.slug)}">` +
              `${escapeHtml(m.title_ko || m.slug)}${repeat}</button></li>`;
          })
          .join("") +
        `</ul>`;
    }

    if (currentPageTermsEl) {
      currentPageTermsEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".current-page-term");
        if (btn) scrollToMark(btn.dataset.slug);
      });
    }

    function setupReadingPageObserver() {
      if (readingPageObserver) readingPageObserver.disconnect();
      readingPageObserver = null;
      if (!renderedPane || !renderedPane.classList.contains("pdf-reading")) {
        renderCurrentPageTerms(0);
        return;
      }
      const sections = renderedPane.querySelectorAll("section.pdf-page-text");
      if (!sections.length) return;
      // 관찰자를 못 쓰는 환경에서는 첫 페이지 그룹만이라도 보여 준다.
      if (typeof IntersectionObserver === "undefined") {
        renderCurrentPageTerms(1);
        return;
      }
      const ratios = new Map();
      readingPageObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            ratios.set(Number(entry.target.dataset.page), entry.isIntersecting ? entry.intersectionRatio : 0);
          }
          let best = 0;
          let bestRatio = 0;
          for (const [page, ratio] of ratios) {
            if (ratio > bestRatio) {
              bestRatio = ratio;
              best = page;
            }
          }
          if (best && best !== readingCurrentPage) renderCurrentPageTerms(best);
        },
        { root: renderedPane, threshold: PAGE_OBSERVER_THRESHOLDS }
      );
      for (const section of sections) readingPageObserver.observe(section);
      renderCurrentPageTerms(1);
    }

    function showTextInput() {
      if (renderedPane) {
        renderedPane.hidden = true;
        renderedPane.innerHTML = "";
        renderedPane.classList.remove("pdf-reading");
      }
      textarea.hidden = false;
      if (editTextBtn) editTextBtn.hidden = true;
      // 읽기 모드가 사라졌으므로 페이지 동기화도 멈춘다.
      pdfTermsByPage = new Map();
      setupReadingPageObserver();
      setDropzoneVisible(!textarea.value.trim());
    }

// Populates the category dropdown with only the categories actually present
    // in this document's matches — no point offering 40 categories when the
    // paper only touched 3 of them.
    function populateCategoryFilterOptions(matches) {
      if (!categoryFilterSelect) return;
      const codes = new Set();
      // 용어마다 categories[0]이 대표 분야고 뒤는 덤으로 붙은 태그다(통계 용어에
      // "산업공학"이 딸려오는 식). 덤 태그까지 모으면 논문 하나에 분야 40개가
      // 떠서 "전체 분야"나 다름없어지므로 대표 분야만 선택지로 올린다.
      // 필터 자체는 아래에서 categories 전체를 보므로, 대표 분야를 고르면
      // 그 분야가 덤 태그로 붙은 용어도 함께 잡힌다.
      matches.forEach((m) => {
        const primary = (m.categories || [])[0];
        if (primary) codes.add(primary);
      });
      const previousValue = categoryFilterSelect.value;
      const labels = typeof CATEGORY_LABELS !== "undefined" ? CATEGORY_LABELS : {};
      categoryFilterSelect.innerHTML =
        `<option value="">전체 분야</option>` +
        [...codes]
          .sort((a, b) => (labels[a] || a).localeCompare(labels[b] || b))
          .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(labels[c] || c)}</option>`)
          .join("");
      if (codes.has(previousValue)) categoryFilterSelect.value = previousValue;
    }

    // A paper with many matches (a full-length thesis easily surfaces 30+)
    // used to dump every term card straight down the sidebar, one after
    // another, with no way to see how many more were below the fold. Only
    // the first page of cards renders up front, with a "더 보기" button
    // (matching the same pattern the term-list pages already use) to reveal
    // the rest a page at a time.

    const unitHTML = (unit) => termCardHTML(unit.match, unit.basics);

    // 다른 분야 용어는 숨기지 않고 접어서 맨 아래에 둔다. 분야 추정이
    // 틀렸을 때 사용자가 잃는 게 "한 번 펼치기"뿐이어야 한다(철회된
    // a4cdbf8d6은 아예 숨겨서 되돌려졌다).
    function otherFieldsHTML(units) {
      if (!units.length) return "";
      const count = units.reduce((n, u) => n + 1 + u.basics.length, 0);
      return `<li class="term-others"><details class="term-others-details">` +
        `<summary>다른 분야 (${count})</summary>` +
        `<ul class="term-others-list">${units.map(unitHTML).join("")}</ul>` +
        `</details></li>`;
    }

    function renderTermCardsPaged(filtered) {
      const existingMoreBtn = document.getElementById("term-card-more-btn");
      if (existingMoreBtn) existingMoreBtn.remove();

      if (!filtered.length) {
        termsList.innerHTML = `<li class="term-list-empty">조건에 맞는 용어가 없습니다.</li>`;
        return;
      }

      // 이 문서의 분야를 잡힌 용어 분포로 추정해 그 분야를 위로 올린다.
      const fields = estimateDocumentFields(filtered);
      const grouped = groupMatchesByField(filtered, fields);
      const primaryUnits = buildCardUnits(grouped.primary);
      const othersHTML = otherFieldsHTML(buildCardUnits(grouped.others));

      // 페이징은 대표 카드 수로 센다(기초 용어는 대표 카드 안에 접혀 있다).
      termsList.innerHTML = primaryUnits.slice(0, TERM_CARD_PAGE_SIZE).map(unitHTML).join("") +
        (primaryUnits.length > TERM_CARD_PAGE_SIZE ? "" : othersHTML);

      if (primaryUnits.length > TERM_CARD_PAGE_SIZE) {
        const moreBtn = document.createElement("button");
        moreBtn.type = "button";
        moreBtn.id = "term-card-more-btn";
        moreBtn.className = "term-list-more-btn";
        moreBtn.textContent = `${primaryUnits.length - TERM_CARD_PAGE_SIZE}개 더 보기`;
        moreBtn.addEventListener("click", () => {
          termsList.insertAdjacentHTML(
            "beforeend",
            primaryUnits.slice(TERM_CARD_PAGE_SIZE).map(unitHTML).join("") + othersHTML
          );
          moreBtn.remove();
        });
        termsList.insertAdjacentElement("afterend", moreBtn);
      }
    }

    function renderMatchedTerms(matches, filterQuery) {
      if (matches.length === 0) {
        countHeading.textContent = "본문에서 사전 등록된 용어를 찾지 못했습니다.";
        termsList.innerHTML = "";
        renderCurrentPageTerms(0);
        if (showHiddenTermsBtn) showHiddenTermsBtn.hidden = true;
        return;
      }

      populateCategoryFilterOptions(matches);

      const q = (filterQuery || "").trim().toLowerCase();
      const categoryCode = categoryFilterSelect ? categoryFilterSelect.value : "";
      const englishOnly = englishOnlyFilter ? englishOnlyFilter.checked : false;
      const hiddenCount = matches.filter((m) => hiddenSlugs.has(m.slug)).length;

      const filtered = matches.filter((m) => {
        if (hiddenSlugs.has(m.slug)) return false;
        if (q && !(m.title_ko.toLowerCase().includes(q) || (m.title_en || "").toLowerCase().includes(q))) return false;
        if (categoryCode && !(m.categories || []).includes(categoryCode)) return false;
        // Nearly every dictionary entry carries *some* title_en gloss for
        // reference, even purely Korean-context terms (e.g. "단가" has
        // title_en "Danga (Pansori Prelude Song)") — so "!m.title_en" almost
        // never filtered anything out. "영어 용어만" means the term itself is
        // an English word/acronym (SPSS, ANOVA, PDF), which shows up as a
        // title_ko written in Latin script, not a Korean word with an
        // English gloss attached.
        if (englishOnly && /[가-힣]/.test(m.title_ko)) return false;
        return true;
      });

      countHeading.textContent = `이 논문에 나온 용어 (${matches.length}개)`;
      renderTermCardsPaged(filtered);
      renderCurrentPageTerms(readingCurrentPage);

      if (showHiddenTermsBtn) {
        showHiddenTermsBtn.hidden = hiddenCount === 0;
        showHiddenTermsBtn.textContent = hiddenCount ? `숨긴 용어 ${hiddenCount}개 다시 보기` : "";
      }
    }

    // ── 본문 안에서 바로 뜻 보기(팝오버) ───────────────────────────────
    // 팝오버는 항상 한 개만 떠 있게 모듈 안에 하나만 만들어 재사용한다.
    let popoverEl = null;
    let popoverAnchor = null;

    function ensurePopoverEl() {
      if (popoverEl) return popoverEl;
      popoverEl = document.createElement("div");
      popoverEl.className = "dict-popover";
      popoverEl.setAttribute("role", "dialog");
      popoverEl.hidden = true;
      // 팝오버 안을 클릭했을 때 바깥 클릭 감지에 걸려 닫히지 않도록 차단.
      popoverEl.addEventListener("click", (e) => {
        if (e.target.closest(".dict-popover-close")) {
          closeTermPopover();
          return;
        }
        e.stopPropagation();
      });
      document.body.appendChild(popoverEl);
      return popoverEl;
    }

    function closeTermPopover() {
      if (!popoverEl || popoverEl.hidden) return;
      popoverEl.hidden = true;
      popoverEl.innerHTML = "";
      if (popoverAnchor) popoverAnchor.classList.remove("dict-mark-active");
      popoverAnchor = null;
    }

    function findMatchBySlug(slug) {
      return currentMatches.find((m) => m.slug === slug) || null;
    }

    // 화면 밖으로 잘리지 않게 mark 아래(공간이 없으면 위)에 놓고 좌우를 보정.
    // 좁은 화면에서는 CSS가 아래쪽 고정 시트로 바꿔 놓으므로 계산을 건너뛴다.
    function positionPopover(mark) {
      const isSheet = window.matchMedia("(max-width: 480px)").matches;
      popoverEl.classList.toggle("dict-popover-sheet", isSheet);
      if (isSheet) {
        popoverEl.style.left = "";
        popoverEl.style.top = "";
        return;
      }
      const rect = mark.getBoundingClientRect();
      const pop = popoverEl.getBoundingClientRect();
      const margin = 8;
      let left = rect.left;
      if (left + pop.width > window.innerWidth - margin) left = window.innerWidth - pop.width - margin;
      if (left < margin) left = margin;
      let top = rect.bottom + 6;
      if (top + pop.height > window.innerHeight - margin) {
        const above = rect.top - pop.height - 6;
        top = above >= margin ? above : Math.max(margin, window.innerHeight - pop.height - margin);
      }
      popoverEl.style.left = `${Math.round(left)}px`;
      popoverEl.style.top = `${Math.round(top)}px`;
    }

    function openTermPopover(mark) {
      const match = findMatchBySlug(mark.dataset.slug);
      if (!match) return;
      const covered = (mark.dataset.covers || "")
        .split(/\s+/)
        .filter(Boolean)
        .map(findMatchBySlug)
        .filter((m) => m && !hiddenSlugs.has(m.slug));
      closeTermPopover();
      const el = ensurePopoverEl();
      const basics = (match.basics || []).map(findMatchBySlug).filter((m) => m && !hiddenSlugs.has(m.slug));
      el.setAttribute("aria-label", `${match.title_ko || match.slug} 뜻 풀이`);
      el.innerHTML = popoverHTML(match, covered, { count: match.count, basics });
      el.hidden = false;
      popoverAnchor = mark;
      mark.classList.add("dict-mark-active");
      positionPopover(mark);
    }

    // 본문(텍스트 모드)과 PDF 텍스트 레이어 양쪽에서 같은 핸들러를 쓴다.
    document.addEventListener("click", (e) => {
      const mark = e.target.closest && e.target.closest(".dict-mark");
      if (mark && (mark.closest(".viewer-rendered") || mark.closest("#pdf-viewer"))) {
        e.preventDefault();
        openTermPopover(mark);
        return;
      }
      if (!e.target.closest || !e.target.closest(".dict-popover")) closeTermPopover();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeTermPopover();
    });

    // 스크롤하면 mark가 움직이므로 따라다니게 하지 않고 그냥 닫는다.
    window.addEventListener("scroll", closeTermPopover, true);
    window.addEventListener("resize", closeTermPopover);

    function scrollToMark(slug) {
      const mark =
        document.querySelector(`.viewer-rendered [data-slug="${slug}"]`) ||
        document.querySelector(`.viewer-rendered [data-covers~="${slug}"]`);
      if (!mark) return;
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
      mark.classList.add("mark-flash");
      setTimeout(() => mark.classList.remove("mark-flash"), MARK_FLASH_MS);
    }

    // 본문 표시는 #viewer-rendered(텍스트 모드·PDF 읽기 모드) 안에만 있다.
    // PDF 텍스트 레이어에는 2단계 결정대로 아무 표시도 얹지 않으므로
    // 거기서 걷어낼 mark 도 없다.
    function hideTermEverywhere(slug) {
      hiddenSlugs.add(slug);
      closeTermPopover();
      document
        .querySelectorAll(`.viewer-rendered mark.dict-mark[data-slug="${slug}"]`)
        .forEach(unwrapMark);
      saveHiddenSlugs(hiddenSlugs);
      renderMatchedTerms(currentMatches, filterInput.value);
    }

    function restoreAllHiddenTerms() {
      hiddenSlugs.clear();
      saveHiddenSlugs(hiddenSlugs);
      renderMatchedTerms(currentMatches, filterInput.value);
    }

    termsList.addEventListener("click", (e) => {
      const hideBtn = e.target.closest(".term-card-hide-btn");
      if (hideBtn) {
        hideTermEverywhere(hideBtn.dataset.hideSlug);
        return;
      }
      if (e.target.closest(".term-card-detail")) return;
      const card = e.target.closest(".term-card");
      if (!card) return;
      scrollToMark(card.dataset.slug);
    });

    if (showHiddenTermsBtn) {
      showHiddenTermsBtn.addEventListener("click", restoreAllHiddenTerms);
    }

    filterInput.addEventListener("input", () => {
      renderMatchedTerms(currentMatches, filterInput.value);
    });

    if (categoryFilterSelect) {
      categoryFilterSelect.addEventListener("change", () => renderMatchedTerms(currentMatches, filterInput.value));
    }
    if (englishOnlyFilter) {
      englishOnlyFilter.addEventListener("change", () => renderMatchedTerms(currentMatches, filterInput.value));
    }

    async function runAnalysis(text, { updateInputPane = true } = {}) {
      findBtn.disabled = true;
      // 첫 실행은 2.7MB 인덱스를 받는 시간이 눈에 띄므로 "찾는 중"과 구분해
      // 무엇을 기다리는지 알려 준다(두 번째부터는 캐시라 바로 지나간다).
      const needsIndex = !cachedTerms;
      findBtn.textContent = needsIndex ? "용어 데이터 불러오는 중…" : "찾는 중...";
      if (needsIndex) countHeading.textContent = "용어 데이터 불러오는 중…";
      try {
        const terms = await loadTerms();

        // Fast exact-match pass first — cheap regardless of document size,
        // so results appear immediately instead of waiting on fuzzy search.
        const exactMatches = matchTerms(text, terms);
        currentMatches = exactMatches;
        if (updateInputPane) {
          renderRenderedPane(text);
        }
        filterInput.disabled = false;
        // 카드에 찍을 정의는 찾은 용어 것만 청크에서 받아 온다.
        await attachDefinitions(currentMatches);
        renderMatchedTerms(currentMatches, filterInput.value);

        // fuzzy(오타 허용) 패스는 6단계에서 코드째 삭제했다. 이 사전처럼
        // 짧은 한국어 복합어가 3.8만 개 있으면 한 글자 차이가 곧 다른 용어라
        // ("빈도분석"/"잔차분석"/"입도분석기"), 길이차·점수 임계값을 세 번
        // 조여도 매번 새로운 오탐이 나왔다. 계획 4절대로 말뭉치 오탐 ≤ 5%를
        // 먼저 달성한 뒤에만 다시 검토한다(그때는 Fuse 도입부터 다시).
        logPaperHistory(text);
      } catch (err) {
        countHeading.textContent = "용어 데이터를 불러오지 못했습니다. 새로고침 해주세요.";
        termsList.innerHTML = "";
      } finally {
        findBtn.disabled = textarea.value.trim().length === 0;
        findBtn.textContent = "용어 찾기";
      }
    }

    // 자동 실행: 분석이 이미 돌고 있으면 새 요청을 큐에 하나만 얹어 두고,
    // 끝나는 즉시 "마지막 입력"으로 한 번 더 돌린다. 디바운스 중에도 사용자가
    // 계속 타이핑하면 요청이 겹칠 수 있는데, 겹친 실행이 서로의 결과를
    // 덮어쓰면 화면이 옛 텍스트 기준 결과로 되돌아가기 때문이다.
    let analysisRunning = false;
    let queuedAnalysis = null;
    async function requestAnalysis(text, opts) {
      if (analysisRunning) {
        queuedAnalysis = { text, opts };
        return;
      }
      analysisRunning = true;
      try {
        await runAnalysis(text, opts);
      } finally {
        analysisRunning = false;
        if (queuedAnalysis) {
          const next = queuedAnalysis;
          queuedAnalysis = null;
          await requestAnalysis(next.text, next.opts);
        }
      }
    }

    // 입력이 비면 이전 논문의 결과가 남아 헷갈리므로 사이드바를 초기화한다.
    function resetResults() {
      closeTermPopover();
      currentMatches = [];
      countHeading.textContent = "";
      termsList.innerHTML = "";
      const moreBtn = document.getElementById("term-card-more-btn");
      if (moreBtn) moreBtn.remove();
      if (categoryFilterSelect) categoryFilterSelect.innerHTML = `<option value="">전체 분야</option>`;
      if (showHiddenTermsBtn) showHiddenTermsBtn.hidden = true;
      filterInput.value = "";
      filterInput.disabled = true;
      pdfTermsByPage = new Map();
      renderCurrentPageTerms(0);
      // 본문이 아직 떠 있으면(예: 읽던 글) 진입점을 그 위에 얹지 않는다.
      if (!pdfDoc && (!renderedPane || renderedPane.hidden)) setDropzoneVisible(true);
    }

    // 붙여넣기만 해도 결과가 뜨게 한다. 타이핑은 800ms 쉬었을 때만 —
    // 글자마다 3만7천 개 사전을 훑으면 입력이 버벅인다.
    let autoAnalysisTimer = null;
    function scheduleAutoAnalysis({ immediate = false } = {}) {
      clearTimeout(autoAnalysisTimer);
      if (textarea.value.trim().length === 0) {
        queuedAnalysis = null;
        resetResults();
        return;
      }
      if (immediate) {
        requestAnalysis(textarea.value);
        return;
      }
      autoAnalysisTimer = setTimeout(() => requestAnalysis(textarea.value), AUTO_ANALYSIS_DEBOUNCE_MS);
    }

    textarea.addEventListener("input", () => scheduleAutoAnalysis());
    // paste 이벤트 시점에는 textarea.value가 아직 갱신 전이라 한 틱 미룬다.
    textarea.addEventListener("paste", () => {
      setTimeout(() => scheduleAutoAnalysis({ immediate: true }), 0);
    });

    // 버튼은 수동 재실행용으로 남겨 둔다(자동 실행이 꺼진 상황·재분석 용도).
    findBtn.addEventListener("click", () => {
      clearTimeout(autoAnalysisTimer);
      // 복원 안내는 "이어서 쓸지 지울지" 고르라는 안내라, 분석을 시작한 시점에는
      // 역할이 끝난다.
      hideRestoreStatus();
      // PDF가 열려 있을 때는 재분석만 하고 본문 표시는 PDF 그대로 둔다 — 추출된
      // 텍스트를 다시 그려 봐야 PDF와 같은 내용이 한 번 더 보일 뿐이다.
      requestAnalysis(textarea.value, { updateInputPane: !pdfDoc });
    });

    if (editTextBtn) {
      editTextBtn.addEventListener("click", () => {
        showTextInput();
        textarea.focus();
      });
    }

    const pdfInput = document.getElementById("pdf-upload");
    const pdfStatus = document.getElementById("pdf-status");
    const pdfViewer = document.getElementById("pdf-viewer");
    const pdfToolbar = document.getElementById("pdf-toolbar");
    const pdfZoomLabel = document.getElementById("pdf-zoom-label");
    const pdfZoomOutBtn = document.getElementById("pdf-zoom-out");
    const pdfZoomInBtn = document.getElementById("pdf-zoom-in");
    const pdfZoomFitBtn = document.getElementById("pdf-zoom-fit");
    const pdfZoomFitPageBtn = document.getElementById("pdf-zoom-fit-page");
    const pdfPageInput = document.getElementById("pdf-page-input");
    const pdfPageTotal = document.getElementById("pdf-page-total");
    const pdfSearchInput = document.getElementById("pdf-search-input");
    const pdfSearchPrevBtn = document.getElementById("pdf-search-prev");
    const pdfSearchNextBtn = document.getElementById("pdf-search-next");
    const pdfSearchCount = document.getElementById("pdf-search-count");
    const pdfOriginalToggle = document.getElementById("pdf-original-toggle");

    // PDF 모드의 기본 화면은 읽기 모드고, 원본(canvas)은 토글로만 띄운다.
    // 그림·표·수식이 필요할 때를 위해 남겨 두되, 숨겨져 있는 동안은 캔버스를
    // 그리지 않는다(아래 drawPdfPage 의 가드).
    function setPdfOriginalVisible(visible) {
      pdfOriginalVisible = !!visible;
      const pane = document.getElementById("viewer-input-pane");
      if (pane) pane.classList.toggle("show-original", pdfOriginalVisible);
      if (pdfOriginalToggle) {
        pdfOriginalToggle.setAttribute("aria-pressed", String(pdfOriginalVisible));
        pdfOriginalToggle.textContent = pdfOriginalVisible ? "읽기 모드" : "원본 보기";
        pdfOriginalToggle.title = pdfOriginalVisible
          ? "원본 페이지를 닫고 읽기 모드만 본다"
          : "원본 페이지(그림·표·수식)를 함께 본다";
      }
      if (pdfOriginalVisible && pdfPageWraps.length) {
        // 숨어 있는 동안 건너뛴 캔버스를 지금 채운다.
        drawPdfPageWindow(clampPdfPageNumber(pdfCurrentPage, pdfPageWraps.length));
        updateVisiblePdfPages();
      }
      // 검색 대상 DOM 이 바뀌므로 진행 중인 검색을 다시 건다.
      if (pdfSearchInput && pdfSearchInput.value.trim()) runPdfSearch(pdfSearchInput.value);
    }

    if (pdfOriginalToggle) {
      pdfOriginalToggle.addEventListener("click", () => setPdfOriginalVisible(!pdfOriginalVisible));
    }

    // 용어 패널 접기/펼치기. 접으면 뷰어 폭이 바뀌므로 PDF가 열려 있으면
    // 화면맞춤 배율을 다시 잡아 글자가 새 폭에 맞게 커지거나 작아지게 한다.
    // 상태는 기기별 취향이라 localStorage에만 남긴다(HIDDEN_TERMS_KEY와 같은 취지).
    const TERMS_PANEL_COLLAPSED_KEY = "viewerTermsPanelCollapsed";
    const viewerLayout = document.querySelector(".viewer-layout");
    const termsPanelToggle = document.getElementById("terms-panel-toggle");

    function setTermsPanelCollapsed(collapsed, { refit = true } = {}) {
      if (!viewerLayout || !termsPanelToggle) return;
      viewerLayout.classList.toggle("terms-collapsed", collapsed);
      termsPanelToggle.setAttribute("aria-expanded", String(!collapsed));
      termsPanelToggle.title = collapsed ? "용어 패널 펼치기" : "용어 패널 접기";
      try {
        localStorage.setItem(TERMS_PANEL_COLLAPSED_KEY, collapsed ? "1" : "0");
      } catch (e) {
        /* 저장 못 해도 동작에는 영향 없음 */
      }
      if (refit && pdfDoc) {
        computeFitWidthScale(pdfDoc).then((scale) => rerenderPdfAtScale(scale));
      }
    }

    if (termsPanelToggle) {
      termsPanelToggle.addEventListener("click", () => {
        setTermsPanelCollapsed(!viewerLayout.classList.contains("terms-collapsed"));
      });
      let savedCollapsed = false;
      try {
        savedCollapsed = localStorage.getItem(TERMS_PANEL_COLLAPSED_KEY) === "1";
      } catch (e) {
        /* 읽기 실패는 펼친 상태로 */
      }
      if (savedCollapsed) setTermsPanelCollapsed(true, { refit: false });
    }

    if (pdfZoomOutBtn) pdfZoomOutBtn.addEventListener("click", () => rerenderPdfAtScale(pdfScale - 0.25));
    if (pdfZoomInBtn) pdfZoomInBtn.addEventListener("click", () => rerenderPdfAtScale(pdfScale + 0.25));
    if (pdfZoomFitBtn) {
      pdfZoomFitBtn.addEventListener("click", async () => {
        if (!pdfDoc) return;
        pdfScale = await computeFitWidthScale(pdfDoc);
        await rerenderPdfAtScale(pdfScale);
      });
    }
    // 화면맞춤은 너비 기준이라 긴 페이지는 여전히 잘린다. 한 페이지를 통째로
    // 보고 싶을 때를 위해 세로까지 맞추는 배율을 따로 둔다.
    if (pdfZoomFitPageBtn) {
      pdfZoomFitPageBtn.addEventListener("click", async () => {
        if (!pdfDoc) return;
        const scale = await computeFitPageScaleForDoc(pdfDoc);
        await rerenderPdfAtScale(scale);
        gotoPdfPage(pdfCurrentPage);
      });
    }
    if (pdfPageInput) {
      pdfPageInput.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        gotoPdfPage(pdfPageInput.value);
        pdfPageInput.blur();
      });
      // 포커스를 잃을 때도 범위 밖 값이 그대로 남지 않게 정리한다.
      pdfPageInput.addEventListener("blur", () => {
        if (pdfPageWraps.length) {
          pdfPageInput.value = String(clampPdfPageNumber(pdfPageInput.value, pdfPageWraps.length));
        }
      });
    }

    // Plain substring search over each page's already-reconstructed text
    // (the same buildOffsetMap() output the dictionary highlighter uses),
    // independent of dictionary terms — this is "find in this PDF", the
    // control readers expect from any PDF viewer and that "찾은 용어 내 검색"
    // (which only filters the sidebar term list) doesn't provide.
    // 검색은 "지금 눈에 보이는 본문"에서 돈다. 읽기 모드가 기본이므로 보통은
    // #viewer-rendered 의 페이지 섹션이고, 좁은 화면에서 원본만 띄운 경우에만
    // 텍스트 레이어다. 두 DOM 은 오프셋 맵을 만드는 방법이 다르다(읽기 모드는
    // 텍스트 노드 그대로, 텍스트 레이어는 span 기하로 띄어쓰기를 복원).
    function getPdfSearchTargets() {
      const readingVisible =
        renderedPane &&
        !renderedPane.hidden &&
        renderedPane.classList.contains("pdf-reading") &&
        renderedPane.offsetParent !== null;
      if (readingVisible) {
        return [...renderedPane.querySelectorAll("section.pdf-page-text")].map((container) => ({
          container,
          buildMap: buildTextNodeOffsetMap,
        }));
      }
      return pdfTextLayerDivs.map((container) => ({ container, buildMap: buildOffsetMap }));
    }

    function clearPdfSearchMarks() {
      for (const div of pdfTextLayerDivs) {
        div.querySelectorAll("mark.search-mark").forEach(unwrapMark);
      }
      if (renderedPane) renderedPane.querySelectorAll("mark.search-mark").forEach(unwrapMark);
      pdfSearchMatches = [];
      pdfSearchIndex = -1;
    }

    function updatePdfSearchCount() {
      if (!pdfSearchCount) return;
      pdfSearchCount.textContent = pdfSearchMatches.length
        ? `${pdfSearchIndex + 1}/${pdfSearchMatches.length}`
        : pdfSearchInput && pdfSearchInput.value.trim()
          ? "0/0"
          : "";
    }

    function gotoPdfSearchMatch(index) {
      if (!pdfSearchMatches.length) return;
      pdfSearchIndex = (index + pdfSearchMatches.length) % pdfSearchMatches.length;
      pdfSearchMatches.forEach((m, i) => m.mark.classList.toggle("search-mark-active", i === pdfSearchIndex));
      const mark = pdfSearchMatches[pdfSearchIndex].mark;
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
      updatePdfSearchCount();
    }

    function runPdfSearch(query) {
      clearPdfSearchMarks();
      const q = query.trim().toLowerCase();
      if (!q) {
        updatePdfSearchCount();
        return;
      }
      for (const target of getPdfSearchTargets()) {
        const textLayerDiv = target.container;
        const { text: pageText, map: pageOffsetMap } = target.buildMap(textLayerDiv);
        const lowerText = pageText.toLowerCase();
        const ranges = [];
        let from = 0;
        for (;;) {
          const idx = lowerText.indexOf(q, from);
          if (idx === -1) break;
          ranges.push({ startOffset: idx, endOffset: idx + q.length });
          from = idx + q.length;
        }
        // Descending order: wrapping a range splits text nodes at/after it,
        // so later (higher-offset) ranges must be wrapped first.
        ranges.reverse();
        for (const range of orderRangesForWrapping(ranges)) {
          const marks = wrapPageRange(textLayerDiv, range.startOffset, range.endOffset, () => {
            const mark = document.createElement("mark");
            mark.className = "search-mark";
            return mark;
          }, pageOffsetMap);
          if (marks.length) pdfSearchMatches.push({ mark: marks[0] });
        }
      }
      // Matches were collected page-by-page in reverse-within-page order;
      // restore reading order (top of doc to bottom) before numbering them.
      pdfSearchMatches.reverse();
      if (pdfSearchMatches.length) gotoPdfSearchMatch(0);
      else updatePdfSearchCount();
    }

    if (pdfSearchInput) {
      pdfSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.shiftKey) gotoPdfSearchMatch(pdfSearchIndex - 1);
          else if (pdfSearchMatches.length) gotoPdfSearchMatch(pdfSearchIndex + 1);
          else runPdfSearch(pdfSearchInput.value);
        }
      });
      pdfSearchInput.addEventListener("input", () => runPdfSearch(pdfSearchInput.value));
    }
    if (pdfSearchPrevBtn) pdfSearchPrevBtn.addEventListener("click", () => gotoPdfSearchMatch(pdfSearchIndex - 1));
    if (pdfSearchNextBtn) pdfSearchNextBtn.addEventListener("click", () => gotoPdfSearchMatch(pdfSearchIndex + 1));

    // A scanned PDF has no text layer at all. Probing the first few pages
    // catches that before any rendering work happens, so the "paste the text
    // instead" message appears immediately instead of after a full render.
    // Whatever was fetched here is handed to renderPdf so those pages are not
    // read a second time.
    const TEXT_PROBE_PAGES = 3;

    async function probePdfText(pdf) {
      const probed = new Map();
      const limit = Math.min(TEXT_PROBE_PAGES, pdf.numPages);
      for (let pageNum = 1; pageNum <= limit; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        probed.set(pageNum, textContent);
        if (textContent.items.some((item) => item.str.trim())) break;
      }
      return probed;
    }

    function hasAnyText(probed) {
      for (const textContent of probed.values()) {
        if (textContent.items.some((item) => item.str.trim())) return true;
      }
      return false;
    }

    // Renders every page and returns the document's full text.
    //
    // The text comes from the same getTextContent() call that feeds the
    // selectable text layer and the dictionary highlighting, so each page is
    // read exactly once. Previously a separate extractPdfText() pass parsed
    // the whole document a second time and called getTextContent() again on
    // every page, roughly doubling the wait before anything was usable.
    // Fits the page to the viewer's current width instead of a fixed 1.5
    // scale, which is what forced a horizontal scrollbar on any page wider
    // than the (fairly narrow, sidebar-sharing) viewer pane — most visibly
    // on a table that fills the page width.
    async function computeFitWidthScale(pdf) {
      const page = await pdf.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewerEl = document.getElementById("pdf-viewer");
      // 좌우 padding 20px에 더해 세로 스크롤바 몫(17px)도 미리 뺀다. 첫 화면맞춤은
      // 페이지가 붙기 전에 계산되는데, 페이지가 붙으면서 세로 스크롤바가 생기면
      // 그만큼 폭이 줄어 가로 스크롤이 생겼다(여러 쪽짜리 PDF는 거의 항상 해당).
      const availableWidth = viewerEl.clientWidth - PDF_VIEWER_PADDING_PX - PDF_SCROLLBAR_WIDTH_PX;
      if (!availableWidth || availableWidth <= 0) return PDF_FALLBACK_SCALE;
      const scale = availableWidth / baseViewport.width;
      return Math.max(PDF_MIN_SCALE, Math.min(PDF_MAX_SCALE, scale));
    }

    // PDF 텍스트 레이어에는 용어 표시(점선 밑줄·팝오버)를 얹지 않는다.
    // 두 번 시도해 두 번 걷어냈다: span을 가로질러 <mark>로 감싸는 방식은
    // pdf.js의 절대 위치·scaleX가 조각에 복제돼 글자가 밀렸고(c98ed9adc),
    // span 자체에 class만 얹는 방식은 실제 논문에서 span이 한 줄 전체이거나
    // 목차의 점선 행처럼 폭이 제멋대로라 밑줄이 엉뚱한 자리에 그어졌다.
    // 용어는 오른쪽 목록으로만 보여 준다. (텍스트 모드의 팝오버는 그대로.)

    // 캔버스 지연 렌더용 페이지 상태. 텍스트 레이어는 전부 미리 만들지만
    // (메모·검색이 전 페이지 텍스트 레이어에 의존) 캔버스 래스터화는 보이는
    // 페이지 ±1쪽으로 미룬다 — 30쪽짜리에서 첫 분석이 시작되기까지 30쪽을 다
    // 그려야 했던 것이 가장 큰 대기 원인이었다.
    let pdfPageWraps = [];            // index 0 = 1쪽
    let pdfPageProxies = new Map();   // page number -> pdf.js PageProxy
    let pdfPageViewports = new Map(); // page number -> 현재 배율의 viewport
    let pdfDrawnPages = new Set();    // 캔버스를 이미 그린(또는 그리는 중인) 페이지
    let pdfPageObserver = null;
    let pdfCurrentPage = 1;
    let pdfRenderToken = 0;           // 재렌더 시 증가 — 늦게 끝난 옛 렌더 무시

    // HiDPI에서 캔버스를 CSS 픽셀 크기로만 그리면 글자가 흐려진다. 비트맵은
    // devicePixelRatio 배로 잡고 CSS 크기는 viewport 그대로 둬야 텍스트 레이어
    // 좌표계(viewport 기준)와 어긋나지 않는다. 3배를 넘기면 메모리만 먹는다.
    function pdfPixelRatio() {
      return Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    }

    function drawPdfPage(pageNum) {
      if (pdfDrawnPages.has(pageNum)) return;
      // 원본 보기가 꺼져 있으면 캔버스는 화면에 없다. 래스터화는 PDF 작업 중
      // 가장 비싼 일이므로 보이지도 않는 페이지에는 쓰지 않는다.
      if (!pdfOriginalVisible) return;
      const wrap = pdfPageWraps[pageNum - 1];
      const page = pdfPageProxies.get(pageNum);
      const viewport = pdfPageViewports.get(pageNum);
      if (!wrap || !page || !viewport) return;
      const canvas = wrap.querySelector("canvas.pdf-page");
      if (!canvas) return;
      pdfDrawnPages.add(pageNum);

      const ratio = pdfPixelRatio();
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const token = pdfRenderToken;
      page
        .render({
          canvasContext: canvas.getContext("2d"),
          viewport,
          transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
        })
        .promise.then(() => {
          if (token === pdfRenderToken) canvas.dataset.rendered = "1";
        })
        .catch((err) => {
          // 다시 보일 때 재시도할 수 있게 표시를 되돌린다.
          pdfDrawnPages.delete(pageNum);
          console.error("[pdf-render]", pageNum, err);
          // 빈 페이지만 남으면 사용자는 이유를 알 수 없다. 읽기 모드는 멀쩡하다는
          // 것까지 같이 알린다(원본 보기에서만 보이는 실패라서).
          if (pdfOriginalVisible) showPdfNotice(`${pageNum}쪽 원본을 그리지 못했습니다. 읽기 모드 본문은 그대로 볼 수 있습니다.`);
        });
    }

    function drawPdfPageWindow(pageNum) {
      drawPdfPage(pageNum - 1);
      drawPdfPage(pageNum);
      drawPdfPage(pageNum + 1);
    }

    function setCurrentPdfPage(pageNum) {
      pdfCurrentPage = pageNum;
      // 사용자가 입력 중일 때 값을 덮어쓰면 타이핑이 끊긴다.
      if (pdfPageInput && document.activeElement !== pdfPageInput) {
        pdfPageInput.value = String(pageNum);
      }
    }

    // 스크롤에 따른 현재 페이지 추적과 캔버스 지연 렌더를 한 관찰자로 처리한다.
    function setupPdfPageObserver() {
      if (pdfPageObserver) pdfPageObserver.disconnect();
      const viewerEl = document.getElementById("pdf-viewer");
      if (typeof IntersectionObserver === "undefined") {
        // 관찰자를 못 쓰는 환경에서는 지연 없이 전부 그린다(기능 유지 우선).
        for (let i = 1; i <= pdfPageWraps.length; i++) drawPdfPage(i);
        return;
      }
      const ratios = new Map();
      pdfPageObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const pageNum = Number(entry.target.dataset.page);
            ratios.set(pageNum, entry.isIntersecting ? entry.intersectionRatio : 0);
            if (entry.isIntersecting) drawPdfPageWindow(pageNum);
          }
          let best = 0;
          let bestRatio = 0;
          for (const [pageNum, ratio] of ratios) {
            if (ratio > bestRatio) {
              bestRatio = ratio;
              best = pageNum;
            }
          }
          if (best) setCurrentPdfPage(best);
        },
        { root: viewerEl, threshold: PAGE_OBSERVER_THRESHOLDS }
      );
      for (const wrap of pdfPageWraps) pdfPageObserver.observe(wrap);
    }

    // IntersectionObserver가 콜백을 주지 않는 환경(일부 임베디드 브라우저·
    // 백그라운드 탭)에서도 캔버스가 비어 보이지 않도록, 스크롤 때 기하학적으로
    // 보이는 페이지를 직접 계산하는 보조 경로를 둔다. 관찰자가 정상인 환경에서는
    // 이미 그려진 페이지를 다시 그리지 않으므로(drawPdfPage의 중복 가드) 비용이 없다.
    function updateVisiblePdfPages() {
      if (!pdfPageWraps.length) return;
      const viewerEl = document.getElementById("pdf-viewer");
      const viewRect = viewerEl.getBoundingClientRect();
      let best = 0;
      let bestVisible = 0;
      for (let i = 0; i < pdfPageWraps.length; i++) {
        const rect = pdfPageWraps[i].getBoundingClientRect();
        const visible = Math.min(rect.bottom, viewRect.bottom) - Math.max(rect.top, viewRect.top);
        if (visible > 0) drawPdfPageWindow(i + 1);
        if (visible > bestVisible) {
          bestVisible = visible;
          best = i + 1;
        }
      }
      if (best) setCurrentPdfPage(best);
    }

    // rAF 대신 타이머로 throttle한다. 배경 탭처럼 rAF가 아예 호출되지 않는
    // 상황에서 rAF를 쓰면 "예약됨" 플래그가 영영 풀리지 않아 이후 스크롤이
    // 통째로 무시된다(실제로 임베디드 뷰에서 재현됨).
    let pdfScrollTimer = 0;
    function onPdfViewerScroll() {
      if (pdfScrollTimer) return;
      pdfScrollTimer = setTimeout(() => {
        pdfScrollTimer = 0;
        updateVisiblePdfPages();
      }, 80);
    }
    document.getElementById("pdf-viewer").addEventListener("scroll", onPdfViewerScroll);

    function gotoPdfPage(value) {
      if (!pdfPageWraps.length) return;
      const pageNum = clampPdfPageNumber(value, pdfPageWraps.length);
      // 읽기 모드가 화면에 있으면 그쪽도 같은 페이지로 옮긴다. 원본이 꺼져
      // 있으면 여기가 유일한 본문이므로 이것만으로 페이지 이동이 끝난다.
      if (renderedPane && !renderedPane.hidden && renderedPane.classList.contains("pdf-reading")) {
        const section = renderedPane.querySelector(`section.pdf-page-text[data-page="${pageNum}"]`);
        if (section) {
          renderedPane.scrollTop +=
            section.getBoundingClientRect().top - renderedPane.getBoundingClientRect().top - 8;
        }
        setCurrentPdfPage(pageNum);
        if (pdfPageInput) pdfPageInput.value = String(pageNum);
      }
      const wrap = pdfPageWraps[pageNum - 1];
      if (!wrap) return;
      const viewerEl = document.getElementById("pdf-viewer");
      // offsetTop은 뷰어가 positioned가 아니면 어긋나므로 실제 화면 좌표 차이로
      // 계산한다. 8px는 페이지 사이 여백만큼의 시각적 여유.
      viewerEl.scrollTop +=
        wrap.getBoundingClientRect().top - viewerEl.getBoundingClientRect().top - 8;
      drawPdfPageWindow(pageNum);
      setCurrentPdfPage(pageNum);
      if (pdfPageInput) pdfPageInput.value = String(pageNum);
      updateVisiblePdfPages();
    }

    // 한 페이지 전체가 뷰어 안에 들어오는 배율. 계산 자체는 순수 함수
    // computeFitPageScale에 있고(테스트 대상), 여기서는 실제 치수만 넘긴다.
    async function computeFitPageScaleForDoc(pdf) {
      const page = await pdf.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewerEl = document.getElementById("pdf-viewer");
      return computeFitPageScale(
        baseViewport.width,
        baseViewport.height,
        viewerEl.clientWidth - PDF_VIEWER_PADDING_PX,
        viewerEl.clientHeight - PDF_PAGE_MARGIN_PX,
        PDF_MIN_SCALE,
        PDF_MAX_SCALE,
        pdfScale || 1
      );
    }

    // `probedTextContent` is only passed on the very first render of a
    // freshly-uploaded file; a zoom change calls this again with it omitted,
    // which also signals "keep pdfTextContentCache" so re-rendering at a new
    // scale doesn't re-run getTextContent() (a real, if secondary, parse
    // cost) for every page a second time.
    async function renderPdf(pdf, probedTextContent, onProgress) {
      const viewer = document.getElementById("pdf-viewer");
      if (pdfPageObserver) {
        pdfPageObserver.disconnect();
        pdfPageObserver = null;
      }
      viewer.innerHTML = "";
      viewer.style.setProperty("--scale-factor", String(pdfScale));
      pdfDoc = pdf;
      pdfTextLayerDivs = [];
      pdfPageWraps = [];
      pdfPageProxies = new Map();
      pdfPageViewports = new Map();
      pdfDrawnPages = new Set();
      pdfRenderToken++;
      if (probedTextContent) pdfTextContentCache = new Map();
      if (probedTextContent) pdfPageTexts = new Map();
      pdfPageTextList = [];
      pdfPageOffsets = [];

      // Must happen before computeFitWidthScale() measures #pdf-viewer's
      // width below — .no-pdf sets display:none on it, which would make
      // clientWidth read 0 and silently fall back to the old fixed scale.
      const pane = document.getElementById("viewer-input-pane");
      pane.classList.remove("no-pdf");
      pane.classList.add("has-pdf");

      if (pdfScale === null) pdfScale = await computeFitWidthScale(pdf);

      // loadTerms() also populates the module-level exactIndex used below.
      await loadTerms();

      const pageTexts = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: pdfScale });
        pdfPageProxies.set(i, page);
        pdfPageViewports.set(i, viewport);

        const pageWrap = document.createElement("div");
        pageWrap.className = "pdf-page-wrap";
        pageWrap.dataset.page = String(i);
        pageWrap.style.width = `${viewport.width}px`;
        pageWrap.style.height = `${viewport.height}px`;

        // 캔버스는 자리만 잡아두고 비트맵은 drawPdfPage()가 나중에 잡는다.
        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page";
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const textLayerDiv = document.createElement("div");
        textLayerDiv.className = "textLayer";
        // pdf.js 4.x의 TextLayer는 span 글자 크기와 레이어 폭을
        // calc(var(--scale-factor) * …)로 잡는다. 이 변수가 없으면 calc가 통째로
        // 무효가 되어 글자 크기가 상속값으로 떨어지고, 드래그 선택·하이라이트가
        // 캔버스 글자와 어긋난다(줌·패널 접기 뒤 "하이라이트가 이상하다"의 원인).
        textLayerDiv.style.setProperty("--scale-factor", String(pdfScale));
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;

        pageWrap.appendChild(canvas);
        pageWrap.appendChild(textLayerDiv);
        viewer.appendChild(pageWrap);
        pdfTextLayerDivs.push(textLayerDiv);
        pdfPageWraps.push(pageWrap);

        let textContent = (probedTextContent && probedTextContent.get(i)) || pdfTextContentCache.get(i);
        if (textContent) {
          if (probedTextContent) probedTextContent.delete(i);
        } else {
          textContent = await page.getTextContent();
        }
        pdfTextContentCache.set(i, textContent);

        // pdf.js 4.5+에서 renderTextLayer() 함수가 제거되고 TextLayer 클래스로
        // 대체됐다 (4.10 업그레이드에 맞춘 교체).
        await new window.pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        }).render();

        // 축척 1 기준의 페이지 폭을 넘겨 2단 조판이면 열 순서를 복원한다.
        // 화면 배율(pdfScale)이 아니라 원본 좌표계여야 item transform 과 단위가 맞는다.
        // viewport.width 는 축척 1 폭 × pdfScale 이므로 나누면 원본 폭이 그대로
        // 나온다. getViewport 를 한 번 더 부르지 않는다(페이지마다 드는 비용).
        const joined = joinTextItems(textContent.items, viewport.width / pdfScale);
        pdfPageTexts.set(i, joined);
        pageTexts.push(joined);

        if (onProgress) onProgress(i, pdf.numPages);
      }

      if (pdfToolbar) pdfToolbar.hidden = false;
      if (pdfZoomLabel) pdfZoomLabel.textContent = `${Math.round(pdfScale * 100)}%`;
      if (pdfPageTotal) pdfPageTotal.textContent = `/ 전체 ${pdf.numPages}`;
      if (pdfPageInput) {
        pdfPageInput.max = String(pdf.numPages);
        pdfPageInput.value = String(clampPdfPageNumber(pdfCurrentPage, pdf.numPages));
      }

      setupPdfPageObserver();
      // 관찰자 콜백은 다음 프레임에야 오므로 첫 화면 몫은 즉시 그린다.
      drawPdfPageWindow(clampPdfPageNumber(pdfCurrentPage, pdf.numPages));
      updateVisiblePdfPages();

      // 읽기 모드의 표시 위치는 전부 이 전체 텍스트의 오프셋에 걸린다.
      // 예전에는 여기서 .trim() 을 했는데, 그러면 1쪽 앞의 공백만큼 모든
      // 오프셋이 밀려 밑줄이 어긋난다. 잇는 규칙은 buildPageOffsets 와
      // 반드시 같아야 하므로 PDF_PAGE_JOINER 한 곳에서만 정한다.
      pdfPageTextList = pageTexts;
      pdfPageOffsets = buildPageOffsets(pageTexts);
      return pageTexts.join(PDF_PAGE_JOINER);
    }

    // Re-renders every page at a new scale, reusing the cached getTextContent()
    // results above so zooming re-parses nothing — only re-rasterizes the
    // canvas and rebuilds the text layer + highlights.
    // 줌 버튼을 빠르게 두 번 누르면 renderPdf가 겹쳐 돌면서(둘 다 같은
    // #pdf-viewer에 페이지를 붙인다) 페이지와 하이라이트가 두 벌씩 그려졌다.
    // 배율 자체는 클릭 즉시 반영하고, 실제 재렌더는 앞의 것이 끝난 뒤에
    // 한 번만 돌게 줄을 세운다.
    let pdfRerenderQueue = Promise.resolve();
    let renderedPdfScale = null;

    function rerenderPdfAtScale(newScale) {
      if (!pdfDoc) return Promise.resolve();
      pdfScale = clampPdfScale(newScale, PDF_MIN_SCALE, PDF_MAX_SCALE);
      pdfRerenderQueue = pdfRerenderQueue.then(() => {
        // 줄 서 있는 동안 배율이 더 바뀌었다면 마지막 값 한 번만 그리면 된다.
        if (renderedPdfScale === pdfScale) return;
        return doRerenderPdf();
      });
      return pdfRerenderQueue;
    }

    async function doRerenderPdf() {
      renderedPdfScale = pdfScale;
      const viewerEl = document.getElementById("pdf-viewer");
      const scrollRatio = viewerEl.scrollHeight > 0 ? viewerEl.scrollTop / viewerEl.scrollHeight : 0;
      // 재렌더는 텍스트 레이어를 통째로 새로 만들기 때문에, 열려 있던 팝오버와
      // 선택 툴바가 가리키던 mark·span은 이미 문서에서 떨어져 나간 상태다.
      // 먼저 닫아 두지 않으면 삭제·메모 저장이 보이지 않는 옛 DOM에 적용된다.
      hideHighlightToolbar();
      hideMemoPopover();
      closeTermPopover();
      await renderPdf(pdfDoc, null);
      viewerEl.scrollTop = scrollRatio * viewerEl.scrollHeight;
      // 하이라이트는 5단계부터 읽기 모드 DOM 에만 있다. 줌은 #pdf-viewer 만
      // 새로 그리므로 여기서 다시 그릴 것이 없다(다시 그리면 이중으로 감싼다).
      // Re-run any active search: the re-render rebuilt every text layer,
      // discarding search marks — and a search typed *during* the re-render
      // saw an empty page list and stuck at "0/0" until the next keystroke.
      if (pdfSearchInput && pdfSearchInput.value.trim()) {
        runPdfSearch(pdfSearchInput.value);
      }
    }

    pdfInput.addEventListener("change", async () => {
      const file = pdfInput.files[0];
      if (!file) return;
      // 새 문서는 이전 문서의 "이 배율은 이미 그렸다" 기록과 무관하다.
      renderedPdfScale = null;
      try {
        await handlePdfFile(file);
      } finally {
        pdfInput.value = "";
      }
    });

    // 업로드 경로와 "최근 문서 다시 열기" 경로가 같은 처리를 타도록, 파일 하나를
    // 받아 렌더까지 끝내는 함수로 분리했다. `persist:false` 는 IndexedDB 에서
    // 막 꺼내온 파일을 다시 쓰지 않기 위한 플래그.
    async function handlePdfFile(file, options) {
      const persist = !options || options.persist !== false;

      pdfStatus.hidden = false;
      pdfStatus.textContent = "PDF 여는 중…";
      hideHighlightToolbar();
      hideMemoPopover();
      annotationsCache = [];
      renderNotesList();
      currentDocHash = null;

      try {
        // Read the file once and parse it once; the same buffer is reused for
        // the document hash and for pdf.js. (Hash first — pdf.js may take
        // ownership of the buffer once it hands it to the worker.)
        const arrayBuffer = await file.arrayBuffer();
        currentDocHash = await computeDocHash(file, arrayBuffer);
        // isEvalSupported:false — CVE-2024-4367 완화. pdf.js 4.2.67 미만은 악성
        // 폰트 매트릭스로 임의 JS 실행이 가능하므로 eval 경로를 차단한다.
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer, isEvalSupported: false }).promise;

        const probed = await probePdfText(pdf);
        if (!hasAnyText(probed)) {
          throw new Error("empty-text-layer");
        }

        lastPdfFilename = file.name;
        pdfCurrentPage = 1;
        // 새 문서는 이전 문서의 "이 배율은 이미 그렸다" 기록과 무관하다. 업로드
        // 뿐 아니라 "최근 문서 다시 열기"도 이 경로를 타므로 여기서 초기화한다.
        renderedPdfScale = null;

        // Reveal the viewer before rendering starts, so the reader watches
        // pages fill in instead of staring at a frozen "분석 중" message until
        // the whole document is done.
        showTextInput();
        textarea.hidden = true;
        pdfViewer.hidden = false;
        setDropzoneVisible(false);
        hideRecentDocs();
        setPdfOriginalVisible(false);

        const text = await renderPdf(pdf, probed, (done, total) => {
          pdfStatus.textContent = `텍스트 추출 중… (${done}/${total})`;
        });

        pdfStatus.textContent = "용어 분석 중…";
        textarea.value = text;
        // PDF 모드로 넘어왔으니 텍스트 초안은 더 이상 복원 대상이 아니다.
        // (textarea 내용이 사용자가 쓰던 글이 아니라 PDF 추출 텍스트로 바뀌었다)
        clearSavedText();
        hideRestoreStatus();
        if (persist) saveCurrentPdf(file, currentDocHash, pdf.numPages);
        await requestAnalysis(text, { updateInputPane: false });
        // PDF 모드 기본 화면은 읽기 모드. 원본 canvas 는 토글로만 띄운다.
        renderReadingPane();
        pdfStatus.hidden = true;
        await loadAndRenderAnnotations();
      } catch (err) {
        console.error("[pdf-upload]", err);
        pdfStatus.hidden = true;
        showTextInput();
        pdfViewer.hidden = true;
        pdfViewer.innerHTML = "";
        // 스캔본(이미지만 있는 PDF)과 그 밖의 실패를 구분해서 안내한다.
        // "왜 아무것도 안 나오지"가 가장 흔한 막힘이다.
        const scanned = err && err.message === "empty-text-layer";
        const message = scanned
          ? "이 PDF에는 글자 정보가 없습니다(스캔본으로 보입니다). 텍스트를 직접 복사해 붙여넣거나 OCR을 거친 파일을 올려 주세요."
          : "이 PDF를 열지 못했습니다. 텍스트를 직접 복사해 붙여넣어 주세요. (오류: " + (err && err.message) + ")";
        countHeading.textContent = message;
        showPdfNotice(message, 15000);
        termsList.innerHTML = "";
        textarea.value = "";
        findBtn.disabled = true;
        currentDocHash = null;
        // pdfDoc 이 남아 있으면 renderRecentDocs 가 "문서를 열어 둔 상태"로 보고
        // 첫 화면 목록을 띄우지 않는다 — 실패했는데 돌아갈 곳이 없어진다.
        pdfDoc = null;
        renderRecentDocs();
      }
    }

    // ---------- 작업 내용 유지 (텍스트 초안 / 최근 PDF) ----------
    // 저장 계층은 assets/viewer-storage.js. 미지원 환경에서는 통째로 없는 셈
    // 치고 뷰어 본기능은 그대로 동작해야 하므로 매번 존재 여부를 확인한다.
    const store = typeof window !== "undefined" ? window.ViewerStorage : null;
    const restoreStatus = document.getElementById("viewer-restore-status");

    function clearSavedText() {
      if (store) store.clearText();
    }

    function hideRestoreStatus() {
      if (!restoreStatus) return;
      restoreStatus.hidden = true;
      restoreStatus.textContent = "";
    }

    // #pdf-status 와 같은 aria-live 영역에 안내 + 인라인 액션 버튼을 그린다.
    function showRestoreStatus(message, actions) {
      if (!restoreStatus) return;
      restoreStatus.textContent = "";
      restoreStatus.append(message);
      (actions || []).forEach((action) => {
        restoreStatus.append(" · ");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "term-filter-link";
        btn.textContent = action.label;
        btn.addEventListener("click", action.onClick);
        restoreStatus.append(btn);
      });
      restoreStatus.hidden = false;
    }

    // 저장 실패를 더는 삼키지 않는다(5단계). 용량 초과면 저장 계층이 오래된
    // 것부터 지우고 한 번 더 시도하고, 그래도 안 되면 여기서 문구를 띄운다.
    function saveCurrentPdf(file, docHash, pageCount) {
      if (!store) return;
      store.saveDocument(file, docHash, pageCount).then((res) => {
        if (res && res.ok) {
          renderRecentDocs();
          return;
        }
        const reason = res && res.reason;
        if (reason === "unsupported") return; // 이 브라우저는 원래 최근 문서를 못 쓴다
        showRestoreStatus(
          reason === "quota"
            ? "저장 공간이 가득 차 이 문서를 '최근 문서'에 담지 못했습니다. 목록에서 몇 개를 지워 주세요."
            : "이 문서를 '최근 문서'에 담지 못했습니다."
        );
      });
    }

    // ---------- 최근 문서 목록(최대 5개, LRU) ----------
    const recentDocsEl = document.getElementById("recent-docs");
    const recentDocsListEl = document.getElementById("recent-docs-list");

    function hideRecentDocs() {
      if (recentDocsEl) recentDocsEl.hidden = true;
    }

    async function renderRecentDocs() {
      if (!store || !recentDocsEl || !recentDocsListEl) return;
      // 문서를 이미 열어 둔 상태에서는 첫 화면 목록을 띄우지 않는다.
      if (pdfDoc) {
        hideRecentDocs();
        return;
      }
      const docs = await store.listDocuments();
      if (!docs.length) {
        hideRecentDocs();
        return;
      }
      const now = Date.now();
      recentDocsListEl.innerHTML = docs
        .map(
          (doc) =>
            `<li class="recent-doc" data-id="${escapeHtml(String(doc.id))}">` +
            `<button type="button" class="recent-doc-open">${escapeHtml(store.formatRecentLabel(doc, now))}` +
            `<span class="recent-doc-size">${escapeHtml(store.formatSize(doc.size))}</span></button>` +
            `<button type="button" class="recent-doc-delete" aria-label="목록에서 삭제" title="목록에서 삭제">✕</button>` +
            `</li>`
        )
        .join("");
      recentDocsEl.hidden = false;
    }

    if (recentDocsListEl) {
      recentDocsListEl.addEventListener("click", async (e) => {
        const item = e.target.closest(".recent-doc");
        if (!item) return;
        const id = item.dataset.id;
        if (e.target.closest(".recent-doc-delete")) {
          await store.deleteDocument(id);
          await renderRecentDocs();
          return;
        }
        if (!e.target.closest(".recent-doc-open")) return;
        const rec = await store.loadDocument(id);
        if (!rec) {
          showRestoreStatus("이 문서를 다시 열지 못했습니다. 목록에서 지우고 다시 올려 주세요.");
          return;
        }
        const file = store.toFile(rec);
        if (!file) return;
        hideRestoreStatus();
        hideRecentDocs();
        // LRU 는 savedAt 기준이다. 다시 연 문서를 갱신하지 않으면 방금 본 것이
        // 먼저 밀려난다. Blob 을 다시 쓰지 않도록 저장 계층에서 메타만 손댄다.
        if (store.touchDocument) store.touchDocument(id);
        await handlePdfFile(file, { persist: false });
      });
    }

    // 500ms 디바운스: 한 글자마다 직렬화+localStorage 쓰기를 하면 긴 논문에서
    // 입력이 눈에 띄게 끊긴다.
    let saveTextTimer = null;
    let textSaveWarned = false;
    if (store && textarea) {
      textarea.addEventListener("input", () => {
        clearTimeout(saveTextTimer);
        saveTextTimer = setTimeout(() => {
          // 내용을 지우면 저장본도 사라진다(saveText 내부에서 removeItem).
          const res = store.saveText(textarea.value);
          // 저장 실패를 삼키면 "새로고침했더니 글이 사라졌다"가 된다. 다만
          // 입력 중 500ms 마다 문구가 깜빡이지 않도록 한 번만 알린다.
          if (res && !res.ok && res.reason !== "empty" && !textSaveWarned) {
            textSaveWarned = true;
            showRestoreStatus(
              res.reason === "too-large"
                ? "글이 너무 길어(200KB 초과) 자동 저장하지 않습니다. 새로고침하면 사라집니다."
                : "자동 저장을 하지 못했습니다. 새로고침하면 입력한 글이 사라질 수 있습니다."
            );
          }
        }, 500);
      });
    }

    function restoreDraftText() {
      if (!store || !textarea) return;
      const rec = store.loadText();
      if (!rec) return;
      // PDF 를 이미 열어 둔 상태(pdfDoc)나 입력이 있는 상태는 덮어쓰지 않는다.
      // #pdf-viewer 는 초기 마크업에 hidden 속성이 없어서 "보이는지"로는
      // PDF 로드 여부를 판별할 수 없다 — pdfDoc 이 실제 상태다.
      if (pdfDoc || textarea.value.trim()) return;
      textarea.value = rec.text;
      findBtn.disabled = rec.text.trim().length === 0;
      // value를 코드로 넣으면 input 이벤트가 나지 않아 자동 분석이 시작되지
      // 않는다. 복원해 놓고 버튼을 다시 누르게 하면 "이어서"가 아니므로 직접 건다.
      scheduleAutoAnalysis({ immediate: true });
      showRestoreStatus("이전에 작성하던 텍스트를 복원했습니다", [
        {
          label: "지우기",
          onClick: () => {
            textarea.value = "";
            findBtn.disabled = true;
            clearSavedText();
            hideRestoreStatus();
            // 빈 입력과 같은 경로로 결과·팝오버를 초기화한다.
            scheduleAutoAnalysis();
            textarea.focus();
          },
        },
      ]);
    }

    // 자동 복원이 아니라 사용자가 목록에서 고르게 한다 — 큰 PDF 는 렌더 비용이
    // 커서, 뷰어에 들어왔다고 무조건 다시 그리면 손해다.
    restoreDraftText();
    renderRecentDocs();
  })();
}
