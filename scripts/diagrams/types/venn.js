// venn: 집합 2~3개의 겹침. 원은 반투명 채움, 영역 라벨은 그 영역 안쪽 대표점에.
"use strict";
const { FS, FS_SUB, MARGIN, SERIES_COLORS, r1, textWidth, wrap, validateNodes } = require("../core.js");

function validate(spec) {
  const errs = validateNodes(spec);
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const ids = new Set(nodes.map((n) => n.id));
  const n = ids.size;
  if (n && (n < 2 || n > 3)) errs.push(`venn 집합은 2~3개: ${n}개`);
  if ((Array.isArray(spec.edges) ? spec.edges : []).length) errs.push("venn은 edges를 쓰지 않음");
  const seen = new Set();
  for (const rg of Array.isArray(spec.regions) ? spec.regions : []) {
    if (!rg || typeof rg !== "object") { errs.push("venn 영역 항목이 객체가 아님"); continue; }
    const sets = Array.isArray(rg.sets) ? rg.sets : [];
    if (!sets.length || sets.some((s) => !ids.has(s))) { errs.push(`venn 영역의 sets가 집합 id가 아님: ${JSON.stringify(rg.sets)}`); continue; }
    if (!rg.label) errs.push(`venn 영역 label 없음: ${sets.join("+")}`);
    const key = [...sets].sort().join("+");
    if (seen.has(key)) errs.push(`venn 영역 중복: ${key}`);
    seen.add(key);
  }
  return errs;
}

const LINE_SUB = FS_SUB + 2; // 영역 라벨 줄 간격
const M = 3; // 영역 라벨과 원 테두리 사이 최소 여백

// 영역 라벨 줄들의 사각형(Canvas.text가 기록하는 것과 같은 식). (px,py)가 블록 중심.
function labelRects(lines, px, py) {
  return lines.map((l, k) => {
    const w = textWidth(l, FS_SUB);
    const base = py + 4 + (k - (lines.length - 1) / 2) * LINE_SUB;
    return { x: px - w / 2, y: base - FS_SUB * 0.82, w, h: FS_SUB * 1.08, label: l, base };
  });
}

// 사각형들이 sets의 원 안에 다 들어가고 나머지 원 밖에 다 있으면 남는 여유(≥0), 아니면 음수.
function clearance(rects, C, r, inSet) {
  let slack = Infinity;
  for (const rc of rects) {
    C.forEach(([cx, cy], i) => {
      if (inSet[i]) {
        const far = Math.max(Math.hypot(rc.x - cx, rc.y - cy), Math.hypot(rc.x + rc.w - cx, rc.y - cy),
          Math.hypot(rc.x - cx, rc.y + rc.h - cy), Math.hypot(rc.x + rc.w - cx, rc.y + rc.h - cy));
        slack = Math.min(slack, r - M - far);
      } else {
        const near = Math.hypot(Math.max(rc.x - cx, 0, cx - rc.x - rc.w), Math.max(rc.y - cy, 0, cy - rc.y - rc.h));
        slack = Math.min(slack, near - r - M);
      }
    });
  }
  return slack;
}

const overlaps = (a, b, pad = 2) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

// 집합 이름 자리(원 중심 기준 상대 좌표). 2개면 각 원 위 바깥, 3개면 위 원은 위, 아래 두 원은
// 아래 바깥. 나란한 두 이름이 서로 겹치면 가운데 선을 기준으로 좌우로 벌린다.
function namePlaces(spec, rel, r) {
  const n = rel.length;
  const P = spec.nodes.map((nd, i) => {
    const [x, y] = rel[i];
    const below = n === 3 && i > 0;
    const side = n === 2 ? (i === 0 ? -1 : 1) : below ? (i === 1 ? -1 : 1) : 0;
    return { x: x + side * r * 0.35, y: below ? y + r + FS + 4 : y - r - 6, anchor: "middle", w: textWidth(nd.label, FS, true), below };
  });
  const pair = n === 2 ? [0, 1] : [1, 2];
  const [L, R] = pair.map((i) => P[i]);
  if (L.x + L.w / 2 + 12 > R.x - R.w / 2) {
    const mid = (rel[pair[0]][0] + rel[pair[1]][0]) / 2;
    Object.assign(L, { x: mid - 6, anchor: "end" });
    Object.assign(R, { x: mid + 6, anchor: "start" });
  }
  for (const p of P) p.left = p.anchor === "middle" ? p.x - p.w / 2 : p.anchor === "end" ? p.x - p.w : p.x;
  return P;
}

