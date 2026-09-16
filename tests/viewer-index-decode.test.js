// viewer-index.json은 용량을 줄이려고 배열-of-배열 + 카테고리 인덱스로
// 저장돼 있다. 디코더가 깨지면 "용어 찾기"가 조용히 0건이 되거나 카테고리
// 필터가 빈 목록이 되므로, 생성 스크립트와 짝이 맞는지 여기서 고정한다.
const assert = require("assert");
const { decodeViewerIndex, defBucket, buildExactIndex } = require("../assets/viewer.js");
const gen = require("../scripts/generate-viewer-index.js");

// 정상: 행이 기존 term 객체 모양으로 복원되고 카테고리 코드가 되살아난다
{
  const terms = decodeViewerIndex({
    v: 1,
    categories: ["stat", "psych"],
    terms: [["p-value", "유의확률", "P-Value", [0]], ["anova", "분산분석", "ANOVA", [0, 1]]],
  });
  assert.strictEqual(terms.length, 2);
  assert.deepStrictEqual(terms[0], {
    slug: "p-value",
    title_ko: "유의확률",
    title_en: "P-Value",
    categories: ["stat"],
  });
  assert.deepStrictEqual(terms[1].categories, ["stat", "psych"]);

  // 복원된 객체는 그대로 기존 매칭 인덱스에 들어가야 한다
  const map = buildExactIndex(terms);
  assert.ok(map.has("유의확률"));
  assert.ok(map.has("pvalue"));
}

// 경계: 빈 제목·빈 카테고리·빈 데이터에서도 터지지 않는다
{
  const terms = decodeViewerIndex({ v: 1, categories: [], terms: [["x", "", "", []]] });
  assert.deepStrictEqual(terms[0], { slug: "x", title_ko: "", title_en: "", categories: [] });
  assert.deepStrictEqual(decodeViewerIndex({}), []);
}

// definition 청크 번호는 생성 스크립트와 뷰어가 반드시 같아야 한다 —
// 어긋나면 카드 정의가 전부 빈칸이 된다(404는 조용히 무시되므로)
{
  for (const slug of ["p-value", "anova", "유의확률", "a", "zzz-long-slug-example"]) {
    assert.strictEqual(defBucket(slug), gen.defBucket(slug), `defBucket 불일치: ${slug}`);
  }
  assert.ok(defBucket("p-value") < gen.DEF_BUCKETS);
}

console.log("viewer-index decode: all tests passed");
