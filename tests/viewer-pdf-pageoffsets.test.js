const assert = require("assert");
const {
  buildPageOffsets,
  offsetToPageOffset,
  pageOffsetToGlobal,
  splitMatchesByPage,
} = require("../assets/viewer.js");

// 읽기 모드는 페이지별 <section>에 본문을 흘리는데, 용어 매칭은 페이지를
// 이어 붙인 전체 텍스트 하나에서 돌린다. 그래서 "전체 오프셋 ↔ (페이지,
// 페이지 오프셋)" 변환이 어긋나면 밑줄이 통째로 밀린다. 여기서 그 불변식을
// 잡아 둔다.

const pages = ["가나다", "라마", "바사아자"];
// "가나다" + \n + "라마" + \n + "바사아자"
const offsets = buildPageOffsets(pages);

{
  assert.deepStrictEqual(offsets, [
    { page: 1, start: 0, end: 3 },
    { page: 2, start: 4, end: 6 },
    { page: 3, start: 7, end: 11 },
  ]);
  // renderPdf가 실제로 만드는 문자열과 구간이 일치해야 한다.
  const joined = pages.join("\n");
  for (const entry of offsets) {
    assert.strictEqual(joined.slice(entry.start, entry.end), pages[entry.page - 1]);
  }
}

{
  assert.deepStrictEqual(offsetToPageOffset(offsets, 0), { page: 1, offset: 0 });
  assert.deepStrictEqual(offsetToPageOffset(offsets, 2), { page: 1, offset: 2 });
  assert.deepStrictEqual(offsetToPageOffset(offsets, 4), { page: 2, offset: 0 });
  assert.deepStrictEqual(offsetToPageOffset(offsets, 8), { page: 3, offset: 1 });
  assert.strictEqual(offsetToPageOffset(offsets, 99), null);
}

{
  assert.strictEqual(pageOffsetToGlobal(offsets, 2, 1), 5);
  assert.strictEqual(pageOffsetToGlobal(offsets, 99, 0), -1);
  // 왕복 변환은 항상 제자리로 돌아와야 한다.
  for (let i = 0; i <= 11; i++) {
    const loc = offsetToPageOffset(offsets, i);
    if (!loc) continue;
    assert.strictEqual(pageOffsetToGlobal(offsets, loc.page, loc.offset), i);
  }
}

// splitMatchesByPage: 전역 오프셋 기준 occurrences를 페이지별·페이지 기준으로
// 다시 나눈다. 페이지 경계를 넘는 일치는 그릴 자리가 없으므로 버린다.
{
  const matches = [
    {
      slug: "t1",
      title_ko: "가나",
      occurrences: [{ start: 0, length: 2 }, { start: 8, length: 2 }],
      firstStart: 0,
      firstLength: 2,
      count: 2,
    },
    {
      slug: "t2",
      title_ko: "라마",
      occurrences: [{ start: 4, length: 2 }],
      firstStart: 4,
      firstLength: 2,
      count: 1,
    },
    {
      slug: "over",
      title_ko: "경계넘김",
      occurrences: [{ start: 2, length: 4 }],
      firstStart: 2,
      firstLength: 4,
      count: 1,
    },
  ];
  const byPage = splitMatchesByPage(matches, offsets);

  assert.deepStrictEqual(
    (byPage.get(1) || []).map((m) => [m.slug, m.occurrences]),
    [["t1", [{ start: 0, length: 2 }]]]
  );
  assert.deepStrictEqual(
    (byPage.get(2) || []).map((m) => [m.slug, m.occurrences]),
    [["t2", [{ start: 0, length: 2 }]]]
  );
  assert.deepStrictEqual(
    (byPage.get(3) || []).map((m) => [m.slug, m.occurrences]),
    [["t1", [{ start: 1, length: 2 }]]]
  );
  // firstStart/count도 페이지 기준으로 다시 계산돼야 팝오버·정렬이 맞는다.
  const p3 = byPage.get(3)[0];
  assert.strictEqual(p3.firstStart, 1);
  assert.strictEqual(p3.firstLength, 2);
  assert.strictEqual(p3.count, 1);
  // 원본 match 객체는 건드리지 않는다(사이드바가 전역 오프셋을 계속 쓴다).
  assert.deepStrictEqual(matches[0].occurrences, [
    { start: 0, length: 2 },
    { start: 8, length: 2 },
  ]);
}

console.log("pdf page offsets: all tests passed");
