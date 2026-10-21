// 도식 어댑터: 사이트의 diagrams/specs/*.json을 고치지 않고 그대로 읽어 공통 figure로 낸다.
// 배치 알고리즘은 원본(term-style/scripts/diagrams)을 그대로 옮겼고, 바뀐 것은
//   1) 색 변수 --dg-* → 공통 토큰 --si-* (값은 같음, CSS 없이도 보이도록 기본값을 채움)
//   2) figure 마크업 → figureHTML(도해와 같은 구조: si-figure / si-frame / figcaption)
//   3) 새 선택 필드: overlay(도해 요소 얹기), legend, table, credit, license, caption
import TYPE_MODS from './types/index.js';
import * as core from './core.js';
import { FNS, checkParams, sample } from './plot-fns.js';
import { renderBody, figureHTML } from '../render.js';
import { validate as validateIllus } from '../validate.js';
import { withFallbacks, METRICS } from '../theme.js';
import { normalizeFrac, autoFrac } from '../markup.js';

const SKIP = new Set(['slug', 'source', 'type', 'fn', 'id', 'from', 'to', 'color', 'kind', 'tone']);
/** 스펙 문자열의 {frac:a,b}를 \frac{a}{b}로 바꾼다(쉼표가 줄바꿈 후보라 배치 전에). spec.autoFrac이면 숫자/숫자도 분수로. 바뀔 것이 없으면 원본 객체 그대로. */
export function prepareFractions(spec) {
  const raw = JSON.stringify(spec);
  if (!raw.includes('{frac:') && !spec.autoFrac) return spec;
  const walk = (v, k) => typeof v === 'string' ? (SKIP.has(k) ? v : (spec.autoFrac ? autoFrac(normalizeFrac(v)) : normalizeFrac(v)))
    : Array.isArray(v) ? v.map(x => walk(x, k)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, walk(x, kk)])) : v;
  return walk(spec);
}

const { COLORS, TONES, MARGIN, esc, Canvas, drawNotes, checkOverlaps, checkBounds } = core;
export const DIAGRAM_TYPES = Object.keys(TYPE_MODS);
export { FNS as PLOT_FNS, checkParams, sample, COLORS };

/** 원본 validateSpec과 같은 규칙. knownSlugs를 주면 slug 존재도 본다. requireMeta=false면 slug·reviewed·source 검사를 건너뛴다. */
export function validateDiagram(spec, { knownSlugs, requireMeta = true } = {}) {
  const errs = [];
  if (!spec || typeof spec !== 'object') return ['스펙이 객체가 아님'];
  if (requireMeta && !spec.slug) errs.push('slug 없음');
  else if (knownSlugs && !knownSlugs.has(spec.slug)) errs.push(`terms.json에 없는 slug: ${spec.slug}`);
  const mod = TYPE_MODS[spec.type];
  const notObj = k => Array.isArray(spec[k]) && spec[k].some(v => !v || typeof v !== 'object');
  const badItems = ['nodes', 'edges'].filter(notObj);
  for (const k of badItems) errs.push(`${k} 항목이 객체가 아님`);
  if (!mod) errs.push(`type이 올바르지 않음: ${spec.type}`);
  else if (!badItems.length) errs.push(...mod.validate(spec));
  for (const note of spec.notes || []) if (note.tone && !TONES.includes(note.tone)) errs.push(`알 수 없는 note tone: ${note.tone}`);
  if (requireMeta) {
    if (typeof spec.reviewed !== 'boolean') errs.push('reviewed(true/false) 없음');
    if (!spec.source) errs.push('source 없음');
  }
  if (spec.overlay !== undefined) errs.push(...validateIllus({ width: 1, height: 1, elements: spec.overlay, points: spec.overlayPoints }).map(e => 'overlay: ' + e));
  return errs;
}

