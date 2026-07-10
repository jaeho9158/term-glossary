# 논문 뷰어(viewer.html) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new static page `viewer.html` where a pasted paper text is matched client-side against `terms.json`, showing matched terms in a right-hand panel (DBpia-style) that scrolls to and highlights the term's first occurrence in the text.

**Architecture:** Pure, dependency-free JS matching/rendering functions live in `assets/viewer.js` and are unit-tested with plain Node `assert` scripts (this repo has no build tooling or test framework — matching the existing `assets/site.js` style). The same file also contains a DOM-wiring block, guarded so it only runs in a browser, that connects those functions to `viewer.html`.

**Tech Stack:** Vanilla HTML/CSS/JS (no frameworks, no bundler, no npm dependencies), Node.js (already installed, v24) used only to run plain `assert`-based test scripts during development — never shipped to the site.

## Global Constraints

- No server, no AI API calls — 100% client-side matching against the existing `terms.json` (spec: "서버/AI API 없이 정적 사이트 내에서 클라이언트 매칭 방식으로 동작").
- Reuse existing `terms.json` structure unchanged: `{slug, title_ko, title_en, categories}`.
- Reuse existing visual language from `style.css` (`--accent`, `--border`, `--card-bg`, card-style list items) — no new design system.
- `viewer.html` needs a wider container (max-width 1200px) than the site's default 760px, applied only via a `.wide` class on that page's `<main>` — do not change the default `max-width` used by every other page.
- Nav link "논문 뷰어" is added only to the site-wide chrome pages (`index.html`, `about.html`, `contact.html`, `privacy.html`), not to the 100+ individual `terms/*.html` pages — out of scope per the approved spec, avoids a 100-file mechanical edit for a link those pages don't otherwise carry consistently as a target.
- English term matching must use word boundaries (`\b`) so e.g. "ANOVA" doesn't match inside "ANOVAtest".
- Only the **first** occurrence of each matched term is wrapped in `<mark>` in the rendered text (spec: "각 용어의 첫 매칭 위치를 highlight").

---

### Task 1: Term matching logic (`matchTerms`)

**Files:**
- Create: `assets/viewer.js`
- Create: `tests/viewer-match.test.js`

**Interfaces:**
- Produces: `matchTerms(text: string, terms: Array<{slug, title_ko, title_en, categories}>) => Array<{slug, title_ko, title_en, categories, count, firstStart, firstLength}>`, sorted by `count` descending. `firstStart`/`firstLength` mark the earliest occurrence's position in `text` (used by Task 2's `buildHighlightedHtml`).
- Produces: `escapeRegExp(str: string) => string` (internal helper, also exported for reuse/testing).
- Both exported via `module.exports` only when `typeof module !== "undefined"` (so the same file loads in a plain `<script>` tag in the browser without error).

- [ ] **Step 1: Write the failing test**

Create `tests/viewer-match.test.js`:

```js
const assert = require("assert");
const { matchTerms } = require("../assets/viewer.js");

const terms = [
  { slug: "p-value", title_ko: "유의확률", title_en: "p-value", categories: ["stat"] },
  { slug: "correlation", title_ko: "상관관계", title_en: "Correlation", categories: ["stat"] },
  { slug: "anova", title_ko: "분산분석", title_en: "ANOVA", categories: ["stat"] },
];

// Test 1: matches Korean and English occurrences, counts both, skips non-matches
{
  const text = "이 연구는 유의확률(p-value)이 0.05 미만일 때 상관관계가 유의하다고 보았다. 상관관계 분석을 두 번 반복했다.";
  const result = matchTerms(text, terms);
  assert.strictEqual(result.length, 2, "should match exactly 2 distinct terms");
  const bySlug = Object.fromEntries(result.map((r) => [r.slug, r]));
  assert.strictEqual(bySlug["p-value"].count, 2, "p-value: 유의확률 + p-value = 2 occurrences");
  assert.strictEqual(bySlug["correlation"].count, 2, "correlation: 상관관계 appears twice");
  assert.strictEqual(bySlug["anova"], undefined, "anova should not match (not present in text)");
}

// Test 2: results sorted by count descending
{
  const text = "상관관계, 상관관계, 상관관계는 유의확률과 다르다.";
  const result = matchTerms(text, terms);
  assert.strictEqual(result[0].slug, "correlation", "correlation (count 3) should sort first");
  assert.ok(result[0].count > result[1].count, "first result should have higher count than second");
}

// Test 3: English matching uses word boundaries, no partial-word match
{
  const text = "ANOVAtest is not the same as ANOVA test.";
  const result = matchTerms(text, terms);
  const anova = result.find((r) => r.slug === "anova");
  assert.strictEqual(anova.count, 1, "ANOVAtest must not count; only 'ANOVA test' counts");
}

// Test 4: firstStart/firstLength point at the earliest occurrence
{
  const text = "먼저 상관관계, 그리고 Correlation.";
  const result = matchTerms(text, terms);
  const correlation = result.find((r) => r.slug === "correlation");
  assert.strictEqual(text.slice(correlation.firstStart, correlation.firstStart + correlation.firstLength), "상관관계");
}

console.log("matchTerms: all tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/viewer-match.test.js`
Expected: FAIL with `Error: Cannot find module '../assets/viewer.js'`

