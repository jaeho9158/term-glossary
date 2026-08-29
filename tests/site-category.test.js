// resolveCategoryParam은 URL 쿼리(외부 입력)를 직접 해석한다. 별칭 매핑이
// 깨지면 검색엔진에 색인된 옛 카테고리 링크가 전부 빈 페이지가 된다.
const assert = require("assert");
const { extract } = require("./helpers/extract-fn.js");

const globals = {
  CATEGORY_LABELS: { stat: "통계", phys: "물리", chem: "화학" },
  CATEGORY_ALIASES: { physchem: ["phys", "chem"], oldstat: ["stat"] },
};

const { resolveCategoryParam } = extract("assets/site.js", {
  fns: ["resolveCategoryParam"],
  globals,
});

// 정상: 현행 카테고리 코드는 그대로 1개 배열로
{
  assert.deepStrictEqual(Array.from(resolveCategoryParam("stat")), ["stat"]);
}

// 정상: 1:N 분할 별칭은 양쪽 모두 반환
{
  assert.deepStrictEqual(Array.from(resolveCategoryParam("physchem")), ["phys", "chem"]);
  assert.deepStrictEqual(Array.from(resolveCategoryParam("oldstat")), ["stat"]);
}

// 경계: 반환 배열은 원본 별칭 배열의 복사본이어야 함 (호출부 변형이 원본 오염 금지)
{
  const out = resolveCategoryParam("physchem");
  out.push("hack");
  assert.deepStrictEqual(Array.from(globals.CATEGORY_ALIASES.physchem), ["phys", "chem"]);
}

// 실패: 미지의 코드·빈 값은 빈 배열 (throw 금지)
{
  assert.deepStrictEqual(Array.from(resolveCategoryParam("nope")), []);
  assert.deepStrictEqual(Array.from(resolveCategoryParam("")), []);
  assert.deepStrictEqual(Array.from(resolveCategoryParam(null)), []);
}

console.log("site-category: all tests passed");
