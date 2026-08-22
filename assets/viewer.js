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

// Frequency map so repeated occurrences of the same word are actually
// counted, instead of collapsing to 1 via the deduped word list above.
function wordFrequency(text) {
  const freq = new Map();
  for (const w of text.match(/[가-힣A-Za-z-]+/g) || []) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return freq;
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
    if (term.title_ko) add(normalizeWord(term.title_ko), term);
    if (term.title_en) add(normalizeWord(term.title_en), term);
  }
  return map;
}

function recordMatch(resultsMap, term, idx, wordLength, score, increment = 1) {
  if (!resultsMap.has(term.slug)) {
    resultsMap.set(term.slug, {
      slug: term.slug,
      title_ko: term.title_ko,
      title_en: term.title_en,
      definition: term.definition,
      categories: term.categories,
      count: increment,
      score,
      firstStart: idx,
      firstLength: wordLength,
    });
  } else {
    const item = resultsMap.get(term.slug);
    item.count += increment;
    if (idx < item.firstStart) {
      item.firstStart = idx;
      item.firstLength = wordLength;
    }
    item.score = Math.min(item.score, score);
  }
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

  for (const [word, count] of wordFrequency(text)) {
    const hits = findExactMatches(word, exactIndex);
    if (!hits.length) continue;
    const idx = text.indexOf(word);
    if (idx === -1) continue;
    for (const hit of hits) {
      for (const term of hit.candidates) {
        recordMatch(resultsMap, term, idx, hit.matchedLength, 0, count);
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

function termCardHTML(match) {
  const enPart = match.title_en ? ` <span class="term-en">(${escapeHtml(match.title_en)})</span>` : "";
  const definitionPart = match.definition
    ? `<p class="term-card-definition">${escapeHtml(match.definition)}</p>`
    : "";
  return `<li class="term-card" data-slug="${match.slug}">
        <span class="term-card-name">${escapeHtml(match.title_ko)}${enPart}</span>
        ${definitionPart}
        <a href="terms/${match.slug}.html" class="term-card-detail" target="_blank" rel="noopener">자세히 보기 →</a>
      </li>`;
}

// Resolves overlapping matches down to a non-overlapping list, keeping the
// earliest-starting match at each position and recording which other slugs
// were suppressed there (via `covered`). Shared by the plain-text renderer
// (buildHighlightedHtml) and the PDF text-layer renderer.
function computeKeptSpans(text, matches) {
  const spans = matches
    .filter((m) => m.firstStart >= 0)
    .sort((a, b) => a.firstStart - b.firstStart);

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
      lastKept.covered.push(span.slug);
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

async function computeDocHash(file) {
  try {
    const buf = await file.arrayBuffer();
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
    const filterInput = document.getElementById("term-filter");
    const countHeading = document.getElementById("matched-count");
    const termsList = document.getElementById("matched-terms");

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
      const candidateEntries = [...wordFrequency(text)].filter(
        ([word]) =>
          normalizeWord(word).length >= FUZZY_MIN_WORD_LENGTH &&
          findExactMatches(word, exactIndex).length === 0
      );

      const resultsMap = new Map();
      let processed = 0;

      for (const [word, count] of candidateEntries.slice(0, FUZZY_WORD_CAP)) {
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
          const term = r.item.term;
          const idx = text.indexOf(word);
          if (idx === -1) continue;
          recordMatch(resultsMap, term, idx, word.length, r.score, count);
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
        if (m.firstStart < existing.firstStart) {
          existing.firstStart = m.firstStart;
          existing.firstLength = m.firstLength;
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

    function renderRenderedPane(text, matches) {
      inputPane.innerHTML = `<div class="viewer-rendered" id="viewer-rendered">${buildHighlightedHtml(text, matches)}</div>`;
    }

    function renderMatchedTerms(matches, filterQuery) {
      if (matches.length === 0) {
        countHeading.textContent = "본문에서 사전 등록된 용어를 찾지 못했습니다.";
        termsList.innerHTML = "";
        return;
      }

      const q = (filterQuery || "").trim().toLowerCase();
      const filtered = matches.filter((m) => {
        if (!q) return true;
        return m.title_ko.toLowerCase().includes(q) || (m.title_en || "").toLowerCase().includes(q);
      });

      countHeading.textContent = `이 논문에 나온 용어 (${matches.length}개)`;
      termsList.innerHTML = filtered.map(termCardHTML).join("");
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
      if (e.target.closest(".term-card-detail")) return;
      const card = e.target.closest(".term-card");
      if (!card) return;
      scrollToMark(card.dataset.slug);
    });

    filterInput.addEventListener("input", () => {
      renderMatchedTerms(currentMatches, filterInput.value);
    });

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

    const pdfInput = document.getElementById("pdf-upload");
    const pdfStatus = document.getElementById("pdf-status");
    const pdfViewer = document.getElementById("pdf-viewer");

    async function extractPdfText(file) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        fullText += content.items.map((item) => item.str).join(" ") + "\n";
      }
      return fullText.trim();
    }

    async function renderPdf(file){

        const arrayBuffer = await file.arrayBuffer();

        const pdf = await window.pdfjsLib
            .getDocument({data:arrayBuffer})
            .promise;

        const viewer = document.getElementById("pdf-viewer");

        viewer.innerHTML="";

        // loadTerms() also populates the module-level exactIndex used below.
        await loadTerms();

        for(let i=1;i<=pdf.numPages;i++){

            const page=await pdf.getPage(i);

            const viewport=page.getViewport({
                scale:1.5
            });

            const pageWrap = document.createElement("div");
            pageWrap.className = "pdf-page-wrap";
            pageWrap.dataset.page = String(i);
            pageWrap.style.width = `${viewport.width}px`;
            pageWrap.style.height = `${viewport.height}px`;

            const canvas=document.createElement("canvas");

            canvas.className="pdf-page";

            canvas.addEventListener("dblclick", openPdfViewer);

            canvas.width=viewport.width;
            canvas.height=viewport.height;

            const ctx=canvas.getContext("2d");

            await page.render({
                canvasContext:ctx,
                viewport
            }).promise;

            const textLayerDiv = document.createElement("div");
            textLayerDiv.className = "textLayer";
            textLayerDiv.style.width = `${viewport.width}px`;
            textLayerDiv.style.height = `${viewport.height}px`;

            const textContent = await page.getTextContent();
            const textLayerTask = window.pdfjsLib.renderTextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport,
            });
            await textLayerTask.promise;

            pageWrap.appendChild(canvas);
            pageWrap.appendChild(textLayerDiv);
            viewer.appendChild(pageWrap);

            // Dictionary term highlighting, scoped to this page's own text
            // (exact-match pass only — cheap enough to run per page, and the
            // sidebar's whole-document fuzzy pass already covers near-misses).
            const { text: pageText, map: pageOffsetMap } = buildOffsetMap(textLayerDiv);
            if (pageText.trim()) {
              // Reuse the dictionary's exact index (built once in loadTerms())
              // instead of rebuilding it per page, and wrap all of this page's
              // matches against one offset map instead of rebuilding it per
              // match — both scaled with page count / match count and were
              // what made PDFs with many dictionary hits freeze the tab.
              const pageMatches = matchTermsWithIndex(pageText, exactIndex);
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
        }

        const pane = document.getElementById("viewer-input-pane");

        pane.classList.remove("no-pdf");
        pane.classList.add("has-pdf");
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
        const text = await extractPdfText(file);
        if (text.length === 0) {
          throw new Error("empty-text-layer");
        }
        lastPdfFilename = file.name;
        currentDocHash = await computeDocHash(file);
        await renderPdf(file);
        textarea.hidden = true;
        pdfViewer.hidden = false;
        pdfStatus.hidden = true;
        textarea.value = text;
        await runAnalysis(text, { updateInputPane: false });
        await loadAndRenderAnnotations();
      } catch (err) {
        console.error("[pdf-upload]", err);
        pdfStatus.hidden = true;
        textarea.hidden = false;
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
