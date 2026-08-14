# 북마크 태그 + 관련 용어 미니맵 + 분야별 로드맵 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 북마크에 태그를 달고, 카테고리 페이지에 관련 용어 미니맵을 추가하고,
분야별 학습 로드맵 페이지를 만든다.

**Architecture:** 정적 사이트(HTML+JS) + Supabase(인증/북마크/진도). 세 기능 모두
독립적이라 순차 태스크로 나눈다. Supabase 테이블 생성 SQL은 리포에 `supabase/`
폴더로 버전관리하고, 실제 적용은 Supabase 대시보드에서 사용자가 실행한다(이 세션에
DB 쓰기 권한 없음).

**Tech Stack:** 바닐라 JS(ES 모듈), Supabase JS client(`assets/auth.js`), 순수 SVG.

## Global Constraints

- 기존 코드 스타일 준수: ES 모듈, `supabase`/`getSession`은 `assets/auth.js`에서 import.
- 새 Supabase 테이블은 RLS로 본인 데이터만 접근 가능해야 함.
- `terms.json`은 24115줄짜리 배열(용어당 1 오브젝트) — 스크립트로만 수정, 수작업 편집 금지.
- 로드맵 난이도/선수지식은 **휴리스틱 스크립트**로 생성한다(6481개 전체에 대한
  실시간 LLM 호출은 이 세션 범위를 벗어남). `related[]`(같은 subcategory 내 링크
  개수)와 정의 길이를 이용한 결정론적 규칙 사용. 스펙에서 "LLM 배치"라 했으나
  실행 가능한 근사치로 대체 — 태스크 6에서 로직을 상세히 정의한다.

---

## Task 1: 북마크 태그 Supabase 스키마

**Files:**
- Create: `supabase/migrations/002_bookmark_tags.sql`

**Interfaces:**
- Produces: 테이블 `tg_bookmark_tags(id uuid, bookmark_id uuid, user_id uuid, tag text, created_at timestamptz)`

- [ ] **Step 1: SQL 파일 작성**

```sql
-- supabase/migrations/002_bookmark_tags.sql
create table if not exists tg_bookmark_tags (
  id uuid primary key default gen_random_uuid(),
  bookmark_id uuid not null references tg_bookmarks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tag text not null check (char_length(trim(tag)) > 0 and char_length(tag) <= 30),
  created_at timestamptz not null default now()
);

create index if not exists tg_bookmark_tags_bookmark_id_idx on tg_bookmark_tags(bookmark_id);
create index if not exists tg_bookmark_tags_user_id_idx on tg_bookmark_tags(user_id);

alter table tg_bookmark_tags enable row level security;

create policy "select own bookmark tags" on tg_bookmark_tags
  for select using (auth.uid() = user_id);

create policy "insert own bookmark tags" on tg_bookmark_tags
  for insert with check (auth.uid() = user_id);

create policy "delete own bookmark tags" on tg_bookmark_tags
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: README 안내 추가**

`supabase/README.md` 신규 생성:
```markdown
# Supabase migrations

이 폴더의 SQL 파일은 Supabase 대시보드 > SQL Editor에서 순서대로 실행한다.
파일명의 번호 순서를 지킬 것. 001은 기존 tg_bookmarks/tg_reading_history
(대시보드에서 이미 생성됨, 파일 없음). 002부터 이 리포로 관리.
```

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/002_bookmark_tags.sql supabase/README.md
git commit -m "북마크 태그 테이블 마이그레이션 SQL 추가"
```

---

## Task 2: 북마크 태그 UI — history.js/html

**Files:**
- Modify: `assets/history.js`
- Modify: `history.html`
- Modify: `style.css`

**Interfaces:**
- Consumes: `tg_bookmark_tags` 테이블 (Task 1), `terms.json`(카테고리 필터용, fetch로 로드)
- Produces: 없음 (최종 UI 태스크)

- [ ] **Step 1: history.html에 필터 UI 마크업 추가**

`<h2>즐겨찾기</h2>` 바로 아래에 삽입 (기존 `<p id="bookmark-empty">` 위):

```html
    <h2>즐겨찾기</h2>
    <div id="bookmark-filters" class="bookmark-filters" hidden>
      <select id="bookmark-category-filter" class="bookmark-filter-select" aria-label="카테고리 필터">
        <option value="">전체 카테고리</option>
      </select>
      <div id="bookmark-tag-filter" class="bookmark-tag-filter" aria-label="태그 필터"></div>
    </div>
    <p id="bookmark-empty" class="history-empty" hidden>아직 즐겨찾기한 용어가 없습니다.</p>
    <ul id="bookmark-list" class="history-list"></ul>
```

- [ ] **Step 2: history.js 상단에 카테고리 라벨/terms.json 로더 추가**

`assets/history.js` 맨 위 import 블록 바로 아래에 추가:

```js
import { CATEGORY_LABELS } from "./category-data.js";

let termsCache = null;
async function loadTermsMap() {
  if (termsCache) return termsCache;
  const res = await fetch(new URL("../terms.json", import.meta.url));
  const list = await res.json();
  termsCache = new Map(list.map((t) => [t.slug, t]));
  return termsCache;
}
```

