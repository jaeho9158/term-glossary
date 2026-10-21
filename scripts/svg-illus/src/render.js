// JSON 스펙 → SVG 문자열 / HTML 조각.
import { toTspan, toHtml, symHtml, kindOf, escapeXml, hasFrac, richTextSvg, autoFrac } from './markup.js';
import { placeLabels } from './labels.js';
import { validate, SpecError, checkExpr } from './validate.js';
import { DEFAULT_PALETTE, colorRef, paletteStyle, TOKENS } from './theme.js';

export const FONT = "'Pretendard','Noto Sans KR','Apple SD Gothic Neo',sans-serif";
const f = n => +(+n).toFixed(1);
const DEG = Math.PI / 180;

/** 극좌표 보조: 중심 c에서 반지름 r, 각도 deg(수학 방향: 오른쪽 0°, 반시계 +)인 점. y는 위로 증가하는 좌표계 기준. */
export function polar(r, deg, c = [0, 0]) { return [c[0] + r * Math.cos(deg * DEG), c[1] + r * Math.sin(deg * DEG)]; }

export function compileFn(expr) {
  if (typeof expr === 'function') return expr;
  const err = checkExpr(expr); if (err) throw new SpecError([err]);
  const body = expr.replace(/\^/g, '**').replace(/[A-Za-z_][A-Za-z0-9_]*/g, w => (w === 'x' || w === 't') ? w : 'Math.' + w);
  // eslint-disable-next-line no-new-func
  return new Function('x', 't', `return (${body});`);
}

/** 축 범위에서 frame을 자동으로 정한다. */
function autoFrame(spec) {
  const pad = spec.axes.padding ?? 36, { x, y } = spec.axes;
  const kx = (spec.width - 2 * pad) / (x.max - x.min), ky = (spec.height - 2 * pad) / (y.max - y.min);
  return { origin: [pad - x.min * kx, spec.height - pad + y.min * ky], scale: [kx, ky] };
}

function makeCtx(spec, opts) {
  const frame = spec.frame || (spec.axes && spec.axes.x && spec.axes.y ? autoFrame(spec) : null);
  const k = frame ? (Array.isArray(frame.scale) ? frame.scale : [frame.scale, frame.scale]) : [1, 1];
  const ctx = {
    spec, opts, frame, k, id: spec.id || 'illus',
    palette: { ...DEFAULT_PALETTE, ...(spec.palette || {}) },
    segments: [], boxes: [], labels: [], markers: new Map(), clips: [],
  };
  // 사용자 좌표(frame 단위) → 픽셀. px:true 요소는 그대로.
  ctx.raw = (p, px) => {
    if (typeof p === 'string') return ctx.raw(spec.points[p], px);
    if (Array.isArray(p)) return p;
    const c = p.from !== undefined ? ctx.raw(p.from, px) : [0, 0];
    const [r, deg] = p.polar;
    if (!frame || px) return [c[0] + r * Math.cos(deg * DEG), c[1] - r * Math.sin(deg * DEG)]; // 픽셀: 화면 y 아래
    return [c[0] + r * Math.cos(deg * DEG), c[1] + r * Math.sin(deg * DEG)];
  };
  ctx.P = (p, px) => {
    const q = ctx.raw(p, px);
    if (!frame || px) return q;
    return [frame.origin[0] + q[0] * k[0], frame.origin[1] - q[1] * k[1]];
  };
  ctx.len = (v, px) => (!frame || px) ? v : v * k[0];
  ctx.color = c => colorRef(c, ctx.palette);
  return ctx;
}

function styleOf(ctx, el, def = {}) {
  const stroke = el.stroke ?? el.color ?? def.stroke ?? 'fg';
  const fill = el.fill ?? def.fill ?? 'none';
  const st = [];
  st.push(`stroke:${stroke === 'none' ? 'none' : ctx.color(stroke)}`);
  st.push(`fill:${fill === 'none' ? 'none' : ctx.color(fill)}`);
  let a = `style="${st.join(';')}" stroke-width="${el.width ?? def.width ?? 1.6}"`;
  if (el.dash) a += ` stroke-dasharray="${Array.isArray(el.dash) ? el.dash.join(' ') : el.dash === true ? '6 4' : el.dash}"`;
  if (el.opacity !== undefined) a += ` opacity="${el.opacity}"`;
  if (el.fillOpacity !== undefined) a += ` fill-opacity="${el.fillOpacity}"`;
  if (el.class) a += ` class="${escapeXml(el.class)}"`;
  return a;
}

