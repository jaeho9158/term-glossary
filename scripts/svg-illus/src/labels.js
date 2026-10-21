// 라벨 자동 배치: 경계상자 추정 → 다른 라벨·선분·작은 점·캔버스 밖과 겹치면 가까운 빈자리로 옮긴다.
// 많이 옮기면(기본 16px 초과) 원래 자리에서 라벨까지 지시선을 긋는다.
import { estimateTextWidth, hasFrac, FRAC_BOX } from './markup.js';

export function labelBox(L, x = L.x, y = L.y, measure = estimateTextWidth) {
  const w = measure(L.text, L.size);
  const x0 = L.anchor === 'middle' ? x - w / 2 : L.anchor === 'end' ? x - w : x;
  if (hasFrac(L.text)) return { x0, x1: x0 + w, y0: y - L.size * FRAC_BOX.up, y1: y + L.size * FRAC_BOX.down };
  return { x0, x1: x0 + w, y0: y - L.size * 1.02, y1: y + L.size * 0.5 };
}

export const boxesOverlap = (a, b, pad = 2) =>
  a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

/** 선분 [x1,y1,x2,y2]가 상자와 만나는지(Liang–Barsky). */
export function segmentHitsBox(s, b) {
  const [x1, y1, x2, y2] = s; let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const P = [-dx, dx, -dy, dy], Q = [x1 - b.x0, b.x1 - x1, y1 - b.y0, b.y1 - y1];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) { if (Q[i] < 0) return false; }
    else { const t = Q[i] / P[i]; if (P[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); if (t0 > t1) return false; }
  }
  return true;
}

function collides(b, placed, obs, W, H) {
  if (b.x0 < 2 || b.y0 < 2 || b.x1 > W - 2 || b.y1 > H - 2) return 'canvas';
  for (const p of placed) if (boxesOverlap(b, p.box)) return 'label:' + p.text;
  const inner = { x0: b.x0 + 0.5, x1: b.x1 - 0.5, y0: b.y0 + 1, y1: b.y1 - 1 };
  for (const s of obs.segments) if (segmentHitsBox(s, inner)) return 'line';
  for (const c of obs.boxes) if (boxesOverlap(inner, c, 0)) return 'dot';
  return null;
}

/**
 * labels: [{x,y,text,size,anchor,fixed,leader}] (x,y는 px, 글자 기준선)
 * obstacles: {segments:[[x1,y1,x2,y2]], boxes:[{x0,y0,x1,y1}]}
 * 반환: {labels(위치 갱신·box 포함), leaders:[[ax,ay,bx,by]], unresolved:[{text,why}], collisionsBefore}
 */
export function placeLabels(labels, obstacles, W, H, opts = {}) {
  const measure = opts.measureText || estimateTextWidth;
  const leaderMin = opts.leaderMin ?? 16;
  const obs = { segments: [...(obstacles.segments || [])], boxes: [...(obstacles.boxes || [])] };
  const cand = [];
  for (let dy = -48; dy <= 48; dy += 3) for (let dx = -90; dx <= 90; dx += 6) cand.push([dx, dy]);
  cand.sort((a, b) => Math.hypot(a[0], a[1] * 1.4) - Math.hypot(b[0], b[1] * 1.4));
  const placed = [], leaders = [], unresolved = [];
  let before = 0;
  for (const L of labels) {
    let b = labelBox(L, L.x, L.y, measure);
    const why = opts.avoid === false || L.avoid === false ? null : collides(b, placed, obs, W, H);
    if (why) {
      before++;
      let best = null;
      if (!L.fixed) for (const [dx, dy] of cand) {
        const bb = labelBox(L, L.x + dx, L.y + dy, measure);
        if (!collides(bb, placed, obs, W, H)) { best = [dx, dy, bb]; break; }
      }
      if (best) {
        const [dx, dy, bb] = best; const ax = L.x, ay = L.y - L.size * 0.3;
        L.x += dx; L.y += dy; b = bb;
        if (L.leader !== false && Math.hypot(dx, dy) > leaderMin) {
          const seg = [ax, ay, ...nearestOnBox(ax, ay, bb)];
          leaders.push(seg); obs.segments.push(seg);
        }
      } else unresolved.push({ text: L.text, why });
    }
    if (Array.isArray(L.leader)) { // 명시 지시선: 지정 점 → 라벨 상자의 가장 가까운 점
      const seg = [L.leader[0], L.leader[1], ...nearestOnBox(L.leader[0], L.leader[1], b)];
      leaders.push(seg); obs.segments.push(seg);
    }
    L.box = b; placed.push(L);
  }
  return { labels, leaders, unresolved, collisionsBefore: before };
}

function nearestOnBox(x, y, b) {
  return [Math.min(Math.max(x, b.x0 - 2), b.x1 + 2), Math.min(Math.max(y, b.y0 - 1), b.y1 + 1)];
}
