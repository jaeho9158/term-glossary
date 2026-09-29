// 중복 후보 탐지(scripts/prune/find-duplicates.js) 단위 테스트. 픽스처: tests/fixtures/prune-terms.json
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { findDuplicates, antonymPair } = require("../scripts/prune/find-duplicates.js");
const lib = require("../scripts/prune/lib.js");

const TERMS = require(path.join(__dirname, "fixtures", "prune-terms.json"));
const result = findDuplicates(TERMS, { ga: new Map() });
const groupOf = (slug) => result.groups.find((g) => g.members.some((m) => m.slug === slug));
const slugsOf = (g) => g.members.map((m) => m.slug).sort();

test("정규화: norm은 공백·기호 제거, normStem은 접미(이론·효과…)만 따로 뗀다", () => {
  assert.strictEqual(lib.norm("Learning Theory"), "learningtheory");
  assert.strictEqual(lib.normStem("인지부하이론"), "인지부하");
  assert.strictEqual(lib.normStem("인지부하"), "인지부하");
  assert.strictEqual(lib.normStem("이론"), "이론"); // 남는 글자가 2자 미만이면 뗀 값을 쓰지 않는다
});

test("R1: 한글 제목 정규화가 같으면 high 그룹", () => {
  const g = groupOf("learning-theory-a");
  assert.deepStrictEqual(slugsOf(g), ["learning-theory-a", "learning-theory-b"]);
  assert.ok(g.rules.includes("R1"));
  assert.strictEqual(g.conf, "high");
});

test("R2: 영문 제목 정규화가 같고 카테고리가 겹치면 high", () => {
  const g = groupOf("vr-a");
  assert.deepStrictEqual(slugsOf(g), ["vr-a", "vr-b"]);
  assert.deepStrictEqual(g.rules, ["R2"]);
  assert.strictEqual(g.conf, "high");
});

test("R2 자동 제외: 카테고리가 다른 동음이의어는 후보에서 빠지고 기록만 남는다", () => {
  assert.strictEqual(groupOf("homonym-a"), undefined);
  assert.ok(result.excluded.some((e) => e.reason === "homonym-other-field"
    && [e.a, e.b].sort().join() === "homonym-a,homonym-b"));
});

test("R3: 제목이 다른 용어의 aliases와 같으면 high", () => {
  const g = groupOf("alias-target");
  assert.deepStrictEqual(slugsOf(g), ["alias-holder", "alias-target"]);
  assert.ok(g.rules.includes("R3"));
  assert.strictEqual(g.conf, "high");
});

test("R4: 접미 제거 키 충돌은 low(사람 판단)", () => {
  const g = groupOf("load-a");
  assert.deepStrictEqual(slugsOf(g), ["load-a", "load-b"]);
  assert.deepStrictEqual(g.rules, ["R4"]);
  assert.strictEqual(g.conf, "low");
});

test("R5: 정의문 유사 + 카테고리 교집합 + 제목 유사면 medium, sim은 0.55 이상", () => {
  const g = groupOf("zpd-a");
  assert.deepStrictEqual(slugsOf(g), ["zpd-a", "zpd-b"]);
  assert.deepStrictEqual(g.rules, ["R5"]);
  assert.strictEqual(g.conf, "medium");
  assert.ok(g.sim >= 0.55, `sim=${g.sim}`);
});

test("반의 쌍(상향/하향)은 정의문이 거의 같아도 제외", () => {
  assert.strictEqual(groupOf("up-process"), undefined);
  assert.ok(result.excluded.some((e) => e.reason === "antonym"));
  assert.ok(antonymPair({ title_ko: "정변환", title_en: "" }, { title_ko: "역변환", title_en: "" }));
  assert.ok(antonymPair({ title_ko: "", title_en: "FIFO Queue" }, { title_ko: "", title_en: "LIFO Queue" }));
  assert.ok(!antonymPair({ title_ko: "정보", title_en: "" }, { title_ko: "역사", title_en: "" }));
});

test("대표 선정: GA → 본문 글자수 → 역링크 → slug 사전순", () => {
  // 본문 글자수: b가 더 길다 → b가 대표
  assert.strictEqual(groupOf("learning-theory-a").keeper, "learning-theory-b");
  // GA가 있으면 본문이 짧아도 이긴다
  const ga = new Map([["learning-theory-a", 5]]);
  const r2 = findDuplicates(TERMS, { ga });
  assert.strictEqual(r2.groups.find((g) => g.members.some((m) => m.slug === "learning-theory-a")).keeper, "learning-theory-a");
  // 본문·GA 동률이면 역링크(load-b가 load-a를 참조 → load-a의 역링크 1, 그러나 load-b가 더 길다)
  // 완전 동률이면 slug 사전순
  const tie = [
    { slug: "zz", title_ko: "같은말", title_en: "same term", categories: ["x"], definition: "정의", related: [], aliases: [] },
    { slug: "aa", title_ko: "같은말", title_en: "same term", categories: ["x"], definition: "정의", related: [], aliases: [] },
  ];
  assert.strictEqual(findDuplicates(tie).groups[0].keeper, "aa");
  // 역링크가 다르면 역링크 많은 쪽
  const inb = [...tie, { slug: "ref", title_ko: "참조", title_en: "ref", categories: ["y"], definition: "다른 내용", related: ["zz"], aliases: [] }];
  assert.strictEqual(findDuplicates(inb).groups[0].keeper, "zz");
});

test("그룹 크기 4 초과는 쪼개지 않고 needsHuman 표시", () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ slug: `m${i}`, title_ko: "동일제목", title_en: `t${i}x`,
    categories: ["x"], definition: `정의 ${i}`, related: [], aliases: [] }));
  const g = findDuplicates(many).groups;
  assert.strictEqual(g.length, 1);
  assert.strictEqual(g[0].members.length, 5);
  assert.strictEqual(g[0].needsHuman, true);
});
