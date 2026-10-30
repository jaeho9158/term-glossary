// 인체 윤곽 일반 부품: body(전신 정면/측면)·torso·arm·hand·leg·foot·head.
// 모두 픽셀 좌표의 path 요소 배열을 돌려준다. 각도는 도(°)이고 0이 수직 아래, +가 화면 오른쪽(flip:true면 반대).
// 팔다리는 관절 선(어깨→팔꿈치→손목)을 따라 굵기가 변하는 관 윤곽(tube)이라, 스펙 작성 스크립트에서
// armJoints/legJoints로 관절 좌표를 얻어 경혈·근육 같은 표지를 정확히 얹을 수 있다.
// 사람다운 비례·곡선이 필요하면 style:'natural'(어깨 처짐·허리 잘록·허벅지/종아리 근육 윤곽·발 뒤꿈치/아치/발가락·손가락 마디).
// foot은 cavus(요족)·equinus(첨족, 도)·adductus(내전, 도, view:'top')·varus(내반, 도, view:'back') 변형 파라미터를 가진다. 기본 출력은 옛 버전 그대로다.
const r1 = n => +(+n).toFixed(1);
const rad = d => d * Math.PI / 180;

/** 닫힌 점열을 Catmull-Rom 곡선(부드러운 3차 베지어)으로 */
export function smoothClosed(P) {
  const n = P.length, f = ([x, y]) => `${r1(x)},${r1(y)}`;
  let d = `M${f(P[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    d += ` C${f([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${f([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${f(p2)}`;
  }
  return d + 'Z';
}

/** 열린 점열을 Catmull-Rom 곡선으로(Z 없음: 채움은 닫히지만 아래 변에는 선이 안 그려진다. 다른 부위와 이어지는 몸통 밑변용) */
export function smoothOpen(P) {
  const n = P.length, f = ([x, y]) => `${r1(x)},${r1(y)}`;
  let d = `M${f(P[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    d += ` C${f([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${f([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${f(p2)}`;
  }
  return d;
}

/** 중심선 점들과 굵기로 관 윤곽을 만든다(양끝은 둥글게) */
function tube(pts, ws) {
  const n = pts.length, L = [], R = [], dirs = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
    dirs.push([dx / m, dy / m]);
    const nx = -dy / m, ny = dx / m, h = ws[i] / 2;
    L.push([pts[i][0] + nx * h, pts[i][1] + ny * h]);
    R.push([pts[i][0] - nx * h, pts[i][1] - ny * h]);
  }
  const e = pts[n - 1], de = dirs[n - 1], s = pts[0], ds = dirs[0];
  const capE = [e[0] + de[0] * ws[n - 1] * 0.5, e[1] + de[1] * ws[n - 1] * 0.5];
  const capS = [s[0] - ds[0] * ws[0] * 0.5, s[1] - ds[1] * ws[0] * 0.5];
  return smoothClosed([...L, capE, ...R.reverse(), capS]);
}

/** tube에 왼·오른쪽 반폭을 따로 주는 판(근육 윤곽: 종아리 뒤 볼록, 정강이 앞 직선 등). wl은 진행 방향 기준 왼쪽 법선(-dy,dx) 쪽 */
function tube2(pts, wl, wr, open) {
  const n = pts.length, L = [], R = [], dirs = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
    dirs.push([dx / m, dy / m]);
    const nx = -dy / m, ny = dx / m;
    L.push([pts[i][0] + nx * wl[i], pts[i][1] + ny * wl[i]]);
    R.push([pts[i][0] - nx * wr[i], pts[i][1] - ny * wr[i]]);
  }
  const e = pts[n - 1], de = dirs[n - 1], s = pts[0], ds = dirs[0], ke = (wl[n - 1] + wr[n - 1]) / 2, ks = (wl[0] + wr[0]) / 2;
  if (open) return smoothOpen([...L, [e[0] + de[0] * ke, e[1] + de[1] * ke], ...R.reverse()]); // 윗변을 열어(선 없이) 잘린 팔다리 단면 표현
  return smoothClosed([...L, [e[0] + de[0] * ke, e[1] + de[1] * ke], ...R.reverse(), [s[0] - ds[0] * ks, s[1] - ds[1] * ks]]);
}

/** 관절 선 위 s(0=첫 관절, 1=둘째 관절, 2=셋째 관절)의 좌표 */
function along(J, s) {
  const i = Math.min(J.length - 2, Math.max(0, Math.floor(s))), t = s - i;
  return [J[i][0] + (J[i + 1][0] - J[i][0]) * t, J[i][1] + (J[i + 1][1] - J[i][1]) * t];
}

const dir = (a, flip) => [Math.sin(rad(a)) * (flip ? -1 : 1), Math.cos(rad(a))];
const sty = el => ({ stroke: el.stroke ?? el.color ?? 'fg', fill: el.fill ?? 'bg', width: el.width ?? 1.8, px: true, obstacle: false });
const path = (d, el, extra = {}) => ({ type: 'path', d, ...sty(el), ...extra });

/** 팔 관절: 어깨 at, 전체 길이 len(어깨→가운데 손가락 끝), angle(어깨 벌림), bend(팔꿈치 굽힘 추가 각) */
export function armJoints(el) {
  const [x, y] = el.at, L = el.len ?? 200, a = el.angle ?? 8, b = a + (el.bend ?? 0), f = el.flip;
  const d1 = dir(a, f), d2 = dir(b, f), sh = [x, y];
  const elbow = [x + d1[0] * L * 0.43, y + d1[1] * L * 0.43], wrist = [elbow[0] + d2[0] * L * 0.37, elbow[1] + d2[1] * L * 0.37];
  return { joints: [sh, elbow, wrist], dirForearm: d2, handLen: L * 0.2, L };
}
/** 다리 관절: 엉덩이 at, 길이 len(엉덩이→발목) */
export function legJoints(el) {
  const [x, y] = el.at, L = el.len ?? 200, a = el.angle ?? 4, b = a + (el.bend ?? 0), f = el.flip;
  const d1 = dir(a, f), d2 = dir(b, f), hip = [x, y];
  const knee = [x + d1[0] * L * 0.5, y + d1[1] * L * 0.5], ankle = [knee[0] + d2[0] * L * 0.5, knee[1] + d2[1] * L * 0.5];
  return { joints: [hip, knee, ankle], L };
}
function limbShape(J, L, prof) {
  const s = prof.map(p => p[0]);
  return tube(s.map(v => along(J, v)), prof.map(p => p[1] * L));
}
const ARM_PROF = [[0, 0.115], [0.35, 0.13], [0.8, 0.105], [1, 0.092], [1.25, 0.098], [1.7, 0.07], [2, 0.058]];
const LEG_PROF = [[0, 0.19], [0.45, 0.2], [0.9, 0.125], [1, 0.115], [1.25, 0.125], [1.8, 0.075], [2, 0.062]];

/** hand: 손목 at, len(손목→가운데 손가락 끝), angle(0=아래 방향), flip, thumb(엄지 쪽: 'in'|'out') */
function hand(el) {
  if (NAT(el)) return handNat(el);
  const [x, y] = el.at, L = el.len ?? 40, a = el.angle ?? 0, f = el.flip ? -1 : 1, sgn = el.palm === false ? -1 : 1;
  const d = dir(a, false), n = [-d[1], d[0]], P = (u, v) => [x + d[0] * u + n[0] * v * f, y + d[1] * u + n[1] * v * f];
  const out = [path(tube([P(0, 0), P(L * 0.5, 0)], [L * 0.52, L * 0.62]), el)];
  const fingers = [[-0.22, 0.46, 0.13, -6], [-0.075, 0.5, 0.135, -2], [0.075, 0.46, 0.13, 2], [0.22, 0.36, 0.12, 7]];
  for (const [v, ln, w, fan] of fingers) {
    const fa = rad(fan), base = P(L * 0.48, v * L), tip = [base[0] + (d[0] * Math.cos(fa) - n[0] * f * Math.sin(fa)) * L * ln, base[1] + (d[1] * Math.cos(fa) - n[1] * f * Math.sin(fa)) * L * ln];
    out.push(path(tube([base, tip], [w * L, w * L * 0.85]), el, { width: (el.width ?? 1.8) * 0.8 }));
  }
  const tb = P(L * 0.2, -0.27 * L * sgn), tt = P(L * 0.58, -0.4 * L * sgn);
  out.push(path(tube([tb, tt], [L * 0.16, L * 0.13]), el, { width: (el.width ?? 1.8) * 0.8 }));
  return out;
}

/** arm: 어깨 at, len, angle, bend, flip, hand(기본 true). 굵기는 len에 비례 */
function arm(el) {
  const { joints, dirForearm, handLen, L } = armJoints(el);
  const out = [path(NAT(el) ? limbNat(joints, L, ARM_NAT, false) : limbShape(joints, L, ARM_PROF), el)];
  if (el.hand !== false) out.push(...hand({ ...el, at: joints[2], len: handLen, angle: Math.atan2(dirForearm[0], dirForearm[1]) * 180 / Math.PI, flip: el.flip }));
  return out;
}

/** foot: 발목 at, len(발 길이), view 'side'(발끝이 +x, flip이면 -x)|'front' */
function foot(el) {
  const [x, y] = el.at, L = el.len ?? 60, f = el.flip ? -1 : 1;
  if (el.view === 'top') return footTop(el);
  if (el.view === 'back') return footBack(el);
  if (NAT(el) || el.cavus !== undefined || el.equinus !== undefined) return el.view === 'front' ? footFrontNat(el) : footSideNat(el);
  if (el.view === 'front') {
    const P = [[-0.1, -0.05], [0.12, -0.05], [0.2, 0.3], [0.24, 0.62], [0.2, 0.95], [0, 1.02], [-0.2, 0.95], [-0.24, 0.62], [-0.2, 0.3]];
    return [path(smoothClosed(P.map(([u, v]) => [x + u * L * 0.9 * f, y + v * L * 0.55])), el)];
  }
  const P = [[-0.1, -0.35], [0.12, -0.38], [0.2, -0.1], [0.5, 0.08], [0.82, 0.2], [0.98, 0.3], [0.95, 0.4], [0.5, 0.42], [-0.05, 0.42], [-0.2, 0.34], [-0.22, 0.1], [-0.15, -0.15]];
  return [path(smoothClosed(P.map(([u, v]) => [x + (u + 0.1) * L * f, y + v * L * 0.62])), el)];
}

/** leg: 엉덩이 at, len(엉덩이→발목), angle, bend, flip, foot(기본 true), view 'front'|'side' */
function leg(el) {
  const { joints, L } = legJoints(el);
  if (NAT(el)) {
    const side = el.view === 'side';
    const out = [path(limbNat(joints, L, side ? LEG_SIDE : LEG_FRONT, side ? !el.flip : false, el.cut), el)];
    if (el.foot !== false) out.push(...foot({ ...el, at: joints[2], len: L * 0.37, view: side ? 'side' : 'front', joined: true }));
    return out;
  }
  const out = [path(limbShape(joints, L, LEG_PROF), el)];
  if (el.foot !== false) out.push(...foot({ ...el, at: [joints[2][0], joints[2][1] + L * 0.04], len: L * 0.5, view: el.view === 'side' ? 'side' : 'front' }));
  return out;
}

/** head: 중심 at, h(머리 높이), view 'side'(얼굴이 +x)|'front', flip */
function head(el) {
  if (NAT(el)) return headNat(el);
  const [x, y] = el.at, h = el.h ?? 60, f = el.flip ? -1 : 1;
  if (el.view === 'front') {
    const P = [[0, -0.5], [0.3, -0.44], [0.4, -0.15], [0.38, 0.12], [0.26, 0.35], [0.1, 0.49], [0, 0.5]];
    const pts = [...P, ...P.slice(1, -1).reverse().map(([u, v]) => [-u, v])];
    return [path(smoothClosed(pts.map(([u, v]) => [x + u * h * 1.05, y + v * h])), el),
      path(`M${r1(x - h * 0.4)},${r1(y + h * 0.05)} q${r1(-h * 0.05)},${r1(h * 0.1)} 0,${r1(h * 0.16)}`, { ...el, fill: 'none' }),
      path(`M${r1(x + h * 0.4)},${r1(y + h * 0.05)} q${r1(h * 0.05)},${r1(h * 0.1)} 0,${r1(h * 0.16)}`, { ...el, fill: 'none' })];
  }
  const P = [[-0.05, -0.5], [0.2, -0.44], [0.32, -0.28], [0.34, -0.12], [0.33, 0.02], [0.45, 0.14], [0.34, 0.19], [0.35, 0.27], [0.31, 0.35], [0.29, 0.46], [0.17, 0.5], [0.02, 0.44], [-0.1, 0.36], [-0.3, 0.2], [-0.41, -0.05], [-0.33, -0.35]];
  const T = ([u, v]) => [x + u * h * f, y + v * h];
  return [path(smoothClosed(P.map(T)), el),
    path(`M${r1(T([-0.06, -0.02])[0])},${r1(T([-0.06, -0.02])[1])} q${r1(h * 0.11 * f)},${r1(-h * 0.04)} ${r1(h * 0.1 * f)},${r1(h * 0.12)} q${r1(-h * 0.04 * f)},${r1(h * 0.08)} ${r1(-h * 0.1 * f)},${r1(h * 0.05)}`, { ...el, fill: 'none', width: (el.width ?? 1.8) * 0.8 }),
    { type: 'dot', at: T([0.22, -0.08]), r: 1.8, color: el.stroke ?? 'fg', px: true, obstacle: false }];
}

/** torso: 어깨선 중앙 at, h(어깨선→샅), view 'front'|'side', flip(side에서 가슴이 -x) */
function torso(el) {
  if (NAT(el)) return torsoNat(el);
  const [x, y] = el.at, T = el.h ?? 200, f = el.flip ? -1 : 1;
  if (el.view === 'side') {
    const P = [[0.02, -0.04], [0.15, 0.0], [0.2, 0.15], [0.2, 0.35], [0.2, 0.6], [0.17, 0.85], [0.1, 1.0], [-0.12, 1.02], [-0.22, 0.9], [-0.2, 0.65], [-0.19, 0.35], [-0.22, 0.12], [-0.12, -0.02]];
    return [path(smoothClosed(P.map(([u, v]) => [x + u * T * f, y + v * T])), el)];
  }
  const P = [[0, -0.05], [0.12, -0.03], [0.32, 0.02], [0.37, 0.1], [0.28, 0.25], [0.22, 0.5], [0.25, 0.8], [0.24, 0.98], [0.1, 1.04], [0, 1.0]];
  const pts = [...P, ...P.slice(1, -1).reverse().map(([u, v]) => [-u, v])];
  return [path(smoothClosed(pts.map(([u, v]) => [x + u * T * 1.0, y + v * T])), el)];
}

/** body: 전신. at=[가운데 x, 머리 꼭대기 y], h=키, view 'front'|'side', armAngle, legAngle, flip(side에서 앞쪽이 -x) */
function body(el) {
  if (NAT(el)) return bodyNat(el);
  const [cx, top] = el.at, H = el.h ?? 400, f = el.flip, s = el.view === 'side', out = [];
  const o = k => ({ ...el, ...k }), y = u => top + u * H;
  const T = H * 0.36, shoulderY = y(0.19), hipY = y(0.54);
  if (!s) {
    const aa = el.armAngle ?? 10, la = el.legAngle ?? 4;
    for (const sg of [1, -1]) {
      out.push(...arm(o({ at: [cx + sg * H * 0.135, shoulderY + H * 0.01], len: H * 0.44, angle: aa, bend: 4, flip: sg < 0 })));
      out.push(...leg(o({ at: [cx + sg * H * 0.055, hipY], len: H * 0.4, angle: la, flip: sg < 0, view: 'front' })));
    }
    out.push(...torso(o({ at: [cx, shoulderY], h: T, view: 'front' })));
    out.push(path(tube([[cx, y(0.12)], [cx, y(0.2)]], [H * 0.045, H * 0.055]), el));
    out.push(...head(o({ at: [cx, y(0.065)], h: H * 0.13, view: 'front' })));
  } else {
    const fw = f ? -1 : 1;
    out.push(...leg(o({ at: [cx, hipY], len: H * 0.4, angle: 0, view: 'side', flip: f })));
    out.push(...torso(o({ at: [cx, shoulderY], h: T, view: 'side', flip: f })));
    out.push(path(tube([[cx - fw * H * 0.01, y(0.115)], [cx, y(0.2)]], [H * 0.045, H * 0.055]), el));
    out.push(...head(o({ at: [cx + fw * H * 0.01, y(0.065)], h: H * 0.13, view: 'side', flip: f })));
    out.push(...arm(o({ at: [cx, shoulderY + H * 0.015], len: H * 0.44, angle: -4 * fw, bend: 14 * fw, flip: false })));
  }
  return out;
}


// ───────── style:'natural' 판(사람다운 비례·곡선)과 발 변형 ─────────
const NAT = el => el.style === 'natural';
const mir = (P, ax = 0) => [...P, ...P.slice(1, -1).reverse().map(([u, v]) => [2 * ax - u, v])];
/** 근육 윤곽 굵기표: [s, 앞 반폭, 뒤 반폭] (len 비율) */
const LEG_SIDE = [[0, 0.095, 0.125], [0.4, 0.1, 0.11], [0.85, 0.082, 0.088], [1, 0.082, 0.073], [1.2, 0.065, 0.1], [1.35, 0.06, 0.115], [1.65, 0.05, 0.08], [1.9, 0.045, 0.058], [2, 0.044, 0.054]];
const LEG_FRONT = [[0, 0.108, 0.108], [0.4, 0.1, 0.1], [0.85, 0.08, 0.08], [1, 0.075, 0.075], [1.2, 0.078, 0.082], [1.35, 0.078, 0.086], [1.65, 0.06, 0.066], [1.9, 0.048, 0.05], [2, 0.045, 0.047]];
const ARM_NAT = [[0, 0.065, 0.065], [0.3, 0.07, 0.066], [0.65, 0.058, 0.052], [0.95, 0.045, 0.042], [1.15, 0.052, 0.05], [1.5, 0.04, 0.038], [2, 0.027, 0.027]];
function limbNat(J, L, prof, swap, cut) {
  if (cut > 0) { // cut(0~2): 이 위치 위쪽은 그리지 않고 윗변을 열어 둔다(정강이만 그릴 때 등)
    const k = prof.findIndex(p => p[0] >= cut), a = prof[Math.max(0, k - 1)], b = prof[k], t = b[0] === a[0] ? 0 : (cut - a[0]) / (b[0] - a[0]);
    prof = [[cut, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], ...prof.slice(k)];
  }
  const s = prof.map(p => p[0]);
  return tube2(s.map(v => along(J, v)), prof.map(p => (swap ? p[2] : p[1]) * L), prof.map(p => (swap ? p[1] : p[2]) * L), cut > 0);
}

function handNat(el) {
  const [x, y] = el.at, L = el.len ?? 40, a = el.angle ?? 0, f = el.flip ? -1 : 1, sgn = el.palm === false ? -1 : 1;
  const d = dir(a, false), n = [-d[1], d[0]], P = (u, v) => [x + d[0] * u + n[0] * v * f, y + d[1] * u + n[1] * v * f];
  const lw = (el.width ?? 1.8) * 0.8, out = [];
  const fingers = [[-0.145, 0.47, 0.105, -4], [-0.045, 0.53, 0.108, -1], [0.055, 0.49, 0.1, 2], [0.15, 0.39, 0.088, 6]];
  for (const [v, ln, w, fan] of fingers) {
    const fa = rad(fan), base = P(L * 0.47, v * L), dd = [d[0] * Math.cos(fa) - n[0] * f * Math.sin(fa), d[1] * Math.cos(fa) - n[1] * f * Math.sin(fa)];
    const k = [base, [base[0] + dd[0] * L * ln * 0.5, base[1] + dd[1] * L * ln * 0.5], [base[0] + dd[0] * L * ln, base[1] + dd[1] * L * ln]];
    out.push(path(tube(k, [w * L, w * L * 0.92, w * L * 0.72]), el, { width: lw }));
  }
  const tb = P(L * 0.1, -0.13 * L * sgn), tm = P(L * 0.3, -0.29 * L * sgn), tt = P(L * 0.5, -0.37 * L * sgn);
  out.push(path(tube([tb, tm, tt], [L * 0.22, L * 0.17, L * 0.12]), el, { width: lw }));
  const palm = [[0, -0.1], [0.1, -0.17], [0.3, -0.21], [0.5, -0.215], [0.545, -0.12], [0.55, 0.0], [0.545, 0.12], [0.5, 0.215], [0.36, 0.22], [0.16, 0.15], [0.02, 0.1]];
  out.push(path(smoothClosed(palm.map(([u, v]) => P(L * u, L * v * sgn * 1))), el));
  return out;
}

function footSideNat(el) {
  const [x, y] = el.at, L = el.len ?? 60, f = el.flip ? -1 : 1, c = Math.min(1, Math.max(0, el.cavus ?? 0)), eq = rad(el.equinus ?? 0);
  const g = 0.3;
  const P = [[-0.15, -0.3], [-0.16, -0.1], [-0.205, 0.07], [-0.22, 0.2], [-0.17, g - 0.01], [-0.06, g + 0.01],
    [0.12, g - 0.04 - 0.1 * c], [0.27, g - 0.07 - 0.14 * c], [0.45, g - 0.03 - 0.04 * c], [0.56, g + 0.01], [0.74, g + 0.01],
    [0.84, g - 0.02 - 0.03 * c], [0.865, g - 0.07 - 0.03 * c], [0.83, g - 0.11 - 0.04 * c], [0.7, g - 0.115 - 0.06 * c],
    [0.52, g - 0.18 - 0.1 * c], [0.34, g - 0.29 - 0.15 * c], [0.18, g - 0.37 - 0.1 * c], [0.135, g - 0.48], [0.14, -0.3]];
  const T = ([u, v]) => { const e = eq * Math.min(1, Math.max(0, (v + 0.3) / 0.3)), uu = u * Math.cos(e) - v * Math.sin(e), vv = u * Math.sin(e) + v * Math.cos(e); return [x + uu * L * f, y + vv * L]; }; // 정강이와 이어지는 윗부분은 덜 돌려 윤곽이 끊기지 않게
  const out = [path((el.joined ? smoothOpen : smoothClosed)(P.map(T)), el)]; // joined: 다리 끝에 이어 그릴 때 윗변 선 생략
  // 복사뼈 표시(발목 안쪽 작은 호)
  const m0 = T([-0.02, 0.0]), m1 = T([0.08, -0.02]);
  out.push(path(`M${r1(m0[0])},${r1(m0[1])} Q${r1((m0[0] + m1[0]) / 2)},${r1(m0[1] + L * 0.07)} ${r1(m1[0])},${r1(m1[1])}`, { ...el, fill: 'none', width: (el.width ?? 1.8) * 0.6 }));
  return out;
}

/** 위(등쪽)에서 본 발: at=발뒤꿈치 뒤끝 가운데, 발끝이 위(-y). side 'right'|'left', adductus(앞발이 안쪽으로 휜 각 °), angle(전체 회전 °) */
function footTop(el) {
  const [x, y] = el.at, L = el.len ?? 60, mf = el.side === 'left' ? -1 : 1, al = rad(el.adductus ?? 0), rot = rad(el.angle ?? 0);
  const R = ([u, v]) => [x + (u * Math.cos(rot) - v * Math.sin(rot)) * L * mf, y + (u * Math.sin(rot) + v * Math.cos(rot)) * L];
  const cl = [[0, -0.12], [0, -0.3], [0, -0.5]];
  const dv = [-Math.sin(al), -Math.cos(al)]; // 앞발 진행 방향(안쪽=-x)
  const fs = [0.14, 0.27, 0.38, 0.45];
  const base = cl[2];
  for (const t of fs) cl.push([base[0] + dv[0] * t, base[1] + dv[1] * t]);
  // 반폭(외측 wl, 내측 wr)
  const wl = [0.12, 0.105, 0.09, 0.155, 0.16, 0.15, 0.115], wr = [0.12, 0.115, 0.1, 0.17, 0.165, 0.158, 0.12];
  const out = [];
  // 발가락 구분선(앞 끝부근)
  const tip = cl[5], nn = [-dv[1], dv[0]];
  const body = path(tube2(cl.map(R), (mf < 0 ? wr : wl).map(w => w * L), (mf < 0 ? wl : wr).map(w => w * L)), el);
  out.push(body);
  for (const v of [-0.05, 0.0, 0.05, 0.1]) {
    const p0 = [tip[0] + nn[0] * v - dv[0] * 0.04, tip[1] + nn[1] * v - dv[1] * 0.04], p1 = [tip[0] + nn[0] * v + dv[0] * 0.075, tip[1] + nn[1] * v + dv[1] * 0.075];
    out.push(path(`M${r1(R(p0)[0])},${r1(R(p0)[1])} L${r1(R(p1)[0])},${r1(R(p1)[1])}`, { ...el, fill: 'none', width: (el.width ?? 1.8) * 0.55 }));
  }
  return out;
}

/** 뒤에서 본 발: at=발목 가운데, len(발 길이 기준 척도), side, varus(뒤꿈치 안쪽 기울기 °), top(다리를 그리는 높이, 기본 -0.75) */
function footBack(el) {
  const [x, y] = el.at, L = el.len ?? 60, mf = el.side === 'left' ? -1 : 1, vr = rad(el.varus ?? 0), top = el.top ?? -0.75, g = 0.3;
  const R = [[0.12, top], [0.105, -0.4], [0.115, -0.12], [0.14, 0.0], [0.15, 0.1], [0.165, 0.22], [0.145, g - 0.01], [0.06, g + 0.015]];
  const P = [...R, ...[...R].reverse().map(([u, v]) => [-u, v])];
  const T = ([u, v]) => { const w = Math.min(1, Math.max(0, (v + 0.12) / 0.2)), b = vr * w; return [x + (u * Math.cos(b) - v * Math.sin(b)) * L * mf, y + (u * Math.sin(b) + v * Math.cos(b)) * L]; };
  const out = [path(smoothClosed(P.map(T)), el)];
  return out;
}

function headNat(el) {
  const [x, y] = el.at, h = el.h ?? 60;
  if (el.angle) { // 머리 기울기: 기울이기 전 모양을 만든 뒤 중심 둘레로 돌린다
    const els = headNat({ ...el, angle: 0 });
    return els.map(e => e.type === 'path' ? { ...e, d: e.d.replace(/([MCLQ]?)(-?[\d.]+),(-?[\d.]+)/g, (m, c, px, py) => { const q = rotAbout([+px, +py], [x, y], el.angle); return `${c}${r1(q[0])},${r1(q[1])}`; }) } : e.type === 'dot' ? { ...e, at: rotAbout(e.at, [x, y], el.angle) } : e);
  }
  if (el.view === 'front') {
    const P = [[0, -0.5], [0.22, -0.47], [0.34, -0.33], [0.37, -0.1], [0.36, 0.1], [0.3, 0.27], [0.18, 0.4], [0.07, 0.49], [0, 0.5]];
    const pts = [...P, ...P.slice(1, -1).reverse().map(([u, v]) => [-u, v])];
    const ear = s => { const A = [x + s * h * 0.37, y - h * 0.04], c1 = [A[0] + s * h * 0.07, A[1] + h * 0.02], B = [A[0] + s * h * 0.05, A[1] + h * 0.13], c2 = [B[0] - s * h * 0.02, B[1] + h * 0.05], C2 = [B[0] - s * h * 0.07, B[1] + h * 0.05]; return path(`M${r1(A[0])},${r1(A[1])} Q${r1(c1[0])},${r1(c1[1])} ${r1(B[0])},${r1(B[1])} Q${r1(c2[0])},${r1(c2[1])} ${r1(C2[0])},${r1(C2[1])}`, { ...el, fill: 'none', width: (el.width ?? 1.8) * 0.8 }); };
    return [path(smoothClosed(pts.map(([u, v]) => [x + u * h * 1.05, y + v * h])), el), ear(1), ear(-1)];
  }
  return headSide(el);
}
function headSide(el) {
  const [x, y] = el.at, h = el.h ?? 60, f = el.flip ? -1 : 1;
  const P = [[-0.05, -0.5], [0.2, -0.44], [0.32, -0.28], [0.34, -0.12], [0.33, 0.02], [0.45, 0.14], [0.34, 0.19], [0.35, 0.27], [0.31, 0.35], [0.29, 0.46], [0.17, 0.5], [0.02, 0.44], [-0.1, 0.36], [-0.3, 0.2], [-0.41, -0.05], [-0.33, -0.35]];
  const T = ([u, v]) => [x + u * h * f, y + v * h];
  return [path(smoothClosed(P.map(T)), el),
    (() => { const A = T([-0.06, -0.02]), B = [A[0] + h * 0.1 * f, A[1] + h * 0.12], c1 = [A[0] + h * 0.11 * f, A[1] - h * 0.04], C2 = [B[0] - h * 0.1 * f, B[1] + h * 0.05], c2 = [B[0] - h * 0.04 * f, B[1] + h * 0.08]; return path(`M${r1(A[0])},${r1(A[1])} Q${r1(c1[0])},${r1(c1[1])} ${r1(B[0])},${r1(B[1])} Q${r1(c2[0])},${r1(c2[1])} ${r1(C2[0])},${r1(C2[1])}`, { ...el, fill: 'none', width: (el.width ?? 1.8) * 0.8 }); })(),
    { type: 'dot', at: T([0.22, -0.08]), r: 1.8, color: el.stroke ?? 'fg', px: true, obstacle: false }];
}
const rotAbout = (p, c, deg) => { const a = rad(deg), dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)]; };
function torsoNat(el) {
  const [x, y] = el.at, T = el.h ?? 200, f = el.flip ? -1 : 1, an = el.angle ?? 0, RT = p => an ? rotAbout(p, [x, y], an) : p;
  if (el.view === 'side') {
    const P = [[0.11, 0.99], [0.17, 0.88], [0.2, 0.7], [0.215, 0.5], [0.235, 0.3], [0.23, 0.14], [0.17, 0.02], [0.06, -0.08], [-0.07, -0.08], [-0.2, 0.04], [-0.22, 0.22], [-0.17, 0.4], [-0.15, 0.58], [-0.22, 0.75], [-0.25, 0.9], [-0.2, 0.99]];
    return [path(smoothOpen(P.map(([u, v]) => RT([x + u * T * f, y + v * T]))), el)];
  }
  const P = [[0.285, 1.0], [0.28, 0.88], [0.22, 0.72], [0.2, 0.58], [0.22, 0.45], [0.26, 0.32], [0.29, 0.2], [0.35, 0.17], [0.38, 0.09], [0.33, 0.03], [0.2, -0.01], [0.09, -0.06], [0, -0.07]];
  const pts = [...P, ...P.slice(0, -1).reverse().map(([u, v]) => [-u, v])];
  return [path(smoothOpen(pts.map(([u, v]) => RT([x + u * T, y + v * T]))), el)];
}
function footFrontNat(el) {
  const [x, y] = el.at, L = el.len ?? 60, f = el.flip ? -1 : 1, rot = rad((el.out ?? 12) * f);
  const cl = [[0, 0.02], [0, 0.28], [0, 0.58]].map(([u, v]) => [x + (u * Math.cos(rot) - v * Math.sin(rot)) * L, y + (u * Math.sin(rot) + v * Math.cos(rot)) * L]);
  return [path(tube2(cl, [0.15 * L, 0.19 * L, 0.17 * L], [0.15 * L, 0.19 * L, 0.17 * L]), el)];
}

/** 자연스러운 전신(style:'natural'): 어깨 처짐, 허리, 허벅지·종아리 윤곽 */
function bodyNat(el) {
  const [cx, top] = el.at, H = el.h ?? 400, f = el.flip, s = el.view === 'side', out = [];
  const o = k => ({ ...el, ...k }), y = u => top + u * H;
  const T = H * 0.34, shoulderY = y(0.19), hipY = y(0.5), LL = H * 0.45;
  if (!s) {
    const aa = el.armAngle ?? 9, la = el.legAngle ?? 3;
    for (const sg of [1, -1]) {
      out.push(...arm(o({ at: [cx + sg * H * 0.125, shoulderY + H * 0.02], len: H * 0.44, angle: aa, bend: 5, flip: sg < 0 })));
      out.push(...leg(o({ at: [cx + sg * H * 0.046, hipY], len: LL, angle: la, flip: sg < 0, view: 'front' })));
    }
    out.push(path(tube2([[cx, y(0.115)], [cx, y(0.2)]], [H * 0.034, H * 0.045], [H * 0.034, H * 0.045]), el));
    out.push(...torso(o({ at: [cx, shoulderY], h: T, view: 'front' })));
    out.push(...head(o({ at: [cx, y(0.065)], h: H * 0.13, view: 'front' })));
  } else {
    const fw = f ? -1 : 1;
    out.push(...leg(o({ at: [cx, hipY], len: LL, angle: 0, view: 'side', flip: f })));
    out.push(path(tube2([[cx - fw * H * 0.012, y(0.115)], [cx - fw * H * 0.005, y(0.2)]], [H * 0.032, H * 0.04], [H * 0.032, H * 0.04]), el));
    out.push(...torso(o({ at: [cx, shoulderY], h: T, view: 'side', flip: f })));
    out.push(...head(o({ at: [cx + fw * H * 0.012, y(0.065)], h: H * 0.13, view: 'side', flip: f })));
    out.push(...arm(o({ at: [cx - fw * H * 0.005, shoulderY + H * 0.03], len: H * 0.44, angle: -3 * fw, bend: 12 * fw, flip: false })));
  }
  return out;
}

export const ANATOMY = { body, torso, arm, hand, leg, foot, head };
