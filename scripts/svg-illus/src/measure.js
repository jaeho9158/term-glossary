// 실제 글자 폭 측정 훅(브라우저). renderSVG(spec, {measureText: canvasMeasure()})처럼 넘긴다.
import { parseMarkup } from './markup.js';

export function canvasMeasure(font = "'Pretendard','Noto Sans KR',sans-serif") {
  const c = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!c) throw new Error('canvasMeasure는 브라우저에서만 씁니다');
  return (text, size) => parseMarkup(text).reduce((w, p) => {
    c.font = `${p.kind === 'normal' ? size : size * 0.72}px ${font}`;
    return w + c.measureText(p.text).width;
  }, 0);
}
