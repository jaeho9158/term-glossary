// 교과서 삽화풍 만화 장면: 칸(panel) 1~4개, 배경, 등장인물, 말풍선(말·생각·빈), 칸 아래 캡션.
// part `scene`으로 펼쳐지고, 템플릿 `cartoon`은 칸 수·캡션에 맞춰 그림 크기를 계산해 준다.
import { CHARACTERS, POSES, EXPRESSIONS, ARMS, OUTFITS, HOLDS, VIEWS, placeCharacter } from './characters.js';

const r1 = n => +(+n).toFixed(1);
export const BACKGROUNDS = ['none', 'classroom', 'street', 'hospital'];
export const BUBBLE_KINDS = ['talk', 'thought', 'empty'];
export const PROPS = ['desk', 'bed'];
const BED_TOP = 46; // 침대 매트 윗면 높이(바닥 위)
const D = { panelWidth: 340, panelHeight: 320, gap: 14, fontSize: 14, maxLines: 5, bubbleMax: 156 };
const PAD_X = 11, PAD_Y = 8, GAP = 8;
const lineH = fs => Math.round(fs * 1.38);

/** 실제 글꼴(한글 약 0.87em)에 가까운 폭 추정. markup의 textWidth(한글 1em)는 다른 그림이 쓰므로 그대로 둔다. */
export function textWidth(s, size) {
  let w = 0;
  for (const ch of String(s)) w += size * (/[ᄀ-ᇿ㄰-㆏가-힣一-鿿]/.test(ch) ? 0.9 : ch === ' ' ? 0.28 : /[il.,:;|'!·…()]/.test(ch) ? 0.34 : /[A-Z]/.test(ch) ? 0.68 : 0.58);
  return w;
}

/** 줄 수는 그대로 두고 폭을 좁혀 줄 길이를 고르게(마지막 줄에 낱말 하나만 남는 일 방지). */
export function wrapText(text, size, maxW) {
  const lines = wrapRaw(text, size, maxW);
  if (lines.length < 2) return lines;
  let best = lines;
  for (let w = maxW - 4; w > maxW * 0.45; w -= 4) { const l = wrapRaw(text, size, w); if (l.length !== lines.length) break; best = l; }
  return best;
}

/** 낱말 단위 줄바꿈(긴 낱말은 글자 단위로 자름). "\n"은 강제 줄바꿈. */
function wrapRaw(text, size, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = cur ? cur + ' ' + word : word;
      if (textWidth(t, size) <= maxW) { cur = t; continue; }
      if (cur) lines.push(cur);
      cur = '';
      for (const ch of word) { if (textWidth(cur + ch, size) > maxW && cur) { lines.push(cur); cur = ''; } cur += ch; }
    }
    lines.push(cur);
  }
  return lines;
}

function opts(s) { return { ...D, ...Object.fromEntries(Object.entries(s).filter(([k]) => k in D)) }; }

/** 칸 배치. 반환 [{x,y,w,h,floor,capLines}] (scene.at 기준 절대 좌표) 와 전체 크기. */
export function sceneLayout(s) {
  const o = opts(s), n = s.panels.length, cols = Math.min(s.cols ?? 1, n), rows = Math.ceil(n / cols), [ox, oy] = s.at ?? [2, 2];
  const cap = s.panels.map(p => p.caption ? wrapText(p.caption, o.fontSize, o.panelWidth - 16) : []);
  const capH = Array.from({ length: rows }, (_, r) => Math.max(0, ...cap.slice(r * cols, r * cols + cols).map(l => l.length ? l.length * lineH(o.fontSize) + 10 : 0)));
  const panels = []; let y = oy;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols && r * cols + c < n; c++) {
      const x = ox + c * (o.panelWidth + o.gap);
      panels.push({ x, y, w: o.panelWidth, h: o.panelHeight, floor: y + o.panelHeight - 20, capLines: cap[r * cols + c] });
    }
    y += o.panelHeight + capH[r] + (r < rows - 1 ? o.gap : 0);
  }
  return { panels, width: cols * o.panelWidth + (cols - 1) * o.gap, height: y - oy, o };
}

