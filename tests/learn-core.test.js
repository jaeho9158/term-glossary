const assert = require("assert");
const test = require("node:test");
const L = require("../assets/learn-core.js");
const { buildLearnData, deriveLevel } = require("../scripts/generate-learn-data.js");

const T = (slug, level, extra) => Object.assign({ slug, level, prerequisites: [] }, extra);

test("parseFieldHash: 맨 토큰만 인정", () => {
  const valid = { stat: 1, cs: 1 };
  assert.strictEqual(L.parseFieldHash("#stat", valid), "stat");
  assert.strictEqual(L.parseFieldHash("#nope", valid), "");
  assert.strictEqual(L.parseFieldHash("#all", valid, ["all"]), "all");
  assert.strictEqual(L.parseFieldHash("", valid), "");
});

test("parseSlugsParam: 중복·형식·상한·검증", () => {
  assert.deepStrictEqual(L.parseSlugsParam("a,b,a, ,c d,e"), ["a", "b", "e"]);
  assert.deepStrictEqual(L.parseSlugsParam("a,b,c", { a: 1, c: 1 }), ["a", "c"]);
  const many = Array.from({ length: 80 }, (_, i) => "s" + i).join(",");
  assert.strictEqual(L.parseSlugsParam(many, null, 50).length, 50);
});

test("topoOrder: 선수 먼저, 나머지는 인기순, 순환 안전", () => {
  const t = [T("c", 1, { pop: 1, prerequisites: ["a"] }), T("a", 1, { pop: 5 }), T("b", 1, { pop: 2 })];
  assert.deepStrictEqual(L.topoOrder(t).map(x => x.slug), ["a", "c", "b"]);
  const cyc = [T("x", 1, { prerequisites: ["y"] }), T("y", 1, { prerequisites: ["x"] })];
  assert.strictEqual(L.topoOrder(cyc).length, 2);
});

test("selectRoadmap: 단계당 상한·전체 상한·인기 우선", () => {
  const terms = [];
  for (let i = 0; i < 40; i++) terms.push(T("l1-" + i, 1, i < 3 ? { pop: 3 - i } : {}));
  for (let i = 0; i < 40; i++) terms.push(T("l2-" + i, 2));
  for (let i = 0; i < 40; i++) terms.push(T("l3-" + i, 3));
  const st = L.selectRoadmap(terms);
  assert.deepStrictEqual(st.map(s => s.level), [1, 2, 3]);
  assert.ok(st.every(s => s.terms.length <= 17));
  assert.ok(st.reduce((n, s) => n + s.terms.length, 0) <= 50);
  assert.deepStrictEqual(st[0].terms.slice(0, 3).map(x => x.slug), ["l1-2", "l1-1", "l1-0"]);
});

test("selectRoadmap: 비는 단계는 생략, 작은 분야도 그대로", () => {
  const st = L.selectRoadmap([T("a", 2), T("b", 2)]);
  assert.strictEqual(st.length, 1);
  assert.strictEqual(st[0].terms.length, 2);
});

test("progress / nextTerm / firstOpenLevel", () => {
  const st = L.selectRoadmap([T("a", 1), T("b", 1), T("c", 2)]);
  const done = new Set(["a", "b"]);
  assert.deepStrictEqual(L.progressOf(st[0].terms, done), { done: 2, total: 2, pct: 100 });
  assert.strictEqual(L.nextTerm(st, done).term.slug, "c");
  assert.strictEqual(L.firstOpenLevel(st, done), 2);
  assert.strictEqual(L.nextTerm(st, new Set(["a", "b", "c"])), null);
  assert.strictEqual(L.firstOpenLevel(st, new Set(["a", "b", "c"])), 0);
});

test("generator: deriveLevel 은 difficulty 1~3, 아니면 2", () => {
  assert.strictEqual(deriveLevel({ difficulty: 1 }), 1);
  assert.strictEqual(deriveLevel({ difficulty: 3 }), 3);
  assert.strictEqual(deriveLevel({ difficulty: 9 }), 2);
  assert.strictEqual(deriveLevel({}), 2);
});

test("generator: archive 제외, 분야별 포함, related/prerequisites는 core만", () => {
  const terms = [
    { slug: "a", title_ko: "가", categories: ["stat", "cs"], definition: "정의 가", related: ["b", "arch1"], prerequisites: ["arch1"], difficulty: 1, subcategory: "s" },
    { slug: "b", title_ko: "나", categories: ["stat"], definition: "정의 나", related: ["a"], prerequisites: ["a"], difficulty: 3 },
    { slug: "arch1", title_ko: "보관", categories: ["stat"], definition: "x" },
    { slug: "z", title_ko: "미등록", categories: ["unknown"], definition: "x" },
  ];
  const r = buildLearnData({
    terms, archive: ["arch1"], popular: { stat: ["b"] },
    labels: { stat: "통계", cs: "컴퓨터" }, groups: [{ label: "G", codes: ["stat", "cs"] }],
  });
  assert.deepStrictEqual(r.byCat.stat.map(t => t.slug), ["a", "b"]);
  assert.deepStrictEqual(r.byCat.cs.map(t => t.slug), ["a"]);
  assert.deepStrictEqual(r.byCat.stat[0].related, ["b"]);
  assert.deepStrictEqual(r.byCat.stat[0].prerequisites, []);
  assert.deepStrictEqual(r.byCat.stat[1].prerequisites, ["a"]);
  assert.strictEqual(r.byCat.stat[1].pop, 1);
  assert.strictEqual(r.byCat.stat[0].pop, undefined);
  assert.deepStrictEqual(r.index.stat, { label: "통계", group: "G", core: 2 });
  assert.strictEqual(r.slugIndex.a, "stat");
  assert.strictEqual(r.slugIndex.z, undefined);
});

test("buildLearnData: 분야별 levelOverrides 가 difficulty 보다 우선한다", () => {
  const { buildLearnData } = require("../scripts/generate-learn-data.js");
  const terms = [
    { slug: "a", title_ko: "가", categories: ["stat", "method"], difficulty: 1, definition: "정의" },
    { slug: "b", title_ko: "나", categories: ["stat"], difficulty: 3, definition: "정의" },
  ];
  const r = buildLearnData({ terms, archive: [], popular: {}, labels: { stat: "통계", method: "연구방법론" }, groups: [], levelOverrides: { stat: { a: 3 } } });
  const lv = (c, s) => r.byCat[c].find((x) => x.slug === s).level;
  assert.strictEqual(lv("stat", "a"), 3);
  assert.strictEqual(lv("method", "a"), 1);
  assert.strictEqual(lv("stat", "b"), 3);
});
