"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { convertText, convertHtml, newLexicon, addToLexicon } = require("../scripts/style/to-plain.js");

// 테스트용 어휘: 말뭉치에서 이미 해라체로 쓰인 문장
const lex = newLexicon();
addToLexicon(
  lex,
  [
    "이 값은 매우 크다.", "표본이 작다.", "결과가 중요하다.", "연구가 필요하다.", "이 방법은 유용하다.",
    "그는 학교에 간다.", "연구자가 자료를 분석한다.", "표본을 모은다.", "이를 만든다.", "나타난다.", "먹는다.", "받는다.",
    "범위가 길다.", "분산이 크다.", "추정한다.", "측정한다.", "가정한다.", "넓다.", "받는다.", "읽는다.", "읽는 것이다.",
  ].join("\n")
);
const conv = (s) => convertText(s, lex).text;
const tier = (s) => convertText(s, lex).edits.map((e) => e.tier + ":" + e.rule);

test("이다: 받침 유무와 무관하게 입니다 -> 이다", () => {
  assert.strictEqual(conv("이것은 기준입니다."), "이것은 기준이다.");
  assert.strictEqual(conv("쓰기 편한 도구입니다."), "쓰기 편한 도구이다.");
  assert.strictEqual(conv("그래서 생긴 것입니다."), "그래서 생긴 것이다.");
  assert.strictEqual(conv("작동하기 때문입니다."), "작동하기 때문이다.");
  assert.strictEqual(conv("효과가 아닙니다."), "효과가 아니다.");
});

test("있다 / 없다 / ㄹ 수 있다", () => {
  assert.strictEqual(conv("활용할 수 있습니다."), "활용할 수 있다.");
  assert.strictEqual(conv("알 수 없습니다."), "알 수 없다.");
  assert.strictEqual(conv("관계가 있습니다."), "관계가 있다.");
});

test("과거·추측", () => {
  assert.strictEqual(conv("검정하였습니다."), "검정하였다.");
  assert.strictEqual(conv("결과가 달라졌습니다."), "결과가 달라졌다.");
  assert.strictEqual(conv("그렇게 했습니다."), "그렇게 했다.");
  assert.strictEqual(conv("달라지겠습니다."), "달라지겠다.");
});

test("합니다 / 됩니다 (동사)", () => {
  assert.strictEqual(conv("자료를 분석합니다."), "자료를 분석한다.");
  assert.strictEqual(conv("확인해야 합니다."), "확인해야 한다.");
  assert.strictEqual(conv("이렇게 불립니다.").includes("불립니다"), true); // 어휘에 없는 ㅂ니다 -> C
  assert.strictEqual(conv("무시하게 됩니다."), "무시하게 된다.");
});

test("합니다: X하다 형용사는 하다, 동사는 한다 (어휘 기반)", () => {
  assert.strictEqual(conv("표본 크기가 중요합니다."), "표본 크기가 중요하다.");
  assert.strictEqual(conv("추가 검토가 필요합니다."), "추가 검토가 필요하다.");
  assert.strictEqual(conv("모형을 추정합니다."), "모형을 추정한다.");
  assert.deepStrictEqual(tier("그것은 미상합니다."), ["C:ha-ambiguous"]);
});

test("ㅂ니다: 동사 갑니다->간다, 형용사 큽니다->크다", () => {
  assert.strictEqual(conv("학교에 갑니다."), "학교에 간다.");
  assert.strictEqual(conv("값이 큽니다."), "값이 크다.");
  assert.strictEqual(conv("패턴이 나타납니다."), "패턴이 나타난다.");
  assert.strictEqual(conv("범위가 깁니다."), "범위가 길다.");
  assert.strictEqual(conv("틀을 만듭니다."), "틀을 만든다.");
});