function background(kind, P) {
  const { x, y, w, h, floor } = P, st = { stroke: 'none', px: true, obstacle: false };
  if (kind === 'classroom') return [
    { type: 'rect', x, y, w, h, fill: 'gray-f', ...st },
    { type: 'rect', x, y: floor - 8, w, h: y + h - floor + 8, fill: 'border', ...st },
    { type: 'rect', x: x + 18, y: y + 26, w: w * 0.46, h: 84, radius: 3, fill: 'green-f', ...st, stroke: 'green-s', width: 1.2, opacity: 0.8 },
    { type: 'rect', x: x + w - 92, y: y + 26, w: 70, h: 84, radius: 3, fill: 'blue-f', ...st, stroke: 'gray-s', width: 1.2 },
    { type: 'path', d: `M${x + w - 57},${y + 26} L${x + w - 57},${y + 110} M${x + w - 92},${y + 68} L${x + w - 22},${y + 68}`, ...st, stroke: 'gray-s', width: 1.2 },
  ];
  if (kind === 'street') {
    const b = [[0.02, 0.38, 120], [0.36, 0.26, 160], [0.58, 0.22, 100], [0.76, 0.24, 140]];
    const out = [{ type: 'rect', x, y, w, h, fill: 'blue-f', ...st, opacity: 0.7 }];
    for (const [fx, fw, bh] of b) {
      const bx = x + fx * w, bw = fw * w, by = floor - 14 - bh;
      out.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, fill: 'gray-f', ...st, stroke: 'gray-s', width: 1 });
      for (let wy = by + 14; wy < floor - 34; wy += 26) for (let wx = bx + 10; wx < bx + bw - 18; wx += 22)
        out.push({ type: 'rect', x: wx, y: wy, w: 12, h: 14, fill: 'blue-f', ...st, stroke: 'gray-s', width: 0.8 });
    }
    out.push({ type: 'rect', x, y: floor - 14, w, h: y + h - floor + 14, fill: 'border', ...st },
      { type: 'path', d: `M${x},${floor - 14} L${x + w},${floor - 14}`, ...st, stroke: 'gray-s', width: 1.2 });
    return out;
  }
  if (kind === 'hospital') return [
    { type: 'rect', x, y, w, h, fill: 'blue-f', ...st, opacity: 0.45 },
    { type: 'rect', x, y: floor - 8, w, h: y + h - floor + 8, fill: 'border', ...st },
    { type: 'rect', x: x + w - 96, y: y + 24, w: 72, h: 80, radius: 3, fill: 'blue-f', ...st, stroke: 'gray-s', width: 1.2 },
    { type: 'path', d: `M${x + w - 60},${y + 24} L${x + w - 60},${y + 104}`, ...st, stroke: 'gray-s', width: 1.2 },
    { type: 'path', d: `M${x + 14},${y + 16} L${x + 70},${y + 16}`, ...st, stroke: 'gray-s', width: 2 },
    { type: 'path', d: `M${x + 18},${y + 16} L${x + 18},${floor - 30} Q${x + 30},${floor - 22} ${x + 42},${floor - 30} L${x + 42},${y + 16}Z`, ...st, fill: 'green-f', stroke: 'green-s', width: 1.1 },
    { type: 'rect', x: x + 150, y: y + 30, w: 34, h: 34, radius: 4, fill: 'bg', ...st, stroke: 'gray-s', width: 1.2 },
    { type: 'path', d: `M${x + 167},${y + 37} L${x + 167},${y + 57} M${x + 157},${y + 47} L${x + 177},${y + 47}`, ...st, stroke: 'rose-s', width: 5 },
  ];
  return [];
}

function prop(p, P) {
  const line = { stroke: 'fg', width: 1.6, px: true, obstacle: false };
  if (p.type === 'bed') {
    const w = p.w ?? 190, x0 = P.x + p.x - w / 2, top = P.floor - BED_TOP;
    return [
      { type: 'path', d: `M${x0 + 14},${top + 14} L${x0 + 14},${P.floor} M${x0 + w - 8},${top + 14} L${x0 + w - 8},${P.floor}`, ...line, width: 2.4 },
      { type: 'rect', x: x0, y: top - 34, w: 9, h: 34 + BED_TOP, radius: 2, fill: 'gray-s', ...line },
      { type: 'rect', x: x0 + 6, y: top + 6, w: w - 6, h: 10, radius: 2, fill: 'gray-f', ...line },
      { type: 'rect', x: x0 + 6, y: top, w: w - 6, h: 8, radius: 3, fill: 'bg', ...line },
    ];
  }
  const w = p.w ?? 120, x0 = P.x + p.x - w / 2, top = P.floor - 64;
  return [
    { type: 'rect', x: x0 + 6, y: top + 6, w: w - 12, h: 64 - 6, fill: 'amber-f', ...line },
    { type: 'rect', x: x0, y: top, w, h: 8, radius: 2, fill: 'amber-s', ...line },
  ];
}

