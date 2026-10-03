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
