// 문서 주제 추정(computeTopicRelevance): 반복되는 용어가 몰린 대분류를 주제로
// 잡고, 그 밖의 대분류에만 속한 용어를 "주제와 멂"으로 가른다.
const assert = require("assert");
const { computeTopicRelevance, matchTerms } = require("../assets/viewer.js");

const GROUPS = [
  { label: "연구 기초·방법", codes: ["stat", "method"] },
  { label: "의학·생명", codes: ["med", "neuro", "bio"] },
  { label: "공학·기술", codes: ["mechanical", "materials"] },
  { label: "인문학", codes: ["philo"] },
];

const m = (slug, categories, count) => ({ slug, categories, count });

// 1) 신경과학 논문에 재료공학 동음이의어가 하나 섞인 경우 — 의학·생명만 주제
{
  const matches = [
    m("bbb", ["neuro", "med"], 12),
    m("astrocyte", ["neuro", "bio"], 6),
    m("microbubble", ["med"], 4),
    m("shear-stress", ["mechanical"], 1),
    m("p-value", ["stat"], 3),
  ];
  const r = computeTopicRelevance(matches, GROUPS);
  assert.deepStrictEqual([...r.dominantGroups], ["의학·생명"]);
  assert.strictEqual(r.isRelevant(matches[0]), true);
  assert.strictEqual(r.isRelevant(matches[3]), false, "재료공학 단독 용어는 주제와 멀다");
  assert.strictEqual(r.isRelevant(matches[4]), true, "통계 용어는 항상 관련 있음");
  assert.strictEqual(r.isRelevantCode("mechanical"), false, "주제 밖 분야는 선택지에서도 뺀다");
  assert.strictEqual(r.isRelevantCode("stat"), true);
  assert.strictEqual(r.isRelevantCode("neuro"), true);
}

// 1-1) 통계 용어에 덤으로 붙은 다른 분야 태그는 주제 근거로 세지 않는다
{
  const matches = [
    m("bbb", ["neuro"], 3),
    m("astrocyte", ["neuro"], 2),
    m("correlation", ["stat", "mechanical"], 1),
    m("shear-stress", ["mechanical"], 1),
  ];
  const r = computeTopicRelevance(matches, GROUPS);
  assert.deepStrictEqual([...r.dominantGroups], ["의학·생명"]);
  assert.strictEqual(r.isRelevant(matches[2]), true);
  assert.strictEqual(r.isRelevant(matches[3]), false);
}

// 2) 두 분야가 비슷하게 섞인 학제 논문 — 둘 다 주제로 남는다
{
  const matches = [
    m("a", ["neuro"], 5),
    m("b", ["mechanical"], 5),
    m("c", ["materials"], 4),
    m("d", ["philo"], 1),
  ];
  const r = computeTopicRelevance(matches, GROUPS);
  assert.ok(r.dominantGroups.has("의학·생명") && r.dominantGroups.has("공학·기술"));
  assert.strictEqual(r.isRelevant(matches[3]), false);
}

// 3) 기초·방법 용어만 있으면 주제를 못 잡으므로 아무것도 거르지 않는다
{
  const matches = [m("p-value", ["stat"], 3), m("cohort", ["method"], 2)];
  const r = computeTopicRelevance(matches, GROUPS);
  assert.strictEqual(r.dominantGroups.size, 0);
  assert.strictEqual(r.isRelevant(m("x", ["philo"], 1)), true);
}

// 4) 대분류를 모르는 코드는 거르지 않는다(데이터 불일치로 용어가 증발하지 않게)
{
  const r = computeTopicRelevance([m("a", ["neuro"], 5)], GROUPS);
  assert.strictEqual(r.isRelevant(m("z", ["unknown-code"], 1)), true);
}

// 5) 한 글자 표제어는 본문에 같은 글자가 있어도 매칭하지 않는다
{
  const terms = [
    { slug: "blood", title_ko: "혈", title_en: "Blood", categories: ["kmed"] },
    { slug: "bbb", title_ko: "혈액뇌장벽", title_en: "Blood-Brain Barrier", categories: ["neuro"] },
  ];
  const found = matchTerms("혈 이라는 글자와 혈액뇌장벽 개방", terms).map((x) => x.slug);
  assert.deepStrictEqual(found, ["bbb"]);
}

console.log("viewer-topic: all tests passed");
