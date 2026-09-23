const test = require("node:test");
const assert = require("node:assert");

const {
  findNearestOccurrence,
  resolveAnnotationAnchor,
  mergeOverlappingRanges,
  shouldPersistReanchor,
} = require("../assets/viewer.js");

test("findNearestOccurrence: 없으면 -1", () => {
  assert.strictEqual(findNearestOccurrence("가나다라", "마바", 0), -1);
  assert.strictEqual(findNearestOccurrence("", "가", 0), -1);
  assert.strictEqual(findNearestOccurrence("가나다", "", 0), -1);
});

test("findNearestOccurrence: 여러 번 나오면 힌트 오프셋에 가장 가까운 것", () => {
  const text = "응력 " + "x".repeat(50) + " 응력 " + "y".repeat(50) + " 응력";
  const first = 0;
  const second = text.indexOf("응력", 1);
  const third = text.lastIndexOf("응력");
  assert.strictEqual(findNearestOccurrence(text, "응력", 0), first);
  assert.strictEqual(findNearestOccurrence(text, "응력", second + 1), second);
  assert.strictEqual(findNearestOccurrence(text, "응력", text.length), third);
});

test("resolveAnnotationAnchor: 오프셋 자리가 quote 와 같으면 그대로 쓴다", () => {
  const pageText = "본 연구는 전단응력을 측정하였다.";
  const start = pageText.indexOf("전단응력");
  const res = resolveAnnotationAnchor(pageText, {
    startOffset: start,
    endOffset: start + 4,
    quoteText: "전단응력",
  });
  assert.deepStrictEqual(res, { startOffset: start, endOffset: start + 4, status: "offset" });
});

test("resolveAnnotationAnchor: 오프셋이 밀렸으면 quote 로 재탐색한다", () => {
  const pageText = "머리말\n본 연구는 전단응력을 측정하였다.";
  const real = pageText.indexOf("전단응력");
  const res = resolveAnnotationAnchor(pageText, {
    startOffset: real - 4, // 옛 텍스트 레이어 기준이라 어긋난 값
    endOffset: real,
    quoteText: "전단응력",
  });
  assert.strictEqual(res.status, "quote");
  assert.strictEqual(res.startOffset, real);
  assert.strictEqual(res.endOffset, real + 4);
});

test("resolveAnnotationAnchor: quote 가 페이지에 없으면 lost", () => {
  const res = resolveAnnotationAnchor("본 연구는 응력을 다룬다.", {
    startOffset: 0,
    endOffset: 3,
    quoteText: "전단탄성계수",
  });
  assert.strictEqual(res.status, "lost");
  assert.strictEqual(res.startOffset, null);
});

test("resolveAnnotationAnchor: 페이지 텍스트가 없으면 lost", () => {
  const anchor = { startOffset: 0, endOffset: 2, quoteText: "응력" };
  assert.strictEqual(resolveAnnotationAnchor("", anchor).status, "lost");
  assert.strictEqual(resolveAnnotationAnchor(null, anchor).status, "lost");
  assert.strictEqual(resolveAnnotationAnchor("응력", null).status, "lost");
});

test("resolveAnnotationAnchor: quote 가 없는 옛 레코드는 오프셋 범위가 유효할 때만 산다", () => {
  const pageText = "0123456789";
  assert.deepStrictEqual(
    resolveAnnotationAnchor(pageText, { startOffset: 2, endOffset: 5, quoteText: "" }),
    { startOffset: 2, endOffset: 5, status: "offset" }
  );
  // 페이지 길이를 넘는 범위는 다른 좌표계에서 온 값이므로 버린다
  assert.strictEqual(
    resolveAnnotationAnchor(pageText, { startOffset: 8, endOffset: 40, quoteText: "" }).status,
    "lost"
  );
});

test("resolveAnnotationAnchor: 공백이 달라져도 quote 재탐색으로 살린다", () => {
  // 읽기 모드는 텍스트 레이어와 띄어쓰기 규칙이 달라 quote 에 여분의 공백이 섞인다
  const pageText = "본 연구는 전단 응력을 측정하였다.";
  const res = resolveAnnotationAnchor(pageText, {
    startOffset: 0,
    endOffset: 4,
    quoteText: "전단  응력",
  });
  assert.strictEqual(res.status, "quote");
  assert.strictEqual(pageText.slice(res.startOffset, res.endOffset), "전단 응력");
});

test("mergeOverlappingRanges: 겹친 범위를 하나로 합치고 원 레코드를 모두 남긴다", () => {
  const merged = mergeOverlappingRanges([
    { id: "a", startOffset: 10, endOffset: 20 },
    { id: "b", startOffset: 15, endOffset: 30 },
    { id: "c", startOffset: 40, endOffset: 45 },
  ]);
  assert.strictEqual(merged.length, 2);
  assert.deepStrictEqual([merged[0].startOffset, merged[0].endOffset], [10, 30]);
  assert.deepStrictEqual(merged[0].records.map((r) => r.id), ["a", "b"]);
  assert.deepStrictEqual([merged[1].startOffset, merged[1].endOffset], [40, 45]);
});

test("mergeOverlappingRanges: 완전히 품은 범위·맞닿은 범위", () => {
  const nested = mergeOverlappingRanges([
    { id: "big", startOffset: 0, endOffset: 50 },
    { id: "small", startOffset: 10, endOffset: 12 },
  ]);
  assert.strictEqual(nested.length, 1);
  assert.deepStrictEqual([nested[0].startOffset, nested[0].endOffset], [0, 50]);
  // 끝과 시작이 같은 것은 겹친 것이 아니다 — 감싸기가 깨지지 않으므로 따로 둔다
  const touching = mergeOverlappingRanges([
    { id: "a", startOffset: 0, endOffset: 10 },
    { id: "b", startOffset: 10, endOffset: 20 },
  ]);
  assert.strictEqual(touching.length, 2);
});

test("mergeOverlappingRanges: 잘못된 레코드는 버리고 빈 입력에도 안 터진다", () => {
  assert.deepStrictEqual(mergeOverlappingRanges(null), []);
  assert.deepStrictEqual(mergeOverlappingRanges([{ id: "x" }, { startOffset: 5, endOffset: 5 }]), []);
});

test("shouldPersistReanchor: 공백 뺀 4글자 미만은 되저장하지 않는다", () => {
  assert.strictEqual(shouldPersistReanchor("전단응력"), true);
  assert.strictEqual(shouldPersistReanchor("전 단 응 력"), true);
  assert.strictEqual(shouldPersistReanchor("응력"), false);
  assert.strictEqual(shouldPersistReanchor("  값 "), false);
  assert.strictEqual(shouldPersistReanchor(null), false);
});
