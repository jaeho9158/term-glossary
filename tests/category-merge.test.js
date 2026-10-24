// 분야 병합 적용기(scripts/prune/apply-category-merge.js)의 순수 함수 검사.
// 실제 assets/category-data.js·OA 수집기 원문을 메모리에서 고쳐 보고, 결과가 서로 맞는지 본다(파일은 쓰지 않는다).
// 분야를 실제로 합친 뒤에도 돌아가야 하므로 분야 코드는 그때 있는 것에서 고른다.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const M = require("../scripts/prune/apply-category-merge.js");
const { exportApproved } = require("../scripts/prune/export-approved.js");

const REPO = path.join(__dirname, "..");
const catSrc = fs.readFileSync(path.join(REPO, "assets", "category-data.js"), "utf8");
const cat = M.evalCategoryData(catSrc);

// 코드가 넷 이상인 대분류에서 [대표, 흡수] 쌍을 두 개 고른다.
const big = cat.CATEGORY_GROUPS.filter((g) => g.codes.length >= 4);
const [K1, A1, K2, A2] = big[0].codes;
const [K3, A3] = big[1].codes;

const doc = (id, decision, keeper, absorb, title, extra = {}) => ({
  id, kind: "merge", decision, title,
  items: [
    { role: "keeper", slug: `../category/${keeper}` },
    ...absorb.map((a) => ({ role: "absorb", slug: `../category/${a.code || a}`, redirect: `category/${keeper}`, decision: a.decision || "default" })),
  ],
  ...extra,
});

test("planFromDocs: 승인된 분야 병합만, 제외 항목 빼고, 제목에서 새 이름", () => {
  const plan = M.planFromDocs([
    doc("catmerge-N2", "approve", "geo", ["cartography"], "[분야 병합 · 중분류 일치] 지리학 ← 지도학"),
    doc("catmerge-N7", "approve", "geronto", ["socwelfare"], "[분야 병합 · 선택] 사회복지학 ← 사회복지학"),
    doc("catmerge-N8", "approve", "biz", ["labor", { code: "insur", decision: "reject" }], "[분야 병합 · 중분류 일치] 경영학 ← 노사관계학, 보험·계리학"),
    doc("catmerge-N9", "approve", "biz", ["finance"], "[분야 병합 · 선택] 경영학 ← 재무·금융학"),
    doc("catmerge-N12", "none", "childdev", ["consumer"], "[분야 병합 · 선택] 생활과학 ← 소비자학"),
    { id: "merge:x", kind: "merge", decision: "approve", items: [{ role: "keeper", slug: "x" }, { role: "absorb", slug: "y", redirect: "x" }] },
  ]);
  const by = Object.fromEntries(plan.groups.map((g) => [g.keeper, g]));
  assert.deepStrictEqual(Object.keys(by).sort(), ["biz", "geo", "geronto"]);
  assert.deepStrictEqual(by.biz.absorb, ["labor", "finance"]);
  assert.strictEqual(by.geronto.label, "사회복지학");
  assert.strictEqual(by.geo.label, "지리학");
});

test("planFromDocs: 같은 대표 분야에 이름이 엇갈리면 멈춘다", () => {
  assert.throws(() => M.planFromDocs([
    doc("a", "approve", "biz", ["labor"], "[분야 병합] 경영학 ← 노사관계학"),
    doc("b", "approve", "biz", ["finance"], "[분야 병합] 경영·금융학 ← 재무·금융학"),
  ]), /이름이 둘/);
});

test("validatePlan: 없는 코드·연쇄 병합·이중 흡수를 잡는다", () => {
  const e = M.validatePlan({ groups: [
    { keeper: K1, absorb: [A1, "no-such-code"] },
    { keeper: A1, absorb: [A2] },
    { keeper: K2, absorb: [A2] },
  ] }, cat);
  assert.ok(e.some((x) => x.includes("no-such-code")));
  assert.ok(e.some((x) => x.includes("다른 묶음의 대표")));
  assert.ok(e.some((x) => x.includes("두 대표")));
  assert.deepStrictEqual(M.validatePlan({ groups: [{ keeper: K1, absorb: [A1] }] }, cat), []);
});

test("mergeTerms: A를 K로 바꾸고 중복은 하나로, 순서는 유지", () => {
  const { terms, changed } = M.mergeTerms([
    { slug: "a", categories: ["aa", "x"] },
    { slug: "b", categories: ["kk", "aa"] },
    { slug: "c", categories: ["x"] },
  ], new Map([["aa", "kk"]]));
  assert.deepStrictEqual(terms.map((t) => t.categories), [["kk", "x"], ["kk"], ["x"]]);
  assert.deepStrictEqual(changed, ["a", "b"]);
});

