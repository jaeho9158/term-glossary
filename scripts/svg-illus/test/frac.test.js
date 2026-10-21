import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMarkup, toHtml, autoFrac, normalizeFrac, hasFrac, fracSvg, richTextSvg, estimateTextWidth,
  renderSVG, renderDiagram, renderDiagramSVG, labelBox, placeLabels, legendHTML,
} from '../src/index.js';

test('분수 파싱: \\frac{}{} 와 {frac:a,b}, 첨자 중첩', () => {
  assert.deepEqual(parseMarkup('\\frac{1}{3}'), [{ kind: 'frac', num: '1', den: '3' }]);
  assert.deepEqual(parseMarkup('{frac:a, b}'), [{ kind: 'frac', num: 'a', den: 'b' }]);
  const p = parseMarkup('y = \\frac{x^{2}}{4}');
  assert.equal(p[1].kind, 'frac'); assert.equal(p[1].num, 'x^{2}');
  assert.ok(hasFrac('a {frac:1,2}') && !hasFrac('1/2'));
  assert.equal(normalizeFrac('{frac:1,3}'), '\\frac{1}{3}');
});

test('자동 변환: 숫자/숫자만, 단위·날짜·URL·소수는 그대로', () => {
  assert.equal(autoFrac('1/3'), '\\frac{1}{3}');
  assert.equal(autoFrac('비율 3/4이다'), '비율 \\frac{3}{4}이다');
  for (const s of ['60 km/h', '9.8 m/s', '2026/10/21', 'http://x.org/1/2', '0.5/2', 'a/b']) assert.equal(autoFrac(s), s, s);
});

test('HTML: MathML <mfrac>, 색은 상속(클래스만)', () => {
  const h = toHtml('\\frac{x^{2}}{4}');
  assert.equal(h, '<math class="si-math"><mfrac><mrow><msup><mi>x</mi><mrow><mn>2</mn></mrow></msup></mrow><mrow><mn>4</mn></mrow></mfrac></math>');
  assert.doesNotMatch(h, /color|style/);
  assert.match(legendHTML([{ sym: '\\frac{a}{b}', kind: 'expr', desc: '분수 {frac:1,2}' }]), /<dt><math class="si-math"><mfrac>.*<dd>분수 <math class="si-math"><mfrac><mrow><mn>1<\/mn>/);
});

test('SVG 분수: 분자·가로선·분모, 폭은 긴 쪽, 글자 0.8배', () => {
  const f = fracSvg(0, 20, '1', '100', { size: 10 });
  const texts = [...f.svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*font-size="([\d.]+)">([^<]*)<\/text>/g)];
  assert.equal(texts.length, 2);
  assert.equal(texts[0][4], '1'); assert.equal(texts[1][4], '100');
  assert.equal(+texts[0][3], 8);
  assert.ok(+texts[0][2] < 20 - 3.2 && +texts[1][2] > 20 - 3.2); // 분자는 선 위, 분모는 선 아래
  assert.ok(Math.abs(f.width - (estimateTextWidth('100', 8) + 4)) < 1e-9);
  assert.match(f.svg, /<line x1="[\d.]+" y1="16.8" x2/);
});

test('SVG 라벨: 분수 없으면 <text> 하나, 있으면 <g>', () => {
  assert.match(richTextSvg(0, 10, 'abc'), /^<text /);
  assert.match(richTextSvg(0, 10, 'a \\frac{1}{2}'), /^<g class="si-rich"/);
  const svg = renderSVG({ width: 200, height: 80, elements: [{ type: 'text', at: [20, 40], text: '{frac:1,3}', color: 'accent' }] }).svg;
  assert.match(svg, /<g class="si-rich"[^>]*style="fill:var\(--si-accent/);
  assert.match(svg, /<line [^>]*style="stroke:var\(--si-accent/); // 가로선도 라벨 색
});

test('겹침 검사: 분수 라벨은 더 높은 상자, 그 위 라벨을 밀어낸다', () => {
  const plain = labelBox({ x: 0, y: 50, text: '12', size: 13, anchor: 'start' });
  const frac = labelBox({ x: 0, y: 50, text: '\\frac{1}{2}', size: 13, anchor: 'start' });
  assert.ok(frac.y0 < plain.y0 && frac.y1 > plain.y1);
  const r = placeLabels([{ x: 50, y: 50, text: '\\frac{1}{2}', size: 13, anchor: 'start' }, { x: 50, y: 37, text: '위', size: 13, anchor: 'start' }], {}, 300, 200);
  assert.equal(r.collisionsBefore, 1); assert.equal(r.unresolved.length, 0);
});

test('autoFrac 스펙 옵션(도해)', () => {
  const svg = renderSVG({ width: 200, height: 80, autoFrac: true, elements: [{ type: 'text', at: [20, 40], text: '1/4, 60 km/h' }] }).svg;
  assert.match(svg, /si-rich/); assert.match(svg, /60 km\/h/);
});

test('도식 어댑터: 같은 분수 함수, 노드 높이 늘림, 겹침 없음', () => {
  const spec = { type: 'procedure', nodes: [{ id: 'a', label: '전체' }, { id: 'b', label: '\\frac{1}{2} 사용', sub: '남은 양 {frac:1,2}' }], edges: [{ from: 'a', to: 'b', label: '×\\frac{1}{2}' }] };
  const r = renderDiagram(spec);
  assert.deepEqual(r.warnings, []);
  assert.ok((r.html.match(/class="si-rich"/g) || []).length >= 3);
  assert.doesNotMatch(r.html, /\{frac:/);
});

test('노트: 분수가 든 줄은 줄 간격이 늘고 겹침 경고가 없다', () => {
  const base = { type: 'procedure', nodes: [{ id: 'a', label: '전체' }, { id: 'b', label: '일부' }], edges: [{ from: 'a', to: 'b' }] };
  const plain = renderDiagramSVG({ ...base, notes: [{ text: '첫 줄' }, { text: '둘째 줄' }] });
  const frac = renderDiagramSVG({ ...base, notes: [{ text: '첫 줄' }, { text: '둘째 {frac:1,3} 줄' }, { text: '셋째 줄' }] });
  assert.deepEqual(frac.warnings, []);
  const ys = (r) => r.texts.filter((t) => t.owner === 'note').map((t) => t.base);
  const p = ys(plain), f = ys(frac);
  assert.ok(Math.abs((f[1] - f[0]) - (p[1] - p[0]) - 11.5 * 0.4) < 1e-9); // 분수 줄은 글자 위로 FRAC_UP만큼 더 내려 그린다
  assert.ok(f[2] - f[1] > p[1] - p[0] + 11.5 * 0.25 - 1e-9); // 다음 줄은 FRAC_DOWN만큼 더 밀린다
  assert.ok(frac.height > plain.height);
});
