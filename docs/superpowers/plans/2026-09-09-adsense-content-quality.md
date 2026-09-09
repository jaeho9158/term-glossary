# 애드센스 콘텐츠 품질 대응 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카테고리 허브 페이지의 도어웨이 패턴을 제거하고(하위분류 섹션화 + 진짜 소개 문단), 용어 비교 콘텐츠 파일럿 2건을 추가하고, `about.html`에 정직한 운영 신뢰 신호를 넣는다.

**Architecture:** 콘텐츠 생성은 서브에이전트(집필 → 검수)가 담당하고, HTML 조립은 결정론적 생성기 스크립트가 담당한다 — 이 리포지토리의 기존 관례(`scripts/build-term-page.js` + `scripts/merge-term-round.js`)를 그대로 재사용한다. 서브에이전트 산출물은 그대로 믿지 않고 매 단계 검증 후 반영한다.

**Tech Stack:** Node.js(빌드 스크립트), `node --test`(단위 테스트), Agent 도구(콘텐츠 집필·검수), 기존 `scripts/templates/site-chrome.js`(공용 헤더/푸터).

## Global Constraints

- **`terms/*.html`, `terms.json`, `assets/category-data.js`의 `SUB_CATEGORY_ORDER`는 절대 수정하지 않는다** — 다른 세션이 용어 심화 작업으로 이 파일들을 동시에 건드리고 있어(프로젝트 메모리 기록), 건드리면 충돌한다. `assets/category-data.js`에 새 export(`CATEGORY_INTRO`)를 **추가**하는 것은 허용되지만 기존 export는 건드리지 않는다.
- 새 HTML은 전부 결정론적 생성기가 조립한다. 서브에이전트는 콘텐츠 JSON만 쓴다.
- 링크 마커는 `[[slug|표시문구]]` 형식만 허용(`scripts/build-term-page.js`의 `renderProse` 규약 재사용). 원시 HTML 태그를 본문에 넣지 않는다.
- 이스케이프는 `assets/escape.js`의 `escapeHtml`(전역/`module.exports` 겸용)만 쓴다. 새 이스케이프 함수를 만들지 않는다.
- BASE_URL은 `scripts/site-config.js`가 단일 출처다. 하드코딩 금지(과거 사고 이력 있음).
- 신규 순수 함수는 `assets/quiz-core.js`·`scripts/build-term-page.js`와 같은 패턴(Node `module.exports`)으로 만들어 `tests/*.test.js`에서 `require`로 검증한다.
- `about.html`에 쓰는 사실은 사용자가 확인해준 것만: 운영 주체명 "지니어스 클럽", 상태는 "비영리 사단법인 설립 준비 중"(등록 완료 아님), 콘텐츠 제작은 "AI 초안 작성 + 별도 AI 검수 단계". 그 외 사실(설립일·인원 등)은 추가하지 않는다.
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- 실행 환경: Windows Git Bash. Node는 `export PATH="/c/Program Files/nodejs:$PATH"` 후 사용. 대량 파일(`terms/*.html` 등) 대상 `ls`/`find`는 느리므로 `fs.readdirSync`를 쓴다. 한글이 든 파일은 Bash heredoc 대신 Write 도구로 만든다(heredoc이 인코딩을 깨뜨린 이력 있음).
- 서브에이전트 집필/검수는 이 세션의 **Agent 도구를 직접 병렬 호출**한다(Workflow 도구 아님 — Workflow는 사용자의 명시적 opt-in이 있을 때만 쓴다. 이 계획엔 그런 지시가 없다).

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `scripts/category-subgroups.js` | 순수 함수: 카테고리 안 용어를 하위분류별 섹션으로 묶고, 소규모 하위분류는 "기타"로 접음 |
| `tests/category-subgroups.test.js` | 위 함수 테스트 |
| `scripts/prep-category-intro-batches.js` | `assets/category-data.js`에서 배치별 입력 파일 생성(집필 에이전트에게 줄 재료) |
| `.category-intro-drafts/` | 에이전트 산출물 임시 저장(`.gitignore` 추가) |
| `scripts/apply-category-intro.js` | 에이전트 산출물 검증 후 `assets/category-data.js`의 `CATEGORY_INTRO`에 반영 |
| `tests/apply-category-intro.test.js` | 검증 로직(순수 함수로 분리) 테스트 |
| `assets/category-data.js` | 수정: `CATEGORY_INTRO` export 추가(기존 export는 그대로) |
| `scripts/generate-category-pages.js` | 수정: 하위분류 섹션 + `CATEGORY_INTRO` + `data/compare-pairs.json` 링크 반영 |
| `category.html` | 수정: 정적 총괄 소개 문단 1개 추가 |
| `style.css` | 수정: 섹션 개수 표기, 비교표, 비교 링크 스타일 추가 |
| `scripts/compare-page-core.js` | 순수 함수: 짝 슬러그 정렬, 비교표 행 렌더링 |
| `tests/compare-page-core.test.js` | 위 함수 테스트 |
| `scripts/build-compare-page.js` | 비교 페이지 HTML 조립(결정론적) |
| `.compare-drafts/` | 에이전트 산출물 임시 저장(`.gitignore` 추가) |
| `scripts/apply-compare-pairs.js` | 에이전트 산출물 검증 → `compare/*.html` 생성 + `data/compare-pairs.json` 갱신 |
| `tests/apply-compare-pairs.test.js` | 검증 로직 테스트 |
| `data/compare-pairs.json` | 비교 페이지 매니페스트(카테고리 페이지·sitemap이 읽음) |
| `scripts/generate-sitemap.js` | 수정: `compare/*.html` 포함 |
| `about.html` | 수정: 운영 주체·검수 방식 문단 추가 |
| `.gitignore` | 수정: 초안 디렉터리 2개 추가 |

---

### Task 1: 하위분류 섹션화 순수 함수 (TDD)

**Files:**
- Create: `scripts/category-subgroups.js`
- Create: `tests/category-subgroups.test.js`

**Interfaces:**
- Produces: `buildSubcategorySections(terms, subOrder)` → `[{ name: string, terms: Term[] }]`. `terms`는 `{slug, title_ko, title_en, subcategory}`를 가진 배열, `subOrder`는 `SUB_CATEGORY_ORDER[code]`(문자열 배열). Task 3이 이 함수를 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/category-subgroups.test.js
// 카테고리 페이지의 "평면 링크 385개" 도어웨이 패턴을 하위분류 섹션으로 나누는
// 로직. 3개 미만인 표류 하위분류는 "기타"로 접어야 목록이 깨끗해진다.
const assert = require("assert");
const { buildSubcategorySections, FOLD_THRESHOLD, OTHER_LABEL } =
  require("../scripts/category-subgroups.js");

const mk = (slug, ko, sub) => ({ slug, title_ko: ko, title_en: slug, subcategory: sub });

// 정상: subOrder 순서대로 섹션이 나오고, 섹션 내부는 한글 표제어 순
{
  const terms = [
    mk("b", "나", "A분류"), mk("a", "가", "A분류"), mk("c", "다", "A분류"),
    mk("x", "엑스", "B분류"), mk("y", "와이", "B분류"), mk("z", "제트", "B분류"),
  ];
  const sections = buildSubcategorySections(terms, ["A분류", "B분류"]);
  assert.strictEqual(sections.length, 2);
  assert.strictEqual(sections[0].name, "A분류");
  assert.deepStrictEqual(sections[0].terms.map((t) => t.slug), ["a", "b", "c"]);
  assert.strictEqual(sections[1].name, "B분류");
}

// 경계: FOLD_THRESHOLD(3) 미만인 하위분류는 "기타"로 접히고, 여러 소규모
// 하위분류가 있으면 전부 하나의 기타 섹션에 합쳐진다
{
  const terms = [
    mk("a", "가", "큰분류"), mk("b", "나", "큰분류"), mk("c", "다", "큰분류"),
    mk("d", "라", "작은분류1"),
    mk("e", "마", "작은분류2"), mk("f", "바", "작은분류2"),
  ];
  const sections = buildSubcategorySections(terms, ["큰분류", "작은분류1", "작은분류2"]);
  assert.strictEqual(sections.length, 2, "큰분류 + 기타(합쳐진 것) = 2개");
  assert.strictEqual(sections[0].name, "큰분류");
  const other = sections.find((s) => s.name === OTHER_LABEL);
  assert.ok(other, "기타 섹션이 있어야 함");
  assert.strictEqual(other.terms.length, 3);
  assert.strictEqual(sections[sections.length - 1].name, OTHER_LABEL, "기타는 항상 맨 뒤");
}

