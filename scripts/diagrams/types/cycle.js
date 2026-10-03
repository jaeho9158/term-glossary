// cycle: 끝이 처음으로 돌아오는 순환(탄소 순환, PDCA). 노드 3~6개를 원 위에 시계방향으로.
"use strict";
const { FS, LINE, MARGIN, textWidth, wrap, segHitsRect, validateNodes, measureNode, drawNode } = require("../core.js");

const CENTER_MAX = 110; // 가운데 글자 줄바꿈 폭
const CLEAR = 8; // 가운데 글자와 화살표·상자 사이 최소 여백

function validate(spec) {
  const errs = validateNodes(spec);
  const n = Array.isArray(spec.nodes) ? spec.nodes.length : 0;
  if (n && (n < 3 || n > 6)) errs.push(`cycle 노드는 3~6개: ${n}개`);
  if ((Array.isArray(spec.edges) ? spec.edges : []).length) errs.push("cycle은 edges를 쓰지 않음(노드 순서대로 자동 연결)");
  return errs;
}

// 상자 중심에서 (tx,ty) 쪽으로 나간 반직선이 상자 테두리와 만나는 점
function borderPoint(b, tx, ty) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy;
  const s = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  return [cx + dx * s, cy + dy * s];
}

const rectsHit = (a, b, pad = 0) => a.x - pad < b.x + b.w && b.x < a.x + a.w + pad && a.y - pad < b.y + b.h && b.y < a.y + a.h + pad;

// 반지름 R일 때 상자 위치와 화살표 선분. 원의 중심은 (0,0) 기준.
function geometry(ms, W, H, R) {
  const n = ms.length;
  const pos = ms.map((m, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n; // 12시에서 시작, 시계방향
    return { x: R * Math.cos(a) - m.w / 2, y: R * Math.sin(a) - H / 2, w: m.w, h: H };
  });
  const segs = pos.map((a, i) => {
    const b = pos[(i + 1) % n];
    const [x1, y1] = borderPoint(a, b.x + b.w / 2, b.y + b.h / 2);
    const [x2, y2] = borderPoint(b, a.x + a.w / 2, a.y + a.h / 2);
    const L = Math.hypot(x2 - x1, y2 - y1), k = (L - 3) / L; // 머리가 상자에 묻히지 않게
    return [x1, y1, x1 + (x2 - x1) * k, y1 + (y2 - y1) * k];
  });
  return { pos, segs };
}

// 가운데 글자 줄들의 사각형(Canvas.text가 기록하는 것과 같은 식). 원 중심 (0,0) 기준.
function centerRects(lines) {
  const y0 = 5 - ((lines.length - 1) * LINE) / 2;
  return lines.map((l, k) => {
    const w = textWidth(l, FS, true);
    return { x: -w / 2, y: y0 + k * LINE - FS * 0.82, w, h: FS * 1.08, label: l, base: y0 + k * LINE };
  });
}

function layout(cv, spec) {
  const nodes = spec.nodes, n = nodes.length;
  const ms = nodes.map((nd) => measureNode(nd));
  const W = Math.max(...ms.map((m) => m.w)), H = Math.max(...ms.map((m) => m.h));
  // 이웃 상자 중심 거리(현의 길이)가 상자 대각선 + 40px 이상이 되게 반지름을 잡는다.
  let R = Math.max(80, (Math.hypot(W, H) + 40) / (2 * Math.sin(Math.PI / n)));
  const lines = spec.center ? wrap(spec.center, CENTER_MAX, FS, true) : [];
  const crs = centerRects(lines);
  if (crs.length) {
    // 화살표는 이웃 상자 중심을 잇는 현 위에 있고, 현은 중심에서 R·cos(π/n) 떨어져 있다.
    const bw = Math.max(...crs.map((r) => r.w)), bh = crs[crs.length - 1].y + crs[crs.length - 1].h - crs[0].y;
    R = Math.max(R, (Math.hypot(bw / 2, bh / 2) + CLEAR) / Math.cos(Math.PI / n));
    // 그래도 상자나 화살표에 닿으면(상자가 넓거나 높을 때) 닿지 않을 때까지 키운다.
    const touches = (g) => crs.some((c) => g.pos.some((b) => rectsHit(c, b, CLEAR)) || g.segs.some((s) => segHitsRect(...s, c, CLEAR)));
    for (let k = 0; k < 200 && touches(geometry(ms, W, H, R)); k++) R += 4;
  }
  const cx = MARGIN + W / 2 + R, cy = MARGIN + H / 2 + R;
  const g = geometry(ms, W, H, R);
  for (const [x1, y1, x2, y2] of g.segs) cv.line(cx + x1, cy + y1, cx + x2, cy + y2, "arrow");
  nodes.forEach((nd, i) => drawNode(cv, nd, cx + g.pos[i].x, cy + g.pos[i].y, g.pos[i].w, g.pos[i].h, ms[i]));
  for (const c of crs) {
    cv.text(cx, cy + c.base, c.label, { fs: FS, bold: true, fill: "var(--dg-general)", owner: "center" });
    if (g.segs.some((s) => segHitsRect(...s, c))) cv.warns.push(`화살표가 가운데 글자를 지나감: "${c.label}"`);
  }
  return { w: cx + R + W / 2 + MARGIN, h: cy + R + H / 2 + MARGIN };
}

function describe(spec, title) {
  const labels = spec.nodes.map((n) => n.label);
  return `${title} 순환: ${labels.join(" → ")} → 다시 ${labels[0]}.`;
}

module.exports = { validate, layout, describe, dual: () => false };
