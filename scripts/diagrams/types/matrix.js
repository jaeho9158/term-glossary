// matrix: 두 기준으로 나눈 2×2(1종·2종 오류, 위험 매트릭스).
// 축 이름은 회전하지 않고 가로로 쓴다(회전 글자는 겹침 검사가 어렵다).
"use strict";
const { FS_SUB, FS_NOTE, MARGIN, AXIS_COLOR: AXIS, textWidth, validateNodes, measureNode, drawNode } = require("../core.js");

const CELLS = ["tl", "tr", "bl", "br"];
const AT = { tl: [0, 0], tr: [1, 0], bl: [0, 1], br: [1, 1] };

function validate(spec) {
  const errs = validateNodes(spec);
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
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
  if ((Array.isArray(spec.edges) ? spec.edges : []).length) errs.push("matrix는 edges를 쓰지 않음");
  return errs;
}

function layout(cv, spec) {
  const { x: ax, y: ay } = spec.axes;
  const ms = new Map(spec.nodes.map((n) => [n.id, measureNode(n, 150)]));
  // 칸 폭은 x축 low·high 글자(칸 가운데 아래에 쓴다)도 담아야 이웃 칸 글자와 안 겹친다.
  const CW = Math.max(140, ...[...ms.values()].map((m) => m.w), ...[ax.low, ax.high].map((t) => textWidth(t, FS_SUB) + 12));
  const CH = Math.max(56, ...[...ms.values()].map((m) => m.h));
  const G = 8;
  const yLabW = Math.max(textWidth(ay.high, FS_SUB), textWidth(ay.low, FS_SUB));
  const xA = MARGIN + yLabW + 12; // y축 선
  const x0 = xA + 10; // 격자 왼쪽
  const top = MARGIN + FS_NOTE + 10;
  cv.text(MARGIN, MARGIN + FS_NOTE, ay.label, { fs: FS_NOTE, bold: true, fill: AXIS, anchor: "start", owner: "axis-y" });
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
  cv.text((x0 + gridR) / 2, xLabY, ax.label, { fs: FS_NOTE, bold: true, fill: AXIS, owner: "axis-x" });
  const w = Math.max(gridR + MARGIN + 6, MARGIN * 2 + textWidth(ay.label, FS_NOTE, true));
  return { w, h: xLabY + 4 };
}

function describe(spec, title) {
  const { x: ax, y: ay } = spec.axes;
  const at = Object.fromEntries(spec.nodes.map((n) => [n.cell, n.label]));
  return `${title}: 가로 ${ax.label}(${ax.low}→${ax.high}), 세로 ${ay.label}(${ay.low}→${ay.high})로 나눈 네 칸. ` +
    `왼쪽 위 ${at.tl}, 오른쪽 위 ${at.tr}, 왼쪽 아래 ${at.bl}, 오른쪽 아래 ${at.br}.`;
}

module.exports = { validate, layout, describe, dual: () => false };
