// 분야 페이지의 순수 함수: 가나다 머리글 묶기, 인기 목록 선택·순위, 하위 주제 순서,
// 한 줄 설명 줄이기.
const assert = require("assert");
const { extract } = require("./helpers/extract-fn.js");
const { shortenText } = require("../scripts/short-text.js");
const { rankPopular } = require("../scripts/generate-popular-terms.js");

const {
  initialOf, groupByInitial, pickPopular, sortSubNames, subLabel,
} = extract("assets/site.js", {
  consts: ["INITIAL_CONSONANTS", "INITIAL_FOLD", "INITIAL_ORDER", "FIELD_OTHER_KEY"],
  fns: ["initialOf", "initialRank", "groupByInitial", "pickPopular", "sortSubNames", "subLabel"],
});

// 초성: 한글 음절, 쌍자음 합침, 영문·숫자·기타
{
  assert.strictEqual(initialOf("가설"), "ㄱ");
  assert.strictEqual(initialOf("까치"), "ㄱ");
  assert.strictEqual(initialOf("뜻"), "ㄷ");
  assert.strictEqual(initialOf("힘"), "ㅎ");
  assert.strictEqual(initialOf("ANOVA"), "A");
  assert.strictEqual(initialOf("t검정"), "T");
  assert.strictEqual(initialOf("2차 자료"), "0-9");
  assert.strictEqual(initialOf("(가)"), "#");
  assert.strictEqual(initialOf(""), "#");
  assert.strictEqual(initialOf(undefined), "#");
}

// 묶기: 가나다 → 영문 → 숫자 → 기타 순, 묶음 안은 가나다순
{
  const mk = (t) => ({ title_ko: t });
  const g = groupByInitial([mk("2차"), mk("나무"), mk("ANOVA"), mk("가지"), mk("가가"), mk("까치")]);
  assert.deepStrictEqual(Array.from(g, (x) => x.initial), ["ㄱ", "ㄴ", "A", "0-9"]);
  assert.deepStrictEqual(Array.from(g[0].terms, (t) => t.title_ko), ["가가", "가지", "까치"]);
}

// 인기 목록: 순서 유지, 분야에 없는 슬러그 건너뜀, 개수 제한
{
  const by = { a: { slug: "a" }, b: { slug: "b" }, c: { slug: "c" } };
  assert.deepStrictEqual(Array.from(pickPopular(["c", "x", "a", "b"], by, 2), (t) => t.slug), ["c", "a"]);
  assert.strictEqual(pickPopular(undefined, by).length, 0);
}

// 하위 주제: 지정 순서 → 나머지 → 기타 맨 끝, 표시 이름만 바뀜
{
  const names = ["관련 용어", "다", "B", "가"];
  assert.deepStrictEqual(Array.from(sortSubNames(names, ["B"])), ["B", "가", "다", "관련 용어"]);
  assert.strictEqual(subLabel("관련 용어"), "기타");
  assert.strictEqual(subLabel("가"), "가");
}

// 인기 순위: 조회수 → df → 제목, 용어는 속한 모든 분야에 센다
{
  const terms = [
    { slug: "a", title_ko: "가", categories: ["x", "y"] },
    { slug: "b", title_ko: "나", categories: ["x"] },
    { slug: "c", title_ko: "다", categories: ["x"] },
    { slug: "d", title_ko: "라", categories: ["x"] },
  ];
  const r = rankPopular(terms, { c: 5 }, { b: 9, a: 9 }, 3);
  assert.deepStrictEqual(r.x, ["c", "a", "b"]); // c(조회) → a,b(df 동률, 제목순)
  assert.deepStrictEqual(r.y, ["a"]);
  // GA 없이 df만
  assert.deepStrictEqual(rankPopular(terms, {}, { d: 3, b: 1 }, 2).x, ["d", "b"]);
}

// 한 줄 설명: 짧으면 그대로, 길면 단어 경계에서 ≤70자 + …
{
  assert.strictEqual(shortenText("짧은 설명입니다."), "짧은 설명입니다.");
  assert.strictEqual(shortenText(""), "");
  assert.strictEqual(shortenText(null), "");
  const long = Array.from({ length: 30 }, (_, i) => `단어${i}`).join(" ");
  const s = shortenText(long);
  assert.ok(s.length <= 70, `길이 ${s.length}`);
  assert.ok(s.endsWith("…"));
  assert.ok(long.startsWith(s.slice(0, -1)), "원문의 앞부분이어야 함");
  assert.ok(/단어\d+…$/.test(s), "단어 중간에서 끊지 않음");
  // 공백이 없는 긴 문자열은 글자 단위로 자른다
  assert.strictEqual(shortenText("가".repeat(100)).length, 70);
}

console.log("field-page tests passed");

// 허브 "많이 찾는 분야": 인기 용어 조회수 합 순위, ga4 없으면 df 합, 동률은 코드순
{
  const { rankFields } = require("../scripts/generate-popular-terms.js");
  const popular = { a: ["a1", "a2"], b: ["b1"], c: ["c1"], d: [] };
  assert.deepStrictEqual(rankFields(popular, { a1: 5, a2: 1, b1: 7, c1: 7 }, {}, 3), ["b", "c", "a"]);
  assert.deepStrictEqual(rankFields(popular, {}, { a1: 1, b1: 9, c1: 2 }, 2), ["b", "c"]);
  assert.deepStrictEqual(rankFields(popular, {}, {}, 8), ["a", "b", "c", "d"]);
}
