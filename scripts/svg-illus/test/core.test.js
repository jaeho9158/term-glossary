import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseMarkup, toTspan, toHtml, symHtml, kindOf, legendHTML, tableHTML, placeLabels, labelBox,
  validate, renderSVG, renderHTML, SpecError, templates, toFigure, toSVG, validateDiagram, renderDiagram, PLOT_FNS, colorRef, isDiagram,
} from '../src/index.js';

// ── 첨자 파싱 ──
test('첨자: 중괄호·한 글자·혼합', () => {
  assert.deepEqual(parseMarkup('x_{1}'), [{ text: 'x', kind: 'normal' }, { text: '1', kind: 'sub' }]);
  assert.deepEqual(parseMarkup('x^2'), [{ text: 'x', kind: 'normal' }, { text: '2', kind: 'sup' }]);
  assert.deepEqual(parseMarkup('a_{ij}^{2} + b').map(p => p.kind), ['normal', 'sub', 'sup', 'normal']);
  assert.equal(toTspan('x_{1}'), 'x<tspan baseline-shift="sub" font-size="72%">1</tspan>');
  assert.equal(toHtml('‖a‖^{2}'), '‖a‖<sup>2</sup>');
});
test('첨자: XML 특수문자는 이스케이프', () => {
  assert.equal(toTspan('a<b & c'), 'a&lt;b &amp; c');
  assert.equal(toHtml('x_{<1}'), 'x<sub>&lt;1</sub>');
});

// ── 범례 kind ──
test('kind 자동 판정', () => {
  assert.equal(kindOf('θ'), 'var');
  assert.equal(kindOf('n_{1}'), 'var');
  assert.equal(kindOf('proj_{b} a'), 'expr');
  assert.equal(kindOf('cos'), 'func');
  assert.equal(kindOf('π'), 'const');
  assert.equal(kindOf('HSL'), 'abbr');
  assert.equal(kindOf('피스톤'), 'term');
  assert.equal(kindOf(''), 'note');
  assert.equal(kindOf('µm', 'unit'), 'unit');
});
test('범례: 수학 변수만 기울임', () => {
  assert.equal(symHtml('θ'), '<i>θ</i>');
  assert.equal(symHtml('proj_{b} a'), 'proj<sub><i>b</i></sub> <i>a</i>');
  assert.equal(symHtml('cos'), 'cos');
  assert.equal(symHtml('HSL'), 'HSL');
  assert.equal(symHtml('포트 A·B'), '포트 A·B'); // term: A, B도 정체
  assert.equal(symHtml('x', 'unit'), 'x');
  const h = legendHTML([{ sym: 'a, b', desc: '벡터' }, { desc: '주석 n_{1}' }]);
  assert.match(h, /<dl class="si-legend"><div data-kind="expr"><dt><i>a<\/i>, <i>b<\/i><\/dt><dd>벡터<\/dd><\/div><\/dl>/);
  assert.match(h, /<p class="si-note">주석 n<sub>1<\/sub><\/p>/);
});
test('대응표: 번호 열', () => {
  const h = tableHTML({ numbered: true, columns: ['영어', '한국어'], rows: [['piston', '피스톤']] });
  assert.match(h, /<th scope="col">번호<\/th>/);
  assert.match(h, /<span class="si-badge">1<\/span><\/td><td>piston<\/td><td>피스톤<\/td>/);
});

