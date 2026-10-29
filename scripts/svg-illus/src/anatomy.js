// 인체 윤곽 일반 부품: body(전신 정면/측면)·torso·arm·hand·leg·foot·head.
// 모두 픽셀 좌표의 path 요소 배열을 돌려준다. 각도는 도(°)이고 0이 수직 아래, +가 화면 오른쪽(flip:true면 반대).
// 팔다리는 관절 선(어깨→팔꿈치→손목)을 따라 굵기가 변하는 관 윤곽(tube)이라, 스펙 작성 스크립트에서
// armJoints/legJoints로 관절 좌표를 얻어 경혈·근육 같은 표지를 정확히 얹을 수 있다.
const r1 = n => +(+n).toFixed(1);
const rad = d => d * Math.PI / 180;

/** 닫힌 점열을 Catmull-Rom 곡선(부드러운 3차 베지어)으로 */
function smoothClosed(P) {
  const n = P.length, f = ([x, y]) => `${r1(x)},${r1(y)}`;
  let d = `M${f(P[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    d += ` C${f([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${f([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${f(p2)}`;
  }
  return d + 'Z';
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
  const out = [path(limbShape(joints, L, ARM_PROF), el)];
  if (el.hand !== false) out.push(...hand({ ...el, at: joints[2], len: handLen, angle: Math.atan2(dirForearm[0], dirForearm[1]) * 180 / Math.PI, flip: el.flip }));
  return out;
}

/** foot: 발목 at, len(발 길이), view 'side'(발끝이 +x, flip이면 -x)|'front' */
function foot(el) {
  const [x, y] = el.at, L = el.len ?? 60, f = el.flip ? -1 : 1;
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
  const out = [path(limbShape(joints, L, LEG_PROF), el)];
  if (el.foot !== false) out.push(...foot({ ...el, at: [joints[2][0], joints[2][1] + L * 0.04], len: L * 0.5, view: el.view === 'side' ? 'side' : 'front' }));
  return out;
}

/** head: 중심 at, h(머리 높이), view 'side'(얼굴이 +x)|'front', flip */
function head(el) {
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

export const ANATOMY = { body, torso, arm, hand, leg, foot, head };
