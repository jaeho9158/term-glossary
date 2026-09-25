// 일반어 등급(계획 3단계 1번). 손으로 관리하던 블록리스트를 대신하는
// 값이므로, 신호 추출(문서빈도·분야 퍼짐·복합어 구성요소)과 등급 환산을
// 따로 고정해 둔다. 임계값이 흔들리면 사전 전체의 매칭이 바뀐다.
const assert = require("assert");
const { commonWordSignals, commonGrade, computeCommonGrades } = require("../scripts/generate-viewer-index.js");

// 등급 환산: 실제 사전 통계로 맞춘 임계값(보고서 표 참고)
{
  // "단계"(df 1944, 분야 98, cf 60) 같은 극단적 일반어 → 3
  assert.strictEqual(commonGrade({ df: 1944, fields: 98, compounds: 60, length: 2 }), 3);
  // "배경"(df 643, 분야 78, cf 8) → 3
  assert.strictEqual(commonGrade({ df: 643, fields: 78, compounds: 8, length: 2 }), 3);
  // "가설"(df 334, 분야 63, cf 87) → 2. 잡히되 뒤로 밀리는 자리.
  assert.strictEqual(commonGrade({ df: 334, fields: 63, compounds: 87, length: 2 }), 2);
  // "감사"(df 81, 분야 23, cf 26) → 낮음. 의도적으로 남긴 예.
  assert.ok(commonGrade({ df: 81, fields: 23, compounds: 26, length: 2 }) <= 1);
  // "전단응력"처럼 긴 전문용어는 항상 0
  assert.strictEqual(commonGrade({ df: 14, fields: 6, compounds: 2, length: 4 }), 0);
  // 신호가 아예 없으면 0
  assert.strictEqual(commonGrade({ df: 0, fields: 0, compounds: 0, length: 2 }), 0);
}

// 신호 추출: 문서빈도는 "몇 개 항목의 본문에 나왔는가"이고, 같은 항목 안에서
// 여러 번 나와도 1로 센다. 조사가 붙은 형태("응력이")도 같은 말로 센다.
{
  const terms = [
    { slug: "stress", title_ko: "응력", categories: ["mech"], definition: "재료 안에서 생기는 힘." },
    { slug: "a", title_ko: "가", categories: ["mech"], definition: "응력이 커지면 응력 집중이 생긴다.", why: "응력 때문" },
    { slug: "b", title_ko: "나", categories: ["stat"], deeper: "응력과 변형률" },
    { slug: "c", title_ko: "다", categories: ["lit"], definition: "관계 없는 문장." },
    { slug: "d", title_ko: "잔류응력", categories: ["mech"], definition: "무관" },
  ];
  const signals = commonWordSignals(terms);
  const stress = signals.get("응력");
  assert.strictEqual(stress.df, 2, "항목 a, b 두 곳 — 같은 항목 안 반복은 한 번");
  assert.strictEqual(stress.fields, 2, "mech, stat");
  assert.strictEqual(stress.compounds, 1, "'잔류응력'의 접미로 쓰임");
  assert.strictEqual(stress.length, 2);
  // 자기 자신의 본문은 세지 않는다
  assert.ok(!signals.has("가"), "한 글자 표제어는 애초에 인덱스에 들어가지 않으므로 대상 밖");
}

// computeCommonGrades: 표제어 → 등급 Map. 한글이 아닌 표제어는 등급 0.
{
  const terms = [
    { slug: "anova", title_ko: "ANOVA", categories: ["stat"], definition: "분산분석" },
    { slug: "x", title_ko: "전단응력", categories: ["mech"], definition: "ANOVA" },
  ];
  const grades = computeCommonGrades(terms);
  assert.strictEqual(grades.get("ANOVA") || 0, 0);
  assert.strictEqual(grades.get("전단응력") || 0, 0);
}

console.log("commonWordSignals/commonGrade: all tests passed");

// ---- 영문 표제어 일반어 판정(오탐 감축 B단계) ---------------------------
// 참고문헌·표·영문 병기의 "treatment", "function", "tor" 같은 일반 영어 단어가
// 무관한 분야의 한 단어짜리 영문 표제어(트리트먼트·함수·토르)와 맞았다.
// 한 단어짜리 영문 표제어가 일반어로 보이면 영문 키를 인덱스에서 뺀다.
{
  const { computeEnglishCommon } = require("../scripts/generate-viewer-index.js");
  const filler = (n, word, field) =>
    Array.from({ length: n }, (_, i) => ({ slug: `f-${word}-${i}`, title_ko: `채움${i}`, categories: [field ? `c${i}` : "x"], definition: `여기서 ${word} 가 쓰인다.` }));
  const terms = [
    { slug: "treatment", title_ko: "트리트먼트", title_en: "Treatment", categories: ["gamestudy"] },
    { slug: "tor", title_ko: "토르", title_en: "Tor", categories: ["geo"] },
    { slug: "eeg", title_ko: "뇌파검사", title_en: "EEG", categories: ["neuro"] },
    { slug: "shear", title_ko: "전단응력", title_en: "Shear Stress", categories: ["mech"] },
    { slug: "hyper", title_ko: "온열요법", title_en: "Hyperthermia", categories: ["med"] },
    { slug: "frame", title_ko: "늑골", title_en: "Frame", categories: ["naval"] },
    { slug: "t-test", title_ko: "t-검정", title_en: "t-test", categories: ["stat"] },
    // 다른 항목 5곳 본문에 영어로 나온다 → 일반어
    ...filler(5, "treatment", false),
    // 3개 분야에 걸쳐 나와도 문서빈도가 낮으면 유지(분야 신호는 시험 후 뺐다)
    ...filler(3, "frame", true),
    // 1곳에만 → 전문어
    ...filler(1, "hyperthermia", false),
  ];
  const common = computeEnglishCommon(terms);
  assert.ok(common.has("treatment"), "문서빈도 5 이상");
  assert.ok(!common.has("frame"), "문서빈도 3은 일반어 아님");
  assert.ok(common.has("tor"), "4글자 이하 일반 단어");
  assert.ok(!common.has("eeg"), "약어(대문자)는 대소문자 구분 매칭으로 따로 막는다");
  assert.ok(!common.has("shear stress"), "두 단어 이상은 유지");
  assert.ok(!common.has("hyperthermia"), "드문 전문어는 유지");
  assert.ok(!common.has("t-test"), "하이픈 복합어는 한 단어로 보지 않는다");
}
