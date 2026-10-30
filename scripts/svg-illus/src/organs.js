// 장기·구조 일반 부품: thorax(흉곽 정면 단면: 갈비뼈·폐·횡격막·기관).
// 픽셀 좌표의 path·line 요소 배열을 돌려준다. 호흡 외에 흉부 단면이 필요한 그림(기흉, 폐 부피, 늑골 골절 등)에도 쓴다.
import { smoothOpen, smoothClosed } from './anatomy.js';
const r1 = n => +(+n).toFixed(1);
const st = (el, extra) => ({ px: true, obstacle: false, ...extra });

/** 횡격막 점열(왼쪽 끝→오른쪽 끝). inh=0 날숨(돔이 높음), 1 들숨(납작·낮음) */
function diaphragmPts(cx, top, h, hw, inh) {
  const yb = top + h * (0.86 + 0.04 * inh), yc = top + h * (0.62 + 0.28 * inh), ym = yc + (yb - yc) * 0.6;
  return [[cx - 0.8 * hw, yb], [cx - 0.42 * hw, ym], [cx, yc], [cx + 0.42 * hw, ym], [cx + 0.8 * hw, yb]];
}

/** thorax: at=[가운데 x, 윗끝 y], w(최대 폭), h(높이), inhale 0~1(0 날숨·1 들숨), ribs(갈비뼈 쌍 수, 기본 4),
 *  airway:false로 기관 생략, ghost: 다른 상태 inhale 값이면 그 횡격막을 점선으로 겹침, lungFill/ribStroke/diaphragmStroke 색 */
function thorax(el) {
  const [cx, top] = el.at, w = el.w ?? 170, h = el.h ?? 150, inh = Math.min(1, Math.max(0, el.inhale ?? 0));
  const hw = (w / 2) * (0.84 + 0.16 * inh), n = el.ribs ?? 4;
  const D = diaphragmPts(cx, top, h, hw, inh), yb = D[0][1];
  const out = [];
  const cage = [[cx - 0.8 * hw, yb], [cx - 0.95 * hw, top + 0.74 * h], [cx - hw, top + 0.5 * h], [cx - 0.88 * hw, top + 0.26 * h], [cx - 0.6 * hw, top + 0.09 * h], [cx, top],
    [cx + 0.6 * hw, top + 0.09 * h], [cx + 0.88 * hw, top + 0.26 * h], [cx + hw, top + 0.5 * h], [cx + 0.95 * hw, top + 0.74 * h], [cx + 0.8 * hw, yb]];
  out.push({ type: 'path', d: smoothOpen(cage) + 'Z', stroke: 'none', fill: el.fill ?? 'gray-f', width: 0, ...st(el) });
  // 폐
  const lung = s => {
    const X = u => cx + s * u * hw, dyc = D[2][1], dym = D[1][1], dye = D[0][1];
    return [[X(0.1), top + 0.17 * h], [X(0.34), top + 0.08 * h], [X(0.68), top + 0.17 * h], [X(0.88), top + 0.4 * h], [X(0.88), top + 0.66 * h], [X(0.78), dye - 4], [X(0.42), dym - 3], [X(0.1), dyc - 3]];
  };
  for (const s of [-1, 1]) out.push({ type: 'path', d: smoothClosed(lung(s)), stroke: el.lungStroke ?? 'rose', fill: el.lungFill ?? 'rose-f', width: 2, ...st(el) });
  // 기관·기관지
  if (el.airway !== false) {
    const tw = Math.max(5, hw * 0.1), y0 = top - h * 0.2, y1 = top + h * 0.22;
    const tube = (a, b, k) => [{ type: 'line', from: a, to: b, stroke: 'gray', width: (tw + 3) * k, ...st(el) }, { type: 'line', from: a, to: b, stroke: el.airwayFill ?? 'blue-f', width: (tw - 1) * k, ...st(el) }];
    out.push(...tube([cx, y0], [cx, y1], 1));
    for (const s of [-1, 1]) out.push(...tube([cx, y1], [cx + s * 0.34 * hw, top + 0.36 * h], 0.65));
  }
  // 갈비뼈: 정면에서 가운데에서 바깥·아래로 내려가는 호. 들숨에서는 위로 들려 기울기가 줄어든다.
  const drop = h * (0.1 - 0.05 * inh), ex = [0.8, 0.92, 0.96, 0.95, 0.9, 0.86];
  for (let k = 0; k < n; k++) {
    const yk = top + h * (0.14 + 0.13 * k - 0.02 * inh * k);
    for (const s of [-1, 1]) {
      const X = u => r1(cx + s * u * hw), e = ex[Math.min(k, ex.length - 1)];
      out.push({ type: 'path', d: `M${X(0.06)},${r1(yk - 3)} C${X(0.3)},${r1(yk + drop * 0.1)} ${X(e * 0.7)},${r1(yk + drop * 0.5)} ${X(e)},${r1(yk + drop)}`, stroke: el.ribStroke ?? 'gray', fill: 'none', width: 2.4, ...st(el) });
    }
  }
  // 횡격막
  if (el.ghost !== undefined && el.ghost !== null) out.push({ type: 'path', d: smoothOpen(diaphragmPts(cx, top, h, hw, Math.min(1, Math.max(0, el.ghost)))), stroke: el.diaphragmStroke ?? 'amber', fill: 'none', width: 2, dash: '5 4', ...st(el) });
  out.push({ type: 'path', d: smoothOpen(D), stroke: el.diaphragmStroke ?? 'amber', fill: 'none', width: 3.4, ...st(el) });
  out.push({ type: 'path', d: smoothOpen(cage), stroke: el.stroke ?? 'fg', fill: 'none', width: el.width ?? 2.2, ...st(el) });
  return out;
}

export const ORGANS = { thorax };