(주의: `history.html`은 루트에 있으므로 `new URL("../terms.json", import.meta.url)`가
아니라 `assets/history.js` 기준 상대경로가 필요함. `assets/history.js`에서 본 `terms.json`은
`../terms.json`이 맞음 — `assets/` 안에서 한 단계 위가 루트.)

- [ ] **Step 3: bookmarkRowHTML을 태그 렌더링 포함하도록 교체**

기존 `bookmarkRowHTML` 함수를 아래로 교체:

```js
function bookmarkRowHTML(row, tags) {
  const tagChips = (tags || [])
    .map(
      (t) =>
        `<span class="bookmark-tag-chip" data-tag-id="${t.id}">${escapeHtml(t.tag)}<button type="button" class="bookmark-tag-remove" data-tag-id="${t.id}" aria-label="태그 삭제">×</button></span>`
    )
    .join("");

  return `<li class="history-item bookmark-item" data-id="${row.id}" data-slug="${escapeHtml(row.term_slug)}">
    <span class="history-badge history-badge-term">용어</span>
    <span class="history-title"><a href="terms/${encodeURIComponent(row.term_slug)}.html">${escapeHtml(row.term_title)}</a></span>
    <span class="history-time">${formatDate(row.created_at)}</span>
    <div class="bookmark-tags" data-bookmark-id="${row.id}">
      ${tagChips}
      <button type="button" class="bookmark-tag-add-btn" data-bookmark-id="${row.id}">+ 태그</button>
      <input type="text" class="bookmark-tag-input" data-bookmark-id="${row.id}" placeholder="태그 입력 후 Enter" hidden maxlength="30">
    </div>
    <button type="button" class="history-delete-btn" data-id="${row.id}">삭제</button>
  </li>`;
}
```

- [ ] **Step 4: loadBookmarks를 태그/카테고리 조회 + 필터 상태 반영하도록 교체**

기존 `loadBookmarks` 함수 전체를 아래로 교체 (파일 상단 모듈 스코프에
`let allBookmarks = [];`, `let allTagsByBookmark = new Map();`, `let activeCategory = "";`,
`let activeTags = new Set();` 를 `document.addEventListener` 이전에 추가):

```js
let allBookmarks = [];
let allTagsByBookmark = new Map();
let activeCategory = "";
let activeTags = new Set();

async function loadBookmarks(userId) {
  const listEl = document.getElementById("bookmark-list");
  const emptyEl = document.getElementById("bookmark-empty");
  const filtersEl = document.getElementById("bookmark-filters");

  const { data, error } = await supabase
    .from("tg_bookmarks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    filtersEl.hidden = true;
    return;
  }

  allBookmarks = data;

  const { data: tagRows } = await supabase
    .from("tg_bookmark_tags")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  allTagsByBookmark = new Map();
  (tagRows || []).forEach((t) => {
    if (!allTagsByBookmark.has(t.bookmark_id)) allTagsByBookmark.set(t.bookmark_id, []);
    allTagsByBookmark.get(t.bookmark_id).push(t);
  });

  const termsMap = await loadTermsMap();

  const categorySelect = document.getElementById("bookmark-category-filter");
  const seenCategories = new Set();
  data.forEach((row) => {
    const term = termsMap.get(row.term_slug);
    (term?.categories || []).forEach((c) => seenCategories.add(c));
  });
  categorySelect.innerHTML =
    '<option value="">전체 카테고리</option>' +
    [...seenCategories]
      .map((c) => `<option value="${c}">${escapeHtml(CATEGORY_LABELS[c] || c)}</option>`)
      .join("");

  const tagFilterEl = document.getElementById("bookmark-tag-filter");
  const seenTags = new Set();
  (tagRows || []).forEach((t) => seenTags.add(t.tag));
  tagFilterEl.innerHTML = [...seenTags]
    .map(
      (tag) =>
        `<button type="button" class="bookmark-tag-filter-chip" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
    )
    .join("");

  filtersEl.hidden = false;
  renderBookmarkList(termsMap);
}