test("습니다: 동사 먹습니다->먹는다, 형용사 작습니다->작다", () => {
  assert.strictEqual(conv("표본이 작습니다."), "표본이 작다.");
  assert.strictEqual(conv("범위가 넓습니다."), "범위가 넓다.");
  assert.strictEqual(conv("값을 받습니다."), "값을 받는다.");
  assert.strictEqual(conv("글을 읽습니다."), "글을 읽는다.");
  assert.deepStrictEqual(tier("흔치 않게 곱습니다."), ["C:seumnida-ambiguous"]);
});

test("지 않습니다: 동사 -> 않는다, 형용사 -> 않다", () => {
  assert.strictEqual(conv("값을 받지 않습니다."), "값을 받지 않는다.");
  assert.strictEqual(conv("분포가 크지 않습니다."), "분포가 크지 않다.");
  assert.strictEqual(conv("표본이 작지 않습니다."), "표본이 작지 않다.");
  assert.strictEqual(conv("충분하지 않습니다."), "충분하지 않다.");
  assert.strictEqual(conv("분석하지 않습니다."), "분석하지 않는다.");
  assert.strictEqual(conv("차이가 있지 않습니다."), "차이가 있지 않다.");
  assert.deepStrictEqual(tier("안다고 믿지 않습니다."), ["C:anh-ambiguous"]);
});

test("-어지다: 해집니다 -> 해진다", () => {
  assert.strictEqual(conv("값이 높아집니다."), "값이 높아진다.");
  assert.strictEqual(conv("판단이 어려워집니다.").includes("어려워진다"), true);
});

test("경어·의문·명령·청유·요청은 변환하지 않는다 (등급 C)", () => {
  assert.deepStrictEqual(tier("확인하십니다."), ["C:honorific"]);
  assert.deepStrictEqual(tier("이렇게 됩니까?"), ["C:question"]);
  assert.deepStrictEqual(tier("원문을 확인하십시오."), ["C:imperative-or-suggestion"]);
  assert.deepStrictEqual(tier("함께 봅시다."), ["C:imperative-or-suggestion"]);
  assert.deepStrictEqual(tier("확인해 주세요."), ["C:imperative-or-suggestion"]);
  assert.deepStrictEqual(tier("참고하시기 바랍니다."), ["C:request-baramnida"]);
  assert.strictEqual(conv("확인하십시오."), "확인하십시오.");
});

test("연결 -ㅂ니다만 / -지만", () => {
  assert.deepStrictEqual(tier("작습니다만 중요합니다."), ["C:connective-man", "A:ha-adj"]);
  assert.strictEqual(conv("작지만 중요합니다."), "작지만 중요하다.");
  assert.strictEqual(conv("합니다만 또 있습니다.").startsWith("합니다만"), true);
});

test("문장 중간 -ㅂ니다 (쉼표 뒤)는 변환하지 않는다", () => {
  assert.deepStrictEqual(tier("값이 큽니다, 그러나 작습니다."), ["C:internal-comma", "A:adj-seumnida"]);
});

test("해요체", () => {
  assert.strictEqual(conv("뜻이에요."), "뜻이다.");
  assert.strictEqual(conv("도구예요."), "도구이다.");
  assert.strictEqual(conv("그게 아니에요."), "그게 아니다.");
  assert.strictEqual(conv("충분히 있어요."), "충분히 있다.");
  assert.strictEqual(conv("많이 썼어요."), "많이 썼다.");
  assert.strictEqual(conv("값을 분석해요."), "값을 분석한다.");
  assert.strictEqual(conv("매우 중요해요."), "매우 중요하다.");
  assert.strictEqual(conv("자료를 먹어요.").includes("먹는다"), true);
  assert.strictEqual(conv("값이 좋아요.").includes("좋"), true);
  assert.deepStrictEqual(tier("정말 그렇죠."), ["C:yo-pragmatic"]);
});

