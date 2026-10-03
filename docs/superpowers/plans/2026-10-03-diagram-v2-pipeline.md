# 개념 도식 v2 — 생성 파이프라인 도구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수천 개 도식 스펙을 Claude Code 에이전트로 만들 때 쓰는 결정적(deterministic) 도구를 만든다 — 후보 선정, 페이지 본문 추출, 참고 예시 검색(BM25), 배치 상태 관리, 에이전트 입력 묶음 생성·결과 반영, 검사·렌더, 승인용 미리보기, 그리고 에이전트 지시문(프롬프트) 4종.

**Architecture:** LLM 호출은 이 도구에 없다. 도구는 `diagrams/batches/<NNN>/`에 에이전트가 읽을 입력 묶음(JSON)을 쓰고, 에이전트가 남긴 출력(JSON·스펙 파일)을 검증해 상태(`status.json`)에 반영한다. 에이전트 실행은 계획 ③에서 컨트롤러가 한다. 모든 명령은 `scripts/diagrams/pipeline/batch.js <명령> <배치번호>` 하나로 부른다.

**Tech Stack:** Node.js 내장 모듈만. 렌더·검증은 계획 ①의 `scripts/diagrams/lib.js`, PNG는 `scripts/diagrams/preview.js --dir … --png`.

**작업 위치:** 워크트리 `C:\Users\hssh9\term-diagram-v2`, 브랜치 `feat/diagram-v2`.

**설계 문서:** `docs/superpowers/specs/2026-10-03-concept-diagram-v2-design.md` 2~5절.

---

## 상태 기계

```
pending ──triage-apply──▶ triaged ──(작성 에이전트가 diagrams/specs/<slug>.json 씀)──▶ check
   │ no                      │                                                      │
   ▼                         ▼                                    ok ◀──────────────┴──────▶ check_failed
dropped                  (스펙 없음: 그대로 triaged)               │                              │ (고친 뒤 check 재실행)
                                                                  ▼                              │
                                                               checked ──render──▶ review-in ──▶ review-apply
                                                                                                   │ pass/fix │ drop
                                                                                                   ▼          ▼
                                                                                                reviewed    dropped
                                                                                                   │ approve --yes (사용자 승인 후)
                                                                                                   ▼
                                                                                                approved (spec.reviewed=true)
```

`status.json`:

```json
{"batch": 1, "created": "ISO", "order": "random", "seed": 7,
 "items": {"<slug>": {"state": "triaged", "group": "stats", "type": "plot", "intent": "…", "confidence": "high"}}}
```

## 파일 구조

| 파일 | 역할 |
|---|---|
| `scripts/diagrams/pipeline/groups.json` | 분야군 12개 → 분야 코드(98개 전부, 중복 없음) |
| `scripts/diagrams/pipeline/common.js` | 경로(`DG_ROOT` 환경변수로 테스트용 루트 교체), terms 로드, 분야군, JSON 읽기·쓰기, 시드 난수·셔플 |
| `scripts/diagrams/pipeline/page.js` | 용어 페이지 HTML → 정의·쉽게 풀면·왜 중요한가·용례·깊게·주의할 점, 옛 범용 도식 여부 |
| `scripts/diagrams/pipeline/bm25.js` | 한글 2-gram + 영문 낱말 BM25 |
| `scripts/diagrams/pipeline/retrieve.js` | 검수 통과 스펙 색인, 같은 type·분야군 참고 예시 3개(없으면 type만, 그래도 없으면 `diagrams/examples`) |
| `scripts/diagrams/pipeline/status.js` | 배치 폴더·상태 로드·저장·전이, 모든 배치에 든 slug |
| `scripts/diagrams/pipeline/batch.js` | CLI: `new` `triage-in` `triage-apply` `write-in` `check` `render` `review-in` `review-apply` `preview` `approve` `report` |
| `diagrams/prompts/{triage,write,review,stylist}.md` | 에이전트 지시문 |
| `tests/diagrams-pipeline.test.js` | 위 모듈 단위 테스트 + 임시 루트에서 배치 한 바퀴 |
| `.gitignore` | 배치 입력·출력 묶음과 렌더물 제외(상태·요약만 커밋) |
| `package.json` | `"diagrams:batch": "node scripts/diagrams/pipeline/batch.js"` |

---

### Task 1: 분야군 매핑과 공통 모듈

**Files:**
- Create: `scripts/diagrams/pipeline/groups.json`, `scripts/diagrams/pipeline/common.js`
- Test: `tests/diagrams-pipeline.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/diagrams-pipeline.test.js`:

```js
// 도식 생성 파이프라인 도구
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");

// ── 분야군: 98개 분야가 정확히 한 번씩 ─────────────────────
{
  const { GROUPS, groupOf } = require("../scripts/diagrams/pipeline/common.js");
  const src = fs.readFileSync(path.join(REPO, "assets", "category-data.js"), "utf8");
  const labels = eval("(" + src.match(/CATEGORY_LABELS\s*=\s*(\{[\s\S]*?\});/)[1] + ")");
  const all = Object.values(GROUPS).flat();
  assert.strictEqual(new Set(all).size, all.length, "분야가 두 군에 들어 있음");
  assert.deepStrictEqual([...all].sort(), Object.keys(labels).sort(), "분야군이 CATEGORY_LABELS와 다름");
  assert.strictEqual(Object.keys(GROUPS).length, 12);
  assert.strictEqual(groupOf(["stat", "psych"]), "stats");
  assert.strictEqual(groupOf("neuro"), "life");
  assert.strictEqual(groupOf(["nope"]), null);
}

// ── 시드 셔플은 재현된다 ───────────────────────────────────
{
  const { shuffle } = require("../scripts/diagrams/pipeline/common.js");
  const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], 42), b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], 42);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual([...a].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.notDeepStrictEqual(shuffle([1, 2, 3, 4, 5, 6, 7, 8], 43), a);
}

console.log("diagrams-pipeline: all tests passed");
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/diagrams-pipeline.test.js`
Expected: FAIL — `Cannot find module '../scripts/diagrams/pipeline/common.js'`

- [ ] **Step 3: `scripts/diagrams/pipeline/groups.json` 작성**

```json
{
  "stats":      ["stat", "method", "tool", "ethics", "math"],
  "natsci":     ["phys", "chem", "earth", "astro", "meteor", "ocean", "geo", "env", "cartography"],
  "life":       ["bio", "biotech", "neuro", "toxicol", "pharm"],
  "health":     ["med", "pubhealth", "nursing", "dent", "vet", "kmed", "medlab", "radio", "ems", "rehab", "biomed"],
  "eng":        ["eng", "mechanical", "electrical", "chemeng", "materials", "optics", "robotics", "aviation", "naval", "nuclear", "indeng", "arch", "landscape", "fire", "disaster"],
  "computing":  ["cs", "cyber", "libinfo"],
  "social":     ["socialecon", "polisci", "pubadmin", "law", "crimin", "forensicsci", "demog", "anthro", "gender", "socwelfare", "labor", "intdev", "media", "military", "geronto"],
  "psyedu":     ["psych", "edu", "childdev", "sports"],
  "business":   ["biz", "acct", "finance", "trade", "tax", "insur", "logis", "realestate", "consumer", "ip", "tourism"],
  "humanities": ["philo", "history", "lit", "religion", "ling", "translation", "archaeo", "museum"],
  "arts":       ["artstudy", "music", "film", "dance", "design", "textile", "cosmetic", "gamestudy"],
  "agrifood":   ["agri", "forestry", "livestock", "food"]
}
```

- [ ] **Step 4: `scripts/diagrams/pipeline/common.js` 작성**