test("editCategoryData: 실제 파일에서 흡수·이름 바꾸기·별칭·하위 주제가 서로 맞게 바뀐다", () => {
  const groups = [
    { keeper: K1, label: null, absorb: [A1] },
    { keeper: K2, label: null, absorb: [A2] },
    { keeper: K3, label: "새 이름 분야", absorb: [A3] },
  ];
  const out = M.editCategoryData(catSrc, groups, cat);
  const { errors, data } = M.checkCategoryData(out);
  assert.deepStrictEqual(errors, []);
  for (const a of [A1, A2, A3]) {
    assert.strictEqual(data.CATEGORY_LABELS[a], undefined);
    assert.ok(!data.CATEGORY_ORDER.includes(a));
    assert.strictEqual(data.CATEGORY_INTRO[a], undefined);
    assert.strictEqual(data.CATEGORY_DESCRIPTIONS[a], undefined);
  }
  assert.deepStrictEqual(data.CATEGORY_ALIASES[A1], [K1]);
  assert.deepStrictEqual(data.CATEGORY_ALIASES[A3], [K3]);
  assert.strictEqual(data.CATEGORY_LABELS[K3], "새 이름 분야");
  assert.strictEqual(data.CATEGORY_LABELS[K1], cat.CATEGORY_LABELS[K1]);
  // 하위 주제: 대표 목록 + 흡수 목록(중복 없이)
  const sub = cat.SUB_CATEGORY_ORDER;
  assert.deepStrictEqual(data.SUB_CATEGORY_ORDER[K1], [...sub[K1], ...sub[A1].filter((s) => !sub[K1].includes(s))]);
  // 표 4곳(라벨·설명·하위 주제·소개)에서 한 줄씩 빠지고 별칭이 흡수 수만큼 는다
  assert.strictEqual(out.split("\n").length, catSrc.split("\n").length - 3 * 4 + 3);
});

test("editCategoryData: 기존 별칭이 흡수 분야를 가리키면 대표로 돌린다", () => {
  const [old, targets] = Object.entries(cat.CATEGORY_ALIASES).find(([, v]) => v.length === 1);
  const target = targets[0];
  const group = cat.CATEGORY_GROUPS.find((g) => g.codes.includes(target));
  const keeper = group.codes.find((c) => c !== target);
  const out = M.editCategoryData(catSrc, [{ keeper, label: null, absorb: [target] }], cat);
  const { errors, data } = M.checkCategoryData(out);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(data.CATEGORY_ALIASES[old], [keeper]);
  assert.deepStrictEqual(data.CATEGORY_ALIASES[target], [keeper]);
});

test("dropInlineEntries: 한 줄에 여러 항목인 분야 매핑에서 흡수 분야만 뺀다", () => {
  const src = fs.readFileSync(path.join(REPO, "scripts", "oa", "collect-openalex.js"), "utf8");
  const has = (s, c) => new RegExp(`(^|[ \\t{])${c}: \\[`, "m").test(s);
  const codes = cat.CATEGORY_ORDER.filter((c) => has(src, c));
  const drop = [codes[1], codes[5], codes[codes.length - 1]];
  const { src: out, removed } = M.dropInlineEntries(src, "CODE_FIELDS", drop);
  assert.deepStrictEqual(removed.sort(), drop.slice().sort());
  for (const c of drop) assert.ok(!has(out, c), c);
  for (const c of codes.filter((c) => !drop.includes(c))) assert.ok(has(out, c), c);
});

test("editGroupsJson: 진단 파이프라인 묶음에서 흡수 분야를 뺀다", () => {
  const raw = fs.readFileSync(path.join(REPO, "scripts", "diagrams", "pipeline", "groups.json"), "utf8");
  const all = Object.values(JSON.parse(raw)).flat();
  const out = JSON.parse(M.editGroupsJson(raw, new Map([[all[1], all[0]]])));
  assert.ok(!Object.values(out).flat().includes(all[1]));
  assert.strictEqual(Object.values(out).flat().length, all.length - 1);
});

test("serializeLike: 원래 파일의 줄바꿈·들여쓰기·끝 개행을 따른다", () => {
  assert.strictEqual(M.serializeLike('{"a":1}', { a: 2 }), '{"a":2}');
  assert.strictEqual(M.serializeLike('[\n  1\n]\n', [2]), "[\n  2\n]\n");
  assert.strictEqual(M.serializeLike('[\r\n  1\r\n]', [2]), "[\r\n  2\r\n]");
});

test("export-approved: 분야 병합 묶음은 용어 병합으로 내보내지 않는다", () => {
  const out = exportApproved([
    doc("catmerge-N2", "approve", "geo", ["cartography"], "[분야 병합] 지리학 ← 지도학"),
    { id: "merge:x", kind: "merge", decision: "approve", items: [{ role: "keeper", slug: "x" }, { role: "absorb", slug: "y", redirect: "x", decision: "default" }] },
  ]);
  assert.deepStrictEqual(out.merge, [{ keeper: "x", absorb: ["y"] }]);
});