function arrowMarker(ctx, color) {
  const key = color || 'fg';
  if (!ctx.markers.has(key)) ctx.markers.set(key, `${ctx.id}-ar${ctx.markers.size ? '-' + ctx.markers.size : ''}`);
  return ctx.markers.get(key);
}
function arrowAttrs(ctx, el, defEnd) {
  const ends = el.arrow ?? (defEnd ? 'end' : null);
  if (!ends) return '';
  const id = arrowMarker(ctx, el.stroke ?? el.color ?? 'fg');
  let a = '';
  if (ends === 'end' || ends === 'both') a += ` marker-end="url(#${id})"`;
  if (ends === 'start' || ends === 'both') a += ` marker-start="url(#${id})"`;
  return a;
}
const pts = ps => ps.map(p => f(p[0]) + ',' + f(p[1])).join(' ');
function addPath(ctx, ps, closed, el) {
  if (el.obstacle === false) return;
  for (let i = 1; i < ps.length; i++) ctx.segments.push([...ps[i - 1], ...ps[i]]);
  if (closed) ctx.segments.push([...ps[ps.length - 1], ...ps[0]]);
}

function addLabel(ctx, at, text, o = {}) {
  const L = {
    x: at[0] + (o.offset?.[0] || 0), y: at[1] + (o.offset?.[1] || 0), text: ctx.spec.autoFrac ? autoFrac(String(text)) : String(text),
    size: o.size ?? 13, anchor: o.anchor ?? 'start', fixed: !!o.fixed,
    leader: o.leader === undefined ? undefined : (o.leader === false ? false : ctx.P(o.leader, o.px)),
    weight: o.weight, color: o.color, italic: o.italic, cls: o.class, avoid: o.avoid,
  };
  ctx.labels.push(L);
  return `@@L${ctx.labels.length - 1}@@`;
}