test("따옴표 안과 .example / blockquote / 제목은 건드리지 않는다", () => {
  assert.strictEqual(conv("논문은 “이 값은 매우 큽니다.”라고 썼습니다."), "논문은 “이 값은 매우 큽니다.”라고 썼다.");
  assert.strictEqual(conv('그는 "갑니다."라고 했습니다.'), '그는 "갑니다."라고 했다.');
  const h = '<div class="example">"본 연구는 분석합니다."</div><blockquote>필요합니다.</blockquote><h2>이렇게 쓰입니다</h2><p>중요합니다.</p>';
  assert.strictEqual(convertHtml(h, lex).html, h.replace("중요합니다", "중요하다"));
});

test("태그 사이 어미는 노드 안에서만 바꾸고 문맥은 태그를 넘어 읽는다", () => {
  assert.strictEqual(conv("<p>핵심은 <strong>표본</strong>입니다.</p>"), "<p>핵심은 <strong>표본</strong>이다.</p>");
  assert.strictEqual(conv("<p><strong>중요</strong>합니다.</p>"), "<p><strong>중요</strong>하다.</p>");
});

test("이미 해라체인 문장은 그대로", () => {
  const s = "이것은 기준이다. 값을 분석한다.";
  assert.strictEqual(conv(s), s);
});

// ---- 2차: 동사 어간 X이 + ㅂ니다, 불규칙 ----
const lex2 = newLexicon();
addToLexicon(
  lex2,
  [
    "널리 쓰인다.", "눈에 보인다.", "책상 위에 놓인다.", "눈이 쌓인다.", "사람이 모인다.", "값을 줄인다.", "값을 줄여 쓴다.", "먹이를 먹인다.",
    "줄을 선다.", "줄의 길이가 길다.", "줄을 그린다.", "줄의 수를 센다.", "빠르다.", "다르다.", "어렵다.", "쉽다.", "깊다.", "길다.", "달다.",
    "집을 짓는다.", "일이 난다.", "비가 온다.", "문을 닫는다.", "잠깐 둔다.", "책을 준다.", "그림을 본다.", "가까워진다.", "나이가 든다.", "만든다.", "그 일을 안다.",
    "정확하지 않다.", "분석한다.", "필요하다.",
  ].join("\n")
);
const c2 = (s) => convertText(s, lex2).text;
const t2 = (s) => convertText(s, lex2).edits.map((e) => e.tier + ":" + e.rule);

test("X이 동사 어간 + 입니다: 쓰입니다 -> 쓰인다, 기준입니다 -> 기준이다", () => {
  assert.strictEqual(c2("널리 쓰입니다."), "널리 쓰인다.");
  assert.strictEqual(c2("눈에 잘 보입니다."), "눈에 잘 보인다.");
  assert.strictEqual(c2("위에 놓입니다."), "위에 놓인다.");
  assert.strictEqual(c2("눈이 쌓입니다."), "눈이 쌓인다.");
  assert.strictEqual(c2("사람이 모입니다."), "사람이 모인다.");
  assert.strictEqual(c2("기준입니다."), "기준이다.");
  assert.strictEqual(c2("도구입니다."), "도구이다.");
  assert.deepStrictEqual(t2("값을 줄입니다."), ["C:ida-vs-verb-i-ambiguous"]); // 줄(명사)+입니다 와 구분 불가
});

test("-지다 / 가다·오다·나다·두다·주다·보다", () => {
  assert.strictEqual(c2("가까워집니다."), "가까워진다.");
  assert.strictEqual(c2("거리가 멀어집니다."), "거리가 멀어진다.");
  assert.strictEqual(c2("일이 납니다."), "일이 난다.");
  assert.strictEqual(c2("비가 옵니다."), "비가 온다.");
  assert.strictEqual(c2("학교에 갑니다."), "학교에 간다.");
  assert.strictEqual(c2("잠깐 둡니다."), "잠깐 둔다.");
  assert.strictEqual(c2("책을 줍니다."), "책을 준다.");
  assert.strictEqual(c2("그림을 봅니다."), "그림을 본다.");
  assert.deepStrictEqual(t2("하지 맙니다."), ["C:mal-da"]);
});

