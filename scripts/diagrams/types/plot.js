// plot: 함수 곡선(분포, ROC, 용량-반응…). 스펙은 함수 이름·매개변수만, 점은 plot-fns.js가 계산.
// 눈금 숫자는 기본으로 숨기고 figure에 "개념 설명용 모식도" 캡션을 단다.
"use strict";
const { FS_SUB, FS_NOTE, MARGIN, COLORS, SERIES_COLORS, AXIS_COLOR: AXIS, r1, textWidth } = require("../core.js");
const { FNS, checkParams, sample } = require("../plot-fns.js");

const PW = 440, PH = 200;

// 눈금: 구간 [lo, hi]를 4~8칸쯤으로 나누는 1·2·5×10^k 간격. 값은 정수 배수로 만들어
// 부동소수 찌꺼기가 없고, 소수 자리는 간격이 요구하는 만큼(0.005 → 3자리).
function niceTicks(lo, hi) {
  const raw = (hi - lo) / 5;
  if (!(raw > 0)) return [];
  const e = Math.floor(Math.log10(raw)), mag = 10 ** e, norm = raw / mag;
  const m = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  const step = m * mag;
  const dec = Math.max(0, -(m === 10 ? e + 1 : e));
  const out = [];
  for (let k = Math.ceil(lo / step - 1e-9); k <= Math.floor(hi / step + 1e-9); k++) {
    const v = k * step;
    out.push({ v, t: k === 0 ? "0" : v.toFixed(dec) });
  }
  return out;
}
const colorOf = (s, i) => s.color || SERIES_COLORS[i];
const arr = (v) => (Array.isArray(v) ? v : []);

function validate(spec) {
  const p = spec.plot;
  if (!p || typeof p !== "object") return ["plot 없음"];
  const errs = [];
  if (arr(spec.nodes).length || arr(spec.edges).length) errs.push("plot은 nodes·edges를 쓰지 않음");
  const S = arr(p.series);
  if (S.length < 1 || S.length > 3) errs.push(`plot series는 1~3개: ${S.length}개`);
  const isRoc = S.some((s) => s && s.fn === "roc");
  if (isRoc && S.some((s) => !s || s.fn !== "roc")) errs.push("roc는 다른 함수와 섞을 수 없음");
  for (const s of S) {
    if (!s || typeof s !== "object") { errs.push("plot series 항목이 객체가 아님"); continue; }
    errs.push(...checkParams(s.fn, s.params));
    if (s.color && !COLORS.includes(s.color)) errs.push(`알 수 없는 color: ${s.color}`);
  }
  if (!p.x || !p.x.label) errs.push("plot x.label 없음");
  if (!p.y || !p.y.label) errs.push("plot y.label 없음");
  const range = isRoc ? [0, 1] : p.x && p.x.range;
  const rangeOk = Array.isArray(range) && range.length === 2 && range.every(Number.isFinite) && range[0] < range[1];
  if (!rangeOk) errs.push("plot x.range는 [작은 수, 큰 수]");
  const shade = arr(p.shade);
  if (shade.length > 2) errs.push(`plot shade는 0~2개: ${shade.length}개`);
  for (const sh of shade) {
    if (!sh || typeof sh !== "object") { errs.push("plot shade 항목이 객체가 아님"); continue; }
    if (!Number.isInteger(sh.series) || sh.series < 0 || sh.series >= S.length) errs.push(`plot shade의 series 번호가 올바르지 않음: ${sh.series}`);
    const okEnd = (v) => v === null || v === undefined || Number.isFinite(v);
    if (!okEnd(sh.from) || !okEnd(sh.to)) errs.push("plot shade from·to는 숫자 또는 null");
    else if (Number.isFinite(sh.from) && Number.isFinite(sh.to) && !(sh.from < sh.to)) errs.push("plot shade from < to 이어야 함");
  }
  const vlines = arr(p.vlines);
  if (vlines.length > 3) errs.push(`plot vlines는 0~3개: ${vlines.length}개`);
  for (const v of vlines) {
    if (!v || !Number.isFinite(v.x) || (rangeOk && (v.x < range[0] || v.x > range[1]))) errs.push(`plot vlines x가 범위 밖: ${v && v.x}`);
  }
  if (!errs.length) {
    for (const s of S) {
      const pts = sample(s.fn, s.params, range[0], range[1]);
      if (!pts.length || pts.some(([, y]) => !Number.isFinite(y))) errs.push(`${s.fn}: 범위 안에서 계산값이 유한하지 않음`);
    }
  }
  return errs;
}

