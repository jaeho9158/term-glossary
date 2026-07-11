# 논문 뷰어 개선 (가시성 · 인라인 풀이 · PDF 업로드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the existing `viewer.html` paper-viewer feature: make it more visible sitewide, show a one-line definition inline in each matched-term card, and let users upload a PDF (auto-extracted and auto-analyzed) instead of only pasting text.

**Architecture:** All new logic stays client-side, consistent with the existing zero-server design. A one-time Node migration script extracts each term's existing "한 줄 정의" sentence out of its `terms/{slug}.html` page into a new `definition` field on `terms.json` (no new authoring burden). PDF.js is vendored (self-hosted, no CDN) and loaded as an ES module in a small inline `<script type="module">` in `viewer.html`, which exposes it as `window.pdfjsLib` for the existing classic-script `assets/viewer.js` to call. `assets/viewer.js`'s button-click matching logic is extracted into one shared `runAnalysis(text)` function so both the "용어 찾기" button and the new PDF upload path call the same code.

**Tech Stack:** Vanilla HTML/CSS/JS (no bundler), Node.js for the one-time migration script and for running the existing plain-`assert` test scripts, PDF.js (`pdfjs-dist@4.0.379`, vendored as static files, no npm install/build step at runtime).

## Global Constraints

- No server, no AI API calls — 100% client-side (spec: "서버/AI API 없이 클라이언트에서만 동작").
- PDF.js must be self-hosted under `assets/vendor/pdfjs/` — no external CDN `<script src>` at runtime.
- Nav "논문 뷰어" link gets a pill-button style (`class="nav-cta"`) on exactly 5 pages: `index.html`, `about.html`, `contact.html`, `privacy.html`, `viewer.html`. No other nav links change style.
- Matched-term cards show only the one-line `definition` (not the longer "쉽게 풀면" paragraph) — omit the paragraph entirely when a term has no `definition` (no placeholder text like "정의 없음").
- PDF upload: on successful text extraction, auto-run matching immediately (no extra button click). On failed extraction, show "이 PDF에서 텍스트를 추출하지 못했습니다. 텍스트를 직접 복사해 붙여넣어 주세요." and fall back to an empty, editable textarea.
- `terms.json`'s existing one-object-per-line compact format (see current file) must be preserved when adding the `definition` field — do not reformat the whole file with a pretty-printer.

---

### Task 1: Extract term definitions into `terms.json`

**Files:**
- Create: `scripts/extract-definitions.js`
- Create: `tests/definitions.test.js`
- Modify: `terms.json` (adds a `definition` field to all 180 entries)

**Interfaces:**
- Produces: every entry in `terms.json` gains a `definition: string` field (plain text, no HTML tags), read by Task 3's `termCardHTML`.

- [ ] **Step 1: Write the failing test**

Create `tests/definitions.test.js`:

```js
const assert = require("assert");
const terms = require("../terms.json");

// Test 1: every term has a non-empty definition string
{
  const missing = terms.filter((t) => typeof t.definition !== "string" || t.definition.trim().length === 0);
  assert.strictEqual(missing.length, 0, `terms missing definition: ${missing.map((t) => t.slug).join(", ")}`);
}

// Test 2: a definition whose source page embeds a link is stripped to plain text
{
  const cnn = terms.find((t) => t.slug === "convolutional-neural-network");
  assert.strictEqual(
    cnn.definition,
    "작은 필터를 이미지 위에서 이동시키며 선, 모서리, 무늬 같은 지역적 특징을 단계적으로 뽑아내는 신경망 구조입니다."
  );

  const gt = terms.find((t) => t.slug === "grounded-theory");
  assert.strictEqual(
    gt.definition,
    "데이터로부터 반복적으로 개념을 도출해 이론을 구축하는 질적연구 방법입니다."
  );
}

// Test 3: double quotes inside a definition survive the JSON round-trip intact
{
  const pValue = terms.find((t) => t.slug === "p-value");
  assert.strictEqual(
    pValue.definition,
    '지금 관찰된 결과가 "우연히" 나왔을 가능성이 얼마나 되는지를 나타내는 숫자입니다.'
  );
}

console.log("definitions: all tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/definitions.test.js`
Expected: FAIL with an `AssertionError` (e.g. `missing.length` is not `0`, since no `definition` field exists yet)

