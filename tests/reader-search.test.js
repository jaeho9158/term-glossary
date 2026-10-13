const assert = require("assert");
const { foldText, findAll } = require("../assets/reader/search.js");

// 대소문자 무시
assert.deepStrictEqual(findAll("Drug Abuse and drug abuse", "DRUG ABUSE"), [{ start: 0, end: 10 }, { start: 15, end: 25 }]);

// 줄바꿈·연속 공백은 공백 하나로 접어 비교: 쪽 글에서 줄바꿈으로 끊긴 구절도 찾는다
{
  const text = "청소년 마약류\n사용 실태를 조사했다.";
  const hits = findAll(text, "마약류 사용");
  assert.deepStrictEqual(hits, [{ start: 4, end: 10 }]);
  assert.strictEqual(text.slice(hits[0].start, hits[0].end), "마약류\n사용");
}
assert.deepStrictEqual(findAll("a   b", "a b"), [{ start: 0, end: 5 }]);
assert.deepStrictEqual(findAll("a b", "a   \n b"), [{ start: 0, end: 3 }]);

// 겹치지 않게 앞에서부터
assert.deepStrictEqual(findAll("aaaa", "aa"), [{ start: 0, end: 2 }, { start: 2, end: 4 }]);

// 빈 질의·없는 질의
assert.deepStrictEqual(findAll("abc", ""), []);
assert.deepStrictEqual(findAll("abc", "   "), []);
assert.deepStrictEqual(findAll("abc", "x"), []);
assert.deepStrictEqual(findAll("", "x"), []);

// foldText 의 map 은 접힌 글자의 원문 위치
{
  const f = foldText("A \n B");
  assert.strictEqual(f.folded, "a b");
  assert.deepStrictEqual(f.map, [0, 1, 4]);
}

console.log("reader-search: all tests passed");
