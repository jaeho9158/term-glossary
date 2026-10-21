// svg-illus: 도식(diagram)과 도해(illus)의 공통 엔진. 의존성 없음, Node·브라우저 공용 ESM.
import { renderHTML as illusHTML, renderSVG as illusSVG } from './render.js';
import { renderDiagram, renderDiagramSVG } from './diagram/index.js';
import { templates } from './templates.js';
import DIAGRAM_MODS from './diagram/types/index.js';

export { render, renderSVG, renderHTML, renderBody, figureHTML, legendHTML, tableHTML, polar, compileFn, resolveSpec, FONT } from './render.js';
export { validate, SpecError, ELEMENT_TYPES } from './validate.js';
export { parseMarkup, toTspan, toHtml, symHtml, kindOf, estimateTextWidth, escapeXml, fracSvg, richTextSvg, hasFrac, autoFrac, normalizeFrac } from './markup.js';
export { placeLabels, labelBox, segmentHitsBox, boxesOverlap } from './labels.js';
export { TOKENS, METRICS, ROLES, colorRef, themeCss, withFallbacks } from './theme.js';
export { templates } from './templates.js';
export { renderDiagram, renderDiagramSVG, validateDiagram, prepareFractions, DIAGRAM_TYPES, PLOT_FNS } from './diagram/index.js';
export { canvasMeasure } from './measure.js';

/** 도식 스펙(type이 9유형 중 하나이고 elements가 없음)인지. */
export const isDiagram = spec => !!(spec && spec.type && DIAGRAM_MODS[spec.type] && !spec.elements);

/** 아무 스펙이나 figure HTML로. */
export function toFigure(spec, opts = {}) {
  if (isDiagram(spec)) return renderDiagram(spec, opts).html;
  return illusHTML(spec, { templates, ...opts });
}

/** 아무 스펙이나 단독 SVG로(도식은 기본 가로판). */
export function toSVG(spec, opts = {}) {
  if (isDiagram(spec)) return renderDiagramSVG(spec, { orientation: 'h', ...opts }).svg;
  return illusSVG(spec, { templates, ...opts }).svg;
}
