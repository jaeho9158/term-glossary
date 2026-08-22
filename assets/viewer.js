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
    html += `<mark data-slug="${span.slug}" data-covers="${span.covered.join(" ")}">${escapeHtml(matchedText)}</mark>`;
    cursor = span.firstStart + span.firstLength;
  }
  html += escapeHtml(text.slice(cursor));

  return html;
}

// ---- PDF text-layer offset mapping -----------------------------------
// The PDF text layer is made of one <span> per extracted text item ("leaf"
// spans; PDF.js also inserts non-leaf <span class="markedContent"> wrapper
// groups which we skip). We rebuild a flat "page text" string by
// concatenating each leaf span's text with a single joining space, and keep
// a start/end offset for every underlying Text node so we can turn a
// character range back into a DOM Range. This map is rebuilt from the live
// DOM every time it's needed, so it stays correct even after earlier
// highlights have split text nodes.
function buildOffsetMap(container) {
  const leafSpans = container.querySelectorAll("span:not(.markedContent)");
  let text = "";
  const map = [];
  let firstSpan = true;
  for (const span of leafSpans) {
    if (!firstSpan) text += " ";
    firstSpan = false;
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
  module.exports = { escapeRegExp, matchTerms, matchTermsWithIndex, buildExactIndex, escapeHtml, buildHighlightedHtml, computeKeptSpans, termCardHTML, wrapPageRange, buildOffsetMap };
}

if (typeof document !== "undefined") {
  (function () {
    let cachedTerms = null;
    let exactIndex = null;
    let currentMatches = [];
    let lastPdfFilename = null;
    let currentDocHash = null;
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

    document.getElementById("pdf-viewer").addEventListener("mouseup", () => {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
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
    function renderRenderedPane(text, matches) {
      if (!renderedPane) return;
      renderedPane.innerHTML = buildHighlightedHtml(text, matches);
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
      termsList.innerHTML = filtered.length
        ? filtered.map(termCardHTML).join("")
        : `<li class="term-list-empty">조건에 맞는 용어가 없습니다.</li>`;

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

    termsList.addEventListener("click", (e) => {
      const hideBtn = e.target.closest(".term-card-hide-btn");
      if (hideBtn) {
        hiddenSlugs.add(hideBtn.dataset.hideSlug);
        saveHiddenSlugs(hiddenSlugs);
        renderMatchedTerms(currentMatches, filterInput.value);
        return;
      }
      if (e.target.closest(".term-card-detail")) return;
      const card = e.target.closest(".term-card");
      if (!card) return;
      scrollToMark(card.dataset.slug);
    });

    if (showHiddenTermsBtn) {
      showHiddenTermsBtn.addEventListener("click", () => {
        hiddenSlugs.clear();
        saveHiddenSlugs(hiddenSlugs);
        renderMatchedTerms(currentMatches, filterInput.value);
      });
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
          renderRenderedPane(text, currentMatches);
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
    async function renderPdf(pdf, probedTextContent, onProgress) {
      const viewer = document.getElementById("pdf-viewer");
      viewer.innerHTML = "";

      // loadTerms() also populates the module-level exactIndex used below.
      await loadTerms();

      const pageTexts = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });

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

        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

        let textContent = probedTextContent && probedTextContent.get(i);
        if (textContent) probedTextContent.delete(i);
        else textContent = await page.getTextContent();

        await window.pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        }).promise;

        pageTexts.push(textContent.items.map((item) => item.str).join(" "));

        // Dictionary term highlighting, scoped to this page's own text
        // (exact-match pass only — cheap enough to run per page).
        const { text: pageText, map: pageOffsetMap } = buildOffsetMap(textLayerDiv);
        if (pageText.trim()) {
          // Reuse the dictionary's exact index (built once in loadTerms())
          // instead of rebuilding it per page, and wrap all of this page's
          // matches against one offset map instead of rebuilding it per
          // match — both scaled with page count / match count and were
          // what made PDFs with many dictionary hits freeze the tab.
          const pageMatches = matchTermsWithIndex(pageText, exactIndex);
          // Descending order is required: wrapping a range splits the text
          // nodes at and after it, invalidating the shared offset map for
          // higher offsets while leaving still-unprocessed lower ones intact.
          const kept = computeKeptSpans(pageText, pageMatches)
            .sort((a, b) => b.firstStart - a.firstStart);
          for (const span of kept) {
            wrapPageRange(textLayerDiv, span.firstStart, span.firstStart + span.firstLength, () => {
              const mark = document.createElement("mark");
              mark.className = "dict-mark";
              mark.dataset.slug = span.slug;
              mark.dataset.covers = span.covered.join(" ");
              return mark;
            }, pageOffsetMap);
          }
        }

        if (onProgress) onProgress(i, pdf.numPages);
      }

      const pane = document.getElementById("viewer-input-pane");
      pane.classList.remove("no-pdf");
      pane.classList.add("has-pdf");

      return pageTexts.join("\n").trim();
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