// 경계: subOrder에 없는 subcategory 값(방어적 케이스)도 기타로 들어간다
{
  const terms = [mk("a", "가", "목록에없는값"), mk("b", "나", "실분류"), mk("c", "다", "실분류"), mk("d", "라", "실분류")];
  const sections = buildSubcategorySections(terms, ["실분류"]);
  const other = sections.find((s) => s.name === OTHER_LABEL);
  assert.ok(other);
  assert.strictEqual(other.terms[0].slug, "a");
}

// 실패: 빈 입력은 빈 배열
{
  assert.deepStrictEqual(buildSubcategorySections([], ["A"]), []);
}

// FOLD_THRESHOLD 값 자체를 export해 회귀 시 상수 값 변경을 눈치채게 한다
assert.strictEqual(FOLD_THRESHOLD, 3);

console.log("category-subgroups: all tests passed");
```

- [ ] **Step 2: 실패 확인**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
node --test tests/category-subgroups.test.js 2>&1 | tail -5
```
Expected: `Cannot find module '../scripts/category-subgroups.js'`.

- [ ] **Step 3: 구현**

```js
// scripts/category-subgroups.js
// 카테고리 페이지의 하위분류 섹션화. 하위분류당 용어가 FOLD_THRESHOLD 미만이면
// "기타"로 접어, 표류하는 1~2개짜리 하위분류가 목록을 어지럽히지 않게 한다.
const FOLD_THRESHOLD = 3;
const OTHER_LABEL = "기타";

function buildSubcategorySections(terms, subOrder) {
  const bySub = new Map();
  for (const t of terms) {
    const key = t.subcategory && subOrder.includes(t.subcategory) ? t.subcategory : OTHER_LABEL;
    if (!bySub.has(key)) bySub.set(key, []);
    bySub.get(key).push(t);
  }

  const sections = [];
  const otherOverflow = bySub.has(OTHER_LABEL) ? bySub.get(OTHER_LABEL).slice() : [];

  for (const name of subOrder) {
    const list = bySub.get(name);
    if (!list || !list.length) continue;
    if (list.length < FOLD_THRESHOLD) {
      otherOverflow.push(...list);
      continue;
    }
    sections.push({ name, terms: list.slice() });
  }

  if (otherOverflow.length) {
    sections.push({ name: OTHER_LABEL, terms: otherOverflow });
  }

  for (const s of sections) {
    s.terms.sort((a, b) => a.title_ko.localeCompare(b.title_ko, "ko"));
  }

  return sections;
}

module.exports = { buildSubcategorySections, FOLD_THRESHOLD, OTHER_LABEL };
```

- [ ] **Step 4: 통과 확인**

```bash
node --test tests/category-subgroups.test.js 2>&1 | tail -5
```
Expected: `pass 1`(파일 단위), 내부 assert 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add scripts/category-subgroups.js tests/category-subgroups.test.js
git commit -m "카테고리 허브: 하위분류 섹션화 순수 함수 + 테스트

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: 분야 소개 문단(`CATEGORY_INTRO`) 생성 — 집필·검수·반영

**Files:**
- Create: `scripts/prep-category-intro-batches.js`
- Create: `scripts/apply-category-intro.js`
- Create: `tests/apply-category-intro.test.js`
- Modify: `assets/category-data.js` (끝의 `return { ... }`에 `CATEGORY_INTRO` 추가)
- Modify: `.gitignore` (`.category-intro-drafts/` 추가)

**Interfaces:**
- Consumes: `assets/category-data.js`의 `CATEGORY_LABELS`, `CATEGORY_ORDER`, `SUB_CATEGORY_ORDER`(읽기 전용)
- Produces: `assets/category-data.js`에 새 export `CATEGORY_INTRO: { [code]: string }`(98개 전부, 각 150~320자). Task 3이 이 값을 소비한다.

- [ ] **Step 1: `.gitignore`에 초안 디렉터리 추가**

`.gitignore` 끝에 추가:
```
# 콘텐츠 생성 파이프라인 임시 산출물(에이전트 초안) — 병합 후 결과만 커밋
.category-intro-drafts/
.compare-drafts/
```

- [ ] **Step 2: 배치 입력 파일 생성 스크립트 작성**

```js
// scripts/prep-category-intro-batches.js
// 집필 에이전트에게 줄 재료를 만든다. 카테고리 10개씩 묶어 배치 파일로 쪼갠다
// (98개를 개별 에이전트 98번 돌리는 대신, 한 에이전트가 10개씩 맡아 왕복 횟수를
// 줄인다 — 짧은 소개 문단이라 품질 저하 없이 묶어도 된다).
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT_DIR, ".category-intro-drafts");
const BATCH_SIZE = 10;

function run() {
  const { CATEGORY_LABELS, CATEGORY_ORDER, SUB_CATEGORY_ORDER } =
    require(path.join(ROOT_DIR, "assets", "category-data.js"));
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "terms.json"), "utf8"));

  const countByCode = {};
  for (const t of terms) for (const c of t.categories || []) countByCode[c] = (countByCode[c] || 0) + 1;

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const items = CATEGORY_ORDER.map((code) => ({
    code,
    label: CATEGORY_LABELS[code],
    termCount: countByCode[code] || 0,
    subcategories: SUB_CATEGORY_ORDER[code] || [],
  }));

  let batchCount = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batchCount += 1;
    const batch = items.slice(i, i + BATCH_SIZE);
    fs.writeFileSync(
      path.join(OUT_DIR, `input-batch-${batchCount}.json`),
      JSON.stringify(batch, null, 1),
      "utf8"
    );
  }
  console.log(`배치 ${batchCount}개 생성 (${items.length}개 분야, 배치당 최대 ${BATCH_SIZE}개)`);
}

run();
```

- [ ] **Step 3: 실행**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
node scripts/prep-category-intro-batches.js
ls .category-intro-drafts/ | wc -l
```
Expected: `배치 10개 생성 (98개 분야, 배치당 최대 10개)`, 파일 10개.

- [ ] **Step 4: 검증 로직을 순수 함수로 먼저 작성 (TDD) — 실패하는 테스트**

```js
// tests/apply-category-intro.test.js
// 에이전트가 쓴 분야 소개 문단을 그대로 믿지 않고 검증한다: 길이 범위,
// 하위분류 이름을 실제로 언급하는지(엉뚱한 분야 복붙 방지), 빈 값 거부.
const assert = require("assert");
const { validateIntro } = require("../scripts/apply-category-intro.js");

const item = { code: "stat", label: "통계", subcategories: ["추론통계·가설검정", "기술통계·확률분포"] };

// 정상: 길이 범위 안, 하위분류 이름 하나 이상 언급
{
  const ok = "통계는 평균과 분산 같은 값으로 데이터를 요약하고, 추론통계·가설검정처럼 표본에서 모집단을 추정하는 방법을 다룹니다. 결과 섹션의 숫자를 해석하려는 독자가 주로 찾습니다.";
  const r = validateIntro(item, ok);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
}

// 실패: 너무 짧음(150자 미만)
{
  const r = validateIntro(item, "통계 용어를 모았습니다.");
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /길이/);
}

// 실패: 너무 김(320자 초과)
{
  const r = validateIntro(item, "가".repeat(321));
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /길이/);
}

// 실패: 하위분류 이름을 하나도 언급하지 않음
{
  const r = validateIntro(item, "이 분야는 매우 중요하고 다양한 곳에서 쓰이며 논문을 읽을 때 자주 등장하는 개념들을 폭넓게 다루고 있어 많은 독자들이 찾는 인기 있는 학술 분야입니다.");
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /하위분류/);
}

// 실패: HTML 태그 포함(원시 마크업 금지)
{
  const r = validateIntro(item, "통계는 <b>추론통계·가설검정</b>처럼 표본에서 모집단을 추정하는 방법과 평균·분산 같은 요약값을 다루는 분야로, 결과 섹션의 숫자를 해석하려는 독자가 주로 찾는 내용을 담고 있습니다.");
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /태그/);
}

// 실패: 빈 값·비문자열
{
  assert.strictEqual(validateIntro(item, "").ok, false);
  assert.strictEqual(validateIntro(item, null).ok, false);
}

