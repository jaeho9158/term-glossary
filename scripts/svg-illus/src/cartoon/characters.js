// 교과서 삽화풍 등장인물: 단순 평면 벡터(원·관 윤곽·곡선)로 직접 그린 원본 캐릭터 4명.
// 좌표는 발 가운데(바닥)가 원점, 위가 -y, 얼굴은 +x(오른쪽)를 본다. 그린 뒤 group transform으로 위치·방향·크기를 준다.
// 피부·머리·이목구비는 사람 색이라 모드와 무관한 고정색(--si-skin 등 CSS 변수로 덮어쓸 수 있음), 옷은 역할색 *-s 토큰(라이트·다크 거의 같은 중간 톤),
// 윤곽선은 fg(currentColor)라 다크 모드에서는 밝은 선이 되어 어두운 바탕에서도 실루엣이 보인다.
const r1 = n => +(+n).toFixed(1);
const SKIN = 'var(--si-skin,#f6d6bd)', FACE = 'var(--si-face,#3a2a22)', SHOE = 'var(--si-shoe,#4b4f57)', COAT = 'var(--si-coat,#f4f6f8)';

export const CHARACTERS = {
  'student-m': { k: 0.88, hair: 'short', hairColor: 'var(--si-hair-1,#3b2b22)', top: 'blue-s', bottom: 'gray-s' },
  'student-f': { k: 0.88, hair: 'ponytail', hairColor: 'var(--si-hair-2,#4a3020)', top: 'rose-s', bottom: 'violet-s', skirt: true },
  'adult-m': { k: 1, hair: 'short', hairColor: 'var(--si-hair-3,#2f2a28)', top: 'green-s', bottom: 'gray-s', glasses: true },
  'adult-f': { k: 1, hair: 'long', hairColor: 'var(--si-hair-4,#6b4530)', top: 'amber-s', bottom: 'blue-s' },
};
export const POSES = ['standing', 'sitting', 'pointing', 'lying'];
export const EXPRESSIONS = ['neutral', 'smile', 'troubled', 'puzzled'];
export const ARMS = ['down', 'point', 'raise', 'open', 'chin', 'hold'];
export const HOLDS = ['paper', 'phone', 'cup', 'clipboard'];
export const VIEWS = ['front', 'profile'];
export const OUTFITS = ['default', 'coat'];

const HEAD_R = 21, HEAD_Y = -127;

