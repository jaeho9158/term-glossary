import { test } from 'node:test';
import assert from 'node:assert/strict';
import linear from '../src/diagram/types/linear.js';

test('describeLinear: 받침에 따라 이/가·을/를·으로/로', () => {
  const spec = (a, b, kind) => ({ type: 'chain', nodes: [{ id: 'a', label: a }, { id: 'b', label: b }], edges: [{ from: 'a', to: 'b', kind }] });
  const d = (a, b, k) => linear.chain.describe(spec(a, b, k), 'T');
  assert.equal(d('반관통행동', '관통행동', 'inhibit'), 'T 진행 순서: 반관통행동이 관통행동을 억제.');
  assert.equal(d('효소', '기질', 'inhibit'), 'T 진행 순서: 효소가 기질을 억제.');
  assert.equal(d('장애물', '전위 이동(슬립)', 'inhibit'), 'T 진행 순서: 장애물이 전위 이동(슬립)을 억제.');
  assert.equal(d('A', 'DNA', 'inhibit'), 'T 진행 순서: A가 DNA를 억제.');
  assert.equal(d('간', '신경', 'blocked'), 'T 진행 순서: 간에서 신경으로 가는 경로는 차단됨.');
  assert.equal(d('간', '뇌', 'blocked'), 'T 진행 순서: 간에서 뇌로 가는 경로는 차단됨.');
  assert.equal(d('간', '혈관 벽', 'blocked'), 'T 진행 순서: 간에서 혈관 벽으로 가는 경로는 차단됨.');
  assert.equal(d('간', '소장', 'blocked'), 'T 진행 순서: 간에서 소장으로 가는 경로는 차단됨.');
  assert.equal(d('간', '근육 세포 내 칼슘 저장소 밖 물', 'blocked'), 'T 진행 순서: 간에서 근육 세포 내 칼슘 저장소 밖 물로 가는 경로는 차단됨.');
});