console.log("apply-category-intro: all tests passed");
```

- [ ] **Step 5: 실패 확인**

```bash
node --test tests/apply-category-intro.test.js 2>&1 | tail -5
```
Expected: `Cannot find module '../scripts/apply-category-intro.js'`.

- [ ] **Step 6: 반영 스크립트 구현(검증 함수 + 적용 로직)**

```js
// scripts/apply-category-intro.js
// .category-intro-drafts/output-batch-*.json (에이전트 산출물)을 검증 후
// assets/category-data.js의 CATEGORY_INTRO에 반영한다.
//
// usage: node scripts/apply-category-intro.js [--dry]
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const DRAFT_DIR = path.join(ROOT_DIR, ".category-intro-drafts");
const CATEGORY_DATA_PATH = path.join(ROOT_DIR, "assets", "category-data.js");

const MIN_LEN = 150;
const MAX_LEN = 320;

// item: {code, label, subcategories}, intro: 검증할 문자열
function validateIntro(item, intro) {
  if (typeof intro !== "string" || !intro.trim()) {
    return { ok: false, reason: "빈 값이거나 문자열이 아님" };
  }
  const text = intro.trim();
  if (text.length < MIN_LEN || text.length > MAX_LEN) {
    return { ok: false, reason: `길이 ${text.length}자 (허용 ${MIN_LEN}~${MAX_LEN})` };
  }
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return { ok: false, reason: "HTML 태그 포함 금지" };
  }
  const mentions = (item.subcategories || []).some((s) => text.includes(s));
  if (!mentions) {
    return { ok: false, reason: "하위분류 이름을 하나도 언급하지 않음" };
  }
  return { ok: true };
}

function loadItemsByCode() {
  const { CATEGORY_LABELS, CATEGORY_ORDER, SUB_CATEGORY_ORDER } = require(CATEGORY_DATA_PATH);
  const map = new Map();
  for (const code of CATEGORY_ORDER) {
    map.set(code, { code, label: CATEGORY_LABELS[code], subcategories: SUB_CATEGORY_ORDER[code] || [] });
  }
  return map;
}

function main() {
  const dry = process.argv.includes("--dry");
  const itemsByCode = loadItemsByCode();

  const files = fs.existsSync(DRAFT_DIR)
    ? fs.readdirSync(DRAFT_DIR).filter((f) => /^output-batch-.*\.json$/.test(f))
    : [];

  const accepted = {};
  const rejected = [];
  for (const f of files) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(DRAFT_DIR, f), "utf8"));
    } catch (err) {
      console.error(`[skip-file] ${f}: JSON 파싱 실패 — ${err.message}`);
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : [];
    for (const entry of list) {
      const item = itemsByCode.get(entry.code);
      if (!item) { rejected.push([entry.code, "존재하지 않는 카테고리 코드"]); continue; }
      const r = validateIntro(item, entry.intro);
      if (!r.ok) { rejected.push([entry.code, r.reason]); continue; }
      accepted[entry.code] = entry.intro.trim();
    }
  }

  const missing = [...itemsByCode.keys()].filter((c) => !accepted[c]);
  console.log(`승인 ${Object.keys(accepted).length} / 반려 ${rejected.length} / 누락 ${missing.length}`);
  for (const [code, reason] of rejected) console.log(`  [반려] ${code}: ${reason}`);
  if (missing.length) console.log(`  [누락] ${missing.join(", ")}`);

  if (dry || !Object.keys(accepted).length) {
    console.log(dry ? "(dry run — 파일 미변경)" : "반영할 항목 없음.");
    return;
  }

  let src = fs.readFileSync(CATEGORY_DATA_PATH, "utf8");
  const marker = "  return { CATEGORY_LABELS, CATEGORY_GROUPS, CATEGORY_ORDER, CATEGORY_ALIASES, SUB_CATEGORY_ORDER, CATEGORY_DESCRIPTIONS, HOME_FEATURED_CATEGORIES };";
  if (!src.includes(marker)) {
    throw new Error("category-data.js의 return 문 형태가 바뀌었습니다 — 스크립트를 다시 확인하세요.");
  }

  // 기존 CATEGORY_INTRO가 있으면(재실행) 병합, 없으면 새로 만든다.
  const existingMatch = /const CATEGORY_INTRO = (\{[\s\S]*?\n  \});\n\n/.exec(src);
  const existing = existingMatch ? JSON.parse(existingMatch[1].replace(/(\w[\w가-힣·]*):/g, '"$1":')) : {};
  const merged = { ...existing, ...accepted };

  const block = `const CATEGORY_INTRO = ${JSON.stringify(merged, null, 2).replace(/^/gm, "  ").trim()};\n\n  `;
  if (existingMatch) {
    src = src.slice(0, existingMatch.index) + block + src.slice(existingMatch.index + existingMatch[0].length);
  } else {
    src = src.replace(marker, `${block}${marker}`);
  }
  src = src.replace(marker, marker.replace("HOME_FEATURED_CATEGORIES };", "HOME_FEATURED_CATEGORIES, CATEGORY_INTRO };"));

  fs.writeFileSync(CATEGORY_DATA_PATH, src, "utf8");
  console.log(`category-data.js 갱신 완료 (CATEGORY_INTRO ${Object.keys(merged).length}개)`);
}

if (require.main === module) main();
module.exports = { validateIntro };
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
node --test tests/apply-category-intro.test.js 2>&1 | tail -5
```
Expected: 전부 통과.

- [ ] **Step 8: 커밋(스크립트만 — 콘텐츠는 다음 단계)**

```bash
git add scripts/prep-category-intro-batches.js scripts/apply-category-intro.js tests/apply-category-intro.test.js .gitignore
git commit -m "카테고리 허브: 분야 소개 문단 생성 파이프라인(준비·검증·반영 스크립트)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 9: 집필 에이전트 10개를 병렬 디스패치**

Agent 도구로 `.category-intro-drafts/input-batch-1.json` ~ `input-batch-10.json` 각각에 대해 **한 번에 10개를 동시에** 호출한다. 배치 N의 프롬프트:

```
너는 한국어 학술 용어사전 "논문용어사전"의 카테고리 소개 문단 집필자다.

아래 파일을 읽어라: C:\Users\hssh9\용돈벌이\.category-intro-drafts\input-batch-{N}.json
배열의 각 항목은 {code, label, termCount, subcategories} 형태다.

각 항목마다 그 분야를 소개하는 문단을 하나씩 써라. 조건:
- 150~320자, 3~5문장.
- 이 분야가 다루는 범위를 구체적으로 설명하고, subcategories 배열에 있는
  하위분류 이름을 그대로 최소 1개 문장 안에 넣어라(다른 말로 바꾸지 말 것 —
  나중에 이 정확한 문자열 일치로 검증한다).
- 어떤 상황의 독자가 이 분야를 주로 찾는지 한 문장 포함하라(예: "논문의
  방법론 섹션을 이해하려는 독자").
- HTML 태그나 마크다운을 쓰지 마라. 순수 텍스트 문장만.
- 다른 분야 설명과 복붙 수준으로 겹치는 표현("다양한 곳에서 쓰이는 중요한
  개념들")을 쓰지 마라 — 그 분야만의 구체적인 내용으로 채워라.

결과를 Write 도구로 이 경로에 JSON 배열로 저장하라:
C:\Users\hssh9\용돈벌이\.category-intro-drafts\output-batch-{N}.json
형식: [{"code": "stat", "intro": "..."}, ...] — 입력 배치의 모든 항목에 대해
빠짐없이 하나씩 있어야 한다.
```

(`{N}`을 1~10으로 바꿔 10개 프롬프트를 동시에 호출한다. 이 세션의 Agent 도구를 병렬로 쓰면 된다 — Workflow 도구 아님.)

- [ ] **Step 10: 검수 에이전트 10개를 병렬 디스패치**

각 배치마다, 집필 결과가 준비되면 검수 프롬프트:

