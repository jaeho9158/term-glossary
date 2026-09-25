// 포함 관계 정렬: '응력'이 '전단응력'보다 위에 뜨던 사례(계획 3단계 4번).
// 짧은 용어가 자주 나온다는 이유만으로 대표 용어 위에 오면 패널이
// "이 논문의 주제어"를 거꾸로 보여 준다.
const assert = require("assert");
const { orderNestedMatches, sortMatches, matchTerms } = require("../assets/viewer.js");

const m = (slug, title_ko, count, extra) =>
  Object.assign({ slug, title_ko, title_en: "", categories: ["mech"], count, score: 0 }, extra || {});

// 기본: 짧은 용어는 긴 용어 바로 아래로 내려가고 nestedUnder가 붙는다
{
  const ordered = orderNestedMatches([m("stress", "응력", 9), m("shear-stress", "전단응력", 2), m("strain", "변형률", 3)]);
  assert.deepStrictEqual(
    ordered.map((x) => x.slug),
    ["shear-stress", "stress", "strain"]
  );
  assert.strictEqual(ordered[1].nestedUnder, "shear-stress");
  assert.deepStrictEqual(ordered[0].basics, ["stress"]);
  assert.strictEqual(ordered[2].nestedUnder, undefined);
}

// 포함 관계가 없으면 순서를 건드리지 않는다
{
  const input = [m("a", "표본", 5), m("b", "모집단", 2)];
  const ordered = orderNestedMatches(input);
  assert.deepStrictEqual(ordered.map((x) => x.slug), ["a", "b"]);
  assert.ok(ordered.every((x) => !x.nestedUnder));
}

// 3단 중첩: 가장 긴 용어 하나가 대표가 되고 나머지는 모두 그 아래로 모인다
// (A ⊃ B ⊃ C에서 B까지 대표로 세우면 접기 단계가 두 겹이 된다)
{
  const ordered = orderNestedMatches([
    m("stress", "응력", 9),
    m("shear-stress", "전단응력", 4),
    m("max-shear-stress", "최대전단응력", 1),
  ]);
  assert.deepStrictEqual(ordered.map((x) => x.slug), ["max-shear-stress", "shear-stress", "stress"]);
  assert.deepStrictEqual(ordered[0].basics, ["shear-stress", "stress"]);
}

// 같은 표제어가 두 항목에 있어도(동음이의) 자기 자신을 자기 아래에 넣지 않는다
{
  const ordered = orderNestedMatches([m("x1", "응력", 3), m("x2", "응력", 2)]);
  assert.deepStrictEqual(ordered.map((o) => o.slug), ["x1", "x2"]);
  assert.ok(ordered.every((o) => !o.nestedUnder));
}

// sortMatches를 거친 결과에도 포함 관계 정렬이 적용돼야 한다
// (채점기 scripts/viewer-eval.js가 matchTermsWithIndex 결과를 그대로 본다)
{
  const terms = [
    { slug: "stress", title_ko: "응력", title_en: "Stress", categories: ["mech"] },
    { slug: "shear-stress", title_ko: "전단응력", title_en: "Shear Stress", categories: ["mech"] },
  ];
  const text = "응력이 커지면 응력 집중이 생긴다. 응력 해석 결과 전단응력은 중립축에서 최대다.";
  const result = matchTerms(text, terms);
  assert.strictEqual(result[0].slug, "shear-stress", "긴 용어가 대표로 위에 와야 한다");
  assert.strictEqual(result[1].slug, "stress");
  // 짧은 용어의 count는 단독 등장만 센다 — '전단응력' 안의 '응력'은 세지 않는다
  assert.strictEqual(result[1].count, 3);
}

// 일반어 등급 2는 정렬에서 뒤로 밀린다(잡히긴 한다)
{
  const map = new Map([
    ["common", { slug: "common", title_ko: "밀도", count: 9, score: 0, common: 2, occurrences: [], firstStart: 0, firstLength: 2 }],
    ["rare", { slug: "rare", title_ko: "중립축", count: 1, score: 0, common: 0, occurrences: [], firstStart: 0, firstLength: 3 }],
  ]);
  const sorted = sortMatches(map);
  assert.deepStrictEqual(sorted.map((s) => s.slug), ["rare", "common"]);
}

// 짧은 용어를 품는 긴 용어가 여럿이면, 패널에서 가장 아래에 놓이는 것 밑에
// 붙인다. 가장 긴 것(국소장전위) 밑에 붙이던 때는 그보다 아래 순위인
// 활동전위보다 '전위'가 위에 떠 채점기 정렬 오류가 났다(말뭉치 nbome).
{
  const ordered = orderNestedMatches([m("lfp", "국소장전위", 5), m("dislocation", "전위", 3), m("ap", "활동전위", 1)]);
  assert.deepStrictEqual(ordered.map((x) => x.slug), ["lfp", "ap", "dislocation"]);
  assert.strictEqual(ordered[2].nestedUnder, "ap");
}

// 품는 용어 자신이 다른 용어 밑에 접히면, 그 접힌 자리(대표)를 기준으로 본다.
// C⊂B⊂A, C⊂D 이고 순서가 A, D, B, C면 B는 A 밑으로 올라가므로 C는 D 밑.
{
  const ordered = orderNestedMatches([
    m("a", "최대전단응력", 5),
    m("d", "잔류응력", 4),
    m("b", "전단응력", 3),
    m("c", "응력", 2),
  ]);
  assert.deepStrictEqual(ordered.map((x) => x.slug), ["a", "b", "d", "c"]);
  assert.strictEqual(ordered.find((x) => x.slug === "c").nestedUnder, "d");
}

console.log("orderNestedMatches: all tests passed");

// ── 카드 묶기 ─────────────────────────────────────────────────────────
const { buildCardUnits, termCardHTML } = require("../assets/viewer.js");

// 대표 카드 하나에 기초 용어가 접혀 들어간다
{
  const units = buildCardUnits([
    { slug: "shear-stress", title_ko: "전단응력", basics: ["stress"] },
    { slug: "stress", title_ko: "응력", nestedUnder: "shear-stress" },
    { slug: "strain", title_ko: "변형률" },
  ]);
  assert.deepStrictEqual(units.map((u) => u.match.slug), ["shear-stress", "strain"]);
  assert.deepStrictEqual(units[0].basics.map((b) => b.slug), ["stress"]);
  const html = termCardHTML(units[0].match, units[0].basics);
  assert.ok(html.includes("기초 용어 1개"), "기초 용어 접기 요약이 있어야 한다");
  assert.ok(html.includes('data-slug="stress"'), "기초 용어 카드도 같이 렌더된다");
}

// 필터로 대표가 빠지면 기초 용어는 단독 카드로 남는다(사라지면 안 된다)
{
  const units = buildCardUnits([{ slug: "stress", title_ko: "응력", nestedUnder: "shear-stress" }]);
  assert.deepStrictEqual(units.map((u) => u.match.slug), ["stress"]);
  assert.deepStrictEqual(units[0].basics, []);
}

console.log("buildCardUnits: all tests passed");
