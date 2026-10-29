// 일반 부품: 기존 요소(path·rect·line·circle·polygon·text)로 풀어 쓰는 매크로.
// expandPart(el, P) -> 요소 배열. 모든 부품은 픽셀 좌표로 동작한다(frame이 있어도 px로 그린다).
const r1 = n => +(+n).toFixed(1);
const num = d => d.replace(/-?\d*\.\d+|-?\d+/g, m => String(r1(+m)));

/** 단위 상자(-0.5..0.5, y 아래) 아이콘. p: path(M L C Q Z), c: 원 [x,y,r], l: 선 [x1,y1,x2,y2] */
export const ICONS = {
  person: { c: [[0, -0.34, 0.14]], p: ['M-0.22,0.5 L-0.22,-0.05 Q-0.22,-0.18 -0.1,-0.18 L0.1,-0.18 Q0.22,-0.18 0.22,-0.05 L0.22,0.5Z'] },
  drop: { p: ['M0,-0.5 C0.3,-0.1 0.38,0.1 0.38,0.2 C0.38,0.4 0.2,0.5 0,0.5 C-0.2,0.5 -0.38,0.4 -0.38,0.2 C-0.38,0.1 -0.3,-0.1 0,-0.5Z'] },
  cell: { p: ['M-0.5,0 C-0.5,-0.3 -0.3,-0.45 0,-0.45 C0.3,-0.45 0.5,-0.3 0.5,0 C0.5,0.3 0.3,0.45 0,0.45 C-0.3,0.45 -0.5,0.3 -0.5,0Z'], c: [[-0.08, 0, 0.18]] },
  sun: { c: [[0, 0, 0.2]], l: [[0, -0.5, 0, -0.32], [0, 0.32, 0, 0.5], [-0.5, 0, -0.32, 0], [0.32, 0, 0.5, 0], [-0.35, -0.35, -0.23, -0.23], [0.23, 0.23, 0.35, 0.35], [-0.35, 0.35, -0.23, 0.23], [0.23, -0.23, 0.35, -0.35]] },
  cloud: { p: ['M-0.35,0.25 C-0.55,0.25 -0.55,-0.05 -0.3,-0.05 C-0.3,-0.35 0.15,-0.4 0.2,-0.12 C0.5,-0.15 0.55,0.25 0.3,0.25Z'] },
  flask: { p: ['M-0.12,-0.5 L-0.12,-0.12 L-0.45,0.4 Q-0.5,0.5 -0.38,0.5 L0.38,0.5 Q0.5,0.5 0.45,0.4 L0.12,-0.12 L0.12,-0.5Z'], l: [[-0.2, -0.5, 0.2, -0.5]] },
  thermometer: { p: ['M-0.08,-0.5 L0.08,-0.5 L0.08,0.15 L-0.08,0.15Z'], c: [[0, 0.32, 0.18]] },
  resistor: { p: ['M-0.5,0 L-0.3,0 L-0.2,-0.22 L0,0.22 L0.2,-0.22 L0.3,0 L0.5,0'] },
  battery: { l: [[-0.5, 0, -0.1, 0], [-0.1, -0.3, -0.1, 0.3], [0.05, -0.18, 0.05, 0.18], [0.05, 0, 0.5, 0]] },
  bulb: { c: [[0, -0.1, 0.3]], p: ['M-0.15,0.2 L-0.15,0.4 L0.15,0.4 L0.15,0.2'] },
  bolt: { p: ['M0.1,-0.5 L-0.3,0.08 L-0.02,0.08 L-0.1,0.5 L0.3,-0.1 L0.02,-0.1Z'] },
  magnifier: { c: [[-0.12, -0.12, 0.28]], l: [[0.08, 0.08, 0.45, 0.45]] },
  mountain: { p: ['M-0.5,0.4 L-0.1,-0.3 L0.1,0 L0.25,-0.18 L0.5,0.4Z'] },
  gear: { c: [[0, 0, 0.22], [0, 0, 0.1]], l: [[0, -0.5, 0, -0.3], [0, 0.3, 0, 0.5], [-0.5, 0, -0.3, 0], [0.3, 0, 0.5, 0], [-0.35, -0.35, -0.21, -0.21], [0.21, 0.21, 0.35, 0.35], [-0.35, 0.35, -0.21, 0.21], [0.21, -0.21, 0.35, -0.35]] },
};

function scalePath(d, cx, cy, s) {
  let i = 0;
  return d.replace(/-?\d*\.\d+|-?\d+/g, v => { const n = +v * s; return String(r1(i++ % 2 === 0 ? cx + n : cy + n)); });
}

