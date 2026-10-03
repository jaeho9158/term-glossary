// 개념 도식 공통부: 글자 폭 근사·줄바꿈, SVG 조립기, 노드·엣지·주석 그리기, 겹침 검사.
// type별 배치는 types/*.js가 맡는다. 스타일 기준은 tools/figlib.py.
"use strict";

const COLORS = ["blue", "green", "amber", "rose", "violet", "gray"];
const EDGE_KINDS = ["arrow", "inhibit", "blocked"];
const TONES = ["pos", "limit", "general"];
// 색을 따로 주지 않은 계열(venn 집합, plot 곡선)의 기본 색과 축 글자 색
const SERIES_COLORS = ["blue", "rose", "green"];
const AXIS_COLOR = "var(--dg-general)";

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
  COLORS, EDGE_KINDS, TONES, SERIES_COLORS, AXIS_COLOR,
  FS, FS_SUB, FS_EDGE, FS_NOTE, LINE, MARGIN, H_WRAP_W,
  textWidth, wrap, esc, r1,
  validateNodes, Canvas, measureNode, drawNode, edgeColor, drawEdge, drawNotes, checkOverlaps,
};
