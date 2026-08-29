// computeKeptSpans는 겹치는 하이라이트를 비겹침 목록으로 정리하는 로직으로,
// 텍스트 렌더러와 PDF 텍스트 레이어가 공유한다. 인접/중첩/동일 시작점 경계가
// 많아 회귀 위험이 높은데 직접 테스트가 없었다.
const assert = require("assert");
const { computeKeptSpans } = require("../assets/viewer.js");

const span = (slug, start, length, extra) =>
  Object.assign({ slug, firstStart: start, firstLength: length }, extra);

// 정상: 겹치지 않는 두 스팬은 둘 다 유지, 시작 순 정렬
{
  const kept = computeKeptSpans("x", [span("b", 10, 4), span("a", 0, 4)]);
  assert.deepStrictEqual(kept.map((k) => k.slug), ["a", "b"]);
  assert.deepStrictEqual(kept[0].covered, ["a"]);
}

// 경계: 동일 시작점에서는 긴 스팬이 이기고, 짧은 쪽은 covered로 흡수
{
  const kept = computeKeptSpans("x", [span("분산", 0, 2), span("분산분석", 0, 4)]);
  assert.strictEqual(kept.length, 1);
  assert.strictEqual(kept[0].slug, "분산분석");
  assert.deepStrictEqual(kept[0].covered, ["분산분석", "분산"]);
}

// 경계: 앞 스팬 내부에서 시작하는 뒤 스팬은 버려지되 covered에 기록
{
  const kept = computeKeptSpans("x", [span("a", 0, 5), span("b", 3, 5)]);
  assert.strictEqual(kept.length, 1);
  assert.deepStrictEqual(kept[0].covered, ["a", "b"]);
}

// 경계: 정확히 맞닿는 스팬(끝==시작)은 겹침이 아니다
{
  const kept = computeKeptSpans("x", [span("a", 0, 5), span("b", 5, 3)]);
  assert.strictEqual(kept.length, 2);
}

// 정상: occurrences가 있으면 모든 출현이 각각 하이라이트로 확장된다
{
  const kept = computeKeptSpans("x", [
    span("a", 0, 2, { occurrences: [{ start: 0, length: 2 }, { start: 10, length: 2 }] }),
  ]);
  assert.strictEqual(kept.length, 2, "출현 2회 → 스팬 2개");
}

// 실패: 위치가 없는 매치(firstStart -1, occurrences 없음)는 조용히 무시
{
  const kept = computeKeptSpans("x", [span("a", -1, 3)]);
  assert.deepStrictEqual(kept, []);
}

console.log("viewer-keptspans: all tests passed");
