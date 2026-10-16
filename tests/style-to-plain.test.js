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