```
너는 한국어 학술 용어사전 "논문용어사전"의 카테고리 소개 문단 검수자다.

대상: C:\Users\hssh9\용돈벌이\.category-intro-drafts\output-batch-{N}.json
원본 입력: C:\Users\hssh9\용돈벌이\.category-intro-drafts\input-batch-{N}.json

각 항목마다 확인하라:
1. 그 분야에 대한 설명으로서 사실이 정확한가(엉뚱한 학문의 정의를 섞지 않았는지).
2. subcategories 목록의 이름 중 하나가 문단 안에 정확한 문자열로 들어 있는가.
3. 다른 분야 설명과 바꿔써도 이상하지 않을 정도로 일반론적이지는 않은가.
4. 150~320자 범위인가.

문제가 있는 항목의 code만 골라 이 경로에 저장하라:
C:\Users\hssh9\용돈벌이\.category-intro-drafts\verdict-batch-{N}.json
형식: {"reject": ["code1", "code2"], "reasons": {"code1": "구체적 사유"}}
문제 없으면 {"reject": [], "reasons": {}}.
```

- [ ] **Step 11: 검수 반려분 제거 후 반영**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
node -e "
const fs=require('fs');
for (let n=1;n<=10;n++){
  const vp = '.category-intro-drafts/verdict-batch-'+n+'.json';
  const op = '.category-intro-drafts/output-batch-'+n+'.json';
  if (!fs.existsSync(vp) || !fs.existsSync(op)) continue;
  const v = JSON.parse(fs.readFileSync(vp,'utf8'));
  const out = JSON.parse(fs.readFileSync(op,'utf8'));
  const filtered = out.filter(e => !(v.reject||[]).includes(e.code));
  fs.writeFileSync(op, JSON.stringify(filtered,null,1),'utf8');
  console.log('batch',n,'반려 제거:', (v.reject||[]).length);
}
"
node scripts/apply-category-intro.js --dry
```
Expected: `승인 9x / 반려 0 / 누락 0`에 가까운 수(반려된 만큼 누락 발생 — 누락이 있으면 해당 code만 다시 Step 9~10을 1회 재실행).

- [ ] **Step 12: 실제 반영**

```bash
node scripts/apply-category-intro.js
export PATH="/c/Program Files/nodejs:$PATH" && node -e "
const {CATEGORY_INTRO, CATEGORY_ORDER} = require('./assets/category-data.js');
const missing = CATEGORY_ORDER.filter(c => !CATEGORY_INTRO[c]);
console.log('CATEGORY_INTRO 개수:', Object.keys(CATEGORY_INTRO).length, '/', CATEGORY_ORDER.length, '| 누락:', missing);
"
npm test 2>&1 | grep -aE "^. (pass|fail)"
```
Expected: `98 / 98 | 누락: []`, 테스트 전부 통과(기존 테스트가 `category-data.js` 파싱에 의존하지 않으므로 영향 없어야 함).

- [ ] **Step 13: 커밋**

```bash
git add assets/category-data.js
git commit -m "카테고리 허브: 98개 분야 소개 문단(CATEGORY_INTRO) 반영

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `generate-category-pages.js` 재작성 — 하위분류 섹션 + 소개 문단

**Files:**
- Modify: `scripts/generate-category-pages.js`
- Modify: `style.css`
- Create: `data/compare-pairs.json` (빈 배열로 시작 — Task 6이 채움)

**Interfaces:**
- Consumes: Task 1 `buildSubcategorySections`, Task 2 `CATEGORY_INTRO`, `data/compare-pairs.json`(없으면 빈 배열 취급)
- Produces: `category/{code}.html` 98개(하위분류 섹션 + 소개 문단 포함). Task 7·9가 결과물을 사용.

- [ ] **Step 1: `data/compare-pairs.json` 빈 매니페스트 생성**

```bash
mkdir -p data
```
파일 `data/compare-pairs.json` 내용:
```json
[]
```

- [ ] **Step 2: `renderCategoryPage` 함수를 하위분류 섹션 방식으로 교체**

`scripts/generate-category-pages.js`에서 다음을 바꾼다.

기존 import 줄:
```js
const {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CATEGORY_DESCRIPTIONS,
} = require("../assets/category-data.js");
```
다음으로 교체:
```js
const {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CATEGORY_DESCRIPTIONS,
  CATEGORY_INTRO,
  SUB_CATEGORY_ORDER,
} = require("../assets/category-data.js");
const { buildSubcategorySections } = require("./category-subgroups.js");

const COMPARE_PAIRS_PATH = path.join(ROOT_DIR, "data", "compare-pairs.json");
function readComparePairs() {
  if (!fs.existsSync(COMPARE_PAIRS_PATH)) return [];
  return JSON.parse(fs.readFileSync(COMPARE_PAIRS_PATH, "utf8"));
}
```

기존 `function renderCategoryPage(code, label, terms) { ... }` 전체를 다음으로 교체:
```js
function renderCategoryPage(code, label, terms, comparePairs) {
  const description = CATEGORY_DESCRIPTIONS[code] || `${label} 분야의 논문 학술용어를 모아봅니다.`;
  const intro = CATEGORY_INTRO[code];
  if (!intro) {
    throw new Error(`CATEGORY_INTRO에 "${code}"의 소개 문단이 없습니다. scripts/apply-category-intro.js를 먼저 실행하세요.`);
  }
  const title = `${label} 용어 전체 목록 (${terms.length}개) - ${SITE_TITLE}`;
  const canonical = `${BASE_URL}/category/${code}.html`;

  const sections = buildSubcategorySections(terms, SUB_CATEGORY_ORDER[code] || []);
  const pairsInCategory = comparePairs.filter((p) => p.category === code);

  const sectionsHtml = sections.map((section) => {
    const items = section.terms.map(termLinkHTML).join("\n");
    const related = pairsInCategory.filter((p) => p.subcategory === section.name);
    const compareLinksHtml = related.length
      ? `\n      <p class="compare-links">🔍 비교해서 보기: ${related
          .map((p) => `<a href="../compare/${p.pairSlug}.html">${escapeHtml(p.titleA)} vs ${escapeHtml(p.titleB)}</a>`)
          .join(" · ")}</p>`
      : "";
    return `    <h2>${escapeHtml(section.name)} <span class="section-count">(${section.terms.length}개)</span></h2>${compareLinksHtml}
    <ul class="term-list">
${items}
    </ul>`;
  }).join("\n\n");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="canonical" href="${canonical}">
<link rel="stylesheet" href="../style.css">
${renderThemeInit()}
<!-- AdSense:start -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7710727724213886" crossorigin="anonymous"></script>
<!-- AdSense:end -->
</head>
<body data-base="../">
${renderHeader("../", { navCta: true, authNav: true })}
<main class="delay-1">
  <p class="breadcrumb"><a href="../index.html">용어 목록</a> &gt; <a href="../category.html">카테고리별 용어</a> &gt; ${escapeHtml(label)}</p>
  <h1>${escapeHtml(label)} 용어 전체 목록</h1>
  <p class="subtitle">${escapeHtml(intro)}</p>
  <p>총 ${terms.length}개 용어 · <a href="../category.html">다른 분야 보기</a></p>

${sectionsHtml}
</main>
${renderFooter("../")}
<script src="../assets/vendor/fuse.min.js"></script>
<script src="../assets/header-search.js"></script>
<script type="module" src="../assets/nav-auth.js"></script>
<script src="../assets/mobile-nav.js"></script>
</body>
</html>
`;
}
```

`run()` 함수 안 호출부:
```js
    const html = renderCategoryPage(code, label, list);
```
를
```js
    const html = renderCategoryPage(code, label, list, comparePairs);