```js
// 파이프라인 공통: 경로, terms.json, 분야군, JSON 입출력, 시드 난수.
// DG_ROOT 환경변수를 주면 그 폴더를 저장소 루트로 본다(테스트가 임시 루트를 쓴다).
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = process.env.DG_ROOT || path.join(__dirname, "..", "..", "..");
const SPEC_DIR = path.join(ROOT, "diagrams", "specs");
const EXAMPLE_DIR = path.join(ROOT, "diagrams", "examples");
const BATCH_DIR = path.join(ROOT, "diagrams", "batches");
const STYLE_DIR = path.join(ROOT, "diagrams", "style");
const PROMPT_DIR = path.join(ROOT, "diagrams", "prompts");

const GROUPS = JSON.parse(fs.readFileSync(path.join(__dirname, "groups.json"), "utf8"));
const CAT2GROUP = new Map();
for (const [g, cats] of Object.entries(GROUPS)) for (const c of cats) CAT2GROUP.set(c, g);

// 용어의 분야군 = 첫 번째 분야의 군
function groupOf(categories) {
  const c = Array.isArray(categories) ? categories[0] : categories;
  return CAT2GROUP.get(c) || null;
}

let termsCache = null;
function loadTerms() {
  if (!termsCache) termsCache = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  return termsCache;
}

const readJSON = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback);
function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

const specPath = (slug) => path.join(SPEC_DIR, `${slug}.json`);
const specSlugs = () => new Set(fs.existsSync(SPEC_DIR) ? fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : []);

// mulberry32: 같은 시드면 같은 수열(표본 추출 재현용)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, seed) {
  const r = rng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { ROOT, SPEC_DIR, EXAMPLE_DIR, BATCH_DIR, STYLE_DIR, PROMPT_DIR, GROUPS, groupOf, loadTerms, readJSON, writeJSON, specPath, specSlugs, rng, shuffle };
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/diagrams-pipeline.test.js`
Expected: `pass 1`, `fail 0`

- [ ] **Step 6: Commit**

```bash
git add scripts/diagrams/pipeline/groups.json scripts/diagrams/pipeline/common.js tests/diagrams-pipeline.test.js
git commit -m "도식 파이프라인: 분야군 12개 매핑과 공통 모듈"
```

---

### Task 2: 페이지 본문 추출

**Files:**
- Create: `scripts/diagrams/pipeline/page.js`
- Modify: `tests/diagrams-pipeline.test.js`

- [ ] **Step 1: 실패하는 테스트 추가** — `console.log("diagrams-pipeline: all tests passed");` 바로 위에:

```js
// ── 페이지 본문 추출 ───────────────────────────────────────
{
  const { extractPage } = require("../scripts/diagrams/pipeline/page.js");
  const html = [
    '<div class="definition-box">',
    "  <p><strong>한 줄 정의:</strong> 두 변수가 함께 변하는 정도.</p>",
    "</div>",
    "  <!-- concept-diagram:start -->",
    '  <figure class="concept-diagram"><svg><text>무시</text></svg></figure>',
    "  <!-- concept-diagram:end -->",
    "<h2>쉽게 풀면</h2><p>키가 크면 &amp; 몸무게도</p>",
    '<h2>왜 중요한가</h2><p>많이 쓴다</p><figure class="term-figure"><svg></svg></figure>',
    "<h2>논문에서는 이렇게 쓰입니다</h2><p class=\"example\">r = .45</p>",
    "<h2>조금 더 깊게 보면</h2><p>피어슨</p>",
    "<h2>주의할 점</h2><p>인과 아님</p>",
    "<h2>관련 용어</h2><ul><li>회귀</li></ul></article>",
  ].join("\n");
  const p = extractPage(html);
  assert.strictEqual(p.definition, "두 변수가 함께 변하는 정도.");
  assert.strictEqual(p.easy, "키가 크면 & 몸무게도");
  assert.strictEqual(p.usage, "r = .45");
  assert.strictEqual(p.caution, "인과 아님");
  assert.ok(p.hasLegacyFigure && p.hasConceptDiagram);
  assert.ok(!JSON.stringify(p).includes("회귀"), "관련 용어 절은 넣지 않음");

  // 실제 페이지 하나
  const real = extractPage(fs.readFileSync(path.join(REPO, "terms", "correlation.html"), "utf8"));
  for (const k of ["definition", "easy", "why", "usage", "deep", "caution"]) assert.ok(real[k].length > 10, `correlation ${k} 비어 있음`);
}
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/diagrams-pipeline.test.js`
Expected: FAIL — `Cannot find module '../scripts/diagrams/pipeline/page.js'`

- [ ] **Step 3: `scripts/diagrams/pipeline/page.js` 작성**

```js
// 용어 페이지 HTML에서 에이전트에게 줄 본문만 뽑는다.
// 절 제목은 사이트 템플릿 고정값(쉽게 풀면·왜 중요한가·논문에서는 이렇게 쓰입니다·조금 더 깊게 보면·주의할 점).
"use strict";
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./common.js");

const SECTIONS = {
  "쉽게 풀면": "easy",
  "왜 중요한가": "why",
  "논문에서는 이렇게 쓰입니다": "usage",
  "조금 더 깊게 보면": "deep",
  "주의할 점": "caution",
};

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<figure[\s\S]*?<\/figure>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPage(html) {
  const out = { definition: "", easy: "", why: "", usage: "", deep: "", caution: "" };
  const def = /<div class="definition-box">([\s\S]*?)<\/div>/.exec(html);
  if (def) out.definition = strip(def[1]).replace(/^한 줄 정의:\s*/, "");
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|<\/article>|<\/main>|$)/g;
  let m;
  while ((m = re.exec(html))) {
    const key = SECTIONS[strip(m[1])];
    if (key) out[key] = strip(m[2]);
  }
  out.hasLegacyFigure = html.includes('<figure class="term-figure">');
  out.hasConceptDiagram = html.includes("<!-- concept-diagram:start -->");
  return out;
}

function readPage(slug) {
  const file = path.join(ROOT, "terms", `${slug}.html`);
  return fs.existsSync(file) ? extractPage(fs.readFileSync(file, "utf8")) : null;
}

module.exports = { extractPage, readPage };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/diagrams-pipeline.test.js`
Expected: `pass 1`, `fail 0`. `correlation` 절 중 하나가 비면 실제 HTML을 열어 절 제목·태그 구조를 확인하고 정규식을 고친다(테스트 기준을 낮추지 않는다).

- [ ] **Step 5: Commit**

```bash
git add scripts/diagrams/pipeline/page.js tests/diagrams-pipeline.test.js
git commit -m "도식 파이프라인: 용어 페이지 본문 추출"
```

---

### Task 3: BM25와 참고 예시 검색

**Files:**
- Create: `scripts/diagrams/pipeline/bm25.js`, `scripts/diagrams/pipeline/retrieve.js`
- Modify: `tests/diagrams-pipeline.test.js`

- [ ] **Step 1: 실패하는 테스트 추가** — 마지막 `console.log` 바로 위에:

```js
// ── BM25 ───────────────────────────────────────────────────
{
  const { tokens, BM25 } = require("../scripts/diagrams/pipeline/bm25.js");
  assert.deepStrictEqual(tokens("신경 염증 TNF-a"), ["신경", "염증", "tnf"]);
  assert.deepStrictEqual(tokens("미세아교"), ["미세", "세아", "아교"]);
  const idx = new BM25([
    { id: "a", text: "미세아교세포 활성화 염증", meta: { type: "chain" } },
    { id: "b", text: "회귀 분석 잔차", meta: { type: "plot" } },
    { id: "c", text: "별아교세포 반응 염증 반응", meta: { type: "chain" } },
  ]);
  assert.strictEqual(idx.search("미세아교 염증", { k: 1 })[0].id, "a");
  assert.deepStrictEqual(idx.search("염증", { k: 5, filter: (d) => d.meta.type === "plot" }).map((h) => h.id), ["b"]);
}

// ── 참고 예시: 같은 type·분야군 → type만 → diagrams/examples ──
{
  const { buildIndex, exemplars } = require("../scripts/diagrams/pipeline/retrieve.js");
  const idx = buildIndex();
  assert.ok(idx.N > 1000, "검수 통과 스펙 색인이 비어 있음");
  const ex = exemplars(idx, { slug: "x", type: "chain", group: "life", query: "미세아교세포 염증 활성화" });
  assert.strictEqual(ex.length, 3);
  assert.ok(ex.every((s) => s.type === "chain" && s.reviewed === true));
  const cyc = exemplars(idx, { slug: "x", type: "cycle", group: "life", query: "순환" });
  assert.ok(cyc.length >= 1 && cyc.every((s) => s.type === "cycle"), "cycle은 examples에서라도 1개 이상");
  const self = exemplars(idx, { slug: ex[0].slug, type: "chain", group: "life", query: "미세아교세포 염증 활성화" });
  assert.ok(!self.some((s) => s.slug === ex[0].slug), "자기 자신은 예시에서 뺀다");
}
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/diagrams-pipeline.test.js`
Expected: FAIL — `Cannot find module '../scripts/diagrams/pipeline/bm25.js'`

- [ ] **Step 3: `scripts/diagrams/pipeline/bm25.js` 작성**

```js
// 작은 BM25. 한글은 음절 2-gram(형태소 분석 없이도 "미세아교"↔"미세아교세포"가 맞물린다),
// 영문·숫자는 2글자 이상 낱말.
"use strict";

function tokens(s) {
  const out = [];
  for (const m of String(s).toLowerCase().matchAll(/[가-힣]+|[a-z0-9]+/g)) {
    const w = m[0];
    if (/[가-힣]/.test(w)) {
      if (w.length === 1) out.push(w);
      for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2));
    } else if (w.length >= 2) out.push(w);
  }
  return out;
}

class BM25 {
  constructor(docs, { k1 = 1.2, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = docs.map((d) => {
      const tf = new Map();
      const tk = tokens(d.text);
      for (const t of tk) tf.set(t, (tf.get(t) || 0) + 1);
      return { id: d.id, tf, len: tk.length, meta: d.meta };
    });
    this.N = this.docs.length;
    this.avg = this.docs.reduce((s, d) => s + d.len, 0) / (this.N || 1);
    this.df = new Map();
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
  }
  idf(t) {
    const n = this.df.get(t) || 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }
  // 점수 내림차순, 같으면 id 오름차순(결과 재현). filter를 통과한 문서만.
  search(query, { k = 3, filter = () => true } = {}) {
    const q = [...new Set(tokens(query))];
    const hits = [];
    for (const d of this.docs) {
      if (!filter(d)) continue;
      let s = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        s += (this.idf(t) * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avg));
      }
      hits.push({ id: d.id, score: s, meta: d.meta });
    }
    return hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, k);
  }
}

module.exports = { tokens, BM25 };
```

- [ ] **Step 4: `scripts/diagrams/pipeline/retrieve.js` 작성**

```js
// 참고 예시(PaperBanana의 Retriever): 검수 통과(reviewed:true) 스펙 중 정의가 비슷한 것.
// 우선순위: 같은 type·같은 분야군 → 같은 type → diagrams/examples의 같은 type 예시.
"use strict";
const fs = require("fs");
const path = require("path");
const { SPEC_DIR, EXAMPLE_DIR, loadTerms, groupOf } = require("./common.js");
const { BM25 } = require("./bm25.js");

function readSpecs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

function buildIndex() {
  const terms = new Map(loadTerms().map((t) => [t.slug, t]));
  const docs = [];
  for (const spec of readSpecs(SPEC_DIR)) {
    if (spec.reviewed !== true) continue;
    const t = terms.get(spec.slug);
    if (!t) continue;
    docs.push({ id: spec.slug, text: `${t.title_ko} ${t.title_en || ""} ${t.definition || ""}`, meta: { type: spec.type, group: groupOf(t.categories), spec } });
  }
  const idx = new BM25(docs);
  idx.examples = readSpecs(EXAMPLE_DIR);
  return idx;
}

function exemplars(idx, { slug, type, group, query, k = 3 }) {
  const picked = [];
  const take = (hits) => { for (const h of hits) if (picked.length < k && !picked.some((p) => p.slug === h.meta.spec.slug)) picked.push(h.meta.spec); };
  const base = (d) => d.id !== slug && d.meta.type === type;
  take(idx.search(query, { k, filter: (d) => base(d) && d.meta.group === group }));
  if (picked.length < k) take(idx.search(query, { k: k * 2, filter: base }));
  for (const ex of idx.examples) if (picked.length < k && ex.type === type) picked.push(ex);
  return picked;
}

module.exports = { buildIndex, exemplars };
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/diagrams-pipeline.test.js`
Expected: `pass 1`, `fail 0`

- [ ] **Step 6: Commit**

```bash
git add scripts/diagrams/pipeline/bm25.js scripts/diagrams/pipeline/retrieve.js tests/diagrams-pipeline.test.js
git commit -m "도식 파이프라인: BM25와 참고 예시 검색(type·분야군 우선)"
```

---

### Task 4: 배치 상태 모듈

**Files:**
- Create: `scripts/diagrams/pipeline/status.js`
- Modify: `tests/diagrams-pipeline.test.js`

- [ ] **Step 1: 실패하는 테스트 추가** — 마지막 `console.log` 바로 위에:

```js
// ── 상태 전이 ──────────────────────────────────────────────
{
  const { STATES, setState, counts } = require("../scripts/diagrams/pipeline/status.js");
  const st = { items: { a: { state: "pending" }, b: { state: "pending" } } };
  setState(st, "a", "triaged", { type: "chain" });
  assert.strictEqual(st.items.a.state, "triaged");
  assert.strictEqual(st.items.a.type, "chain");
  assert.throws(() => setState(st, "zz", "triaged"), /배치에 없는/);
  assert.throws(() => setState(st, "a", "flying"), /알 수 없는 상태/);
  assert.deepStrictEqual(counts(st), { pending: 1, triaged: 1 });
  assert.ok(STATES.includes("check_failed") && STATES.includes("approved"));
}
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/diagrams-pipeline.test.js`
Expected: FAIL — `Cannot find module '../scripts/diagrams/pipeline/status.js'`

- [ ] **Step 3: `scripts/diagrams/pipeline/status.js` 작성**