/** icon: name, at, size(기본 28), stroke/color, fill, width */
function icon(el) {
  const def = ICONS[el.name];
  if (!def) throw new Error(`icon: 알 수 없는 이름 "${el.name}" (가능: ${Object.keys(ICONS).join(', ')})`);
  const [cx, cy] = el.at, s = el.size ?? 28, st = { stroke: el.stroke ?? el.color, fill: el.fill, width: el.width ?? 1.5, obstacle: false, px: true };
  const out = [];
  for (const d of def.p || []) out.push({ type: 'path', d: scalePath(d, cx, cy, s), ...st });
  for (const [x, y, r] of def.c || []) out.push({ type: 'circle', center: [r1(cx + x * s), r1(cy + y * s)], r: r1(r * s), ...st });
  for (const [a, b, c, d] of def.l || []) out.push({ type: 'line', from: [r1(cx + a * s), r1(cy + b * s)], to: [r1(cx + c * s), r1(cy + d * s)], ...st, fill: undefined });
  return out;
}

/** vessel: 위가 열린 둥근 용기 x,y,w,h. level(0~1)이면 액체 채움(liquid 색), label은 아래. */
function vessel(el) {
  const { x, y, w, h } = el, r = Math.min(el.radius ?? 10, w / 2, h / 2), st = { px: true, obstacle: false };
  const out = [];
  if (el.level !== undefined) {
    const ly = y + h * (1 - el.level);
    out.push({ type: 'path', d: `M${x},${ly} L${x},${y + h - r} Q${x},${y + h} ${x + r},${y + h} L${x + w - r},${y + h} Q${x + w},${y + h} ${x + w},${y + h - r} L${x + w},${ly}Z`,
      stroke: 'none', fill: el.liquid ?? 'blue-f', fillOpacity: el.liquidOpacity ?? 0.85, ...st });
    out.push({ type: 'line', from: [x, ly], to: [x + w, ly], stroke: el.liquidLine ?? 'blue', width: 1.2, dash: '5 3', ...st });
  }
  out.push({ type: 'path', d: `M${x},${y} L${x},${y + h - r} Q${x},${y + h} ${x + r},${y + h} L${x + w - r},${y + h} Q${x + w},${y + h} ${x + w},${y + h - r} L${x + w},${y}`,
    stroke: el.stroke ?? el.color ?? 'fg', width: el.width ?? 2, px: true, obstacle: false });
  if (el.label) out.push({ type: 'text', at: [x + w / 2, y + h + 17], text: el.label, anchor: 'middle', px: true, ...el.labelStyle });
  return out;
}

/** pipe: points 꺾은선을 겹선(바깥 fg, 안쪽 inner)으로 그린 튜브. flow:true면 끝에 흐름 화살표. */
function pipe(el) {
  const w = el.width ?? 8, base = { px: true, points: el.points };
  const out = [
    { type: 'polyline', ...base, stroke: el.stroke ?? 'fg', width: w + 3, obstacle: false },
    { type: 'polyline', ...base, stroke: el.inner ?? 'bg', width: w, obstacle: false },
  ];
  if (el.flow) {
    const n = el.points.length, a = el.points[n - 2], b = el.points[n - 1];
    out.push({ type: 'arrow', from: a, to: b, stroke: el.flowColor ?? 'accent', width: 2.2, px: true, obstacle: false });
  }
  if (el.label) out.push({ type: 'text', at: el.points[Math.floor(el.points.length / 2)], text: el.label, anchor: 'middle', offset: el.labelOffset ?? [0, -w - 6], px: true, ...el.labelStyle });
  return out;
}

/** valve: at, size. open:false면 속을 채워 닫힌 밸브. */
function valve(el) {
  const [x, y] = el.at, s = el.size ?? 14, st = { px: true, obstacle: false };
  return [
    { type: 'polygon', points: [[x - s, y - s * 0.7], [x + s, y + s * 0.7], [x + s, y - s * 0.7], [x - s, y + s * 0.7]], stroke: el.stroke ?? 'fg', fill: el.open === false ? (el.fill ?? 'fg') : (el.fill ?? 'bg'), width: 1.6, ...st },
    { type: 'line', from: [x, y], to: [x, y - s * 1.3], width: 1.6, ...st },
    { type: 'line', from: [x - s * 0.45, y - s * 1.3], to: [x + s * 0.45, y - s * 1.3], width: 2.4, ...st },
  ];
}

/** blockArrow: 속이 찬 화살표(흐름·이동). from, to, width(몸통), head(머리 길이). */
function blockArrow(el) {
  const a = el.from, b = el.to, w = el.width ?? 12, head = el.head ?? w * 1.4;
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const hb = Math.max(0, L - head), q = (t, n) => [r1(a[0] + ux * t + nx * n), r1(a[1] + uy * t + ny * n)];
  const c = el.stroke ?? el.color ?? 'accent';
  return [{ type: 'polygon', px: true, points: [q(0, -w / 2), q(hb, -w / 2), q(hb, -w), q(L, 0), q(hb, w), q(hb, w / 2), q(0, w / 2)],
    stroke: c, fill: el.fill ?? c, fillOpacity: el.fillOpacity ?? 0.35, width: 1.4, obstacle: false }];
}