- [ ] **Step 3: Write the extraction script**

Create `scripts/extract-definitions.js`:

```js
const fs = require("fs");
const path = require("path");

const termsPath = path.join(__dirname, "..", "terms.json");
const termsDir = path.join(__dirname, "..", "terms");

const terms = JSON.parse(fs.readFileSync(termsPath, "utf8"));
const missing = [];

for (const term of terms) {
  const filePath = path.join(termsDir, `${term.slug}.html`);
  const html = fs.readFileSync(filePath, "utf8");
  const match = html.match(/한 줄 정의:<\/strong>\s*([^\n]+)/);

  if (!match) {
    missing.push(term.slug);
    continue;
  }

  term.definition = match[1].replace(/<[^>]+>/g, "").trim();
}

const lines = terms.map((term) => "  " + JSON.stringify(term));
fs.writeFileSync(termsPath, "[\n" + lines.join(",\n") + "\n]\n", "utf8");

if (missing.length > 0) {
  console.error("Missing definition for:", missing.join(", "));
  process.exitCode = 1;
} else {
  console.log(`Extracted definitions for all ${terms.length} terms.`);
}
```

- [ ] **Step 4: Run the script**

Run: `node scripts/extract-definitions.js`
Expected: `Extracted definitions for all 180 terms.` (exit code 0, no stderr output)

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/definitions.test.js`
Expected: `definitions: all tests passed`

Also spot-check the file kept its original one-object-per-line style:

Run: `node -e "console.log(require('fs').readFileSync('terms.json','utf8').split('\n')[1])"`
Expected: a single line starting with `  {"slug":"p-value",` and ending with `,"definition":"..."}`(no comma after the closing brace, since it's not the first-column comma style — the trailing comma between array entries is added by the script's own `join(",\n")`, so this is just confirming the field landed at the end of the object)

- [ ] **Step 6: Run the existing test suite to confirm no regression**

Run: `node tests/viewer-match.test.js && node tests/viewer-highlight.test.js`
Expected: both `... all tests passed` lines (these tests don't touch `definition`, but they do load fixture term objects shaped like `terms.json`'s entries, so confirm nothing else broke)

- [ ] **Step 7: Commit**

```bash
git add scripts/extract-definitions.js tests/definitions.test.js terms.json
git commit -m "feat: 용어 페이지에서 한 줄 정의를 추출해 terms.json에 추가"
```

---

### Task 2: Vendor PDF.js

**Files:**
- Create: `assets/vendor/pdfjs/pdf.min.mjs`
- Create: `assets/vendor/pdfjs/pdf.worker.min.mjs`
- Create: `assets/vendor/pdfjs/LICENSE`

**Interfaces:**
- Produces: `assets/vendor/pdfjs/pdf.min.mjs` exports (among others) `getDocument` and `GlobalWorkerOptions`, consumed by Task 4's inline module loader in `viewer.html`.

- [ ] **Step 1: Download the pinned PDF.js build files**

```bash
mkdir -p assets/vendor/pdfjs
curl -sL -o assets/vendor/pdfjs/pdf.min.mjs https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.min.mjs
curl -sL -o assets/vendor/pdfjs/pdf.worker.min.mjs https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs
curl -sL -o assets/vendor/pdfjs/LICENSE https://unpkg.com/pdfjs-dist@4.0.379/LICENSE
```

- [ ] **Step 2: Verify the downloads are complete and non-trivial in size**

Run: `ls -la assets/vendor/pdfjs/`
Expected: `pdf.min.mjs` around 300KB (must be well over 100000 bytes — a truncated/failed download would be near 0), `pdf.worker.min.mjs` around 1MB (must be well over 500000 bytes), `LICENSE` a few KB.

- [ ] **Step 3: Verify `pdf.min.mjs` is a loadable ES module with the expected exports**

Run: `node -e "import('./assets/vendor/pdfjs/pdf.min.mjs').then(m => console.log(typeof m.getDocument, typeof m.GlobalWorkerOptions))"`
Expected: `function object`

- [ ] **Step 4: Commit**

```bash
git add assets/vendor/pdfjs/
git commit -m "chore: PDF.js 4.0.379 자체 호스팅 벤더 파일 추가"
```

---

### Task 3: Inline definition on matched-term cards (`termCardHTML`)

**Files:**
- Modify: `assets/viewer.js:130-136` (move `termCardHTML` out of the browser-only DOM block into a top-level, exported, pure function; add definition rendering)
- Create: `tests/viewer-card.test.js`

**Interfaces:**
- Consumes: a match object shaped like Task 1's `terms.json` entries plus `matchTerms`'s existing fields — `{slug, title_ko, title_en, definition, ...}`.
- Produces: `termCardHTML(match: {slug, title_ko, title_en, definition}) => string` (HTML string for one `<li class="term-card">`), exported via the existing `module.exports` guard alongside `matchTerms`/`buildHighlightedHtml`/`escapeHtml`. Consumed by the DOM-wiring block's `renderMatchedTerms` (unchanged call site, `filtered.map(termCardHTML).join("")`).

- [ ] **Step 1: Write the failing test**

Create `tests/viewer-card.test.js`:

```js
const assert = require("assert");
const { termCardHTML } = require("../assets/viewer.js");