```js
// 배치 상태: diagrams/batches/<NNN>/status.json
"use strict";
const fs = require("fs");
const path = require("path");
const { BATCH_DIR, readJSON, writeJSON } = require("./common.js");

const STATES = ["pending", "triaged", "dropped", "checked", "check_failed", "reviewed", "approved"];

const batchDir = (n) => path.join(BATCH_DIR, String(n).padStart(3, "0"));
const statusFile = (n) => path.join(batchDir(n), "status.json");

function load(n) {
  const st = readJSON(statusFile(n), null);
  if (!st) throw new Error(`배치 ${n} 없음: ${statusFile(n)}`);
  return st;
}
const save = (n, st) => writeJSON(statusFile(n), st);

function setState(st, slug, state, extra = {}) {
  if (!STATES.includes(state)) throw new Error(`알 수 없는 상태: ${state}`);
  const cur = st.items[slug];
  if (!cur) throw new Error(`배치에 없는 slug: ${slug}`);
  Object.assign(cur, extra, { state });
}

const inState = (st, ...states) => Object.keys(st.items).filter((s) => states.includes(st.items[s].state));

function counts(st) {
  const c = {};
  for (const it of Object.values(st.items)) c[it.state] = (c[it.state] || 0) + 1;
  return c;
}

// 모든 배치에 이미 든 slug(새 배치가 겹치지 않게)
function allBatchedSlugs() {
  const out = new Set();
  if (!fs.existsSync(BATCH_DIR)) return out;
  for (const d of fs.readdirSync(BATCH_DIR)) {
    const st = readJSON(path.join(BATCH_DIR, d, "status.json"), null);
    if (st) for (const s of Object.keys(st.items)) out.add(s);
  }
  return out;
}

module.exports = { STATES, batchDir, statusFile, load, save, setState, inState, counts, allBatchedSlugs };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/diagrams-pipeline.test.js`
Expected: `pass 1`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add scripts/diagrams/pipeline/status.js tests/diagrams-pipeline.test.js
git commit -m "도식 파이프라인: 배치 상태 모듈"
```

---

### Task 5: 배치 CLI

**Files:**
- Create: `scripts/diagrams/pipeline/batch.js`
- Modify: `package.json` (scripts에 `"diagrams:batch": "node scripts/diagrams/pipeline/batch.js"` 추가), `.gitignore`
- Test: `tests/diagrams-pipeline-batch.test.js`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`tests/diagrams-pipeline-batch.test.js` — 임시 루트에 용어 4개짜리 미니 저장소를 만들어 배치 한 바퀴를 돈다(Chrome PNG 단계는 제외):

```js
// 배치 CLI 한 바퀴: new → triage-in → triage-apply → write-in → (스펙 작성) → check → review-in(--no-png) → review-apply → preview → approve
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "dg-batch-"));
const w = (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s, "utf8"); };
const page = (def) => `<div class="definition-box"><p>한 줄 정의: ${def}</p></div>\n<h2>쉽게 풀면</h2><p>쉽게 ${def}</p><h2>조금 더 깊게 보면</h2><p>깊게</p><h2>주의할 점</h2><p>주의</p></article>`;
const terms = [
  { slug: "alpha-term", title_ko: "알파", title_en: "Alpha", categories: ["stat"], definition: "검정에서 1종 오류 확률" },
  { slug: "beta-term", title_ko: "베타", title_en: "Beta", categories: ["stat"], definition: "2종 오류 확률" },
  { slug: "gamma-term", title_ko: "감마", title_en: "Gamma", categories: ["neuro"], definition: "뇌파 대역" },
  { slug: "done-term", title_ko: "기존", title_en: "Done", categories: ["stat"], definition: "이미 도식 있음" },
];
w("terms.json", JSON.stringify(terms));
for (const t of terms) w(`terms/${t.slug}.html`, page(t.definition));
w("diagrams/specs/done-term.json", JSON.stringify({ slug: "done-term", type: "chain", nodes: [{ id: "a", label: "가" }, { id: "b", label: "나" }], edges: [{ from: "a", to: "b" }], source: "t", reviewed: true }));
w("diagrams/style/stats.md", "# stats 스타일\n");
w("diagrams/style/life.md", "# life 스타일\n");
w("data/popular-terms.json", JSON.stringify({ stat: ["beta-term", "alpha-term"] }));

const run = (...args) => execFileSync(process.execPath, [path.join(REPO, "scripts/diagrams/pipeline/batch.js"), ...args], { env: { ...process.env, DG_ROOT: root }, encoding: "utf8" });
const status = () => JSON.parse(fs.readFileSync(path.join(root, "diagrams/batches/001/status.json"), "utf8"));

try {
  // new: 기존 스펙 있는 done-term은 빠지고, popular 순서가 앞에 온다
  run("new", "1", "--size", "10", "--order", "popular", "--seed", "1");
  assert.deepStrictEqual(Object.keys(status().items), ["beta-term", "alpha-term", "gamma-term"]);
  assert.throws(() => run("new", "1", "--size", "1"), /이미 있음/);

  // triage-in: 50개씩 묶음
  run("triage-in", "1");
  const tin = JSON.parse(fs.readFileSync(path.join(root, "diagrams/batches/001/triage/in-01.json"), "utf8"));
  assert.strictEqual(tin.items.length, 3);
  assert.strictEqual(tin.items[0].page.easy, "쉽게 2종 오류 확률");

  // triage-apply: 잘못된 항목은 pending으로 남고 오류 출력
  w("diagrams/batches/001/triage/out-01.json", JSON.stringify([
    { slug: "alpha-term", verdict: "yes", type: "plot", intent: "이 그림을 보면 꼬리 면적이 α임을 알 수 있다", confidence: "high", missing_fn: null },
    { slug: "beta-term", verdict: "yes", type: "matrix", intent: "이 그림을 보면 네 칸 판단 결과를 알 수 있다", confidence: "low", missing_fn: null },
    { slug: "gamma-term", verdict: "yes", type: "spiral", intent: "짧음", confidence: "high" },
  ]));
  const out = run("triage-apply", "1");
  assert.ok(out.includes("gamma-term"), "잘못된 판정을 알려야 함");
  assert.strictEqual(status().items["alpha-term"].state, "triaged");
  assert.strictEqual(status().items["gamma-term"].state, "pending");
  w("diagrams/batches/001/triage/out-02.json", JSON.stringify([{ slug: "gamma-term", verdict: "no", reason: "단일 개념" }]));
  run("triage-apply", "1");
  assert.strictEqual(status().items["gamma-term"].state, "dropped");

  // write-in: 페이지 본문·의도·예시·스타일 경로
  run("write-in", "1");
  const win = JSON.parse(fs.readFileSync(path.join(root, "diagrams/batches/001/write/in-01.json"), "utf8"));
  assert.strictEqual(win.items.length, 2);
  assert.strictEqual(win.items.find((i) => i.slug === "alpha-term").style, "diagrams/style/stats.md");
  assert.ok(Array.isArray(win.items[0].exemplars));

  // 작성 에이전트 흉내: 하나는 올바른 스펙, 하나는 깨진 스펙
  w("diagrams/specs/alpha-term.json", JSON.stringify({ slug: "alpha-term", type: "plot", plot: { series: [{ fn: "normal", params: { mu: 0, sigma: 1 } }], shade: [{ series: 0, from: 1.64, to: null, label: "α" }], x: { label: "통계량", range: [-4, 4] }, y: { label: "밀도" } }, source: "t", reviewed: false }));
  w("diagrams/specs/beta-term.json", JSON.stringify({ slug: "beta-term", type: "matrix", nodes: [], source: "t", reviewed: false }));
  run("check", "1");
  assert.strictEqual(status().items["alpha-term"].state, "checked");
  assert.strictEqual(status().items["beta-term"].state, "check_failed");
  assert.ok(status().items["beta-term"].errors.length > 0);

  // review-in --no-png: 검사 통과한 것만, 스펙 내용 포함
  run("review-in", "1", "--no-png");
  const rin = JSON.parse(fs.readFileSync(path.join(root, "diagrams/batches/001/review/in-01.json"), "utf8"));
  assert.deepStrictEqual(rin.items.map((i) => i.slug), ["alpha-term"]);
  assert.strictEqual(rin.items[0].spec.type, "plot");

  w("diagrams/batches/001/review/out-01.json", JSON.stringify([{ slug: "alpha-term", verdict: "fix", reason: "라벨 수정" }]));
  run("review-apply", "1");
  assert.strictEqual(status().items["alpha-term"].state, "reviewed");
  assert.strictEqual(status().items["alpha-term"].review, "fix");

  // preview: 승인용 폴더와 요약
  run("preview", "1", "--sample", "5", "--seed", "3");
  assert.ok(fs.existsSync(path.join(root, "diagrams/batches/001/approval/specs/alpha-term.json")));
  const summary = fs.readFileSync(path.join(root, "diagrams/batches/001/approval/summary.md"), "utf8");
  assert.ok(summary.includes("gamma-term") && summary.includes("단일 개념"), "탈락 사유 목록");
  assert.ok(summary.includes("beta-term"), "검사 실패 목록");

  // approve는 --yes 없이 거부, 있으면 reviewed:true
  assert.throws(() => run("approve", "1"), /--yes/);
  run("approve", "1", "--yes");
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, "diagrams/specs/alpha-term.json"), "utf8")).reviewed, true);
  assert.strictEqual(status().items["alpha-term"].state, "approved");

  // 입력 묶음을 다시 만들어도 에이전트 출력은 남는다
  run("triage-in", "1");
  assert.ok(fs.existsSync(path.join(root, "diagrams/batches/001/triage/out-01.json")), "triage-in 재실행이 out-*.json을 지움");
  console.log("diagrams-pipeline-batch: all tests passed");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/diagrams-pipeline-batch.test.js`
Expected: FAIL — `Cannot find module …/batch.js`

- [ ] **Step 3: `scripts/diagrams/pipeline/batch.js` 작성**

```js
#!/usr/bin/env node
// 도식 생성 배치 도구. LLM은 부르지 않는다 — 에이전트가 읽을 입력 묶음을 쓰고, 에이전트 출력을 검증해 반영한다.
//
//   batch.js new <n> --size 200 --order popular|random --seed 1 [--prune-dir <data/prune 경로>]
//   batch.js triage-in <n>        → batches/<n>/triage/in-XX.json (50개씩)
//   batch.js triage-apply <n>     ← batches/<n>/triage/out-*.json
//   batch.js write-in <n>         → batches/<n>/write/in-XX.json (10개씩, 참고 예시·스타일 경로 포함)
//   batch.js check <n>            diagrams/specs/<slug>.json 검증·겹침 → checked | check_failed
//   batch.js render <n>           checked 스펙 PNG(데스크톱·모바일·다크) → batches/<n>/render/png
//   batch.js review-in <n> [--no-png]  → batches/<n>/review/in-XX.json (10개씩)
//   batch.js review-apply <n>     ← batches/<n>/review/out-*.json (pass|fix|drop)
//   batch.js preview <n> --sample 25 --seed 1   승인용 미리보기·요약 → batches/<n>/approval/
//   batch.js approve <n> --yes    reviewed 상태 스펙을 reviewed:true로(사용자 승인 뒤에만)
//   batch.js report <n>           상태·type·분야군별 개수
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const C = require("./common.js");
const S = require("./status.js");
const { readPage } = require("./page.js");
const { buildIndex, exemplars } = require("./retrieve.js");
const { TYPES, validateSpec, renderFigure } = require("../lib.js");