/** 말풍선 크기. */
function bubbleBox(b, o) {
  if (b.kind === 'empty') return { w: b.w ?? 120, h: b.h ?? 50, lines: [] };
  const lines = wrapText(b.text ?? '', o.fontSize, o.bubbleMax - 2 * PAD_X);
  const tw = Math.max(...lines.map(l => textWidth(l, o.fontSize)));
  return { w: Math.max(54, Math.ceil(tw) + 2 * PAD_X + (b.kind === 'thought' ? 16 : 0)), h: lines.length * lineH(o.fontSize) + 2 * PAD_Y + (b.kind === 'thought' ? 12 : 0), lines };
}

const TAIL_MAX = 64; // 생각·빈 말풍선 꼬리 최대 길이
const overlapX = (a, b) => a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP;

/** 꼬리: 말풍선 아래 변의 밑점 → 말하는 사람 머리 위 끝점. */
function tailOf(it) {
  const { x, y, w, h, b, sp } = it;
  if (!sp) return null;
  const tip = [sp.head[0] + sp.face * sp.r * 0.3, sp.top - 3], m = b.kind === 'thought' ? 16 : 18;
  return { tip, base: [Math.min(Math.max(tip[0] - (b.kind === 'thought' ? 0 : sp.face * 6), x + m), x + w - m), y + h] };
}
const crosses = (t, r, m = 3) => { for (let k = 1; k < 20; k++) { const u = k / 20, px = t.base[0] + (t.tip[0] - t.base[0]) * u, py = t.base[1] + (t.tip[1] - t.base[1]) * u; if (px > r.x - m && px < r.x + r.w + m && py > r.y - m && py < r.y + r.h + m) return true; } return false; };

/** 줄 배정 rowOf로 말풍선을 놓는다. 반환 {items, over, cross, cost}. */
function arrange(base, rowOf, chars, P) {
  const items = base.map((it, k) => ({ ...it, row: rowOf[k] })), L0 = P.x + 8, R0 = P.x + P.w - 8;
  for (const row of [...new Set(rowOf)].map(r => items.filter(it => it.row === r).sort((a, b) => a.x - b.x))) {
    if (row.reduce((s, p) => s + p.w + 2 * GAP, -2 * GAP) > R0 - L0) return null;
    // 1차원 밀기: 오른쪽으로 민 뒤 칸 오른끝에서 왼쪽으로
    for (let i = 1; i < row.length; i++) row[i].x = Math.max(row[i].x, row[i - 1].x + row[i - 1].w + 2 * GAP);
    for (let i = row.length - 1; i >= 0; i--) row[i].x = Math.min(row[i].x, (i < row.length - 1 ? row[i + 1].x - 2 * GAP : R0) - row[i].w);
  }
  // 세로: 겹치는 인물 머리 위, 아랫줄 말풍선 위
  let over = 0;
  for (const it of [...items].sort((a, b) => a.row - b.row)) {
    let bottom = it.sp ? it.sp.top - 16 : P.y + 60;
    for (const c of Object.values(chars)) if (c.head[0] + c.r > it.x - 4 && c.head[0] - c.r < it.x + it.w + 4) bottom = Math.min(bottom, c.top - 6);
    for (const p of items) if (p.row < it.row && p.y !== undefined && overlapX(p, it)) bottom = Math.min(bottom, p.y - GAP);
    it.y = bottom - it.h;
    if (it.y < P.y + 6) over++;
  }
  let cross = 0, long = 0;
  for (const it of items) {
    const t = tailOf(it); if (!t) continue;
    for (const o of items) if (o !== it && crosses(t, o, it.b.kind === 'thought' ? 9 : 3)) cross++; // 생각 꼬리 점은 반지름만큼 더 띄운다
    if (it.b.kind !== 'talk' && Math.hypot(t.tip[0] - t.base[0], t.tip[1] - t.base[1]) > TAIL_MAX) long++;
  }
  const cost = items.reduce((s, it) => s + Math.abs(it.x - it.want) + 3 * Math.abs((tailOf(it)?.base[1] ?? 0) - (tailOf(it)?.tip[1] ?? 0)), 0);
  return { items, over, cross, long, cost };
}