```
로 바꾸고, `run()` 시작부에 한 줄 추가:
```js
function run() {
  const terms = readTerms();
  const groups = groupByCategory(terms);
  const comparePairs = readComparePairs();
```

- [ ] **Step 3: CSS 추가**

`style.css` 끝에 추가:
```css
/* ---------- 카테고리 허브 페이지: 하위분류 섹션 ---------- */
.section-count { font-size: 0.85rem; font-weight: 400; color: var(--muted); }
.compare-links { margin: 4px 0 10px; font-size: 0.88rem; color: var(--muted); }
.compare-links a { color: var(--accent); }
```

- [ ] **Step 4: 생성 + 검증**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
node scripts/generate-category-pages.js
node -e "
const fs=require('fs');
const h=fs.readFileSync('category/stat.html','utf8');
const h2count=(h.match(/<h2>/g)||[]).length;
const liCount=(h.match(/<li>/g)||[]).length;
console.log('stat.html: h2(섹션) 개수', h2count, '| li(용어) 개수', liCount);
console.log('소개 문단 포함 여부:', /class=\"subtitle\"/.test(h) && !h.includes('평균, 분산, 유의확률처럼'));
"
npm test 2>&1 | grep -aE "^. (pass|fail)"
```
Expected: `h2(섹션) 개수`가 2 이상(하위분류 여러 개 + 기타), `소개 문단 포함 여부: true`(짧은 메타 설명이 아니라 긴 소개문이 subtitle 자리에 들어감), 테스트 전부 통과.

- [ ] **Step 5: 브라우저 확인**

`preview_start`로 로컬 프리뷰를 띄우고 `category/stat.html`(용어 많음), `category/philo.html`(적음), `category/medlab.html`(중간)을 열어: 하위분류별로 나뉘어 보이는지, "기타" 섹션이 맨 아래 있는지, 소개 문단이 짧은 메타 설명이 아니라 긴 문단인지, 다크모드에서도 정상인지 확인.

- [ ] **Step 6: 커밋**

```bash
git add scripts/generate-category-pages.js style.css data/compare-pairs.json category/
git commit -m "카테고리 허브: 하위분류 섹션 + 소개 문단으로 도어웨이 패턴 제거

385개 링크를 한 줄로 나열하던 category/{code}.html을 하위분류별 섹션(SUB_CATEGORY_ORDER
순서, 3개 미만은 기타로 접음)으로 나누고, 메타 설명 재활용이던 페이지 소개를
CATEGORY_INTRO의 3~5문장짜리 진짜 문단으로 교체.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `category.html` 총괄 소개 문단

**Files:**
- Modify: `category.html`

- [ ] **Step 1: 소개 문단 추가**

`category.html`에서:
```html
  <p class="subtitle" id="category-page-subtitle">분야를 선택해 관련 용어를 모아봅니다.</p>

  <input type="search" id="term-search" class="category-page-filter" placeholder="이 분야 안에서 용어 검색" aria-label="이 분야 안에서 용어 검색" autocomplete="off">
```
를
```html
  <p class="subtitle" id="category-page-subtitle">분야를 선택해 관련 용어를 모아봅니다.</p>
  <p>
    논문용어사전은 학술용어를 98개 분야로 나누고, 각 분야를 다시 하위 주제로
    묶어 정리합니다. 관심 있는 분야를 고르면 하위 주제별로 용어를 모아볼 수 있고,
    헷갈리기 쉬운 두 용어를 나란히 비교하는 페이지도 함께 안내합니다.
  </p>

  <input type="search" id="term-search" class="category-page-filter" placeholder="이 분야 안에서 용어 검색" aria-label="이 분야 안에서 용어 검색" autocomplete="off">
```
로 바꾼다.

- [ ] **Step 2: 확인**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
node -e "
const h=require('fs').readFileSync('category.html','utf8');
if(!h.includes('98개 분야로 나누고')) throw new Error('intro missing');
console.log('ok');"
```
Expected: `ok`.

- [ ] **Step 3: 커밋**

```bash
git add category.html
git commit -m "카테고리 총괄 페이지에 소개 문단 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: 비교 페이지 순수 함수 (TDD)

**Files:**
- Create: `scripts/compare-page-core.js`
- Create: `tests/compare-page-core.test.js`

**Interfaces:**
- Produces: `pairSlug(slugA, slugB): string`(입력 순서 무관, 항상 같은 결과), `renderComparisonTable(rows, escapeHtml): string`. Task 6이 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/compare-page-core.test.js
const assert = require("assert");
const { pairSlug, renderComparisonRow, renderComparisonTable } =
  require("../scripts/compare-page-core.js");
const { escapeHtml } = require("../assets/escape.js");

// 정상: 입력 순서와 무관하게 항상 같은 파일명(알파벳 순 고정)
{
  assert.strictEqual(pairSlug("t-test", "anova"), "anova-vs-t-test");
  assert.strictEqual(pairSlug("anova", "t-test"), "anova-vs-t-test");
}

// 경계: 같은 슬러그를 두 번 넣어도 죽지 않음(호출부 실수 방어)
{
  assert.strictEqual(pairSlug("a", "a"), "a-vs-a");
}

// 정상: 한 행 렌더링, 이스케이프 적용
{
  const row = { label: "비교 <기준>", a: "값A", b: "값B" };
  const html = renderComparisonRow(row, escapeHtml);
  assert.ok(html.includes("&lt;기준&gt;"));
  assert.ok(html.includes("<th scope=\"row\">"));
  assert.ok(html.includes("<td>값A</td>"));
}

// 정상: 여러 행 결합, 빈 배열은 빈 문자열
{
  const rows = [{ label: "l1", a: "a1", b: "b1" }, { label: "l2", a: "a2", b: "b2" }];
  const html = renderComparisonTable(rows, escapeHtml);
  assert.strictEqual((html.match(/<tr>/g) || []).length, 2);
  assert.strictEqual(renderComparisonTable([], escapeHtml), "");
}

console.log("compare-page-core: all tests passed");
```

- [ ] **Step 2: 실패 확인**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
node --test tests/compare-page-core.test.js 2>&1 | tail -5
```
Expected: 모듈 없음 오류.

- [ ] **Step 3: 구현**

```js
// scripts/compare-page-core.js
// 비교 페이지 조립에 쓰는 순수 로직. DOM·파일시스템 없음 —
// scripts/build-compare-page.js가 이 함수들의 출력을 조합해 최종 HTML을 만든다.

// 두 슬러그로 결정론적 파일명을 만든다. 입력 순서와 무관하게 항상 같은 파일명이
// 나와야 같은 짝을 두 번 다른 이름으로 만드는 사고가 안 생긴다.
function pairSlug(slugA, slugB) {
  const [a, b] = [slugA, slugB].sort((x, y) => x.localeCompare(y));
  return `${a}-vs-${b}`;
}

function renderComparisonRow(row, escapeHtml) {
  return `      <tr><th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(row.a)}</td><td>${escapeHtml(row.b)}</td></tr>`;
}

function renderComparisonTable(rows, escapeHtml) {
  return rows.map((r) => renderComparisonRow(r, escapeHtml)).join("\n");
}

module.exports = { pairSlug, renderComparisonRow, renderComparisonTable };
```

- [ ] **Step 4: 통과 확인**

```bash
node --test tests/compare-page-core.test.js 2>&1 | tail -5
```
Expected: 통과.

- [ ] **Step 5: 커밋**

```bash
git add scripts/compare-page-core.js tests/compare-page-core.test.js
git commit -m "비교 페이지: 짝 슬러그 정렬·비교표 렌더링 순수 함수 + 테스트

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: 비교 페이지 생성기 + 파일럿 2건 집필·검수·반영

**Files:**
- Create: `scripts/build-compare-page.js`
- Create: `scripts/apply-compare-pairs.js`
- Create: `tests/apply-compare-pairs.test.js`
- Modify: `style.css`

**Interfaces:**
- Consumes: Task 5 `compare-page-core.js`, `scripts/build-term-page.js`의 `renderProse`/`buildContext`(마커 링크 재사용), `assets/escape.js`
- Produces: `compare/{pairSlug}.html`, `data/compare-pairs.json`(채워짐). Task 3(재실행)·Task 7이 사용.

- [ ] **Step 1: 생성기 작성**

```js
// scripts/build-compare-page.js
// 콘텐츠 JSON → compare/<pairSlug>.html. category 페이지와 같은 공용 크롬
// (templates/site-chrome.js)을 쓴다 — terms/*.html 전용 크롬 추출 방식
// (build-term-page.js)과는 별개다.
const fs = require("fs");
const path = require("path");
const { renderHeader, renderFooter, renderThemeInit, SITE_TITLE } = require("./templates/site-chrome");
const { BASE_URL } = require("./site-config.js");
const { pairSlug, renderComparisonTable } = require("./compare-page-core.js");
const { renderProse, buildContext } = require("./build-term-page.js");
const { escapeHtml } = require("../assets/escape.js");

const ROOT_DIR = path.join(__dirname, "..");

function renderComparePage(content, ctx) {
  const slug = pairSlug(content.slugA, content.slugB);
  const [firstSlug, firstTitle, secondSlug, secondTitle] =
    content.slugA < content.slugB
      ? [content.slugA, content.titleA, content.slugB, content.titleB]
      : [content.slugB, content.titleB, content.slugA, content.titleA];

  const heading = `${escapeHtml(content.titleA)} vs ${escapeHtml(content.titleB)}`;
  const title = `${content.titleA} vs ${content.titleB}: 무엇이 다른가 - ${SITE_TITLE}`;
  const canonical = `${BASE_URL}/compare/${slug}.html`;

  const rows = content.rows.map((r) => ({ label: r.label, a: r.a, b: r.b }));

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(content.headline)}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="canonical" href="${canonical}">
<link rel="stylesheet" href="../style.css">
${renderThemeInit()}
<!-- AdSense:start -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7710727724213886" crossorigin="anonymous"></script>
<!-- AdSense:end -->
</head>
<body data-base="../">
${renderHeader("../", { navCta: true, authNav: true })}
<main class="delay-1">
  <p class="breadcrumb"><a href="../index.html">용어 목록</a> &gt; <a href="../category.html">카테고리별 용어</a> &gt; <a href="../category/${content.category}.html">${escapeHtml(content.categoryLabel)}</a> &gt; ${heading}</p>
  <h1>${heading}</h1>
  <p class="subtitle">${escapeHtml(content.headline)}</p>

  <table class="compare-table">
    <thead><tr><th scope="col"></th><th scope="col">${escapeHtml(content.titleA)}</th><th scope="col">${escapeHtml(content.titleB)}</th></tr></thead>
    <tbody>
${renderComparisonTable(rows, escapeHtml)}
    </tbody>
  </table>

  <h2>${escapeHtml(content.titleA)}는 언제 쓰나</h2>
  <p>${renderProse(content.whenA, ctx.validSlugs)}</p>

  <h2>${escapeHtml(content.titleB)}는 언제 쓰나</h2>
  <p>${renderProse(content.whenB, ctx.validSlugs)}</p>

  <h2>흔한 혼동 지점</h2>
  <p>${renderProse(content.confusion, ctx.validSlugs)}</p>

  <h2>더 알아보기</h2>
  <ul class="related-terms">
    <li><a href="../terms/${firstSlug}.html">${escapeHtml(firstTitle)} 자세히 보기 →</a></li>
    <li><a href="../terms/${secondSlug}.html">${escapeHtml(secondTitle)} 자세히 보기 →</a></li>
  </ul>
</main>
${renderFooter("../")}
<script src="../assets/vendor/fuse.min.js"></script>
<script src="../assets/header-search.js"></script>
<script type="module" src="../assets/nav-auth.js"></script>
<script src="../assets/mobile-nav.js"></script>
</body>
</html>
`;
}