const TRIAGE_CHUNK = 50;
const WRITE_CHUNK = 10;
const REVIEW_CHUNK = 10;
const INTENT_MIN = 10;

const rel = (p) => path.relative(C.ROOT, p).replace(/\\/g, "/");

function parseArgs(argv) {
  const [cmd, n, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--")) continue;
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) opts[key] = true;
    else { opts[key] = next; i++; }
  }
  return { cmd, n: Number(n), opts };
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 이전 입력 묶음(in-*.json)만 지우고 in-01.json… 으로 쓴다. 에이전트 출력(out-*.json)은
// 지우지 않는다 — 재실행해도 이미 받은 판정·검수 결과가 사라지지 않게.
function writeChunks(dir, items, size, extra) {
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/^in-\d+\.json$/.test(f)) fs.rmSync(path.join(dir, f));
  const parts = chunks(items, size);
  parts.forEach((part, i) => C.writeJSON(path.join(dir, `in-${String(i + 1).padStart(2, "0")}.json`), { ...extra, items: part }));
  return parts.length;
}

function readOutputs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^out-.*\.json$/.test(f)).sort().flatMap((f) => {
    const v = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!Array.isArray(v)) throw new Error(`${f}: 배열이 아님`);
    return v;
  });
}

function termMap() {
  return new Map(C.loadTerms().map((t) => [t.slug, t]));
}

function pageFor(slug) {
  const p = readPage(slug);
  if (!p) return null;
  const { hasLegacyFigure, hasConceptDiagram, ...text } = p;
  return text;
}

// ── new ─────────────────────────────────────────────────
function pruneExclusions(dir) {
  const out = new Set();
  if (!dir) return out;
  const tiers = C.readJSON(path.join(dir, "tiers.json"), {});
  for (const [slug, v] of Object.entries(tiers)) if (v && v.tier === "prune") out.add(slug);
  const merge = C.readJSON(path.join(dir, "merge-candidates.json"), { groups: [] });
  for (const g of merge.groups || []) for (const s of g.absorb || []) out.add(s);
  return out;
}

function legacySlugs(pool) {
  return pool.filter((slug) => {
    const f = path.join(C.ROOT, "terms", `${slug}.html`);
    return fs.existsSync(f) && fs.readFileSync(f, "utf8").includes('<figure class="term-figure">');
  });
}

function cmdNew(n, o) {
  if (fs.existsSync(S.statusFile(n))) throw new Error(`배치 ${n} 이미 있음`);
  const size = Number(o.size || 200), seed = Number(o.seed || 1), order = o.order || "popular";
  const have = C.specSlugs(), batched = S.allBatchedSlugs(), excluded = pruneExclusions(o["prune-dir"]);
  if (o["prune-dir"] && !excluded.size) console.warn(`! --prune-dir에서 제외 목록을 못 읽음: ${o["prune-dir"]}`);
  const terms = C.loadTerms();
  const pool = terms.map((t) => t.slug).filter((s) => !have.has(s) && !batched.has(s) && !excluded.has(s));
  let ordered;
  if (order === "random") ordered = C.shuffle(pool, seed);
  else if (order === "popular") {
    const inPool = new Set(pool);
    const pop = C.readJSON(path.join(C.ROOT, "data", "popular-terms.json"), {});
    const lists = Object.keys(pop).sort().map((k) => pop[k]);
    const head = [];
    for (let r = 0; r < Math.max(0, ...lists.map((l) => l.length)); r++) {
      for (const l of lists) if (l[r] && inPool.has(l[r]) && !head.includes(l[r])) head.push(l[r]);
    }
    const headSet = new Set(head);
    const rest = pool.filter((s) => !headSet.has(s));
    const legacy = legacySlugs(rest);
    const legacySet = new Set(legacy);
    ordered = [...head, ...legacy, ...C.shuffle(rest.filter((s) => !legacySet.has(s)), seed)];
  } else throw new Error(`알 수 없는 --order: ${order}`);
  const tmap = termMap();
  const items = {};
  for (const slug of ordered.slice(0, size)) items[slug] = { state: "pending", group: C.groupOf(tmap.get(slug).categories) };
  S.save(n, { batch: n, created: new Date().toISOString(), order, seed, size, items });
  console.log(`배치 ${n}: ${Object.keys(items).length}개 (후보 ${pool.length}, 제외 ${excluded.size})`);
}

// ── triage ──────────────────────────────────────────────
function cmdTriageIn(n) {
  const st = S.load(n), tmap = termMap();
  const items = S.inState(st, "pending").map((slug) => {
    const t = tmap.get(slug);
    return { slug, title_ko: t.title_ko, title_en: t.title_en, categories: t.categories, group: st.items[slug].group, page: pageFor(slug) };
  });
  const k = writeChunks(path.join(S.batchDir(n), "triage"), items.filter((i) => i.page), TRIAGE_CHUNK, { prompt: "diagrams/prompts/triage.md", types: TYPES });
  const missing = items.filter((i) => !i.page).map((i) => i.slug);
  for (const s of missing) S.setState(st, s, "dropped", { reason: "page:페이지 없음" });
  S.save(n, st);
  console.log(`판정 입력 ${k}묶음 (${items.length - missing.length}개)${missing.length ? `, 페이지 없음 ${missing.length}개 탈락` : ""}`);
}