/** 관 윤곽: 점열을 따라 폭 w인 둥근 끝 막대(팔·다리). */
export function limb(pts, w) {
  const h = w / 2, n = pts.length, L = [], R = [];
  const dirs = pts.slice(1).map((p, i) => { const dx = p[0] - pts[i][0], dy = p[1] - pts[i][1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; });
  for (let i = 0; i < n; i++) {
    const a = dirs[Math.max(0, i - 1)], b = dirs[Math.min(dirs.length - 1, i)];
    let nx = a[1] + b[1], ny = -(a[0] + b[0]); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const m = h / Math.max(0.5, nx * a[1] - ny * a[0]); // 꺾인 곳에서도 폭 유지
    L.push([pts[i][0] + nx * m, pts[i][1] + ny * m]); R.push([pts[i][0] - nx * m, pts[i][1] - ny * m]);
  }
  const p = ([x, y]) => `${r1(x)},${r1(y)}`;
  return `M${p(L[0])} ${L.slice(1).map(q => 'L' + p(q)).join(' ')} A${h},${h} 0 0 1 ${p(R[n - 1])} ${R.slice(0, -1).reverse().map(q => 'L' + p(q)).join(' ')} A${h},${h} 0 0 1 ${p(L[0])}Z`;
}

/** 자세별 관절. U: 앉으면 윗몸이 내려가는 양. */
function joints(pose, arm) {
  const sit = pose === 'sitting', U = sit ? 13 : 0;
  const sh = -104 + U, hip = sit ? -48 : -60;
  arm = arm ?? (pose === 'pointing' ? 'point' : sit ? 'lap' : 'down');
  if (pose === 'lying' && arm !== 'raise') arm = 'down';
  const S = [12, sh + 2];
  const front = {
    down: [S, [16, sh + 24], [17, sh + 42]],
    lap: [S, [15, sh + 22], [30, sh + 30]],
    point: [S, [30, sh + 4], [48, sh - 4]],
    raise: [S, [22, sh - 18], [25, sh - 42]],
    open: [S, [22, sh + 20], [40, sh + 14]],
    chin: [S, [19, sh + 24], [12, sh - 6]],
    hold: [S, [19, sh + 24], [32, sh + 14]],
  }[arm];
  const back = sit ? [[-12, sh + 2], [-14, sh + 22], [4, sh + 32]] : [[-12, sh + 2], [-17, sh + 24], [-17, sh + 42]];
  const legs = sit
    ? [[[-4, hip - 2], [24, hip - 2], [25, -8]], [[4, hip - 2], [30, hip - 2], [31, -8]]]
    : [[[-6, hip - 2], [-7, -8]], [[6, hip - 2], [7, -8]]];
  return { sit, U, sh, hip, head: [1, HEAD_Y + U], front, back, legs, arm };
}

function face(cx, cy, expr, profile) {
  const st = { stroke: FACE, fill: 'none', width: 1.5 }, out = [];
  const eye = (x) => ({ type: 'circle', center: [cx + x, cy - 1], r: 2.1, stroke: 'none', fill: FACE });
  if (profile) { out.push(eye(14)); out.push({ type: 'path', d: `M${r1(cx + 20)},${r1(cy - 2)} L${r1(cx + 24.5)},${r1(cy + 4)} L${r1(cx + 20.5)},${r1(cy + 5)}`, stroke: FACE, fill: 'none', width: 1.3 }); cx += 3; }
  else out.push(eye(5), eye(13));
  const brow = (a, b) => ({ type: 'path', d: `M${r1(cx + a[0])},${r1(cy + a[1])} L${r1(cx + b[0])},${r1(cy + b[1])}`, ...st, width: 1.4 });
  const mouth = d => ({ type: 'path', d, ...st });
  const M = (x, y) => `${r1(cx + x)},${r1(cy + y)}`;
  if (expr === 'smile') { out.push(mouth(`M${M(6, 8)} Q${M(10.5, 14)} ${M(15, 8)}`)); out.push({ type: 'ellipse', center: [cx + 16, cy + 5], rx: 3, ry: 1.8, stroke: 'none', fill: 'var(--si-blush,#f2a7a0)', opacity: 0.7 }); }
  else if (expr === 'troubled') {
    out.push(brow([1.5, -6], [7, -9]), brow([11, -9], [16.5, -6]));
    out.push(mouth(`M${M(6, 11)} Q${M(8.5, 8.5)} ${M(10.5, 11)} Q${M(12.5, 13.5)} ${M(15, 11)}`));
    // 땀방울: 얼굴 쪽 관자놀이 바깥(머리카락 밖)
    const sx = profile ? 25 : 28;
    out.push({ type: 'path', d: `M${M(sx, -14)} Q${M(sx - 3.5, -8)} ${M(sx, -6.5)} Q${M(sx + 3.5, -8)} ${M(sx, -14)}Z`, stroke: 'blue-t', fill: 'blue-f', width: 1 });
  } else if (expr === 'puzzled') {
    out.push(brow([1.5, -6], [7, -6]), brow([11, -10], [16.5, -9]));
    out.push(mouth(`M${M(7, 11)} L${M(14, 9)}`));
  } else out.push(mouth(`M${M(7, 10)} L${M(14, 10)}`));
  return out;
}

function hairPaths(c, cx, cy, layer) {
  const col = c.hairColor, st = { stroke: 'fg', fill: col, width: 1.5 }, P = (x, y) => `${r1(cx + x)},${r1(cy + y)}`;
  if (layer === 'back') {
    if (c.hair === 'ponytail') return [{ type: 'path', d: `M${P(-16, -14)} C${P(-34, -18)} ${P(-36, 6)} ${P(-26, 18)} C${P(-24, 8)} ${P(-20, 0)} ${P(-14, -4)}Z`, ...st }];
    if (c.hair === 'long') return [{ type: 'path', d: `M${P(-20, -8)} C${P(-26, 10)} ${P(-24, 26)} ${P(-14, 32)} L${P(6, 30)} C${P(2, 20)} ${P(-2, 10)} ${P(-4, 0)}Z`, ...st }];
    return [];
  }
  // 앞(머리 덮개): 뒤통수·정수리를 덮고 이마 앞머리로 끝난다
  const cap = c.hair === 'short'
    ? `M${P(-21, 4)} C${P(-25, -12)} ${P(-14, -25)} ${P(1, -24)} C${P(14, -24)} ${P(22, -15)} ${P(21, -4)} C${P(14, -11)} ${P(7, -12)} ${P(1, -11)} C${P(-3, -6)} ${P(-8, -2)} ${P(-11, 5)}Z`
    : `M${P(-21, 8)} C${P(-26, -12)} ${P(-14, -26)} ${P(2, -25)} C${P(16, -24)} ${P(23, -14)} ${P(21, -5)} C${P(16, -11)} ${P(10, -12)} ${P(4, -11)} C${P(0, -4)} ${P(-6, 0)} ${P(-10, 10)}Z`;
  return [{ type: 'path', d: cap, ...st }];
}

/** 손에 든 물건(손 원 아래에 그림). */
function heldObject(kind, [x, y]) {
  const L = { stroke: 'fg', width: 1.4 };
  if (kind === 'phone') return [{ type: 'rect', x: x - 1, y: y - 17, w: 10, h: 18, radius: 2, ...L, fill: SHOE }, { type: 'rect', x: x + 1, y: y - 15, w: 6, h: 11, ...L, stroke: 'none', fill: 'blue-f' }];
  if (kind === 'cup') return [{ type: 'path', d: `M${x - 2},${y - 15} L${x + 13},${y - 15} L${x + 11},${y + 2} L${x},${y + 2}Z M${x + 13},${y - 11} q6,1 0,8`, ...L, fill: 'bg' }, { type: 'path', d: `M${x - 2},${y - 15} L${x + 13},${y - 15} L${x + 12.5},${y - 11} L${x - 1.5},${y - 11}Z`, ...L, fill: 'amber-s' }];
  const paper = kind === 'paper', w = paper ? 20 : 24, h = paper ? 26 : 30, x0 = x - 2, y0 = y - h + 6, out = [];
  if (!paper) out.push({ type: 'rect', x: x0, y: y0, w, h, radius: 2, ...L, fill: 'amber-s' }, { type: 'rect', x: x0 + w / 2 - 5, y: y0 - 3, w: 10, h: 6, radius: 1.5, ...L, fill: 'gray-s' });
  out.push({ type: 'rect', x: x0 + (paper ? 0 : 3), y: y0 + (paper ? 0 : 5), w: w - (paper ? 0 : 6), h: h - (paper ? 0 : 8), ...L, fill: 'bg' });
  out.push({ type: 'path', d: [9, 14, 19].map(d => `M${x0 + 5},${y0 + d} L${x0 + w - 5},${y0 + d}`).join(' '), stroke: 'gray-s', width: 1.1, fill: 'none' });
  return out;
}

/** 캐릭터 한 명(로컬 좌표 요소 배열)과 기하 정보. */
export function characterLocal(who, { pose = 'standing', expression = 'neutral', arm, outfit = 'default', chair = true, hold, view } = {}) {
  const c = CHARACTERS[who], J = joints(pose, hold && !arm ? 'hold' : arm), [hx, hy] = J.head;
  const coat = outfit === 'coat', topFill = coat ? COAT : c.top, line = { stroke: 'fg', width: 1.6 };
  const out = [];
  if (J.sit && chair) out.push(
    { type: 'path', d: `M-26,-46 L-26,-104 L-19,-104 L-19,-46Z`, ...line, fill: 'gray-f' },
    { type: 'path', d: `M-26,-49 L14,-49 L14,-42 L-26,-42Z`, ...line, fill: 'gray-f' },
    { type: 'path', d: `M-22,-42 L-22,0 M10,-42 L10,0`, ...line, width: 2.2 });
  out.push(...hairPaths(c, hx, hy, 'back'));
  out.push({ type: 'path', d: limb(J.back, 10), ...line, fill: topFill }, { type: 'circle', center: J.back[J.back.length - 1], r: 5.5, ...line, fill: SKIN });
  // 다리(바지 또는 치마 아래 맨다리)와 신발
  for (const lg of J.legs) {
    out.push({ type: 'path', d: limb(lg, 13), ...line, fill: c.skirt ? SKIN : c.bottom });
    const a = lg[lg.length - 1];
    out.push({ type: 'ellipse', center: [a[0] + 4, a[1] + 3], rx: 9.5, ry: 5, ...line, fill: SHOE });
  }
  const sh = J.sh, hip = J.hip;
  if (c.skirt) out.push({ type: 'path', d: J.sit ? `M-15,${hip - 14} L30,${hip - 10} L32,${hip + 4} L-17,${hip + 4}Z` : `M-15,${hip - 6} L15,${hip - 6} L21,${hip + 20} L-21,${hip + 20}Z`, ...line, fill: c.bottom });
  out.push({ type: 'path', d: `M-5,${sh - 10} L5,${sh - 10} L5,${sh + 2} L-5,${sh + 2}Z`, stroke: 'none', fill: SKIN }); // 목
  const torsoBottom = J.sit ? hip + 2 : hip + 2;
  out.push({ type: 'path', d: `M-17,${sh + 6} Q-17,${sh - 4} -7,${sh - 4} L7,${sh - 4} Q17,${sh - 4} 17,${sh + 6} L15,${torsoBottom} L-15,${torsoBottom}Z`, ...line, fill: topFill });
  if (coat) out.push({ type: 'path', d: `M0,${sh - 3} L0,${torsoBottom} M-6,${sh - 4} L0,${sh + 10} L6,${sh - 4}`, ...line, width: 1.2 });
  else if (who.startsWith('student')) out.push({ type: 'path', d: `M-6,${sh - 4} L0,${sh + 5} L6,${sh - 4}`, ...line, fill: 'bg', width: 1.2 }); // 교복 깃
  // 머리
  out.push({ type: 'circle', center: [hx, hy], r: HEAD_R, ...line, fill: SKIN });
  out.push(...hairPaths(c, hx, hy, 'front'));
  out.push(...face(hx, hy, expression, view === 'profile'));
  if (c.glasses && view === 'profile') out.push({ type: 'path', d: `M${hx + 9.6},${hy - 1} a4.4,4.4 0 1,0 8.8,0 a4.4,4.4 0 1,0 -8.8,0 M${hx + 9.6},${hy - 2} L${hx - 6},${hy - 4}`, stroke: FACE, fill: 'none', width: 1.3 });
  else if (c.glasses) out.push({ type: 'path', d: `M${hx + 1},${hy - 1} a4.4,4.4 0 1,0 8.8,0 a4.4,4.4 0 1,0 -8.8,0 M${hx + 9.8},${hy - 1} L${hx + 9.8},${hy - 1} M${hx + 9.8},${hy - 1.5} L${hx + 10.6},${hy - 1.5} M${hx + 10.6},${hy - 1} a4.2,4.2 0 1,0 8.4,0 a4.2,4.2 0 1,0 -8.4,0`, stroke: FACE, fill: 'none', width: 1.3 });
  // 앞팔
  out.push({ type: 'path', d: limb(J.front, 10), ...line, fill: topFill });
  const hand = J.front[J.front.length - 1];
  if (J.arm === 'point') {
    const p = J.front[1], dx = hand[0] - p[0], dy = hand[1] - p[1], l = Math.hypot(dx, dy);
    out.push({ type: 'path', d: limb([hand, [hand[0] + dx / l * 11, hand[1] + dy / l * 11]], 4), ...line, width: 1.2, fill: SKIN });
  }
  if (hold) out.push(...heldObject(hold, hand));
  out.push({ type: 'circle', center: hand, r: 5.5, ...line, fill: SKIN });
  if (pose === 'lying') { // 서 있는 몸을 -90° 돌려 눕힌다: 머리 왼쪽, 얼굴 위. x=몸 가운데
    const T = ([x, y]) => [y + 64, -x - 23];
    return { elements: [{ type: 'group', transform: 'translate(64 -23) rotate(-90)', elements: out }], head: T([hx, hy]), headR: HEAD_R, top: T([hx, hy])[1] - HEAD_R - 4, k: c.k };
  }
  return { elements: out, head: [hx, hy], headR: HEAD_R, top: hy - HEAD_R - 4, k: c.k };
}

/** 장면 좌표로 놓은 캐릭터. at=[발 가운데 x, 바닥 y], facing 'right'|'left'. 반환 {elements, head:[x,y], r, top, left, right} (절대 좌표). */
export function placeCharacter(ch, at) {
  if (ch.lift) at = [at[0], at[1] - ch.lift];
  const L = characterLocal(ch.who, ch), s = ch.facing === 'left' ? -1 : 1, k = L.k;
  const els = L.elements.map(e => ({ ...e, px: true, obstacle: false }));
  const g = { type: 'group', px: true, transform: `translate(${r1(at[0])} ${r1(at[1])}) scale(${r1(s * k * 100) / 100} ${k})`, elements: els };
  const X = x => at[0] + s * k * x, Y = y => at[1] + k * y;
  const extra = [];
  if (ch.expression === 'puzzled') extra.push({ type: 'text', at: [r1(X(L.head[0] - 16)), r1(Y(L.head[1] - 22))], text: '?', size: 20, weight: 700, color: 'accent', anchor: 'middle', fixed: true, avoid: false, px: true });
  return { elements: [g, ...extra], head: [X(L.head[0]), Y(L.head[1])], r: L.headR * k, top: Y(L.top) - (extra.length ? 14 : 0), face: s, left: at[0] - (ch.pose === 'lying' ? 85 : 40) * k, right: at[0] + (ch.pose === 'lying' ? 85 : 40) * k };
}