module.exports = { renderComparePage };

if (require.main === module) {
  const [contentPath] = process.argv.slice(2);
  if (!contentPath) {
    console.error("usage: node scripts/build-compare-page.js <content.json>");
    process.exit(1);
  }
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "terms.json"), "utf8"));
  const ctx = buildContext(terms, [content.slugA, content.slugB]);
  const html = renderComparePage(content, ctx);
  const outDir = path.join(ROOT_DIR, "compare");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${require("./compare-page-core.js").pairSlug(content.slugA, content.slugB)}.html`);
  fs.writeFileSync(outPath, html, "utf8");
  console.log("wrote", outPath);
}
```

- [ ] **Step 2: 반영 스크립트(검증 함수 TDD) — 실패하는 테스트**

```js
// tests/apply-compare-pairs.test.js
// 비교 콘텐츠 초안을 그대로 믿지 않고 검증한다: 슬러그 실존, 같은 하위분류,
// 행 개수·필드 완비, 제목 일치.
const assert = require("assert");
const { validateComparePair } = require("../scripts/apply-compare-pairs.js");

const terms = [
  { slug: "t-test", title_ko: "t검정", title_en: "t-test", categories: ["stat"], subcategory: "추론통계·가설검정" },
  { slug: "anova", title_ko: "분산분석(ANOVA)", title_en: "ANOVA", categories: ["stat"], subcategory: "추론통계·가설검정" },
  { slug: "regression", title_ko: "회귀분석", title_en: "Regression", categories: ["stat"], subcategory: "회귀·상관분석" },
];

const good = {
  slugA: "t-test", slugB: "anova", titleA: "t검정", titleB: "분산분석(ANOVA)",
  headline: "핵심 차이 한 줄", whenA: "설명", whenB: "설명", confusion: "설명",
  rows: [
    { label: "비교 집단 수", a: "2개", b: "3개 이상" },
    { label: "검정 통계량", a: "t", b: "F" },
    { label: "귀무가설", a: "두 평균이 같다", b: "모든 평균이 같다" },
    { label: "사용 예시", a: "실험군·대조군 비교", b: "세 그룹 이상 비교" },
  ],
};

// 정상
{
  const r = validateComparePair(good, terms);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
}

// 실패: 존재하지 않는 슬러그
{
  const r = validateComparePair({ ...good, slugB: "no-such-term" }, terms);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /존재하지 않는/);
}

// 실패: 하위분류가 다름
{
  const r = validateComparePair({ ...good, slugB: "regression" }, terms);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /하위분류/);
}

// 실패: 제목 불일치(오타 방지)
{
  const r = validateComparePair({ ...good, titleA: "T검증" }, terms);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /제목/);
}

// 실패: 행 개수가 4개가 아님
{
  const r = validateComparePair({ ...good, rows: good.rows.slice(0, 2) }, terms);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /행/);
}

// 실패: 빈 필드
{
  const r = validateComparePair({ ...good, headline: "" }, terms);
  assert.strictEqual(r.ok, false);
}

console.log("apply-compare-pairs: all tests passed");
```

- [ ] **Step 3: 실패 확인**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
node --test tests/apply-compare-pairs.test.js 2>&1 | tail -5
```
Expected: 모듈 없음 오류.

- [ ] **Step 4: 구현**

```js
// scripts/apply-compare-pairs.js
// .compare-drafts/*.json (콘텐츠 초안)을 검증 후 compare/*.html 생성 +
// data/compare-pairs.json 갱신.
//
// usage: node scripts/apply-compare-pairs.js <dir> [--dry]
const fs = require("fs");
const path = require("path");
const { pairSlug } = require("./compare-page-core.js");
const { renderComparePage } = require("./build-compare-page.js");
const { buildContext } = require("./build-term-page.js");
const { CATEGORY_LABELS } = require("../assets/category-data.js");

const ROOT_DIR = path.join(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT_DIR, "data", "compare-pairs.json");

function validateComparePair(content, terms) {
  const bySlug = new Map(terms.map((t) => [t.slug, t]));
  const a = bySlug.get(content.slugA);
  const b = bySlug.get(content.slugB);
  if (!a || !b) return { ok: false, reason: `존재하지 않는 슬러그: ${!a ? content.slugA : content.slugB}` };
  if (a.subcategory !== b.subcategory) {
    return { ok: false, reason: `하위분류가 다름 (${a.subcategory} vs ${b.subcategory})` };
  }
  if (a.title_ko !== content.titleA || b.title_ko !== content.titleB) {
    return { ok: false, reason: "제목이 terms.json과 다름(오타 의심)" };
  }
  if (!Array.isArray(content.rows) || content.rows.length !== 4) {
    return { ok: false, reason: `행 개수 ${content.rows ? content.rows.length : 0} (정확히 4개여야 함)` };
  }
  for (const r of content.rows) {
    if (!r.label || !r.a || !r.b) return { ok: false, reason: "행에 빈 필드가 있음" };
  }
  for (const field of ["headline", "whenA", "whenB", "confusion"]) {
    if (!content[field] || !String(content[field]).trim()) {
      return { ok: false, reason: `${field} 필드가 비어 있음` };
    }
  }
  return { ok: true, category: a.categories[0] };
}