// Test 1: renders Korean name, English name, definition, and detail link
{
  const html = termCardHTML({
    slug: "p-value",
    title_ko: "유의확률",
    title_en: "p-value",
    definition: "지금 관찰된 결과가 우연히 나왔을 가능성을 나타내는 숫자입니다.",
  });
  assert.ok(html.includes('data-slug="p-value"'), "should carry the slug as a data attribute");
  assert.ok(html.includes("유의확률"), "should show the Korean name");
  assert.ok(html.includes("(p-value)"), "should show the English name in parentheses");
  assert.ok(
    html.includes("지금 관찰된 결과가 우연히 나왔을 가능성을 나타내는 숫자입니다."),
    "should show the one-line definition"
  );
  assert.ok(html.includes('href="terms/p-value.html"'), "should link to the detail page");
}

// Test 2: omits the definition paragraph entirely when definition is missing
{
  const html = termCardHTML({ slug: "unknown-term", title_ko: "알수없음", title_en: "" });
  assert.ok(!html.includes("term-card-definition"), "should not render a definition paragraph at all");
}

// Test 3: escapes HTML special characters in the definition text
{
  const html = termCardHTML({
    slug: "x",
    title_ko: "테스트",
    title_en: "",
    definition: 'a < b & "c"',
  });
  assert.ok(html.includes("a &lt; b &amp; &quot;c&quot;"), "should escape <, &, and \" in the definition");
  assert.ok(!html.includes('a < b & "c"'), "should not contain the raw unescaped definition");
}