test("형용사 큽니다/빠릅니다는 -다, ㄹ탈락 만듭니다->만든다, 깁니다->길다", () => {
  assert.strictEqual(c2("속도가 빠릅니다."), "속도가 빠르다.");
  assert.strictEqual(c2("결과가 다릅니다."), "결과가 다르다.");
  assert.strictEqual(c2("틀을 만듭니다."), "틀을 만든다.");
  assert.strictEqual(c2("범위가 깁니다."), "범위가 길다.");
  assert.deepStrictEqual(t2("과일이 답니다."), ["C:hearsay-dapnida"]);
});

test("ㅂ 불규칙 형용사: 어렵습니다/쉽습니다/깊습니다 -> 어렵다/쉽다/깊다, 르/ㅂ 활용 해요는 C", () => {
  assert.strictEqual(c2("해석이 어렵습니다."), "해석이 어렵다.");
  assert.strictEqual(c2("계산이 쉽습니다."), "계산이 쉽다.");
  assert.strictEqual(c2("골이 깊습니다."), "골이 깊다.");
  assert.deepStrictEqual(t2("해석이 어려워요."), ["C:yo-other"]);
  assert.deepStrictEqual(t2("값이 달라요."), ["C:yo-other"]);
});

test("어휘 증거가 엇갈리면 C (동사/형용사 모두 관찰된 어간)", () => {
  const l = newLexicon();
  addToLexicon(l, "그는 변한다.\n그것은 변하다.\n");
  assert.deepStrictEqual(convertText("값이 변합니다.", l).edits.map((e) => e.tier), ["C"]);
});

// ---- 3차: 동형어(적다/맞다/낫다), 못하다, 템플릿 ----
test("적습니다: 주격이면 형용사, 목적격이면 동사, 조사 없으면 C", () => {
  assert.strictEqual(c2("사례가 적습니다."), "사례가 적다.");
  assert.strictEqual(c2("표본도 적습니다."), "표본도 적다.");
  assert.strictEqual(c2("메모를 적습니다."), "메모를 적는다.");
  assert.strictEqual(c2("이름을 표에 적습니다."), "이름을 표에 적는다.");
  assert.deepStrictEqual(t2("여기에 적습니다."), ["C:homograph-no-particle"]);
  assert.strictEqual(c2("사례가 적지 않습니다."), "사례가 적지 않다.");
  assert.strictEqual(c2("값을 적지 않습니다."), "값을 적지 않는다.");
});

test("맞습니다/낫습니다 동형어", () => {
  assert.strictEqual(c2("이 설명이 맞습니다."), "이 설명이 맞다.");
  assert.strictEqual(c2("공을 맞습니다."), "공을 맞는다.");
  assert.strictEqual(c2("후자가 낫습니다."), "후자가 낫다.");
  assert.deepStrictEqual(t2("조건에 맞습니다."), ["C:homograph-no-particle"]);
});

test("못합니다: 비교/만 못하다는 형용사, 지 못하다는 동사", () => {
  assert.strictEqual(c2("A가 B보다 못합니다."), "A가 B보다 못하다.");
  assert.strictEqual(c2("전체만 못합니다."), "전체만 못하다.");
  assert.strictEqual(c2("확인하지 못합니다."), "확인하지 못한다.");
  assert.strictEqual(c2("잘 못합니다."), "잘 못한다.");
});

test("템플릿 문장은 opts.templates 로 제외한다", () => {
  const s = "<p>아직 수집하지 못했습니다. 곧 싣겠습니다.</p>";
  const r = convertHtml(s, lex2, { templates: new Set(["아직 수집하지 못했습니다."]) });
  assert.strictEqual(r.html, "<p>아직 수집하지 못했습니다. 곧 싣겠다.</p>");
  assert.deepStrictEqual(r.edits.map((e) => e.tier), ["T", "A"]);
});
