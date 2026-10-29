// 글자 가림 검사: 완성된 SVG 문자열에서 글자 경계상자가 도형(면·윤곽)·선·화살표·점에 가려지거나 걸치는 곳을 찾는다.
// 글자끼리의 겹침은 labels.js가 맡는다. 결과는 경고 목록(report.obscured)이며 기본으로 렌더를 막지 않는다.
// 예외(의도적 배경): 글자가 도형 안에 거의 통째로 들어 있고 그 도형이 글자보다 먼저 그려진 경우(라벨 배경 상자·소속 도형).
import { estimateTextWidth } from './markup.js';

const num = (s, d = 0) => { const v = parseFloat(s); return Number.isFinite(v) ? v : d; };
const attrs = tag => {
  const o = {}; const re = /([\w:-]+)="([^"]*)"/g; let m;
  while ((m = re.exec(tag))) o[m[1]] = m[2];
  return o;
};
const styleOf = (a, k) => { const m = new RegExp('(?:^|;)\\s*' + k + ':\\s*([^;]+)').exec(a.style || ''); return m ? m[1].trim() : (a[k] ?? null); };

function flattenPath(d) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const polys = []; let cur = null, i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lc = null;
  const n = () => parseFloat(toks[i++]);
  const push = (px, py) => { if (!cur) { cur = []; polys.push(cur); } cur.push([px, py]); x = px; y = py; };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++]; else if (cmd === 'M') cmd = 'L'; else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { if (cur) { cur.closed = true; x = sx; y = sy; } cur = null; lc = null; continue; }
    if (C === 'M') { const px = n() + ox, py = n() + oy; cur = null; push(px, py); sx = px; sy = py; lc = null; }
    else if (C === 'L') { push(n() + ox, n() + oy); lc = null; }
    else if (C === 'H') { push(n() + (rel ? x : 0), y); lc = null; }
    else if (C === 'V') { push(x, n() + (rel ? y : 0)); lc = null; }
    else if (C === 'C' || C === 'S' || C === 'Q' || C === 'T') {
      let p1, p2, p3;
      if (C === 'C') { p1 = [n() + ox, n() + oy]; p2 = [n() + ox, n() + oy]; p3 = [n() + ox, n() + oy]; lc = p2; }
      else if (C === 'S') { p1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]; p2 = [n() + ox, n() + oy]; p3 = [n() + ox, n() + oy]; lc = p2; }
      else {
        const q1 = C === 'Q' ? [n() + ox, n() + oy] : (lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]); const q2 = [n() + ox, n() + oy];
        p1 = [x + 2 / 3 * (q1[0] - x), y + 2 / 3 * (q1[1] - y)]; p2 = [q2[0] + 2 / 3 * (q1[0] - q2[0]), q2[1] + 2 / 3 * (q1[1] - q2[1])]; p3 = q2; lc = q1;
      }
      const x0 = x, y0 = y;
      for (let k = 1; k <= 10; k++) {
        const t = k / 10, u = 1 - t;
        push(u * u * u * x0 + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * y0 + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]);
      }
    } else if (C === 'A') {
      let rx = Math.abs(n()), ry = Math.abs(n()); const phi = n() * Math.PI / 180, fa = n(), fs = n(); const ex = n() + ox, ey = n() + oy;
      const x1 = x, y1 = y; lc = null;
      if (!rx || !ry || (x1 === ex && y1 === ey)) { push(ex, ey); continue; }
      const cp = Math.cos(phi), sp = Math.sin(phi), dx = (x1 - ex) / 2, dy = (y1 - ey) / 2;
      const xp = cp * dx + sp * dy, yp = -sp * dx + cp * dy;
      const lam = xp * xp / (rx * rx) + yp * yp / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      const sq = Math.max(0, (rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp) / (rx * rx * yp * yp + ry * ry * xp * xp));
      const co = (fa === fs ? -1 : 1) * Math.sqrt(sq), cxp = co * rx * yp / ry, cyp = -co * ry * xp / rx;
      const cx = cp * cxp - sp * cyp + (x1 + ex) / 2, cy = sp * cxp + cp * cyp + (y1 + ey) / 2;
      const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const th1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry); let dth = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
      if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
      const steps = Math.max(6, Math.ceil(Math.abs(dth) / (Math.PI / 12)));
      for (let k = 1; k <= steps; k++) {
        const t = th1 + dth * k / steps;
        push(cp * rx * Math.cos(t) - sp * ry * Math.sin(t) + cx, sp * rx * Math.cos(t) + cp * ry * Math.sin(t) + cy);
      }
    } else { i++; }
  }
  return polys;
}