/** 한 방향(h|v) SVG. 반환은 원본 renderSpec과 같은 모양. */
export function renderDiagramSVG(spec, { title, orientation = 'h', idPrefix, measureText } = {}) {
  spec = prepareFractions(spec);
  const t = title || spec.title || spec.slug;
  const prefix = `dg-${(idPrefix || spec.slug || 'x').replace(/[^a-zA-Z0-9-]/g, '')}-${orientation}`;
  const cv = new Canvas(prefix);
  const mod = TYPE_MODS[spec.type];
  if (!mod) throw new Error(`알 수 없는 type: ${spec.type}`);
  const ext = mod.layout(cv, spec, orientation);
  let width = Math.ceil(ext.w);
  if (spec.notes && spec.notes.length) width = Math.max(width, orientation === 'v' ? 340 : 360);
  const height = Math.ceil(drawNotes(cv, spec.notes, width, ext.h + 6) + MARGIN);
  // overlay: 도해 요소. plot이면 데이터 좌표(frame), 아니면 px. 라벨은 기존 글자·박스를 피한다.
  let ov = { defs: '', leaders: '', body: '', report: null };
  if (spec.overlay && spec.overlay.length) {
    const frame = cv.frame && spec.overlayCoords !== 'px' ? cv.frame : undefined;
    const boxes = [...cv.texts, ...cv.boxes].map(r => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }));
    ov = renderBody({ width, height, frame, id: prefix + '-o', elements: spec.overlay, points: spec.overlayPoints }, { measureText }, { boxes });
  }
  const warnings = [...checkOverlaps(cv), ...checkBounds(cv.texts, width, height),
    ...(ov.report ? ov.report.unresolved.map(u => `overlay 라벨 겹침: "${u.text}"`) : [])];
  const desc = mod.describe(spec, t);
  const markerDefs = [...cv.markers.values()].map(m => m.def).join('') + ov.defs;
  const defs = markerDefs ? `<defs>${markerDefs}</defs>` : '';
  const ovG = ov.body ? `<g class="si-overlay" style="color:var(--si-navy)" font-size="${METRICS.fontSizeSmall}">${ov.leaders}${ov.body}</g>` : '';
  const svg = `<svg class="si dg dg-${orientation}" viewBox="0 0 ${width} ${height}" style="max-width:${width}px" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${prefix}-t ${prefix}-d" font-family="${METRICS.font}">`
    + `<title id="${prefix}-t">${esc(t)}</title><desc id="${prefix}-d">${esc(desc)}</desc>${defs}${cv.parts.join('')}${ovG}</svg>`;
  return { svg: withFallbacks(svg), width, height, warnings, desc, texts: cv.texts, boxes: cv.boxes };
}

export const H_FIT_W = 680;

/** 페이지용 figure. 원본 renderFigure와 같은 가로·세로 판단, 마크업은 공통 figureHTML. */
export function renderDiagram(spec, { title, measureText } = {}) {
  const mod = TYPE_MODS[spec.type];
  if (!mod) throw new Error(`알 수 없는 type: ${spec.type}`);
  const h = renderDiagramSVG(spec, { title, orientation: 'h', measureText });
  const v = mod.dual(spec, h.width) ? renderDiagramSVG(spec, { title, orientation: 'v', measureText }) : null;
  const vOnly = !!v && h.width > H_FIT_W;
  const warnings = [...(vOnly ? [] : h.warnings.map(w => `[가로] ${w}`)), ...(v ? v.warnings.map(w => `[세로] ${w}`) : [])];
  const svgs = [...(vOnly ? [] : [h.svg]), ...(v ? [v.svg] : [])];
  // spec.source는 검수용 메모라 싣지 않는다(원본 방침). 공개 표기는 credit·license 필드로.
  const html = figureHTML({ svgs, caption: spec.caption ?? mod.caption, legend: spec.legend, table: spec.table,
    credit: spec.credit, license: spec.license, kind: 'diagram', type: spec.type, dual: !!v && !vOnly });
  return { html, warnings, desc: h.desc };
}