// ── 겹침 회피 ──
test('겹침 회피: 같은 자리 두 라벨은 떨어뜨린다', () => {
  const L = [{ x: 100, y: 100, text: '라벨 하나', size: 13, anchor: 'start' }, { x: 100, y: 100, text: '라벨 둘', size: 13, anchor: 'start' }];
  const r = placeLabels(L, {}, 400, 300);
  assert.equal(r.unresolved.length, 0);
  assert.equal(r.collisionsBefore, 1);
  const [a, b] = r.labels.map(l => l.box);
  assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
});
test('겹침 회피: 선분을 피하고, 멀리 옮기면 지시선', () => {
  const seg = [[0, 95, 400, 95]];
  const r = placeLabels([{ x: 150, y: 100, text: 'AAAAAAAAAA', size: 13, anchor: 'start' }], { segments: seg }, 400, 300, { leaderMin: 0 });
  assert.equal(r.unresolved.length, 0);
  assert.ok(r.leaders.length === 1);
});
test('겹침 회피: fixed 라벨은 옮기지 않고 미해결로 보고', () => {
  const r = placeLabels([{ x: 10, y: 20, text: 'A', size: 13, anchor: 'start' }, { x: 10, y: 20, text: 'B', size: 13, anchor: 'start', fixed: true }], {}, 200, 100);
  assert.equal(r.unresolved.length, 1);
  assert.equal(r.labels[1].x, 10);
});
test('겹침 회피: 측정 훅을 쓴다', () => {
  const b = labelBox({ x: 0, y: 20, text: 'abc', size: 10, anchor: 'start' }, 0, 20, () => 99);
  assert.equal(b.x1, 99);
  const { report } = renderSVG({ width: 200, height: 100, elements: [{ type: 'text', at: [10, 50], text: 'x' }] }, { measureText: () => 500 });
  assert.equal(report.unresolved.length, 1); // 500px 글자는 어디에도 안 들어간다
});

// ── 스펙 검증 ──
test('검증: 오류를 모두 모아 경로와 함께 알린다', () => {
  const errs = validate({ width: -1, elements: [{ type: 'blob' }, { type: 'line', from: [0, 0] }, { type: 'text', at: 'Q', text: 'x' }, { type: 'curve', fn: 'process.exit()', domain: [0, 1] }], legend: [{ sym: 'x', kind: 'weird', desc: 'd' }] });
  const joined = errs.join('\n');
  for (const s of ['width', 'height', 'elements[0].type', 'elements[1]: line에는 "to"', 'elements[2].at: 정의되지 않은 점 이름 "Q"', 'elements[3].fn', 'legend[0].kind'])
    assert.ok(joined.includes(s), '빠진 오류: ' + s + '\n' + joined);
  assert.throws(() => renderSVG({ width: 10 }), SpecError);
});
test('검증: 수식은 x와 Math만', () => {
  assert.equal(validate({ width: 9, height: 9, elements: [{ type: 'curve', fn: 'sin(x)^2 + PI', domain: [0, 1] }] }).length, 0);
  assert.ok(validate({ width: 9, height: 9, elements: [{ type: 'curve', fn: 'constructor', domain: [0, 1] }] }).length > 0);
  assert.ok(validate({ width: 9, height: 9, elements: [{ type: 'curve', fn: 'x["a"]', domain: [0, 1] }] }).length > 0);
});
test('검증: 도식 어댑터는 원본 규칙', () => {
  assert.ok(validateDiagram({ type: 'chain', nodes: [] }).some(e => e.includes('nodes가 비어')));
  assert.ok(validateDiagram({ type: 'nope' }).some(e => e.includes('type이 올바르지')));
  assert.ok(validateDiagram({ type: 'plot', plot: { series: [{ fn: 'power', params: { a: -1, b: 2 } }], x: { label: 'x', range: [0, 1] }, y: { label: 'y' } } }, { requireMeta: false }).some(e => e.includes('a=-1 범위 밖')));
});

