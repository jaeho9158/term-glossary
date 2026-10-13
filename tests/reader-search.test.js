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

// 줄 끝에서 낱말 안쪽이 끊긴 한글: 줄바꿈을 지운 변형으로도 찾고, 원문 위치는 줄바꿈을 포함한다
{
  const text = "분석 네트워\n크 구조";
  const hits = findAll(text, "네트워크");
  assert.deepStrictEqual(hits, [{ start: 3, end: 8 }]);
  assert.strictEqual(text.slice(hits[0].start, hits[0].end), "네트워\n크");
  // 일부만 겹쳐도 원문 위치가 맞다
  assert.deepStrictEqual(findAll(text, "워크 구"), [{ start: 5, end: 10 }]);
  // 앞뒤 공백이 낀 줄바꿈
  assert.deepStrictEqual(findAll("네트워 \n 크", "네트워크"), [{ start: 0, end: 7 }]);
}
// 같은 자리는 두 번 내지 않는다: 줄바꿈 없는 문장은 한 건, 공백 변형과 줄바꿈 제거 변형이 모두 맞는 구절도 한 건씩
assert.deepStrictEqual(findAll("네트워크 네트워크", "네트워크").length, 2);
assert.deepStrictEqual(findAll("마약\n류 마약 류", "마약 류"), [{ start: 0, end: 4 }, { start: 5, end: 9 }]);
{
  // 한글 줄바꿈은 공백 변형("마약 류")과 이음 변형("마약류") 어느 쪽 질의로도 같은 자리를 찾되 중복은 없다
  const t = "치료\n보호";
  assert.deepStrictEqual(findAll(t, "치료 보호"), [{ start: 0, end: 5 }]);
  assert.deepStrictEqual(findAll(t, "치료보호"), [{ start: 0, end: 5 }]);
}
// 한글과 라틴 사이의 줄바꿈은 이어 붙이지 않는다
assert.deepStrictEqual(findAll("약물\nabc", "약물abc"), []);
// 라틴: 줄바꿈은 공백, 하이픈 + 줄바꿈은 이음(net-/work) 또는 하이픈 유지(well-/known)
assert.deepStrictEqual(findAll("a net-\nwork b", "network"), [{ start: 2, end: 11 }]);
assert.deepStrictEqual(findAll("a well-\nknown b", "well-known"), [{ start: 2, end: 13 }]);
assert.deepStrictEqual(findAll("a well-\nknown b", "well- known"), [{ start: 2, end: 13 }]);
assert.deepStrictEqual(findAll("drug\nabuse", "drug abuse"), [{ start: 0, end: 10 }]);
// 거짓 양성 방지: 하이픈 뒤가 대문자·숫자거나 앞이 글자가 아니면 이음하지 않는다
assert.deepStrictEqual(findAll("x-\nY", "xy"), []);
assert.deepStrictEqual(findAll("1-\n2", "12"), []);
// 줄바꿈이 없는 글에서는 변형이 의미 없다(같은 결과)
assert.deepStrictEqual(findAll("네트 워크", "네트워크"), []);

// 문단 경계(빈 줄)는 이어 붙이지 않는다
assert.deepStrictEqual(findAll("감염\n\n관리", "감염관리"), []);
assert.deepStrictEqual(findAll("감염\n \n관리", "감염관리"), []);
assert.deepStrictEqual(findAll("감염\n관리", "감염관리"), [{ start: 0, end: 5 }]);
assert.deepStrictEqual(findAll("net-\n\nwork", "network"), []);
assert.deepStrictEqual(findAll("net-\nwork", "network"), [{ start: 0, end: 9 }]);
// 빈 줄이 있어도 기본 접기(공백 하나)로는 찾는다
assert.deepStrictEqual(findAll("감염\n\n관리", "감염 관리"), [{ start: 0, end: 6 }]);

console.log("reader-search: all tests passed");
