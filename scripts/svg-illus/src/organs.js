// 장기·구조 일반 부품: thorax(흉곽 정면 단면), brain(옆모습 뇌), gut(소화관 개략), kidney(신장, 선택적으로 부신).
// 픽셀 좌표의 path·line 요소 배열을 돌려준다. 호흡 외에 흉부 단면이 필요한 그림(기흉, 폐 부피, 늑골 골절 등)에도 쓴다.
import { smoothOpen, smoothClosed } from './anatomy.js';
const r1 = n => +(+n).toFixed(1);
const st = (el, extra) => ({ px: true, obstacle: false, ...extra });

/** 횡격막 점열(왼쪽 끝→오른쪽 끝). inh=0 날숨(돔이 높음), 1 들숨(납작·낮음) */
function diaphragmPts(cx, top, h, hw, inh) {
  const yb = top + h * (0.86 + 0.04 * inh), yc = top + h * (0.62 + 0.22 * inh), ym = yc + (yb - yc) * 0.6;
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
    return [[X(0.1), top + 0.17 * h], [X(0.34), top + 0.08 * h], [X(0.68), top + 0.17 * h], [X(0.88), top + 0.4 * h], [X(0.88), top + 0.66 * h], [X(0.78), dye - 7], [X(0.42), dym - 6], [X(0.1), dyc - 6]];
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

const tube = (d, w, inner, el, outer = 'gray') => [
  { type: 'path', d, stroke: outer, fill: 'none', width: w + 3, ...st(el) },
  { type: 'path', d, stroke: inner, fill: 'none', width: w - 1, ...st(el) }];

/** brain: 옆에서 본 뇌(대뇌 윤곽·주름 고랑·소뇌·뇌간). at=[가운데 x, 윗끝 y], w(폭, 기본 120), 높이는 0.72w.
 *  flip:true면 얼굴(앞)이 왼쪽. fill/stroke, foldStroke, cerebellumFill 색 */
function brain(el) {
  const [cx, top] = el.at, w = el.w ?? 120, h = w * 0.72, f = el.flip ? -1 : 1;
  const X = u => cx + f * (u - 0.5) * w, Y = v => top + v * h;
  const P = pts => pts.map(([u, v]) => [X(u), Y(v)]);
  const out = [];
  const cer = P([[0.58, 0.72], [0.72, 0.66], [0.9, 0.7], [0.96, 0.82], [0.84, 0.95], [0.66, 0.92]]);
  out.push({ type: 'path', d: smoothClosed(cer), stroke: el.stroke ?? 'fg', fill: el.cerebellumFill ?? 'violet-f', width: el.width ?? 2, ...st(el) });
  out.push({ type: 'path', d: `M${r1(X(0.5))},${r1(Y(0.78))} L${r1(X(0.5))},${r1(Y(1.12))} L${r1(X(0.58))},${r1(Y(1.12))} L${r1(X(0.6))},${r1(Y(0.78))}`, stroke: el.stroke ?? 'fg', fill: el.stemFill ?? 'gray-f', width: el.width ?? 2, ...st(el) });
  const cere = P([[0.04, 0.58], [0.02, 0.38], [0.14, 0.16], [0.36, 0.03], [0.62, 0.02], [0.86, 0.12], [0.98, 0.34], [0.95, 0.58], [0.8, 0.7], [0.58, 0.72], [0.4, 0.84], [0.22, 0.78]]);
  out.push({ type: 'path', d: smoothClosed(cere), stroke: el.stroke ?? 'fg', fill: el.fill ?? 'rose-f', width: el.width ?? 2, ...st(el) });
  const folds = [
    [[0.3, 0.12], [0.34, 0.26], [0.26, 0.4], [0.32, 0.54]],
    [[0.5, 0.08], [0.56, 0.22], [0.48, 0.36], [0.56, 0.5]],
    [[0.72, 0.14], [0.78, 0.28], [0.7, 0.42], [0.76, 0.56]],
    [[0.14, 0.34], [0.22, 0.44], [0.16, 0.54]]];
  for (const fo of folds) out.push({ type: 'path', d: smoothOpen(P(fo)), stroke: el.foldStroke ?? 'rose', fill: 'none', width: 1.6, ...st(el) });
  return out;
}

/** gut: 배 속 소화관 개략(대장 테두리 + 구불구불한 소장). at=[가운데 x, 윗끝 y], w(기본 90), h(기본 100).
 *  fill(소장 색), colonFill(대장 색), colon:false(대장 테두리 생략) */
function gut(el) {
  const [cx, top] = el.at, w = el.w ?? 90, h = el.h ?? 100, L = cx - w / 2, Rr = cx + w / 2;
  const out = [];
  const colon = `M${r1(Rr - 6)},${r1(top + h)} L${r1(Rr - 6)},${r1(top + 6)} L${r1(L + 6)},${r1(top + 6)} L${r1(L + 6)},${r1(top + h * 0.78)} L${r1(cx - w * 0.12)},${r1(top + h * 0.78)} L${r1(cx - w * 0.12)},${r1(top + h)}`;
  if (el.colon !== false) out.push(...tube(colon, 9, el.colonFill ?? 'amber-f', el));
  const rows = 5, pts = [];
  for (let k = 0; k < rows; k++) {
    const y = top + h * (0.2 + 0.12 * k), a = L + 0.2 * w, b = Rr - 0.2 * w;
    pts.push(...(k % 2 ? [[b, y], [a, y]] : [[a, y], [b, y]]));
  }
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
    if (k % 2) d += ` L${r1(x1)},${r1(y1)}`; else { const bx = x1 + (x1 > cx ? 11 : -11); d += ` C${r1(bx)},${r1(y0)} ${r1(bx)},${r1(y1)} ${r1(x1)},${r1(y1)}`; }
  }
  out.push(...tube(d, 7, el.fill ?? 'rose-f', el));
  return out;
}

