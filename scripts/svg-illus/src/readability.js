// 가독성 검사: 겹침이 없어도 읽기 불편한 그림을 찾는다(경고 목록, 렌더를 막지 않는다).
//  cross       점선·곡선이 다른 닫힌 도형 안쪽을 가로지름(끝점이 도형 경계에 닿는 의도된 연결은 허용)
//  script-*    첨자(dy/dx·baseline-shift 값, 작은 글자 따로)가 본 글자에서 글자크기 대비 너무 멀거나 높낮이가 과함
//  line-gap    한 라벨의 연속 줄 간격이 글자크기×1.5 초과
//  leader-long 지시선 길이 > 60px, leader-detached 지시선이 라벨 상자 가장자리에서 시작하지 않음
//  target-far  라벨과 가리키는 대상 사이가 80px 초과
import { num, attrs, styleOf, flattenPath, inPoly, polySegs, ellipsePoly, textBox, DEFS } from './obscure.js';

export const READ = { leaderMax: 60, targetMax: 80, lineGap: 1.5, scriptDy: 0.6 };

const distSeg = (px, py, [x1, y1, x2, y2]) => {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};
const distBox = (x, y, b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
const sample = (poly, step = 3) => {
  const out = [];
  for (let i = 1; i < poly.length; i++) {
    const [x1, y1] = poly[i - 1], [x2, y2] = poly[i], n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) out.push([x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n]);
  }
  return out;
};
const area = p => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;

