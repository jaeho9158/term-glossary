// 개념 도식(SVG) 렌더러 — diagrams/specs/<slug>.json → 인라인 SVG 문자열
//
// 스타일은 tools/figlib.py(학회 기록용 SVG DSL)를 따른다. figlib는 좌표를 손으로
// 찍지만, 여기서는 용어마다 좌표를 쓰지 않도록 type(chain/contrast/hierarchy/
// procedure)과 노드·엣지만 받아 자동 배치한다.
//
// 웹 대응:
// - width/height 없이 viewBox만 쓴다(CSS가 width:100%로 늘인다).
// - 색은 전부 CSS 변수(--dg-*)라 다크 모드 값은 style.css가 따로 준다. 그래서
//   <img src=.svg>가 아니라 페이지에 인라인으로 넣어야 한다.
// - chain/procedure는 가로·세로 두 벌을 만들고 CSS가 폭에 따라 하나만 보여 준다.
//
// 브라우저 없이 빌드하므로 글자 폭은 근사치(textWidth)로 잰다. 줄바꿈과 겹침
// 검사가 모두 이 근사에 기대므로, 실제보다 약간 넓게 잡는다(SAFETY).
"use strict";

const TYPES = ["chain", "contrast", "hierarchy", "procedure"];
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

// ── 검증 ─────────────────────────────────────────────────
// knownSlugs: terms.json의 slug 집합(없으면 slug 존재 검사는 건너뜀)
function validateSpec(spec, knownSlugs) {
  const errs = [];
  if (!spec || typeof spec !== "object") return ["스펙이 객체가 아님"];
  if (!spec.slug) errs.push("slug 없음");
  else if (knownSlugs && !knownSlugs.has(spec.slug)) errs.push(`terms.json에 없는 slug: ${spec.slug}`);
  if (!TYPES.includes(spec.type)) errs.push(`type이 올바르지 않음: ${spec.type}`);
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
  for (const note of spec.notes || []) {
    if (note.tone && !TONES.includes(note.tone)) errs.push(`알 수 없는 note tone: ${note.tone}`);
  }
  if (spec.type === "contrast") {
    const rows = { left: new Set(), right: new Set() };
    for (const n of nodes) {
      if (n.side !== "left" && n.side !== "right") errs.push(`contrast 노드에 side 없음: ${n.id}`);
      else if (!Number.isInteger(n.row)) errs.push(`contrast 노드에 row 없음: ${n.id}`);
      else rows[n.side].add(n.row);
    }
    const l = [...rows.left].sort().join(","), r = [...rows.right].sort().join(",");
    if (l !== r) errs.push(`contrast 좌우 행이 맞지 않음: [${l}] vs [${r}]`);
    if (!rows.left.has(0)) errs.push("contrast에 row 0(머리)이 없음");
  }
  if (spec.type === "hierarchy") {
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
  }
  if (typeof spec.reviewed !== "boolean") errs.push("reviewed(true/false) 없음");
  if (!spec.source) errs.push("source 없음");
  return errs;
}

