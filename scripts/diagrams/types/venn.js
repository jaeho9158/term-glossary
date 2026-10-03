// venn: 집합 2~3개의 겹침. 원은 반투명 채움, 영역 라벨은 그 영역 안쪽 대표점에.
"use strict";
const { FS, FS_SUB, MARGIN, SERIES_COLORS, r1, wrap, validateNodes } = require("../core.js");

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

function layout(cv, spec) {
  const n = spec.nodes.length;
  const r = n === 2 ? 92 : 84;
  const d = n === 2 ? 58 : 56;
  const rel = n === 2
    ? [[-d, 0], [d, 0]]
    : [[0, -d], [-d * Math.cos(Math.PI / 6), d * Math.sin(Math.PI / 6)], [d * Math.cos(Math.PI / 6), d * Math.sin(Math.PI / 6)]];
  const minX = Math.min(...rel.map((c) => c[0])) - r, maxX = Math.max(...rel.map((c) => c[0])) + r;
  const minY = Math.min(...rel.map((c) => c[1])) - r, maxY = Math.max(...rel.map((c) => c[1])) + r;
  const labTop = FS + 8; // 위쪽 집합 이름 줄
  const ox = MARGIN - minX, oy = MARGIN + labTop - minY;
  const C = rel.map(([x, y]) => [x + ox, y + oy]);
  const colorOf = (i) => spec.nodes[i].color || SERIES_COLORS[i];
  spec.nodes.forEach((nd, i) => {
    const c = colorOf(i);
    cv.parts.push(`<circle cx="${r1(C[i][0])}" cy="${r1(C[i][1])}" r="${r}" fill="var(--dg-${c}-f)" fill-opacity="0.6" stroke="var(--dg-${c}-s)" stroke-width="1.4"/>`);
  });
  // 집합 이름: 2개면 각 원 위 바깥, 3개면 위 원은 위, 아래 두 원은 아래 바깥.
  let bottom = maxY + oy;
  spec.nodes.forEach((nd, i) => {
    const [x, y] = C[i];
    const below = n === 3 && i > 0;
    const side = n === 2 ? (i === 0 ? -1 : 1) : below ? (i === 1 ? -1 : 1) : 0;
    const ty = below ? y + r + FS + 4 : y - r - 6;
    cv.text(x + side * r * 0.35, ty, nd.label, { bold: true, fill: `var(--dg-${colorOf(i)}-t)`, owner: `set-${nd.id}` });
    if (below) bottom = Math.max(bottom, ty + 4);
  });
  // 영역 대표점: 포함 집합 중심들의 평균을 전체 중심에서 바깥으로 민다.
  const idx = new Map(spec.nodes.map((nd, i) => [nd.id, i]));
  const cen = [C.reduce((s, c) => s + c[0], 0) / n, C.reduce((s, c) => s + c[1], 0) / n];
  for (const rg of spec.regions || []) {
    const ins = rg.sets.map((id) => C[idx.get(id)]);
    let px = ins.reduce((s, c) => s + c[0], 0) / ins.length;
    let py = ins.reduce((s, c) => s + c[1], 0) / ins.length;
    const push = ins.length === 1 ? (n === 2 ? 0.6 : 0.75) : ins.length === 2 && n === 3 ? 0.5 : 0;
    px += (px - cen[0]) * push;
    py += (py - cen[1]) * push;
    const lines = wrap(rg.label, n === 2 ? 60 : 58, FS_SUB);
    lines.forEach((l, k) => cv.text(px, py + 4 + (k - (lines.length - 1) / 2) * (FS_SUB + 2), l, { fs: FS_SUB, fill: "var(--dg-navy)", owner: "region" }));
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
