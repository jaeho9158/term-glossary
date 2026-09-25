// 오탐 감축 A단계: 참고문헌·영문 초록 구간은 용어 매칭에서 뺀다.
// 참고문헌의 영어 제목("Stress Hormones", "Walker NM")과 영문 초록이
// 무관한 분야의 영문 표제어와 맞아 말뭉치 오탐의 큰 몫을 차지했다.
const assert = require("assert");
const { excludedRanges, matchTerms } = require("../assets/viewer.js");

const inRanges = (ranges, offset) => ranges.some(([s, e]) => offset >= s && offset < e);

// 참고문헌 제목부터 끝까지
{
  const text = "본문 응력 이야기.\n참고문헌\n1. Kim. Stress in beams.\n2. Lee. Walker study.";
  const ranges = excludedRanges(text);
  assert.ok(!inRanges(ranges, text.indexOf("응력")), "본문은 남긴다");
  assert.ok(inRanges(ranges, text.indexOf("Stress")), "참고문헌 안은 뺀다");
  assert.ok(inRanges(ranges, text.indexOf("Walker")), "끝까지 뺀다");
}

// 영문 제목·띄어 쓴 한글 제목·번호 붙은 제목도 인식
for (const heading of ["REFERENCES", "References", "참 고 문 헌", "Bibliography", "추가 참고문헌", "7. 참고문헌"]) {
  const text = `본문.\n${heading}\nSmith J. Treatment of x.`;
  assert.ok(inRanges(excludedRanges(text), text.indexOf("Treatment")), heading);
}

// 문장 속의 "참고문헌"이나 "References to"는 제목이 아니다
{
  const text = "이 절의 참고문헌 목록은 아래와 같다. Treatment 효과.\nReferences to prior work are given. Stress 값.";
  const ranges = excludedRanges(text);
  assert.ok(!inRanges(ranges, text.indexOf("Treatment")));
  assert.ok(!inRanges(ranges, text.indexOf("Stress")));
}

// Nature식 조판: 참고문헌 뒤에 방법(Methods)이 다시 나오면 거기서 멈춘다
{
  const text = "본문.\n참고문헌\n1. Stress paper.\n방법 (Methods)\n전위 기록은 이렇게 했다.\n추가 참고문헌\nWalker J.";
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("Stress")));
  assert.ok(!inRanges(ranges, text.indexOf("전위")), "방법 절은 본문");
  assert.ok(inRanges(ranges, text.indexOf("Walker")), "추가 참고문헌은 다시 뺀다");
}

// 영문 초록: Abstract ~ Key words 줄 끝까지
{
  const text = "국문 본문 응력.\nAbstract The balance of stress was studied.\nmore text\nKey words: Stress, Balance\n서론 본문 변형률.";
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("balance")));
  assert.ok(inRanges(ranges, text.indexOf("Balance")), "Key words 줄까지");
  assert.ok(!inRanges(ranges, text.indexOf("변형률")), "그 뒤 본문은 남긴다");
  assert.ok(!inRanges(ranges, text.indexOf("응력")));
}

// Key words가 없는 초록은 무한정 늘리지 않는다(상한)
{
  const text = "Abstract short.\n" + "가".repeat(20000) + " 응력";
  const ranges = excludedRanges(text);
  assert.ok(!inRanges(ranges, text.indexOf("응력")));
}

// 감사의 글도 참고문헌과 같은 뒷부분 — 제목 줄부터 다음 제목까지
{
  const text = "본문.\n감사의 글\n이 논문은 지원을 받았다.\n방법\n전위";
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("감사의 글")));
  assert.ok(!inRanges(ranges, text.lastIndexOf("전위")));
}

// 제외 구간이 없으면 빈 배열
assert.deepStrictEqual(excludedRanges("그냥 본문."), []);

// matchTerms가 제외 구간의 등장을 세지 않는다(텍스트·PDF 모드 공통 경로)
{
  const terms = [
    { slug: "stress", title_ko: "응력", title_en: "Stress", categories: ["mech"] },
    { slug: "walker", title_ko: "보행기", title_en: "Walker", categories: ["rehab"] },
  ];
  const text = "보에 걸린 응력을 쟀다.\n참고문헌\nWalker NM. Stress in beams.";
  const result = matchTerms(text, terms);
  const bySlug = Object.fromEntries(result.map((r) => [r.slug, r]));
  assert.strictEqual(bySlug.stress.count, 1, "본문 응력 한 번만");
  assert.strictEqual(bySlug.walker, undefined, "참고문헌에서만 나온 용어는 없음");
}

console.log("excludedRanges: all tests passed");