function main() {
  const dir = process.argv[2];
  const dry = process.argv.includes("--dry");
  if (!dir) {
    console.error("usage: node scripts/apply-compare-pairs.js <dir> [--dry]");
    process.exit(1);
  }

  const terms = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "terms.json"), "utf8"));
  const manifest = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) : [];
  const existingSlugs = new Set(manifest.map((p) => p.pairSlug));

  const files = fs.readdirSync(dir).filter((f) => /\.json$/i.test(f));
  const accepted = [];
  for (const f of files) {
    const content = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const r = validateComparePair(content, terms);
    if (!r.ok) { console.log(`[반려] ${f}: ${r.reason}`); continue; }
    const slug = pairSlug(content.slugA, content.slugB);
    if (existingSlugs.has(slug)) { console.log(`[반려] ${f}: 이미 존재하는 짝(${slug})`); continue; }
    accepted.push({ ...content, category: r.category, pairSlug: slug });
  }

  console.log(`수집 ${files.length}건 → 승인 ${accepted.length}`);
  if (dry || !accepted.length) { console.log(dry ? "(dry run — 파일 미변경)" : "반영할 항목 없음."); return; }

  const outDir = path.join(ROOT_DIR, "compare");
  fs.mkdirSync(outDir, { recursive: true });

  const newManifestEntries = [];
  for (const content of accepted) {
    const ctx = buildContext(terms, [content.slugA, content.slugB]);
    const categoryLabel = CATEGORY_LABELS[content.category] || content.category;
    const html = renderComparePage({ ...content, categoryLabel }, ctx);
    fs.writeFileSync(path.join(outDir, `${content.pairSlug}.html`), html, "utf8");

    const [firstSlug, firstTitle, secondSlug, secondTitle] =
      content.slugA < content.slugB
        ? [content.slugA, content.titleA, content.slugB, content.titleB]
        : [content.slugB, content.titleB, content.slugA, content.titleA];
    newManifestEntries.push({
      slugA: firstSlug, slugB: secondSlug, titleA: firstTitle, titleB: secondTitle,
      pairSlug: content.pairSlug, category: content.category,
      subcategory: terms.find((t) => t.slug === content.slugA).subcategory,
    });
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify([...manifest, ...newManifestEntries], null, 2) + "\n", "utf8");
  console.log(`compare/*.html ${accepted.length}개 생성, data/compare-pairs.json 갱신`);
}

if (require.main === module) main();
module.exports = { validateComparePair };
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
node --test tests/apply-compare-pairs.test.js 2>&1 | tail -5
```
Expected: 통과.

- [ ] **Step 6: CSS 추가**

`style.css` 끝(Task 3에서 추가한 블록 뒤)에:
```css
/* ---------- 비교 페이지 ---------- */
.compare-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
.compare-table th, .compare-table td { border: 1px solid var(--border); padding: 10px 12px; text-align: left; font-size: 0.94rem; }
.compare-table thead th { background: var(--card-bg); font-weight: 700; }
.compare-table tbody th { white-space: nowrap; color: var(--muted); font-weight: 500; }
```

- [ ] **Step 7: 커밋(스크립트만)**

```bash
git add scripts/build-compare-page.js scripts/apply-compare-pairs.js tests/apply-compare-pairs.test.js style.css
git commit -m "비교 페이지: 생성기·검증·반영 스크립트

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: 파일럿 콘텐츠 집필 에이전트 디스패치 (2건, 각각 독립 병렬)**

`mkdir -p .compare-drafts` 실행 후, Agent 도구로 아래 두 프롬프트를 동시에 호출한다.

프롬프트 A(t검정 vs 분산분석):
```
너는 한국어 학술 용어사전 "논문용어사전"의 비교 콘텐츠 집필자다.

"t검정"(slug: t-test)과 "분산분석(ANOVA)"(slug: anova)을 비교하는 콘텐츠를 써라.
먼저 두 용어의 기존 정의를 확인하라:
  cd "C:\Users\hssh9\용돈벌이" && node -e "const t=require('./terms.json'); for(const s of ['t-test','anova']) console.log(JSON.stringify(t.find(x=>x.slug===s)))"

아래 JSON 스키마로 정확히 채워 Write 도구로 저장하라:
C:\Users\hssh9\용돈벌이\.compare-drafts\t-test-vs-anova.json

{
  "slugA": "t-test", "titleA": "(terms.json의 title_ko 그대로)",
  "slugB": "anova", "titleB": "(terms.json의 title_ko 그대로)",
  "headline": "한 문장으로 핵심 차이(60자 이내)",
  "rows": [
    {"label": "비교하는 집단 수", "a": "...", "b": "..."},
    {"label": "검정 통계량", "a": "...", "b": "..."},
    {"label": "귀무가설", "a": "...", "b": "..."},
    {"label": "대표 사용 예시", "a": "...", "b": "..."}
  ],
  "whenA": "t검정을 쓰는 상황 2~3문장",
  "whenB": "분산분석을 쓰는 상황 2~3문장",
  "confusion": "두 검정을 혼동하는 흔한 사례와 그 이유 2~3문장. [[slug|표시문구]] 형식으로
    관련 용어를 링크할 수 있다(예: [[type-1-error|1종 오류]]) — 실존하는 슬러그만 써라."
}

rows는 정확히 4개, 각 필드는 빈 값 없이 채워라. titleA/titleB는 terms.json의
title_ko와 토씨 하나까지 같아야 한다(검증 스크립트가 문자열 비교한다).
```

프롬프트 B(1종 오류 vs 2종 오류) — 여유 있으면 함께 진행:
```
너는 한국어 학술 용어사전 "논문용어사전"의 비교 콘텐츠 집필자다.

"1종 오류"(slug: type-1-error)와 "2종 오류"(slug: type-2-error)를 비교하는
콘텐츠를 써라. 먼저 기존 정의 확인:
  cd "C:\Users\hssh9\용돈벌이" && node -e "const t=require('./terms.json'); for(const s of ['type-1-error','type-2-error']) console.log(JSON.stringify(t.find(x=>x.slug===s)))"

C:\Users\hssh9\용돈벌이\.compare-drafts\type-1-error-vs-type-2-error.json 에
(위와 같은 스키마로, slugA="type-1-error", slugB="type-2-error") 저장하라.
rows 예시 방향: "실제 상황", "판단 오류의 내용", "관습적 허용 수준(유의수준과의 관계)",
"통계적 검정력과의 관계" 같은 항목으로 4개를 채워라.
```

- [ ] **Step 9: 검수 에이전트 디스패치**

각 초안 파일이 준비되면, 프롬프트(파일명만 바꿔 2번 호출):
```
너는 한국어 학술 용어사전 "논문용어사전"의 비교 콘텐츠 검수자다.

대상: C:\Users\hssh9\용돈벌이\.compare-drafts\{FILE}.json

확인할 것:
1. rows의 각 행이 정말 두 용어를 대조하는 내용인가(같은 말 두 번 반복 아닌지).
2. headline이 실제 핵심 차이를 짚는가.
3. whenA/whenB/confusion의 통계적 사실이 정확한가(교과서적 정의와 어긋나지 않는지).
4. confusion의 [[slug|텍스트]] 링크가 실존하는 슬러그를 가리키는가:
   cd "C:\Users\hssh9\용돈벌이" && node -e "const t=require('./terms.json'); console.log(t.some(x=>x.slug==='그-슬러그'))"

문제가 있으면 파일을 직접 고치지 말고, 같은 폴더에
verdict-{FILE}.json 으로 {"ok": false, "issues": ["구체적 문제 설명"]} 저장.
문제 없으면 {"ok": true, "issues": []}.
```

검수에서 `ok:false`가 나오면 그 지적사항을 반영해 Step 8의 해당 프롬프트를 1회 더 실행(수정 지시 포함)한 뒤 재검수한다.

- [ ] **Step 10: 반영**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
node scripts/apply-compare-pairs.js .compare-drafts --dry
node scripts/apply-compare-pairs.js .compare-drafts
ls compare/
cat data/compare-pairs.json
```
Expected: `compare/anova-vs-t-test.html`, `compare/type-1-error-vs-type-2-error.html`(작성했다면) 생성, 매니페스트에 두 항목.

- [ ] **Step 11: 카테고리 허브 재생성(비교 링크 반영)**

```bash
node scripts/generate-category-pages.js
grep -c "compare-links" category/stat.html
```
Expected: 1 이상(비교 링크가 stat.html의 "추론통계·가설검정" 섹션에 붙음).

- [ ] **Step 12: 브라우저 확인**

`compare/anova-vs-t-test.html`을 열어: 표가 제대로 렌더링되는지, `[[slug|...]]` 마커가 실제 링크로 바뀌었는지, `terms/t-test.html`·`terms/anova.html`로 가는 링크가 동작하는지, `category/stat.html`에서 비교 링크를 타고 들어올 수 있는지, 다크모드 확인.

- [ ] **Step 13: 커밋**

```bash
git add compare/ data/compare-pairs.json category/stat.html
git commit -m "비교 페이지 파일럿: t검정 vs 분산분석(+1종 vs 2종 오류)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: sitemap에 비교 페이지 반영

**Files:**
- Modify: `scripts/generate-sitemap.js`

**Interfaces:**
- Consumes: `data/compare-pairs.json`
- Produces: `sitemap.xml`에 `compare/*.html` URL 포함

