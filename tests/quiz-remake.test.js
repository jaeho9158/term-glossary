// 퀴즈 리메이크 순수 함수: 헷갈리는 보기, 문제 구성, 오답 목록 규칙.
const assert = require("assert");
const test = require("node:test");
const { pickConfusables, buildQuestion, updateWrongList, typableTerms } = require("../assets/quiz-core.js");

const mk = (slug, sub, related) => ({ slug, title_ko: "T" + slug, meaning: "M" + slug, subcategory: sub, related: related || [] });
const pool = [
  mk("a", "s1", ["b"]), mk("b", "s1"), mk("c", "s1"), mk("d", "s2", ["a"]),
  mk("e", "s2"), mk("f", "s3"), mk("g", "s3"),
];

test("confusables: related(양방향)와 같은 소분야가 먼저 뽑힌다", () => {
  const r = pickConfusables(pool[0], pool, () => 0.3, 3);
  const slugs = r.terms.map(t => t.slug).sort();
  assert.deepStrictEqual(slugs, ["b", "c", "d"]); // b(related) d(역방향 related) c(같은 소분야)
  assert.strictEqual(r.fallback, false);
});

test("confusables: 가까운 후보가 모자라면 나머지로 채우고 fallback", () => {
  const r = pickConfusables(pool[5], pool, Math.random, 3); // f: 같은 소분야 g 하나뿐
  assert.strictEqual(r.terms.length, 3);
  assert.strictEqual(r.fallback, true);
  assert.ok(!r.terms.some(t => t.slug === "f"));
});

test("confusables: 제목이 같은 보기와 정답 자신은 제외", () => {
  const p = [mk("a", "s"), { ...mk("x", "s"), title_ko: "Ta" }, mk("y", "s"), mk("z", "s")];
  const r = pickConfusables(p[0], p, Math.random, 3);
  assert.ok(r.terms.every(t => t.title_ko !== "Ta"));
});

test("buildQuestion: 세 유형의 보기 4개·정답 포함·중복 없음", () => {
  for (const kind of ["def2term", "term2def", "confuse"]) {
    const q = buildQuestion(pool[0], kind, pool);
    assert.strictEqual(q.options.length, 4, kind);
    assert.ok(q.options.includes(q.answer), kind);
    assert.strictEqual(new Set(q.options).size, 4, kind);
  }
  assert.strictEqual(buildQuestion(pool[0], "term2def", pool).answer, "Ma");
  assert.strictEqual(buildQuestion(pool[0], "def2term", pool).prompt, "Ma");
});

test("buildQuestion: 주관식은 보기가 없다", () => {
  const q = buildQuestion(pool[0], "subjective", pool);
  assert.deepStrictEqual(q.options, []);
  assert.strictEqual(q.answer, "Ta");
});

test("typableTerms: 긴 제목·괄호 제거, 4개 미만이면 원본 유지", () => {
  const many = ["가", "나", "다", "라", "마"].map(k => ({ title_ko: k }));
  assert.strictEqual(typableTerms(many.concat([{ title_ko: "아주아주긴용어이름입니다" }, { title_ko: "로(옵션)" }])).length, 5);
  const few = [{ title_ko: "가" }, { title_ko: "긴긴긴긴긴긴긴긴긴긴긴" }];
  assert.strictEqual(typableTerms(few).length, 2);
});

test("updateWrongList: 오답 추가, 연속 두 번 정답이면 제거, 중간에 틀리면 리셋", () => {
  let l = updateWrongList([], "a", false);
  assert.deepStrictEqual(l, [{ slug: "a", streak: 0 }]);
  l = updateWrongList(l, "a", true);
  assert.deepStrictEqual(l, [{ slug: "a", streak: 1 }]);
  l = updateWrongList(l, "a", false);
  assert.strictEqual(l[0].streak, 0);
  l = updateWrongList(l, "a", true);
  l = updateWrongList(l, "a", true);
  assert.deepStrictEqual(l, []);
});

test("updateWrongList: 목록에 없는 정답은 무변화, 원본 불변", () => {
  const orig = [{ slug: "a", streak: 1 }];
  assert.deepStrictEqual(updateWrongList(orig, "zz", true), orig);
  updateWrongList(orig, "a", true);
  assert.strictEqual(orig[0].streak, 1);
});
