# 개념 도식 v2 — 렌더러 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도식 렌더러를 type별 모듈로 나누고 새 type 5개(cycle·matrix·venn·timeline·plot)를 추가한다. 기존 1,813개 렌더 결과는 바이트 단위로 유지한다.

**Architecture:** `scripts/diagrams/lib.js`(603줄)를 `core.js`(글자 폭·줄바꿈·Canvas·노드 그리기·겹침 검사) + `types/<type>.js`(검증·배치·설명문·두 벌 여부) + `lib.js`(공개 API, 분배기)로 나눈다. plot은 좌표를 받지 않고 `plot-fns.js`의 함수 10개로 점을 계산한다. 회귀는 스펙 해시→렌더 해시 스냅샷으로 막는다.

**Tech Stack:** Node.js 내장 모듈만(`fs`, `path`, `crypto`, `assert`). 테스트는 `node --test tests/*.test.js`(파일마다 plain assert 스크립트). 미리보기 PNG는 시스템 Chrome 헤드리스.

**작업 위치:** 워크트리 `C:\Users\hssh9\term-diagram-v2`, 브랜치 `feat/diagram-v2`. 모든 명령은 이 폴더에서 실행한다.

**설계 문서:** `docs/superpowers/specs/2026-10-03-concept-diagram-v2-design.md` 1절.

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `scripts/diagrams/core.js` (신규) | 상수, `textWidth`/`wrap`/`esc`/`r1`, `Canvas`(+`warns`), `measureNode`/`drawNode`/`edgeColor`/`drawEdge`/`drawNotes`, `checkOverlaps`, `validateNodes` |
| `scripts/diagrams/types/linear.js` (신규) | chain·procedure: `layoutLinear`, 진행 순서 desc |
| `scripts/diagrams/types/contrast.js` (신규) | contrast |
| `scripts/diagrams/types/hierarchy.js` (신규) | hierarchy 가로·아웃라인 |
| `scripts/diagrams/types/cycle.js` (신규) | 원형 순환 |
| `scripts/diagrams/types/matrix.js` (신규) | 2×2 |
| `scripts/diagrams/types/venn.js` (신규) | 집합 2~3개 |
| `scripts/diagrams/types/timeline.js` (신규) | 연표 가로·세로 |
| `scripts/diagrams/plot-fns.js` (신규) | 함수 10개, Φ·Φ⁻¹·lgamma, 매개변수 검사, 표본 추출 |
| `scripts/diagrams/types/plot.js` (신규) | 축·곡선·음영·수직선·범례 |
| `scripts/diagrams/types/index.js` (신규) | type 이름 → 모듈 |
| `scripts/diagrams/lib.js` (수정) | `validateSpec`·`describe`·`renderSpec`·`renderFigure` 분배기 + 재수출 |
| `scripts/diagrams/golden.js` (신규) | 회귀 스냅샷 생성 |
| `scripts/diagrams/preview.js` (수정) | `--dir <폴더>` 옵션 |
| `tests/fixtures/diagrams-golden.json` (신규) | `{slug: [specHash, htmlHash]}` |
| `tests/diagrams-golden.test.js` (신규) | 회귀 |
| `tests/diagrams-plot-fns.test.js`, `tests/diagrams-<type>.test.js` (신규) | 단위 |
| `diagrams/examples/*.json` (신규) | 새 type 예시 5개(미리보기용, 사이트 비삽입) |
| `diagrams/README.md` (수정) | type 9개, 역할 기준 색 표 |

모듈 계약(모든 `types/*.js`):

```js
module.exports = {
  validate(spec) { return [/* 오류 문자열 */]; },
  layout(cv, spec, orientation) { return { w, h }; },   // orientation: "h" | "v"
  describe(spec, title) { return "한 문장"; },
  dual(spec, hWidth) { return false; },                 // 세로판도 넣을지
  caption: undefined,                                    // 있으면 <figcaption>
};
```

---

### Task 1: 회귀 스냅샷

**Files:**
- Create: `scripts/diagrams/golden.js`
- Create: `tests/diagrams-golden.test.js`
- Create: `tests/fixtures/diagrams-golden.json` (스크립트가 생성)

- [ ] **Step 1: 스냅샷 생성 스크립트 작성**

`scripts/diagrams/golden.js`:

```js
// 렌더러 회귀 스냅샷: 스펙 내용 해시 → 렌더 결과 해시.
//   node scripts/diagrams/golden.js --write   tests/fixtures/diagrams-golden.json 갱신
// 테스트는 스펙 해시가 기록과 같은 항목만 비교한다(스펙을 고치면 그 항목은 건너뜀).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { renderFigure } = require("./lib.js");

const ROOT = path.join(__dirname, "..", "..");
const SPEC_DIR = path.join(ROOT, "diagrams", "specs");
const OUT = path.join(ROOT, "tests", "fixtures", "diagrams-golden.json");
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);

function snapshot() {
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const titles = new Map(terms.map((t) => [t.slug, t.title_ko]));
  const out = {};
  for (const f of fs.readdirSync(SPEC_DIR).filter((x) => x.endsWith(".json")).sort()) {
    const raw = fs.readFileSync(path.join(SPEC_DIR, f), "utf8");
    const spec = JSON.parse(raw);
    out[spec.slug] = [sha(raw), sha(renderFigure(spec, titles.get(spec.slug)).html)];
  }
  return out;
}

if (require.main === module && process.argv.includes("--write")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const snap = snapshot();
  fs.writeFileSync(OUT, JSON.stringify(snap, null, 0).replace(/\],/g, "],\n") + "\n", "utf8");
  console.log(`스냅샷 ${Object.keys(snap).length}개 → ${path.relative(ROOT, OUT)}`);
}

module.exports = { snapshot, sha, OUT, SPEC_DIR };
```

- [ ] **Step 2: 현재 렌더러로 스냅샷 기록**

Run: `node scripts/diagrams/golden.js --write`
Expected: `스냅샷 1815개 → tests\fixtures\diagrams-golden.json`

- [ ] **Step 3: 회귀 테스트 작성**

`tests/diagrams-golden.test.js`:

```js
// 렌더러 리팩터링·확장 후에도 기존 스펙의 렌더 결과가 바이트 단위로 같아야 한다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { snapshot, OUT } = require("../scripts/diagrams/golden.js");

const golden = JSON.parse(fs.readFileSync(OUT, "utf8"));
const now = snapshot();
let compared = 0;
const changed = [];
for (const [slug, [specHash, htmlHash]] of Object.entries(golden)) {
  if (!now[slug] || now[slug][0] !== specHash) continue; // 스펙이 바뀌었거나 지워짐
  compared++;
  if (now[slug][1] !== htmlHash) changed.push(slug);
}
assert.ok(compared > 1000, `비교 대상이 너무 적음: ${compared}`);
assert.deepStrictEqual(changed, [], `렌더 결과가 바뀐 스펙 ${changed.length}개: ${changed.slice(0, 10).join(", ")}`);
console.log(`diagrams-golden: ${compared}개 동일`);
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/diagrams-golden.test.js`
Expected: `pass 1`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add scripts/diagrams/golden.js tests/diagrams-golden.test.js tests/fixtures/diagrams-golden.json
git commit -m "개념 도식: 렌더러 회귀 스냅샷(스펙 해시→렌더 해시)"
```

---

### Task 2: lib.js를 core + type 모듈로 분리 (출력 불변)

**Files:**
- Create: `scripts/diagrams/core.js`
- Create: `scripts/diagrams/types/linear.js`, `types/contrast.js`, `types/hierarchy.js`, `types/index.js`
- Modify: `scripts/diagrams/lib.js` (전체 교체)

코드는 현재 `lib.js`에서 **글자 하나 바꾸지 않고** 옮긴다(아래 블록이 그 결과). 바뀌는 것은 `Canvas`에 `warns` 배열 추가, `checkOverlaps`가 그것을 덧붙이는 것, `validateNodes` 함수로 묶은 것뿐이다.

- [ ] **Step 1: `scripts/diagrams/core.js` 작성**

```js
// 개념 도식 공통부: 글자 폭 근사·줄바꿈, SVG 조립기, 노드·엣지·주석 그리기, 겹침 검사.
// type별 배치는 types/*.js가 맡는다. 스타일 기준은 tools/figlib.py.
"use strict";

const COLORS = ["blue", "green", "amber", "rose", "violet", "gray"];
const EDGE_KINDS = ["arrow", "inhibit", "blocked"];
const TONES = ["pos", "limit", "general"];

const FS = 13; // 박스 라벨
const FS_SUB = FS - 1.5; // figlib: sub는 1.5px 작게
const FS_EDGE = 11.5;
const FS_NOTE = 11.5;
const LINE = FS + 2.5; // figlib: step = fs + 2.5
const PAD_X = 12;
const PAD_Y = 10;
const BOX_MIN_W = 88;
const BOX_TEXT_MAX = 132; // 이 폭을 넘는 라벨은 줄바꿈
const MARGIN = 14;
const SAFETY = 1.08;
// 가로 배치가 이 폭을 넘으면 본문 컬럼(최대 688px)에서 축소돼 글자가 10px 아래로
// 떨어진다. 되돌이 엣지(arc)가 없는 선형 도식은 이 폭 안에서 여러 줄로 감아 놓는다.
const H_WRAP_W = 640;

