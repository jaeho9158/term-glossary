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
    if (!e || typeof e !== "object") { errs.push(`timeline 사건 ${i + 1}이 객체가 아님`); return; }
    if (!e.when) errs.push(`timeline 사건 ${i + 1}에 when 없음`);
    if (!e.label) errs.push(`timeline 사건 ${i + 1}에 label 없음`);
    if (e.color && !COLORS.includes(e.color)) errs.push(`알 수 없는 color: ${e.color} (사건 ${i + 1})`);
  });
  if ((Array.isArray(spec.nodes) ? spec.nodes : []).length || (Array.isArray(spec.edges) ? spec.edges : []).length) errs.push("timeline은 nodes·edges 대신 events를 씀");
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
