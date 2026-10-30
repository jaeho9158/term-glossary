import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findReadability } from '../src/readability.js';
import { findObscured } from '../src/obscure.js';

const wrap = body => `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" font-size="13">${body}</svg>`;
const whys = body => findReadability(wrap(body)).map(r => r.why);
const T = (x, y, s, extra = '') => `<text x="${x}" y="${y}" text-anchor="middle"${extra}>${s}</text>`;

test('점선이 다른 닫힌 도형 안쪽을 가로지르면 cross, 경계에 닿는 연결은 허용', () => {
  const box = '<rect x="100" y="100" width="100" height="60" fill="none" stroke="currentColor"/>';
  assert.ok(whys(box + '<line x1="50" y1="130" x2="260" y2="130" stroke="currentColor" stroke-dasharray="4 3"/>').includes('cross'));
  assert.ok(!whys(box + '<line x1="50" y1="130" x2="100" y2="130" stroke="currentColor" stroke-dasharray="4 3"/>').includes('cross'));
  assert.ok(!whys(box + '<line x1="120" y1="120" x2="180" y2="140" stroke="currentColor" stroke-dasharray="4 3"/>').includes('cross'));
});
test('clip-path 요소(해칭)는 선 검사에서 제외(가림 검사 포함)', () => {
  const hatch = '<line x1="50" y1="130" x2="260" y2="130" stroke="currentColor" stroke-dasharray="4 3" clip-path="url(#c)"/>';
  const box = '<rect x="100" y="100" width="100" height="60" fill="none" stroke="currentColor"/>';
  assert.ok(!whys(box + hatch).includes('cross'));
  const lbl = T(150, 134, '해칭 위');
  assert.equal(findObscured(wrap('<line x1="100" y1="130" x2="200" y2="130" stroke="currentColor" clip-path="url(#c)"/>' + lbl)).length, 0);
});
test('첨자 dy/dx 과다와 본 글자와 떨어진 작은 글자', () => {
  assert.ok(whys('<text x="50" y="50" font-size="13">E<tspan dy="9" font-size="9">Na</tspan></text>').includes('script-offset'));
  assert.ok(!whys('<text x="50" y="50" font-size="13">E<tspan dy="0.278em" font-size="72%">Na</tspan></text>').includes('script-offset'));
  assert.ok(whys('<text x="50" y="50" font-size="13">E<tspan baseline-shift="sub" font-size="72%">Na</tspan></text>').includes('script-keyword'));
  assert.ok(whys('<text x="100" y="50">E</text><text x="116" y="55" font-size="9">Na</text>').includes('script-gap'));
});
test('한 라벨 줄 간격 > 글자크기×1.5', () => {
  assert.ok(whys(T(100, 100, '위 줄') + T(100, 124, '아래 줄')).includes('line-gap'));
  assert.ok(!whys(T(100, 100, '위 줄') + T(100, 119, '아래 줄')).includes('line-gap'));
  assert.ok(!whys(T(100, 100, '위 줄') + T(160, 124, '다른 열')).includes('line-gap'));
});
test('지시선 60px 초과와 라벨 가장자리에서 시작하지 않는 지시선', () => {
  const lab = T(100, 50, '라벨');
  assert.ok(whys(lab + '<line class="si-leader" x1="100" y1="56" x2="100" y2="130" stroke="currentColor"/>').includes('leader-long'));
  assert.ok(!whys(lab + '<line class="si-leader" x1="100" y1="56" x2="100" y2="100" stroke="currentColor"/>').includes('leader-long'));
  assert.ok(whys(lab + '<line class="si-leader" x1="100" y1="80" x2="100" y2="110" stroke="currentColor"/>').includes('leader-detached'));
});
test('라벨-대상 거리 > 80px', () => {
  const lab = T(100, 50, '라벨');
  assert.ok(whys(lab + '<line x1="100" y1="56" x2="100" y2="160" stroke="currentColor" stroke-width="1"/><circle cx="100" cy="160" r="2" fill="currentColor"/>').includes('target-far'));
});
test('도형 윤곽과 겹친 선·곡선(용기 윤곽과 액체 경계)은 cross가 아니다', () => {
  const liquid = '<path d="M100,100 L100,150 Q100,160 110,160 L190,160 Q200,160 200,150 L200,100Z" fill="currentColor" fill-opacity="0.85" stroke="none"/>';
  const outline = '<path d="M100,60 L100,150 Q100,160 110,160 L190,160 Q200,160 200,150 L200,60" fill="none" stroke="currentColor"/>';
  const level = '<line x1="100" y1="100" x2="200" y2="100" stroke="currentColor" stroke-dasharray="5 3"/>';
  assert.ok(!whys(liquid + outline + level).includes('cross'));
  // 실제로 액체 안쪽을 가로지르는 점선은 계속 잡는다
  assert.ok(whys(liquid + '<line x1="90" y1="130" x2="210" y2="130" stroke="currentColor" stroke-dasharray="5 3"/>').includes('cross'));
});
