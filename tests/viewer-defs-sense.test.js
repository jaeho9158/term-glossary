// 라운드 4: 뜻 키워드(sense)를 viewer-index.json 7번째 칸에서 viewer-defs 청크로
// 옮겼다. 인덱스는 매칭에 필요한 것만 남기고(≈3.1MB), 뜻 키워드는 매칭된 용어의
// 청크를 받을 때 definition과 함께 온다. 규칙 1은 그 뒤 후처리로 적용한다.
const assert = require("assert");
const { decodeDefChunk, applySenseToMatches, matchTerms } = require("../assets/viewer.js");
const { buildDefBuckets, defBucket } = require("../scripts/generate-viewer-index.js");

// 청크 항목: 문자열(정의만, 옛 형식) 또는 {d, s}(정의 + 공백 구분 뜻 키워드)
{
  const out = decodeDefChunk({ a: "정의 A", b: { d: "정의 B", s: "독성 poisoning" }, c: { s: "키워드" } });
  assert.deepStrictEqual(out.get("a"), { definition: "정의 A", sense: [] });
  assert.deepStrictEqual(out.get("b"), { definition: "정의 B", sense: ["독성", "poisoning"] });
  assert.deepStrictEqual(out.get("c"), { definition: "", sense: ["키워드"] });
  assert.strictEqual(decodeDefChunk(null).size, 0);
}

// 생성: 뜻 키워드가 있는 용어만 {d, s}, 나머지는 문자열. 정의가 없어도 키워드는 싣는다.
{
  const terms = [
    { slug: "poisoning", definition: "독성 물질에 의한 해." },
    { slug: "plain", definition: "그냥 정의." },
    { slug: "nodef", definition: "" },
    { slug: "empty" },
  ];
  const senses = new Map([["poisoning", ["독성", "poisoning"]], ["nodef", ["키워드"]]]);
  const buckets = buildDefBuckets(terms, senses);
  assert.deepStrictEqual(buckets[defBucket("poisoning")].poisoning, { d: "독성 물질에 의한 해.", s: "독성 poisoning" });
  assert.strictEqual(buckets[defBucket("plain")].plain, "그냥 정의.");
  assert.deepStrictEqual(buckets[defBucket("nodef")].nodef, { s: "키워드" });
  assert.ok(!("empty" in buckets[defBucket("empty")]));
  // 생성 → 디코드 왕복
  const back = decodeDefChunk(buckets[defBucket("poisoning")]).get("poisoning");
  assert.deepStrictEqual(back.sense, ["독성", "poisoning"]);
}

// 후처리: 매칭 결과(상위 분야군이 달린 목록)에 뜻 키워드를 채운 뒤 규칙 1을 돌리고 다시 정렬
{
  const list = [
    { slug: "poisoning", title_ko: "중독", title_en: "Poisoning", categories: ["ems"], viaHangul: true,
      sense: ["독성", "해독제"], occurrences: [{ start: 7, length: 2 }], count: 1, score: 0 },
    { slug: "youth", title_ko: "청소년", title_en: "", categories: ["socwelfare"], viaHangul: true,
      sense: [], occurrences: [{ start: 0, length: 3 }], count: 1, score: 0 },
  ];
  list.topFieldGroups = ["사회과학"];
  const text = "청소년의 마약 중독 문제는 또래 관계에서 비롯된다.";
  const out = applySenseToMatches(list, text);
  assert.strictEqual(out.find((m) => m.slug === "poisoning").distant, true);
  assert.strictEqual(out[out.length - 1].slug, "poisoning", "강등된 것은 맨 뒤");
  assert.deepStrictEqual(out.topFieldGroups, ["사회과학"], "다시 정렬해도 상위 분야군 유지");
}

// matchTerms 결과에도 상위 분야군이 달려 나온다(후처리가 쓴다)
{
  const out = matchTerms("분산 분석", [{ slug: "variance", title_ko: "분산", title_en: "", categories: ["stat"] }]);
  assert.ok(Array.isArray(out.topFieldGroups));
}

console.log("defs sense: all tests passed");