function cmdTriageApply(n) {
  const st = S.load(n);
  const errs = [];
  const missingFn = C.readJSON(path.join(S.batchDir(n), "missing-fn.json"), {});
  let applied = 0;
  for (const r of readOutputs(path.join(S.batchDir(n), "triage"))) {
    const it = r && st.items[r.slug];
    if (!it) { errs.push(`${r && r.slug}: 배치에 없음`); continue; }
    if (it.state !== "pending") continue; // 이미 반영됨(재실행 안전)
    if (r.verdict === "no") { S.setState(st, r.slug, "dropped", { reason: `triage:${r.reason || "no"}` }); applied++; continue; }
    if (r.verdict !== "yes") { errs.push(`${r.slug}: verdict는 yes|no`); continue; }
    const bad = [];
    if (!TYPES.includes(r.type)) bad.push(`type ${r.type}`);
    if (typeof r.intent !== "string" || r.intent.length < INTENT_MIN) bad.push("intent 너무 짧음");
    if (r.confidence !== "high" && r.confidence !== "low") bad.push("confidence는 high|low");
    if (bad.length) { errs.push(`${r.slug}: ${bad.join(", ")}`); continue; }
    S.setState(st, r.slug, "triaged", { type: r.type, intent: r.intent, confidence: r.confidence });
    if (r.missing_fn) missingFn[r.missing_fn] = (missingFn[r.missing_fn] || 0) + 1;
    applied++;
  }
  S.save(n, st);
  C.writeJSON(path.join(S.batchDir(n), "missing-fn.json"), missingFn);
  console.log(`판정 반영 ${applied}개 · 오류 ${errs.length}개`);
  for (const e of errs) console.log(`  ✗ ${e}`);
  console.log(JSON.stringify(S.counts(st)));
}

// ── write ───────────────────────────────────────────────
function cmdWriteIn(n) {
  const st = S.load(n), tmap = termMap();
  const todo = S.inState(st, "triaged").filter((s) => !fs.existsSync(C.specPath(s)));
  const groups = [...new Set(todo.map((s) => st.items[s].group))];
  const noStyle = groups.filter((g) => !fs.existsSync(path.join(C.STYLE_DIR, `${g}.md`)));
  if (noStyle.length) throw new Error(`스타일 가이드 없음: ${noStyle.map((g) => `diagrams/style/${g}.md`).join(", ")}`);
  const idx = buildIndex();
  const items = todo.map((slug) => {
    const t = tmap.get(slug), it = st.items[slug];
    return {
      slug, title_ko: t.title_ko, title_en: t.title_en, group: it.group, type: it.type, intent: it.intent, confidence: it.confidence,
      page: pageFor(slug),
      exemplars: exemplars(idx, { slug, type: it.type, group: it.group, query: `${t.title_ko} ${t.title_en || ""} ${t.definition || ""}` }),
      style: `diagrams/style/${it.group}.md`,
    };
  });
  const k = writeChunks(path.join(S.batchDir(n), "write"), items, WRITE_CHUNK, { prompt: "diagrams/prompts/write.md", readme: "diagrams/README.md", out: "diagrams/specs/<slug>.json" });
  console.log(`작성 입력 ${k}묶음 (${items.length}개)`);
}

// ── check ───────────────────────────────────────────────
function checkOne(slug, known) {
  const file = C.specPath(slug);
  let spec;
  try { spec = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return [`JSON 오류: ${e.message}`]; }
  const errs = validateSpec(spec, known);
  if (spec.slug !== slug) errs.push("파일명과 slug 불일치");
  if (spec.reviewed !== false) errs.push("작성 단계 스펙은 reviewed:false 여야 함");
  if (errs.length) return errs;
  return renderFigure(spec, slug).warnings;
}

function cmdCheck(n) {
  const st = S.load(n);
  const known = new Set(C.loadTerms().map((t) => t.slug));
  let ok = 0, bad = 0;
  for (const slug of S.inState(st, "triaged", "check_failed", "checked")) {
    if (!fs.existsSync(C.specPath(slug))) continue;
    const errors = checkOne(slug, known);
    if (errors.length) { S.setState(st, slug, "check_failed", { errors }); bad++; }
    else { S.setState(st, slug, "checked", { errors: [] }); ok++; }
  }
  S.save(n, st);
  console.log(`검사 통과 ${ok} · 실패 ${bad}`);
  for (const slug of S.inState(st, "check_failed")) console.log(`  ✗ ${slug}: ${st.items[slug].errors.join("; ")}`);
}

// ── render ──────────────────────────────────────────────
function copySpecs(slugs, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const s of slugs) fs.copyFileSync(C.specPath(s), path.join(dir, `${s}.json`));
}

function cmdRender(n) {
  const st = S.load(n);
  const slugs = S.inState(st, "checked");
  const dir = path.join(S.batchDir(n), "render");
  copySpecs(slugs, dir);
  execFileSync(process.execPath, [path.join(__dirname, "..", "preview.js"), "--dir", dir, "--png"], { stdio: "inherit", env: process.env });
  console.log(`렌더 ${slugs.length}개 → ${rel(path.join(dir, "png"))}`);
}

// ── review ──────────────────────────────────────────────
function cmdReviewIn(n, o) {
  const st = S.load(n), tmap = termMap();
  const png = path.join(S.batchDir(n), "render", "png");
  const items = S.inState(st, "checked").map((slug) => {
    const t = tmap.get(slug), it = st.items[slug];
    const shots = Object.fromEntries(["desktop", "mobile", "dark"].map((k) => [k, path.join(png, `${slug}.${k}.png`)]));
    if (!o["no-png"] && !fs.existsSync(shots.desktop)) throw new Error(`PNG 없음: ${slug} — 먼저 render ${n}`);
    return {
      slug, title_ko: t.title_ko, group: it.group, type: it.type, intent: it.intent,
      page: pageFor(slug), spec: JSON.parse(fs.readFileSync(C.specPath(slug), "utf8")),
      spec_file: rel(C.specPath(slug)), png: o["no-png"] ? null : shots,
    };
  });
  const k = writeChunks(path.join(S.batchDir(n), "review"), items, REVIEW_CHUNK, { prompt: "diagrams/prompts/review.md", readme: "diagrams/README.md" });
  console.log(`검수 입력 ${k}묶음 (${items.length}개)`);
}

function cmdReviewApply(n) {
  const st = S.load(n);
  const known = new Set(C.loadTerms().map((t) => t.slug));
  const errs = [];
  let applied = 0;
  for (const r of readOutputs(path.join(S.batchDir(n), "review"))) {
    const it = r && st.items[r.slug];
    if (!it) { errs.push(`${r && r.slug}: 배치에 없음`); continue; }
    if (it.state !== "checked") continue;
    if (r.verdict === "drop") {
      const keep = path.join(S.batchDir(n), "dropped-specs", `${r.slug}.json`);
      fs.mkdirSync(path.dirname(keep), { recursive: true });
      fs.renameSync(C.specPath(r.slug), keep);
      S.setState(st, r.slug, "dropped", { reason: `review:${r.reason || "drop"}` });
      applied++;
      continue;
    }
    if (r.verdict !== "pass" && r.verdict !== "fix") { errs.push(`${r.slug}: verdict는 pass|fix|drop`); continue; }
    const errors = checkOne(r.slug, known); // fix면 검수자가 고친 파일을 다시 검사
    if (errors.length) S.setState(st, r.slug, "check_failed", { errors, review: r.verdict, reason: r.reason || "" });
    else S.setState(st, r.slug, "reviewed", { review: r.verdict, reason: r.reason || "" });
    applied++;
  }
  S.save(n, st);
  console.log(`검수 반영 ${applied}개 · 오류 ${errs.length}개`);
  for (const e of errs) console.log(`  ✗ ${e}`);
  console.log(JSON.stringify(S.counts(st)));
}

