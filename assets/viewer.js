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
function buildExactIndex(terms) {
  const map = new Map();
  const add = (key, term) => {
    if (!key) return;
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

// All exact-index hits for a single word: the word itself (or a
// particle-stripped form of it), plus any shorter prefix of it — e.g. word
// "분산분석" (ANOVA) also surfaces "분산" (variance) as a prefix match, since
// Korean compound terms are commonly [shorter term][modifier/suffix]. Bounded
// by word length, so still O(1)-ish per word — no fuzzy search involved.
const MIN_PREFIX_LENGTH = 2;

function findExactMatches(word, exactIndex) {
  const hits = [];
  const seenForms = new Set();

  for (const candidate of candidateNormalizedForms(word)) {
    if (seenForms.has(candidate.form)) continue;
    seenForms.add(candidate.form);
    const candidates = exactIndex.get(candidate.form);
    if (candidates) hits.push({ candidates, matchedLength: candidate.matchedLength });
  }

  // Prefix containment only makes sense for Korean tokens: there's no space
  // to mark where a compound noun ends, unlike English/Latin words where the
  // regex tokenizer already respects word boundaries (so "ANOVAtest" must
  // NOT be treated as containing "ANOVA").
  if (/[가-힣]/.test(word)) {
    const normalized = normalizeWord(word);
    for (let len = normalized.length - 1; len >= MIN_PREFIX_LENGTH; len--) {
      const prefix = normalized.slice(0, len);
      if (seenForms.has(prefix)) continue;
      seenForms.add(prefix);
      const candidates = exactIndex.get(prefix);
      if (candidates) hits.push({ candidates, matchedLength: len });
    }
  }

  return hits;
}

// Exact-match pass only: fast, synchronous, no fuzzy search. This is the
// primary matcher — cheap enough to run on documents of any size without
// blocking the page.
function matchTerms(text, terms) {
  const exactIndex = buildExactIndex(terms);
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
        <a href="terms/${match.slug}.html" class="term-card-detail" target="_blank" rel="noopener">자세히 보기</a>
      </li>`;
}

function buildHighlightedHtml(text, matches) {
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { escapeRegExp, matchTerms, escapeHtml, buildHighlightedHtml, termCardHTML };
}

if (typeof document !== "undefined") {
  (function () {
    let cachedTerms = null;
    let exactIndex = null;
    let currentMatches = [];
    let lastPdfFilename = null;

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
        console.error(err);

        countHeading.textContent =
            err.message;
        termsList.innerHTML = "";
      }
    }

    const textarea = document.getElementById("paper-text");
    const findBtn = document.getElementById("find-terms-btn");
    const inputPane = document.getElementById("viewer-input-pane");
    const filterInput = document.getElementById("term-filter");
    const countHeading = document.getElementById("matched-count");
    const termsList = document.getElementById("matched-terms");

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
    const FUZZY_MIN_WORD_LENGTH = 3; // skip short common words — low value, high noise

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
        const normalized = normalizeWord(word);
        const fuseResults = viewerFuse.search(normalized, { limit: 3 });

        for (const r of fuseResults) {
          if (r.score > 0.28) continue;
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
        document.querySelector(`mark[data-slug="${slug}"]`) ||
        document.querySelector(`mark[data-covers~="${slug}"]`);
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

        // Fuzzy pass runs in chunks afterward to catch near-misses (typos,
        // spacing variants) without blocking the tab on large papers.
        findBtn.textContent = "추가 용어 찾는 중...";
        const fuzzyMatches = await runFuzzyPass(text, exactMatches);
        if (fuzzyMatches.length) {
          currentMatches = mergeMatches(exactMatches, fuzzyMatches);
          if (updateInputPane) {
            renderRenderedPane(text, currentMatches);
          }
          renderMatchedTerms(currentMatches, filterInput.value);
        }

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

        for(let i=1;i<=pdf.numPages;i++){

            const page=await pdf.getPage(i);

            const viewport=page.getViewport({
                scale:1.5
            });

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

            viewer.appendChild(canvas);
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

      try {
        const text = await extractPdfText(file);
        if (text.length === 0) {
          throw new Error("empty-text-layer");
        }
        lastPdfFilename = file.name;
        await renderPdf(file);
        textarea.hidden = true;
        pdfViewer.hidden = false;
        pdfStatus.hidden = true;
        textarea.value = text;
        await runAnalysis(text, { updateInputPane: false });
      } catch (err) {
        pdfStatus.hidden = true;
        textarea.hidden = false;
        pdfViewer.hidden = true;
        pdfViewer.innerHTML = "";
        countHeading.textContent = "이 PDF에서 텍스트를 추출하지 못했습니다. 텍스트를 직접 복사해 붙여넣어 주세요.";
        termsList.innerHTML = "";
        textarea.value = "";
        findBtn.disabled = true;
      } finally {
        pdfInput.value = "";
      }
    });
  })();
}
