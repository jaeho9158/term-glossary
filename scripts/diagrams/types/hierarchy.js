// hierarchy: 포함·분류 트리. 가로 트리 + 좁은 화면용 아웃라인.
"use strict";
const { MARGIN, r1, validateNodes, measureNode, drawNode } = require("../core.js");

// 가로판이 이 폭을 넘으면 세로판(아웃라인)을 함께 넣는다. 모바일 본문 폭(~360px)에
// 들어갈 때 가장 작은 글자(11.5px)가 10px 아래로 줄어드는 지점.
const HIERARCHY_DUAL_MIN_W = 395; // 395px 폭이면 343px 컬럼에서 11.5px 글자가 10px로 줄어든다

function validate(spec) {
  const errs = validateNodes(spec);
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
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
