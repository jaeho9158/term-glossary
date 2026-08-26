let viewerFuse;

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
// majority of hits without ever touching the (expensive, O(index size)
// per query) fuzzy Fuse search below.
// A dictionary key that is itself a bare Korean particle (or too short to
// mean anything on its own) makes ordinary particle-attached words match a
// completely unrelated term — e.g. the finance term "로" (Rho) exact-matching
// every stray "~로" in normal prose. Guard the index itself rather than the
// matcher, so this protects every caller (exact pass, prefix pass, PDF
// per-page pass) in one place.
const PARTICLE_SET = new Set(KOREAN_PARTICLES);

// Some dictionary entries use an everyday, high-frequency Korean word as
// their title for one narrow specialized sense — e.g. "단가" (Danga, a
// pansori prelude song) is also the ordinary business word for "unit price",
// and "보존"/"등록"/"복원" (a museum-domain "conservation"/"registration"/
// "restoration") are common general verbs. An exact match on these fires on
// nearly every unrelated document that happens to use the everyday word,
// with no way to tell from string matching alone which sense was meant.
// Curated as we find them (see matching-quality reports) rather than derived
// automatically — there's no Korean word-frequency corpus wired in here to
// detect "this is an everyday word" computationally.
const AMBIGUOUS_COMMON_WORD_TITLES = new Set([
  "단가", "보존", "등록", "복원", "열화", "환수", "후원", "유증", "응답",
  // Found via a follow-up audit (2026-08): each of these is a social-work/
  // criminology/archaeology/forestry/music/translation term whose everyday
  // sense (confirmed by testing an unrelated sample paragraph) is both far
  // more common in ordinary academic writing and effectively unrelated to
  // the dictionary's narrow sense — e.g. "강도" overwhelmingly means
  // "intensity" (운동 강도), not "robbery"; "단계" means any generic "stage/
  // step", not specifically an archaeological phase; "배경" in a paper
  // almost always means "background" (연구 배경), not literary Setting.
  "요약", "접수", "소진", "점검", "균형", "대처", "자문", "환기", "경계",
  "직면", "강도", "배경", "시점", "단계", "갱신", "해결", "왜곡",
  // Full-site audit (2026-08), all 103 categories, each confirmed against a
  // realistic everyday-sense sentence via matchTerms. "감사" (Auditor) was
  // considered and deliberately NOT added — unlike these, its "audit" sense
  // is common enough in real business/administrative documents (the kind of
  // text this feature is actually used on) that excluding it would lose more
  // correct matches than it prevents wrong ones.
  "요소", "사료", "타자", "전사", "번역", "실속", "교차", "직시", "철창", "불안",
  "구분", "검증", "과실", "인수", "재발", "채권",
  "가구", "대조", "도식", "동화", "조절", "의지", "보장", "안정제", "구축",
  "산출", "성과", "적절성", "교란", "이력", "피로", "코어", "밀봉",
  "완화", "대비", "대응", "신속성", "강건성", "알선", "링크", "렌치",
]);

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
    if (term.title_ko && !AMBIGUOUS_COMMON_WORD_TITLES.has(term.title_ko)) {
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
      difficulty: term.difficulty,
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
    if (a.score !== b.score) return a.score - b.score;
    return b.count - a.count;
  });
  return results;
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

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DIFFICULTY_LABELS = { 1: "쉬움", 2: "보통", 3: "어려움" };

