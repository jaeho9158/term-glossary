const test = require("node:test");
const assert = require("node:assert");
const { applySenseContextRule } = require("../assets/viewer.js");

// 같은 한글 표제어를 가진 두 용어(중독 = addiction / poisoning)가 한 자리에서 함께
// 잡혔을 때, 문맥 뜻 키워드가 더 많이 겹치는 쪽만 남기고 다른 쪽은 강등한다.
const at = (text, word) => {
  const occ = [];
  for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) occ.push({ start: i, length: word.length });
  return occ;
};
const mk = (text, slug, title_en, categories, sense) => ({
  slug, title_ko: "중독", title_en, categories, sense, viaHangul: true, occurrences: at(text, "중독"),
});
const pair = (text) => [
  mk(text, "addiction", "Addiction", ["psych", "socwelfare", "med"], ["도박", "알코올", "게임", "물질사용장애"]),
  mk(text, "poisoning", "Poisoning", ["ems"], ["해독제", "독성", "섭취", "흡입"]),
];
const byslug = (list) => Object.fromEntries(list.map((m) => [m.slug, m]));

test("동형 표제어: 마약·도박 문맥이면 addiction 유지, poisoning 강등", () => {
  const text = "청소년의 도박 중독과 알코올 중독은 게임 이용과 관련이 있다.";
  const r = byslug(applySenseContextRule(pair(text), text, ["의학·생명"]));
  assert.ok(!r.addiction.distant);
  assert.strictEqual(r.poisoning.distant, true);
  assert.strictEqual(r.poisoning.demotedBy, "homonym");
});

test("동형 표제어: 독성 물질 문맥이면 poisoning 유지, addiction 강등", () => {
  const text = "농약 섭취에 의한 급성 중독 환자에게 해독제를 투여했고 독성 지표를 측정했다.";
  const r = byslug(applySenseContextRule(pair(text), text, ["의학·생명"]));
  assert.ok(!r.poisoning.distant);
  assert.strictEqual(r.addiction.distant, true);
});

test("동형 표제어: 양쪽 겹침이 같으면 둘 다 건드리지 않는다", () => {
  const text = "중독 사례를 보고한다.";
  const r = byslug(applySenseContextRule(pair(text), text, ["의학·생명"]));
  assert.ok(!r.poisoning.distant && !r.addiction.distant);
});