/** 한 칸의 인물·말풍선 배치. 줄 배정(0~2줄)을 모두 시도해 넘침·꼬리 교차가 없고 꼬리가 짧은 배치를 고른다.
 *  반환 {chars, bubbles:[{...box,x,y,sp}], errors} */
export function layoutPanel(panel, P, o) {
  const errors = [], chars = {};
  const beds = (panel.props ?? []).filter(q => q.type === 'bed');
  for (const c of panel.characters ?? []) {
    const onBed = c.pose === 'lying' && beds.some(q => Math.abs(q.x - c.x) < (q.w ?? 190) / 2);
    chars[c.id] = placeCharacter(onBed ? { ...c, lift: BED_TOP } : c, [P.x + c.x, P.floor]);
  }
  const base = (panel.bubbles ?? []).map((b, i) => {
    const sp = chars[b.speaker], box = bubbleBox(b, o);
    if (box.lines.length > o.maxLines) errors.push(`bubbles[${i}]: 글이 ${box.lines.length}줄로 넘칩니다(최대 ${o.maxLines}줄). 줄이세요`);
    const want = (sp ? sp.head[0] + sp.face * 16 - box.w / 2 : P.x + 10) + (b.dx ?? 0);
    return { ...box, b, i, sp, want, x: Math.min(Math.max(want, P.x + 8), P.x + P.w - 8 - box.w) };
  });
  let best = null;
  const n = base.length, combos = 3 ** n;
  for (let m = 0; m < combos; m++) {
    const rowOf = base.map((it, k) => it.b.row ?? Math.floor(m / 3 ** k) % 3);
    if (base.some((it, k) => it.b.row !== undefined && Math.floor(m / 3 ** k) % 3)) continue; // 고정 줄은 한 번만
    const r = arrange(base, rowOf, chars, P);
    if (r && (!best || r.over < best.over || (r.over === best.over && (r.cross < best.cross || (r.cross === best.cross && (r.long < best.long || (r.long === best.long && r.cost < best.cost))))))) best = r;
  }
  const items = best?.items ?? base.map(it => ({ ...it, row: 0, y: P.y }));
  if (!best || best.over) errors.push('bubbles: 말풍선이 칸 위로 넘칩니다. 글을 줄이거나 panelHeight를 키우거나 인물 x를 벌리세요');
  else if (best.cross) errors.push('bubbles: 말풍선 꼬리가 다른 말풍선을 가로지릅니다. 인물 x를 벌리거나 dx·row로 조정하세요');
  else if (best.long) errors.push(`bubbles: 생각·빈 말풍선 꼬리가 ${TAIL_MAX}px보다 깁니다. 말풍선 row·dx를 바꾸거나 인물 x를 벌리세요`);
  return { chars, bubbles: items, errors };
}

/** 구름 윤곽: 둥근 사각 둘레 점들을 바깥으로 부푼 호로 잇는다. */
export function cloudPath(x, y, w, h) {
  const cx = x + w / 2, cy = y + h / 2, a = w / 2 - 4, b = h / 2 - 4, n = Math.max(8, Math.round((w + h) * 2 / 26)), P = [];
  const sp = v => Math.sign(v) * Math.abs(v) ** 0.45;
  for (let i = 0; i < n; i++) { const t = Math.PI * 2 * (i + 0.5) / n; P.push([cx + a * sp(Math.cos(t)), cy + b * sp(Math.sin(t))]); }
  return P.map((p, i) => { const q = P[(i + 1) % n], r = Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.6; return `${i ? '' : `M${r1(p[0])},${r1(p[1])} `}A${r1(r)},${r1(r)} 0 0 1 ${r1(q[0])},${r1(q[1])}`; }).join(' ') + 'Z';
}

