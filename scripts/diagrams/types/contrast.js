// contrast: 좌우 대비. row 0이 머리, 1…이 비교 속성.
"use strict";
const { FS, FS_NOTE, MARGIN, r1, validateNodes, measureNode, drawNode } = require("../core.js");

function validate(spec) {
  const errs = validateNodes(spec);
  const rows = { left: new Set(), right: new Set() };
  for (const n of Array.isArray(spec.nodes) ? spec.nodes : []) {
    if (n.side !== "left" && n.side !== "right") errs.push(`contrast 노드에 side 없음: ${n.id}`);
    else if (!Number.isInteger(n.row)) errs.push(`contrast 노드에 row 없음: ${n.id}`);
    else rows[n.side].add(n.row);
  }
  const l = [...rows.left].sort().join(","), r = [...rows.right].sort().join(",");
  if (l !== r) errs.push(`contrast 좌우 행이 맞지 않음: [${l}] vs [${r}]`);
  if (!rows.left.has(0)) errs.push("contrast에 row 0(머리)이 없음");
  return errs;
}

function layout(cv, spec, orientation = "h") {
  const phone = orientation === "v"; // 휴대폰판: 열을 좁혀 343px 컬럼에 1:1로 들어가게 한다
  const side = { left: new Map(), right: new Map() };
  for (const n of spec.nodes) side[n.side].set(n.row, n);
  const rows = [...side.left.keys()].sort((a, b) => a - b);
  const all = spec.nodes.map((n) => [n, measureNode(n, phone ? 112 : 150)]);
  const mOf = new Map(all.map(([n, m]) => [n.id, m]));
  const colW = Math.max(phone ? 96 : 120, ...all.map(([, m]) => m.w));
  const gap = phone ? 34 : 44;
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

module.exports = { validate, layout, describe, // 가로판이 343px 컬럼보다 넓으면 휴대폰에서 줄어 글자가 10px 아래가 된다.
  dual: (spec, hw) => hw > 395 };
