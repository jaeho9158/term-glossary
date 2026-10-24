// 분야 병합 적용기(scripts/prune/apply-category-merge.js)의 순수 함수 검사.
// 실제 assets/category-data.js·OA 수집기 원문을 메모리에서 고쳐 보고, 결과가 서로 맞는지 본다(파일은 쓰지 않는다).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const M = require("../scripts/prune/apply-category-merge.js");
const { exportApproved } = require("../scripts/prune/export-approved.js");

const REPO = path.join(__dirname, "..");
const catSrc = fs.readFileSync(path.join(REPO, "assets", "category-data.js"), "utf8");
const cat = M.evalCategoryData(catSrc);

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
    { keeper: "geo", absorb: ["cartography", "nope"] },
    { keeper: "cartography", absorb: ["landscape"] },
    { keeper: "arch", absorb: ["landscape"] },
  ] }, cat);
  assert.ok(e.some((x) => x.includes("nope")));
  assert.ok(e.some((x) => x.includes("다른 묶음의 대표")));
  assert.ok(e.some((x) => x.includes("두 대표")));
});

test("mergeTerms: A를 K로 바꾸고 중복은 하나로, 순서는 유지", () => {
  const { terms, changed } = M.mergeTerms([
    { slug: "a", categories: ["cartography", "earth"] },
    { slug: "b", categories: ["geo", "cartography"] },
    { slug: "c", categories: ["stat"] },
  ], new Map([["cartography", "geo"]]));
  assert.deepStrictEqual(terms.map((t) => t.categories), [["geo", "earth"], ["geo"], ["stat"]]);
  assert.deepStrictEqual(changed, ["a", "b"]);
});

test("editCategoryData: 실제 파일에서 흡수·이름 바꾸기·별칭·하위 주제가 서로 맞게 바뀐다", () => {
  const groups = [
    { keeper: "geo", label: null, absorb: ["cartography"] },
    { keeper: "earth", label: null, absorb: ["astro", "meteor", "ocean"] },
    { keeper: "geronto", label: "사회복지학", absorb: ["socwelfare"] },
    { keeper: "cs", label: "컴퓨터학", absorb: ["cyber"] },
  ];
  const out = M.editCategoryData(catSrc, groups, cat);
  const { errors, data } = M.checkCategoryData(out);
  assert.deepStrictEqual(errors, []);
  for (const a of ["cartography", "astro", "meteor", "ocean", "socwelfare", "cyber"]) {
    assert.strictEqual(data.CATEGORY_LABELS[a], undefined);
    assert.ok(!data.CATEGORY_ORDER.includes(a));
    assert.strictEqual(data.CATEGORY_INTRO[a], undefined);
  }
  assert.deepStrictEqual(data.CATEGORY_ALIASES.cartography, ["geo"]);
  assert.deepStrictEqual(data.CATEGORY_ALIASES.ocean, ["earth"]);
  assert.strictEqual(data.CATEGORY_LABELS.geronto, "사회복지학");
  assert.strictEqual(data.CATEGORY_LABELS.cs, "컴퓨터학");
  // 기존 별칭은 그대로
  assert.deepStrictEqual(data.CATEGORY_ALIASES.physchem, cat.CATEGORY_ALIASES.physchem);
  // 하위 주제: 대표 목록 + 흡수 목록
  assert.deepStrictEqual(data.SUB_CATEGORY_ORDER.geo, [...cat.SUB_CATEGORY_ORDER.geo, ...cat.SUB_CATEGORY_ORDER.cartography.filter((s) => !cat.SUB_CATEGORY_ORDER.geo.includes(s))]);
  // 홈 추천 분야에서 흡수 분야가 빠지고 줄 구조는 그대로
  assert.ok(!data.HOME_FEATURED_CATEGORIES.some((c) => ["astro", "cyber"].includes(c)));
  assert.strictEqual(out.split("\n").length, catSrc.split("\n").length - 6 * 4 + 6); // 표 4곳에서 한 줄씩 빠지고 별칭 6줄이 는다
});

test("editCategoryData: 기존 별칭이 흡수 분야를 가리키면 대표로 돌린다", () => {
  const out = M.editCategoryData(catSrc, [{ keeper: "landscape", label: null, absorb: ["arch"] }], cat);
  const { errors, data } = M.checkCategoryData(out);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(data.CATEGORY_ALIASES.urban, ["landscape"]);
  assert.deepStrictEqual(data.CATEGORY_ALIASES.arch, ["landscape"]);
});

test("dropInlineEntries: 한 줄에 여러 항목인 분야 매핑에서 흡수 분야만 뺀다", () => {
  const src = fs.readFileSync(path.join(REPO, "scripts", "oa", "collect-openalex.js"), "utf8");
  const { src: out, removed } = M.dropInlineEntries(src, "CODE_FIELDS", ["cartography", "astro", "cyber"]);
  assert.deepStrictEqual(removed.sort(), ["astro", "cartography", "cyber"]);
  assert.ok(!/\bcartography: \[/.test(out) && !/\bastro: \[/.test(out) && !/\bcyber: \[/.test(out));
  assert.ok(/\bgeo: \[/.test(out) && /\bearth: \[/.test(out) && /\bcs: \[/.test(out));
  assert.strictEqual(out.length < src.length, true);
});

test("editGroupsJson: 진단 파이프라인 묶음에서 흡수 분야를 뺀다", () => {
  const raw = fs.readFileSync(path.join(REPO, "scripts", "diagrams", "pipeline", "groups.json"), "utf8");
  const out = JSON.parse(M.editGroupsJson(raw, new Map([["cartography", "geo"]])));
  assert.ok(!Object.values(out).flat().includes("cartography"));
  assert.strictEqual(Object.values(out).flat().length, Object.values(JSON.parse(raw)).flat().length - 1);
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