- [ ] **Step 1: `readComparePages` 추가**

`scripts/generate-sitemap.js`에서 `function readCategoryPages() { ... }` 함수 뒤에 추가:
```js
// 비교 페이지(scripts/apply-compare-pairs.js 생성물). 매니페스트에 있는데
// 실제 파일이 없으면 sitemap에 깨진 URL이 들어가므로 파일 존재를 다시 확인한다.
function readComparePairs() {
  const manifestPath = path.join(ROOT_DIR, "data", "compare-pairs.json");
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return manifest
    .filter((p) => fs.existsSync(path.join(ROOT_DIR, "compare", `${p.pairSlug}.html`)))
    .map((p) => ({
      loc: `${BASE_URL}/compare/${p.pairSlug}.html`,
      filePath: path.posix.join("compare", `${p.pairSlug}.html`)
    }));
}
```

`generateSitemap()` 함수 안:
```js
  const categoryPages = readCategoryPages();
```
다음 줄에 추가:
```js
  const comparePages = readComparePairs();
```

`pages` 배열:
```js
  const pages = [
    ...TOP_LEVEL_PAGES,
    ...categoryPages,
    ...terms.map((term) => ({
```
를
```js
  const pages = [
    ...TOP_LEVEL_PAGES,
    ...categoryPages,
    ...comparePages,
    ...terms.map((term) => ({
```
로 바꾸고, `expectedUrlCount` 계산:
```js
  const expectedUrlCount = terms.length + TOP_LEVEL_PAGES.length + categoryPages.length;
```
를
```js
  const expectedUrlCount = terms.length + TOP_LEVEL_PAGES.length + categoryPages.length + comparePages.length;
```
로, 로그 출력에도 한 줄 추가:
```js
  console.log(`Category pages: ${categoryPages.length}`);
```
다음에
```js
  console.log(`Compare pages: ${comparePages.length}`);
```

- [ ] **Step 2: 실행·확인**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
node scripts/generate-sitemap.js
grep -c "compare/" sitemap.xml
```
Expected: `Compare pages: 2`(또는 파일럿으로 만든 개수), `sitemap.xml`에 `compare/` URL 존재.

- [ ] **Step 3: 커밋**

```bash
git add scripts/generate-sitemap.js sitemap.xml
git commit -m "sitemap: 비교 페이지 포함

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: `about.html` 신뢰 신호

**Files:**
- Modify: `about.html`

- [ ] **Step 1: 운영 주체 절 추가**

`about.html`에서:
```html
  <h2>콘텐츠 구성</h2>
```
바로 앞에 추가:
```html
  <h2>운영 주체</h2>
  <p>
    논문용어사전은 지니어스 클럽이 운영합니다. 지니어스 클럽은 비영리
    사단법인 설립을 준비하고 있는 단체로, 학술 정보를 누구나 쉽게 접할 수
    있도록 만드는 것을 목표로 이 사전을 만들고 있습니다.
  </p>

  <h2>콘텐츠 구성</h2>
```

- [ ] **Step 2: 검수 방식 문단 추가**

`about.html`에서:
```html
  <p>
    설명 작성 과정에서는 정확한 정보 전달을 우선하며,
    신뢰할 수 있는 학술 자료와 연구 문헌을 참고하여 내용을 구성합니다.
  </p>
```
바로 뒤에 추가:
```html

  <p>
    각 용어 페이지는 AI가 학술 자료를 참고해 초안을 작성한 뒤, 별도의 AI
    검수 단계를 거쳐 정의의 정확성과 다른 용어와의 중복 여부를 다시
    확인하는 과정을 거쳐 게시됩니다.
  </p>
```

- [ ] **Step 3: 확인**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
node -e "
const h=require('fs').readFileSync('about.html','utf8');
for (const s of ['지니어스 클럽','사단법인 설립을 준비','AI가 학술 자료를 참고해 초안']) {
  if (!h.includes(s)) throw new Error('missing: '+s);
}
console.log('ok');"
```
Expected: `ok`.

- [ ] **Step 4: 브라우저 확인**

`about.html`을 열어 새 절이 자연스럽게 읽히는지, 다크모드에서 정상인지 확인.

- [ ] **Step 5: 커밋**

```bash
git add about.html
git commit -m "소개 페이지: 운영 주체(지니어스 클럽)·검수 방식 명시

애드센스 반려 사유(가치가 낮은 콘텐츠) 대응의 일부. 등록 완료가 아닌 '비영리
사단법인 설립 준비 중' 상태를 사실 그대로 표기.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: 전체 검증 및 마무리

**Files:** 없음(검증만)

- [ ] **Step 1: 전체 재생성 순서대로 실행**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
node scripts/generate-category-pages.js
node scripts/generate-sitemap.js
npm test 2>&1 | tail -6
```
Expected: 카테고리 98개 생성 로그, sitemap URL 개수 일치, 테스트 전부 통과.

- [ ] **Step 2: 정적 검증**

```bash
node -e "
const fs=require('fs');
const {CATEGORY_ORDER} = require('./assets/category-data.js');
let thin=0;
for (const code of CATEGORY_ORDER) {
  const p = 'category/'+code+'.html';
  if (!fs.existsSync(p)) continue;
  const h = fs.readFileSync(p,'utf8');
  const h2 = (h.match(/<h2>/g)||[]).length;
  if (h2 < 1) { thin++; console.log('의심:', code); }
}
console.log('h2(섹션) 없는 페이지:', thin, '/', CATEGORY_ORDER.length);
"
```
Expected: `0 / 98`.

- [ ] **Step 3: 브라우저 최종 확인**

로컬 프리뷰에서: `category.html`(총괄 소개 노출), `category/stat.html`·`category/philo.html`(용어 적은 곳)·`category/medlab.html`, `compare/anova-vs-t-test.html`, `about.html` — 전부 콘솔 오류 0, 다크모드 정상.

- [ ] **Step 4: 설계 문서 상태 갱신**

`docs/superpowers/specs/2026-09-09-adsense-content-quality-design.md` 3행 `상태: 사용자 검토 대기` → `상태: 구현 완료 (2026-MM-DD)`.

```bash
git add docs/superpowers/specs/2026-09-09-adsense-content-quality-design.md
git commit -m "애드센스 대응 설계 문서: 구현 완료 표시

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 푸시는 사용자 확인 후**

이 계획은 로컬 커밋까지만 수행한다. `git push`는 사용자가 애드센스 재검토 요청 타이밍에 맞춰 직접 지시할 때 실행한다.

---

## 자체 점검 결과

- **스펙 대조**: A(하위분류 섹션화 Task 1·3, 소개 문단 Task 2, category.html 총괄 소개 Task 4) / B(비교 페이지 Task 5·6, sitemap Task 7) / 3(about.html Task 8) — 설계 문서의 모든 섹션에 대응 태스크 있음. "범위 밖"(용어 심화, terms.json/SUB_CATEGORY_ORDER 수정, B 확장, 광고 배치)은 Global Constraints와 각 태스크에서 명시적으로 건드리지 않음.
- **플레이스홀더 스캔**: 검수 방식 문단은 사용자 확인(AI 초안+AI 검수)을 받아 Task 8에 확정 문구로 반영 — 지어낸 내용 없음. 나머지 코드 블록은 전부 완성된 실행 가능 코드.
- **타입 일관성**: `pairSlug(a,b)`, `renderComparisonTable(rows, escapeHtml)`가 Task 5(정의)·Task 6(소비)·테스트에서 동일 시그니처. `data/compare-pairs.json` 스키마(`slugA,slugB,titleA,titleB,pairSlug,category,subcategory`)가 Task 6(생성)·Task 3(소비)·Task 7(소비)에서 동일. `CATEGORY_INTRO` 키가 `CATEGORY_ORDER`의 코드와 일치하도록 Task 2 Step 12에서 검증.
- **동시성 위험 인지**: `assets/category-data.js`를 두 태스크(Task 2가 `CATEGORY_INTRO` 추가, 이후 태스크는 읽기만)에서 건드리므로, Task 2를 완전히 끝내고 커밋한 뒤 Task 3을 시작한다(계획 순서가 이미 그렇게 돼 있음). `SUB_CATEGORY_ORDER`·`terms.json`·`terms/*.html`은 어떤 태스크에서도 쓰지 않는다(다른 세션과의 충돌 방지, Global Constraints에 명시).