/** SVG 문자열 → 가독성 경고 [{text, by, why, box}]. */
export function findReadability(svg) {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg), W = vb ? +vb[1] : 480, H = vb ? +vb[2] : 480;
  const texts = [], closed = [], opens = [], lines = [], dots = [], scriptTsp = [];
  let order = 0, skip = 0, clip = 0; const stack = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>|<(\/?)(\w+)([^>]*?)(\/?)>/g; let m;
  while ((m = re.exec(svg))) {
    if (m[2] !== undefined) {
      if (skip) continue;
      const a = attrs(m[1]), tb = textBox(a, m[2]);
      for (const t of m[2].matchAll(/<tspan\b([^>]*)>/g)) scriptTsp.push({ size: num(a['font-size'], 13), a: attrs(t[1]), text: tb.text });
      texts.push({ order: order++, ...tb, x: num(a.x), y: num(a.y), size: num(a['font-size'], 13), anchor: a['text-anchor'] || 'start', fill: styleOf(a, 'fill') || '', weight: a['font-weight'] || '' });
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
    const hatch = clip || a['clip-path'];
    const faint = num(a['stroke-opacity'], 1) < 0.4;
    const fillRaw = styleOf(a, 'fill'), strokeRaw = styleOf(a, 'stroke');
    const sw = strokeRaw && strokeRaw !== 'none' ? num(a['stroke-width'], 1) : 0;
    const dashed = !!a['stroke-dasharray'];
    const addClosed = poly => { if (!hatch && poly.length > 2 && area(poly) < W * H * 0.4 && (sw > 0 || (fillRaw !== 'none' && num(a.opacity, 1) >= 0.3))) closed.push({ name, poly, segs: polySegs(poly, true), order: order++ }); };
    if (name === 'rect') { const x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height); if (w > 0 && h > 0) addClosed([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); }
    else if (name === 'circle') { const r = num(a.r), cx = num(a.cx), cy = num(a.cy); if (r <= 4 && fillRaw !== 'none' && !hatch) dots.push([cx, cy]); else addClosed(ellipsePoly(cx, cy, r, r)); }
    else if (name === 'ellipse') addClosed(ellipsePoly(num(a.cx), num(a.cy), num(a.rx), num(a.ry)));
    else if (name === 'polygon') { const n = (a.points || '').match(/-?\d*\.?\d+/g) || []; const poly = []; for (let k = 0; k + 1 < n.length; k += 2) poly.push([+n[k], +n[k + 1]]); addClosed(poly); }
    else if (name === 'line') {
      const seg = [num(a.x1), num(a.y1), num(a.x2), num(a.y2)];
      if (!hatch && (!faint || a.class === 'si-leader')) lines.push({ seg, sw, leader: a.class === 'si-leader' });
      if (!hatch && !faint && a.class !== 'si-leader' && dashed) opens.push({ name, poly: [[seg[0], seg[1]], [seg[2], seg[3]]], dashed });
    } else if (name === 'path') {
      const d = a.d || '', curved = /[CSQTAcsqta]/.test(d);
      for (const p of flattenPath(d)) {
        if (p.closed) addClosed(p);
        else if (!hatch && !faint && p.length >= 2 && (dashed || curved) && fillRaw === 'none') opens.push({ name, poly: p, dashed });
      }
    }
  }
  const out = [], seen = new Set();
  const rep = (text, by, why, x, y) => { const k = text + '|' + by + '|' + why + '|' + Math.round(x / 4) + '|' + Math.round(y / 4); if (!seen.has(k)) { seen.add(k); out.push({ text, by, why, box: [x - 1, y - 1, x + 1, y + 1].map(Math.round) }); } };

  // (1) 점선·곡선이 다른 닫힌 도형 안쪽을 가로지름
  for (const o of opens) {
    const pts = sample(o.poly); if (pts.length < 3) continue;
    const e0 = pts[0], e1 = pts[pts.length - 1];
    for (const c of closed) {
      const inside = pts.map(([x, y]) => inPoly(x, y, c.poly));
      const nIn = inside.filter(Boolean).length;
      if (nIn < 3 || nIn === inside.length) continue;
      let flips = 0; for (let i = 1; i < inside.length; i++) if (inside[i] !== inside[i - 1]) flips++;
      const touch = ([x, y]) => c.segs.some(g => distSeg(x, y, g) <= 3);
      if (flips >= 2 || !(touch(e0) || touch(e1))) { const k = inside.findIndex(Boolean); rep((o.dashed ? '점선 ' : '곡선 ') + o.name, c.name, 'cross', pts[k][0], pts[k][1]); break; }
    }
  }

  // (2) 첨자 이동량
  for (const t of scriptTsp) {
    for (const k of ['dy', 'dx']) {
      const v = t.a[k]; if (v === undefined) continue;
      const px = /em$/.test(v) ? num(v) * t.size : num(v);
      if (Math.abs(px) > t.size * READ.scriptDy) rep(t.text, 'tspan', 'script-offset', 0, 0);
    }
    const bs = t.a['baseline-shift'];
    if (bs && !/^(sub|super|baseline)$/.test(bs)) { const px = /%$/.test(bs) ? num(bs) / 100 * t.size : num(bs); if (Math.abs(px) > t.size * READ.scriptDy) rep(t.text, 'tspan', 'script-offset', 0, 0); }
  }
  for (const a of texts) for (const b of texts) {
    if (a === b || b.size > a.size * 0.85 || b.size < a.size * 0.4 || !a.text.trim() || !b.text.trim() || b.text.length > 6) continue;
    const gap = (b.box.x0 - 0.8) - (a.box.x1 + 0.8), dy = b.y - a.y;
    if (gap > -3 && gap < 8 && Math.abs(dy) > 0.12 * a.size && Math.abs(dy) < a.size) {
      if (Math.abs(dy) > a.size * READ.scriptDy) rep(a.text + b.text, 'text', 'script-offset', b.x, b.y);
      else if (gap > 3) rep(a.text + b.text, 'text', 'script-gap', b.x, b.y);
    }
  }

  // (3) 한 라벨 줄 간격
  for (let i = 1; i < texts.length; i++) {
    const p = texts[i - 1], q = texts[i], g = q.y - p.y;
    if (p.size !== q.size || p.anchor !== q.anchor || p.fill !== q.fill || p.weight !== q.weight || Math.abs(p.x - q.x) > 1.5 || !p.text.trim() || !q.text.trim()) continue;
    if (g > p.size * READ.lineGap + 0.5 && g <= p.size * 2.4) rep(p.text + ' / ' + q.text, 'text', 'line-gap', q.x, q.y);
  }

  // (4)(5) 지시선: si-leader 또는 끝에 작은 점이 있는 가는 선
  const nearest = (x, y) => { let best = null; for (const t of texts) { if (!t.text.trim()) continue; const d = distBox(x, y, t.box); if (!best || d < best.d) best = { d, t }; } return best; };
  const dotAt = (x, y) => dots.some(([cx, cy]) => Math.hypot(cx - x, cy - y) <= 1.5);
  for (const l of lines) {
    const [x1, y1, x2, y2] = l.seg, len = Math.hypot(x2 - x1, y2 - y1);
    if (!l.leader && !(l.sw <= 1.2 && len >= 6 && (dotAt(x1, y1) || dotAt(x2, y2)))) continue;
    const n1 = nearest(x1, y1), n2 = nearest(x2, y2); if (!n1 || !n2) continue;
    let lab;
    if (dotAt(x1, y1) !== dotAt(x2, y2)) lab = dotAt(x1, y1) ? { n: n2, o: [x1, y1] } : { n: n1, o: [x2, y2] };
    else lab = n1.d <= n2.d ? { n: n1, o: [x2, y2] } : { n: n2, o: [x1, y1] };
    const [tx, ty] = lab.o;
    if (lab.n.d > 6) { if (l.leader || lab.n.d <= 40) rep(lab.n.t.text, 'leader', 'leader-detached', tx, ty); continue; }
    if (distBox(tx, ty, lab.n.t.box) < 8) continue; // 대상이 라벨 바로 곁
    if (len > READ.targetMax) rep(lab.n.t.text, 'leader', 'target-far', tx, ty);
    else if (len > READ.leaderMax) rep(lab.n.t.text, 'leader', 'leader-long', tx, ty);
  }
  return out;
}