function sampleFn(ctx, el) {
  const fn = compileFn(el.fn), [a, b] = el.domain, n = el.samples ?? 120, out = [];
  let seg = [];
  for (let i = 0; i <= n; i++) {
    const x = a + (b - a) * i / n; let y = fn(x);
    if (el.param) { const p = fn(x); seg.push(ctx.P(p, el.px)); continue; } // fn이 [x,y]를 돌려주는 매개 곡선
    const clip = el.clipY || (ctx.spec.axes?.y ? [ctx.spec.axes.y.min, ctx.spec.axes.y.max] : null);
    if (!Number.isFinite(y) || (clip && (y < clip[0] - 1e-9 || y > clip[1] + 1e-9))) { if (seg.length > 1) out.push(seg); seg = []; continue; }
    seg.push(ctx.P([x, y], el.px));
  }
  if (seg.length > 1) out.push(seg);
  return out;
}
function smoothPath(ps) { // Catmull-Rom → 3차 베지어
  let d = `M${f(ps[0][0])},${f(ps[0][1])}`;
  for (let i = 0; i < ps.length - 1; i++) {
    const p0 = ps[i - 1] || ps[i], p1 = ps[i], p2 = ps[i + 1], p3 = ps[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

function rectCorners(ctx, el) {
  let a, b;
  if (el.from) { a = ctx.P(el.from, el.px); b = ctx.P(el.to, el.px); }
  else if (ctx.frame && !el.px) { a = ctx.P([el.x, el.y]); b = ctx.P([el.x + el.w, el.y + el.h]); }
  else { a = [el.x, el.y]; b = [el.x + el.w, el.y + el.h]; }
  const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
  return { x, y, w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
}

const screenAngle = (c, p) => -Math.atan2(p[1] - c[1], p[0] - c[0]) / DEG; // 화면 좌표 → 수학 각도(도)

function drawEl(ctx, el) {
  const P = p => ctx.P(p, el.px);
  switch (el.type) {
    case 'line': case 'arrow': {
      const a = P(el.from), b = P(el.to);
      addPath(ctx, [a, b], false, el);
      let s = `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" ${styleOf(ctx, el)}${arrowAttrs(ctx, el, el.type === 'arrow')}/>`;
      if (el.label) s += addLabel(ctx, el.labelAt ? P(el.labelAt) : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], el.label, { anchor: 'middle', offset: [0, -6], ...el.labelStyle });
      return s;
    }
    case 'polyline': case 'polygon': {
      const ps = el.points.map(P), closed = el.type === 'polygon';
      addPath(ctx, ps, closed, el);
      return `<${el.type} points="${pts(ps)}" ${styleOf(ctx, el, { width: el.type === 'polyline' ? 2 : 1.2 })}${arrowAttrs(ctx, el, false)}/>`;
    }
    case 'rect': {
      const r = rectCorners(ctx, el);
      addPath(ctx, [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]], true, el);
      let s = `<rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}"${el.radius ? ` rx="${el.radius}"` : ''} ${styleOf(ctx, el)}/>`;
      if (el.label) s += addLabel(ctx, [r.x + r.w / 2, r.y + r.h / 2 + 4.5], el.label, { anchor: 'middle', ...el.labelStyle });
      return s;
    }
    case 'circle': case 'dot': {
      const c = P(el.center ?? el.at), r = el.type === 'dot' ? (el.r ?? 4) : ctx.len(el.r, el.px);
      const def = el.type === 'dot' ? { stroke: 'none', fill: el.color ?? 'accent' } : {};
      if (el.obstacle !== false) {
        if (r < 20) ctx.boxes.push({ x0: c[0] - r, x1: c[0] + r, y0: c[1] - r, y1: c[1] + r });
        else if (el.type === 'circle' && el.outlineObstacle) addPath(ctx, Array.from({ length: 49 }, (_, i) => [c[0] + r * Math.cos(i * 7.5 * DEG), c[1] + r * Math.sin(i * 7.5 * DEG)]), false, el);
      }
      let s = `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="${f(r)}" ${styleOf(ctx, el, def)}/>`;
      if (el.label) s += addLabel(ctx, [c[0] + r + 4, c[1] - r - 2], el.label, el.labelStyle);
      return s;
    }
    case 'ellipse': {
      const c = P(el.center), rx = ctx.len(el.rx, el.px), ry = el.px || !ctx.frame ? el.ry : el.ry * ctx.k[1];
      return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(rx)}" ry="${f(ry)}"${el.rotate ? ` transform="rotate(${-el.rotate} ${f(c[0])} ${f(c[1])})"` : ''} ${styleOf(ctx, el)}/>`;
    }
    case 'arc': {
      const c = P(el.center), r = el.r; // 호 반지름은 항상 px
      let a0 = el.start, a1 = el.end;
      if (el.between) { a0 = screenAngle(c, P(el.between[0])); a1 = screenAngle(c, P(el.between[1])); }
      let sweep = ((a1 - a0) % 360 + 360) % 360;
      if (el.between && el.shorter !== false && sweep > 180) { [a0, a1] = [a1, a0]; sweep = 360 - sweep; }
      const p0 = [c[0] + r * Math.cos(a0 * DEG), c[1] - r * Math.sin(a0 * DEG)], p1 = [c[0] + r * Math.cos(a1 * DEG), c[1] - r * Math.sin(a1 * DEG)];
      const ps = Array.from({ length: 13 }, (_, i) => { const t = (a0 + sweep * i / 12) * DEG; return [c[0] + r * Math.cos(t), c[1] - r * Math.sin(t)]; });
      addPath(ctx, ps, false, el);
      let s = `<path d="M${f(p0[0])},${f(p0[1])} A${r},${r} 0 ${sweep > 180 ? 1 : 0} 0 ${f(p1[0])},${f(p1[1])}" ${styleOf(ctx, el)}${arrowAttrs(ctx, el, false)}/>`;
      if (el.label !== undefined) {
        const am = (a0 + sweep / 2) * DEG, lr = el.labelRadius ?? r + 14;
        s += addLabel(ctx, [c[0] + lr * Math.cos(am), c[1] - lr * Math.sin(am) + 5], el.label, { anchor: 'middle', ...el.labelStyle });
      }
      return s;
    }
    case 'rightAngle': {
      const c = P(el.at), q = el.size ?? 12;
      const unit = d => { const v = ctx.frame && !el.px ? [d[0] * ctx.k[0], -d[1] * ctx.k[1]] : d; const n = Math.hypot(...v); return [v[0] / n, v[1] / n]; };
      const u = unit(el.dir1), n = unit(el.dir2);
      const c1 = [c[0] + u[0] * q, c[1] + u[1] * q], c2 = [c1[0] + n[0] * q, c1[1] + n[1] * q], c3 = [c[0] + n[0] * q, c[1] + n[1] * q];
      return `<polyline points="${pts([c1, c2, c3])}" ${styleOf(ctx, el, { width: 1 })}/>`;
    }
    case 'curve': {
      const segs = el.fn !== undefined ? sampleFn(ctx, el) : [el.points.map(P)];
      let s = '';
      for (const ps of segs) {
        addPath(ctx, ps, false, el);
        s += el.smooth && el.fn === undefined ? `<path d="${smoothPath(ps)}" ${styleOf(ctx, el, { width: 2.2 })}${arrowAttrs(ctx, el, false)}/>`
          : `<polyline points="${pts(ps)}" ${styleOf(ctx, el, { width: 2.2 })}${arrowAttrs(ctx, el, false)}/>`;
      }
      if (el.label && segs.length) {
        const last = segs[segs.length - 1], p = el.labelAt ? P(el.labelAt) : last[last.length - 1];
        s += addLabel(ctx, el.labelAt ? p : [p[0] + 6, p[1] + 4], el.label, { color: el.stroke ?? el.color, ...el.labelStyle });
      }
      return s;
    }
    case 'hatch': { // 단면 빗금: 영역 안을 일정 간격 사선으로 채운다(clipPath)
      const poly = el.points ? el.points.map(P) : (() => { const r = rectCorners(ctx, el); return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]; })();
      const cid = `${ctx.id}-clip${ctx.clips.length}`;
      ctx.clips.push(`<clipPath id="${cid}"><polygon points="${pts(poly)}"/></clipPath>`);
      const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const ang = (el.angle ?? 45) * DEG, gap = el.gap ?? 7, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + gap;
      const d = [Math.cos(ang), -Math.sin(ang)], nrm = [-d[1], d[0]];
      let lines = '';
      for (let t = -R; t <= R; t += gap) {
        const m = [cx + nrm[0] * t, cy + nrm[1] * t];
        lines += `M${f(m[0] - d[0] * R)},${f(m[1] - d[1] * R)}L${f(m[0] + d[0] * R)},${f(m[1] + d[1] * R)}`;
      }
      let s = `<path d="${lines}" clip-path="url(#${cid})" ${styleOf(ctx, { ...el, dash: undefined }, { width: 0.9 })}/>`;
      if (el.outline !== false) { s += `<polygon points="${pts(poly)}" ${styleOf(ctx, { stroke: el.stroke, width: el.outlineWidth ?? 1.4 })}/>`; addPath(ctx, poly, true, el); }
      return s;
    }
    case 'text':
      return addLabel(ctx, P(el.at), el.text, el);
    case 'marker': { // 대응표 번호 마커
      const c = P(el.at), r = el.r ?? 9;
      ctx.boxes.push({ x0: c[0] - r, x1: c[0] + r, y0: c[1] - r, y1: c[1] + r });
      let s = `<g class="si-marker"><circle cx="${f(c[0])}" cy="${f(c[1])}" r="${r}" style="fill:${ctx.color(el.fill ?? 'accent')};stroke:none"/>`
        + `<text x="${f(c[0])}" y="${f(c[1] + 4)}" text-anchor="middle" font-size="${el.size ?? 11}" font-weight="700" style="fill:${ctx.color(el.textColor ?? 'bg')}">${escapeXml(el.n)}</text></g>`;
      if (el.target) { const t = P(el.target); s = `<line x1="${f(c[0])}" y1="${f(c[1])}" x2="${f(t[0])}" y2="${f(t[1])}" style="stroke:currentColor" stroke-opacity="0.55" stroke-width="0.8"/>` + s; ctx.segments.push([...c, ...t]); }
      return s;
    }
    case 'path':
      return `<path d="${escapeXml(el.d)}" ${styleOf(ctx, el)}${arrowAttrs(ctx, el, false)}/>`;
    case 'group': {
      const inner = el.elements.map(e => drawEl(ctx, { px: el.px, ...e })).join('');
      return `<g${el.transform ? ` transform="${escapeXml(el.transform)}"` : ''}${el.opacity !== undefined ? ` opacity="${el.opacity}"` : ''}>${inner}</g>`;
    }
  }
  return '';
}