console.log("termCardHTML: all tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/viewer-card.test.js`
Expected: FAIL with `TypeError: termCardHTML is not a function` (it's not exported yet, still defined only inside the DOM-only block)

- [ ] **Step 3: Move and rewrite `termCardHTML`**

In `assets/viewer.js`, inside the `if (typeof document !== "undefined")` block, delete this exact function (it currently sits between `renderRenderedPane` and `renderMatchedTerms`):

```js
    function termCardHTML(match) {
      const enPart = match.title_en ? ` <span class="term-en">(${match.title_en})</span>` : "";
      return `<li class="term-card" data-slug="${match.slug}">
        <span class="term-card-name">${match.title_ko}${enPart}</span>
        <a href="terms/${match.slug}.html" class="term-card-detail">자세히 보기</a>
      </li>`;
    }
```

Add this top-level function instead, placed right after the existing `escapeHtml` function definition and before `buildHighlightedHtml`:

```js
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
```

Update the `module.exports` line (currently `module.exports = { escapeRegExp, matchTerms, escapeHtml, buildHighlightedHtml };`) to:

```js
module.exports = { escapeRegExp, matchTerms, escapeHtml, buildHighlightedHtml, termCardHTML };
```

The DOM-wiring block's `renderMatchedTerms` function already calls `filtered.map(termCardHTML).join("")` — since `termCardHTML` is now a top-level function in the same file, this call site needs no change.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/viewer-card.test.js`
Expected: `termCardHTML: all tests passed`

Also re-run the existing suite to confirm nothing broke:

Run: `node tests/viewer-match.test.js && node tests/viewer-highlight.test.js && node tests/definitions.test.js`
Expected: all three `... all tests passed` lines

- [ ] **Step 5: Commit**

```bash
git add assets/viewer.js tests/viewer-card.test.js
git commit -m "feat: 매칭 카드에 한 줄 정의 인라인 표시"
```

---

### Task 4: Shared analysis function + PDF upload

**Files:**
- Modify: `assets/viewer.js` (the `if (typeof document !== "undefined")` DOM-wiring block: extract `runAnalysis`, add PDF upload handler)
- Modify: `viewer.html` (add file input UI + inline PDF.js module loader script)

**Interfaces:**
- Consumes: `window.pdfjsLib` (set by `viewer.html`'s inline module script from Task 2's vendored files) — specifically `pdfjsLib.getDocument({data}).promise` resolving to a PDF document object with `.numPages` and `.getPage(n)`, and `pdfjsLib.GlobalWorkerOptions.workerSrc`.
- Consumes: `matchTerms`, `buildHighlightedHtml` (Tasks 1-2 of the original plan) and `termCardHTML` (Task 3 above) — unchanged signatures.
- Produces: no new exports — this task's code is browser-only DOM wiring, not unit-testable via Node (matching how the original `viewer.html`/DOM-wiring task was verified: static self-review by the implementer, then a live browser check by the controller before this task is marked complete).

- [ ] **Step 1: Add the file input UI to `viewer.html`**

In `viewer.html`, replace this block:

```html
    <div class="viewer-input" id="viewer-input-pane">
      <textarea id="paper-text" placeholder="논문 초록이나 본문 일부를 붙여넣어 보세요. 예: 본 연구는 유의확률(p-value)이 0.05 미만인 경우를 통계적으로 유의한 상관관계로 정의하였다."></textarea>
      <button id="find-terms-btn" type="button" disabled>용어 찾기</button>
    </div>
```

with:

```html
    <div class="viewer-input" id="viewer-input-pane">
      <textarea id="paper-text" placeholder="논문 초록이나 본문 일부를 붙여넣어 보세요. 예: 본 연구는 유의확률(p-value)이 0.05 미만인 경우를 통계적으로 유의한 상관관계로 정의하였다."></textarea>
      <div class="viewer-input-actions">
        <button id="find-terms-btn" type="button" disabled>용어 찾기</button>
        <label class="pdf-upload-label" for="pdf-upload">📄 PDF 파일 선택</label>
        <input type="file" id="pdf-upload" accept="application/pdf" hidden>
      </div>
      <p id="pdf-status" hidden aria-live="polite"></p>
    </div>
```

- [ ] **Step 2: Load PDF.js in `viewer.html`**

In `viewer.html`, replace this line:

```html
<script src="assets/viewer.js"></script>
```

with:

```html
<script type="module">
  import * as pdfjsLib from "./assets/vendor/pdfjs/pdf.min.mjs";
  pdfjsLib.GlobalWorkerOptions.workerSrc = "./assets/vendor/pdfjs/pdf.worker.min.mjs";
  window.pdfjsLib = pdfjsLib;
</script>
<script src="assets/viewer.js"></script>
```

- [ ] **Step 3: Extract `runAnalysis` and add the PDF upload handler in `assets/viewer.js`**

In the `if (typeof document !== "undefined")` block, replace this:

```js
    findBtn.addEventListener("click", async () => {
      const text = textarea.value;
      findBtn.disabled = true;
      findBtn.textContent = "찾는 중...";
      try {
        const terms = await loadTerms();
        currentMatches = matchTerms(text, terms);
        renderRenderedPane(text, currentMatches);
        filterInput.disabled = false;
        renderMatchedTerms(currentMatches, "");
      } catch (err) {
        countHeading.textContent = "용어 데이터를 불러오지 못했습니다. 새로고침 해주세요.";
        termsList.innerHTML = "";
      }
    });
  })();
}
```

with:

```js
    async function runAnalysis(text) {
      findBtn.disabled = true;
      findBtn.textContent = "찾는 중...";
      try {
        const terms = await loadTerms();
        currentMatches = matchTerms(text, terms);
        renderRenderedPane(text, currentMatches);
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
        pdfStatus.hidden = true;
        textarea.value = text;
        await runAnalysis(text);
      } catch (err) {
        pdfStatus.hidden = true;
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
```

- [ ] **Step 4: Run the existing Node test suite to confirm no regression**

Run: `node tests/viewer-match.test.js && node tests/viewer-highlight.test.js && node tests/viewer-card.test.js && node tests/definitions.test.js`
Expected: all four `... all tests passed` lines (this task's new code is entirely inside the `if (typeof document !== "undefined")` guard, so it's inert under Node and must not affect these results)

- [ ] **Step 5: Manual browser verification checklist**

There is no headless browser test runner in this repo. Verify manually (or, if you are a controller with live browser tools, verify directly rather than delegating this step):
- Typing text and clicking "용어 찾기" still works exactly as before (regression check).
- Selecting a text-based PDF via "📄 PDF 파일 선택" shows "PDF 분석 중..." briefly, then auto-populates the rendered/highlighted view and the matched-term list without any extra click.
- Selecting a PDF with no extractable text layer (or an encrypted one) shows "이 PDF에서 텍스트를 추출하지 못했습니다. 텍스트를 직접 복사해 붙여넣어 주세요." and leaves the textarea empty and ready for manual paste.

- [ ] **Step 6: Commit**

```bash
git add viewer.html assets/viewer.js
git commit -m "feat: PDF 업로드 시 텍스트 자동 추출 및 자동 분석"
```

---

### Task 5: Styling — nav button, CTA banner, card definition, PDF upload UI

**Files:**
- Modify: `style.css` (append new rules)

**Interfaces:**
- Consumes: class names from Task 3 (`.term-card-definition`) and Task 4 (`.viewer-input-actions`, `.pdf-upload-label`, `#pdf-status`), plus Task 6's `.nav-cta` and `.viewer-promo` (written in this task's CSS ahead of Task 6's HTML, since Task 6 only adds the classes to existing markup).

- [ ] **Step 1: Append the new styles to `style.css`**

```css
.site-header nav a.nav-cta {
  margin-left: 16px;
  padding: 6px 14px;
  background: var(--accent);
  color: #fff;
  border-radius: 20px;
  font-size: 0.9rem;
  transition: opacity 0.2s ease;
}

.site-header nav a.nav-cta:hover {
  color: #fff;
  opacity: 0.85;
}

.viewer-promo {
  display: block;
  padding: 16px 18px;
  margin-bottom: 20px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent);
  border-radius: 8px;
  color: var(--text);
  text-decoration: none;
  font-size: 0.95rem;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.viewer-promo:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}

.viewer-promo strong {
  color: var(--accent);
}

.term-card-definition {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

.viewer-input-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.pdf-upload-label {
  padding: 10px 20px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.95rem;
  color: var(--text);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.pdf-upload-label:hover {
  border-color: var(--accent);
}

#pdf-status {
  color: var(--muted);
  font-size: 0.9rem;
  margin: 0;
}
```

- [ ] **Step 2: Manual browser verification**

Reopen `viewer.html` and `index.html` (once Task 6 adds the markup that uses these classes) and confirm:
- The "논문 뷰어" nav link is now a filled accent-colored pill button, distinct from the plain-text nav links next to it, on all 5 pages.
- The homepage promo banner has a left accent border and lifts slightly on hover, consistent with the existing `.term-list li a:hover` pattern.
- The definition text under a matched term's name is smaller and gray (`--muted`), clearly secondary to the name.
- The "📄 PDF 파일 선택" label looks like a button next to "용어 찾기", and the PDF-analyzing status text is visible when triggered.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style: nav 버튼, 홈 배너, 카드 정의, PDF 업로드 UI 스타일 추가"
```

---

### Task 6: Nav button rollout + homepage CTA banner

**Files:**
- Modify: `index.html:20` (nav link + new promo banner)
- Modify: `about.html:17` (nav link)
- Modify: `contact.html:17` (nav link)
- Modify: `privacy.html:17` (nav link)
- Modify: `viewer.html:20` (nav link)

**Interfaces:**
- Consumes: `.nav-cta` and `.viewer-promo` CSS classes from Task 5.

- [ ] **Step 1: Add `nav-cta` class to all 5 pages**

In `index.html`, `about.html`, `contact.html`, `privacy.html`, and `viewer.html`, find this exact line:

```html
      <a href="viewer.html">논문 뷰어</a>
```

Replace with:

```html
      <a href="viewer.html" class="nav-cta">논문 뷰어</a>
```

- [ ] **Step 2: Add the homepage CTA banner**

In `index.html`, find:

```html
  <p class="subtitle">논문에 나오는 어려운 학술용어를 쉽게 풀어드립니다.</p>

  <input type="search" id="term-search" placeholder="용어 검색 (예: p-value, 상관관계)" aria-label="용어 검색">
```

Replace with:

```html
  <p class="subtitle">논문에 나오는 어려운 학술용어를 쉽게 풀어드립니다.</p>

  <a class="viewer-promo" href="viewer.html">📄 <strong>논문 뷰어</strong> — 논문 텍스트를 붙여넣거나 PDF를 업로드하면 나온 용어를 바로 찾아드려요</a>

  <input type="search" id="term-search" placeholder="용어 검색 (예: p-value, 상관관계)" aria-label="용어 검색">
```

- [ ] **Step 3: Verify the nav rollout**

Run: `grep -l 'href="viewer.html" class="nav-cta">논문 뷰어' index.html about.html contact.html privacy.html viewer.html`
Expected: all 5 filenames printed, one per line

- [ ] **Step 4: Verify the homepage banner**

Run: `grep -c 'class="viewer-promo"' index.html`
Expected: `1`

- [ ] **Step 5: Manual browser verification**

Open `index.html` and confirm the promo banner renders between the subtitle and the search box, is clickable, and navigates to `viewer.html`. Confirm the nav pill button appears identically on all 5 pages.

- [ ] **Step 6: Commit**

```bash
git add index.html about.html contact.html privacy.html viewer.html
git commit -m "feat: 논문 뷰어 nav 버튼 및 홈페이지 배너 추가"
```

---

## Post-Plan Manual Regression Pass

After Task 6, do one full manual pass in the browser:
- Full end-to-end flow: paste text → matched cards show name + definition + "자세히 보기" → click a card → scrolls/flashes the right `<mark>` → click "자세히 보기" → lands on the term's detail page.
- Full PDF flow: upload a text-based PDF → auto-populates and auto-analyzes; upload a scanned/no-text-layer PDF → shows the fallback message and an empty, usable textarea.
- Homepage: promo banner visible and links to `viewer.html`; nav pill button visible and consistent across all 5 pages; existing homepage search/category browsing still works (regression check).
- Mobile width (below 720px): promo banner, nav pill, and PDF upload button all remain usable and don't overflow.