/** kidney: 신장(콩팥) 윤곽 + 피질·수질 경계 + 신문(오목한 쪽). at=[가운데 x, 윗끝 y], h(세로, 기본 70), 폭은 0.62h.
 *  flip:true면 신문이 오른쪽(왼쪽 신장). adrenal:true면 위쪽에 부신(작은 삼각 모양 샘)을 얹는다(adrenalFill). fill/cortexFill/stroke */
function kidney(el) {
  const [cx, top] = el.at, h = el.h ?? 70, w = 0.62 * h, f = el.flip ? -1 : 1;
  const X = u => cx + f * (u - 0.5) * w, Y = v => top + v * h;
  const P = pts => pts.map(([u, v]) => [X(u), Y(v)]);
  const out = [];
  const body = P([[0.55, 0.0], [0.88, 0.1], [1.0, 0.4], [0.96, 0.72], [0.72, 0.98], [0.42, 1.0], [0.2, 0.84], [0.3, 0.62], [0.3, 0.4], [0.16, 0.2], [0.3, 0.04]]);
  out.push({ type: 'path', d: smoothClosed(body), stroke: el.stroke ?? 'fg', fill: el.fill ?? 'rose-f', width: el.width ?? 2, ...st(el) });
  const med = P([[0.56, 0.2], [0.8, 0.3], [0.84, 0.5], [0.74, 0.74], [0.54, 0.8], [0.44, 0.62], [0.46, 0.4]]);
  out.push({ type: 'path', d: smoothClosed(med), stroke: el.stroke ?? 'fg', fill: el.cortexFill ?? 'rose-f', fillOpacity: 0.55, width: 1.2, ...st(el) });
  if (el.adrenal) {
    const ad = P([[0.3, -0.04], [0.5, -0.2], [0.78, -0.14], [0.86, 0.0], [0.6, 0.02], [0.4, 0.08]]);
    out.push({ type: 'path', d: smoothClosed(ad), stroke: el.stroke ?? 'fg', fill: el.adrenalFill ?? 'amber-f', width: el.width ?? 2, ...st(el) });
  }
  return out;
}

export const ORGANS = { thorax, brain, gut, kidney };
