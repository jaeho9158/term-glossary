// cycle: 끝이 처음으로 돌아오는 순환(탄소 순환, PDCA). 노드 3~6개를 원 위에 시계방향으로.
"use strict";
const { FS, MARGIN, validateNodes, measureNode, drawNode } = require("../core.js");

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
