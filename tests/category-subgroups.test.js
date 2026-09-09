// tests/category-subgroups.test.js
// 카테고리 페이지의 "평면 링크 385개" 도어웨이 패턴을 하위분류 섹션으로 나누는
// 로직. 3개 미만인 표류 하위분류는 "기타"로 접어야 목록이 깨끗해진다.
const assert = require("assert");
const { buildSubcategorySections, FOLD_THRESHOLD, OTHER_LABEL } =
  require("../scripts/category-subgroups.js");

const mk = (slug, ko, sub) => ({ slug, title_ko: ko, title_en: slug, subcategory: sub });

// 정상: subOrder 순서대로 섹션이 나오고, 섹션 내부는 한글 표제어 순
{
  const terms = [
    mk("b", "나", "A분류"), mk("a", "가", "A분류"), mk("c", "다", "A분류"),
    mk("x", "엑스", "B분류"), mk("y", "와이", "B분류"), mk("z", "제트", "B분류"),
  ];
  const sections = buildSubcategorySections(terms, ["A분류", "B분류"]);
  assert.strictEqual(sections.length, 2);
  assert.strictEqual(sections[0].name, "A분류");
  assert.deepStrictEqual(sections[0].terms.map((t) => t.slug), ["a", "b", "c"]);
  assert.strictEqual(sections[1].name, "B분류");
}

// 경계: FOLD_THRESHOLD(3) 미만인 하위분류는 "기타"로 접히고, 여러 소규모
// 하위분류가 있으면 전부 하나의 기타 섹션에 합쳐진다
{
  const terms = [
    mk("a", "가", "큰분류"), mk("b", "나", "큰분류"), mk("c", "다", "큰분류"),
    mk("d", "라", "작은분류1"),
    mk("e", "마", "작은분류2"), mk("f", "바", "작은분류2"),
  ];
  const sections = buildSubcategorySections(terms, ["큰분류", "작은분류1", "작은분류2"]);
  assert.strictEqual(sections.length, 2, "큰분류 + 기타(합쳐진 것) = 2개");
  assert.strictEqual(sections[0].name, "큰분류");
  const other = sections.find((s) => s.name === OTHER_LABEL);
  assert.ok(other, "기타 섹션이 있어야 함");
  assert.strictEqual(other.terms.length, 3);
  assert.strictEqual(sections[sections.length - 1].name, OTHER_LABEL, "기타는 항상 맨 뒤");
}

// 경계: subOrder에 없는 subcategory 값(방어적 케이스)도 기타로 들어간다
{
  const terms = [mk("a", "가", "목록에없는값"), mk("b", "나", "실분류"), mk("c", "다", "실분류"), mk("d", "라", "실분류")];
  const sections = buildSubcategorySections(terms, ["실분류"]);
  const other = sections.find((s) => s.name === OTHER_LABEL);
  assert.ok(other);
  assert.strictEqual(other.terms[0].slug, "a");
}

// 실패: 빈 입력은 빈 배열
{
  assert.deepStrictEqual(buildSubcategorySections([], ["A"]), []);
}

// FOLD_THRESHOLD 값 자체를 export해 회귀 시 상수 값 변경을 눈치채게 한다
assert.strictEqual(FOLD_THRESHOLD, 3);

console.log("category-subgroups: all tests passed");