function layout(cv, spec) {
  const p = spec.plot, S = p.series;
  const isRoc = S[0].fn === "roc";
  const [xlo, xhi] = isRoc ? [0, 1] : p.x.range;
  const data = S.map((s) => sample(s.fn, s.params, xlo, xhi));
  let ylo, yhi, ytop;
  if (isRoc) { ylo = 0; yhi = 1; ytop = 1; } else {
    const ys = data.flat().map((d) => d[1]);
    ylo = Math.min(0, ...ys);
    yhi = Math.max(...ys);
    if (yhi === ylo) yhi = ylo + 1;
    ytop = yhi; // 눈금은 데이터 범위까지만(위 여백 12%에는 안 단다)
    yhi += (yhi - ylo) * 0.12;
  }
  const xTicks = p.x.ticks ? niceTicks(xlo, xhi) : [];
  const yTicks = p.y.ticks ? niceTicks(ylo, ytop) : [];
  const yTickW = yTicks.length ? Math.max(...yTicks.map((t) => textWidth(t.t, FS_SUB))) + 10 : 0;
  const left = MARGIN + yTickW + 6, top = MARGIN + FS_NOTE + 12;
  const X = (x) => left + ((x - xlo) / (xhi - xlo)) * PW;
  const Y = (y) => top + PH - ((y - ylo) / (yhi - ylo)) * PH;
  const baseY = Y(ylo <= 0 && 0 <= yhi ? 0 : ylo);

  // y축 이름은 축 위 왼쪽에 가로로(회전 글자는 겹침 검사가 어렵다)
  cv.text(left, MARGIN + FS_NOTE, p.y.label, { fs: FS_NOTE, bold: true, fill: AXIS, anchor: "start", owner: "axis-y" });

  // 음영 → 축 → 곡선 순서로 칠한다(곡선이 위에 오게)
  for (const sh of p.shade || []) {
    const s = S[sh.series];
    const a = Math.max(xlo, sh.from ?? xlo), b = Math.min(xhi, sh.to ?? xhi);
    const pts = sample(s.fn, s.params, a, b, 60);
    if (!pts.length) continue;
    const d = `M${r1(X(pts[0][0]))},${r1(baseY)} ` + pts.map(([x, y]) => `L${r1(X(x))},${r1(Y(y))}`).join(" ") + ` L${r1(X(pts[pts.length - 1][0]))},${r1(baseY)} Z`;
    cv.parts.push(`<path d="${d}" fill="var(--dg-${colorOf(s, sh.series)}-f)" stroke="none"/>`);
  }
  cv.line(left, top + PH, left + PW + 8, top + PH, "arrow", "var(--dg-gray-s)");
  cv.line(left, top + PH, left, top - 8, "arrow", "var(--dg-gray-s)");
  if (isRoc) cv.parts.push(`<line x1="${r1(X(0))}" y1="${r1(Y(0))}" x2="${r1(X(1))}" y2="${r1(Y(1))}" stroke="var(--dg-gray-s)" stroke-width="1" stroke-dasharray="4,3"/>`);
  data.forEach((pts, i) => {
    const d = "M" + pts.map(([x, y]) => `${r1(X(x))},${r1(Y(y))}`).join(" L");
    cv.parts.push(`<path d="${d}" fill="none" stroke="var(--dg-${colorOf(S[i], i)}-s)" stroke-width="2.2"/>`);
  });
  for (const v of p.vlines || []) {
    const vx = X(v.x);
    cv.parts.push(`<line x1="${r1(vx)}" y1="${r1(top)}" x2="${r1(vx)}" y2="${r1(top + PH)}" stroke="var(--dg-navy)" stroke-width="1.2" stroke-dasharray="4,3"/>`);
    if (!v.label) continue;
    // 오른쪽에 붙이면 도식 밖으로 나가는 라벨은 선 왼쪽에 끝을 맞춘다.
    const right = vx + 4 + textWidth(v.label, FS_SUB, true) > left + PW + 8;
    cv.text(right ? vx - 4 : vx + 4, top + FS_SUB, v.label, { fs: FS_SUB, bold: true, fill: "var(--dg-navy)", anchor: right ? "end" : "start", owner: "vline" });
  }
  for (const sh of p.shade || []) {
    if (!sh.label) continue;
    const s = S[sh.series];
    const a = Math.max(xlo, sh.from ?? xlo), b = Math.min(xhi, sh.to ?? xhi);
    const xm = (a + b) / 2;
    const ym = FNS[s.fn].f(xm, s.params);
    cv.text(X(xm), Y(ylo + (ym - ylo) * 0.4) + 4, sh.label, { fs: FS_SUB, bold: true, fill: `var(--dg-${colorOf(s, sh.series)}-t)`, owner: "shade" });
  }
  let y = top + PH;
  if (p.x.ticks) {
    y += FS_SUB + 6;
    for (const t of xTicks) cv.text(X(t.v), y, t.t, { fs: FS_SUB, fill: AXIS, owner: "tick" });
  }
  if (p.y.ticks) {
    for (const t of yTicks) cv.text(left - 6, Y(t.v) + 4, t.t, { fs: FS_SUB, fill: AXIS, anchor: "end", owner: "tick" });
  }
  y += FS_NOTE + 10;
  cv.text(left + PW / 2, y, p.x.label, { fs: FS_NOTE, bold: true, fill: AXIS, owner: "axis-x" });
  const labeled = S.map((s, i) => ({ s, i })).filter((o) => o.s.label);
  if (labeled.length) {
    y += FS_NOTE + 10;
    let lx = left;
    for (const { s, i } of labeled) {
      const w = 22 + textWidth(s.label, FS_SUB) + 16;
      if (lx > left && lx + w > left + PW) { lx = left; y += FS_SUB + 8; }
      cv.parts.push(`<line x1="${r1(lx)}" y1="${r1(y - 4)}" x2="${r1(lx + 16)}" y2="${r1(y - 4)}" stroke="var(--dg-${colorOf(s, i)}-s)" stroke-width="2.2"/>`);
      cv.text(lx + 22, y, s.label, { fs: FS_SUB, fill: "var(--dg-navy)", anchor: "start", owner: "legend" });
      lx += w;
    }
  }
  // 곡선 표본점이 수직선·음영 라벨 사각형 안에 들어오면 경고
  const pts = data.flatMap((d) => d.map(([x, yv]) => [X(x), Y(yv)]));
  for (const t of cv.texts) {
    if (t.owner !== "vline" && t.owner !== "shade") continue;
    if (pts.some(([px, py]) => px > t.x && px < t.x + t.w && py > t.y && py < t.y + t.h)) cv.warns.push(`곡선이 라벨을 가림: "${t.label}"`);
  }
  return { w: left + PW + 8 + MARGIN, h: y + MARGIN - 6 };
}

function describe(spec, title) {
  const p = spec.plot;
  const series = p.series.map((s) => `${s.label ? `${s.label}: ` : ""}${FNS[s.fn] ? FNS[s.fn].desc : s.fn}`);
  let t = `${title}: 가로축 ${p.x.label}, 세로축 ${p.y.label}. ${series.join(", ")}.`;
  const shades = (p.shade || []).filter((s) => s.label).map((s) => s.label);
  if (shades.length) t += ` 음영: ${shades.join(", ")}.`;
  const vl = (p.vlines || []).filter((v) => v.label).map((v) => v.label);
  if (vl.length) t += ` 기준선: ${vl.join(", ")}.`;
  return t;
}

module.exports = { validate, layout, describe, dual: () => false, caption: "개념 설명용 모식도 — 실제 데이터가 아닙니다" };