- [ ] **Step 3: Write minimal implementation**

Create `assets/viewer.js`:

```js
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
        count,
        firstStart,
        firstLength,
      });
    }
  }

  results.sort((a, b) => b.count - a.count);
  return results;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { escapeRegExp, matchTerms };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/viewer-match.test.js`
Expected: `matchTerms: all tests passed`

- [ ] **Step 5: Commit**

```bash
git add assets/viewer.js tests/viewer-match.test.js
git commit -m "feat: 논문 뷰어 용어 매칭 로직(matchTerms) 추가"
```

---

### Task 2: Highlight rendering logic (`buildHighlightedHtml`)

**Files:**
- Modify: `assets/viewer.js` (append below Task 1's code, before the `module.exports` line)
- Create: `tests/viewer-highlight.test.js`

**Interfaces:**
- Consumes: `matchTerms`'s output shape — specifically each match's `slug`, `firstStart`, `firstLength` (Task 1).
- Produces: `buildHighlightedHtml(text: string, matches: Array<{slug, firstStart, firstLength}>) => string` — an HTML string with all text HTML-escaped, and exactly the first occurrence of each match wrapped in `<mark data-slug="SLUG">...</mark>`.
- Produces: `escapeHtml(str: string) => string` (also exported).

- [ ] **Step 1: Write the failing test**

Create `tests/viewer-highlight.test.js`:

```js
const assert = require("assert");
const { matchTerms, buildHighlightedHtml } = require("../assets/viewer.js");

const terms = [
  { slug: "p-value", title_ko: "유의확률", title_en: "p-value", categories: ["stat"] },
  { slug: "correlation", title_ko: "상관관계", title_en: "Correlation", categories: ["stat"] },
];

// Test 1: wraps first occurrence of each matched term in <mark data-slug="...">
{
  const text = "유의확률이 낮으면 상관관계가 있다고 본다.";
  const matches = matchTerms(text, terms);
  const html = buildHighlightedHtml(text, matches);
  assert.ok(html.includes('<mark data-slug="p-value">유의확률</mark>'), "p-value should be wrapped");
  assert.ok(html.includes('<mark data-slug="correlation">상관관계</mark>'), "correlation should be wrapped");
}

// Test 2: escapes HTML special characters outside marks
{
  const text = "조건 a < b 이고 상관관계가 있다.";
  const matches = matchTerms(text, terms);
  const html = buildHighlightedHtml(text, matches);
  assert.ok(html.includes("a &lt; b"), "should escape < as &lt;");
  assert.ok(!html.includes("a < b"), "should not contain raw <");
}

// Test 3: only the first occurrence is wrapped, later ones stay plain text
{
  const text = "상관관계, 상관관계, 상관관계.";
  const matches = matchTerms(text, terms);
  const html = buildHighlightedHtml(text, matches);
  const markCount = (html.match(/<mark /g) || []).length;
  assert.strictEqual(markCount, 1, "only first occurrence should be wrapped");
}

console.log("buildHighlightedHtml: all tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/viewer-highlight.test.js`
Expected: FAIL with `TypeError: buildHighlightedHtml is not a function` (it's `undefined` from the module)

- [ ] **Step 3: Write minimal implementation**

Append to `assets/viewer.js`, directly above the existing `if (typeof module !== "undefined" ...)` line:

```js
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHighlightedHtml(text, matches) {
  const spans = matches
    .filter((m) => m.firstStart >= 0)
    .sort((a, b) => a.firstStart - b.firstStart);

  const kept = [];
  let lastEnd = -1;
  for (const span of spans) {
    if (span.firstStart >= lastEnd) {
      kept.push(span);
      lastEnd = span.firstStart + span.firstLength;
    }
  }

  let html = "";
  let cursor = 0;
  for (const span of kept) {
    html += escapeHtml(text.slice(cursor, span.firstStart));
    const matchedText = text.slice(span.firstStart, span.firstStart + span.firstLength);
    html += `<mark data-slug="${span.slug}">${escapeHtml(matchedText)}</mark>`;
    cursor = span.firstStart + span.firstLength;
  }
  html += escapeHtml(text.slice(cursor));

  return html;
}
```

And update the exports line to:

```js
if (typeof module !== "undefined" && module.exports) {
  module.exports = { escapeRegExp, matchTerms, escapeHtml, buildHighlightedHtml };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/viewer-highlight.test.js`
Expected: `buildHighlightedHtml: all tests passed`

Also re-run Task 1's test to make sure nothing broke:

Run: `node tests/viewer-match.test.js`
Expected: `matchTerms: all tests passed`

- [ ] **Step 5: Commit**

```bash
git add assets/viewer.js tests/viewer-highlight.test.js
git commit -m "feat: 논문 뷰어 용어 하이라이트 렌더링(buildHighlightedHtml) 추가"
```

---

### Task 3: `viewer.html` page and DOM wiring

**Files:**
- Create: `viewer.html`
- Modify: `assets/viewer.js` (append a browser-only DOM-wiring block at the end of the file, after the `module.exports` line)

**Interfaces:**
- Consumes: `matchTerms(text, terms)` and `buildHighlightedHtml(text, matches)` (Tasks 1–2), called directly since this block runs in the same file/scope — no import needed in-browser.
- Produces: no new exports; this is the page's runtime behavior only.

- [ ] **Step 1: Create `viewer.html`**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>논문 뷰어 - 논문 텍스트에서 학술용어 찾기 | 논문용어사전</title>
<meta name="description" content="논문 본문을 붙여넣으면 사전에 등록된 통계·연구방법론 학술용어를 자동으로 찾아 우측에 보여주는 논문 뷰어입니다.">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="canonical" href="https://jaeho9158.github.io/term-glossary/viewer.html">
<meta property="og:title" content="논문 뷰어 - 논문용어사전">
<meta property="og:description" content="논문 본문을 붙여넣으면 등록된 학술용어를 자동으로 찾아줍니다.">
<meta property="og:type" content="website">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="site-header">
  <div class="inner">
    <a class="logo" href="index.html">논문용어사전</a>
    <nav>
      <a href="index.html">용어 목록</a>
      <a href="viewer.html">논문 뷰어</a>
      <a href="about.html">소개</a>
      <a href="contact.html">문의</a>
    </nav>
  </div>
</header>

<main class="wide">
  <h1>논문 뷰어</h1>
  <p class="subtitle">논문 텍스트를 붙여넣으면 등록된 학술용어를 찾아 우측에 보여드립니다.</p>

  <div class="viewer-layout">
    <div class="viewer-input" id="viewer-input-pane">
      <textarea id="paper-text" placeholder="논문 초록이나 본문 일부를 붙여넣어 보세요. 예: 본 연구는 유의확률(p-value)이 0.05 미만인 경우를 통계적으로 유의한 상관관계로 정의하였다."></textarea>
      <button id="find-terms-btn" type="button" disabled>용어 찾기</button>
    </div>
    <aside class="viewer-terms">
      <input type="search" id="term-filter" placeholder="찾은 용어 내 검색" aria-label="찾은 용어 내 검색" disabled>
      <h2 id="matched-count">용어 찾기를 눌러보세요</h2>
      <ul class="term-list" id="matched-terms"></ul>
    </aside>
  </div>
</main>

<footer class="site-footer">
  <p>&copy; 2026 논문용어사전. All rights reserved.</p>
  <a href="about.html">소개</a> · <a href="privacy.html">개인정보처리방침</a> · <a href="contact.html">문의</a>
</footer>
<script src="assets/viewer.js"></script>
</body>
</html>
```

- [ ] **Step 2: Append the DOM-wiring block to `assets/viewer.js`**

Append at the very end of `assets/viewer.js` (after the `module.exports` block from Task 2):

```js
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

    function termCardHTML(match) {
      const enPart = match.title_en ? ` <span class="term-en">(${match.title_en})</span>` : "";
      return `<li class="term-card" data-slug="${match.slug}">
        <span class="term-card-name">${match.title_ko}${enPart}</span>
        <a href="terms/${match.slug}.html" class="term-card-detail">자세히 보기</a>
      </li>`;
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
      const mark = document.querySelector(`mark[data-slug="${slug}"]`);
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

- [ ] **Step 3: Verify Node tests still pass (no regression from the appended browser-only block)**

Run: `node tests/viewer-match.test.js && node tests/viewer-highlight.test.js`
Expected: both `... all tests passed` lines printed, no errors (the `if (typeof document !== "undefined")` guard means this new block is inert under Node, since Node has no global `document`).

- [ ] **Step 4: Manual browser verification (no CSS yet — layout will look unstyled, that's expected until Task 4)**

Since this is a static site with no dev server config, open the file directly:

```bash
start viewer.html
```

(On the actual dev machine, `start viewer.html` opens it in the default browser via Windows `start`. If using the `preview_start`/`preview_*` browser tools instead, serve the repo root as a static folder and navigate to `/viewer.html`.)

Verify manually:
- Typing in the textarea enables the "용어 찾기" button; empty/whitespace-only keeps it disabled.
- Pasting: `본 연구는 유의확률(p-value)이 0.05 미만인 경우를 통계적으로 유의한 상관관계로 정의하였다. 상관관계 분석 결과는 회귀분석으로 재확인하였다.` and clicking "용어 찾기" replaces the left pane with rendered text containing `<mark>` around 유의확률, p-value(first occurrence only techically merged since adjacent), 상관관계, 회귀분석; right panel lists matched terms with counts.
- Clicking a right-panel card (not the "자세히 보기" link) scrolls the left pane to the corresponding `<mark>` and briefly flashes it.
- Clicking "자세히 보기" navigates to `terms/{slug}.html`.
- Pasting text with no known terms (e.g. `안녕하세요 오늘 날씨가 좋습니다.`) shows "본문에서 사전 등록된 용어를 찾지 못했습니다."

- [ ] **Step 5: Commit**

```bash
git add viewer.html assets/viewer.js
git commit -m "feat: 논문 뷰어 viewer.html 페이지 및 DOM 연동 추가"
```

---

### Task 4: Styling (`style.css`)

**Files:**
- Modify: `style.css` (append new rules at the end of the file)

**Interfaces:**
- Consumes: class names used in Task 3's `viewer.html`/`assets/viewer.js` — `.wide`, `.viewer-layout`, `.viewer-input`, `.viewer-rendered`, `mark`, `.mark-flash`, `.viewer-terms`, `.term-card`, `.term-card-name`, `.term-card-detail`.
- Produces: no new interfaces — this is presentation only.

- [ ] **Step 1: Append viewer styles to `style.css`**

```css
main.wide {
  max-width: 1200px;
}

.viewer-layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.viewer-input {
  flex: 1 1 60%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.viewer-input textarea {
  width: 100%;
  min-height: 420px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.7;
  resize: vertical;
}

.viewer-input button {
  align-self: flex-start;
  padding: 10px 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  cursor: pointer;
}

.viewer-input button:disabled {
  background: var(--muted);
  cursor: not-allowed;
}

.viewer-rendered {
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  white-space: pre-wrap;
  line-height: 1.8;
}

.viewer-rendered mark {
  background: #fff3b0;
  border-radius: 2px;
  padding: 0 2px;
  transition: background 0.3s ease, color 0.3s ease;
}

.viewer-rendered mark.mark-flash {
  background: var(--accent);
  color: #fff;
}

.viewer-terms {
  flex: 1 1 320px;
  position: sticky;
  top: 20px;
}

.viewer-terms input[type="search"] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

.viewer-terms .term-list .term-card {
  display: block;
  padding: 14px 16px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 10px;
  cursor: pointer;
}

.viewer-terms .term-list .term-card:hover {
  border-color: var(--accent);
}

.term-card-name {
  display: block;
}

.term-card-detail {
  display: inline-block;
  margin-top: 6px;
  font-size: 0.8rem;
  color: var(--accent);
}

@media (max-width: 720px) {
  .viewer-layout {
    flex-direction: column;
  }

  .viewer-terms {
    position: static;
  }
}
```

- [ ] **Step 2: Manual browser verification**

Reopen `viewer.html` (refresh if already open) and verify:
- Desktop width (>720px): left/right panels sit side by side, right panel stays visible while scrolling the left pane (`position: sticky`).
- Resize the browser window below 720px width: layout stacks vertically, right panel no longer sticky.
- Matched-term cards look like the existing `.term-list` cards elsewhere on the site (white background, bordered, rounded).
- Clicking a card still scrolls+flashes the `<mark>` correctly with the new yellow→accent-blue flash animation visible.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style: 논문 뷰어 페이지 레이아웃 및 하이라이트 스타일 추가"
```

---

### Task 5: Site-wide integration (nav links, sitemap)

**Files:**
- Modify: `index.html:19` (nav block)
- Modify: `about.html:19` (nav block)
- Modify: `contact.html:19` (nav block)
- Modify: `privacy.html` (nav block, same structure as the three above)
- Modify: `sitemap.xml`

**Interfaces:**
- Consumes: `viewer.html` must already exist (Task 3).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Add "논문 뷰어" nav link to the four chrome pages**

In `index.html`, `about.html`, `contact.html`, and `privacy.html`, find this exact nav block:

```html
    <nav>
      <a href="index.html">용어 목록</a>
      <a href="about.html">소개</a>
      <a href="contact.html">문의</a>
    </nav>
```

Replace with:

```html
    <nav>
      <a href="index.html">용어 목록</a>
      <a href="viewer.html">논문 뷰어</a>
      <a href="about.html">소개</a>
      <a href="contact.html">문의</a>
    </nav>
```

(`viewer.html`'s own nav, written in Task 3, already includes this link — no change needed there.)

- [ ] **Step 2: Add `viewer.html` to `sitemap.xml`**

In `sitemap.xml`, right after the entry for the site root (`https://jaeho9158.github.io/term-glossary/`), add:

```xml
  <url>
    <loc>https://jaeho9158.github.io/term-glossary/viewer.html</loc>
  </url>
```

- [ ] **Step 3: Verify the nav link is now present on all 5 pages**

Run (Bash):

```bash
grep -l 'href="viewer.html">논문 뷰어' index.html about.html contact.html privacy.html viewer.html
```

Expected: all 5 filenames printed, one per line.

- [ ] **Step 4: Verify sitemap entry**

Run (Bash):

```bash
grep -A1 'viewer.html</loc>' sitemap.xml
```

Expected: prints the `<url><loc>...viewer.html</loc>` block (confirms it was added, not just referenced elsewhere).

- [ ] **Step 5: Commit**

```bash
git add index.html about.html contact.html privacy.html sitemap.xml
git commit -m "feat: 논문 뷰어 내비게이션 링크 및 사이트맵 등록"
```

---

## Post-Plan Manual Regression Pass

After Task 5, do one final full manual pass in the browser:
- Homepage (`index.html`) nav shows "논문 뷰어" between "용어 목록" and "소개", link works.
- `viewer.html` loads, end-to-end flow from Task 3's Step 4 checklist still works with the final CSS applied.
- A couple of existing pages (`about.html`, a random `terms/*.html` page) still render unchanged — confirms the `.wide` override and new viewer CSS didn't leak into the default 760px layout.
