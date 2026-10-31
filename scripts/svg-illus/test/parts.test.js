import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSVG, validate, PART_TYPES, ICONS, SpecError, armJoints, legJoints } from '../src/index.js';

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
test('repeat: rect x,y,w,h 형식도 반복 이동값 적용(회귀)', () => {
  for (const el of [{ type: 'rect', x: 10, y: 10, w: 8, h: 6 }, { type: 'rect', from: [10, 10], to: [18, 16] }]) {
    const g = R([{ type: 'repeat', cols: 3, step: [20, 0], element: el }]);
    assert.deepEqual([...g.svg.matchAll(/<rect x="([\d.]+)" y="10"/g)].map(m => +m[1]), [10, 30, 50]);
  }
  const m = R([{ type: 'repeat', cols: 2, step: [20, 5], element: { type: 'ellipse', center: [10, 10], rx: 3, ry: 2 } },
    { type: 'repeat', cols: 2, step: [20, 5], element: { type: 'text', at: [10, 40], text: 'a' } }]);
  assert.match(m.svg, /<ellipse cx="30" cy="15"/); assert.match(m.svg, /<text x="30" y="45"/);
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
test('인체 윤곽 부품: body·torso·arm·hand·leg·foot·head', () => {
  for (const t of ['body', 'torso', 'arm', 'hand', 'leg', 'foot', 'head']) assert.ok(PART_TYPES.includes(t), t);
  for (const view of ['front', 'side']) {
    const { svg } = R([{ type: 'body', at: [150, 10], h: 280, view }]);
    assert.ok((svg.match(/<path/g) || []).length >= 6, view);
  }
  const { svg } = R([{ type: 'arm', at: [50, 40], len: 160, bend: 20 }, { type: 'leg', at: [200, 40], len: 150, view: 'side' }, { type: 'head', at: [300, 60], h: 60, view: 'front' }]);
  assert.match(svg, /<path/);
  const j = armJoints({ at: [0, 0], len: 100, angle: 0 });
  assert.deepEqual(j.joints[1].map(Math.round), [0, 43]); assert.deepEqual(j.joints[2].map(Math.round), [0, 80]);
  assert.equal(legJoints({ at: [0, 0], len: 100 }).joints.length, 3);
});

test("인체 부품 style:'natural'과 발 변형 파라미터(요족·첨족·내전·내반)", () => {
  const A = el => R([el]).svg;
  const d = s => (s.match(/ d="([^"]+)"/) || [])[1];
  for (const view of ['front', 'side']) assert.ok((A({ type: 'body', at: [150, 10], h: 300, view, style: 'natural' }).match(/<path/g) || []).length >= 6, view);
  // 기본(옛) 출력은 style 없을 때 그대로, natural은 다른 윤곽
  assert.notEqual(d(A({ type: 'leg', at: [50, 20], len: 150, view: 'side' })), d(A({ type: 'leg', at: [50, 20], len: 150, view: 'side', style: 'natural' })));
  // 발 변형: 값이 달라지면 윤곽이 달라진다
  const side = o => d(A({ type: 'foot', at: [80, 60], len: 100, view: 'side', ...o }));
  assert.notEqual(side({}), side({ cavus: 1 }));
  assert.notEqual(side({ cavus: 0 }), side({ equinus: 30 }));
  const top = o => d(A({ type: 'foot', at: [80, 180], len: 100, view: 'top', ...o }));
  assert.notEqual(top({ adductus: 0 }), top({ adductus: 30 }));
  const back = o => d(A({ type: 'foot', at: [80, 80], len: 100, view: 'back', ...o }));
  assert.notEqual(back({ varus: 0 }), back({ varus: 20 }));
  assert.notEqual(top({ side: 'right' }), top({ side: 'left' }));
  assert.doesNotThrow(() => R([{ type: 'hand', at: [60, 60], len: 60, style: 'natural' }, { type: 'foot', at: [50, 50], len: 50, view: 'front', style: 'natural' }, { type: 'torso', at: [100, 60], h: 120, view: 'side', style: 'natural' }, { type: 'head', at: [100, 30], h: 50, view: 'front', style: 'natural' }]));
});
test('화살표 head 배율: 기본 출력 불변, head를 주면 별도 작은 화살촉', () => {
  const base = R([{ type: 'arrow', from: [10, 10], to: [40, 10] }]).svg;
  assert.match(base, /markerWidth="7"/);
  const small = R([{ type: 'arrow', from: [10, 10], to: [40, 10], head: 0.5 }, { type: 'arrow', from: [10, 30], to: [40, 30] }]).svg;
  assert.match(small, /markerWidth="3.5"/); assert.match(small, /markerWidth="7"/);
});
test('thorax: 흉곽 정면 단면(갈비뼈·폐·횡격막·기관), inhale이 클수록 폭이 넓고 횡격막이 내려간다', () => {
  assert.ok(PART_TYPES.includes('thorax'));
  assert.ok(validate({ width: 10, height: 10, elements: [{ type: 'thorax' }] }).some(e => e.includes('at')));
  const out = inh => R([{ type: 'thorax', at: [150, 40], w: 160, h: 150, inhale: inh, ribs: 3, ghost: inh ? 0 : undefined }]).svg;
  const a = out(0), b = out(1);
  assert.ok((a.match(/<path/g) || []).length >= 9); assert.match(b, /stroke-dasharray="5 4"/); assert.doesNotMatch(a, /stroke-dasharray="5 4"/);
  assert.notEqual(a, b);
  assert.doesNotMatch(R([{ type: 'thorax', at: [150, 40], airway: false }]).svg, /<line/);
});
test('brain·gut: 장기 부품(뇌 옆모습, 소화관 개략), flip과 크기 반영', () => {
  assert.ok(PART_TYPES.includes('brain') && PART_TYPES.includes('gut'));
  assert.ok(validate({ width: 10, height: 10, elements: [{ type: 'brain' }] }).some(e => e.includes('at')));
  const a = R([{ type: 'brain', at: [100, 20], w: 100 }]).svg, b = R([{ type: 'brain', at: [100, 20], w: 100, flip: true }]).svg;
  assert.ok((a.match(/<path/g) || []).length >= 7); assert.notEqual(a, b);
  const g = R([{ type: 'gut', at: [100, 20] }]).svg;
  assert.ok((g.match(/<path/g) || []).length >= 4);
  assert.ok((R([{ type: 'gut', at: [100, 20], colon: false }]).svg.match(/<path/g) || []).length < (g.match(/<path/g) || []).length);
});

test('kidney: 신장 부품(신문·수질 경계), adrenal로 부신을 얹고 flip으로 좌우 반전', () => {
  assert.ok(PART_TYPES.includes('kidney'));
  assert.ok(validate({ width: 10, height: 10, elements: [{ type: 'kidney' }] }).some(e => e.includes('at')));
  const a = R([{ type: 'kidney', at: [100, 20], h: 80 }]).svg, b = R([{ type: 'kidney', at: [100, 20], h: 80, flip: true }]).svg;
  const c = R([{ type: 'kidney', at: [100, 20], h: 80, adrenal: true }]).svg;
  assert.equal((a.match(/<path/g) || []).length, 2); assert.equal((c.match(/<path/g) || []).length, 3);
  assert.notEqual(a, b);
});
