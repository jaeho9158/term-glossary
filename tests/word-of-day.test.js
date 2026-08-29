// "오늘의 단어"는 같은 날 모든 방문자에게 같은 5개를 보여준다는 결정론 계약
// 위에 서 있다. 시드 셔플이 비결정적으로 회귀하면 계약이 조용히 깨진다.
const assert = require("assert");
const { extract } = require("./helpers/extract-fn.js");

const { seededPick } = extract("assets/word-of-day.js", { fns: ["seededPick"] });

const list = Array.from({ length: 50 }, (_, i) => `t${i}`);

// 정상: 같은 시드는 항상 같은 결과 (결정론)
{
  const a = Array.from(seededPick(list, 5, "2026-8-29"));
  const b = Array.from(seededPick(list, 5, "2026-8-29"));
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a.length, 5);
}

// 정상: 다른 시드는 (사실상 항상) 다른 결과 — 날짜가 바뀌면 단어도 바뀜
{
  const a = Array.from(seededPick(list, 5, "2026-8-29")).join(",");
  const b = Array.from(seededPick(list, 5, "2026-8-30")).join(",");
  assert.notStrictEqual(a, b);
}

// 경계: 중복 없이 뽑는다 (splice 기반이므로 같은 항목 재선택 금지)
{
  const picks = Array.from(seededPick(list, 50, "x"));
  assert.strictEqual(new Set(picks).size, 50);
}

// 경계: 풀보다 많이 요청하면 풀 크기만큼만
{
  assert.strictEqual(Array.from(seededPick(["a", "b"], 5, "x")).length, 2);
}

// 실패: 빈 풀·빈 시드에도 throw 없이 동작
{
  assert.deepStrictEqual(Array.from(seededPick([], 5, "x")), []);
  assert.strictEqual(Array.from(seededPick(list, 3, "")).length, 3);
}

// 경계: 원본 배열을 변형하지 않는다
{
  const orig = ["a", "b", "c"];
  seededPick(orig, 3, "x");
  assert.deepStrictEqual(orig, ["a", "b", "c"]);
}

console.log("word-of-day: all tests passed");
