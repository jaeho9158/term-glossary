import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSVG, validate, resolveSpec, templates, PART_TYPES } from '../src/index.js';
import { wrapText, textWidth } from '../src/cartoon/scene.js';

const panel = (extra = {}) => ({ background: 'street', characters: [
  { id: 'g', who: 'student-f', pose: 'standing', expression: 'puzzled', x: 100, facing: 'right' },
  { id: 'm', who: 'adult-m', pose: 'pointing', expression: 'smile', x: 240, facing: 'left' }],
  bubbles: [{ speaker: 'g', kind: 'talk', text: '실례합니다. 도서관이 어디예요?' }, { speaker: 'm', kind: 'empty' }], ...extra });
const spec = p => resolveSpec({ template: 'cartoon', params: p }, templates);

test('cartoon: 등록·크기 계산·렌더', () => {
  for (const t of ['scene', 'character']) assert.ok(PART_TYPES.includes(t));
  const s = spec({ panels: [panel({ caption: '길 묻기' }), panel()] });
  assert.equal(s.width, 344); assert.ok(s.height > 640);
  const { svg, report } = renderSVG(s, { strict: true });
  assert.match(svg, />길 묻기</); assert.match(svg, />\?</); assert.equal(report.unresolved.length, 0);
  assert.ok(report.minFontPhone >= 12);
});
test('cartoon: 모든 인물·자세·표정 조합이 그려진다', () => {
  for (const who of ['student-m', 'student-f', 'adult-m', 'adult-f']) for (const pose of ['standing', 'sitting', 'pointing', 'lying'])
    for (const expression of ['neutral', 'smile', 'troubled', 'puzzled'])
      assert.match(renderSVG({ width: 200, height: 200, elements: [{ type: 'character', who, pose, expression, at: [100, 190] }] }).svg, /<g transform/);
});
test('wrapText: 폭을 넘지 않고 긴 낱말은 자른다', () => {
  for (const l of wrapText('가나다라마바사아자차카타파하 짧은 말', 14, 80)) assert.ok(textWidth(l, 14) <= 80, l);
});
test('cartoon 검증: 잘못된 값과 넘치는 글', () => {
  const bad = spec({ panels: [panel({ background: 'beach', characters: [{ id: 'g', who: 'robot', x: 5, pose: 'flying', hold: 'pizza' }], bubbles: [{ speaker: 'x', kind: 'talk' }] })] });
  const e = validate(bad).join('\n');
  for (const k of ['background', 'who', '.x', 'pose', 'hold', 'speaker', 'text']) assert.ok(e.includes(k), k);
  const long = spec({ panels: [panel({ bubbles: [{ speaker: 'g', text: '아주 긴 말 '.repeat(30) }] })] });
  assert.ok(validate(long).some(x => x.includes('넘칩니다')));
  assert.ok(validate(spec({ panels: [] })).some(x => x.includes('1~4')));
});
test('cartoon: 누운 인물·침대·병원·든 물건·옆얼굴·구름 말풍선', () => {
  const s = spec({ panels: [{ background: 'hospital', props: [{ type: 'bed', x: 110 }], characters: [
    { id: 'p', who: 'adult-m', pose: 'lying', expression: 'troubled', x: 110 },
    { id: 'n', who: 'adult-f', x: 280, facing: 'left', hold: 'clipboard', view: 'profile' }],
    bubbles: [{ speaker: 'n', kind: 'thought', text: '상태를 볼게요.' }] }] });
  assert.deepEqual(validate(s), []);
  const { svg } = renderSVG(s, { strict: true });
  assert.match(svg, /rotate\(-90\)/); assert.match(svg, / A[\d.]+,[\d.]+ 0 0 1 /);
  for (const hold of ['paper', 'phone', 'cup', 'clipboard']) assert.match(renderSVG({ width: 200, height: 200, elements: [{ type: 'character', who: 'student-m', hold, at: [100, 190] }] }).svg, /<g transform/);
});
test('wrapText: 마지막 줄에 낱말 하나만 남기지 않는다', () => {
  const l = wrapText('목격자가 혼자일 때 바로 다가가 도울 가능성이 아주 크다', 14, 260);
  assert.equal(l.length, 2); assert.ok(l[1].includes(' '), l.join('|'));
});