// ── 렌더 ──
test('렌더: 좌표계·극좌표·호·해치·곡선', () => {
  const svg = renderSVG({ id: 't', width: 300, height: 200, frame: { origin: [150, 100], scale: 20 }, points: { O: [0, 0] },
    elements: [{ type: 'arrow', from: 'O', to: { polar: [3, 90] } }, { type: 'arc', center: 'O', r: 20, start: 0, end: 90, label: 'θ' },
      { type: 'hatch', points: [[1, 1], [3, 1], [3, 2]] }, { type: 'curve', fn: 'x^2/4', domain: [-2, 2] }] }).svg;
  assert.match(svg, /<line x1="150" y1="100" x2="150" y2="40"/); // 극좌표 (3, 90°) → 위로 60px
  assert.match(svg, /<path d="M170,100 A20,20 0 0 0 150,80"/);
  assert.match(svg, /clip-path="url\(#t-clip0\)"/);
  assert.match(svg, /<text [^>]*>θ<\/text>/);
});
test('렌더: HTML figure 구조와 출처 표기', () => {
  const h = renderHTML({ id: 'f', width: 100, height: 60, title: '제목', elements: [], legend: [{ sym: 'x', desc: 'd' }], credit: '직접 작성', license: 'CC BY 4.0' });
  assert.match(h, /^<figure class="si-figure" data-kind="illus" id="fig-f"><div class="si-frame"><svg class="si si-illus"/);
  assert.match(h, /<figcaption><span class="si-caption">제목<\/span><dl class="si-legend">.*<span class="si-credit">직접 작성 · CC BY 4.0<\/span><\/figcaption><\/figure>$/);
});
test('테마: 토큰 색은 CSS 변수 + 기본값', () => {
  assert.equal(colorRef('accent'), 'var(--si-accent,#2454ff)');
  assert.equal(colorRef('green'), 'var(--si-green-s,#5b9b83)');
  assert.equal(colorRef('good'), 'var(--si-pos,#14543c)');
  assert.equal(colorRef('fg'), 'currentColor');
  assert.equal(colorRef('#123456'), '#123456');
  assert.match(renderSVG({ width: 10, height: 10, palette: { accent: '#ff0000' }, elements: [] }).svg, /--si-accent:#ff0000/);
});
test('템플릿 5종이 겹침 없이 렌더된다', () => {
  const cases = {
    crossSection: { parts: [{ name: '외피', x: 40, y: 40, w: 300, h: 120, hatch: true }, { name: '속', x: 80, y: 70, w: 220, h: 60, fill: 'blue' }] },
    geometry: { points: { A: [0, 0], B: [4, 0], C: [0, 3] }, polygons: [['A', 'B', 'C']], angles: [{ at: 'B', from: 'C', to: 'A', label: 'θ' }], rightAngles: [{ at: 'A', from: 'B', to: 'C' }] },
    functionPlot: { x: [-3, 3], y: [-2, 2], fns: [{ expr: 'sin(x)', label: 'sin x' }] },
    structure: { nodes: [{ id: 'a', text: 'A', at: [80, 60] }, { id: 'b', text: 'B', at: [300, 60] }], edges: [{ from: 'a', to: 'b', label: '흐름' }] },
    flow: { steps: ['하나', '둘', '셋', '넷', '다섯'] },
  };
  for (const [name, params] of Object.entries(cases)) {
    const { report } = renderSVG({ template: name, params }, { templates });
    assert.equal(report.unresolved.length, 0, name + ' ' + JSON.stringify(report.unresolved));
  }
});
test('예제 스펙 전부 겹침 없이 렌더', () => {
  const dir = new URL('../examples/specs/', import.meta.url);
  for (const f of fs.readdirSync(dir)) {
    const spec = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    if (isDiagram(spec)) { assert.equal(renderDiagram(spec).warnings.length, 0, f); continue; }
    assert.equal(renderSVG(spec, { templates }).report.unresolved.length, 0, f);
    assert.match(toFigure(spec), /^<figure class="si-figure"/);
  }
});

// ── 도식 어댑터 ──
test('도식: 9유형 렌더 + overlay', () => {
  const plot = { type: 'plot', plot: { series: [{ fn: 'normal', params: { mu: 0, sigma: 1 } }], x: { label: 'x', range: [-3, 3] }, y: { label: '밀도' } },
    overlay: [{ type: 'text', at: [0, 0.3], text: '평균', size: 11 }, { type: 'line', from: [0, 0], to: [0, 0.4], dash: true }] };
  const r = renderDiagram(plot);
  assert.match(r.html, /data-kind="diagram" data-type="plot"/);
  assert.match(r.html, /<g class="si-overlay"/);
  assert.match(toSVG(plot), /var\(--si-navy,#12305c\)/);
});
test('plot 함수: 기존 10개 + 추가 7개', () => {
  for (const k of ['normal', 't', 'chi2', 'exponential', 'logistic', 'linear', 'roc', 'hill', 'inverted_u', 'decay',
    'power', 'reciprocal', 'prospect_value', 'quadratic_pair', 'step_survival', 'concentration_time', 'cox_hazard']) assert.ok(PLOT_FNS[k], k);
  const F = PLOT_FNS;
  assert.equal(F.power.f(2, { a: 0.5, b: 2 }), 2);
  assert.equal(F.reciprocal.f(4, { k: 16, c: 0 }), 4);
  assert.ok(Math.abs(F.prospect_value.f(-1, { alpha: 0.88, beta: 0.88, lambda: 2.25 }) + 2.25) < 1e-12);
  assert.equal(F.quadratic_pair.f(1, { H0: 10, a: 2, Hs: 1, k: 3, branch: 0 }), 8);
  assert.equal(F.quadratic_pair.f(1, { H0: 10, a: 2, Hs: 1, k: 3, branch: 1 }), 4);
  assert.equal(F.step_survival.f(5, { times: [1, 3, 7], events: [1, 1, 1], atRisk: [10, 9, 8] }), 0.9 * (1 - 1 / 9));
  assert.equal(F.concentration_time.f(0, { ka: 1, ke: 0.2, scale: 1 }), 0);
  assert.equal(F.cox_hazard.f(0, { beta: 0.7, h0: 0.1 }), 0.1);
  assert.ok(isDiagram({ type: 'venn' }) && !isDiagram({ type: 'plot', elements: [] }));
});

test('plot 함수: km_function·mixing_free_energy', () => {
  const near = (a, b, t = 1e-9) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
  near(PLOT_FNS.km_function.f(0.8, {}), 0.025);
  near(PLOT_FNS.km_function.f(0.1, {}), 4.05);
  near(PLOT_FNS.km_function.f(1, {}), 0);
  // 고분자 부피분율 φ(N1=100), 용매(N2=1): χ=0이면 ΔG/kT = (φ/100) ln φ + (1−φ) ln(1−φ)
  near(PLOT_FNS.mixing_free_energy.f(0.5, { N1: 100, N2: 1, chi: 0 }), 0.5 * Math.log(0.5) + 0.005 * Math.log(0.5));
  near(PLOT_FNS.mixing_free_energy.f(0.5, { N1: 100, N2: 1, chi: 1 }), 0.5 * Math.log(0.5) + 0.005 * Math.log(0.5) + 0.25);
  // 임계 χc = ½(1/√N1 + 1/√N2)² = 0.605 에서 φ=φc=√N1/(√N1+√N2) 의 2차 도함수가 0
  const p = { N1: 100, N2: 1, chi: 0.605 }, c = 1 / 11, h = 1e-4;
  const d2 = (PLOT_FNS.mixing_free_energy.f(c + h, p) - 2 * PLOT_FNS.mixing_free_energy.f(c, p) + PLOT_FNS.mixing_free_energy.f(c - h, p)) / (h * h);
  assert.ok(Math.abs(d2) < 1e-2, String(d2));
  assert.deepEqual(validateDiagram({ type: 'plot', plot: { series: [{ fn: 'km_function', params: {} }], x: { label: 'R', range: [0.05, 1] }, y: { label: 'K/S' } } }, { requireMeta: false }), []);
  assert.ok(validateDiagram({ type: 'plot', plot: { series: [{ fn: 'mixing_free_energy', params: { N1: 0, N2: 1, chi: 1 } }], x: { label: 'φ', range: [0, 1] }, y: { label: 'g' } } }, { requireMeta: false }).some(e => e.includes('N1=0 범위 밖')));
});