function niceStep(span) { const r = span / 8, p = 10 ** Math.floor(Math.log10(r)), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
const fmtTick = v => { const s = +v.toFixed(6); return String(s).replace('-', '−'); };

function drawAxes(ctx) {
  const A = ctx.spec.axes; if (!A || !ctx.frame) return '';
  let s = '<g class="si-axes">';
  const xr = A.x || { min: -5, max: 5 }, yr = A.y || { min: -5, max: 5 };
  const P = p => ctx.P(p);
  const ax0 = Math.min(Math.max(0, yr.min), yr.max), ay0 = Math.min(Math.max(0, xr.min), xr.max); // 축이 지나는 값
  const fid = arrowMarker(ctx, 'fg');
  const grid = A.grid;
  for (const [dir, r] of [['x', xr], ['y', yr]]) {
    if (r.ticks === false && !grid) continue;
    const step = r.step ?? niceStep(r.max - r.min);
    for (let v = Math.ceil(r.min / step) * step; v <= r.max + 1e-9; v += step) {
      if (Math.abs(v) < 1e-9 && r.zeroLabel !== true) { if (grid) {} else continue; }
      const p = dir === 'x' ? P([v, ax0]) : P([ay0, v]);
      if (grid) {
        const a = dir === 'x' ? P([v, yr.min]) : P([xr.min, v]), b = dir === 'x' ? P([v, yr.max]) : P([xr.max, v]);
        s += `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" style="stroke:currentColor" stroke-opacity="0.12" stroke-width="1"/>`;
      }
      if (r.ticks === false || Math.abs(v) < 1e-9 && r.zeroLabel !== true) continue;
      s += dir === 'x' ? `<line x1="${f(p[0])}" y1="${f(p[1] - 3)}" x2="${f(p[0])}" y2="${f(p[1] + 3)}" style="stroke:currentColor" stroke-width="1"/>`
        : `<line x1="${f(p[0] - 3)}" y1="${f(p[1])}" x2="${f(p[0] + 3)}" y2="${f(p[1])}" style="stroke:currentColor" stroke-width="1"/>`;
      s += addLabel(ctx, dir === 'x' ? [p[0], p[1] + 16] : [p[0] - 6, p[1] + 4], fmtTick(v), { size: 11, anchor: dir === 'x' ? 'middle' : 'end', color: 'muted', fixed: true, avoid: false });
    }
  }
  const xa = P([xr.min, ax0]), xb = P([xr.max, ax0]), ya = P([ay0, yr.min]), yb = P([ay0, yr.max]);
  s += `<line x1="${f(xa[0])}" y1="${f(xa[1])}" x2="${f(xb[0] + 8)}" y2="${f(xb[1])}" style="stroke:currentColor" stroke-width="1.3" marker-end="url(#${fid})"/>`;
  s += `<line x1="${f(ya[0])}" y1="${f(ya[1])}" x2="${f(yb[0])}" y2="${f(yb[1] - 8)}" style="stroke:currentColor" stroke-width="1.3" marker-end="url(#${fid})"/>`;
  ctx.segments.push([xa[0], xa[1], xb[0] + 8, xb[1]], [ya[0], ya[1], yb[0], yb[1] - 8]);
  s += addLabel(ctx, [xb[0] + 4, xb[1] + 18], xr.label ?? 'x', { italic: xr.label === undefined, anchor: 'end' });
  s += addLabel(ctx, [yb[0] + 10, yb[1] + 4], yr.label ?? 'y', { italic: yr.label === undefined });
  return s + '</g>';
}

function labelSvg(ctx, L) {
  let a = `x="${f(L.x)}" y="${f(L.y)}"`;
  if (L.anchor !== 'start') a += ` text-anchor="${L.anchor}"`;
  if (L.size !== 13) a += ` font-size="${L.size}"`;
  if (L.weight) a += ` font-weight="${L.weight}"`;
  if (L.italic) a += ` font-style="italic"`;
  if (L.color && L.color !== 'fg') a += ` style="fill:${ctx.color(L.color)}"`;
  if (L.cls) a += ` class="${escapeXml(L.cls)}"`;
  if (hasFrac(L.text)) { // 진짜 분수: <g>로 분자·가로선·분모를 배치
    const attrs = a.replace(/^x="[^"]*" y="[^"]*"/, '').replace(/ text-anchor="[^"]*"/, '').replace(/ font-size="[^"]*"/, '');
    return richTextSvg(L.x, L.y, L.text, { size: L.size, anchor: L.anchor, attrs, color: L.color && L.color !== 'fg' ? ctx.color(L.color) : 'currentColor', measure: ctx.opts.measureText });
  }
  return `<text ${a}>${toTspan(L.text)}</text>`;
}

/** 템플릿 스펙({template, params})을 풀어 낸다. */
export function resolveSpec(spec, templates) {
  if (spec && spec.template) {
    const t = templates?.[spec.template];
    if (!t) throw new SpecError([`template: 알 수 없는 템플릿 "${spec.template}"`]);
    const { template, params, ...rest } = spec;
    return { ...t(params || {}), ...rest };
  }
  return spec;
}

/**
 * 요소 목록만 그린다(도식 위에 얹는 overlay에도 쓴다).
 * spec: {width,height,elements,frame?,axes?,points?,palette?,id?}
 * extra: 라벨이 피해야 할 기존 장애물 {segments, boxes}
 */
export function renderBody(spec, opts = {}, extra = {}) {
  const ctx = makeCtx(spec, opts);
  let body = drawAxes(ctx) + (spec.elements || []).map(el => drawEl(ctx, el)).join('');
  const res = placeLabels(ctx.labels, { segments: [...ctx.segments, ...(extra.segments || [])], boxes: [...ctx.boxes, ...(extra.boxes || [])] }, spec.width, spec.height,
    { measureText: opts.measureText, avoid: spec.avoidOverlap, leaderMin: spec.leaderMin });
  const leaders = res.leaders.map(([x1, y1, x2, y2]) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" class="si-leader" style="stroke:currentColor" stroke-opacity="0.55" stroke-width="0.8"/>`).join('');
  body = body.replace(/@@L(\d+)@@/g, (_, i) => labelSvg(ctx, ctx.labels[i]));
  if (opts.strict && res.unresolved.length) throw new SpecError(res.unresolved.map(u => `라벨 겹침 미해결: "${u.text}" (${u.why})`));
  const defs = [...ctx.markers].map(([c, id]) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" style="fill:${ctx.color(c)}"/></marker>`).join('') + ctx.clips.join('');
  return { defs, leaders, body, ctx, report: { labels: ctx.labels.length, collisionsBefore: res.collisionsBefore, unresolved: res.unresolved } };
}

/**
 * 스펙 → {svg, report}. opts: {measureText(text, size)→px, embedStyle:boolean, strict:boolean, templates}
 * strict(기본 false)면 해결하지 못한 라벨 겹침이 있을 때 오류를 던진다.
 */
export function renderSVG(spec, opts = {}) {
  spec = resolveSpec(spec, opts.templates);
  const errs = validate(spec);
  if (errs.length) throw new SpecError(errs);
  const W = spec.width, H = spec.height;
  const { defs, leaders, body, ctx, report } = renderBody(spec, opts);
  const title = spec.title ?? '';
  const style = opts.embedStyle ? `<style>${embeddedCss()}</style>` : '';
  const pal = spec.palette ? paletteStyle(spec.palette) : '';
  const tid = `${ctx.id}-t`;
  const svg = `<svg class="si si-illus" viewBox="0 0 ${W} ${H}" style="max-width:${W}px;color:var(--si-ink,var(--text,#1f2328))${pal}" xmlns="http://www.w3.org/2000/svg" role="img"${title ? ` aria-labelledby="${tid}"` : ''} font-family="${FONT}" font-size="13" fill="currentColor">`
    + `${title ? `<title id="${tid}">${escapeXml(title)}</title>` : ''}${spec.desc ? `<desc>${escapeXml(spec.desc)}</desc>` : ''}${style}<defs>${defs}</defs>${leaders}${body}</svg>`;
  return { svg, report };
}

function embeddedCss() {
  const d = Object.entries(TOKENS.dark).map(([k, v]) => `--si-${k}:${v};`).join('');
  return `@media (prefers-color-scheme: dark){svg.si{${d}}}`;
}

export const render = (spec, opts) => renderSVG(spec, opts).svg;

/** 기호 설명 범례 <dl>. 항목: {sym, desc, kind?}. desc는 첨자 마크업을 HTML로 바꾼다. 기호 없는 항목은 주석 문단. */
export function legendHTML(items = []) {
  if (!items || !items.length) return '';
  const rows = items.filter(it => it.sym), notes = items.filter(it => !it.sym);
  let h = '';
  if (rows.length) h += '<dl class="si-legend">' + rows.map(it => {
    const k = kindOf(it.sym, it.kind);
    return `<div data-kind="${k}"><dt>${symHtml(it.sym, k)}</dt><dd>${toHtml(it.desc)}</dd></div>`;
  }).join('') + '</dl>';
  h += notes.map(it => `<p class="si-note">${toHtml(it.desc)}</p>`).join('');
  return h;
}

/** 대응표(영-한 등). table: {columns?:[...], rows:[[...]], numbered?:true, caption?}. numbered면 앞에 번호 열(그림의 marker n과 대응). */
export function tableHTML(table) {
  if (!table || !table.rows?.length) return '';
  const cols = table.columns || [];
  const head = table.numbered && cols.length ? ['번호', ...cols] : cols;
  const th = head.length ? '<thead><tr>' + head.map(c => `<th scope="col">${toHtml(c)}</th>`).join('') + '</tr></thead>' : '';
  const tb = table.rows.map((r, i) => '<tr>' + (table.numbered ? `<td class="si-num"><span class="si-badge">${i + 1}</span></td>` : '')
    + r.map(c => `<td>${toHtml(c)}</td>`).join('') + '</tr>').join('');
  return `<div class="si-table-wrap"><table class="si-table">${table.caption ? `<caption>${toHtml(table.caption)}</caption>` : ''}${th}<tbody>${tb}</tbody></table></div>`;
}

/**
 * 공통 figure 마크업(도식·도해 같은 구조).
 * <figure class="si-figure [si-dual]" data-kind data-type id>
 *   <div class="si-frame">svg…</div>
 *   <figcaption><span class="si-caption"/> <dl class="si-legend"/> <p class="si-note"/> <div class="si-table-wrap"/> <span class="si-credit"/></figcaption>
 * </figure>
 */
export function figureHTML({ svgs = [], caption, legend, table, credit, license, kind = 'illus', type, id, dual = false }) {
  const cr = [credit, license].filter(Boolean).map(toHtml).join(' · ');
  const parts = (caption ? `<span class="si-caption">${toHtml(caption)}</span>` : '') + legendHTML(legend) + tableHTML(table)
    + (cr ? `<span class="si-credit">${cr}</span>` : '');
  return `<figure class="si-figure${dual ? ' si-dual' : ''}" data-kind="${kind}"${type ? ` data-type="${escapeXml(type)}"` : ''}${id ? ` id="fig-${escapeXml(id)}"` : ''}>`
    + `<div class="si-frame">${svgs.join('')}</div>${parts ? `<figcaption>${parts}</figcaption>` : ''}</figure>`;
}

/** 도해 스펙 → figure HTML 조각. */
export function renderHTML(spec, opts = {}) {
  spec = resolveSpec(spec, opts.templates);
  const { svg, report } = renderSVG(spec, opts);
  const html = figureHTML({ svgs: [svg], caption: spec.caption ?? spec.title, legend: spec.legend, table: spec.table,
    credit: spec.credit, license: spec.license, kind: 'illus', type: spec.template || spec.kind, id: spec.id });
  return opts.withReport ? { html, report } : html;
}
