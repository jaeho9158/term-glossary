// 치아 일반 부품: tooth(앞니·견치·소구치·대구치의 치관과 치근). 픽셀 좌표의 path 요소 배열을 돌려준다.
// 교합·치열·치아 질환 그림에서 위아래 치아를 나란히 놓을 때 쓴다(윗니는 위로, 아랫니는 아래로 자란다).
const r1 = n => +(+n).toFixed(1);
const st = (el, extra) => ({ px: true, obstacle: false, ...extra });

// 단위 좌표: u(-0.5..0.5, 가운데 0), v(0 = 씹는 면, 1 = 치관 끝 목선). 점열은 M/L/Q 조각 [명령, ...좌표].
const CROWN = {
  incisor: [['M', -0.5, 0.06], ['L', 0.5, 0.06], ['L', 0.38, 1], ['L', -0.38, 1]],
  canine: [['M', 0, 0], ['Q', 0.3, 0.12, 0.5, 0.42], ['L', 0.4, 1], ['L', -0.4, 1], ['L', -0.5, 0.42], ['Q', -0.3, 0.12, 0, 0]],
  premolar: [['M', -0.5, 0.3], ['L', -0.28, 0], ['L', -0.07, 0.2], ['L', 0.07, 0.2], ['L', 0.28, 0], ['L', 0.5, 0.3], ['L', 0.42, 1], ['L', -0.42, 1]],
  molar: [['M', -0.5, 0.25], ['L', -0.36, 0], ['L', -0.2, 0.18], ['L', -0.05, 0], ['L', 0.1, 0.2], ['L', 0.27, 0], ['L', 0.5, 0.25], ['L', 0.46, 1], ['L', -0.46, 1]],
};
// 치근: [시작 u 왼, 시작 u 오른, 끝 u, 길이 배율(치관 높이 기준)] 목록
const ROOTS = {
  incisor: [[-0.34, 0.34, 0, 1.25]],
  canine: [[-0.36, 0.36, 0, 1.6]],
  premolar: [[-0.38, 0.38, 0, 1.3]],
  molar: [[-0.44, -0.04, -0.28, 1.15], [0.04, 0.44, 0.28, 1.15]],
};

/** tooth: at=[가운데 x, 씹는 면 y], kind(incisor|canine|premolar|molar, 기본 molar), jaw(upper|lower, 기본 upper),
 *  w(폭, 기본 30), h(치관 높이, 기본 0.9w), root:false면 치근 생략, crownFill(기본 bg)/rootFill(기본 gray-f)/stroke */
function tooth(el) {
  const kind = CROWN[el.kind] ? el.kind : 'molar', [cx, y0] = el.at, w = el.w ?? 30, h = el.h ?? 0.9 * w, s = el.jaw === 'lower' ? 1 : -1;
  const X = u => r1(cx + u * w), Y = v => r1(y0 + s * v * h);
  const pt = (u, v) => `${X(u)},${Y(v)}`;
  const d = parts => parts.map(([c, ...p]) => c + (c === 'Q' ? `${pt(p[0], p[1])} ${pt(p[2], p[3])}` : pt(p[0], p[1]))).join(' ') + 'Z';
  const out = [];
  if (el.root !== false) for (const [a, b, e, k] of ROOTS[kind]) {
    const tip = [e, 1 + k];
    out.push({ type: 'path', d: `M${X(a)},${Y(1)} Q${X(a * 0.6 + e * 0.4)},${Y(1 + k * 0.55)} ${X(e)},${Y(tip[1])} Q${X(b * 0.6 + e * 0.4)},${Y(1 + k * 0.55)} ${X(b)},${Y(1)}Z`, stroke: el.stroke ?? 'fg', fill: el.rootFill ?? 'gray-f', width: el.width ?? 1.8, ...st(el) });
  }
  out.push({ type: 'path', d: d(CROWN[kind]), stroke: el.stroke ?? 'fg', fill: el.crownFill ?? 'bg', width: el.width ?? 1.8, ...st(el) });
  return out;
}

export const DENTAL = { tooth };
