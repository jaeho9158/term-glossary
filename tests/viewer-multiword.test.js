// 띄어쓰기가 있는 표제어·흡수 제목(여러 단어 구문) 매칭.
const test = require("node:test");
const assert = require("assert");
const { matchTerms } = require("../assets/term-match.js");

const terms = [
  { slug: "le-chatelier-principle", title_ko: "르샤틀리에 원리", title_en: "Le Chatelier's principle", categories: ["chem"], match_titles: ["평형 이동"] },
  { slug: "equilibrium", title_ko: "평형", title_en: "Equilibrium", categories: ["chem"] },
  { slug: "symbolic-play", title_ko: "상징놀이", title_en: "Symbolic Play", categories: ["edu"], match_titles: ["상징적 놀이"] },
  { slug: "energy-conservation", title_ko: "에너지 보존 법칙", title_en: "Conservation of energy", categories: ["phys"] },
  { slug: "energy-conservation-short", title_ko: "에너지 보존", title_en: "", categories: ["phys"] },
  { slug: "signal-transduction", title_ko: "신호전달", title_en: "signal transduction", categories: ["bio"] },
];
const slugs = (text) => matchTerms(text, terms).map((m) => m.slug);
const find = (text, slug) => matchTerms(text, terms).find((m) => m.slug === slug);

test("띄어쓰기 흡수 제목이 대표 용어로 잡힌다", () => {
  assert.ok(slugs("온도를 올리면 평형 이동 방향이 바뀐다.").includes("le-chatelier-principle"));
  assert.ok(slugs("아동의 상징적 놀이 발달을 관찰했다.").includes("symbolic-play"));
});

test("마지막 낱말에 조사가 붙어도 잡히고, 밑줄은 조사를 뺀 구문만 덮는다", () => {
  const text = "본 연구는 평형 이동은 물론 반응 속도도 다룬다.";
  const m = find(text, "le-chatelier-principle");
  assert.ok(m, "평형 이동은");
  assert.strictEqual(text.substr(m.firstStart, m.firstLength), "평형 이동");
});

test("여러 칸 공백·줄바꿈으로 끊겨도 잡힌다", () => {
  assert.ok(slugs("온도 변화에 따른 평형   이동을 보았다.").includes("le-chatelier-principle"));
  assert.ok(slugs("온도 변화에 따른 평형\n이동을 보았다.").includes("le-chatelier-principle"));
  assert.ok(slugs("We measured signal\r\ntransduction in cells.").includes("signal-transduction"));
});

test("가장 긴 구문을 우선한다", () => {
  const text = "실험은 에너지 보존 법칙을 확인했다.";
  const long = find(text, "energy-conservation");
  assert.ok(long, "긴 표제어가 잡힌다");
  assert.strictEqual(text.substr(long.firstStart, long.firstLength), "에너지 보존 법칙");
  assert.ok(!slugs(text).includes("energy-conservation-short"), "같은 자리의 짧은 구문은 따로 잡지 않는다");
  assert.ok(slugs("에너지 보존이 성립한다.").includes("energy-conservation-short"));
});

test("오탐 방지: 낱말 경계·문장부호·낱말 안 일치는 잡지 않는다", () => {
  // 앞 낱말이 더 긴 낱말의 일부
  assert.ok(!slugs("불평형 이동이 있었다.").includes("le-chatelier-principle"));
  // 뒤 낱말이 조사가 아닌 꼬리를 단 더 긴 낱말
  assert.ok(!slugs("평형 이동성 검사를 했다.").includes("le-chatelier-principle"));
  // 문장부호로 끊긴 두 낱말
  assert.ok(!slugs("결과는 평형. 이동 경로는 달랐다.").includes("le-chatelier-principle"));
  assert.ok(!slugs("평형, 이동, 속도를 보았다.").includes("le-chatelier-principle"));
  // 띄어 쓴 구문 키는 붙여 쓴 표제어("신호전달")를 두 낱말로 잡지 않는다
  assert.ok(!slugs("신호 전달 과정").includes("signal-transduction"));
});

test("구문 전용 일반어·관사 시작 영문 구문은 구문 경로로 잡지 않는다", () => {
  const t2 = [
    { slug: "structural-break", title_ko: "구조적 변화", title_en: "Structural Break", categories: ["stat"] },
    { slug: "the-other", title_ko: "타자", title_en: "the Other", categories: ["philo"] },
    { slug: "social-dominance", title_ko: "사회적 우위", title_en: "social dominance", categories: ["psych"] },
  ];
  const s = (text) => matchTerms(text, t2).map((m) => m.slug);
  assert.ok(!s("수용체에 구조적 변화가 유도된다.").includes("structural-break"));
  assert.ok(!s("and the other six disease sets").includes("the-other"));
  assert.ok(s("사회적 우위 상태가 유지된다.").includes("social-dominance"), "정상 구문은 그대로");
});
