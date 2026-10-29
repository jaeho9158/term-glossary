import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSVG, validate, PART_TYPES, ICONS, SpecError } from '../src/index.js';

const R = (elements, extra = {}) => renderSVG({ width: 400, height: 300, elements, ...extra }, { strict: true });

test('부품 목록과 검증 등록', () => {
  for (const t of ['icon', 'vessel', 'pipe', 'valve', 'blockArrow', 'scale', 'callout', 'lips']) assert.ok(PART_TYPES.includes(t), t);
  assert.ok(validate({ width: 10, height: 10, elements: [{ type: 'icon' }] }).some(e => e.includes('name')));
  assert.ok(validate({ width: 10, height: 10, elements: [{ type: 'inset', center: [1, 1], r: 5, elements: [] }] }).length === 0);
});
test('icon: 모든 이름이 그려진다', () => {
  for (const name of Object.keys(ICONS)) { const { svg } = R([{ type: 'icon', name, at: [100, 100], size: 40 }]); assert.match(svg, /<(path|circle|line)/, name); }
  assert.throws(() => R([{ type: 'icon', name: '없음', at: [1, 1] }]), /알 수 없는 이름/);
});
test('vessel·pipe·valve: 액체 수준선, 겹선 튜브, 흐름 화살표', () => {
  const { svg } = R([{ type: 'vessel', x: 40, y: 40, w: 80, h: 100, level: 0.6, label: '수조' },
    { type: 'pipe', points: [[120, 120], [200, 120], [200, 220]], flow: true, label: '배관' }, { type: 'valve', at: [200, 170] }]);
  assert.match(svg, /stroke-dasharray="5 3"/); assert.match(svg, /marker-end/); assert.match(svg, />수조</);
  assert.equal((svg.match(/<polyline/g) || []).length, 2);
});
test('blockArrow·scale·callout·lips', () => {
  const { svg, report } = R([{ type: 'blockArrow', from: [20, 20], to: [120, 20] },
    { type: 'scale', from: [40, 200], to: [240, 200], min: 0, max: 20, step: 5, label: 'mm' },
    { type: 'callout', at: [300, 60], text: '표지', target: [250, 100], anchor: 'start' }, { type: 'lips', at: [200, 120], w: 120, h: 50 }]);
  assert.equal(report.unresolved.length, 0); assert.match(svg, />20</); assert.match(svg, />표지</);
  assert.equal((svg.match(/<polygon/g) || []).length, 1);
});
test('그라데이션 채움은 토큰 색 stop', () => {
  const { svg } = R([{ type: 'rect', x: 10, y: 10, w: 100, h: 50, fill: { gradient: ['blue-f', 'rose-f'], angle: 0 } }]);
  assert.match(svg, /<linearGradient id="illus-g0" x1="0" y1="0.5" x2="1" y2="0.5">/); assert.match(svg, /fill:url\(#illus-g0\)/);
  assert.match(svg, /stop-color:var\(--si-blue-f/);
});
test('inset: 확대 원 안 요소는 clip 안에 중심 기준 좌표로', () => {
  const { svg } = R([{ type: 'inset', center: [300, 150], r: 60, source: { center: [100, 150], r: 14 },
    elements: [{ type: 'circle', center: [0, 0], r: 20 }, { type: 'text', at: [0, 40], text: '세포', anchor: 'middle' }] }]);
  assert.match(svg, /<clipPath id="illus-clip0"><circle cx="300" cy="150" r="60"/); assert.match(svg, /<g clip-path="url\(#illus-clip0\)"><circle cx="300" cy="150" r="20"/);
  assert.match(svg, /<text x="300" y="190"/);
});
test('repeat: 격자 복제·회전 복제', () => {
  const g = R([{ type: 'repeat', cols: 4, rows: 2, step: [20, 0], rowStep: [0, 20], element: { type: 'dot', at: [30, 30], r: 3 } }]);
  assert.equal((g.svg.match(/<circle/g) || []).length, 8); assert.match(g.svg, /cx="90" cy="50"/);
  const r = R([{ type: 'repeat', rotate: { center: [200, 150], angles: [0, 90, 180, 270] }, element: { type: 'line', from: [200, 150], to: [260, 150] } }]);
  assert.equal((r.svg.match(/rotate\(/g) || []).length, 4);
});
test('휴대폰 가독성: 375px 폰(그림 폭 311px) 기준 최소 글자', () => {
  const spec = (W, size) => ({ width: W, height: 100, elements: [{ type: 'text', at: [10, 50], text: '가', size }] });
  assert.equal(renderSVG(spec(311, 13)).report.minFontPhone, 13);
  assert.equal(renderSVG(spec(360, 13)).report.minFontPhone, 11.23);
  assert.equal(renderSVG(spec(440, 13)).report.minFontPhone, 9.19);
  assert.throws(() => renderSVG(spec(440, 13), { phoneMin: 11 }), /휴대폰 가독성/);
  assert.doesNotThrow(() => renderSVG(spec(360, 13), { phoneMin: 11 }));
  assert.throws(() => renderSVG({ ...spec(440, 13), phoneMin: 11 }), SpecError);
  assert.equal(renderSVG({ width: 100, height: 50, elements: [] }).report.minFontPhone, null);
});
