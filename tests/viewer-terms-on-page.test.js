const assert = require("assert");
const { buildPageOffsets, termsOnPage } = require("../assets/viewer.js");

// 읽기 모드에서 "지금 보고 있는 페이지의 용어"를 패널 맨 위에 올리기 위한 표.
// 스크롤 때마다 다시 계산하면 느리므로 한 번 만들어 두고 page로 꺼내 쓴다.

const pages = ["응력 해석", "전단응력과 응력", "무관한 본문"];
const offsets = buildPageOffsets(pages);
// "응력 해석\n전단응력과 응력\n무관한 본문"

const matches = [
  {
    slug: "stress",
    title_ko: "응력",
    occurrences: [
      { start: 0, length: 2 }, // p.1
      { start: 8, length: 2 }, // p.2 '전단응력' 안쪽
      { start: 13, length: 2 }, // p.2 단독
    ],
    firstStart: 0,
    firstLength: 2,
    count: 3,
  },
  {
    slug: "shear-stress",
    title_ko: "전단응력",
    occurrences: [{ start: 6, length: 4 }], // p.2
    firstStart: 6,
    firstLength: 4,
    count: 1,
  },
];

{
  const byPage = termsOnPage(matches, offsets);
  assert.ok(byPage instanceof Map, "페이지 번호로 꺼낼 수 있는 Map을 준다");
  assert.deepStrictEqual([...byPage.keys()], [1, 2], "용어가 없는 페이지는 넣지 않는다");

  const p1 = byPage.get(1);
  assert.strictEqual(p1.length, 1);
  assert.strictEqual(p1[0].slug, "stress");
  assert.strictEqual(p1[0].pageCount, 1, "그 페이지에서의 등장 횟수만 센다");
  assert.strictEqual(p1[0].count, 3, "문서 전체 횟수는 그대로 남는다");

  const p2 = byPage.get(2);
  assert.strictEqual(p2.length, 2);
  // 페이지 안에서 처음 나온 순서(전단응력 6 < 응력 8)
  assert.deepStrictEqual(p2.map((m) => m.slug), ["shear-stress", "stress"]);
  assert.strictEqual(p2.find((m) => m.slug === "stress").pageCount, 2);
}

// 원본 match 객체를 건드리지 않는다(사이드바는 계속 전체 오프셋을 쓴다).
{
  termsOnPage(matches, offsets);
  assert.strictEqual(matches[0].count, 3);
  assert.strictEqual(matches[0].firstStart, 0);
  assert.strictEqual(matches[0].occurrences.length, 3);
}

// occurrences가 없고 firstStart만 있는 형태도 받는다
{
  const byPage = termsOnPage(
    [{ slug: "a", title_ko: "가", firstStart: 7, firstLength: 2, count: 1 }],
    offsets
  );
  assert.deepStrictEqual([...byPage.keys()], [2]);
  assert.strictEqual(byPage.get(2)[0].pageCount, 1);
}

// 빈 입력·범위 밖 오프셋은 조용히 빈 결과
{
  assert.strictEqual(termsOnPage(null, offsets).size, 0);
  assert.strictEqual(termsOnPage(matches, []).size, 0);
  assert.strictEqual(
    termsOnPage([{ slug: "x", occurrences: [{ start: 999, length: 2 }] }], offsets).size,
    0
  );
  assert.strictEqual(
    termsOnPage([{ slug: "x", firstStart: -1, firstLength: 0 }], offsets).size,
    0
  );
}

console.log("termsOnPage: all tests passed");