// ── preview / approve / report ─────────────────────────
function cmdPreview(n, o) {
  const st = S.load(n);
  const size = Number(o.sample || 25), seed = Number(o.seed || 1);
  const reviewed = S.inState(st, "reviewed");
  const fixed = reviewed.filter((s) => st.items[s].review === "fix");
  const sample = C.shuffle(reviewed.filter((s) => !fixed.includes(s)), seed).slice(0, size);
  const show = [...fixed, ...sample];
  const dir = path.join(S.batchDir(n), "approval");
  copySpecs(show, path.join(dir, "specs"));
  const lines = [`# 배치 ${n} 승인 요약`, "", `상태: ${JSON.stringify(S.counts(st))}`, "",
    `미리보기: ${rel(path.join(dir, "specs", "preview.html"))} — 검수에서 고친 ${fixed.length}개 + 무작위 표본 ${sample.length}개`, "",
    "## 탈락", "", ...S.inState(st, "dropped").map((s) => `- ${s}: ${st.items[s].reason}`), "",
    "## 검사 실패(작성 재시도 필요)", "", ...S.inState(st, "check_failed").map((s) => `- ${s}: ${(st.items[s].errors || []).join("; ")}`), ""];
  fs.writeFileSync(path.join(dir, "summary.md"), lines.join("\n"), "utf8");
  if (show.length) execFileSync(process.execPath, [path.join(__dirname, "..", "preview.js"), "--dir", path.join(dir, "specs")], { stdio: "ignore", env: process.env });
  console.log(`승인 미리보기 ${show.length}개 → ${rel(path.join(dir, "summary.md"))}`);
}

function cmdApprove(n, o) {
  if (!o.yes) throw new Error("approve는 사용자 승인 뒤에만: --yes 필요");
  const st = S.load(n);
  let k = 0;
  for (const slug of S.inState(st, "reviewed")) {
    const spec = JSON.parse(fs.readFileSync(C.specPath(slug), "utf8"));
    spec.reviewed = true;
    C.writeJSON(C.specPath(slug), spec);
    S.setState(st, slug, "approved");
    k++;
  }
  S.save(n, st);
  console.log(`승인 ${k}개 → 다음: npm run build:diagrams`);
}

function cmdReport(n) {
  const st = S.load(n);
  const by = (key) => {
    const c = {};
    for (const it of Object.values(st.items)) if (it[key]) c[it[key]] = (c[it[key]] || 0) + 1;
    return c;
  };
  console.log(JSON.stringify({ state: S.counts(st), type: by("type"), group: by("group") }, null, 2));
}

const COMMANDS = {
  new: cmdNew, "triage-in": cmdTriageIn, "triage-apply": cmdTriageApply, "write-in": cmdWriteIn,
  check: cmdCheck, render: cmdRender, "review-in": cmdReviewIn, "review-apply": cmdReviewApply,
  preview: cmdPreview, approve: cmdApprove, report: cmdReport,
};

