const assert = require("assert");
const { joinTextItems, orderTextItemsByColumn } = require("../assets/term-match.js");

// pdf.js text items: {str, transform: [scaleX, skewY, skewX, scaleY, x, y], width, hasEOL}.
// height is derived from |transform[3]|; word-internal splits sit right next
// to each other (near-zero gap), a real space has a gap close to the glyph
// advance width of a space character (roughly comparable to font height).
function item(str, x, y, width, fontSize = 12, extra = {}) {
  return { str, transform: [fontSize, 0, 0, fontSize, x, y], width, ...extra };
}

// Test 1: a single word split across two adjacent items (font-run change,
// kerning) with no real gap between them must NOT get a space inserted.
// This is the exact bug that made "분산분석" extract as "분산 분석" and
// corrupted matching/highlighting.
{
  const items = [item("분산", 0, 700, 24, 12), item("분석", 24, 700, 24, 12)];
  const text = joinTextItems(items);
  assert.strictEqual(text, "분산분석", "no space should be inserted between items with no real gap");
}

// Test 2: two genuinely separate words with a normal inter-word gap DO get
// a space, so real word boundaries are still preserved.
{
  const items = [item("결론이", 0, 700, 36, 12), item("근거에", 40, 700, 36, 12)];
  const text = joinTextItems(items);
  assert.strictEqual(text, "결론이 근거에", "a real inter-word gap should still produce a space");
}

// Test 3: items on a different line (new row of a table, or a wrapped line)
// are joined with a newline rather than run together with no separator at all.
{
  const items = [item("첫줄", 0, 700, 24, 12), item("둘째줄", 0, 680, 30, 12)];
  const text = joinTextItems(items);
  assert.strictEqual(text, "첫줄\n둘째줄", "items on a different line should be separated by a newline");
}

// Test 4: an item whose str already starts with a space is not double-spaced.
{
  const items = [item("결론이", 0, 700, 36, 12), item(" 근거에", 40, 700, 42, 12)];
  const text = joinTextItems(items);
  assert.strictEqual(text, "결론이 근거에", "should not insert a duplicate space when the item text already has one");
}

// ---- 2단 조판 ----------------------------------------------------------
// pageWidth를 주면 x좌표로 좌/우 열을 갈라 "좌열 전체 → 우열 전체" 순서로
// 잇는다. 주지 않으면(=기존 호출부) 예전 동작 그대로여야 한다.
const PAGE_W = 600; // mid = 300

// Test 5: 2단 조판. item 순서는 좌1,우1,좌2,우2… 로 섞여 있지만 읽기 순서는
// 좌열을 다 읽고 우열로 넘어가는 것이다.
{
  const items = [
    item("좌1", 50, 700, 100), item("우1", 320, 700, 100),
    item("좌2", 50, 680, 100), item("우2", 320, 680, 100),
    item("좌3", 50, 660, 100), item("우3", 320, 660, 100),
  ];
  assert.strictEqual(joinTextItems(items, PAGE_W), "좌1\n좌2\n좌3\n우1\n우2\n우3");
  // pageWidth 없이 부르면 조판 복원 없이 예전대로 줄 단위로 이어진다.
  assert.strictEqual(joinTextItems(items), "좌1 우1\n좌2 우2\n좌3 우3");
}

// Test 6: 단일단 페이지는 pageWidth를 줘도 순서가 그대로여야 한다(오른쪽 열이
// 없으므로 2단으로 오인하면 안 된다).
{
  const items = [
    item("첫", 50, 700, 100), item("둘", 50, 680, 100), item("셋", 50, 660, 100),
    item("넷", 50, 640, 100), item("다", 50, 620, 100), item("섯", 50, 600, 100),
  ];
  assert.strictEqual(joinTextItems(items, PAGE_W), "첫\n둘\n셋\n넷\n다\n섯");
  assert.deepStrictEqual(orderTextItemsByColumn(items, PAGE_W), items);
}

// Test 7: 두 단을 가로지르는 제목은 열보다 위(y가 큼)에 있으므로 맨 앞에,
// 꼬리말(페이지 번호 등)은 열보다 아래에 있으므로 맨 뒤에 붙는다.
{
  const title = item("제목", 100, 760, 400);
  const footer = item("쪽번호", 100, 40, 400);
  const items = [
    title,
    item("좌1", 50, 700, 100), item("우1", 320, 700, 100),
    item("좌2", 50, 680, 100), item("우2", 320, 680, 100),
    item("좌3", 50, 660, 100), item("우3", 320, 660, 100),
    footer,
  ];
  const ordered = orderTextItemsByColumn(items, PAGE_W);
  assert.strictEqual(ordered[0], title);
  assert.strictEqual(ordered[ordered.length - 1], footer);
  assert.strictEqual(joinTextItems(items, PAGE_W), "제목\n좌1\n좌2\n좌3\n우1\n우2\n우3\n쪽번호");
}

console.log("joinTextItems: all tests passed");

// 자간(letter-spacing)이 큰 PDF는 pdf.js가 한글 한 글자마다 공백을 끼워
// "혈 액 응 고"처럼 뽑는다. 진짜 띄어쓰기는 별도의 " " item으로 오므로,
// item 안의 글자 사이 공백만 걷어내면 원문 띄어쓰기가 살아난다.
{
  const items = [
    item("혈 액", 82, 744, 34), item(" ", 117, 744, 8), item("응 고 의", 125, 744, 37),
    item(" ", 163, 744, 8), item("경 로", 217, 744, 24),
  ];
  assert.strictEqual(joinTextItems(items).trim(), "혈액 응고의 경로");
}
{
  // 구두점·숫자가 섞여도 한글 사이 공백만 없앤다. 정상 문장은 건드리지 않는다.
  assert.strictEqual(joinTextItems([item("피 부 ,혈 관", 0, 0, 58)]).trim(), "피부 ,혈관");
  assert.strictEqual(joinTextItems([item("제 10인 자 (Xa)", 0, 0, 58)]).trim(), "제 10인자 (Xa)");
  assert.strictEqual(joinTextItems([item("혈액 응고의 외인성 경로", 0, 0, 120)]).trim(), "혈액 응고의 외인성 경로");
}

// 한 단 쪽인데 item 이 낱말마다 쪼개져 가운데 선 양쪽에 놓이는 경우(한글 문서 내보내기):
// 줄이 이어져 있으므로 순서를 바꾸면 안 된다. 진짜 2단(단 사이 여백)은 그대로 왼쪽 단 먼저.
{
  const words = ["오늘", "우리는", "함께", "공부를", "시작했다", "그리고", "내일도", "계속한다"]; // 8 items/line
  const single = [];
  for (let line = 0; line < 5; line++) {
    words.forEach((w, k) => single.push(item(w, 60 + k * 62, 700 - line * 20, 56, 12)));
  }
  assert.strictEqual(orderTextItemsByColumn(single, PAGE_W), single, "낱말마다 쪼개진 한 단 쪽은 순서 유지");

  const two = [];
  for (let line = 0; line < 5; line++) {
    two.push(item("좌" + line, 50, 700 - line * 20, 200, 12));
    two.push(item("우" + line, 330, 700 - line * 20, 200, 12));
  }
  const ordered = orderTextItemsByColumn(two, PAGE_W);
  assert.notStrictEqual(ordered, two);
  assert.strictEqual(ordered.map((i) => i.str).join(","), "좌0,좌1,좌2,좌3,좌4,우0,우1,우2,우3,우4", "진짜 2단은 왼쪽 단 먼저");
}