const inPoly = (px, py, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};
function segHitsBox(s, b) {
  const [x1, y1, x2, y2] = s; let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  const P = [-dx, dx, -dy, dy], Q = [x1 - b.x0, b.x1 - x1, y1 - b.y0, b.y1 - y1];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) { if (Q[i] < 0) return false; }
    else { const t = Q[i] / P[i]; if (P[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); if (t0 > t1) return false; }
  }
  return true;
}
const polySegs = (p, close) => {
  const out = [];
  for (let i = 1; i < p.length; i++) out.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]);
  if (close && p.length > 2) out.push([p[p.length - 1][0], p[p.length - 1][1], p[0][0], p[0][1]]);
  return out;
};
const ellipsePoly = (cx, cy, rx, ry) => Array.from({ length: 36 }, (_, k) => [cx + rx * Math.cos(k * Math.PI / 18), cy + ry * Math.sin(k * Math.PI / 18)]);

/** 글자의 경계상자(위 0.8·아래 0.2 글자 크기, 좌우 0.8px 줄임). */
function textBox(a, raw) {
  const size = num(a['font-size'], 13);
  const text = raw.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  const w = estimateTextWidth(text, size), x = num(a.x), y = num(a.y), anc = a['text-anchor'] || 'start';
  const x0 = anc === 'middle' ? x - w / 2 : anc === 'end' ? x - w : x;
  let b = { x0: x0 + 0.8, x1: x0 + w - 0.8, y0: y - size * 0.8, y1: y + size * 0.2 };
  const rot = /rotate\(\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+))?/.exec(a.transform || '');
  if (rot) {
    const th = num(rot[1]) * Math.PI / 180, cx = rot[2] !== undefined ? num(rot[2]) : 0, cy = rot[3] !== undefined ? num(rot[3]) : 0;
    const cs = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([px, py]) => [cx + (px - cx) * Math.cos(th) - (py - cy) * Math.sin(th), cy + (px - cx) * Math.sin(th) + (py - cy) * Math.cos(th)]);
    b = { x0: Math.min(...cs.map(c => c[0])), x1: Math.max(...cs.map(c => c[0])), y0: Math.min(...cs.map(c => c[1])), y1: Math.max(...cs.map(c => c[1])) };
  }
  return { text, box: b };
}

// 선 끝이 글자 곁에 붙어 있으면(지시선·밑줄형 연결선) 가장자리 접촉은 허용한다.
const near = (g, b) => [[g[0], g[1]], [g[2], g[3]]].some(([x, y]) => x > b.x0 - 4 && x < b.x1 + 4 && y > b.y0 - 4 && y < b.y1 + 4);

const DEFS = new Set(['defs', 'clipPath', 'marker', 'linearGradient', 'radialGradient']);

/**
 * SVG 문자열 → 가림·걸침 목록 [{text, by, why}].
 * why: 'covered'(글자 뒤에 그려진 도형이 덮음), 'straddle'(글자가 도형 경계에 걸침), 'line'(선·윤곽이 글자를 지남).
 */