if (require.main === module) {
  const { cmd, n, opts } = parseArgs(process.argv.slice(2));
  if (!COMMANDS[cmd] || !Number.isInteger(n) || n < 1) {
    console.error(`사용: batch.js <${Object.keys(COMMANDS).join("|")}> <배치번호> [옵션]`);
    process.exit(2);
  }
  try { COMMANDS[cmd](n, opts); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}

module.exports = { parseArgs, chunks, pruneExclusions };
```

- [ ] **Step 4: package.json·.gitignore**

`package.json`의 `"build:diagrams"` 줄 다음에 추가(앞 줄 끝에 쉼표):

```json
    "diagrams:batch": "node scripts/diagrams/pipeline/batch.js"
```

`.gitignore` 끝에 추가 — 상태(`status.json`)·`missing-fn.json`·`approval/summary.md`·`uncertain.md`·`dropped-specs/`는 기록으로 커밋하고, 입력 묶음·에이전트 출력·렌더물은 제외:

```
diagrams/batches/*/triage/
diagrams/batches/*/write/
diagrams/batches/*/review/
diagrams/batches/*/render/
diagrams/batches/*/approval/specs/
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/diagrams-pipeline-batch.test.js tests/diagrams-pipeline.test.js`
Expected: `pass 2`, `fail 0`. 실패하면 batch.js를 고친다(테스트의 기대 순서·상태는 위 상태 기계 그대로). 단 하나 예외: 테스트용 `alpha-term` plot 스펙이 렌더 경고(예: 음영 라벨 자리 부족)로 `checked`가 안 되면, 코드가 아니라 그 테스트 스펙에서 shade `label`을 빼서 경고 없는 스펙으로 만든다 — 이 테스트의 목적은 파이프라인 흐름이지 plot 배치가 아니다.

- [ ] **Step 6: 실제 저장소에서 연기 시험(쓰기 없이)**

Run: `node scripts/diagrams/pipeline/batch.js report 999`
Expected: `✗ 배치 999 없음: …` 와 종료 코드 1 (실제 배치는 계획 ③에서 만든다).

- [ ] **Step 7: Commit**

```bash
git add scripts/diagrams/pipeline/batch.js tests/diagrams-pipeline-batch.test.js package.json .gitignore
git commit -m "도식 파이프라인: 배치 CLI(new·판정·작성 입력·검사·렌더·검수·미리보기·승인)"
```

---

### Task 6: 에이전트 지시문 4종

**Files:**
- Create: `diagrams/prompts/triage.md`, `diagrams/prompts/write.md`, `diagrams/prompts/review.md`, `diagrams/prompts/stylist.md`

에이전트는 이 파일과 입력 묶음 하나만 받는다. 아래 내용을 그대로 쓴다.

- [ ] **Step 1: `diagrams/prompts/triage.md`**

````markdown
# 판정: 이 용어에 도식이 필요한가

입력: `diagrams/batches/<NNN>/triage/in-XX.json` 하나. `items[]`마다 용어 제목·분야·페이지 본문(`page`).
출력: 같은 폴더의 `out-XX.json`(입력 번호와 같게) — 항목마다 아래 객체 하나, 입력 순서대로, JSON 배열만.

```json
{"slug": "…", "verdict": "yes", "type": "chain", "intent": "이 그림을 보면 …을 알 수 있다", "confidence": "high", "missing_fn": null}
{"slug": "…", "verdict": "no", "reason": "단일 물질명"}
```

## yes 조건 — 셋 다 충족할 때만

1. 서로 관계를 맺는 구성 요소가 3개 이상 있다: 기전·경로, 단계, 포함·분류, 비교 축, 순환, 시간 순서, 수치의 모양(분포·곡선).
2. 그림이 정의를 되풀이하지 않고 글만으로는 잘 안 잡히는 것을 보여 준다. `intent`를 "이 그림을 보면 ___을 알 수 있다" 꼴로 구체적으로 못 쓰면 no.
3. 학계에서 논쟁 중인 주장을 단정하지 않고 그릴 수 있다.

## no의 전형
물질·화합물·종 이름, 인물·지명·기관, 단일 속성·단위, 다른 용어의 동의어나 하위 사례에 불과한 것, 본문이 너무 짧아 근거가 없는 것.

## type 고르기 (9개)
| type | 언제 |
|---|---|
| chain | 원인→결과, 기전·경로(억제·차단 포함) |
| procedure | 방법·실험·절차의 순서 있는 단계 |
| contrast | 두 개념을 같은 기준으로 나란히 비교 |
| hierarchy | 상위 개념이 하위 유형으로 나뉨 |
| cycle | 끝이 처음으로 되돌아오는 반복 과정(3~6단계) |
| matrix | 두 기준(각 2수준)으로 나뉜 네 칸 |
| venn | 2~3개 개념의 겹침·공통 부분 |
| timeline | 사건·이론의 시간 순서(2~7개) |
| plot | 분포·곡선의 모양 자체가 핵심(정규·t·카이제곱·지수·S자·직선·ROC·용량-반응·역U·감쇠) |

plot이 맞는데 위 10개 함수로 못 그리면 `missing_fn`에 필요한 함수 이름(예: `"poisson"`)을 적고, 다른 type으로 그릴 수 있으면 그 type을, 없으면 no.

`confidence`: 근거가 본문에 분명하면 high, 그림 구성이 본문 밖 지식에 크게 기대면 low.
대략 10~20%만 yes가 나오는 것이 정상이다. 애매하면 no.
````

- [ ] **Step 2: `diagrams/prompts/write.md`**

````markdown
# 작성: 도식 스펙 JSON

입력: `diagrams/batches/<NNN>/write/in-XX.json` 하나. `items[]`마다 용어, 판정의 `type`·`intent`, 페이지 본문(`page`), 참고 예시 스펙 3개(`exemplars`), 분야군 스타일 가이드 경로(`style`).
먼저 읽을 것: `diagrams/README.md`(스펙 형식 전체), 각 항목의 `style` 파일.
출력: 항목마다 `diagrams/specs/<slug>.json` 한 파일. 다른 파일은 쓰지 않는다.

## 순서 (항목마다)
1. **계획**: `intent`를 이루려면 어떤 노드·관계가 필요한지 2~3줄로 머릿속에 정한다. 본문(`page`)에 근거가 있는 것만 쓴다.
2. **참고**: `exemplars`의 구조·라벨 길이·색 쓰는 법을 따라 하되 내용은 베끼지 않는다.
3. **작성**: README 형식대로. 필수: `slug`, `type`, `source`(근거 — 페이지 본문이면 `"용어 페이지 본문"`, 문헌이면 서지), `"reviewed": false`.
4. **검사**: `node scripts/diagrams/check.js diagrams/specs/<slug>.json` → `OK`가 나올 때까지 고친다(최대 3번). 그래도 경고가 남으면 그대로 두고 다음 항목으로.
5. **눈으로 확인**: 한 묶음을 다 쓴 뒤 `node scripts/diagrams/pipeline/batch.js render <NNN>`은 컨트롤러가 돌린다 — 너는 하지 않는다.

## 규칙
- 라벨은 한글 10자, sub는 14자 안팎. 영문 약어는 본문에 있을 때만 괄호로.
- 색은 역할 기준(README 색 표). 같은 역할에는 같은 색.
- 본문에 없는 수치·고유명·연결을 지어내지 않는다. 확신이 낮은 연결은 넣지 말고 `diagrams/batches/<NNN>/uncertain.md`에 `- <slug> — <뺀 연결>: <이유>` 한 줄을 덧붙인다.
- 논쟁 중인 내용은 `notes`에 `"tone": "limit"`로 "논쟁 중" 등을 밝힌다. 단정하지 않는다.
- plot은 좌표를 쓰지 않는다. 함수와 매개변수만. 눈금(`ticks`)은 숫자 자체가 의미 있을 때만(ROC 등).
- venn 영역 라벨·cycle 가운데 글자는 짧게(8자 안팎) — 길면 자리가 없어 경고가 난다.
- 그림 하나에 노드 3~8개가 적당하다. 많으면 핵심만 남긴다.
````

- [ ] **Step 3: `diagrams/prompts/review.md`**

````markdown
# 독립 검수: 내용과 그림

너는 작성자와 다른 검수자다. 입력: `diagrams/batches/<NNN>/review/in-XX.json` 하나. `items[]`마다 용어, `intent`, 페이지 본문(`page`), 스펙(`spec`, 파일은 `spec_file`), PNG 3장(`png.desktop`·`png.mobile`·`png.dark`).
먼저 읽을 것: `diagrams/README.md`.
출력: 같은 폴더의 `out-XX.json` — 항목마다 `{"slug": "…", "verdict": "pass|fix|drop", "reason": "한 줄"}`, JSON 배열만.

## 항목마다
1. **PNG 3장을 연다**(Read 도구). 글자 잘림·겹침, 화살표 방향과 의미, 다크 모드 가독성, 모바일에서 읽히는지.
2. **내용**: 페이지 본문·일반 학술 지식과 맞는가. 화살표가 인과를 과장하지 않는가. 논쟁적 주장을 단정하지 않는가. plot 매개변수가 그럴듯한가(예: ROC의 AUC, 분포 모양).
3. **의도**: 그림이 `intent`를 실제로 보여 주는가.

## 판정
- **pass**: 고칠 것 없음.
- **fix**: 고칠 수 있는 문제. `spec_file`을 직접 고치고 `node scripts/diagrams/check.js <spec_file>`로 `OK`를 확인한 뒤 fix로 적는다. `reviewed`는 false 그대로.
- **drop**: 그림이 개념을 오히려 오해하게 만들거나, 본문 근거가 부족하거나, 고치려면 처음부터 다시 그려야 할 때. 이유를 구체적으로.

엄격하게 본다. 지난 검수에서 1,800여 개 중 1,577개를 고쳤다 — 사실·표기·색·주석 오류가 흔하다.
````

- [ ] **Step 4: `diagrams/prompts/stylist.md`**

````markdown
# 분야군 스타일 가이드 작성

입력: 분야군 이름 `<group>`과 그 분야 코드 목록(`scripts/diagrams/pipeline/groups.json`).
읽을 것: `diagrams/README.md`, 그리고 `diagrams/specs/` 중 `reviewed: true`이고 첫 분야가 이 분야군에 속하는 스펙 전부(분야는 `terms.json`의 `categories[0]`). 30개가 넘으면 type별로 고르게 30개.
출력: `diagrams/style/<group>.md` 한 파일, 60줄 이내, 아래 절 그대로.

```markdown
# <분야군 한글 이름> 스타일 가이드
## 자주 맞는 type
(이 분야 용어에 어떤 type이 잘 맞는지, 예 용어와 함께 3~5줄)
## 라벨 관례
(이 분야의 표기 관례: 영문 약어 병기, 단위, 기호, 고유명 표기, 길이)
## 색 쓰는 법
(README 역할 기준 색을 이 분야 개념에 어떻게 대응시키는지 — 예: 사회과학이면 정책·제도=blue, 개입=amber …)
## 피할 것
(이 분야 도식에서 흔한 오류: 인과 과장, 논쟁적 단정, 지나친 단순화 등 3~5줄)
## 좋은 예
(검수 통과 스펙 2개의 slug와 왜 좋은지 한 줄씩)
```

기존 스펙에서 실제로 관찰한 것만 쓴다. 추측으로 규칙을 만들지 않는다.
````

- [ ] **Step 5: Commit**

```bash
git add diagrams/prompts
git commit -m "도식 파이프라인: 판정·작성·검수·스타일 에이전트 지시문"
```

---

## 이 계획 다음

계획 ③ 파일럿·배치 운영: 스타일 가이드 12개 생성·승인 → 파일럿 배치(무작위 500개 판정, 9개 type 각 5개 이상 50개 작성·검수, 전부 사용자 검토) → 처리량 실측 → 본 배치(200개 단위, popular 순서, 표본 승인).