function bubbleEls(it, o) {
  const { x, y, w, h, b, sp } = it, st = { px: true, obstacle: false }, line = { stroke: 'fg', width: 1.6, ...st }, out = [];
  const t = tailOf(it), tip = t?.tip;
  if (b.kind === 'thought') {
    out.push({ type: 'path', d: cloudPath(x, y, w, h), fill: 'bg', ...line });
    if (tip) {
      const [bx, by] = t.base, dx = tip[0] - bx, dy = tip[1] - by;
      [[0.28, 5.5], [0.6, 3.8], [0.88, 2.4]].forEach(([t, r]) => out.push({ type: 'circle', center: [r1(bx + dx * t), r1(by + dy * t)], r, fill: 'bg', ...line, width: 1.3 }));
    }
  } else {
    out.push({ type: 'rect', x, y, w, h, radius: 12, fill: 'bg', ...line });
    if (tip) {
      const [bx, by] = t.base;
      const a = [r1(bx - 7), by], c = [r1(bx + 7), by];
      out.push({ type: 'polygon', points: [[a[0], by - 2.5], [c[0], by - 2.5], tip.map(r1)], stroke: 'none', fill: 'bg', ...st });
      out.push({ type: 'path', d: `M${a[0]},${by} L${r1(tip[0])},${r1(tip[1])} L${c[0]},${by}`, fill: 'none', ...line });
    }
  }
  const lh = lineH(o.fontSize), top = y + (h - it.lines.length * lh) / 2;
  it.lines.forEach((l, i) => out.push({ type: 'text', at: [r1(x + w / 2), r1(top + (i + 1) * lh - lh * 0.28)], text: l, size: o.fontSize, anchor: 'middle', fixed: true, avoid: false, px: true }));
  return out;
}

/** part: scene */
export function scene(el) {
  const L = sceneLayout(el), o = L.o, out = [];
  el.panels.forEach((panel, i) => {
    const P = L.panels[i], { chars, bubbles } = layoutPanel(panel, P, o);
    out.push(...background(panel.background ?? 'none', P));
    for (const p of (panel.props ?? []).filter(q => q.type === 'bed')) out.push(...prop(p, P)); // 침대는 인물 뒤
    for (const c of panel.characters ?? []) out.push(...chars[c.id].elements);
    for (const p of (panel.props ?? []).filter(q => q.type !== 'bed')) out.push(...prop(p, P));
    for (const it of bubbles) out.push(...bubbleEls(it, o));
    out.push({ type: 'rect', x: P.x, y: P.y, w: P.w, h: P.h, radius: 4, fill: 'none', stroke: 'fg', width: 1.8, px: true, obstacle: false });
    const lh = lineH(o.fontSize);
    P.capLines.forEach((l, j) => out.push({ type: 'text', at: [r1(P.x + P.w / 2), r1(P.y + P.h + 4 + (j + 1) * lh - 4)], text: l, size: o.fontSize, anchor: 'middle', fixed: true, avoid: false, px: true }));
  });
  return out;
}