// ── 도식 조립기 ───────────────────────────────────────────
// 요소를 문자열로 쌓으면서 겹침 검사용 사각형(texts, boxes)을 따로 기록한다.
class Canvas {
  constructor(prefix) {
    this.prefix = prefix;
    this.parts = [];
    this.texts = []; // {x,y,w,h,label,owner}
    this.boxes = []; // {x,y,w,h,id}
    this.markers = new Map();
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

// ── chain / procedure ───────────────────────────────────
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

// ── contrast ────────────────────────────────────────────
function layoutContrast(cv, spec) {
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

// ── hierarchy ───────────────────────────────────────────
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

// ── 접근성 문장 ─────────────────────────────────────────
function describe(spec, title) {
  const byId = new Map(spec.nodes.map((n) => [n.id, n.label]));
  if (spec.type === "contrast") {
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
  if (spec.type === "hierarchy") {
    const kids = new Map();
    for (const e of spec.edges) (kids.get(e.from) || kids.set(e.from, []).get(e.from)).push(byId.get(e.to));
    return `${title}: ` + [...kids].map(([p, ks]) => `${byId.get(p)} 아래에 ${ks.join(", ")}`).join("; ") + ".";
  }
  const steps = (spec.edges || []).map((e) => {
    const a = byId.get(e.from), b = byId.get(e.to), via = e.label ? `(${e.label})` : "";
    if (e.kind === "inhibit") return `${a}가 ${b}를 억제${via}`;
    if (e.kind === "blocked") return `${a}에서 ${b}로 가는 경로는 차단됨${via}`;
    return `${a} → ${b}${via}`;
  });
  const lead = spec.type === "procedure" ? "단계 순서" : "진행 순서";
  return `${title} ${lead}: ${steps.join(", ")}.`;
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
  return warns;
}

// ── 공개 API ────────────────────────────────────────────
// orientation: "h"(기본) | "v". contrast/hierarchy는 "h"만 의미가 있다.
function renderSpec(spec, { title, orientation = "h", idPrefix } = {}) {
  const t = title || spec.title || spec.slug;
  const prefix = `dg-${(idPrefix || spec.slug).replace(/[^a-zA-Z0-9-]/g, "")}-${orientation}`;
  const cv = new Canvas(prefix);
  let ext;
  if (spec.type === "chain") ext = layoutLinear(cv, spec, orientation, false);
  else if (spec.type === "procedure") ext = layoutLinear(cv, spec, orientation, true);
  else if (spec.type === "contrast") ext = layoutContrast(cv, spec);
  else if (spec.type === "hierarchy") ext = orientation === "v" ? layoutHierarchyV(cv, spec) : layoutHierarchy(cv, spec);
  else throw new Error(`알 수 없는 type: ${spec.type}`);
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

// 페이지에 넣을 <figure> 전체. 선형 도식은 가로·세로 두 벌을 넣는다.
// 가로판이 이 폭을 넘는 hierarchy도 세로판(아웃라인)을 함께 넣는다. 모바일 본문 폭
// (~360px)에 들어갈 때 글자가 원래 크기의 80% 아래로 줄어드는 지점.
const HIERARCHY_DUAL_MIN_W = 450;

// 본문 컬럼(--max-width 760 − 여백)에서 도식이 원래 크기로 들어가는 최대 폭. 가로판이
// 이보다 넓으면 어느 화면에서도 축소돼 글자가 작아지므로 세로판만 싣는다.
const H_FIT_W = 680;

function renderFigure(spec, title) {
  const h = renderSpec(spec, { title, orientation: "h" });
  const linear = spec.type === "chain" || spec.type === "procedure" ||
    (spec.type === "hierarchy" && h.width > HIERARCHY_DUAL_MIN_W);
  const v = linear ? renderSpec(spec, { title, orientation: "v" }) : null;
  const vOnly = !!v && h.width > H_FIT_W;
  const warnings = [...(vOnly ? [] : h.warnings.map((w) => `[가로] ${w}`)), ...(v ? v.warnings.map((w) => `[세로] ${w}`) : [])];
  const cls = `concept-diagram${v && !vOnly ? " dg-dual" : ""}`;
  // spec.source는 검수용 메모라 페이지에 싣지 않는다. 사전의 정의 본문에도 출처를
  // 달지 않는데 도식에만 붙이면 형식이 어긋나고, 검증 전 서지가 권위처럼 보인다.
  const html = `<figure class="${cls}" data-type="${spec.type}">${vOnly ? "" : h.svg}${v ? v.svg : ""}</figure>`;
  return { html, warnings, desc: h.desc };
}

module.exports = { TYPES, COLORS, H_WRAP_W, H_FIT_W, textWidth, wrap, validateSpec, renderSpec, renderFigure, describe, Canvas, checkOverlaps };