function termCardHTML(match) {
  const enPart = match.title_en ? ` <span class="term-en">(${escapeHtml(match.title_en)})</span>` : "";
  const definitionPart = match.definition
    ? `<p class="term-card-definition">${escapeHtml(match.definition)}</p>`
    : "";
  const difficultyLabel = DIFFICULTY_LABELS[match.difficulty];
  const difficultyPart = difficultyLabel
    ? `<span class="term-card-difficulty" data-difficulty="${match.difficulty}">${difficultyLabel}</span>`
    : "";
  return `<li class="term-card" data-slug="${match.slug}">
        <button type="button" class="term-card-hide-btn" data-hide-slug="${match.slug}" title="이 용어 숨기기" aria-label="이 용어 숨기기">✕</button>
        <span class="term-card-name">${escapeHtml(match.title_ko)}${enPart}${difficultyPart}</span>
        ${definitionPart}
        <a href="terms/${match.slug}.html" class="term-card-detail" target="_blank" rel="noopener">자세히 보기 →</a>
      </li>`;
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
  for (const span of kept) {
    html += escapeHtml(text.slice(cursor, span.firstStart));
    const matchedText = text.slice(span.firstStart, span.firstStart + span.firstLength);
    html += `<mark class="dict-mark" data-slug="${span.slug}" data-covers="${span.covered.join(" ")}">${escapeHtml(matchedText)}</mark>`;
    cursor = span.firstStart + span.firstLength;
  }
  html += escapeHtml(text.slice(cursor));

  return html;
}

