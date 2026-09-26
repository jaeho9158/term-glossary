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

// (a) 영문 초록 선두 + "□ Keywords" 뒤 국문 본문은 제외하지 않는다
{
  const text = "Abstract\nThis study examines stress.\n□ Keywords: stress, beam\n본문에서 응력을 쟀다.";
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("This study")));
  assert.ok(!inRanges(ranges, text.indexOf("본문에서")), "Keywords 뒤 본문 유지");
}
// 초록 뒤 Keywords 없이 "Ⅰ. 서론"이 오면 거기서 끝난다
{
  const text = "Abstract\nThis study examines stress.\nⅠ. 서론\n응력을 쟀다.";
  const ranges = excludedRanges(text);
  assert.ok(!inRanges(ranges, text.indexOf("Ⅰ. 서론")));
  assert.ok(!inRanges(ranges, text.indexOf("응력을")));
}
// 초록 종료 표지가 없으면 1500자까지만
{
  const text = "Abstract\n" + "a".repeat(3000) + "\n본문";
  const ranges = excludedRanges(text);
  assert.ok(!inRanges(ranges, text.indexOf("본문")));
  assert.ok(ranges[0][1] <= 1500);
}
// (b) 장별 참고문헌 뒤 "제2장 …" → 복귀
{
  const text = "본문.\n참고문헌\nKim, J. (2019). Title. J Sci, 1, 1-2.\n제2장 연구 방법\n응력을 쟀다.";
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("Kim")));
  assert.ok(!inRanges(ranges, text.indexOf("응력을")));
}
// (c) 참고문헌 항목 "Methods for …"는 복귀 제목이 아니다
{
  const text = "본문.\nReferences\nMethods for stress analysis\nKim J, Lee H (2019)\nJ Eng 12, pp. 3-9.\nWalker NM.";
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("Walker")), "참고문헌 계속");
}
// (d) 본문 중간 "사사" 뒤 결과 절 → 결과 유지
{
  const text = "서론 본문.\n사사\n이 연구는 지원을 받았다.\n결과\n응력이 컸다.";
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("이 연구는")));
  assert.ok(!inRanges(ranges, text.indexOf("응력이")));
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


// 라운드 2: Vancouver식 참고문헌(2020;35:e12)도 참고문헌 형식으로 본다
{
  const text = "본문.\n참고문헌\n1. Kim JH. Foo.\nMethods for x.\nJ Korean Med Sci\n2020;35:e12.";
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("J Korean")), "Vancouver 참고문헌 계속");
  const text2 = "본문.\n참고문헌\n1. Kim JH. Foo.\nMethods for x.\nJ Med 12(3): 45-9.";
  assert.ok(inRanges(excludedRanges(text2), text2.indexOf("J Med")), "권(호): 쪽 형식");
}
// 번호 붙은 장 제목은 뒤 줄 형식 검사 없이 복귀
{
  const text = "본문.\n참고문헌\nKim (2020). Foo.\n제2장 이론적 배경\n최근 Lee (2019)는 말했다.";
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("Kim")));
  assert.ok(!inRanges(ranges, text.indexOf("최근")), "제2장에서 복귀");
}
// 숫자 번호 줄은 그 줄에 참고문헌 표지(서울:·출판사·연도 괄호)가 있으면 제목 생략 대상이 아니다
{
  const text = "본문.\n참고문헌\n1. 홍길동(2018). 논문 제목. 학회지.\n2. 결론 및 제언에 관한 연구. 서울: 학지사.\n3. 김철수(2019). 응력 연구. 학회지, 12(3), 45-67.";
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("김철수")), "3번 항목은 계속 제외");
}
// Vancouver 월 표기(2020 Mar;35)도 참고문헌 형식
{
  const text = "본문.\n참고문헌\n1. Kim JH. Foo.\nMethods for x.\nJ Korean Med Sci\n2020 Mar;35:e12.";
  assert.ok(inRanges(excludedRanges(text), text.indexOf("J Korean")), "월 표기 Vancouver");
}
// 서론 제목 변형에서 영문 초록이 끝난다
for (const heading of ["제1장 서론", "Ⅰ. 서론 및 연구 목적", "1. Introduction"]) {
  const text = `Abstract\nThis study examines stress.\n${heading}\n본문 응력.`;
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("examines")));
  assert.ok(!inRanges(ranges, text.indexOf("본문 응력")), heading);
}

console.log("excludedRanges: all tests passed");

// 오픈액세스 라이선스 고지(CC BY 문구)는 저널 상투문이라 제외한다.
// "Attribution"이 표제어(진위감정)로 잡혀 OA 말뭉치 86/106편에 나왔다.
{
  const text = "서론 본문 응력.\nThis is an Open Access article distributed under the terms of the Creative Commons Attribution Non-Commercial License (http://creativecom-\nmons.org/licenses/by-nc/4.0) which permits unrestricted use,\ndistribution, and reproduction in any medium, provided the original work is properly cited.\nCopyright © 2023 Korean Society\n본문 계속 Stress 값.";
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("Attribution")), "고지 첫 줄");
  assert.ok(inRanges(ranges, text.indexOf("reproduction")), "고지 끝 줄까지");
  assert.ok(!inRanges(ranges, text.indexOf("응력")), "앞 본문은 남긴다");
  assert.ok(!inRanges(ranges, text.indexOf("Stress")), "뒤 본문은 남긴다");
}
{
  const text = "본문.\n이 저작물은 크리에이티브 커먼즈 저작자표시-비영리 4.0 국제 라이선스에 따라 이용할 수 있습니다.\n본문 Treatment 효과.";
  const ranges = excludedRanges(text);
  assert.ok(inRanges(ranges, text.indexOf("저작자표시")), "한국어 고지");
  assert.ok(!inRanges(ranges, text.indexOf("Treatment")), "다음 줄 본문은 남긴다");
}