function renderBookmarkList(termsMap) {
  const listEl = document.getElementById("bookmark-list");
  const emptyEl = document.getElementById("bookmark-empty");

  const filtered = allBookmarks.filter((row) => {
    if (activeCategory) {
      const term = termsMap.get(row.term_slug);
      if (!term || !(term.categories || []).includes(activeCategory)) return false;
    }
    if (activeTags.size > 0) {
      const tags = (allTagsByBookmark.get(row.id) || []).map((t) => t.tag);
      const hasAll = [...activeTags].every((t) => tags.includes(t));
      if (!hasAll) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    emptyEl.textContent = "조건에 맞는 즐겨찾기가 없습니다.";
    return;
  }
  emptyEl.hidden = true;
  listEl.innerHTML = filtered
    .map((row) => bookmarkRowHTML(row, allTagsByBookmark.get(row.id)))
    .join("");
}
```

- [ ] **Step 5: 필터/태그 추가·삭제 이벤트 리스너 추가**

`document.addEventListener("DOMContentLoaded", ...)` 안, 기존
`document.getElementById("bookmark-list").addEventListener("click", ...)` 블록을
아래 내용으로 **교체 및 확장** (삭제 로직 유지 + 태그 로직 추가):

```js
  document.getElementById("bookmark-category-filter").addEventListener("change", async (e) => {
    activeCategory = e.target.value;
    renderBookmarkList(await loadTermsMap());
  });

  document.getElementById("bookmark-tag-filter").addEventListener("click", async (e) => {
    const chip = e.target.closest(".bookmark-tag-filter-chip");
    if (!chip) return;
    const tag = chip.dataset.tag;
    if (activeTags.has(tag)) {
      activeTags.delete(tag);
      chip.classList.remove("is-active");
    } else {
      activeTags.add(tag);
      chip.classList.add("is-active");
    }
    renderBookmarkList(await loadTermsMap());
  });

  document.getElementById("bookmark-list").addEventListener("click", async (e) => {
    const delBtn = e.target.closest(".history-delete-btn");
    if (delBtn) {
      const id = delBtn.dataset.id;
      delBtn.disabled = true;
      const { error } = await supabase.from("tg_bookmarks").delete().eq("id", id);
      if (!error) {
        allBookmarks = allBookmarks.filter((b) => b.id !== id);
        renderBookmarkList(await loadTermsMap());
      } else {
        delBtn.disabled = false;
      }
      return;
    }

    const addBtn = e.target.closest(".bookmark-tag-add-btn");
    if (addBtn) {
      const input = document.querySelector(
        `.bookmark-tag-input[data-bookmark-id="${addBtn.dataset.bookmarkId}"]`
      );
      addBtn.hidden = true;
      input.hidden = false;
      input.focus();
      return;
    }

    const removeTagBtn = e.target.closest(".bookmark-tag-remove");
    if (removeTagBtn) {
      const tagId = removeTagBtn.dataset.tagId;
      removeTagBtn.disabled = true;
      const { error } = await supabase.from("tg_bookmark_tags").delete().eq("id", tagId);
      if (!error) {
        for (const [bmId, tags] of allTagsByBookmark) {
          allTagsByBookmark.set(bmId, tags.filter((t) => t.id !== tagId));
        }
        renderBookmarkList(await loadTermsMap());
      }
      return;
    }
  });

  document.getElementById("bookmark-list").addEventListener("keydown", async (e) => {
    const input = e.target.closest(".bookmark-tag-input");
    if (!input || e.key !== "Enter") return;
    const tag = input.value.trim();
    if (!tag) return;
    input.disabled = true;
    const { data, error } = await supabase
      .from("tg_bookmark_tags")
      .insert({ bookmark_id: input.dataset.bookmarkId, user_id: userId, tag })
      .select()
      .single();
    if (!error && data) {
      const bmId = input.dataset.bookmarkId;
      if (!allTagsByBookmark.has(bmId)) allTagsByBookmark.set(bmId, []);
      allTagsByBookmark.get(bmId).push(data);
      renderBookmarkList(await loadTermsMap());
    }
    input.disabled = false;
    input.value = "";
  });
```

이 블록을 추가할 때, 기존 `loadHistory`/`loadBookmarks` 호출부(`await loadBookmarks(userId)`)는
그대로 둔다. 기존 `bookmark-list` click 리스너(삭제 전용)는 위 새 리스너로 완전히 대체한다.

- [ ] **Step 6: style.css에 태그/필터 스타일 추가**

`style.css` 끝에 추가:

```css
.bookmark-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 8px 0 16px;
}
.bookmark-filter-select {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #ccc);
  background: var(--bg-color, #fff);
  color: inherit;
}
.bookmark-tag-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.bookmark-tag-filter-chip {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color, #ccc);
  background: transparent;
  cursor: pointer;
  font-size: 0.85em;
}
.bookmark-tag-filter-chip.is-active {
  background: var(--accent-color, #4a6cf7);
  color: #fff;
  border-color: var(--accent-color, #4a6cf7);
}
.bookmark-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.bookmark-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--tag-bg, #eef1fb);
  font-size: 0.8em;
}
.bookmark-tag-remove {
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
  font-size: 1em;
  line-height: 1;
}
.bookmark-tag-add-btn {
  border: none;
  background: none;
  color: var(--accent-color, #4a6cf7);
  cursor: pointer;
  font-size: 0.8em;
  padding: 0;
}
.bookmark-tag-input {
  font-size: 0.8em;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #ccc);
}
```

- [ ] **Step 7: 수동 테스트**

`assets/history.js`에 자동 테스트는 붙이지 않는다(기존 코드도 DOM+Supabase 통합이라
`tests/` 하위에 유닛테스트 대상이 없음 — `tests/` 폴더 컨벤션 확인 후 해당 없으면 스킵).
대신 브라우저로 직접 확인:

```bash
npx serve .
```
브라우저에서 `history.html` 접속 → 로그인 → 즐겨찾기에 태그 추가/삭제/필터링이
동작하는지 확인.

- [ ] **Step 8: 커밋**

```bash
git add assets/history.js history.html style.css
git commit -m "북마크 카테고리/태그 필터 UI 추가"
```

---

## Task 3: 관련 용어 미니맵 — 데이터 준비 스크립트

**Files:**
- Create: `scripts/generate-minimap-data.js`
- Create: `assets/minimap-data.json` (생성물)
- Modify: `package.json`

**Interfaces:**
- Consumes: `terms.json` (루트, 기존 `slug/categories/subcategory/related/title_ko` 필드)
- Produces: `assets/minimap-data.json` — `{ [subcategory]: { nodes: [{slug,title}], edges: [[fromSlug,toSlug]] } }`

- [ ] **Step 1: 스크립트 작성**

```js
// scripts/generate-minimap-data.js
const fs = require("fs");
const path = require("path");

const terms = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "terms.json"), "utf-8"));

const bySubcategory = new Map();
for (const t of terms) {
  const sub = t.subcategory || "미분류";
  if (!bySubcategory.has(sub)) bySubcategory.set(sub, []);
  bySubcategory.get(sub).push(t);
}

const output = {};
for (const [sub, list] of bySubcategory) {
  const slugSet = new Set(list.map((t) => t.slug));
  const nodes = list.map((t) => ({ slug: t.slug, title: t.title_ko || t.title_en || t.slug }));
  const edgeSet = new Set();
  const edges = [];
  for (const t of list) {
    for (const relSlug of t.related || []) {
      if (!slugSet.has(relSlug) || relSlug === t.slug) continue;
      const key = [t.slug, relSlug].sort().join("|");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push([t.slug, relSlug]);
    }
  }
  output[sub] = { nodes, edges };
}

fs.writeFileSync(
  path.join(__dirname, "..", "assets", "minimap-data.json"),
  JSON.stringify(output),
  "utf-8"
);
console.log(`generated ${Object.keys(output).length} subcategories`);
```

- [ ] **Step 2: package.json에 스크립트 등록**

`"build:bookmark-button": "node scripts/insert-bookmark-button.js"` 줄 다음에 추가:
```json
    "build:minimap-data": "node scripts/generate-minimap-data.js"
```

- [ ] **Step 3: 실행 및 검증**

```bash
npm run build:minimap-data
node -e "const d=require('./assets/minimap-data.json'); const keys=Object.keys(d); console.log(keys.length, keys[0], d[keys[0]].nodes.length, d[keys[0]].edges.length)"
```
Expected: subcategory 개수와 첫 항목의 nodes/edges 개수가 0보다 큰 정수로 출력.

- [ ] **Step 4: 커밋**

```bash
git add scripts/generate-minimap-data.js assets/minimap-data.json package.json
git commit -m "관련 용어 미니맵용 subcategory 그래프 데이터 생성 스크립트 추가"
```

---

## Task 4: 관련 용어 미니맵 — category.html UI

**Files:**
- Modify: `category.html`
- Create: `assets/category-minimap.js`
- Modify: `style.css`

**Interfaces:**
- Consumes: `assets/minimap-data.json` (Task 3), `assets/category-data.js`의 `CATEGORY_LABELS`(기존)
- Produces: 없음 (최종 UI 태스크)

- [ ] **Step 1: category.html에 미니맵 컨테이너 추가**

`category.html`의 `<main>` 안, 기존 카테고리 목록 뒤에 추가 (정확한 삽입 위치는
`</main>` 바로 앞):

```html
  <section id="minimap-section" class="minimap-section">
    <h2>관련 용어 미니맵</h2>
    <p class="subtitle">같은 소분류 안에서 용어들이 어떻게 연결되어 있는지 볼 수 있습니다.</p>
    <div id="minimap-subcats" class="minimap-subcats"></div>
    <div id="minimap-graph-container"></div>
  </section>
```

- [ ] **Step 2: category.html 하단 스크립트 로드부에 추가**

기존 `<script type="module" src="assets/nav-auth.js"></script>` 다음 줄에 추가:
```html
<script type="module" src="assets/category-minimap.js"></script>
```

- [ ] **Step 3: assets/category-minimap.js 작성**

```js
// assets/category-minimap.js
async function loadMinimapData() {
  const res = await fetch("assets/minimap-data.json");
  return res.json();
}

function circularLayout(nodes, radius, cx, cy) {
  const n = nodes.length;
  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    return { ...node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

function degreeCount(nodes, edges) {
  const deg = new Map(nodes.map((n) => [n.slug, 0]));
  edges.forEach(([a, b]) => {
    deg.set(a, (deg.get(a) || 0) + 1);
    deg.set(b, (deg.get(b) || 0) + 1);
  });
  return deg;
}

function renderGraph(container, subcatKey, data) {
  const MAX_NODES = 20;
  let { nodes, edges } = data;
  let truncated = 0;

  if (nodes.length > MAX_NODES) {
    const deg = degreeCount(nodes, edges);
    const sorted = [...nodes].sort((a, b) => (deg.get(b.slug) || 0) - (deg.get(a.slug) || 0));
    const kept = new Set(sorted.slice(0, MAX_NODES).map((n) => n.slug));
    truncated = nodes.length - MAX_NODES;
    nodes = nodes.filter((n) => kept.has(n.slug));
    edges = edges.filter(([a, b]) => kept.has(a) && kept.has(b));
  }

  const size = 480;
  const radius = size / 2 - 60;
  const cx = size / 2;
  const cy = size / 2;
  const positioned = circularLayout(nodes, radius, cx, cy);
  const posMap = new Map(positioned.map((n) => [n.slug, n]));

  const edgeSvg = edges
    .map(([a, b]) => {
      const pa = posMap.get(a);
      const pb = posMap.get(b);
      if (!pa || !pb) return "";
      return `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" class="minimap-edge" />`;
    })
    .join("");

  const nodeSvg = positioned
    .map(
      (n) => `<a href="terms/${encodeURIComponent(n.slug)}.html" class="minimap-node-link">
        <circle cx="${n.x}" cy="${n.y}" r="6" class="minimap-node" />
        <text x="${n.x}" y="${n.y - 10}" class="minimap-label" text-anchor="middle">${escapeXml(n.title)}</text>
      </a>`
    )
    .join("");

  const note = truncated > 0 ? `<p class="minimap-note">연결이 많은 상위 ${MAX_NODES}개만 표시 (${truncated}개 더 있음)</p>` : "";

  container.innerHTML = `${note}<svg viewBox="0 0 ${size} ${size}" class="minimap-svg" role="img" aria-label="${escapeXml(subcatKey)} 관련 용어 미니맵">${edgeSvg}${nodeSvg}</svg>`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", async () => {
  const subcatsEl = document.getElementById("minimap-subcats");
  const graphEl = document.getElementById("minimap-graph-container");
  if (!subcatsEl || !graphEl) return;

  const data = await loadMinimapData();
  const keys = Object.keys(data).filter((k) => data[k].nodes.length >= 2);

  subcatsEl.innerHTML = keys
    .map((k) => `<button type="button" class="minimap-subcat-chip" data-subcat="${escapeXml(k)}">${escapeXml(k)} (${data[k].nodes.length})</button>`)
    .join("");

  subcatsEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".minimap-subcat-chip");
    if (!chip) return;
    const key = chip.dataset.subcat;
    const isOpen = chip.classList.contains("is-active");
    subcatsEl.querySelectorAll(".minimap-subcat-chip").forEach((c) => c.classList.remove("is-active"));
    if (isOpen) {
      graphEl.innerHTML = "";
      return;
    }
    chip.classList.add("is-active");
    renderGraph(graphEl, key, data[key]);
  });
});
```

- [ ] **Step 4: style.css에 미니맵 스타일 추가**

`style.css` 끝에 추가:
```css
.minimap-section {
  margin-top: 32px;
}
.minimap-subcats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0;
}
.minimap-subcat-chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-color, #ccc);
  background: transparent;
  cursor: pointer;
  font-size: 0.85em;
}
.minimap-subcat-chip.is-active {
  background: var(--accent-color, #4a6cf7);
  color: #fff;
  border-color: var(--accent-color, #4a6cf7);
}
.minimap-svg {
  width: 100%;
  max-width: 480px;
  height: auto;
  display: block;
  margin: 0 auto;
}
.minimap-edge {
  stroke: var(--border-color, #ccc);
  stroke-width: 1;
}
.minimap-node {
  fill: var(--accent-color, #4a6cf7);
}
.minimap-label {
  font-size: 9px;
  fill: currentColor;
}
.minimap-node-link:hover .minimap-node {
  fill: #ff6b6b;
}
.minimap-note {
  font-size: 0.85em;
  opacity: 0.7;
}
```

- [ ] **Step 5: 수동 테스트**

```bash
npx serve .
```
`category.html` 접속 → 페이지 하단 "관련 용어 미니맵" 섹션에서 subcategory 칩 클릭 →
그래프가 그려지고 노드 클릭 시 용어 페이지로 이동하는지 확인. 다른 칩 클릭 시
이전 그래프가 새 그래프로 교체되는지, 같은 칩 재클릭 시 접히는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add category.html assets/category-minimap.js style.css
git commit -m "카테고리 페이지에 관련 용어 미니맵 추가"
```

---

## Task 5: 로드맵 메타데이터 생성 스크립트 (난이도/선수지식)

**Files:**
- Create: `scripts/generate-roadmap-metadata.js`
- Modify: `terms.json` (스크립트 실행 결과로 갱신)
- Modify: `package.json`

**Interfaces:**
- Consumes: `terms.json`의 기존 `slug/subcategory/related/definition` 필드
- Produces: `terms.json`의 각 항목에 `difficulty`(1~3 정수), `prerequisites`(string[], 최대 3개) 필드 추가

**규칙 (휴리스틱, LLM 미사용 — Global Constraints 참고):**
- `difficulty`: 같은 subcategory 안에서 그 용어를 `related`로 가리키는 용어 수(피인용 수,
  "얼마나 많은 다른 용어의 전제가 되는지"의 근사치)가 많을수록 낮은 난이도(기초 개념일
  가능성)로 본다. subcategory 내 피인용 수 상위 33%는 difficulty=1, 중간 33%는 2, 하위
  33%는 3. 피인용 0인 용어는 무조건 3(응용/말단 개념으로 간주).
- `prerequisites`: 해당 용어의 `related[]` 중, 같은 subcategory이면서 difficulty가 더
  낮은(자신보다 기초적인) 용어만 최대 3개 선택. 없으면 빈 배열.

- [ ] **Step 1: 스크립트 작성**

```js
// scripts/generate-roadmap-metadata.js
const fs = require("fs");
const path = require("path");

const TERMS_PATH = path.join(__dirname, "..", "terms.json");
const terms = JSON.parse(fs.readFileSync(TERMS_PATH, "utf-8"));

const bySubcategory = new Map();
for (const t of terms) {
  const sub = t.subcategory || "미분류";
  if (!bySubcategory.has(sub)) bySubcategory.set(sub, []);
  bySubcategory.get(sub).push(t);
}

for (const [, list] of bySubcategory) {
  const slugSet = new Set(list.map((t) => t.slug));
  const inboundCount = new Map(list.map((t) => [t.slug, 0]));
  for (const t of list) {
    for (const r of t.related || []) {
      if (slugSet.has(r)) inboundCount.set(r, (inboundCount.get(r) || 0) + 1);
    }
  }

  const sortedBySlug = [...list].sort(
    (a, b) => (inboundCount.get(b.slug) || 0) - (inboundCount.get(a.slug) || 0)
  );
  const n = sortedBySlug.length;
  const cut1 = Math.ceil(n / 3);
  const cut2 = Math.ceil((2 * n) / 3);

  sortedBySlug.forEach((t, idx) => {
    const inbound = inboundCount.get(t.slug) || 0;
    let difficulty;
    if (inbound === 0) difficulty = 3;
    else if (idx < cut1) difficulty = 1;
    else if (idx < cut2) difficulty = 2;
    else difficulty = 3;
    t.difficulty = difficulty;
  });

  const difficultyMap = new Map(list.map((t) => [t.slug, t.difficulty]));
  for (const t of list) {
    const prereqs = (t.related || [])
      .filter((r) => slugSet.has(r) && r !== t.slug)
      .filter((r) => (difficultyMap.get(r) || 3) < t.difficulty)
      .slice(0, 3);
    t.prerequisites = prereqs;
  }
}

fs.writeFileSync(TERMS_PATH, JSON.stringify(terms), "utf-8");
console.log(`updated ${terms.length} terms with difficulty/prerequisites`);
```

- [ ] **Step 2: package.json에 스크립트 등록**

`"build:minimap-data": "node scripts/generate-minimap-data.js"` 다음에 추가:
```json
    "build:roadmap-metadata": "node scripts/generate-roadmap-metadata.js"
```

- [ ] **Step 3: 실행 전 terms.json 백업 확인**

git으로 버전관리되므로 별도 백업 불필요 — 실행 후 `git diff --stat terms.json`으로
변경 규모만 확인.

- [ ] **Step 4: 실행 및 검증**

```bash
npm run build:roadmap-metadata
node -e "
const terms = require('./terms.json');
const withDiff = terms.filter(t => t.difficulty);
const noPrereqCycle = terms.filter(t => (t.prerequisites||[]).includes(t.slug));
console.log('tagged:', withDiff.length, '/', terms.length);
console.log('self-reference bugs:', noPrereqCycle.length);
const dist = {1:0,2:0,3:0};
withDiff.forEach(t => dist[t.difficulty]++);
console.log('distribution:', dist);
"
```
Expected: `tagged: 24115 / 24115`(=전체 개수와 동일), `self-reference bugs: 0`,
`distribution`이 1/2/3 각각 0이 아닌 값으로 고르게 분포.

주의: 순환 참조(A가 B의 선수지식이고 B가 A의 선수지식)는 difficulty가 엄격히 낮은
쪽만 prerequisites로 채택하는 규칙상 발생하지 않는다(같은 difficulty끼리는
서로를 선수지식으로 넣지 않음).

- [ ] **Step 5: 커밋**

```bash
git add scripts/generate-roadmap-metadata.js package.json terms.json
git commit -m "용어별 난이도/선수지식 메타데이터 생성 (subcategory 내 피인용 수 기반 휴리스틱)"
```

---

## Task 6: roadmap.html 페이지

**Files:**
- Create: `roadmap.html`
- Create: `assets/roadmap.js`
- Modify: `category.html`, `history.html`, `index.html`, `quiz.html`, `about.html` (헤더 nav에 링크 추가)
- Modify: `style.css`

**Interfaces:**
- Consumes: `terms.json`(Task 5에서 채워진 `difficulty`/`prerequisites`), `assets/category-data.js`의
  `CATEGORY_LABELS`, `assets/auth.js`의 `supabase`/`getSession`
- Produces: 없음 (최종 UI 태스크)

- [ ] **Step 1: roadmap.html 작성 (history.html을 템플릿으로 사용)**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>분야별 학습 로드맵 - 논문용어사전</title>
<meta name="description" content="분야를 선택하면 난이도와 선수지식 순서에 따라 용어를 학습할 수 있는 로드맵을 제공합니다.">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="canonical" href="https://jaeho9158.github.io/term-glossary/roadmap.html">
<link rel="stylesheet" href="style.css">
<!-- GA4 analytics:start -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-7SW2PGCN27"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-7SW2PGCN27');
</script>
<!-- GA4 analytics:end -->
<!-- theme-init:start -->
<script>(function(){try{var t=localStorage.getItem("theme");if(!t){t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}document.addEventListener("click",function(e){var btn=e.target.closest("#theme-toggle");if(!btn)return;var next=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",next);try{localStorage.setItem("theme",next);}catch(e){}});})();</script>
<!-- theme-init:end -->
<!-- AdSense:start -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7710727724213886" crossorigin="anonymous"></script>
<!-- AdSense:end -->
</head>
<body data-base="">
<header class="site-header">
  <div class="inner">
    <a class="logo" href="index.html">논문용어사전</a>
    <div class="header-search">
      <input type="search" id="global-term-search" class="header-search-input" placeholder="용어 검색" aria-label="용어 검색" autocomplete="off">
      <ul id="global-term-search-results" class="header-search-results" hidden></ul>
    </div>
    <button id="theme-toggle" class="theme-toggle-btn" type="button" aria-label="다크모드 전환">
      <span class="theme-icon-light" aria-hidden="true">🌙</span>
      <span class="theme-icon-dark" aria-hidden="true">☀️</span>
    </button>
    <button id="menu-toggle" class="menu-toggle" aria-label="메뉴" aria-expanded="false">☰</button>
    <nav id="site-nav" class="site-nav">
      <a href="index.html">용어 목록</a>
      <a href="viewer.html" class="nav-cta">논문 뷰어</a>
      <a href="quiz.html">퀴즈</a>
      <a href="roadmap.html">로드맵</a>
      <a href="about.html">소개</a>
      <a href="changelog.html">업데이트기록</a>
      <a href="contact.html">문의</a>
      <a href="login.html" id="nav-login">로그인</a>
      <a href="signup.html" id="nav-signup">회원가입</a>
      <a href="history.html" id="nav-history" hidden>내 기록</a>
      <a href="#" id="nav-logout" hidden>로그아웃</a>
    </nav>
  </div>
</header>

<main class="delay-1">
  <h1>분야별 학습 로드맵</h1>
  <p class="subtitle">분야를 고르면 선수지식 순서로 정렬된 학습 경로를 볼 수 있습니다. 체크하면 진도가 저장됩니다.</p>

  <select id="roadmap-category-select" class="bookmark-filter-select" aria-label="분야 선택">
    <option value="">분야를 선택하세요</option>
  </select>

  <div id="roadmap-content"></div>
</main>

<footer class="site-footer">
  <p>&copy; 2026 논문용어사전. All rights reserved.</p>
  <a href="about.html">소개</a> · <a href="privacy.html">개인정보처리방침</a> · <a href="contact.html">문의</a>
</footer>
<script src="assets/vendor/fuse.min.js"></script>
<script src="assets/header-search.js"></script>
<script type="module" src="assets/nav-auth.js"></script>
<script type="module" src="assets/roadmap.js"></script>
<script src="assets/mobile-nav.js"></script>
</body>
</html>
```

- [ ] **Step 2: 나머지 페이지 헤더 nav에 로드맵 링크 추가**

`category.html`, `history.html`, `index.html`, `quiz.html`, `about.html` 각각에서
`<a href="quiz.html">퀴즈</a>` 줄(또는 존재하지 않으면 `<a href="viewer.html"...`
다음) 바로 뒤에 `<a href="roadmap.html">로드맵</a>`를 추가한다. `terms/*.html`처럼
`data-base="../"`를 쓰는 페이지는 이 태스크 범위 밖(nav 목록에 quiz/viewer 링크
자체가 없으므로 스킵).

- [ ] **Step 3: Supabase 진도 테이블 마이그레이션 SQL 작성**

`supabase/migrations/003_roadmap_progress.sql` 신규 생성:
```sql
create table if not exists tg_roadmap_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term_slug text not null,
  completed_at timestamptz not null default now(),
  unique (user_id, term_slug)
);

create index if not exists tg_roadmap_progress_user_id_idx on tg_roadmap_progress(user_id);

alter table tg_roadmap_progress enable row level security;

create policy "select own roadmap progress" on tg_roadmap_progress
  for select using (auth.uid() = user_id);

create policy "insert own roadmap progress" on tg_roadmap_progress
  for insert with check (auth.uid() = user_id);

create policy "delete own roadmap progress" on tg_roadmap_progress
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 4: assets/roadmap.js 작성**

```js
// assets/roadmap.js
import { supabase, getSession } from "./auth.js";
import { CATEGORY_LABELS } from "./category-data.js";

const LOCAL_KEY = "roadmap_progress_v1";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getLocalProgress() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"));
  } catch (e) {
    return new Set();
  }
}

function setLocalProgress(set) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify([...set]));
}

function topoSort(terms) {
  const bySlug = new Map(terms.map((t) => [t.slug, t]));
  const visited = new Set();
  const result = [];

  function visit(slug, stack) {
    if (visited.has(slug) || !bySlug.has(slug) || stack.has(slug)) return;
    stack.add(slug);
    const t = bySlug.get(slug);
    for (const p of t.prerequisites || []) {
      visit(p, stack);
    }
    stack.delete(slug);
    if (!visited.has(slug)) {
      visited.add(slug);
      result.push(t);
    }
  }

  const ordered = [...terms].sort((a, b) => (a.difficulty || 3) - (b.difficulty || 3));
  for (const t of ordered) visit(t.slug, new Set());
  return result;
}

document.addEventListener("DOMContentLoaded", async () => {
  const select = document.getElementById("roadmap-category-select");
  const content = document.getElementById("roadmap-content");
  if (!select || !content) return;

  const res = await fetch("terms.json");
  const terms = await res.json();

  const catSet = new Set();
  terms.forEach((t) => (t.categories || []).forEach((c) => catSet.add(c)));
  select.innerHTML +=
    [...catSet]
      .sort()
      .map((c) => `<option value="${c}">${escapeHtml(CATEGORY_LABELS[c] || c)}</option>`)
      .join("");

  const session = await getSession();
  let remoteProgress = new Set();
  if (session) {
    const { data } = await supabase
      .from("tg_roadmap_progress")
      .select("term_slug")
      .eq("user_id", session.user.id);
    remoteProgress = new Set((data || []).map((r) => r.term_slug));

    const local = getLocalProgress();
    const toMigrate = [...local].filter((slug) => !remoteProgress.has(slug));
    if (toMigrate.length > 0) {
      await supabase
        .from("tg_roadmap_progress")
        .insert(toMigrate.map((term_slug) => ({ user_id: session.user.id, term_slug })));
      toMigrate.forEach((slug) => remoteProgress.add(slug));
      localStorage.removeItem(LOCAL_KEY);
    }
  }

  function isDone(slug) {
    return session ? remoteProgress.has(slug) : getLocalProgress().has(slug);
  }

  async function toggleDone(slug, checked) {
    if (session) {
      if (checked) {
        await supabase
          .from("tg_roadmap_progress")
          .insert({ user_id: session.user.id, term_slug: slug });
        remoteProgress.add(slug);
      } else {
        await supabase
          .from("tg_roadmap_progress")
          .delete()
          .eq("user_id", session.user.id)
          .eq("term_slug", slug);
        remoteProgress.delete(slug);
      }
    } else {
      const local = getLocalProgress();
      if (checked) local.add(slug);
      else local.delete(slug);
      setLocalProgress(local);
    }
  }

  function render(category) {
    if (!category) {
      content.innerHTML = "";
      return;
    }
    const inCategory = terms.filter((t) => (t.categories || []).includes(category));
    const bySubcat = new Map();
    inCategory.forEach((t) => {
      const sub = t.subcategory || "미분류";
      if (!bySubcat.has(sub)) bySubcat.set(sub, []);
      bySubcat.get(sub).push(t);
    });

    content.innerHTML = [...bySubcat.entries()]
      .map(([sub, list]) => {
        const sorted = topoSort(list);
        const doneCount = sorted.filter((t) => isDone(t.slug)).length;
        const pct = Math.round((doneCount / sorted.length) * 100);
        const items = sorted
          .map(
            (t) => `<li class="roadmap-item">
              <label>
                <input type="checkbox" class="roadmap-checkbox" data-slug="${t.slug}" ${isDone(t.slug) ? "checked" : ""}>
                <span class="roadmap-difficulty roadmap-difficulty-${t.difficulty || 3}">Lv${t.difficulty || 3}</span>
                <a href="terms/${encodeURIComponent(t.slug)}.html">${escapeHtml(t.title_ko || t.slug)}</a>
              </label>
            </li>`
          )
          .join("");
        return `<section class="roadmap-subcat">
          <h2>${escapeHtml(sub)} <span class="roadmap-progress-label">${doneCount}/${sorted.length} (${pct}%)</span></h2>
          <div class="roadmap-progress-bar"><div class="roadmap-progress-fill" style="width:${pct}%"></div></div>
          <ul class="roadmap-list">${items}</ul>
        </section>`;
      })
      .join("");
  }

  select.addEventListener("change", () => render(select.value));

  content.addEventListener("change", async (e) => {
    const cb = e.target.closest(".roadmap-checkbox");
    if (!cb) return;
    await toggleDone(cb.dataset.slug, cb.checked);
    render(select.value);
  });
});
```

- [ ] **Step 5: style.css에 로드맵 스타일 추가**

`style.css` 끝에 추가:
```css
.roadmap-subcat {
  margin: 24px 0;
}
.roadmap-progress-label {
  font-size: 0.75em;
  opacity: 0.7;
  font-weight: normal;
}
.roadmap-progress-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--border-color, #eee);
  overflow: hidden;
  margin: 6px 0 12px;
}
.roadmap-progress-fill {
  height: 100%;
  background: var(--accent-color, #4a6cf7);
}
.roadmap-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.roadmap-item label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.roadmap-difficulty {
  font-size: 0.7em;
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
}
.roadmap-difficulty-1 { background: #4caf50; }
.roadmap-difficulty-2 { background: #ff9800; }
.roadmap-difficulty-3 { background: #f44336; }
```

- [ ] **Step 6: 수동 테스트**

```bash
npx serve .
```
`roadmap.html` 접속 → 분야 선택 → subcategory별로 난이도 배지가 붙은 용어
리스트가 뜨는지, 체크박스 클릭 시 진행률 바가 갱신되는지 확인. 비로그인 상태에서
새로고침해도 localStorage로 체크 상태가 유지되는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add roadmap.html assets/roadmap.js style.css supabase/migrations/003_roadmap_progress.sql category.html history.html index.html quiz.html about.html
git commit -m "분야별 학습 로드맵 페이지 추가"
```

---

## Self-Review 결과

- 스펙의 세 기능(태그, 미니맵, 로드맵) 모두 태스크로 커버됨.
- LLM 배치 태깅 대신 휴리스틱 스크립트로 대체한 부분은 Global Constraints와
  Task 5 상단에 이유를 명시함 — 플레이스홀더가 아니라 실행 가능한 대안 로직.
- `tg_roadmap_progress`, `tg_bookmark_tags` 마이그레이션 SQL은 실제 DB 적용 권한이
  없으므로 파일로만 생성 — 사용자가 Supabase 대시보드에서 직접 실행해야 함(Task 1
  Step 2, Task 6 Step 3에 안내 포함).