// Reconstructs a page’s plain text from pdf.js getTextContent() items,
// the same way buildOffsetMap() reconstructs it from the rendered DOM: a
// space is inserted between two items only when the horizontal gap between
// them (relative to text height) is wide enough to be a real inter-word
// gap, not just because they are two separate items. pdf.js commonly splits
// one visual word across multiple items (font-run changes, kerning), and
// items.map(i => i.str).join(" ") used to insert a space at every one of
// those splits, corrupting the extracted text with words broken in half.
function joinTextItems(items) {
  const NEWLINE = String.fromCharCode(10);
  let text = "";
  let prevItem = null;
  let prevEndX = 0;
  let prevY = 0;
  for (const item of items) {
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { escapeRegExp, matchTerms, matchTermsWithIndex, buildExactIndex, escapeHtml, buildHighlightedHtml, computeKeptSpans, termCardHTML, wrapPageRange, buildOffsetMap, joinTextItems };
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
    const PDF_MIN_SCALE = 0.5;
    const PDF_MAX_SCALE = 3;
    let annotationsCache = [];
    let pendingSelection = null;
    let activeMemo = null; // { record, marks }

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
    const editTextBtn = document.getElementById("edit-text-btn");
    const filterInput = document.getElementById("term-filter");
    const countHeading = document.getElementById("matched-count");
    const termsList = document.getElementById("matched-terms");
    const difficultyCheckboxes = document.querySelectorAll("#difficulty-filter-group input[type=checkbox]");
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
        const { textLayerDiv, page, range, quoteText } = pendingSelection;
        const color = btn.dataset.color;
        hideHighlightToolbar();
        window.getSelection().removeAllRanges();

        const { map } = buildOffsetMap(textLayerDiv);
        const startEntry = map.find((entry) => entry.node === range.startContainer);
        const endEntry = map.find((entry) => entry.node === range.endContainer);
        if (!startEntry || !endEntry) return;
        const startOffset = startEntry.start + range.startOffset;
        const endOffset = endEntry.start + range.endOffset;
        if (endOffset <= startOffset) return;

        const { createAnnotation } = await import("./pdf-annotations.js");
        const record = await createAnnotation(currentDocHash, lastPdfFilename, {
          page,
          startOffset,
          endOffset,
          quoteText,
          color,
          note: "",
        });
        if (!record) return;

        const marks = wrapPageRange(textLayerDiv, startOffset, endOffset, () => {
          const mark = document.createElement("mark");
          mark.className = "user-mark";
          mark.dataset.color = color;
          mark.dataset.annotationId = String(record.id);
          return mark;
        });

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
        await updateAnnotationNote(currentDocHash, record.id, note);
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
        await deleteAnnotation(currentDocHash, record.id);
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
      return `<li class="note-card" data-id="${escapeHtml(String(record.id))}">
        <span class="note-card-dot" data-color="${escapeHtml(record.color)}"></span>
        <div class="note-card-body">
          <p class="note-card-quote">${escapeHtml(record.quoteText || "")}</p>
          ${noteText}
          <span class="note-card-page">p.${record.page}</span>
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
        const mark = document.querySelector(`#pdf-viewer mark.user-mark[data-annotation-id="${CSS.escape(id)}"]`);
        if (!mark) return;
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        mark.classList.add("mark-flash");
        setTimeout(() => mark.classList.remove("mark-flash"), 1200);
      });
    }

    async function loadAndRenderAnnotations() {
      if (!currentDocHash) return;
      const { loadAnnotations } = await import("./pdf-annotations.js");
      annotationsCache = await loadAnnotations(currentDocHash);
      for (const record of annotationsCache) {
        const textLayerDiv = document.querySelector(
          `#pdf-viewer .pdf-page-wrap[data-page="${record.page}"] .textLayer`
        );
        if (!textLayerDiv) continue;
        wrapPageRange(textLayerDiv, record.startOffset, record.endOffset, () => {
          const mark = document.createElement("mark");
          mark.className = "user-mark";
          mark.dataset.color = record.color;
          mark.dataset.annotationId = String(record.id);
          return mark;
        });
      }
      renderNotesList();
    }

    // Delegate clicks on existing user highlights to reopen the memo popover.
    document.getElementById("pdf-viewer").addEventListener("click", (e) => {
      const mark = e.target.closest("mark.user-mark");
      if (!mark) return;
      const id = mark.dataset.annotationId;
      const record = annotationsCache.find((a) => String(a.id) === String(id));
      if (!record) return;
      const marks = document.querySelectorAll(
        `#pdf-viewer mark.user-mark[data-annotation-id="${CSS.escape(id)}"]`
      );
      showMemoPopover(record, marks, mark.getBoundingClientRect());
    });

    // The highlight-color toolbar must only appear after an actual click-
    // and-drag text selection — not a plain click (which collapses any
    // selection anyway) and not a double-click word-select, which produces
    // a non-collapsed selection with zero mouse movement. Tracking the
    // mousedown position and gating on a minimum drag distance is what
    // "collapsed" alone can't catch.
    let pdfMouseDownPos = null;
    document.getElementById("pdf-viewer").addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      pdfMouseDownPos = { x: e.clientX, y: e.clientY };
    });

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

    document.getElementById("pdf-viewer").addEventListener("mouseup", (e) => {
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
        const wrap = anchorEl && anchorEl.closest(".pdf-page-wrap");
        if (!wrap) {
          hideHighlightToolbar();
          return;
        }
        const textLayerDiv = wrap.querySelector(".textLayer");
        const quoteText = range.toString().trim();
        if (!textLayerDiv || !quoteText) {
          hideHighlightToolbar();
          return;
        }
        pendingSelection = {
          textLayerDiv,
          page: Number(wrap.dataset.page),
          range: range.cloneRange(),
          quoteText,
        };
        showHighlightToolbar(range.getBoundingClientRect());
      }, 0);
    });

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
      const res = await fetch("terms.json");
      cachedTerms = await res.json();

      const searchData = cachedTerms.flatMap(term => {
        const arr = [];

        if (term.title_ko) {
            arr.push({
                slug: term.slug,
                keyword: term.title_ko,
                keywordNormalized: term.title_ko.replace(/\s+/g, ""),
                lang: "ko",
                term
            });
        }

        if (term.title_en) {
            arr.push({
                slug: term.slug,
                keyword: term.title_en,
                keywordNormalized: term.title_en
                    .toLowerCase()
                    .replace(/[-_\s]/g, ""),
                lang: "en",
                term
            });
        }
        return arr;
    });

    viewerFuse = new Fuse(searchData, {
        includeScore: true,
        shouldSort: true,
        ignoreLocation: true,
        threshold: 0.28,
        minMatchCharLength: 2,
        keys: [
            { name: "keyword", weight: 0.7 },
            { name: "keywordNormalized", weight: 1.0 }
        ]
      });

      exactIndex = buildExactIndex(cachedTerms);

      return cachedTerms;
    }

    // Each Fuse fuzzy search scans the whole ~13,000-entry index, and it's
    // measurably slow (tens of ms) even off the main thread's blocking path —
    // so this cap bounds total wall-clock time, not just avoids freezing.
    // A real paper's non-term words (stopwords, author names, etc.) vastly
    // outnumber genuine near-miss typos of a term title, so a modest cap
    // still catches the useful cases without dragging the analysis out.
    const FUZZY_WORD_CAP = 800;
    const FUZZY_CHUNK_SIZE = 20; // words per chunk between UI-yielding pauses
    // A short word has very little room for a genuine 1-character typo before
    // it edit-distance-matches a completely different, unrelated term, so
    // 4-character words were a steady source of noisy fuzzy hits; 5 keeps
    // the near-miss safety net without that blast radius.
    const FUZZY_MIN_WORD_LENGTH = 5;
    const FUZZY_SCORE_THRESHOLD = 0.2; // tighter than Fuse's own 0.28 config threshold below

    // Fuse's threshold is a *ratio* of edit distance to string length, so for
    // short strings a "0.28" match can still be a completely different word
    // that happens to share a couple of characters (e.g. "속도와" fuzzy-hit
    // "속도와가속도"/Velocity and Acceleration, which never appeared in the
    // text). Requiring the matched keyword's length to be reasonably close to
    // the query word's length rejects these compound-term false positives
    // without needing a stricter (and more typo-intolerant) global threshold.
    //
    // A diff of 2 still let a whole extra Korean morpheme (2 syllables) get
    // tacked onto an otherwise-unrelated compound and count as a "near miss"
    // — e.g. "빈도분석" (frequency analysis, a generic stats term used in
    // almost every paper) fuzzy-matching "체장빈도분석" (a fisheries-specific
    // "length-frequency analysis" term), which never appeared in the text.
    // Real typos/spacing variants differ by 0–1 characters; anything wider is
    // a different compound term, not a near-miss of the one in the text.
    const FUZZY_MAX_LENGTH_DIFF = 1;

    function yieldToUi() {
      return new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Runs Fuse fuzzy search only over words the exact pass didn't already
    // resolve, in small chunks with yields in between so the tab stays
    // responsive even on a large paper with thousands of unique words.
    async function runFuzzyPass(text, exactMatches) {
      const alreadyMatchedSlugs = new Set(exactMatches.map((m) => m.slug));
      const candidateEntries = [...wordOccurrences(text)].filter(
        ([word]) =>
          normalizeWord(word).length >= FUZZY_MIN_WORD_LENGTH &&
          findExactMatches(word, exactIndex).length === 0
      );

      const resultsMap = new Map();
      let processed = 0;

      for (const [word, starts] of candidateEntries.slice(0, FUZZY_WORD_CAP)) {
        // A trailing particle left on the word (e.g. "빈도분석과") inflates
        // its length just enough to slip inside FUZZY_MAX_LENGTH_DIFF of an
        // unrelated, longer compound term. Use only the most particle-stripped
        // form (the last one candidateNormalizedForms yields) as the word's
        // canonical root — trying the raw form *as well* just doubles the
        // false-positive surface, since the raw form's extra particle
        // character(s) are exactly what let it drift into range of an
        // unrelated compound.
        const forms = [...candidateNormalizedForms(word)];
        const { form: normalized } = forms[forms.length - 1];
        const fuseResults = viewerFuse.search(normalized, { limit: 3 });

        for (const r of fuseResults) {
          if (r.score > FUZZY_SCORE_THRESHOLD) continue;
          const keywordLength = (r.item.keywordNormalized || r.item.keyword || "").length;
          if (Math.abs(keywordLength - normalized.length) > FUZZY_MAX_LENGTH_DIFF) continue;
          recordMatch(resultsMap, r.item.term, starts, word.length, r.score);
        }

        processed++;
        if (processed % FUZZY_CHUNK_SIZE === 0) await yieldToUi();
      }

      // Drop anything the exact pass already found under a different word —
      // that count/position is already reflected in exactMatches.
      for (const slug of alreadyMatchedSlugs) resultsMap.delete(slug);

      return sortMatches(resultsMap);
    }

    function mergeMatches(exactMatches, fuzzyMatches) {
      const bySlug = new Map(exactMatches.map((m) => [m.slug, { ...m }]));
      for (const m of fuzzyMatches) {
        if (!bySlug.has(m.slug)) {
          bySlug.set(m.slug, { ...m });
          continue;
        }
        const existing = bySlug.get(m.slug);
        existing.count += m.count;
        existing.occurrences = [...(existing.occurrences || []), ...(m.occurrences || [])].sort(
          (a, b) => a.start - b.start
        );
        if (existing.occurrences.length) {
          existing.firstStart = existing.occurrences[0].start;
          existing.firstLength = existing.occurrences[0].length;
        }
      }
      return sortMatches(bySlug);
    }

    function openPdfViewer() {

        const modal = document.getElementById("pdf-modal");
        const fullView = document.getElementById("pdf-full-view");
        const viewer = document.getElementById("pdf-viewer");

        fullView.innerHTML = "";

        viewer.querySelectorAll("canvas").forEach(canvas => {
            const copy = document.createElement("canvas");

            copy.width = canvas.width;
            copy.height = canvas.height;

            copy.getContext("2d").drawImage(canvas, 0, 0);

            fullView.appendChild(copy);
        });

        modal.classList.add("show");
    }

    const modal = document.getElementById("pdf-modal");
    const closeBtn = document.getElementById("close-pdf");

    closeBtn.onclick = function () {
        modal.classList.remove("show");
    };

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
    function renderRenderedPane(text) {
      if (!renderedPane) return;
      renderedPane.innerHTML = escapeHtml(text);
      renderedPane.hidden = false;
      textarea.hidden = true;
      if (editTextBtn) editTextBtn.hidden = false;
    }

    function showTextInput() {
      if (renderedPane) {
        renderedPane.hidden = true;
        renderedPane.innerHTML = "";
      }
      textarea.hidden = false;
      if (editTextBtn) editTextBtn.hidden = true;
    }

// Populates the category dropdown with only the categories actually present
    // in this document's matches — no point offering 40 categories when the
    // paper only touched 3 of them.
    function populateCategoryFilterOptions(matches) {
      if (!categoryFilterSelect) return;
      const codes = new Set();
      matches.forEach((m) => (m.categories || []).forEach((c) => codes.add(c)));
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

    function getSelectedDifficulties() {
      return new Set(
        Array.from(difficultyCheckboxes)
          .filter((cb) => cb.checked)
          .map((cb) => Number(cb.value))
      );
    }

    // A paper with many matches (a full-length thesis easily surfaces 30+)
    // used to dump every term card straight down the sidebar, one after
    // another, with no way to see how many more were below the fold. Only
    // the first page of cards renders up front, with a "더 보기" button
    // (matching the same pattern the term-list pages already use) to reveal
    // the rest a page at a time.
    const TERM_CARD_PAGE_SIZE = 8;

    function renderTermCardsPaged(filtered) {
      const existingMoreBtn = document.getElementById("term-card-more-btn");
      if (existingMoreBtn) existingMoreBtn.remove();

      if (!filtered.length) {
        termsList.innerHTML = `<li class="term-list-empty">조건에 맞는 용어가 없습니다.</li>`;
        return;
      }

      termsList.innerHTML = filtered.slice(0, TERM_CARD_PAGE_SIZE).map(termCardHTML).join("");

      if (filtered.length > TERM_CARD_PAGE_SIZE) {
        const moreBtn = document.createElement("button");
        moreBtn.type = "button";
        moreBtn.id = "term-card-more-btn";
        moreBtn.className = "term-list-more-btn";
        moreBtn.textContent = `${filtered.length - TERM_CARD_PAGE_SIZE}개 더 보기`;
        moreBtn.addEventListener("click", () => {
          termsList.insertAdjacentHTML("beforeend", filtered.slice(TERM_CARD_PAGE_SIZE).map(termCardHTML).join(""));
          moreBtn.remove();
        });
        termsList.insertAdjacentElement("afterend", moreBtn);
      }
    }

    function renderMatchedTerms(matches, filterQuery) {
      if (matches.length === 0) {
        countHeading.textContent = "본문에서 사전 등록된 용어를 찾지 못했습니다.";
        termsList.innerHTML = "";
        if (showHiddenTermsBtn) showHiddenTermsBtn.hidden = true;
        return;
      }

      populateCategoryFilterOptions(matches);

      const q = (filterQuery || "").trim().toLowerCase();
      const selectedDifficulties = getSelectedDifficulties();
      const categoryCode = categoryFilterSelect ? categoryFilterSelect.value : "";
      const englishOnly = englishOnlyFilter ? englishOnlyFilter.checked : false;
      const hiddenCount = matches.filter((m) => hiddenSlugs.has(m.slug)).length;

      const filtered = matches.filter((m) => {
        if (hiddenSlugs.has(m.slug)) return false;
        if (q && !(m.title_ko.toLowerCase().includes(q) || (m.title_en || "").toLowerCase().includes(q))) return false;
        // Unknown/missing difficulty is never filtered out by the difficulty
        // checkboxes — only terms we can actually classify are affected.
        if (m.difficulty != null && !selectedDifficulties.has(m.difficulty)) return false;
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

      if (showHiddenTermsBtn) {
        showHiddenTermsBtn.hidden = hiddenCount === 0;
        showHiddenTermsBtn.textContent = hiddenCount ? `숨긴 용어 ${hiddenCount}개 다시 보기` : "";
      }
    }

    function scrollToMark(slug) {
      const mark =
        document.querySelector(`.viewer-rendered mark[data-slug="${slug}"], #pdf-viewer mark[data-slug="${slug}"]`) ||
        document.querySelector(`.viewer-rendered mark[data-covers~="${slug}"], #pdf-viewer mark[data-covers~="${slug}"]`);
      if (!mark) return;
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
      mark.classList.add("mark-flash");
      setTimeout(() => mark.classList.remove("mark-flash"), 1200);
    }

    // Automatic inline highlighting (both in the PDF text layer and the
    // plain-text rendered pane) was removed: pdf.js text extraction is
    // reliable enough for the "찾은 용어" sidebar list (which only needs to
    // know a term is present, not exactly where), but not reliable enough to
    // promise every highlighted span lands on the right stretch of text —
    // real documents kept surfacing new position/word-boundary edge cases
    // after several rounds of fixes. Hiding a term now only needs to update
    // the sidebar list; there's no inline mark to unwrap anywhere anymore.
    function hideTermEverywhere(slug) {
      hiddenSlugs.add(slug);
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

    difficultyCheckboxes.forEach((cb) =>
      cb.addEventListener("change", () => renderMatchedTerms(currentMatches, filterInput.value))
    );
    if (categoryFilterSelect) {
      categoryFilterSelect.addEventListener("change", () => renderMatchedTerms(currentMatches, filterInput.value));
    }
    if (englishOnlyFilter) {
      englishOnlyFilter.addEventListener("change", () => renderMatchedTerms(currentMatches, filterInput.value));
    }

    async function runAnalysis(text, { updateInputPane = true } = {}) {
      findBtn.disabled = true;
      findBtn.textContent = "찾는 중...";
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
        renderMatchedTerms(currentMatches, filterInput.value);

        // The fuzzy (typo-tolerant) pass that used to run here has been
        // disabled: for a dictionary this dense (38k+ short Korean compound
        // terms that commonly share a 1-character-different suffix/prefix,
        // e.g. "빈도분석"/"잔차분석"/"입도분석기"), no length-diff or score
        // threshold tuning kept finding a new false-positive shape — three
        // rounds of tightening each surfaced a different unrelated term
        // getting highlighted. Exact + particle-stripped matching only
        // (matchTerms above) is what keeps highlights trustworthy; see
        // runFuzzyPass/mergeMatches below, kept but unused in case a safer
        // approach (e.g. requiring shared word-initial characters, not just
        // bounded edit distance) is worth revisiting later.
        logPaperHistory(text);
      } catch (err) {
        countHeading.textContent = "용어 데이터를 불러오지 못했습니다. 새로고침 해주세요.";
        termsList.innerHTML = "";
      } finally {
        findBtn.disabled = textarea.value.trim().length === 0;
        findBtn.textContent = "용어 찾기";
      }
    }

    findBtn.addEventListener("click", () => {
      runAnalysis(textarea.value);
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
    const pdfSearchInput = document.getElementById("pdf-search-input");
    const pdfSearchPrevBtn = document.getElementById("pdf-search-prev");
    const pdfSearchNextBtn = document.getElementById("pdf-search-next");
    const pdfSearchCount = document.getElementById("pdf-search-count");

    if (pdfZoomOutBtn) pdfZoomOutBtn.addEventListener("click", () => rerenderPdfAtScale(pdfScale - 0.25));
    if (pdfZoomInBtn) pdfZoomInBtn.addEventListener("click", () => rerenderPdfAtScale(pdfScale + 0.25));
    if (pdfZoomFitBtn) {
      pdfZoomFitBtn.addEventListener("click", async () => {
        if (!pdfDoc) return;
        pdfScale = await computeFitWidthScale(pdfDoc);
        await rerenderPdfAtScale(pdfScale);
      });
    }

    // Plain substring search over each page's already-reconstructed text
    // (the same buildOffsetMap() output the dictionary highlighter uses),
    // independent of dictionary terms — this is "find in this PDF", the
    // control readers expect from any PDF viewer and that "찾은 용어 내 검색"
    // (which only filters the sidebar term list) doesn't provide.
    function clearPdfSearchMarks() {
      for (const div of pdfTextLayerDivs) {
        div.querySelectorAll("mark.search-mark").forEach(unwrapMark);
      }
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
      for (const textLayerDiv of pdfTextLayerDivs) {
        const { text: pageText, map: pageOffsetMap } = buildOffsetMap(textLayerDiv);
        const lowerText = pageText.toLowerCase();
        const ranges = [];
        let from = 0;
        for (;;) {
          const idx = lowerText.indexOf(q, from);
          if (idx === -1) break;
          ranges.push({ start: idx, end: idx + q.length });
          from = idx + q.length;
        }
        // Descending order: wrapping a range splits text nodes at/after it,
        // so later (higher-offset) ranges must be wrapped first.
        ranges.reverse();
        for (const range of ranges) {
          const marks = wrapPageRange(textLayerDiv, range.start, range.end, () => {
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
      const availableWidth = viewerEl.clientWidth - 20; // minus the pane's own padding
      if (!availableWidth || availableWidth <= 0) return 1.5;
      const scale = availableWidth / baseViewport.width;
      return Math.max(PDF_MIN_SCALE, Math.min(PDF_MAX_SCALE, scale));
    }

    // `probedTextContent` is only passed on the very first render of a
    // freshly-uploaded file; a zoom change calls this again with it omitted,
    // which also signals "keep pdfTextContentCache" so re-rendering at a new
    // scale doesn't re-run getTextContent() (a real, if secondary, parse
    // cost) for every page a second time.
    async function renderPdf(pdf, probedTextContent, onProgress) {
      const viewer = document.getElementById("pdf-viewer");
      viewer.innerHTML = "";
      pdfDoc = pdf;
      pdfTextLayerDivs = [];
      if (probedTextContent) pdfTextContentCache = new Map();

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

        const pageWrap = document.createElement("div");
        pageWrap.className = "pdf-page-wrap";
        pageWrap.dataset.page = String(i);
        pageWrap.style.width = `${viewport.width}px`;
        pageWrap.style.height = `${viewport.height}px`;

        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page";
        canvas.addEventListener("dblclick", openPdfViewer);
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const textLayerDiv = document.createElement("div");
        textLayerDiv.className = "textLayer";
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;

        // Attach the page shell before drawing into it, so pages show up one
        // by one as they finish rather than all at once at the very end.
        pageWrap.appendChild(canvas);
        pageWrap.appendChild(textLayerDiv);
        viewer.appendChild(pageWrap);
        pdfTextLayerDivs.push(textLayerDiv);

        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

        let textContent = (probedTextContent && probedTextContent.get(i)) || pdfTextContentCache.get(i);
        if (textContent) {
          if (probedTextContent) probedTextContent.delete(i);
        } else {
          textContent = await page.getTextContent();
        }
        pdfTextContentCache.set(i, textContent);

        await window.pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        }).promise;

        pageTexts.push(joinTextItems(textContent.items));

        if (onProgress) onProgress(i, pdf.numPages);
      }

      if (pdfToolbar) pdfToolbar.hidden = false;
      if (pdfZoomLabel) pdfZoomLabel.textContent = `${Math.round(pdfScale * 100)}%`;

      return pageTexts.join("\n").trim();
    }

    // Re-renders every page at a new scale, reusing the cached getTextContent()
    // results above so zooming re-parses nothing — only re-rasterizes the
    // canvas and rebuilds the text layer + highlights.
    async function rerenderPdfAtScale(newScale) {
      if (!pdfDoc) return;
      pdfScale = Math.max(PDF_MIN_SCALE, Math.min(PDF_MAX_SCALE, newScale));
      const viewerEl = document.getElementById("pdf-viewer");
      const scrollRatio = viewerEl.scrollHeight > 0 ? viewerEl.scrollTop / viewerEl.scrollHeight : 0;
      await renderPdf(pdfDoc, null);
      viewerEl.scrollTop = scrollRatio * viewerEl.scrollHeight;
    }

    pdfInput.addEventListener("change", async () => {
      const file = pdfInput.files[0];
      if (!file) return;

      pdfStatus.hidden = false;
      pdfStatus.textContent = "PDF 분석 중...";
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
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        const probed = await probePdfText(pdf);
        if (!hasAnyText(probed)) {
          throw new Error("empty-text-layer");
        }

        lastPdfFilename = file.name;

        // Reveal the viewer before rendering starts, so the reader watches
        // pages fill in instead of staring at a frozen "분석 중" message until
        // the whole document is done.
        showTextInput();
        textarea.hidden = true;
        pdfViewer.hidden = false;

        const text = await renderPdf(pdf, probed, (done, total) => {
          pdfStatus.textContent = `PDF 페이지 표시 중... (${done}/${total})`;
        });

        pdfStatus.hidden = true;
        textarea.value = text;
        await runAnalysis(text, { updateInputPane: false });
        await loadAndRenderAnnotations();
      } catch (err) {
        console.error("[pdf-upload]", err);
        pdfStatus.hidden = true;
        showTextInput();
        pdfViewer.hidden = true;
        pdfViewer.innerHTML = "";
        countHeading.textContent = "이 PDF에서 텍스트를 추출하지 못했습니다. 텍스트를 직접 복사해 붙여넣어 주세요. (오류: " + err.message + ")";
        termsList.innerHTML = "";
        textarea.value = "";
        findBtn.disabled = true;
        currentDocHash = null;
      } finally {
        pdfInput.value = "";
      }
    });
  })();
}
