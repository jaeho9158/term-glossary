// 도해 템플릿: 매개변수 → 스펙. 사용자는 좌표 계산 없이 부품·점·함수만 적는다.
// 스펙으로 쓸 때: {"template": "functionPlot", "params": {...}, "title": "...", "legend": [...]}

const box = (x, y, w, h) => ({ x, y, w, h });

/** 상자 중심→다른 점 방향 선이 상자 테두리와 만나는 점. */
function edgePoint(b, tx, ty, pad = 2) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const sx = (b.w / 2 + pad) / Math.abs(dx || 1e-9), sy = (b.h / 2 + pad) / Math.abs(dy || 1e-9);
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

/**
 * 단면도(부품 라벨). parts: [{name, x,y,w,h, fill?:'blue'…, fillOpacity?, hatch?:true|{angle,gap}, label?:false, labelSide?:'top'|'bottom'|'left'|'right'}]
 * 라벨은 부품 바깥(기본 위·아래 번갈아)에 두고 지시선으로 잇는다. extra: 추가 요소.
 */
export function crossSection({ width = 520, height = 300, parts = [], arrows = [], extra = [], labelGap = 26 } = {}) {
  const els = [];
  parts.forEach((p, i) => {
    if (p.hatch) els.push({ type: 'hatch', x: p.x, y: p.y, w: p.w, h: p.h, px: true, ...(typeof p.hatch === 'object' ? p.hatch : {}) });
    else els.push({ type: 'rect', x: p.x, y: p.y, w: p.w, h: p.h, px: true, fill: p.fill ?? 'none', fillOpacity: p.fillOpacity ?? (p.fill ? 0.3 : undefined), stroke: p.stroke ?? 'fg', width: p.width ?? 1.2 });
  });
  // 라벨: 전체 외곽 오른쪽(또는 labelSide:'left'면 왼쪽) 세로 열에 위에서부터 늘어놓고,
  // 각 부품의 '자기 영역'(안쪽 부품에 덮이지 않는 위 가장자리 근처) 한 점으로 지시선을 긋는다.
  const L = parts.filter(p => p.label !== false);
  const minX = Math.min(...parts.map(p => p.x)), maxX = Math.max(...parts.map(p => p.x + p.w));
  const minY = Math.min(...parts.map(p => p.y)), maxY = Math.max(...parts.map(p => p.y + p.h));
  const step = Math.max(18, (maxY - minY) / Math.max(1, L.length - 1));
  const sides = { left: [], right: [] };
  for (const p of L) sides[p.labelSide === 'left' ? 'left' : 'right'].push(p);
  for (const [side, list] of Object.entries(sides)) list.forEach((p, i) => {
    const inner = Math.min(6, p.h / 2);
    const tx = side === 'right' ? p.x + p.w - 8 - i * 6 : p.x + 8 + i * 6, ty = p.y + inner;
    const at = [side === 'right' ? maxX + labelGap : minX - labelGap, minY + i * step + 4];
    els.push({ type: 'text', at, text: p.name, anchor: side === 'right' ? 'start' : 'end', size: 12, px: true, leader: [tx, ty] });
    els.push({ type: 'dot', at: [tx, ty], r: 1.8, color: 'fg', px: true, obstacle: false });
  });
  for (const a of arrows) els.push({ type: 'arrow', px: true, width: 2, ...a });
  return { width, height, elements: [...els, ...extra] };
}

/**
 * 기하 도형 + 각도. points: {A:[x,y]…}(수학 좌표, y 위로), polygons: [['A','B','C']], segments: [['A','C', {dash:true}]],
 * angles: [{at:'B', from:'A', to:'C', label:'θ', r?}], rightAngles: [{at, from, to}], pointLabels: true
 */
export function geometry({ width = 480, height = 320, points = {}, polygons = [], segments = [], angles = [], rightAngles = [], pointLabels = true, pad = 40, extra = [] } = {}) {
  const P = Object.values(points);
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min((width - 2 * pad) / ((x1 - x0) || 1), (height - 2 * pad) / ((y1 - y0) || 1));
  const ox = (width - (x1 - x0) * k) / 2 - x0 * k, oy = (height + (y1 - y0) * k) / 2 + y0 * k;
  const els = [];
  for (const poly of polygons) els.push({ type: 'polygon', points: poly, fill: 'accent', fillOpacity: 0.08, stroke: 'fg', width: 1.6 });
  for (const [a, b, st] of segments) els.push({ type: 'line', from: a, to: b, ...(st || {}) });
  for (const g of angles) els.push({ type: 'arc', center: g.at, between: [g.from, g.to], r: g.r ?? 26, stroke: 'accent', width: 1.6, label: g.label, labelStyle: { color: 'accent', weight: 700 } });
  for (const g of rightAngles) {
    const c = points[g.at], u = points[g.from], v = points[g.to];
    els.push({ type: 'rightAngle', at: g.at, dir1: [u[0] - c[0], u[1] - c[1]], dir2: [v[0] - c[0], v[1] - c[1]] });
  }
  if (pointLabels) {
    const cx = xs.reduce((s, v) => s + v, 0) / P.length, cy = ys.reduce((s, v) => s + v, 0) / P.length;
    for (const [name, p] of Object.entries(points)) {
      const dx = p[0] - cx, dy = p[1] - cy, n = Math.hypot(dx, dy) || 1;
      els.push({ type: 'dot', at: name, r: 3, color: 'fg' });
      els.push({ type: 'text', at: name, text: name, italic: true, anchor: 'middle', size: 14, offset: [dx / n * 14, -dy / n * 14 + 5] });
    }
  }
  return { width, height, frame: { origin: [ox, oy], scale: k }, points, elements: [...els, ...extra] };
}