/** 검증: 오류 메시지 배열. where는 경로 접두사. */
export function checkScene(el, where) {
  const errs = [], isNum = v => typeof v === 'number' && Number.isFinite(v);
  if (!Array.isArray(el.panels) || el.panels.length < 1 || el.panels.length > 4) return [`${where}.panels: 칸 1~4개 배열이어야 합니다`];
  for (const k of ['panelWidth', 'panelHeight', 'gap', 'fontSize', 'cols']) if (el[k] !== undefined && !(isNum(el[k]) && el[k] > 0)) errs.push(`${where}.${k}: 양수여야 합니다`);
  if (el.fontSize !== undefined && el.fontSize < 12) errs.push(`${where}.fontSize: 12 이상이어야 합니다(휴대폰 가독성)`);
  if (errs.length) return errs;
  const L = sceneLayout(el);
  el.panels.forEach((p, i) => {
    const w = `${where}.panels[${i}]`, P = L.panels[i];
    if (!p || typeof p !== 'object') { errs.push(`${w}: 객체여야 합니다`); return; }
    if (p.background !== undefined && !BACKGROUNDS.includes(p.background)) errs.push(`${w}.background: ${BACKGROUNDS.join(', ')} 중 하나여야 합니다`);
    if (p.caption !== undefined && typeof p.caption !== 'string') errs.push(`${w}.caption: 문자열이어야 합니다`);
    const ids = new Set();
    (p.characters ?? []).forEach((c, j) => {
      const cw = `${w}.characters[${j}]`;
      if (!c || typeof c.id !== 'string') { errs.push(`${cw}.id: 문자열이 필요합니다`); return; }
      if (ids.has(c.id)) errs.push(`${cw}.id: "${c.id}" 중복`); ids.add(c.id);
      if (!CHARACTERS[c.who]) errs.push(`${cw}.who: ${Object.keys(CHARACTERS).join(', ')} 중 하나여야 합니다`);
      if (c.pose !== undefined && !POSES.includes(c.pose)) errs.push(`${cw}.pose: ${POSES.join(', ')} 중 하나여야 합니다`);
      if (c.expression !== undefined && !EXPRESSIONS.includes(c.expression)) errs.push(`${cw}.expression: ${EXPRESSIONS.join(', ')} 중 하나여야 합니다`);
      if (c.arm !== undefined && !ARMS.includes(c.arm)) errs.push(`${cw}.arm: ${ARMS.join(', ')} 중 하나여야 합니다`);
      if (c.outfit !== undefined && !OUTFITS.includes(c.outfit)) errs.push(`${cw}.outfit: ${OUTFITS.join(', ')} 중 하나여야 합니다`);
      if (c.hold !== undefined && !HOLDS.includes(c.hold)) errs.push(`${cw}.hold: ${HOLDS.join(', ')} 중 하나여야 합니다`);
      if (c.view !== undefined && !VIEWS.includes(c.view)) errs.push(`${cw}.view: ${VIEWS.join(', ')} 중 하나여야 합니다`);
      if (c.facing !== undefined && !['left', 'right'].includes(c.facing)) errs.push(`${cw}.facing: left 또는 right여야 합니다`);
      const m = c.pose === 'lying' ? 96 : 36; // 누운 몸은 머리가 x보다 약 85px 옆에 있다
      if (!isNum(c.x) || c.x < m || c.x > P.w - m) errs.push(`${cw}.x: ${m}~${P.w - m} 숫자여야 합니다(칸 안)`);
    });
    if ((p.characters ?? []).length > 4) errs.push(`${w}.characters: 한 칸에 4명까지입니다`);
    (p.props ?? []).forEach((q, j) => { if (!q || !PROPS.includes(q.type) || !isNum(q.x)) errs.push(`${w}.props[${j}]: {type:${PROPS.join('|')}, x} 가 필요합니다`); });
    (p.bubbles ?? []).forEach((b, j) => {
      const bw = `${w}.bubbles[${j}]`;
      if (!b || !ids.has(b.speaker)) errs.push(`${bw}.speaker: 이 칸 characters의 id여야 합니다`);
      if (b && b.kind !== undefined && !BUBBLE_KINDS.includes(b.kind)) errs.push(`${bw}.kind: ${BUBBLE_KINDS.join(', ')} 중 하나여야 합니다`);
      for (const k of ['w', 'h', 'dx', 'row']) if (b && b[k] !== undefined && !(isNum(b[k]) && (k === 'dx' || b[k] >= 0))) errs.push(`${bw}.${k}: 숫자여야 합니다`);
      if (b && b.kind !== 'empty' && (typeof b.text !== 'string' || !b.text.trim())) errs.push(`${bw}.text: 말 내용 문자열이 필요합니다(빈 말풍선은 kind:"empty")`);
    });
    if (errs.length) return;
    for (const e of layoutPanel(p, P, L.o).errors) errs.push(`${w}.${e}`);
  });
  return errs;
}

/** 템플릿 cartoon: params = scene 필드. 그림 크기를 계산해 스펙을 만든다. */
export function cartoon(params = {}) {
  const { title, ...s } = params, L = sceneLayout({ ...s, at: [2, 2] });
  return { width: L.width + 4, height: L.height + 4, ...(title ? { title } : {}), elements: [{ type: 'scene', at: [2, 2], ...s }] };
}

export const CARTOON = { scene, character: el => placeCharacter(el, el.at).elements };
