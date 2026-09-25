// 오탐 라운드 3 규칙 1(문맥 뜻 판별): 짧은 표제어가 문서의 상위 분야군 밖이면, 등장
// 위치 앞뒤 창의 낱말과 그 용어의 "뜻 키워드"(사전 정의·관련어·분야명에서 빌드 시
// 뽑음)가 하나도 겹치지 않고 등장이 적을 때 강등한다.
const assert = require("assert");
const { applySenseContextRule, senseStems, decodeViewerIndex } = require("../assets/viewer.js");
const { senseKeywords } = require("../scripts/generate-viewer-index.js");

// 어간 후보: 조사·흔한 어미를 뗀 형태
assert.ok(senseStems("해독제는").includes("해독제"));
assert.ok(senseStems("독성이").includes("독성"));
assert.ok(senseStems("노출되는").includes("노출"));

const poisoning = () => ({
  slug: "poisoning", title_ko: "중독", title_en: "Poisoning", categories: ["ems"],
  sense: ["독성", "해독제", "흡입", "섭취", "노출", "응급"], viaHangul: true,
});
const at = (text, word) => {
  const occ = [];
  let i = -1;
  while ((i = text.indexOf(word, i + 1)) !== -1) occ.push({ start: i, length: word.length });
  return occ;
};
const run = (text, top) => {
  const m = poisoning();
  m.occurrences = at(text, "중독");
  m.count = m.occurrences.length;
  applySenseContextRule([m], text, top);
  return m;
};

// 마약·청소년 문맥(사회과학 문서) → 강등
{
  const text = "청소년의 마약 중독 문제는 또래 관계와 가정 환경에서 비롯된다. 예방 교육이 필요하다.";
  assert.strictEqual(run(text, ["사회과학"]).distant, true, "마약·청소년 문맥 중독 → 강등");
}
// 독성·해독 문맥 → 유지
{
  const text = "농약 섭취로 인한 중독 환자에게 해독제를 투여하였다. 독성이 강했다.";
  assert.ok(!run(text, ["사회과학"]).distant, "독성·해독 문맥 → 유지");
}
// 상위 분야군 안의 용어는 제외
{
  const text = "청소년의 마약 중독 문제는 또래 관계에서 비롯된다.";
  assert.ok(!run(text, ["의학·생명"]).distant, "상위 분야군 용어는 규칙 제외");
}
// 등장이 많으면(>2) 유지
{
  const text = "중독 중독 중독 청소년 마약";
  assert.ok(!run(text, ["사회과학"]).distant, "3회 이상 등장 → 유지");
}
// 분야 추정이 없으면(용어가 적은 문서) 적용하지 않는다
{
  const text = "청소년의 마약 중독 문제.";
  assert.ok(!run(text, []).distant);
}

// 빌드: 정의·관련어·분야명에서 2~4음절 명사, 자기 표제어·불용어 제외, 12개 이하
{
  const terms = [
    { slug: "poisoning", title_ko: "중독", categories: ["ems"], related: ["antidote"],
      definition: "독성 물질이 체내로 흡수되어 정상적인 생리 기능을 방해하는 상태로 섭취, 흡입 등으로 발생한다.",
      why: "중독을 신속히 인식하고 원인 물질을 파악하는 것이 중요합니다." },
    { slug: "antidote", title_ko: "해독제", categories: ["pharm"], definition: "독의 작용을 없애는 약." },
    { slug: "toxicity", title_ko: "독성", categories: ["toxicol"], definition: "물질이 생물에 해를 끼치는 성질." },
    { slug: "density", title_ko: "밀도", categories: ["phys"], definition: "물보다 가벼운지 무거운지 나타내는 값." },
  ];
  const kw = senseKeywords(terms).get("poisoning");
  assert.ok(kw.includes("독성"), kw.join(","));
  assert.ok(kw.includes("해독제"), "관련어 표제어 포함");
  assert.ok(kw.includes("응급구조학"), "분야명 포함: " + kw.join(","));
  assert.ok(!kw.includes("중독"), "자기 표제어 제외");
  assert.ok(kw.length <= 12);
  // 활용형 조각(사전 표제어도 아니고 격조사 꼴 근거도 없음)은 명사로 치지 않는다
  assert.ok(!senseKeywords(terms).get("density").includes("가벼운지"));
}

// 라운드 4: 영문 표제어 토큰(소문자)도 키워드. 동사 조각·'학'을 뗀 어간은 명사 검증을 거친다.
{
  const filler = (i, body) => ({ slug: "f" + i, title_ko: "채움" + i, categories: ["phys"], definition: body });
  const terms = [
    { slug: "poisoning", title_ko: "중독", title_en: "Acute Poisoning", categories: ["archaeo", "sports"],
      definition: "독성 물질이 쓰이는 경우 몸에 퍼져나가는 상태이다." },
    // "쓰이는·퍼져나가는"(관형형 -는)이 여러 항목에 나와도 명사 근거가 아니다
    ...[1, 2, 3, 4].map((i) => filler(i, "도구로 쓰이는 물질이 퍼져나가는 현상, 독성을 본다.")),
  ];
  const kw = senseKeywords(terms).get("poisoning");
  assert.ok(kw.includes("poisoning") && kw.includes("acute"), "영문 표제어 토큰 포함: " + kw.join(","));
  assert.ok(!kw.includes("Poisoning"), "영문은 소문자");
  assert.ok(!kw.includes("쓰이") && !kw.includes("퍼져나가"), "동사 조각 제외: " + kw.join(","));
  assert.ok(!kw.includes("고고") && !kw.includes("스포츠과"), "'학'을 뗀 어간은 명사 근거가 있을 때만: " + kw.join(","));
  assert.ok(kw.includes("고고학") && kw.includes("독성"), kw.join(","));
}

// 런타임: 영문 키워드는 소문자·단어 앞 경계로 비교, 등장 자리 자체는 창에서 뺀다
{
  const mk = (text, word, sense, extra) => {
    const m = Object.assign({ slug: "p", title_ko: "중독", title_en: "Poisoning", categories: ["ems"], sense, viaHangul: true }, extra);
    m.occurrences = at(text, word);
    m.count = m.occurrences.length;
    applySenseContextRule([m], text, ["사회과학"]);
    return m;
  };
  assert.ok(!mk("청소년의 중독(Poisoning) 사례가 늘었다.", "중독", ["poisoning"]).distant, "영문 병기 대소문자 무시 → 유지");
  assert.strictEqual(mk("청소년의 중독 사례, nonpoisoning 대조군.", "중독", ["poisoning"]).distant, true, "단어 중간 일치는 아님");
  // 영문으로 잡힌 용어는 제 등장 자리만으로 문맥 근거가 되지 않는다
  assert.strictEqual(
    mk("Adolescent poisoning and peer group.", "poisoning", ["poisoning", "antidote"], { viaHangul: false }).distant,
    true, "영문 등장 자체는 근거 아님"
  );
}

// 인덱스 7번째 칸(공백 구분 문자열) 디코드
{
  const [t] = decodeViewerIndex({ categories: ["ems"], terms: [["poisoning", "중독", "Poisoning", [0], 0, 0, "독성 해독제"]] });
  assert.deepStrictEqual(t.sense, ["독성", "해독제"]);
  const [u] = decodeViewerIndex({ categories: ["ems"], terms: [["x", "엑스", "", [0]]] });
  assert.deepStrictEqual(u.sense, []);
}

console.log("sense context: all tests passed");