/** scale: from->to 선 위 min~max를 step 간격 눈금+숫자. side 1/-1로 눈금 방향, label은 가운데 바깥. */
function scale(el) {
  const a = el.from, b = el.to, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const side = el.side ?? 1, nx = -uy * side, ny = ux * side, step = el.step ?? (el.max - el.min), out = [], st = { px: true, obstacle: false };
  out.push({ type: 'line', from: a, to: b, width: 1.3, arrow: el.arrow, ...st });
  const n = Math.round((el.max - el.min) / step), size = el.size ?? 12;
  for (let i = 0; i <= n; i++) {
    const v = el.min + i * step, t = (v - el.min) / (el.max - el.min), p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    out.push({ type: 'line', from: p, to: [r1(p[0] + nx * 5), r1(p[1] + ny * 5)], width: 1.1, ...st });
    if (el.ticks !== false) out.push({ type: 'text', at: [r1(p[0] + nx * 9), r1(p[1] + ny * 9)], text: String(+v.toFixed(6)), size, color: 'muted',
      anchor: Math.abs(nx) > 0.5 ? (nx > 0 ? 'start' : 'end') : 'middle', offset: [0, Math.abs(ny) > 0.5 ? (ny > 0 ? size : 0) : size * 0.35], px: true, avoid: false, fixed: true });
  }
  if (el.label) {
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    out.push({ type: 'text', at: [r1(m[0] + nx * 34), r1(m[1] + ny * 34 + 4)], text: el.label, anchor: 'middle', px: true, ...el.labelStyle });
  }
  return out;
}

/** callout: 글자(at) + 지시선(target까지) + 끝점 점. */
function callout(el) {
  const c = el.stroke ?? 'muted', st = { px: true, obstacle: false };
  return [
    { type: 'text', at: el.at, text: el.text, anchor: el.anchor, size: el.size, weight: el.weight, color: el.textColor, offset: el.offset, fixed: true, avoid: false, px: true },
    { type: 'line', from: el.from ?? el.at, to: el.target, width: 0.9, stroke: c, ...st },
    { type: 'dot', at: el.target, r: 2.6, color: c, ...st },
  ];
}

/** lips: 윗입술·아랫입술 윤곽(중심 at, 폭 w, 높이 h). upperFill/lowerFill로 색 구분. */
function lips(el) {
  const [cx, cy] = el.at, w = el.w ?? 200, h = el.h ?? 90, x0 = cx - w / 2, x1 = cx + w / 2, st = { px: true };
  const mid = cy - h * 0.04, top = cy - h * 0.5, bot = cy + h * 0.5;
  const upper = `M${x0},${mid} C${x0 + w * 0.12},${mid - h * 0.12} ${cx - w * 0.3},${top + h * 0.1} ${cx - w * 0.12},${top} C${cx - w * 0.05},${top - h * 0.03} ${cx - w * 0.02},${top + h * 0.12} ${cx},${top + h * 0.15} C${cx + w * 0.02},${top + h * 0.12} ${cx + w * 0.05},${top - h * 0.03} ${cx + w * 0.12},${top} C${cx + w * 0.3},${top + h * 0.1} ${x1 - w * 0.12},${mid - h * 0.12} ${x1},${mid} C${x1 - w * 0.2},${mid + h * 0.08} ${cx + w * 0.3},${mid + h * 0.04} ${cx},${mid + h * 0.05} C${cx - w * 0.3},${mid + h * 0.04} ${x0 + w * 0.2},${mid + h * 0.08} ${x0},${mid}Z`;
  const lower = `M${x0},${mid} C${x0 + w * 0.2},${mid + h * 0.08} ${cx - w * 0.3},${mid + h * 0.04} ${cx},${mid + h * 0.05} C${cx + w * 0.3},${mid + h * 0.04} ${x1 - w * 0.2},${mid + h * 0.08} ${x1},${mid} C${x1 - w * 0.1},${mid + h * 0.3} ${cx + w * 0.3},${bot} ${cx},${bot} C${cx - w * 0.3},${bot} ${x0 + w * 0.1},${mid + h * 0.3} ${x0},${mid}Z`;
  const c = el.stroke ?? 'rose';
  return [
    { type: 'path', d: num(lower), stroke: c, fill: el.lowerFill ?? 'rose-f', width: 1.8, obstacle: false, ...st },
    { type: 'path', d: num(upper), stroke: c, fill: el.upperFill ?? 'rose-f', width: 1.8, obstacle: false, ...st },
  ];
}

const MAP = { icon, vessel, pipe, valve, blockArrow, scale, callout, lips };
export const PART_TYPES = Object.keys(MAP);
export const isPart = t => t in MAP;
export function expandPart(el) { return MAP[el.type](el); }
