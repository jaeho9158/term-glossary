function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchTerms(text, terms) {
  const results = [];

  for (const term of terms) {
    let count = 0;
    let firstStart = -1;
    let firstLength = 0;

    if (term.title_en) {
      const re = new RegExp(`\\b${escapeRegExp(term.title_en)}\\b`, "gi");
      let m;
      while ((m = re.exec(text)) !== null) {
        count++;
        if (firstStart === -1 || m.index < firstStart) {
          firstStart = m.index;
          firstLength = m[0].length;
        }
      }
    }

    if (term.title_ko) {
      let idx = text.indexOf(term.title_ko);
      while (idx !== -1) {
        count++;
        if (firstStart === -1 || idx < firstStart) {
          firstStart = idx;
          firstLength = term.title_ko.length;
        }
        idx = text.indexOf(term.title_ko, idx + term.title_ko.length);
      }
    }

    if (count > 0) {
      results.push({
        slug: term.slug,
        title_ko: term.title_ko,
        title_en: term.title_en,
        categories: term.categories,
        definition: term.definition,
        count,
        firstStart,
        firstLength,
      });
    }
  }

  results.sort((a, b) => b.count - a.count);
  return results;
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
        <a href="terms/${match.slug}.html" class="term-card-detail">자세히 보기</a>
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
    let currentMatches = [];

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
      return cachedTerms;
    }

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
        currentMatches = matchTerms(text, terms);
        if (updateInputPane) {
          renderRenderedPane(text, currentMatches);
        }
        filterInput.disabled = false;
        renderMatchedTerms(currentMatches, "");
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

            canvas.width=viewport.width;
            canvas.height=viewport.height;

            const ctx=canvas.getContext("2d");

            await page.render({
                canvasContext:ctx,
                viewport
            }).promise;

            viewer.appendChild(canvas);
        }
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