function layout(cv, spec) {
  const n = spec.nodes.length;
  const r = n === 2 ? 92 : 84;
  const d = n === 2 ? 58 : 56;
  const rel = n === 2
    ? [[-d, 0], [d, 0]]
    : [[0, -d], [-d * Math.cos(Math.PI / 6), d * Math.sin(Math.PI / 6)], [d * Math.cos(Math.PI / 6), d * Math.sin(Math.PI / 6)]];
  const names = namePlaces(spec, rel, r);
  // 폭은 원과 집합 이름 글자를 모두 담게 잡는다.
  const minX = Math.min(...rel.map((c) => c[0] - r), ...names.map((p) => p.left));
  const maxX = Math.max(...rel.map((c) => c[0] + r), ...names.map((p) => p.left + p.w));
  const minY = Math.min(...rel.map((c) => c[1])) - r, maxY = Math.max(...rel.map((c) => c[1])) + r;
  const labTop = FS + 8; // 위쪽 집합 이름 줄
  const ox = MARGIN - minX, oy = MARGIN + labTop - minY;
  const C = rel.map(([x, y]) => [x + ox, y + oy]);
  const colorOf = (i) => spec.nodes[i].color || SERIES_COLORS[i];
  spec.nodes.forEach((nd, i) => {
    const c = colorOf(i);
    cv.parts.push(`<circle cx="${r1(C[i][0])}" cy="${r1(C[i][1])}" r="${r}" fill="var(--dg-${c}-f)" fill-opacity="0.6" stroke="var(--dg-${c}-s)" stroke-width="1.4"/>`);
  });
  let bottom = maxY + oy;
  spec.nodes.forEach((nd, i) => {
    const p = names[i];
    cv.text(p.x + ox, p.y + oy, nd.label, { bold: true, fill: `var(--dg-${colorOf(i)}-t)`, anchor: p.anchor, owner: `set-${nd.id}` });
    if (p.below) bottom = Math.max(bottom, p.y + oy + 4);
  });
  // 영역 라벨: 포함 집합 중심들의 평균을 전체 중심에서 바깥으로 민 점에서 시작한다. 그 자리에서
  // 라벨이 영역(sets의 원 안, 나머지 원 밖)을 벗어나면 격자로 후보점을 훑어 여유가 가장 큰
  // 곳에 둔다. 그래도 없으면 줄바꿈 폭을 줄여 다시 찾고, 끝내 없으면 경고한다.
  const idx = new Map(spec.nodes.map((nd, i) => [nd.id, i]));
  const cen = [C.reduce((s, c) => s + c[0], 0) / n, C.reduce((s, c) => s + c[1], 0) / n];
  const baseW = n === 2 ? 60 : 58;
  const placed = [];
  for (const rg of spec.regions || []) {
    const inSet = spec.nodes.map((nd) => rg.sets.includes(nd.id));
    const ins = rg.sets.map((id) => C[idx.get(id)]);
    let px = ins.reduce((s, c) => s + c[0], 0) / ins.length;
    let py = ins.reduce((s, c) => s + c[1], 0) / ins.length;
    const push = ins.length === 1 ? (n === 2 ? 0.6 : 0.75) : ins.length === 2 && n === 3 ? 0.5 : 0;
    px += (px - cen[0]) * push;
    py += (py - cen[1]) * push;
    const score = (rects) => (rects.some((a) => placed.some((b) => overlaps(a, b))) ? -Infinity : clearance(rects, C, r, inSet));
    let best = null;
    const first = labelRects(wrap(rg.label, baseW, FS_SUB), px, py);
    if (score(first) >= 0) best = first;
    // 후보 영역: sets 원들의 외접 사각형이 겹치는 범위
    const bx0 = Math.max(...ins.map((c) => c[0] - r)), bx1 = Math.min(...ins.map((c) => c[0] + r));
    const by0 = Math.max(...ins.map((c) => c[1] - r)), by1 = Math.min(...ins.map((c) => c[1] + r));
    for (let ww = baseW; !best && ww >= 28; ww -= 6) {
      const lines = wrap(rg.label, ww, FS_SUB);
      let top = -Infinity;
      for (let gx = bx0; gx <= bx1; gx += 2) {
        for (let gy = by0; gy <= by1; gy += 2) {
          const rects = labelRects(lines, gx, gy);
          const sc = score(rects);
          if (sc >= 0 && sc > top) { top = sc; best = rects; }
        }
      }
    }
    if (!best) {
      cv.warns.push(`영역 라벨이 영역에 들어가지 않음: "${rg.label}"`);
      best = first;
    }
    placed.push(...best);
    for (const rc of best) cv.text(rc.x + rc.w / 2, rc.base, rc.label, { fs: FS_SUB, fill: "var(--dg-navy)", owner: "region" });
  }
  return { w: maxX - minX + 2 * MARGIN, h: bottom + MARGIN };
}

function describe(spec, title) {
  const lab = new Map(spec.nodes.map((n) => [n.id, n.label]));
  const sets = spec.nodes.map((n) => n.label).join(", ");
  const regions = (spec.regions || []).map((rg) => `${rg.sets.map((s) => lab.get(s)).join("∩")}: ${rg.label}`);
  return `${title}: ${sets}의 겹침.${regions.length ? ` ${regions.join(", ")}.` : ""}`;
}

module.exports = { validate, layout, describe, dual: () => false };