/**
 * 좌표 평면 + 함수. x:[min,max], y:[min,max], fns: [{expr:'sin(x)', label, color, domain?}],
 * points: [{at:[x,y], label}], shade: [{expr, from, to, color}](곡선과 x축 사이 음영), grid
 */
export function functionPlot({ width = 480, height = 320, x = [-5, 5], y = [-3, 3], fns = [], points = [], shade = [], grid = true, xLabel, yLabel, extra = [] } = {}) {
  const els = [];
  const series = ['accent', 'rose', 'green', 'violet'];
  for (const s of shade) els.push({ type: 'shade', ...s }); // 아래 expandShade가 다각형으로 푼다
  fns.forEach((f, i) => els.push({ type: 'curve', fn: f.expr, domain: f.domain || x, stroke: f.color || series[i % series.length], label: f.label, labelAt: f.labelAt, width: 2.2 }));
  for (const p of points) {
    els.push({ type: 'dot', at: p.at, r: 3.5, color: p.color || 'fg' });
    if (p.label) els.push({ type: 'text', at: p.at, text: p.label, offset: [6, -6] });
  }
  return { width, height, axes: { x: { min: x[0], max: x[1], label: xLabel }, y: { min: y[0], max: y[1], label: yLabel }, grid }, elements: expandShade([...els, ...extra]) };
}

import { compileFn } from './render.js';
function expandShade(els) {
  return els.map(e => {
    if (e.type !== 'shade') return e;
    const fn = compileFn(e.expr), n = 80, pts = [[e.from, 0]];
    for (let i = 0; i <= n; i++) { const x = e.from + (e.to - e.from) * i / n; pts.push([x, fn(x)]); }
    pts.push([e.to, 0]);
    return { type: 'polygon', points: pts, fill: e.color || 'accent', fillOpacity: e.opacity ?? 0.18, stroke: 'none', obstacle: false };
  });
}

/**
 * 라벨 있는 구조도(블록·흐름). nodes: [{id, text, sub?, at:[cx,cy], w?, h?, color?}], edges: [{from, to, label?, dash?}]
 * numbered: true면 노드 왼쪽 위에 번호 마커를 달고, table 행과 짝지을 수 있다.
 */
export function structure({ width = 560, height = 260, nodes = [], edges = [], numbered = false, nodeW = 120, nodeH = 46, extra = [] } = {}) {
  const els = [], B = {};
  nodes.forEach((n, i) => {
    const w = n.w ?? nodeW, h = n.h ?? nodeH, b = box(n.at[0] - w / 2, n.at[1] - h / 2, w, h); B[n.id] = b;
    const color = n.color || 'blue';
    els.push({ type: 'rect', x: b.x, y: b.y, w, h, px: true, radius: 6, fill: color + '-f', stroke: color, width: 1.1 });
    els.push({ type: 'text', at: [n.at[0], n.at[1] + (n.sub ? -2 : 4.5)], text: n.text, anchor: 'middle', weight: 700, color: color + '-t', avoid: false, px: true });
    if (n.sub) els.push({ type: 'text', at: [n.at[0], n.at[1] + 14], text: n.sub, anchor: 'middle', size: 11.5, color: color + '-t', avoid: false, px: true });
    if (numbered) els.push({ type: 'marker', at: [b.x + 2, b.y + 2], n: i + 1, px: true, fill: 'navy', textColor: 'badge-t' });
  });
  for (const e of edges) {
    const a = B[e.from], b = B[e.to];
    if (!a || !b) throw new Error(`structure: 없는 노드 ${e.from}→${e.to}`);
    const p = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2), q = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2, 3);
    els.push({ type: 'arrow', from: p, to: q, px: true, stroke: e.kind === 'inhibit' ? 'limit' : 'navy', width: 1.5, dash: e.dash, label: e.label, labelStyle: { size: 11.5, weight: 700, color: 'navy' } });
  }
  return { width, height, elements: [...els, ...extra] };
}

/** 단계 흐름(활동 과정 등): steps를 가로 한 줄(넘치면 줄바꿈)로 늘어놓고 화살표로 잇는다. */
export function flow({ steps = [], perRow = 4, gap = 34, nodeW = 116, nodeH = 52, numbered = true, colors } = {}) {
  const rows = Math.ceil(steps.length / perRow), width = perRow * nodeW + (perRow - 1) * gap + 48, height = rows * (nodeH + 50) + 30;
  const nodes = steps.map((s, i) => {
    const r = Math.floor(i / perRow), c = r % 2 ? perRow - 1 - (i % perRow) : i % perRow; // 지그재그
    const st = typeof s === 'string' ? { text: s } : s;
    return { id: 's' + i, ...st, at: [24 + c * (nodeW + gap) + nodeW / 2, 30 + r * (nodeH + 50) + nodeH / 2], w: nodeW, h: nodeH, color: st.color || (colors ? colors[i % colors.length] : 'blue') };
  });
  const edges = nodes.slice(1).map((n, i) => ({ from: 's' + i, to: n.id }));
  return structure({ width, height, nodes, edges, numbered });
}

export const templates = { crossSection, geometry, functionPlot, structure, flow };