// ── 글자 폭 근사 ─────────────────────────────────────────
function charEm(ch) {
  const c = ch.codePointAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return 1.0; // 한글 음절
  if (c >= 0x3130 && c <= 0x318f) return 1.0; // 한글 자모
  if (c >= 0x4e00 && c <= 0x9fff) return 1.0; // 한자
  if (ch === " ") return 0.3;
  if (/[A-Z]/.test(ch)) return 0.64;
  if (/[a-z0-9]/.test(ch)) return 0.55;
  if (/[.,:;'`!|il]/.test(ch)) return 0.3;
  if (/[()[\]{}\-–/]/.test(ch)) return 0.38;
  if (/[→←↑↓⊃·×✕]/.test(ch)) return 0.9;
  if (c >= 0x2070 && c <= 0x209f) return 0.42; // 위·아래 첨자(Ca²⁺ 등)
  if (ch === "²" || ch === "³" || ch === "¹") return 0.42;
  return 0.8;
}

function textWidth(str, fs, bold = false) {
  let em = 0;
  for (const ch of String(str)) em += charEm(ch);
  return em * fs * (bold ? 1.05 : 1) * SAFETY;
}

// 공백 단위로 욕심껏 채우고, 한 단어가 max보다 길면 글자 단위로 자른다.
function wrap(str, maxW, fs, bold = false) {
  const words = String(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  const push = (w) => {
    if (textWidth(w, fs, bold) <= maxW) return lines.push(w);
    let piece = "";
    for (const ch of w) {
      if (piece && textWidth(piece + ch, fs, bold) > maxW) {
        lines.push(piece);
        piece = ch;
      } else piece += ch;
    }
    if (piece) lines.push(piece);
  };
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textWidth(next, fs, bold) <= maxW) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = "";
      if (textWidth(w, fs, bold) <= maxW) cur = w;
      else push(w);
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const r1 = (n) => Math.round(n * 10) / 10;

// ── 노드·엣지 검증(노드 기반 type 공용) ───────────────────
function validateNodes(spec) {
  const errs = [];
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  if (!nodes.length) errs.push("nodes가 비어 있음");
  const ids = new Set();
  for (const n of nodes) {
    if (!n.id) errs.push("id 없는 노드");
    else if (ids.has(n.id)) errs.push(`중복 노드 id: ${n.id}`);
    ids.add(n.id);
    if (!n.label) errs.push(`label 없는 노드: ${n.id}`);
    if (n.color && !COLORS.includes(n.color)) errs.push(`알 수 없는 color: ${n.color} (${n.id})`);
  }
  const edges = Array.isArray(spec.edges) ? spec.edges : [];
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) errs.push(`엣지 끝점이 노드에 없음: ${e.from}→${e.to}`);
    if (e.kind && !EDGE_KINDS.includes(e.kind)) errs.push(`알 수 없는 edge kind: ${e.kind}`);
  }
  return errs;
}

// ── 도식 조립기 ───────────────────────────────────────────
// 요소를 문자열로 쌓으면서 겹침 검사용 사각형(texts, boxes)을 따로 기록한다.
// warns: type 모듈이 직접 찾은 문제(예: 곡선이 라벨을 가림). checkOverlaps가 덧붙인다.
class Canvas {
  constructor(prefix) {
    this.prefix = prefix;
    this.parts = [];
    this.texts = []; // {x,y,w,h,label,owner}
    this.boxes = []; // {x,y,w,h,id}
    this.markers = new Map();
    this.warns = [];
  }
  marker(kind, color) {
    // color는 "var(--dg-navy)" 같은 값이라 괄호가 들어간다. 괄호가 id에 남으면
    // url(#…) 참조가 깨져 화살표 머리가 통째로 사라지므로 영숫자만 남긴다.
    const key = `${kind}-${String(color).replace(/[^a-zA-Z0-9]+/g, "")}`;
    if (!this.markers.has(key)) {
      const id = `${this.prefix}-${key}`;
      const def = kind === "ar"
        ? `<marker id="${id}" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0.5 L9,4.5 L0,8.5 z" fill="${color}"/></marker>`
        : `<marker id="${id}" markerWidth="6" markerHeight="12" refX="3" refY="6" orient="auto" markerUnits="userSpaceOnUse"><rect x="0" y="0.5" width="2.6" height="11" fill="${color}"/></marker>`;
      this.markers.set(key, { id, def });
    }
    return this.markers.get(key).id;
  }
  // 한 줄 텍스트. y는 기준선. 겹침 검사용으로 대략의 사각형을 기록한다.
  text(x, y, t, { fs = FS, fill = "var(--dg-navy)", anchor = "middle", bold = false, owner = "free" } = {}) {
    const w = textWidth(t, fs, bold);
    const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
    this.texts.push({ x: left, y: y - fs * 0.82, w, h: fs * 1.08, label: t, owner });
    const weight = bold ? ' font-weight="700"' : "";
    this.parts.push(`<text x="${r1(x)}" y="${r1(y)}" text-anchor="${anchor}" font-size="${fs}"${weight} fill="${fill}">${esc(t)}</text>`);
  }
  rect(x, y, w, h, color, id, dash) {
    const d = dash ? ` stroke-dasharray="${dash}"` : "";
    this.parts.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="6" fill="var(--dg-${color}-f)" stroke="var(--dg-${color}-s)" stroke-width="1.1"${d}/>`);
    if (id) this.boxes.push({ x, y, w, h, id });
  }
  line(x1, y1, x2, y2, kind, color = "var(--dg-navy)") {
    const end = kind === "inhibit" ? this.marker("inh", color) : kind === "none" ? null : this.marker("ar", color);
    const m = end ? ` marker-end="url(#${end})"` : "";
    this.parts.push(`<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${color}" stroke-width="1.5"${m}/>`);
  }
  path(d, kind, color = "var(--dg-navy)") {
    const end = kind === "inhibit" ? this.marker("inh", color) : kind === "none" ? null : this.marker("ar", color);
    const m = end ? ` marker-end="url(#${end})"` : "";
    this.parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"${m}/>`);
  }
  cross(x, y, s = 7) {
    const c = "var(--dg-limit)";
    this.parts.push(`<line x1="${r1(x - s)}" y1="${r1(y - s)}" x2="${r1(x + s)}" y2="${r1(y + s)}" stroke="${c}" stroke-width="2.4"/><line x1="${r1(x - s)}" y1="${r1(y + s)}" x2="${r1(x + s)}" y2="${r1(y - s)}" stroke="${c}" stroke-width="2.4"/>`);
  }
  badge(x, y, n) {
    this.parts.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="9" fill="var(--dg-navy)"/>`);
    this.parts.push(`<text x="${r1(x)}" y="${r1(y + 4)}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--dg-badge-t)">${n}</text>`);
  }
}

// 노드 박스 크기: 라벨(굵게)·sub를 줄바꿈해서 잰다.
function measureNode(node, maxText = BOX_TEXT_MAX) {
  const labelLines = wrap(node.label, maxText, FS, true);
  const subLines = node.sub ? wrap(node.sub, maxText, FS_SUB) : [];
  const textW = Math.max(
    ...labelLines.map((l) => textWidth(l, FS, true)),
    ...subLines.map((l) => textWidth(l, FS_SUB)),
    0
  );
  const w = Math.max(BOX_MIN_W, textW + PAD_X * 2);
  const h = PAD_Y * 2 + labelLines.length * LINE + (subLines.length ? subLines.length * (FS_SUB + 2.5) + 2 : 0);
  return { w, h, labelLines, subLines };
}

function drawNode(cv, node, x, y, w, h, m) {
  const color = node.color || "blue";
  cv.rect(x, y, w, h, color, node.id);
  const tc = `var(--dg-${color}-t)`;
  const blockH = m.labelLines.length * LINE + (m.subLines.length ? m.subLines.length * (FS_SUB + 2.5) + 2 : 0);
  let by = y + (h - blockH) / 2 + FS;
  for (const l of m.labelLines) {
    cv.text(x + w / 2, by, l, { fill: tc, bold: true, owner: node.id });
    by += LINE;
  }
  if (m.subLines.length) by += 2;
  for (const l of m.subLines) {
    cv.text(x + w / 2, by - 2, l, { fs: FS_SUB, fill: tc, owner: node.id });
    by += FS_SUB + 2.5;
  }
}

function edgeColor(kind) {
  return kind === "inhibit" || kind === "blocked" ? "var(--dg-limit)" : "var(--dg-navy)";
}

function drawEdge(cv, e, x1, y1, x2, y2, lx, ly, anchor) {
  const kind = e.kind || "arrow";
  const color = edgeColor(kind);
  cv.line(x1, y1, x2, y2, kind === "blocked" ? "arrow" : kind, color);
  if (kind === "blocked") cv.cross((x1 + x2) / 2, (y1 + y2) / 2);
  if (e.label) {
    // 차단 ✕와 라벨이 겹치지 않게 가로 배치에서는 라벨을 조금 더 올린다.
    const dy = kind === "blocked" && anchor === "middle" ? -6 : 0;
    cv.text(lx, ly + dy, e.label, { fs: FS_EDGE, fill: color, anchor, bold: true, owner: "edge" });
  }
}

// ── 주석(notes) ─────────────────────────────────────────
function drawNotes(cv, notes, width, top) {
  let y = top;
  for (const n of notes || []) {
    const color = `var(--dg-${n.tone === "pos" ? "pos" : n.tone === "limit" ? "limit" : "general"})`;
    const prefix = n.tone === "pos" ? "＋ " : n.tone === "limit" ? "한계  " : "";
    for (const l of wrap(prefix + n.text, width - MARGIN * 2, FS_NOTE)) {
      y += FS_NOTE + 4;
      cv.text(MARGIN, y, l, { fs: FS_NOTE, fill: color, anchor: "start", owner: "note" });
    }
  }
  return y;
}

// ── 겹침 검사 ───────────────────────────────────────────
function checkOverlaps(cv) {
  const warns = [];
  const hit = (a, b, pad = 1) => a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad;
  const T = cv.texts;
  for (let i = 0; i < T.length; i++) {
    for (let j = i + 1; j < T.length; j++) {
      if (hit(T[i], T[j])) warns.push(`글자 겹침: "${T[i].label}" ↔ "${T[j].label}"`);
    }
  }
  for (const t of T) {
    for (const b of cv.boxes) {
      if (t.owner === b.id) {
        // 자기 박스 안에 있어야 한다(넘치면 라벨이 박스 밖으로 샌 것).
        if (t.x < b.x + 2 || t.x + t.w > b.x + b.w - 2 || t.y < b.y || t.y + t.h > b.y + b.h + 1) {
          warns.push(`박스 넘침: "${t.label}" (${b.id})`);
        }
      } else if (hit(t, b, 2)) warns.push(`글자가 박스를 가림: "${t.label}" ↔ 박스 ${b.id}`);
    }
  }
  return warns.concat(cv.warns || []);
}

module.exports = {
  COLORS, EDGE_KINDS, TONES,
  FS, FS_SUB, FS_EDGE, FS_NOTE, LINE, MARGIN, H_WRAP_W,
  textWidth, wrap, esc, r1,
  validateNodes, Canvas, measureNode, drawNode, edgeColor, drawEdge, drawNotes, checkOverlaps,
};
```

- [ ] **Step 2: `scripts/diagrams/types/linear.js` 작성**

```js
// chain(기전·경로) / procedure(번호 붙은 단계): 노드 순서대로 한 줄, 좁은 화면은 세로.
"use strict";
const { FS_EDGE, MARGIN, H_WRAP_W, textWidth, r1, validateNodes, measureNode, drawNode, edgeColor, drawEdge } = require("../core.js");

function layoutLinear(cv, spec, orientation, numbered) {
  const nodes = spec.nodes;
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const ms = nodes.map((n) => measureNode(n));
  const edges = spec.edges || [];
  const adjacent = edges.filter((e) => Math.abs(idx.get(e.to) - idx.get(e.from)) === 1);
  const arcs = edges.filter((e) => Math.abs(idx.get(e.to) - idx.get(e.from)) !== 1);
  // 인접 엣지 라벨 → 간격 결정
  const gapLabel = new Map();
  for (const e of adjacent) {
    const a = Math.min(idx.get(e.from), idx.get(e.to));
    gapLabel.set(a, e);
  }
  const pos = [];
  let extent = { w: 0, h: 0 };

  if (orientation === "h") {
    const H = Math.max(...ms.map((m) => m.h));
    const arcSpace = arcs.length ? 34 + 14 * (arcs.length - 1) : 0;
    const top = MARGIN + (numbered ? 6 : 0) + arcSpace;
    const gapAfter = (i) => {
      const e = gapLabel.get(i);
      const lw = e && e.label ? textWidth(e.label, FS_EDGE, true) + 16 : 0;
      return Math.max(48, lw);
    };
    // 줄 감기: arc가 없고 한 줄 폭이 H_WRAP_W를 넘으면 노드를 여러 줄로 나눈다.
    // 각 줄은 왼쪽 정렬이고, 줄 끝 → 다음 줄 첫 노드는 ㄱ자 꺾인 화살표로 잇는다.
    const ROW_GAP = 46;
    const rowOf = new Array(nodes.length).fill(0);
    let x = MARGIN, row = 0, maxX = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (!arcs.length && i > 0 && x + ms[i].w + MARGIN > H_WRAP_W) {
        row++;
        x = MARGIN;
      }
      rowOf[i] = row;
      pos.push({ x, y: top + row * (H + ROW_GAP), w: ms[i].w, h: H });
      x += ms[i].w;
      maxX = Math.max(maxX, x);
      if (i < nodes.length - 1) x += gapAfter(i);
    }
    extent = { w: maxX + MARGIN, h: top + row * (H + ROW_GAP) + H };
    nodes.forEach((n, i) => drawNode(cv, n, pos[i].x, pos[i].y, pos[i].w, pos[i].h, ms[i]));
    for (const e of adjacent) {
      const ia = idx.get(e.from), ib = idx.get(e.to);
      const a = pos[ia], b = pos[ib];
      const fwd = ib > ia;
      if (rowOf[ia] === rowOf[ib]) {
        const y = a.y + a.h / 2;
        const x1 = fwd ? a.x + a.w : a.x, x2 = fwd ? b.x - 2 : b.x + b.w + 2;
        drawEdge(cv, e, x1, y, x2, y, (x1 + x2) / 2, y - 7, "middle");
      } else {
        // 줄을 건너는 엣지: 위 줄 노드 아래에서 내려와 줄 사이를 가로지른 뒤 아래 줄 노드로.
        const down = a.y < b.y;
        const sx = a.x + a.w / 2, dx = b.x + b.w / 2;
        const sy = down ? a.y + a.h : a.y, dy = down ? b.y - 2 : b.y + b.h + 2;
        const midY = (down ? a.y + a.h : b.y + b.h) + ROW_GAP / 2;
        const kind = e.kind || "arrow", color = edgeColor(kind);
        cv.path(`M${r1(sx)},${r1(sy)} L${r1(sx)},${r1(midY)} L${r1(dx)},${r1(midY)} L${r1(dx)},${r1(dy)}`, kind === "blocked" ? "arrow" : kind, color);
        const mx = (sx + dx) / 2;
        if (kind === "blocked") cv.cross(mx, midY);
        if (e.label) cv.text(mx, midY - (kind === "blocked" ? 12 : 6), e.label, { fs: FS_EDGE, fill: color, bold: true, owner: "edge" });
      }
    }
    arcs.forEach((e, k) => {
      const a = pos[idx.get(e.from)], b = pos[idx.get(e.to)];
      const x1 = a.x + a.w / 2, x2 = b.x + b.w / 2, y = a.y;
      const lift = 30 + 14 * k;
      cv.path(`M${r1(x1)},${r1(y)} C${r1(x1)},${r1(y - lift)} ${r1(x2)},${r1(y - lift)} ${r1(x2)},${r1(y - 2)}`, e.kind === "blocked" ? "arrow" : e.kind, edgeColor(e.kind));
      const mx = (x1 + x2) / 2, my = y - lift * 0.75;
      if (e.kind === "blocked") cv.cross(mx, my);
      // 곡선 꼭대기(=my)에서 글자 기준선을 띄워 선과 겹치지 않게 한다.
      if (e.label) cv.text(mx, my - (e.kind === "blocked" ? 12 : 6), e.label, { fs: FS_EDGE, fill: edgeColor(e.kind), bold: true, owner: "edge" });
    });
  } else {
    const W = Math.max(...ms.map((m) => m.w));
    const labelW = Math.max(0, ...adjacent.map((e) => (e.label ? textWidth(e.label, FS_EDGE, true) : 0)));
    // 되돌이 엣지는 왼쪽에 호로 그리고, 라벨은 호 바깥에 오른끝 정렬로 둔다.
    const arcLabelW = Math.max(0, ...arcs.map((e) => (e.label ? textWidth(e.label, FS_EDGE, true) + 6 : 0)));
    const arcSpace = arcs.length ? 34 + 14 * (arcs.length - 1) + arcLabelW : 0;
    const left = MARGIN + arcSpace + (numbered ? 6 : 0);
    let y = MARGIN + (numbered ? 6 : 0);
    for (let i = 0; i < nodes.length; i++) {
      pos.push({ x: left, y, w: W, h: ms[i].h });
      y += ms[i].h + (i < nodes.length - 1 ? 40 : 0);
    }
    extent = { w: left + W + (labelW ? labelW + 22 : 0) + MARGIN, h: y };
    nodes.forEach((n, i) => drawNode(cv, n, pos[i].x, pos[i].y, pos[i].w, pos[i].h, ms[i]));
    for (const e of adjacent) {
      const a = pos[idx.get(e.from)], b = pos[idx.get(e.to)];
      const fwd = idx.get(e.to) > idx.get(e.from);
      const x = a.x + a.w / 2;
      const y1 = fwd ? a.y + a.h : a.y, y2 = fwd ? b.y - 2 : b.y + b.h + 2;
      drawEdge(cv, e, x, y1, x, y2, x + 10, (y1 + y2) / 2 + 4, "start");
    }
    arcs.forEach((e, k) => {
      const a = pos[idx.get(e.from)], b = pos[idx.get(e.to)];
      const y1 = a.y + a.h / 2, y2 = b.y + b.h / 2, x = a.x;
      const lift = 30 + 14 * k;
      cv.path(`M${r1(x)},${r1(y1)} C${r1(x - lift)},${r1(y1)} ${r1(x - lift)},${r1(y2)} ${r1(x - 2)},${r1(y2)}`, e.kind === "blocked" ? "arrow" : e.kind, edgeColor(e.kind));
      if (e.kind === "blocked") cv.cross(x - lift * 0.75, (y1 + y2) / 2);
      if (e.label) cv.text(x - lift * 0.75 - (e.kind === "blocked" ? 12 : 6), (y1 + y2) / 2 + 4, e.label, { fs: FS_EDGE, fill: edgeColor(e.kind), anchor: "end", bold: true, owner: "edge" });
    });
  }
  if (numbered) pos.forEach((p, i) => cv.badge(p.x + 2, p.y + 2, i + 1));
  return extent;
}

function describeLinear(spec, title) {
  const byId = new Map(spec.nodes.map((n) => [n.id, n.label]));
  const steps = (spec.edges || []).map((e) => {
    const a = byId.get(e.from), b = byId.get(e.to), via = e.label ? `(${e.label})` : "";
    if (e.kind === "inhibit") return `${a}가 ${b}를 억제${via}`;
    if (e.kind === "blocked") return `${a}에서 ${b}로 가는 경로는 차단됨${via}`;
    return `${a} → ${b}${via}`;
  });
  const lead = spec.type === "procedure" ? "단계 순서" : "진행 순서";
  return `${title} ${lead}: ${steps.join(", ")}.`;
}

const make = (numbered) => ({
  validate: validateNodes,
  layout: (cv, spec, orientation) => layoutLinear(cv, spec, orientation, numbered),
  describe: describeLinear,
  dual: () => true,
});

module.exports = { chain: make(false), procedure: make(true) };
```

- [ ] **Step 3: `scripts/diagrams/types/contrast.js` 작성**

```js
// contrast: 좌우 대비. row 0이 머리, 1…이 비교 속성.
"use strict";
const { FS, FS_NOTE, MARGIN, r1, validateNodes, measureNode, drawNode } = require("../core.js");

function validate(spec) {
  const errs = validateNodes(spec);
  const rows = { left: new Set(), right: new Set() };
  for (const n of spec.nodes || []) {
    if (n.side !== "left" && n.side !== "right") errs.push(`contrast 노드에 side 없음: ${n.id}`);
    else if (!Number.isInteger(n.row)) errs.push(`contrast 노드에 row 없음: ${n.id}`);
    else rows[n.side].add(n.row);
  }
  const l = [...rows.left].sort().join(","), r = [...rows.right].sort().join(",");
  if (l !== r) errs.push(`contrast 좌우 행이 맞지 않음: [${l}] vs [${r}]`);
  if (!rows.left.has(0)) errs.push("contrast에 row 0(머리)이 없음");
  return errs;
}

function layout(cv, spec) {
  const side = { left: new Map(), right: new Map() };
  for (const n of spec.nodes) side[n.side].set(n.row, n);
  const rows = [...side.left.keys()].sort((a, b) => a - b);
  const all = spec.nodes.map((n) => [n, measureNode(n, 150)]);
  const mOf = new Map(all.map(([n, m]) => [n.id, m]));
  const colW = Math.max(120, ...all.map(([, m]) => m.w));
  const gap = 44;
  const axisH = spec.axis ? 24 : 0;
  let y = MARGIN + axisH;
  const xL = MARGIN, xR = MARGIN + colW + gap;
  if (spec.axis) cv.text(xL + colW + gap / 2, MARGIN + 12, spec.axis, { fs: FS_NOTE, fill: "var(--dg-general)", bold: true, owner: "axis" });
  for (const r of rows) {
    const L = side.left.get(r), R = side.right.get(r);
    const h = Math.max(mOf.get(L.id).h, mOf.get(R.id).h) + (r === 0 ? 4 : 0);
    drawNode(cv, r === 0 ? L : { ...L, color: L.color || "gray" }, xL, y, colW, h, mOf.get(L.id));
    drawNode(cv, r === 0 ? R : { ...R, color: R.color || "gray" }, xR, y, colW, h, mOf.get(R.id));
    if (r === 0) cv.text(xL + colW + gap / 2, y + h / 2 + 5, "vs", { fs: FS, fill: "var(--dg-navy)", bold: true, owner: "vs" });
    else cv.parts.push(`<line x1="${r1(xL + colW + 8)}" y1="${r1(y + h / 2)}" x2="${r1(xR - 8)}" y2="${r1(y + h / 2)}" stroke="var(--dg-gray-s)" stroke-width="1" stroke-dasharray="3,3"/>`);
    y += h + (r === 0 ? 14 : 8);
  }
  return { w: xR + colW + MARGIN, h: y - 8 };
}

function describe(spec, title) {
  const heads = spec.nodes.filter((n) => n.row === 0);
  const L = heads.find((n) => n.side === "left"), R = heads.find((n) => n.side === "right");
  const rows = [...new Set(spec.nodes.filter((n) => n.row > 0).map((n) => n.row))].sort((a, b) => a - b);
  const pairs = rows.map((r) => {
    const l = spec.nodes.find((n) => n.side === "left" && n.row === r);
    const rr = spec.nodes.find((n) => n.side === "right" && n.row === r);
    return `${l.label} 대 ${rr.label}`;
  });
  return `${title}: 왼쪽 ${L.label}와 오른쪽 ${R.label}를 비교한다. ${pairs.join(", ")}.`;
}

module.exports = { validate, layout, describe, dual: () => false };
```

- [ ] **Step 4: `scripts/diagrams/types/hierarchy.js` 작성**

```js
// hierarchy: 포함·분류 트리. 가로 트리 + 좁은 화면용 아웃라인.
"use strict";
const { MARGIN, r1, validateNodes, measureNode, drawNode } = require("../core.js");

// 가로판이 이 폭을 넘으면 세로판(아웃라인)을 함께 넣는다. 모바일 본문 폭(~360px)에
// 들어갈 때 글자가 원래 크기의 80% 아래로 줄어드는 지점.
const HIERARCHY_DUAL_MIN_W = 450;

function validate(spec) {
  const errs = validateNodes(spec);
  const nodes = spec.nodes || [];
  const edges = Array.isArray(spec.edges) ? spec.edges : [];
  const hasParent = new Set(edges.map((e) => e.to));
  const roots = nodes.filter((n) => !hasParent.has(n.id));
  if (roots.length !== 1) errs.push(`hierarchy 루트가 ${roots.length}개`);
  const parents = new Map();
  for (const e of edges) {
    if (parents.has(e.to)) errs.push(`hierarchy 노드의 부모가 둘: ${e.to}`);
    parents.set(e.to, e.from);
  }
  for (const n of nodes) {
    const seen = new Set();
    let cur = n.id;
    while (parents.has(cur)) {
      if (seen.has(cur)) { errs.push(`hierarchy 사이클: ${n.id}`); break; }
      seen.add(cur);
      cur = parents.get(cur);
    }
  }
  return errs;
}

function layoutHierarchy(cv, spec) {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const kids = new Map(spec.nodes.map((n) => [n.id, []]));
  const hasParent = new Set();
  for (const e of spec.edges || []) {
    kids.get(e.from).push(e.to);
    hasParent.add(e.to);
  }
  // 자식 순서는 nodes 배열 순서를 따른다(스펙 작성자가 정한 순서).
  const order = new Map(spec.nodes.map((n, i) => [n.id, i]));
  for (const list of kids.values()) list.sort((a, b) => order.get(a) - order.get(b));
  const root = spec.nodes.find((n) => !hasParent.has(n.id)).id;
  const m = new Map(spec.nodes.map((n) => [n.id, measureNode(n, 112)]));
  const HGAP = 16, VGAP = 38;
  // 깊이별 행 높이 통일
  const depth = new Map();
  (function walk(id, d) { depth.set(id, d); kids.get(id).forEach((k) => walk(k, d + 1)); })(root, 0);
  const rowH = [];
  for (const [id, d] of depth) rowH[d] = Math.max(rowH[d] || 0, m.get(id).h);
  const sub = new Map();
  (function width(id) {
    const ks = kids.get(id);
    const own = m.get(id).w;
    const kw = ks.length ? ks.map(width).reduce((a, b) => a + b, 0) + HGAP * (ks.length - 1) : 0;
    sub.set(id, Math.max(own, kw));
    return sub.get(id);
  })(root);
  const pos = new Map();
  const rowY = [];
  let acc = MARGIN;
  rowH.forEach((h, d) => { rowY[d] = acc; acc += h + VGAP; });
  (function place(id, x0) {
    const d = depth.get(id), w = m.get(id).w;
    const cx = x0 + sub.get(id) / 2;
    pos.set(id, { x: cx - w / 2, y: rowY[d], w, h: rowH[d] });
    const ks = kids.get(id);
    const kw = ks.map((k) => sub.get(k)).reduce((a, b) => a + b, 0) + HGAP * Math.max(0, ks.length - 1);
    let x = cx - kw / 2;
    for (const k of ks) { place(k, x); x += sub.get(k) + HGAP; }
  })(root, MARGIN);
  for (const [id, ks] of kids) {
    if (!ks.length) continue;
    const p = pos.get(id);
    const px = p.x + p.w / 2, py = p.y + p.h, midY = py + VGAP / 2;
    for (const k of ks) {
      const c = pos.get(k);
      const cx = c.x + c.w / 2;
      cv.path(`M${r1(px)},${r1(py)} L${r1(px)},${r1(midY)} L${r1(cx)},${r1(midY)} L${r1(cx)},${r1(c.y - 2)}`, "arrow", "var(--dg-gray-s)");
    }
  }
  for (const [id, p] of pos) drawNode(cv, byId.get(id), p.x, p.y, p.w, p.h, m.get(id));
  return { w: MARGIN * 2 + sub.get(root), h: acc - VGAP };
}

// 좁은 화면용 hierarchy: 들여쓰기 목록(아웃라인)처럼 한 줄에 노드 하나씩.
// 가로 트리는 잎이 5개만 넘어도 400px에 넣으면 글자가 5px 남짓으로 줄어든다.
function layoutHierarchyV(cv, spec) {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const order = new Map(spec.nodes.map((n, i) => [n.id, i]));
  const kids = new Map(spec.nodes.map((n) => [n.id, []]));
  const hasParent = new Set();
  for (const e of spec.edges || []) { kids.get(e.from).push(e.to); hasParent.add(e.to); }
  for (const list of kids.values()) list.sort((a, b) => order.get(a) - order.get(b));
  const root = spec.nodes.find((n) => !hasParent.has(n.id)).id;
  const INDENT = 26, VGAP = 10;
  const rows = [];
  (function walk(id, d) { rows.push({ id, d }); kids.get(id).forEach((k) => walk(k, d + 1)); })(root, 0);
  const m = new Map(spec.nodes.map((n) => [n.id, measureNode(n, 170)]));
  const maxDepth = Math.max(...rows.map((r) => r.d));
  const boxW = Math.max(...rows.map((r) => m.get(r.id).w));
  const pos = new Map();
  let y = MARGIN;
  for (const r of rows) {
    const h = m.get(r.id).h;
    pos.set(r.id, { x: MARGIN + r.d * INDENT, y, w: boxW, h });
    y += h + VGAP;
  }
  for (const [id, ks] of kids) {
    const p = pos.get(id);
    const lx = p.x + 12;
    for (const k of ks) {
      const c = pos.get(k);
      cv.path(`M${r1(lx)},${r1(p.y + p.h)} L${r1(lx)},${r1(c.y + c.h / 2)} L${r1(c.x - 2)},${r1(c.y + c.h / 2)}`, "arrow", "var(--dg-gray-s)");
    }
  }
  for (const r of rows) {
    const p = pos.get(r.id);
    drawNode(cv, byId.get(r.id), p.x, p.y, p.w, p.h, m.get(r.id));
  }
  return { w: MARGIN * 2 + maxDepth * INDENT + boxW, h: y - VGAP };
}

function describe(spec, title) {
  const byId = new Map(spec.nodes.map((n) => [n.id, n.label]));
  const kids = new Map();
  for (const e of spec.edges) (kids.get(e.from) || kids.set(e.from, []).get(e.from)).push(byId.get(e.to));
  return `${title}: ` + [...kids].map(([p, ks]) => `${byId.get(p)} 아래에 ${ks.join(", ")}`).join("; ") + ".";
}

module.exports = {
  validate,
  layout: (cv, spec, orientation) => (orientation === "v" ? layoutHierarchyV(cv, spec) : layoutHierarchy(cv, spec)),
  describe,
  dual: (spec, hWidth) => hWidth > HIERARCHY_DUAL_MIN_W,
};
```

- [ ] **Step 5: `scripts/diagrams/types/index.js` 작성 (기존 4개만)**

```js
// type 이름 → 모듈. 순서가 lib.TYPES의 순서가 된다.
"use strict";
const linear = require("./linear.js");

module.exports = {
  chain: linear.chain,
  contrast: require("./contrast.js"),
  hierarchy: require("./hierarchy.js"),
  procedure: linear.procedure,
};
```

- [ ] **Step 6: `scripts/diagrams/lib.js` 전체 교체**

```js
// 개념 도식(SVG) 렌더러 — diagrams/specs/<slug>.json → 인라인 SVG 문자열
//
// 스타일은 tools/figlib.py(학회 기록용 SVG DSL)를 따른다. figlib는 좌표를 손으로
// 찍지만, 여기서는 용어마다 좌표를 쓰지 않도록 type과 노드·엣지(또는 type별 필드)만
// 받아 자동 배치한다. type별 배치는 types/*.js, 공통부는 core.js.
//
// 웹 대응:
// - width/height 없이 viewBox만 쓴다(CSS가 width:100%로 늘인다).
// - 색은 전부 CSS 변수(--dg-*)라 다크 모드 값은 style.css가 따로 준다. 그래서
//   <img src=.svg>가 아니라 페이지에 인라인으로 넣어야 한다.
// - 일부 type은 가로·세로 두 벌을 만들고 CSS가 폭에 따라 하나만 보여 준다.
//
// 브라우저 없이 빌드하므로 글자 폭은 근사치(textWidth)로 잰다. 줄바꿈과 겹침
// 검사가 모두 이 근사에 기대므로, 실제보다 약간 넓게 잡는다(core.js SAFETY).
"use strict";

const core = require("./core.js");
const TYPE_MODS = require("./types/index.js");
const { COLORS, TONES, MARGIN, H_WRAP_W, textWidth, wrap, esc, Canvas, drawNotes, checkOverlaps } = core;

const TYPES = Object.keys(TYPE_MODS);

// ── 검증 ─────────────────────────────────────────────────
// knownSlugs: terms.json의 slug 집합(없으면 slug 존재 검사는 건너뜀)
function validateSpec(spec, knownSlugs) {
  const errs = [];
  if (!spec || typeof spec !== "object") return ["스펙이 객체가 아님"];
  if (!spec.slug) errs.push("slug 없음");
  else if (knownSlugs && !knownSlugs.has(spec.slug)) errs.push(`terms.json에 없는 slug: ${spec.slug}`);
  const mod = TYPE_MODS[spec.type];
  if (!mod) errs.push(`type이 올바르지 않음: ${spec.type}`);
  else errs.push(...mod.validate(spec));
  for (const note of spec.notes || []) {
    if (note.tone && !TONES.includes(note.tone)) errs.push(`알 수 없는 note tone: ${note.tone}`);
  }
  if (typeof spec.reviewed !== "boolean") errs.push("reviewed(true/false) 없음");
  if (!spec.source) errs.push("source 없음");
  return errs;
}

// ── 접근성 문장 ─────────────────────────────────────────
function describe(spec, title) {
  return TYPE_MODS[spec.type].describe(spec, title);
}

// ── 공개 API ────────────────────────────────────────────
// orientation: "h"(기본) | "v". 세로판이 없는 type은 "h"만 의미가 있다.
function renderSpec(spec, { title, orientation = "h", idPrefix } = {}) {
  const t = title || spec.title || spec.slug;
  const prefix = `dg-${(idPrefix || spec.slug).replace(/[^a-zA-Z0-9-]/g, "")}-${orientation}`;
  const cv = new Canvas(prefix);
  const mod = TYPE_MODS[spec.type];
  if (!mod) throw new Error(`알 수 없는 type: ${spec.type}`);
  const ext = mod.layout(cv, spec, orientation);
  let width = Math.ceil(ext.w);
  // 주석은 도식 폭에 맞춰 줄바꿈하되, 도식이 아주 좁으면 최소 폭을 준다.
  if (spec.notes && spec.notes.length) width = Math.max(width, orientation === "v" ? 300 : 360);
  const height = Math.ceil(drawNotes(cv, spec.notes, width, ext.h + 6) + MARGIN);
  const warnings = checkOverlaps(cv);
  const desc = describe(spec, t);
  const defs = cv.markers.size ? `<defs>${[...cv.markers.values()].map((m) => m.def).join("")}</defs>` : "";
  const svg =
    // max-width를 viewBox 폭(px)으로 걸어 둔다. 안 그러면 좁은 도식(contrast 등)이
    // 컬럼 폭까지 늘어나 글자가 체인 도식의 두 배 크기로 보인다.
    `<svg class="dg dg-${orientation}" viewBox="0 0 ${width} ${height}" style="max-width:${width}px" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${prefix}-t ${prefix}-d" font-family="'Pretendard','Noto Sans KR','Apple SD Gothic Neo',sans-serif">` +
    `<title id="${prefix}-t">${esc(t)}</title><desc id="${prefix}-d">${esc(desc)}</desc>${defs}${cv.parts.join("")}</svg>`;
  return { svg, width, height, warnings, desc };
}

// 본문 컬럼(--max-width 760 − 여백)에서 도식이 원래 크기로 들어가는 최대 폭. 가로판이
// 이보다 넓으면 어느 화면에서도 축소돼 글자가 작아지므로 세로판만 싣는다.
const H_FIT_W = 680;

// 페이지에 넣을 <figure> 전체. type이 원하면 가로·세로 두 벌을 넣는다.
function renderFigure(spec, title) {
  const mod = TYPE_MODS[spec.type];
  const h = renderSpec(spec, { title, orientation: "h" });
  const v = mod.dual(spec, h.width) ? renderSpec(spec, { title, orientation: "v" }) : null;
  const vOnly = !!v && h.width > H_FIT_W;
  const warnings = [...(vOnly ? [] : h.warnings.map((w) => `[가로] ${w}`)), ...(v ? v.warnings.map((w) => `[세로] ${w}`) : [])];
  const cls = `concept-diagram${v && !vOnly ? " dg-dual" : ""}`;
  const cap = mod.caption ? `<figcaption>${esc(mod.caption)}</figcaption>` : "";
  // spec.source는 검수용 메모라 페이지에 싣지 않는다. 사전의 정의 본문에도 출처를
  // 달지 않는데 도식에만 붙이면 형식이 어긋나고, 검증 전 서지가 권위처럼 보인다.
  const html = `<figure class="${cls}" data-type="${spec.type}">${vOnly ? "" : h.svg}${v ? v.svg : ""}${cap}</figure>`;
  return { html, warnings, desc: h.desc };
}

module.exports = { TYPES, COLORS, H_WRAP_W, H_FIT_W, textWidth, wrap, validateSpec, renderSpec, renderFigure, describe, Canvas, checkOverlaps };
```

- [ ] **Step 7: 회귀·기존 테스트 확인**

Run: `node --test tests/diagrams-golden.test.js tests/diagrams-render.test.js tests/diagrams-insert.test.js`
Expected: `pass 3`, `fail 0`. golden이 실패하면 옮기면서 바뀐 글자를 찾아 되돌린다(출력 문자열을 바꾸는 수정은 이 Task에서 금지).

- [ ] **Step 8: Commit**

```bash
git add scripts/diagrams/core.js scripts/diagrams/types scripts/diagrams/lib.js
git commit -m "개념 도식: 렌더러를 core + type 모듈로 분리(출력 불변)"
```

---

### Task 3: plot 함수 모듈

**Files:**
- Create: `scripts/diagrams/plot-fns.js`
- Test: `tests/diagrams-plot-fns.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/diagrams-plot-fns.test.js`:

```js
// plot 함수: 수치가 맞는지, 매개변수 검사가 잡는지
const assert = require("assert");
const { FNS, Phi, PhiInv, lgamma, checkParams, sample } = require("../scripts/diagrams/plot-fns.js");
const near = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

// 기본 수학
near(Phi(0), 0.5);
near(Phi(1.96), 0.975, 1e-3);
near(PhiInv(0.975), 1.96, 1e-3);
near(PhiInv(Phi(-1.3)), -1.3, 1e-3);
near(lgamma(5), Math.log(24));
near(lgamma(0.5), Math.log(Math.sqrt(Math.PI)));

// 함수값
near(FNS.normal.f(0, { mu: 0, sigma: 1 }), 1 / Math.sqrt(2 * Math.PI));
near(FNS.t.f(0, { df: 1 }), 1 / Math.PI); // 코시 분포
near(FNS.chi2.f(2, { df: 2 }), 0.5 * Math.exp(-1));
near(FNS.exponential.f(0, { rate: 2 }), 2);
near(FNS.logistic.f(3, { x0: 3, k: 1 }), 0.5);
near(FNS.linear.f(2, { a: 3, b: 1 }), 7);
near(FNS.roc.f(0.3, { auc: 0.5 }), 0.3); // AUC 0.5는 대각선
assert.ok(FNS.roc.f(0.3, { auc: 0.9 }) > 0.3);
near(FNS.hill.f(10, { ec50: 10, n: 2 }), 0.5);
near(FNS.inverted_u.f(4, { peak: 4, width: 2 }), 1);
near(FNS.decay.f(0, { rate: 1 }), 1);

// 정규분포 최대점은 mu
{
  const pts = sample("normal", { mu: 1.5, sigma: 0.7 }, -2, 5);
  const top = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  near(top[0], 1.5, 0.06);
  assert.strictEqual(pts.length, 121);
}
// domain으로 잘린다
{
  const pts = sample("exponential", { rate: 1 }, -3, 4);
  assert.ok(pts[0][0] >= 0);
}

// 매개변수 검사
assert.deepStrictEqual(checkParams("normal", { mu: 0, sigma: 1 }), []);
assert.ok(checkParams("normal", { mu: 0 }).some((e) => e.includes("sigma")));
assert.ok(checkParams("normal", { mu: 0, sigma: -1 }).some((e) => e.includes("범위")));
assert.ok(checkParams("roc", { auc: 1 }).some((e) => e.includes("범위")));
assert.ok(checkParams("roc", { auc: 0.4 }).some((e) => e.includes("범위")));
assert.ok(checkParams("linear", { a: 1, b: 2, c: 3 }).some((e) => e.includes("알 수 없는")));
assert.ok(checkParams("logistic", { x0: 0, k: 0 }).some((e) => e.includes("범위")));

console.log("diagrams-plot-fns: all tests passed");
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/diagrams-plot-fns.test.js`
Expected: FAIL — `Cannot find module '../scripts/diagrams/plot-fns.js'`

- [ ] **Step 3: `scripts/diagrams/plot-fns.js` 작성**

```js
// plot 도식용 함수 10개. 스펙은 함수 이름과 매개변수만 쓰고, 점은 여기서 계산한다
// (LLM이 좌표를 찍으면 틀린 그래프가 그대로 거짓 정보가 되므로).
"use strict";

// erf: Abramowitz–Stegun 7.1.26 (최대 오차 1.5e-7)
function erf(x) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// Φ⁻¹: Acklam 근사(상대 오차 1.2e-9)
function PhiInv(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ln Γ(z): Lanczos(g=7)
function lgamma(z) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// params: 이름 → 규칙(gt 초과, gte 이상, lt 미만, ne 같지 않음). domain: 계산할 x 범위.
// desc: 접근성 문장에 쓰는 한국어 이름.
const FNS = {
  normal: { params: { mu: {}, sigma: { gt: 0 } }, desc: "종 모양 분포",
    f: (x, p) => Math.exp(-0.5 * ((x - p.mu) / p.sigma) ** 2) / (p.sigma * Math.sqrt(2 * Math.PI)) },
  t: { params: { df: { gt: 0 } }, desc: "t 분포",
    f: (x, p) => Math.exp(lgamma((p.df + 1) / 2) - lgamma(p.df / 2) - 0.5 * Math.log(p.df * Math.PI) - ((p.df + 1) / 2) * Math.log(1 + (x * x) / p.df)) },
  chi2: { params: { df: { gt: 0 } }, domain: [0, Infinity], desc: "카이제곱 분포",
    f: (x, p) => (x <= 0 ? 0 : Math.exp((p.df / 2 - 1) * Math.log(x) - x / 2 - (p.df / 2) * Math.LN2 - lgamma(p.df / 2))) },
  exponential: { params: { rate: { gt: 0 } }, domain: [0, Infinity], desc: "지수 분포",
    f: (x, p) => p.rate * Math.exp(-p.rate * x) },
  logistic: { params: { x0: {}, k: { ne: 0 } }, desc: "S자 곡선",
    f: (x, p) => 1 / (1 + Math.exp(-p.k * (x - p.x0))) },
  linear: { params: { a: {}, b: {} }, desc: "직선",
    f: (x, p) => p.a * x + p.b },
  // 등분산 이항정규 ROC: d' = √2·Φ⁻¹(AUC), TPR = Φ(Φ⁻¹(FPR) + d')
  roc: { params: { auc: { gte: 0.5, lt: 1 } }, domain: [0, 1], desc: "ROC 곡선",
    f: (x, p) => (x <= 0 ? 0 : x >= 1 ? 1 : Phi(PhiInv(x) + Math.SQRT2 * PhiInv(p.auc))) },
  hill: { params: { ec50: { gt: 0 }, n: { gt: 0 } }, domain: [0, Infinity], desc: "용량-반응 곡선",
    f: (x, p) => (x <= 0 ? 0 : x ** p.n / (p.ec50 ** p.n + x ** p.n)) },
  inverted_u: { params: { peak: {}, width: { gt: 0 } }, desc: "역U자 곡선",
    f: (x, p) => Math.exp(-(((x - p.peak) / p.width) ** 2)) },
  decay: { params: { rate: { gt: 0 } }, domain: [0, Infinity], desc: "감쇠 곡선",
    f: (x, p) => Math.exp(-p.rate * x) },
};

function checkParams(fn, params) {
  const F = FNS[fn];
  if (!F) return [`알 수 없는 plot 함수: ${fn}`];
  const errs = [];
  const given = params && typeof params === "object" ? params : {};
  for (const [k, rule] of Object.entries(F.params)) {
    const v = given[k];
    if (typeof v !== "number" || !Number.isFinite(v)) { errs.push(`${fn}: 매개변수 ${k} 없음 또는 숫자 아님`); continue; }
    const bad = ("gt" in rule && !(v > rule.gt)) || ("gte" in rule && !(v >= rule.gte)) ||
      ("lt" in rule && !(v < rule.lt)) || ("ne" in rule && v === rule.ne);
    if (bad) errs.push(`${fn}: ${k}=${v} 범위 밖`);
  }
  for (const k of Object.keys(given)) if (!(k in F.params)) errs.push(`${fn}: 알 수 없는 매개변수 ${k}`);
  return errs;
}

// [lo, hi]를 함수 domain으로 자른 뒤 n개 점을 고르게 뽑는다.
function sample(fn, params, lo, hi, n = 121) {
  const F = FNS[fn];
  const d = F.domain || [-Infinity, Infinity];
  const a = Math.max(lo, d[0]), b = Math.min(hi, d[1]);
  const pts = [];
  if (!(a < b)) return pts;
  for (let i = 0; i < n; i++) {
    const x = a + ((b - a) * i) / (n - 1);
    pts.push([x, F.f(x, params)]);
  }
  return pts;
}

module.exports = { FNS, Phi, PhiInv, lgamma, checkParams, sample };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/diagrams-plot-fns.test.js`
Expected: `pass 1`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add scripts/diagrams/plot-fns.js tests/diagrams-plot-fns.test.js
git commit -m "개념 도식: plot 함수 10개(정규·t·카이제곱·지수·로지스틱·직선·ROC·Hill·역U·감쇠)"
```

---

### Task 4: cycle

**Files:**
- Create: `scripts/diagrams/types/cycle.js`
- Modify: `scripts/diagrams/types/index.js`
- Test: `tests/diagrams-cycle.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/diagrams-cycle.test.js`:

```js
const assert = require("assert");
const { validateSpec, renderSpec, renderFigure } = require("../scripts/diagrams/lib.js");

const base = (n) => ({
  slug: "pdca-cycle", type: "cycle", center: "PDCA",
  nodes: ["계획", "실행", "점검", "개선", "표준화", "공유"].slice(0, n).map((l, i) => ({ id: `n${i}`, label: l, color: "blue" })),
  edges: [], source: "test", reviewed: false,
});

for (const n of [3, 4, 5, 6]) {
  const s = base(n);
  assert.deepStrictEqual(validateSpec(s), [], `n=${n}`);
  const r = renderSpec(s, { title: "PDCA" });
  assert.deepStrictEqual(r.warnings, [], `n=${n} 겹침: ${r.warnings.join("; ")}`);
  assert.strictEqual((r.svg.match(/<line /g) || []).length, n, "화살표는 노드 수만큼");
  assert.ok(!/#[0-9a-fA-F]{6}/.test(r.svg.replace(/<desc[\s\S]*?<\/desc>/, "")));
}
assert.ok(validateSpec(base(2)).some((e) => e.includes("3~6")));
assert.ok(validateSpec({ ...base(7), nodes: [...base(6).nodes, { id: "x", label: "추가" }] }).some((e) => e.includes("3~6")));
assert.ok(validateSpec({ ...base(4), edges: [{ from: "n0", to: "n1" }] }).some((e) => e.includes("edges")));

const r = renderSpec(base(4), { title: "PDCA" });
assert.ok(r.desc.includes("다시 계획"));
assert.strictEqual((renderFigure(base(4), "t").html.match(/<svg/g) || []).length, 1);
console.log("diagrams-cycle: all tests passed");
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/diagrams-cycle.test.js`
Expected: FAIL — `type이 올바르지 않음: cycle`

- [ ] **Step 3: `scripts/diagrams/types/cycle.js` 작성**

```js
// cycle: 끝이 처음으로 돌아오는 순환(탄소 순환, PDCA). 노드 3~6개를 원 위에 시계방향으로.
"use strict";
const { FS, MARGIN, validateNodes, measureNode, drawNode } = require("../core.js");

function validate(spec) {
  const errs = validateNodes(spec);
  const n = (spec.nodes || []).length;
  if (n && (n < 3 || n > 6)) errs.push(`cycle 노드는 3~6개: ${n}개`);
  if ((spec.edges || []).length) errs.push("cycle은 edges를 쓰지 않음(노드 순서대로 자동 연결)");
  return errs;
}

// 상자 중심에서 (tx,ty) 쪽으로 나간 반직선이 상자 테두리와 만나는 점
function borderPoint(b, tx, ty) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy;
  const s = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  return [cx + dx * s, cy + dy * s];
}

function layout(cv, spec) {
  const nodes = spec.nodes, n = nodes.length;
  const ms = nodes.map((nd) => measureNode(nd));
  const W = Math.max(...ms.map((m) => m.w)), H = Math.max(...ms.map((m) => m.h));
  // 이웃 상자 중심 거리(현의 길이)가 상자 대각선 + 40px 이상이 되게 반지름을 잡는다.
  const R = Math.max(80, (Math.hypot(W, H) + 40) / (2 * Math.sin(Math.PI / n)));
  const cx = MARGIN + W / 2 + R, cy = MARGIN + H / 2 + R;
  const pos = nodes.map((nd, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n; // 12시에서 시작, 시계방향
    return { x: cx + R * Math.cos(a) - ms[i].w / 2, y: cy + R * Math.sin(a) - H / 2, w: ms[i].w, h: H };
  });
  for (let i = 0; i < n; i++) {
    const a = pos[i], b = pos[(i + 1) % n];
    const [x1, y1] = borderPoint(a, b.x + b.w / 2, b.y + b.h / 2);
    const [x2, y2] = borderPoint(b, a.x + a.w / 2, a.y + a.h / 2);
    const L = Math.hypot(x2 - x1, y2 - y1), k = (L - 3) / L; // 머리가 상자에 묻히지 않게
    cv.line(x1, y1, x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, "arrow");
  }
  nodes.forEach((nd, i) => drawNode(cv, nd, pos[i].x, pos[i].y, pos[i].w, pos[i].h, ms[i]));
  if (spec.center) cv.text(cx, cy + 5, spec.center, { fs: FS, bold: true, fill: "var(--dg-general)", owner: "center" });
  return { w: cx + R + W / 2 + MARGIN, h: cy + R + H / 2 + MARGIN };
}

function describe(spec, title) {
  const labels = spec.nodes.map((n) => n.label);
  return `${title} 순환: ${labels.join(" → ")} → 다시 ${labels[0]}.`;
}

module.exports = { validate, layout, describe, dual: () => false };
```

- [ ] **Step 4: index.js에 등록**

`scripts/diagrams/types/index.js`의 `procedure: linear.procedure,` 다음 줄에 추가:

```js
  cycle: require("./cycle.js"),
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/diagrams-cycle.test.js tests/diagrams-golden.test.js tests/diagrams-render.test.js`
Expected: `pass 3`, `fail 0`

- [ ] **Step 6: Commit**

```bash
git add scripts/diagrams/types/cycle.js scripts/diagrams/types/index.js tests/diagrams-cycle.test.js
git commit -m "개념 도식: cycle(순환) type"
```

---

### Task 5: matrix (2×2)

**Files:**
- Create: `scripts/diagrams/types/matrix.js`
- Modify: `scripts/diagrams/types/index.js`
- Test: `tests/diagrams-matrix.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/diagrams-matrix.test.js`:

```js
const assert = require("assert");
const { validateSpec, renderSpec } = require("../scripts/diagrams/lib.js");

const spec = {
  slug: "type-i-and-type-ii-errors", type: "matrix",
  axes: { x: { label: "실제", low: "귀무가설 참", high: "귀무가설 거짓" }, y: { label: "판단", low: "기각 안 함", high: "기각" } },
  nodes: [
    { id: "a", cell: "tl", label: "1종 오류", sub: "α", color: "rose" },
    { id: "b", cell: "tr", label: "옳은 기각", sub: "검정력 1−β", color: "green" },
    { id: "c", cell: "bl", label: "옳은 유지", color: "green" },
    { id: "d", cell: "br", label: "2종 오류", sub: "β", color: "rose" },
  ],
  edges: [], source: "test", reviewed: false,
};

assert.deepStrictEqual(validateSpec(spec), []);
const r = renderSpec(spec, { title: "1종·2종 오류" });
assert.deepStrictEqual(r.warnings, [], r.warnings.join("; "));
assert.ok(r.desc.includes("왼쪽 위 1종 오류") && r.desc.includes("오른쪽 아래 2종 오류"));
assert.ok(validateSpec({ ...spec, nodes: spec.nodes.slice(0, 3) }).some((e) => e.includes("4개")));
assert.ok(validateSpec({ ...spec, nodes: spec.nodes.map((n) => ({ ...n, cell: "tl" })) }).some((e) => e.includes("cell")));
assert.ok(validateSpec({ ...spec, axes: { x: spec.axes.x } }).some((e) => e.includes("axes.y")));
console.log("diagrams-matrix: all tests passed");
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/diagrams-matrix.test.js`
Expected: FAIL — `type이 올바르지 않음: matrix`

- [ ] **Step 3: `scripts/diagrams/types/matrix.js` 작성**

```js
// matrix: 두 기준으로 나눈 2×2(1종·2종 오류, 위험 매트릭스).
// 축 이름은 회전하지 않고 가로로 쓴다(회전 글자는 겹침 검사가 어렵다).
"use strict";
const { FS_SUB, FS_NOTE, MARGIN, textWidth, validateNodes, measureNode, drawNode } = require("../core.js");

const CELLS = ["tl", "tr", "bl", "br"];
const AT = { tl: [0, 0], tr: [1, 0], bl: [0, 1], br: [1, 1] };
const AXIS = "var(--dg-general)";

function validate(spec) {
  const errs = validateNodes(spec);
  const nodes = spec.nodes || [];
  if (nodes.length !== 4) errs.push(`matrix 노드는 정확히 4개: ${nodes.length}개`);
  const used = new Set();
  for (const n of nodes) {
    if (!CELLS.includes(n.cell)) errs.push(`matrix 노드 cell은 tl·tr·bl·br 중 하나: ${n.id}`);
    else if (used.has(n.cell)) errs.push(`matrix cell 중복: ${n.cell}`);
    used.add(n.cell);
  }
  for (const k of ["x", "y"]) {
    const a = spec.axes && spec.axes[k];
    if (!a || !a.label || !a.low || !a.high) errs.push(`matrix axes.${k}에 label·low·high 필요`);
  }
  if ((spec.edges || []).length) errs.push("matrix는 edges를 쓰지 않음");
  return errs;
}

function layout(cv, spec) {
  const { x: ax, y: ay } = spec.axes;
  const ms = new Map(spec.nodes.map((n) => [n.id, measureNode(n, 150)]));
  const CW = Math.max(140, ...[...ms.values()].map((m) => m.w));
  const CH = Math.max(56, ...[...ms.values()].map((m) => m.h));
  const G = 8;
  const yLabW = Math.max(textWidth(ay.high, FS_SUB), textWidth(ay.low, FS_SUB));
  const xA = MARGIN + yLabW + 12; // y축 선
  const x0 = xA + 10; // 격자 왼쪽
  const top = MARGIN + FS_NOTE + 10;
  cv.text(MARGIN, MARGIN + FS_NOTE, `↑ ${ay.label}`, { fs: FS_NOTE, bold: true, fill: AXIS, anchor: "start", owner: "axis-y" });
  for (const n of spec.nodes) {
    const [c, r] = AT[n.cell];
    drawNode(cv, n, x0 + c * (CW + G), top + r * (CH + G), CW, CH, ms.get(n.id));
  }
  const gridB = top + 2 * CH + G, gridR = x0 + 2 * CW + G;
  cv.line(xA, gridB, xA, top, "arrow", "var(--dg-gray-s)");
  const yA = gridB + 10;
  cv.line(x0, yA, gridR, yA, "arrow", "var(--dg-gray-s)");
  cv.text(xA - 6, top + CH / 2 + 4, ay.high, { fs: FS_SUB, fill: AXIS, anchor: "end", owner: "axis-y" });
  cv.text(xA - 6, top + CH + G + CH / 2 + 4, ay.low, { fs: FS_SUB, fill: AXIS, anchor: "end", owner: "axis-y" });
  const tickY = yA + FS_SUB + 6;
  cv.text(x0 + CW / 2, tickY, ax.low, { fs: FS_SUB, fill: AXIS, owner: "axis-x" });
  cv.text(x0 + CW + G + CW / 2, tickY, ax.high, { fs: FS_SUB, fill: AXIS, owner: "axis-x" });
  const xLabY = tickY + FS_NOTE + 8;
  cv.text((x0 + gridR) / 2, xLabY, `${ax.label} →`, { fs: FS_NOTE, bold: true, fill: AXIS, owner: "axis-x" });
  const w = Math.max(gridR + MARGIN + 6, MARGIN * 2 + textWidth(`↑ ${ay.label}`, FS_NOTE, true));
  return { w, h: xLabY + 4 };
}

function describe(spec, title) {
  const { x: ax, y: ay } = spec.axes;
  const at = Object.fromEntries(spec.nodes.map((n) => [n.cell, n.label]));
  return `${title}: 가로 ${ax.label}(${ax.low}→${ax.high}), 세로 ${ay.label}(${ay.low}→${ay.high})로 나눈 네 칸. ` +
    `왼쪽 위 ${at.tl}, 오른쪽 위 ${at.tr}, 왼쪽 아래 ${at.bl}, 오른쪽 아래 ${at.br}.`;
}

module.exports = { validate, layout, describe, dual: () => false };
```

- [ ] **Step 4: index.js에 등록** — `cycle` 줄 다음에:

```js
  matrix: require("./matrix.js"),
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/diagrams-matrix.test.js tests/diagrams-golden.test.js`
Expected: `pass 2`, `fail 0`

- [ ] **Step 6: Commit**

```bash
git add scripts/diagrams/types/matrix.js scripts/diagrams/types/index.js tests/diagrams-matrix.test.js
git commit -m "개념 도식: matrix(2×2) type"
```

---

### Task 6: venn

**Files:**
- Create: `scripts/diagrams/types/venn.js`
- Modify: `scripts/diagrams/types/index.js`
- Test: `tests/diagrams-venn.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/diagrams-venn.test.js`:

```js
const assert = require("assert");
const { validateSpec, renderSpec } = require("../scripts/diagrams/lib.js");

const two = {
  slug: "mixed-methods", type: "venn",
  nodes: [{ id: "q", label: "양적 연구", color: "blue" }, { id: "l", label: "질적 연구", color: "green" }],
  regions: [{ sets: ["q"], label: "일반화" }, { sets: ["l"], label: "맥락 이해" }, { sets: ["q", "l"], label: "혼합 연구" }],
  edges: [], source: "test", reviewed: false,
};
const three = {
  ...two, slug: "three-sets",
  nodes: [...two.nodes, { id: "a", label: "실행 연구", color: "amber" }],
  regions: [{ sets: ["q", "l", "a"], label: "통합" }, { sets: ["q", "a"], label: "평가" }, { sets: ["a"], label: "현장 개선" }],
};

for (const s of [two, three]) {
  assert.deepStrictEqual(validateSpec(s), [], s.slug);
  const r = renderSpec(s, { title: s.slug });
  assert.deepStrictEqual(r.warnings, [], `${s.slug}: ${r.warnings.join("; ")}`);
  assert.strictEqual((r.svg.match(/<circle /g) || []).length, s.nodes.length);
  assert.ok(!/#[0-9a-fA-F]{6}/.test(r.svg.replace(/<desc[\s\S]*?<\/desc>/, "")));
}
assert.ok(renderSpec(two, { title: "t" }).desc.includes("양적 연구∩질적 연구: 혼합 연구"));
assert.ok(validateSpec({ ...two, nodes: two.nodes.slice(0, 1) }).some((e) => e.includes("2~3")));
assert.ok(validateSpec({ ...two, regions: [{ sets: ["zz"], label: "x" }] }).some((e) => e.includes("영역")));
assert.ok(validateSpec({ ...two, regions: [...two.regions, { sets: ["l", "q"], label: "중복" }] }).some((e) => e.includes("중복")));
console.log("diagrams-venn: all tests passed");
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/diagrams-venn.test.js`
Expected: FAIL — `type이 올바르지 않음: venn`

- [ ] **Step 3: `scripts/diagrams/types/venn.js` 작성**

```js
// venn: 집합 2~3개의 겹침. 원은 반투명 채움, 영역 라벨은 그 영역 안쪽 대표점에.
"use strict";
const { FS, FS_SUB, MARGIN, r1, wrap, validateNodes } = require("../core.js");

const DEFAULT = ["blue", "rose", "green"];

function validate(spec) {
  const errs = validateNodes(spec);
  const ids = new Set((spec.nodes || []).map((n) => n.id));
  const n = ids.size;
  if (n && (n < 2 || n > 3)) errs.push(`venn 집합은 2~3개: ${n}개`);
  if ((spec.edges || []).length) errs.push("venn은 edges를 쓰지 않음");
  const seen = new Set();
  for (const rg of spec.regions || []) {
    const sets = Array.isArray(rg.sets) ? rg.sets : [];
    if (!sets.length || sets.some((s) => !ids.has(s))) { errs.push(`venn 영역의 sets가 집합 id가 아님: ${JSON.stringify(rg.sets)}`); continue; }
    if (!rg.label) errs.push(`venn 영역 label 없음: ${sets.join("+")}`);
    const key = [...sets].sort().join("+");
    if (seen.has(key)) errs.push(`venn 영역 중복: ${key}`);
    seen.add(key);
  }
  return errs;
}

function layout(cv, spec) {
  const n = spec.nodes.length;
  const r = n === 2 ? 92 : 84;
  const d = n === 2 ? 58 : 56;
  const rel = n === 2
    ? [[-d, 0], [d, 0]]
    : [[0, -d], [-d * Math.cos(Math.PI / 6), d * Math.sin(Math.PI / 6)], [d * Math.cos(Math.PI / 6), d * Math.sin(Math.PI / 6)]];
  const minX = Math.min(...rel.map((c) => c[0])) - r, maxX = Math.max(...rel.map((c) => c[0])) + r;
  const minY = Math.min(...rel.map((c) => c[1])) - r, maxY = Math.max(...rel.map((c) => c[1])) + r;
  const labTop = FS + 8; // 위쪽 집합 이름 줄
  const ox = MARGIN - minX, oy = MARGIN + labTop - minY;
  const C = rel.map(([x, y]) => [x + ox, y + oy]);
  const colorOf = (i) => spec.nodes[i].color || DEFAULT[i];
  spec.nodes.forEach((nd, i) => {
    const c = colorOf(i);
    cv.parts.push(`<circle cx="${r1(C[i][0])}" cy="${r1(C[i][1])}" r="${r}" fill="var(--dg-${c}-f)" fill-opacity="0.6" stroke="var(--dg-${c}-s)" stroke-width="1.4"/>`);
  });
  // 집합 이름: 2개면 각 원 위 바깥, 3개면 위 원은 위, 아래 두 원은 아래 바깥.
  let bottom = maxY + oy;
  spec.nodes.forEach((nd, i) => {
    const [x, y] = C[i];
    const below = n === 3 && i > 0;
    const side = n === 2 ? (i === 0 ? -1 : 1) : below ? (i === 1 ? -1 : 1) : 0;
    const ty = below ? y + r + FS + 4 : y - r - 6;
    cv.text(x + side * r * 0.35, ty, nd.label, { bold: true, fill: `var(--dg-${colorOf(i)}-t)`, owner: `set-${nd.id}` });
    if (below) bottom = Math.max(bottom, ty + 4);
  });
  // 영역 대표점: 포함 집합 중심들의 평균을 전체 중심에서 바깥으로 민다.
  const idx = new Map(spec.nodes.map((nd, i) => [nd.id, i]));
  const cen = [C.reduce((s, c) => s + c[0], 0) / n, C.reduce((s, c) => s + c[1], 0) / n];
  for (const rg of spec.regions || []) {
    const ins = rg.sets.map((id) => C[idx.get(id)]);
    let px = ins.reduce((s, c) => s + c[0], 0) / ins.length;
    let py = ins.reduce((s, c) => s + c[1], 0) / ins.length;
    const push = ins.length === 1 ? (n === 2 ? 0.6 : 0.75) : ins.length === 2 && n === 3 ? 0.5 : 0;
    px += (px - cen[0]) * push;
    py += (py - cen[1]) * push;
    const lines = wrap(rg.label, n === 2 ? 60 : 58, FS_SUB);
    lines.forEach((l, k) => cv.text(px, py + 4 + (k - (lines.length - 1) / 2) * (FS_SUB + 2), l, { fs: FS_SUB, fill: "var(--dg-navy)", owner: "region" }));
  }
  return { w: maxX - minX + 2 * MARGIN, h: bottom + MARGIN };
}

function describe(spec, title) {
  const lab = new Map(spec.nodes.map((n) => [n.id, n.label]));
  const sets = spec.nodes.map((n) => n.label).join(", ");
  const regions = (spec.regions || []).map((rg) => `${rg.sets.map((s) => lab.get(s)).join("∩")}: ${rg.label}`);
  return `${title}: ${sets}의 겹침.${regions.length ? ` ${regions.join(", ")}.` : ""}`;
}

module.exports = { validate, layout, describe, dual: () => false };
```

- [ ] **Step 4: index.js에 등록** — `matrix` 줄 다음에:

```js
  venn: require("./venn.js"),
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/diagrams-venn.test.js tests/diagrams-golden.test.js`
Expected: `pass 2`, `fail 0`

- [ ] **Step 6: Commit**

```bash
git add scripts/diagrams/types/venn.js scripts/diagrams/types/index.js tests/diagrams-venn.test.js
git commit -m "개념 도식: venn(집합 2~3개) type"
```

---

### Task 7: timeline

**Files:**
- Create: `scripts/diagrams/types/timeline.js`
- Modify: `scripts/diagrams/types/index.js`
- Test: `tests/diagrams-timeline.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/diagrams-timeline.test.js`:

```js
const assert = require("assert");
const { validateSpec, renderSpec, renderFigure } = require("../scripts/diagrams/lib.js");

const spec = {
  slug: "history-of-statistics", type: "timeline",
  events: [
    { when: "1900", label: "카이제곱 검정", sub: "피어슨", color: "blue" },
    { when: "1908", label: "t 검정", sub: "고셋" },
    { when: "1925", label: "분산분석", sub: "피셔", color: "violet" },
    { when: "1933", label: "가설검정 틀", sub: "네이만·피어슨" },
  ],
  source: "test", reviewed: false,
};

assert.deepStrictEqual(validateSpec(spec), []);
for (const o of ["h", "v"]) {
  const r = renderSpec(spec, { title: "통계의 역사", orientation: o });
  assert.deepStrictEqual(r.warnings, [], `${o}: ${r.warnings.join("; ")}`);
}
const h = renderSpec(spec, { orientation: "h" }), v = renderSpec(spec, { orientation: "v" });
assert.ok(v.width < h.width && v.height > h.height);
assert.strictEqual((renderFigure(spec, "t").html.match(/<svg/g) || []).length, 2);
assert.ok(h.desc.includes("1908 t 검정"));
assert.ok(validateSpec({ ...spec, events: spec.events.slice(0, 1) }).some((e) => e.includes("2~7")));
assert.ok(validateSpec({ ...spec, events: [{ when: "", label: "x" }, ...spec.events] }).some((e) => e.includes("when")));
console.log("diagrams-timeline: all tests passed");
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/diagrams-timeline.test.js`
Expected: FAIL — `type이 올바르지 않음: timeline`

- [ ] **Step 3: `scripts/diagrams/types/timeline.js` 작성**

```js
// timeline: 사건의 시간 순서. 간격은 시간 비례가 아니라 균등(when이 "1960년대"처럼 글이어도 되게).
// 가로판: 위에 사건 상자, 아래 축에 시점. 세로판: 왼쪽 시점, 오른쪽 사건 상자.
"use strict";
const { FS_EDGE, MARGIN, COLORS, r1, textWidth, measureNode, drawNode } = require("../core.js");

const GRAY = "var(--dg-gray-s)";

function validate(spec) {
  const errs = [];
  const ev = Array.isArray(spec.events) ? spec.events : [];
  if (ev.length < 2 || ev.length > 7) errs.push(`timeline 사건은 2~7개: ${ev.length}개`);
  ev.forEach((e, i) => {
    if (!e.when) errs.push(`timeline 사건 ${i + 1}에 when 없음`);
    if (!e.label) errs.push(`timeline 사건 ${i + 1}에 label 없음`);
    if (e.color && !COLORS.includes(e.color)) errs.push(`알 수 없는 color: ${e.color} (사건 ${i + 1})`);
  });
  if ((spec.nodes || []).length || (spec.edges || []).length) errs.push("timeline은 nodes·edges 대신 events를 씀");
  return errs;
}

function layout(cv, spec, orientation) {
  const ev = spec.events;
  const nodes = ev.map((e, i) => ({ id: `ev${i}`, label: e.label, sub: e.sub, color: e.color || "blue" }));
  const ms = nodes.map((nd) => measureNode(nd, 120));
  const whenW = ev.map((e) => textWidth(e.when, FS_EDGE, true));
  const dot = (x, y) => cv.parts.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="4" fill="var(--dg-navy)"/>`);
  const tick = (x1, y1, x2, y2) => cv.parts.push(`<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${GRAY}" stroke-width="1" stroke-dasharray="3,3"/>`);
  const whenText = (x, y, t, anchor) => cv.text(x, y, t, { fs: FS_EDGE, bold: true, fill: "var(--dg-general)", anchor, owner: "when" });

  if (orientation === "h") {
    const H = Math.max(...ms.map((m) => m.h));
    const GAP = 18;
    const pos = [];
    let x = MARGIN;
    ev.forEach((e, i) => {
      const w = Math.max(ms[i].w, whenW[i] + 8); // 시점 글자가 이웃과 겹치지 않게 상자를 넓힌다
      pos.push({ x, y: MARGIN, w, h: H });
      x += w + GAP;
    });
    const right = x - GAP;
    const axisY = MARGIN + H + 22;
    cv.line(MARGIN, axisY, right + 8, axisY, "arrow", GRAY);
    pos.forEach((p, i) => {
      const cx = p.x + p.w / 2;
      tick(cx, p.y + H, cx, axisY);
      dot(cx, axisY);
      whenText(cx, axisY + FS_EDGE + 8, ev[i].when, "middle");
    });
    nodes.forEach((nd, i) => drawNode(cv, nd, pos[i].x, pos[i].y, pos[i].w, H, ms[i]));
    return { w: right + 8 + MARGIN, h: axisY + FS_EDGE + 8 + MARGIN - 6 };
  }

  const axisX = MARGIN + Math.max(...whenW) + 12;
  const bx = axisX + 18;
  const W = Math.max(...ms.map((m) => m.w));
  const ys = [];
  let y = MARGIN;
  for (const m of ms) { ys.push(y); y += m.h + 14; }
  const end = y - 14;
  cv.line(axisX, MARGIN - 2, axisX, end + 10, "arrow", GRAY);
  ev.forEach((e, i) => {
    const cy = ys[i] + ms[i].h / 2;
    tick(axisX, cy, bx, cy);
    dot(axisX, cy);
    whenText(axisX - 10, cy + 4, e.when, "end");
  });
  nodes.forEach((nd, i) => drawNode(cv, nd, bx, ys[i], W, ms[i].h, ms[i]));
  return { w: bx + W + MARGIN, h: end + 10 + MARGIN };
}

function describe(spec, title) {
  return `${title} 시간 순서: ${spec.events.map((e) => `${e.when} ${e.label}`).join(" → ")}.`;
}

module.exports = { validate, layout, describe, dual: () => true };
```

- [ ] **Step 4: index.js에 등록** — `venn` 줄 다음에:

```js
  timeline: require("./timeline.js"),
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/diagrams-timeline.test.js tests/diagrams-golden.test.js`
Expected: `pass 2`, `fail 0`

- [ ] **Step 6: Commit**

```bash
git add scripts/diagrams/types/timeline.js scripts/diagrams/types/index.js tests/diagrams-timeline.test.js
git commit -m "개념 도식: timeline(연표) type, 가로·세로 두 벌"
```

---

### Task 8: plot

**Files:**
- Create: `scripts/diagrams/types/plot.js`
- Modify: `scripts/diagrams/types/index.js`
- Test: `tests/diagrams-plot.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/diagrams-plot.test.js`:

```js
const assert = require("assert");
const { validateSpec, renderSpec, renderFigure } = require("../scripts/diagrams/lib.js");

const power = {
  slug: "statistical-power", type: "plot",
  plot: {
    series: [
      { fn: "normal", params: { mu: 0, sigma: 1 }, label: "귀무가설", color: "gray" },
      { fn: "normal", params: { mu: 2.5, sigma: 1 }, label: "대립가설", color: "blue" },
    ],
    shade: [{ series: 1, from: 1.64, to: null, label: "검정력" }],
    vlines: [{ x: 1.64, label: "임계값" }],
    x: { label: "검정통계량", range: [-4, 6] },
    y: { label: "밀도" },
  },
  source: "test", reviewed: false,
};
const roc = {
  slug: "roc-curve", type: "plot",
  plot: {
    series: [{ fn: "roc", params: { auc: 0.85 }, label: "AUC 0.85", color: "blue" }],
    x: { label: "위양성률", ticks: true }, y: { label: "민감도", ticks: true },
  },
  source: "test", reviewed: false,
};

for (const s of [power, roc]) {
  assert.deepStrictEqual(validateSpec(s), [], s.slug);
  const r = renderSpec(s, { title: s.slug });
  assert.deepStrictEqual(r.warnings, [], `${s.slug}: ${r.warnings.join("; ")}`);
  assert.ok(!/#[0-9a-fA-F]{6}/.test(r.svg.replace(/<desc[\s\S]*?<\/desc>/, "")));
}
const fig = renderFigure(power, "검정력");
assert.ok(fig.html.includes("<figcaption>개념 설명용 모식도"), "모식도 캡션");
assert.strictEqual((fig.html.match(/<svg/g) || []).length, 1);
assert.ok(renderSpec(power, { title: "t" }).desc.includes("음영: 검정력"));
assert.ok(renderSpec(roc, { title: "t" }).svg.includes("stroke-dasharray"), "ROC 우연선");

// 검증
const bad = (patch) => validateSpec({ ...power, plot: { ...power.plot, ...patch } });
assert.ok(bad({ series: [] }).some((e) => e.includes("1~3")));
assert.ok(bad({ series: [{ fn: "gamma", params: {} }] }).some((e) => e.includes("알 수 없는 plot 함수")));
assert.ok(bad({ x: { label: "x", range: [3, 1] } }).some((e) => e.includes("range")));
assert.ok(bad({ shade: [{ series: 5, from: 0, to: 1 }] }).some((e) => e.includes("shade")));
assert.ok(bad({ vlines: [{ x: 99 }] }).some((e) => e.includes("vlines")));
assert.ok(bad({ series: [...roc.plot.series, power.plot.series[0]] }).some((e) => e.includes("roc")));
assert.ok(validateSpec({ ...power, plot: undefined }).some((e) => e.includes("plot 없음")));

// 곡선이 라벨을 가리면 경고: 좁은 음영에 긴 라벨을 달면 라벨이 옆 곡선(귀무가설) 위로 뻗는다
{
  const covered = { ...power, plot: { ...power.plot, vlines: [], shade: [{ series: 1, from: 1.64, to: 1.7, label: "아주 긴 음영 라벨 문장입니다" }] } };
  const r = renderSpec(covered, { title: "t" });
  assert.ok(r.warnings.some((w) => w.includes("곡선이 라벨을 가림")), r.warnings.join("; "));
}
console.log("diagrams-plot: all tests passed");
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/diagrams-plot.test.js`
Expected: FAIL — `type이 올바르지 않음: plot`

- [ ] **Step 3: `scripts/diagrams/types/plot.js` 작성**

```js
// plot: 함수 곡선(분포, ROC, 용량-반응…). 스펙은 함수 이름·매개변수만, 점은 plot-fns.js가 계산.
// 눈금 숫자는 기본으로 숨기고 figure에 "개념 설명용 모식도" 캡션을 단다.
"use strict";
const { FS_SUB, FS_NOTE, MARGIN, COLORS, r1, textWidth } = require("../core.js");
const { FNS, checkParams, sample } = require("../plot-fns.js");

const PW = 440, PH = 200;
const DEFAULT = ["blue", "rose", "green"];
const AXIS = "var(--dg-general)";
const fmt = (v) => String(Math.round(v * 100) / 100);
const colorOf = (s, i) => s.color || DEFAULT[i];

function validate(spec) {
  const p = spec.plot;
  if (!p || typeof p !== "object") return ["plot 없음"];
  const errs = [];
  if ((spec.nodes || []).length || (spec.edges || []).length) errs.push("plot은 nodes·edges를 쓰지 않음");
  const S = Array.isArray(p.series) ? p.series : [];
  if (S.length < 1 || S.length > 3) errs.push(`plot series는 1~3개: ${S.length}개`);
  const isRoc = S.some((s) => s.fn === "roc");
  if (isRoc && S.some((s) => s.fn !== "roc")) errs.push("roc는 다른 함수와 섞을 수 없음");
  for (const s of S) {
    errs.push(...checkParams(s.fn, s.params));
    if (s.color && !COLORS.includes(s.color)) errs.push(`알 수 없는 color: ${s.color}`);
  }
  if (!p.x || !p.x.label) errs.push("plot x.label 없음");
  if (!p.y || !p.y.label) errs.push("plot y.label 없음");
  const range = isRoc ? [0, 1] : p.x && p.x.range;
  const rangeOk = Array.isArray(range) && range.length === 2 && range.every(Number.isFinite) && range[0] < range[1];
  if (!rangeOk) errs.push("plot x.range는 [작은 수, 큰 수]");
  const shade = p.shade || [];
  if (shade.length > 2) errs.push(`plot shade는 0~2개: ${shade.length}개`);
  for (const sh of shade) {
    if (!Number.isInteger(sh.series) || sh.series < 0 || sh.series >= S.length) errs.push(`plot shade의 series 번호가 올바르지 않음: ${sh.series}`);
    const okEnd = (v) => v === null || v === undefined || Number.isFinite(v);
    if (!okEnd(sh.from) || !okEnd(sh.to)) errs.push("plot shade from·to는 숫자 또는 null");
    else if (Number.isFinite(sh.from) && Number.isFinite(sh.to) && !(sh.from < sh.to)) errs.push("plot shade from < to 이어야 함");
  }
  const vlines = p.vlines || [];
  if (vlines.length > 3) errs.push(`plot vlines는 0~3개: ${vlines.length}개`);
  for (const v of vlines) {
    if (!Number.isFinite(v.x) || (rangeOk && (v.x < range[0] || v.x > range[1]))) errs.push(`plot vlines x가 범위 밖: ${v.x}`);
  }
  if (!errs.length) {
    for (const s of S) {
      const pts = sample(s.fn, s.params, range[0], range[1]);
      if (!pts.length || pts.some(([, y]) => !Number.isFinite(y))) errs.push(`${s.fn}: 범위 안에서 계산값이 유한하지 않음`);
    }
  }
  return errs;
}

function layout(cv, spec) {
  const p = spec.plot, S = p.series;
  const isRoc = S[0].fn === "roc";
  const [xlo, xhi] = isRoc ? [0, 1] : p.x.range;
  const data = S.map((s) => sample(s.fn, s.params, xlo, xhi));
  let ylo, yhi;
  if (isRoc) { ylo = 0; yhi = 1; } else {
    const ys = data.flat().map((d) => d[1]);
    ylo = Math.min(0, ...ys);
    yhi = Math.max(...ys);
    if (yhi === ylo) yhi = ylo + 1;
    yhi += (yhi - ylo) * 0.12;
  }
  const yTickW = p.y.ticks ? Math.max(textWidth(fmt(ylo), FS_SUB), textWidth(fmt(yhi), FS_SUB)) + 10 : 0;
  const left = MARGIN + yTickW + 6, top = MARGIN + FS_NOTE + 12;
  const X = (x) => left + ((x - xlo) / (xhi - xlo)) * PW;
  const Y = (y) => top + PH - ((y - ylo) / (yhi - ylo)) * PH;
  const baseY = Y(ylo <= 0 && 0 <= yhi ? 0 : ylo);

  // y축 이름은 축 위 왼쪽에 가로로(회전 글자는 겹침 검사가 어렵다)
  cv.text(left, MARGIN + FS_NOTE, p.y.label, { fs: FS_NOTE, bold: true, fill: AXIS, anchor: "start", owner: "axis-y" });

  // 음영 → 축 → 곡선 순서로 칠한다(곡선이 위에 오게)
  for (const sh of p.shade || []) {
    const s = S[sh.series];
    const a = Math.max(xlo, sh.from ?? xlo), b = Math.min(xhi, sh.to ?? xhi);
    const pts = sample(s.fn, s.params, a, b, 60);
    if (!pts.length) continue;
    const d = `M${r1(X(pts[0][0]))},${r1(baseY)} ` + pts.map(([x, y]) => `L${r1(X(x))},${r1(Y(y))}`).join(" ") + ` L${r1(X(pts[pts.length - 1][0]))},${r1(baseY)} Z`;
    cv.parts.push(`<path d="${d}" fill="var(--dg-${colorOf(s, sh.series)}-f)" stroke="none"/>`);
  }
  cv.line(left, top + PH, left + PW + 8, top + PH, "arrow", "var(--dg-gray-s)");
  cv.line(left, top + PH, left, top - 8, "arrow", "var(--dg-gray-s)");
  if (isRoc) cv.parts.push(`<line x1="${r1(X(0))}" y1="${r1(Y(0))}" x2="${r1(X(1))}" y2="${r1(Y(1))}" stroke="var(--dg-gray-s)" stroke-width="1" stroke-dasharray="4,3"/>`);
  data.forEach((pts, i) => {
    const d = "M" + pts.map(([x, y]) => `${r1(X(x))},${r1(Y(y))}`).join(" L");
    cv.parts.push(`<path d="${d}" fill="none" stroke="var(--dg-${colorOf(S[i], i)}-s)" stroke-width="2.2"/>`);
  });
  for (const v of p.vlines || []) {
    const vx = X(v.x);
    cv.parts.push(`<line x1="${r1(vx)}" y1="${r1(top)}" x2="${r1(vx)}" y2="${r1(top + PH)}" stroke="var(--dg-navy)" stroke-width="1.2" stroke-dasharray="4,3"/>`);
    if (v.label) cv.text(vx + 4, top + FS_SUB, v.label, { fs: FS_SUB, bold: true, fill: "var(--dg-navy)", anchor: "start", owner: "vline" });
  }
  for (const sh of p.shade || []) {
    if (!sh.label) continue;
    const s = S[sh.series];
    const a = Math.max(xlo, sh.from ?? xlo), b = Math.min(xhi, sh.to ?? xhi);
    const xm = (a + b) / 2;
    const ym = FNS[s.fn].f(xm, s.params);
    cv.text(X(xm), Y(ylo + (ym - ylo) * 0.4) + 4, sh.label, { fs: FS_SUB, bold: true, fill: `var(--dg-${colorOf(s, sh.series)}-t)`, owner: "shade" });
  }
  let y = top + PH;
  if (p.x.ticks) {
    y += FS_SUB + 6;
    for (let k = 0; k <= 4; k++) { const xv = xlo + ((xhi - xlo) * k) / 4; cv.text(X(xv), y, fmt(xv), { fs: FS_SUB, fill: AXIS, owner: "tick" }); }
  }
  if (p.y.ticks) {
    for (let k = 0; k <= 4; k++) { const yv = ylo + ((yhi - ylo) * k) / 4; cv.text(left - 6, Y(yv) + 4, fmt(yv), { fs: FS_SUB, fill: AXIS, anchor: "end", owner: "tick" }); }
  }
  y += FS_NOTE + 10;
  cv.text(left + PW / 2, y, p.x.label, { fs: FS_NOTE, bold: true, fill: AXIS, owner: "axis-x" });
  const labeled = S.map((s, i) => ({ s, i })).filter((o) => o.s.label);
  if (labeled.length) {
    y += FS_NOTE + 10;
    let lx = left;
    for (const { s, i } of labeled) {
      const w = 22 + textWidth(s.label, FS_SUB) + 16;
      if (lx > left && lx + w > left + PW) { lx = left; y += FS_SUB + 8; }
      cv.parts.push(`<line x1="${r1(lx)}" y1="${r1(y - 4)}" x2="${r1(lx + 16)}" y2="${r1(y - 4)}" stroke="var(--dg-${colorOf(s, i)}-s)" stroke-width="2.2"/>`);
      cv.text(lx + 22, y, s.label, { fs: FS_SUB, fill: "var(--dg-navy)", anchor: "start", owner: "legend" });
      lx += w;
    }
  }
  // 곡선 표본점이 수직선·음영 라벨 사각형 안에 들어오면 경고
  const pts = data.flatMap((d) => d.map(([x, yv]) => [X(x), Y(yv)]));
  for (const t of cv.texts) {
    if (t.owner !== "vline" && t.owner !== "shade") continue;
    if (pts.some(([px, py]) => px > t.x && px < t.x + t.w && py > t.y && py < t.y + t.h)) cv.warns.push(`곡선이 라벨을 가림: "${t.label}"`);
  }
  return { w: left + PW + 8 + MARGIN, h: y + MARGIN - 6 };
}

function describe(spec, title) {
  const p = spec.plot;
  const series = p.series.map((s) => `${s.label ? `${s.label}: ` : ""}${FNS[s.fn] ? FNS[s.fn].desc : s.fn}`);
  let t = `${title}: 가로축 ${p.x.label}, 세로축 ${p.y.label}. ${series.join(", ")}.`;
  const shades = (p.shade || []).filter((s) => s.label).map((s) => s.label);
  if (shades.length) t += ` 음영: ${shades.join(", ")}.`;
  const vl = (p.vlines || []).filter((v) => v.label).map((v) => v.label);
  if (vl.length) t += ` 기준선: ${vl.join(", ")}.`;
  return t;
}

module.exports = { validate, layout, describe, dual: () => false, caption: "개념 설명용 모식도 — 실제 데이터가 아닙니다" };
```

- [ ] **Step 4: index.js에 등록** — `timeline` 줄 다음에:

```js
  plot: require("./plot.js"),
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/diagrams-plot.test.js tests/diagrams-golden.test.js`
Expected: `pass 2`, `fail 0`. 참고: y 범위 위쪽에 12% 여유를 두므로 곡선은 맨 위 수직선 라벨 줄에 닿지 않는다. 겹침 경고는 주로 음영 라벨에서 난다.

- [ ] **Step 6: Commit**

```bash
git add scripts/diagrams/types/plot.js scripts/diagrams/types/index.js tests/diagrams-plot.test.js
git commit -m "개념 도식: plot type(함수 곡선·음영·기준선·범례, 모식도 캡션)"
```

---

### Task 9: 예시 스펙 + preview `--dir` + 눈으로 확인

**Files:**
- Modify: `scripts/diagrams/preview.js`
- Create: `diagrams/examples/example-cycle.json`, `example-matrix.json`, `example-venn.json`, `example-timeline.json`, `example-plot.json`

- [ ] **Step 1: preview.js에 `--dir` 옵션 추가**

`scripts/diagrams/preview.js`에서

```js
const SPEC_DIR = path.join(ROOT, "diagrams", "specs");
```

를 다음으로 바꾼다:

```js
// --dir <폴더>: 다른 폴더의 스펙을 미리 본다(예: diagrams/examples). 이때는 terms.json에
// 없는 slug도 허용하고, 결과는 그 폴더 안 preview.html·png/에 쓴다.
const argv = process.argv.slice(2);
const dirArg = argv.includes("--dir") ? argv[argv.indexOf("--dir") + 1] : null;
const SPEC_DIR = dirArg ? path.resolve(ROOT, dirArg) : path.join(ROOT, "diagrams", "specs");
const OUT_BASE = dirArg ? SPEC_DIR : path.join(ROOT, "diagrams");
```

그리고

```js
const OUT_SVG = path.join(ROOT, "diagrams", "svg");
const OUT_PNG = path.join(ROOT, "diagrams", "png");
```

를

```js
const OUT_SVG = path.join(OUT_BASE, "svg");
const OUT_PNG = path.join(OUT_BASE, "png");
```

로, `run()` 첫 두 줄

```js
  const titles = loadTitles();
  const known = new Set(titles.keys());
```

를

```js
  const titles = loadTitles();
  const known = dirArg ? null : new Set(titles.keys());
```

로, 미리보기 저장 줄

```js
  fs.writeFileSync(path.join(ROOT, "diagrams", "preview.html"), pageWithDark, "utf8");
```

를

```js
  fs.writeFileSync(path.join(OUT_BASE, "preview.html"), pageWithDark, "utf8");
```

로 바꾼다. 미리보기 HTML의 `<link rel="stylesheet" href="../style.css">`는 `diagrams/examples/`에서 두 단계 위이므로, 같은 파일에서 `href="../style.css"`를 다음으로 바꾼다:

```js
href="${path.relative(OUT_BASE, path.join(ROOT, "style.css")).replace(/\\/g, "/")}"
```

마지막 요약 줄의 `→ diagrams/preview.html`은 `→ ${path.relative(ROOT, path.join(OUT_BASE, "preview.html"))}`로 바꾼다. 제목은 `titles.get(spec.slug)`가 없으면 `spec.title`을 쓰도록 `const title = titles.get(spec.slug);`를 `const title = titles.get(spec.slug) || spec.title;`로 바꾼다.

- [ ] **Step 2: 예시 스펙 5개 작성**

`diagrams/examples/example-cycle.json`:

```json
{
  "slug": "example-cycle", "title": "PDCA 사이클", "type": "cycle", "center": "PDCA",
  "nodes": [
    {"id": "p", "label": "계획", "sub": "목표·방법 수립", "color": "blue"},
    {"id": "d", "label": "실행", "sub": "소규모 시행", "color": "violet"},
    {"id": "c", "label": "점검", "sub": "결과 측정", "color": "amber"},
    {"id": "a", "label": "개선", "sub": "표준화 또는 수정", "color": "green"}
  ],
  "edges": [], "source": "예시", "reviewed": false
}
```

`diagrams/examples/example-matrix.json`:

```json
{
  "slug": "example-matrix", "title": "1종 오류와 2종 오류", "type": "matrix",
  "axes": {"x": {"label": "실제", "low": "귀무가설 참", "high": "귀무가설 거짓"},
           "y": {"label": "판단", "low": "기각 안 함", "high": "기각"}},
  "nodes": [
    {"id": "a", "cell": "tl", "label": "1종 오류", "sub": "확률 α", "color": "rose"},
    {"id": "b", "cell": "tr", "label": "옳은 기각", "sub": "검정력 1−β", "color": "green"},
    {"id": "c", "cell": "bl", "label": "옳은 유지", "color": "green"},
    {"id": "d", "cell": "br", "label": "2종 오류", "sub": "확률 β", "color": "rose"}
  ],
  "edges": [], "source": "예시", "reviewed": false
}
```

`diagrams/examples/example-venn.json`:

```json
{
  "slug": "example-venn", "title": "혼합 연구", "type": "venn",
  "nodes": [{"id": "q", "label": "양적 연구", "color": "blue"}, {"id": "l", "label": "질적 연구", "color": "green"}],
  "regions": [{"sets": ["q"], "label": "일반화"}, {"sets": ["l"], "label": "맥락 이해"}, {"sets": ["q", "l"], "label": "혼합 연구"}],
  "edges": [], "source": "예시", "reviewed": false
}
```

`diagrams/examples/example-timeline.json`:

```json
{
  "slug": "example-timeline", "title": "추론 통계의 형성", "type": "timeline",
  "events": [
    {"when": "1900", "label": "카이제곱 검정", "sub": "피어슨"},
    {"when": "1908", "label": "t 검정", "sub": "고셋"},
    {"when": "1925", "label": "분산분석", "sub": "피셔", "color": "violet"},
    {"when": "1933", "label": "가설검정 틀", "sub": "네이만·피어슨"}
  ],
  "source": "예시", "reviewed": false
}
```

`diagrams/examples/example-plot.json`:

```json
{
  "slug": "example-plot", "title": "통계적 검정력", "type": "plot",
  "plot": {
    "series": [
      {"fn": "normal", "params": {"mu": 0, "sigma": 1}, "label": "귀무가설", "color": "gray"},
      {"fn": "normal", "params": {"mu": 2.5, "sigma": 1}, "label": "대립가설", "color": "blue"}
    ],
    "shade": [{"series": 1, "from": 1.64, "to": null, "label": "검정력"}],
    "vlines": [{"x": 1.64, "label": "임계값"}],
    "x": {"label": "검정통계량", "range": [-4, 6]},
    "y": {"label": "밀도"}
  },
  "notes": [{"text": "효과 크기가 클수록 두 분포가 멀어져 검정력이 커진다", "tone": "general"}],
  "source": "예시", "reviewed": false
}
```

- [ ] **Step 3: 미리보기와 PNG 생성**

Run: `node scripts/diagrams/preview.js --dir diagrams/examples --png --strict`
Expected: 5개 모두 `OK`, `스펙 5개 · 오류 0 · 겹침 경고 0`, `diagrams/examples/png/`에 15장(desktop·mobile·dark).

- [ ] **Step 4: PNG를 눈으로 확인**

Read 도구로 `diagrams/examples/png/example-*.desktop.png`, `*.mobile.png`, `*.dark.png` 15장을 연다. 확인 항목:
- 글자 잘림·겹침 없음, 화살표 머리가 상자에 묻히지 않음
- 다크 모드에서 모든 글자가 읽힘
- cycle 화살표가 시계방향, matrix 축 화살표 방향이 low→high, venn 영역 라벨이 해당 영역 안에 있음
- timeline 모바일 PNG가 세로판
- plot 음영이 임계값 오른쪽, 캡션이 보임

문제가 있으면 해당 type 모듈을 고치고 그 type 테스트·golden 테스트를 다시 돌린다.

- [ ] **Step 5: 생성물은 커밋하지 않도록 .gitignore 확인**

Run: `git check-ignore -v diagrams/png diagrams/svg diagrams/preview.html`
기존 규칙이 `diagrams/png` 등 정확한 경로만 무시하면, `.gitignore`에 다음을 추가한다:

```
diagrams/examples/png/
diagrams/examples/svg/
diagrams/examples/preview.html
```

- [ ] **Step 6: Commit**

```bash
git add scripts/diagrams/preview.js diagrams/examples/*.json .gitignore
git commit -m "개념 도식: 새 type 예시 5개, preview --dir 옵션"
```

---

### Task 10: README 갱신

**Files:**
- Modify: `diagrams/README.md`

- [ ] **Step 1: type 표와 색 표 교체**

`diagrams/README.md`의 필드 표에서 `type` 행을 다음으로 바꾼다:

```markdown
| `type` | `chain` 기전·경로 · `procedure` 방법 단계(①② 번호 자동) · `contrast` 좌우 대비 · `hierarchy` 포함·분류 트리 · `cycle` 순환 · `matrix` 2×2 · `venn` 집합 겹침 · `timeline` 연표 · `plot` 함수 곡선 |
```

`nodes[].color` 행을 다음으로 바꾼다:

```markdown
| `nodes[].color` | 역할 기준: `blue` 주체·구조·기본 · `violet` 방법·도구·매개·신호 · `amber` 외부 요인·개입·입력 · `green` 바람직한 결과·보호·성공 · `rose` 문제·손상·위험·실패 · `gray` 배경·기준·대조군. `mode: "bio"`에서는 blue 뉴런, green 별아교, amber 미세아교·면역, rose 병리, violet 분자·신호 |
```

"type별 규칙:" 목록 끝에 다음을 추가한다:

```markdown
- **cycle**: `nodes` 3~6개, 순서가 진행 방향(12시부터 시계방향). `edges`는 `[]`(자동 연결). 선택적 `center`(가운데 이름).
- **matrix**: `axes: {x: {label, low, high}, y: {label, low, high}}`, `nodes` 정확히 4개에 `cell`(`tl`·`tr`·`bl`·`br`). `edges`는 `[]`.
- **venn**: `nodes` 2~3개가 집합. `regions: [{sets: [id…], label}]`로 영역 라벨(선택). `edges`는 `[]`.
- **timeline**: `nodes`·`edges` 대신 `events: [{when, label, sub?, color?}]` 2~7개. 간격은 균등. 가로·세로 두 벌.
- **plot**: `nodes`·`edges` 대신 `plot`. 좌표를 쓰지 않고 함수 이름과 매개변수만 쓴다.
  `series` 1~3개(`fn`·`params`·`label`·`color`), `shade` 0~2개(`series` 번호·`from`·`to`(null=끝까지)·`label`),
  `vlines` 0~3개(`x`·`label`), `x: {label, range: [lo, hi], ticks?}`, `y: {label, ticks?}`.
  함수: `normal(mu,sigma)` `t(df)` `chi2(df)` `exponential(rate)` `logistic(x0,k)` `linear(a,b)`
  `roc(auc)`(0.5≤auc<1, 범위 [0,1] 고정, 다른 함수와 혼용 불가) `hill(ec50,n)` `inverted_u(peak,width)` `decay(rate)`.
  눈금 숫자는 기본으로 숨기고, 페이지에는 "개념 설명용 모식도" 캡션이 붙는다.
```

"## 웹 대응" 첫 항목 아래에 추가한다:

```markdown
- 렌더러 구조: `scripts/diagrams/core.js`(공통) + `types/<type>.js`(검증·배치·설명문) + `lib.js`(공개 API). 새 type은 `types/index.js`에 등록한다.
- 회귀: `tests/diagrams-golden.test.js`가 기존 스펙의 렌더 결과가 바뀌지 않았는지 본다. 렌더 결과를 의도적으로 바꿨다면 `node scripts/diagrams/golden.js --write`로 갱신한다.
```

- [ ] **Step 2: 전체 테스트**

Run: `npm test`
Expected: 모든 테스트 `pass`, `fail 0`

- [ ] **Step 3: Commit**

```bash
git add diagrams/README.md
git commit -m "개념 도식 README: type 9개와 역할 기준 색 규칙"
```

---

## 이 계획 다음

- 계획 ② 파이프라인 도구: `retrieve.js`(BM25 참고 예시), 분야군 매핑·스타일 가이드, 판정·작성·검수 프롬프트, `status.json` 멱등 처리, 배치 미리보기.
- 계획 ③ 파일럿·배치 운영.
