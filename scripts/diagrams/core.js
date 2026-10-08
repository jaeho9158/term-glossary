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

// 줄바꿈 후보: 공백, 그리고 가운뎃점·화살표·쉼표·슬래시·세미콜론 뒤(숫자 사이 쉼표·슬래시 제외).
// 한국어 라벨은 공백 없이 "만성질환·급성출혈"처럼 이어 쓰는 일이 많아, 공백만 보면
// 단어 한가운데서 끊긴다. 조각 하나가 한 줄보다 길 때만 글자 단위로 자른다(최후 수단).
const BREAK_AFTER = /(?<=[·→;])|(?<=[,/])(?![0-9])/;
function pieces(str) {
  const out = [];
  for (const word of String(str).split(/\s+/).filter(Boolean)) {
    word.split(BREAK_AFTER).filter(Boolean).forEach((p, i) => out.push({ t: p, sp: i === 0 }));
  }
  return out;
}
// 줄바꿈 후보 조각 가운데 가장 넓은 것: 이보다 좁은 칸에는 단어를 못 끊고 넣을 수 없다.
function longestPiece(str, fs, bold = false) {
  let m = 0;
  for (const p of pieces(str)) m = Math.max(m, textWidth(p.t, fs, bold));
  return m;
}

function wrap(str, maxW, fs, bold = false) {
  const lines = [];
  let cur = "";
  const pushLong = (w) => {
    let piece = "";
    for (const ch of w) {
      if (piece && textWidth(piece + ch, fs, bold) > maxW) {
        lines.push(piece);
        piece = ch;
      } else piece += ch;
    }
    cur = piece;
  };
  for (const { t, sp } of pieces(str)) {
    const next = cur ? (sp ? `${cur} ${t}` : cur + t) : t;
    if (textWidth(next, fs, bold) <= maxW) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = "";
      if (textWidth(t, fs, bold) <= maxW) cur = t;
      else pushLong(t);
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
    this.texts.push({ x: left, y: y - fs * 0.82, w, h: fs * 1.08, label: t, owner, fs, bold, base: y });
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
// 단어(줄바꿈 후보 조각)가 칸보다 길면 단어 한가운데서 끊기므로, 먼저 칸을 넓히고
// (최대 maxText의 NODE_GROW_MAX배) 그래도 안 되면 글자 크기를 FS_FLOOR까지 줄인다.
// 후보는 앞쪽일수록 원래 모양에 가깝다. 끊김 0·줄 수 적정(라벨 2줄·전체 3줄 이내)이
// 처음으로 충족되는 후보를 쓰고, 없으면 끊김이 가장 적은 후보를 쓴다.
const FS_FLOOR = 11;
const NODE_GROW_MAX = 1.4;
const NODE_CANDIDATES = [[FS, 1], [FS, 1.2], [12, 1.2], [FS, NODE_GROW_MAX], [12, NODE_GROW_MAX], [FS_FLOOR, NODE_GROW_MAX]];

function layoutNodeText(node, maxText, fsL) {
  const fsS = Math.max(FS_FLOOR, fsL - 1.5);
  const labelLines = wrap(node.label, maxText, fsL, true);
  const subLines = node.sub ? wrap(node.sub, maxText, fsS) : [];
  return { labelLines, subLines, fsL, fsS };
}

function splitCount(lines, original) {
  const toks = new Set(pieces(original).map((p) => p.t));
  // 줄을 공백으로 나눈 뒤, 후보 조각 경계에서 이어 붙은 것까지 다시 쪼개 온전한 조각인지 본다.
  let bad = 0;
  for (const l of lines) for (const w of l.split(" ")) if (w && !pieces(w).every((p) => toks.has(p.t))) bad++;
  return bad;
}

function measureNode(node, maxText = BOX_TEXT_MAX) {
  let best = null;
  for (const [fsL, grow] of NODE_CANDIDATES) {
    const t = layoutNodeText(node, maxText * grow, fsL);
    const bad = splitCount(t.labelLines, node.label) + (node.sub ? splitCount(t.subLines, node.sub) : 0);
    const tooTall = t.labelLines.length > 2 || t.labelLines.length + t.subLines.length > 3;
    const score = bad * 100 + (tooTall ? 1 : 0);
    if (!best || score < best.score) best = { ...t, score };
    if (score === 0) break;
  }
  const { labelLines, subLines, fsL, fsS } = best;
  const textW = Math.max(
    ...labelLines.map((l) => textWidth(l, fsL, true)),
    ...subLines.map((l) => textWidth(l, fsS)),
    0
  );
  const w = Math.max(BOX_MIN_W, textW + PAD_X * 2);
  const lh = fsL + 2.5, sh = fsS + 2.5;
  const h = PAD_Y * 2 + labelLines.length * lh + (subLines.length ? subLines.length * sh + 2 : 0);
  return { w, h, labelLines, subLines, fsL, fsS };
}

function drawNode(cv, node, x, y, w, h, m) {
  const color = node.color || "blue";
  cv.rect(x, y, w, h, color, node.id);
  const tc = `var(--dg-${color}-t)`;
  const fsL = m.fsL || FS, fsS = m.fsS || FS_SUB;
  const lh = fsL + 2.5, sh = fsS + 2.5;
  const blockH = m.labelLines.length * lh + (m.subLines.length ? m.subLines.length * sh + 2 : 0);
  let by = y + (h - blockH) / 2 + fsL;
  for (const l of m.labelLines) {
    cv.text(x + w / 2, by, l, { fs: fsL, fill: tc, bold: true, owner: node.id });
    by += lh;
  }
  if (m.subLines.length) by += 2;
  for (const l of m.subLines) {
    cv.text(x + w / 2, by - 2, l, { fs: fsS, fill: tc, owner: node.id });
    by += sh;
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
// 꼬리표("한계"·"＋")는 따로 굵게 그리고, 본문은 꼬리표 폭만큼 들여 써서 줄이 바뀌어도
// 꼬리표가 문장에 붙어 읽히지 않게 한다(내어쓰기).
const NOTE_TAG_GAP = 7;
function drawNotes(cv, notes, width, top) {
  let y = top;
  for (const n of notes || []) {
    const color = `var(--dg-${n.tone === "pos" ? "pos" : n.tone === "limit" ? "limit" : "general"})`;
    const tag = n.tone === "pos" ? "＋" : n.tone === "limit" ? "한계" : "";
    const indent = tag ? textWidth(tag, FS_NOTE, true) + NOTE_TAG_GAP : 0;
    const lines = wrap(n.text, width - MARGIN * 2 - indent, FS_NOTE);
    lines.forEach((l, i) => {
      y += FS_NOTE + 4;
      if (i === 0 && tag) cv.text(MARGIN, y, tag, { fs: FS_NOTE, fill: color, anchor: "start", bold: true, owner: "note-tag" });
      cv.text(MARGIN + indent, y, l, { fs: FS_NOTE, fill: color, anchor: "start", owner: "note" });
    });
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

// 선분이 사각형(pad만큼 부풀림)과 만나는지(Liang–Barsky)
function segHitsRect(x1, y1, x2, y2, r, pad = 0) {
  const rx = r.x - pad, ry = r.y - pad, rw = r.w + 2 * pad, rh = r.h + 2 * pad;
  const p = [-(x2 - x1), x2 - x1, -(y2 - y1), y2 - y1];
  const q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];
  let u1 = 0, u2 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) u1 = Math.max(u1, t); else u2 = Math.min(u2, t);
  }
  return u1 < u2;
}
// 글자 사각형이 viewBox [0,width]×[0,height] 밖으로 나가면 경고(잘려 보인다).
function checkBounds(texts, width, height, tol = 0.5) {
  return texts
    .filter((t) => t.x < -tol || t.y < -tol || t.x + t.w > width + tol || t.y + t.h > height + tol)
    .map((t) => `보기 영역 밖: "${t.label}"`);
}

module.exports = {
  COLORS, EDGE_KINDS, TONES, SERIES_COLORS, AXIS_COLOR,
  FS, FS_SUB, FS_EDGE, FS_NOTE, LINE, MARGIN, H_WRAP_W,
  textWidth, wrap, pieces, longestPiece, esc, r1, FS_FLOOR,
  validateNodes, Canvas, measureNode, drawNode, edgeColor, drawEdge, drawNotes, checkOverlaps, checkBounds, segHitsRect,
};