export function findObscured(svg) {
  const items = []; let order = 0, skip = 0, clip = 0; const stack = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>|<(\/?)(\w+)([^>]*?)(\/?)>/g; let m;
  while ((m = re.exec(svg))) {
    if (m[2] !== undefined) {
      if (!skip) items.push({ kind: 'text', order: order++, ...textBox(attrs(m[1]), m[2]) });
      continue;
    }
    const close = m[3], name = m[4], a = attrs(m[5]), selfClose = m[6];
    if (close) {
      if (DEFS.has(name)) skip = Math.max(0, skip - 1);
      else if (name === 'g') { if (stack.pop() === 'clip') clip--; }
      continue;
    }
    if (DEFS.has(name)) { if (!selfClose) skip++; continue; }
    if (skip) continue;
    if (name === 'g') { if (!selfClose) { const c = a['clip-path'] || a.class === 'si-rich' ? 'clip' : 'g'; stack.push(c); if (c === 'clip') clip++; } continue; }
    if (clip || a.class === 'si-leader' || num(a['stroke-opacity'], 1) < 0.4) continue; // 해칭·지시선·옅은 격자선은 배경으로 본다
    const fillRaw = styleOf(a, 'fill'), strokeRaw = styleOf(a, 'stroke');
    const filled = fillRaw !== 'none';
    const op = Math.min(num(a.opacity, 1), num(a['fill-opacity'], 1));
    const sw = strokeRaw && strokeRaw !== 'none' ? num(a['stroke-width'], 1) : 0;
    const arrow = !!(a['marker-end'] || a['marker-start']);
    const add = (poly, closed, isFill) => items.push({ kind: 'shape', order: order++, name, poly, filled: isFill, segs: polySegs(poly, closed), op, sw, arrow });
    if (name === 'rect') {
      const x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height);
      if (w > 0 && h > 0) add([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, filled);
    } else if (name === 'circle') add(ellipsePoly(num(a.cx), num(a.cy), num(a.r), num(a.r)), true, filled);
    else if (name === 'ellipse') add(ellipsePoly(num(a.cx), num(a.cy), num(a.rx), num(a.ry)), true, filled);
    else if (name === 'polygon' || name === 'polyline') {
      const nums = (a.points || '').match(/-?\d*\.?\d+/g) || []; const poly = [];
      for (let k = 0; k + 1 < nums.length; k += 2) poly.push([+nums[k], +nums[k + 1]]);
      if (poly.length >= 2) add(poly, name === 'polygon', filled && name === 'polygon');
    } else if (name === 'line') items.push({ kind: 'shape', order: order++, name, poly: [], filled: false, segs: [[num(a.x1), num(a.y1), num(a.x2), num(a.y2)]], op, sw, arrow });
    else if (name === 'path') for (const p of flattenPath(a.d || '')) add(p, !!p.closed, filled && !!p.closed);
  }
  const out = [], seen = new Set();
  const report = (t, by, why) => { const k = t.text + '|' + by + '|' + why; if (!seen.has(k)) { seen.add(k); out.push({ text: t.text, by, why, box: [t.box.x0, t.box.y0, t.box.x1, t.box.y1].map(Math.round) }); } };
  for (const t of items) {
    if (t.kind !== 'text' || !t.text.trim()) continue;
    const b = t.box, cols = 12, rows = 6, pts = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) pts.push([b.x0 + (b.x1 - b.x0) * (i + 0.5) / cols, b.y0 + (b.y1 - b.y0) * (j + 0.5) / rows]);
    for (const s of items) {
      if (s.kind !== 'shape') continue;
      const edgeHit = s.sw > 0 && s.segs.some(g => segHitsBox(g, b));
      if (s.filled) {
        const ratio = pts.filter(([px, py]) => inPoly(px, py, s.poly)).length / pts.length;
        if (s.order > t.order) { if (s.op >= 0.5 && (ratio > 0.05 || edgeHit)) report(t, s.name, 'covered'); }
        else if (ratio > 0.05 && ratio < 0.92) report(t, s.name, 'straddle');
        else if (ratio <= 0.05 && edgeHit) report(t, s.name, 'straddle');
      } else if (s.segs.some(g => segHitsBox(g, near(g, b) ? { x0: b.x0 + 2, x1: b.x1 - 2, y0: b.y0 + 3, y1: b.y1 - 3 } : b))) {
        // 글자보다 먼저 그려진 선이라도, 그 사이에 글자를 거의 통째로 덮는 불투명 면(라벨 배경·마커 원)이 있으면 가려져 보이지 않으므로 허용
        if (s.order < t.order && items.some(f => f.kind === 'shape' && f.filled && f.op >= 0.5 && f.order > s.order && f.order < t.order && pts.filter(([px, py]) => inPoly(px, py, f.poly)).length / pts.length >= 0.92)) continue;
        report(t, s.name, 'line');
      } else if (s.arrow && s.segs.some(g => !near(g, b) && segHitsBox(g, { x0: b.x0 - 4, x1: b.x1 + 4, y0: b.y0 - 4, y1: b.y1 + 4 }))) {
        report(t, s.name, 'near'); // 화살표가 다른 글자의 4px 안쪽을 지난다
      }
    }
  }
  return out;
}
