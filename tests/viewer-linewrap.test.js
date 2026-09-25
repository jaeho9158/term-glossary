// 줄바꿈에 잘린 낱말 조각은 용어로 치지 않는다(오탐 감축 D단계).
// PDF 추출 텍스트는 줄 끝에서 낱말을 그냥 끊는다: "단\n백질"(단백질)의
// "백질"이 백질(white matter)로, "fac-\ntor"의 "tor"가 토르(지형)로 잡혔다.
const assert = require("assert");
const { matchTerms, isLineWrapFragment } = require("../assets/viewer.js");

// 앞 줄이 한 글자 한글 조각으로 끝나면 다음 줄 첫 낱말은 조각이다
{
  const text = "유전자 발현이나 단\n백질 형성";
  assert.ok(isLineWrapFragment(text, text.indexOf("백질")));
}
// 앞 줄 끝이 흔한 한 글자 낱말(및·등·수 …)이면 조각이 아니다
{
  const text = "혈압 및\n백질 변화";
  assert.ok(!isLineWrapFragment(text, text.indexOf("백질")));
}
// 앞 줄 끝이 두 글자 이상 낱말이면 줄바꿈이 띄어쓰기 자리다
{
  const text = "마약 중독\n예방과 치료";
  assert.ok(!isLineWrapFragment(text, text.indexOf("예방")));
}
// 영문 하이픈 줄넘김: 뒤 조각도, 앞 조각도 낱말이 아니다
{
  const text = "transcription fac-\ntor 1 and po-\npulation drift";
  assert.ok(isLineWrapFragment(text, text.indexOf("tor 1")));
  assert.ok(isLineWrapFragment(text, text.indexOf("fac-")));
  assert.ok(isLineWrapFragment(text, text.indexOf("po-")));
  assert.ok(!isLineWrapFragment(text, text.indexOf("drift")));
}
// 문장 속 하이픈 낱말(t-test)은 건드리지 않는다
{
  const text = "we used a t-test here";
  assert.ok(!isLineWrapFragment(text, text.indexOf("t-test")));
}

// 앞 줄 끝이 떨어진 조사(의·를·을 …)면 줄바꿈은 띄어쓰기 자리다
{
  const text = "GWAS 의\n유전형 분석";
  assert.ok(!isLineWrapFragment(text, text.indexOf("유전형")));
}
// CRLF 줄바꿈(텍스트 모드 입력)에서도 같은 판정
{
  const crlf = "GWAS 의\r\n유전형 분석";
  assert.ok(!isLineWrapFragment(crlf, crlf.indexOf("유전형")));
  const frag = "유전자 발현이나 단\r\n백질 형성";
  assert.ok(isLineWrapFragment(frag, frag.indexOf("백질")));
  const en = "transcription fac-\r\ntor 1";
  assert.ok(isLineWrapFragment(en, en.indexOf("tor 1")));
  assert.ok(isLineWrapFragment(en, en.indexOf("fac-")));
}

// matchTerms 경로
{
  const terms = [
    { slug: "white-matter", title_ko: "백질", title_en: "white matter", categories: ["neuro"] },
    { slug: "tor", title_ko: "토르", title_en: "Tor", categories: ["geo"] },
  ];
  assert.deepStrictEqual(matchTerms("발현이나 단\n백질 형성", terms).map((m) => m.slug), []);
  assert.deepStrictEqual(matchTerms("대뇌 백질 변화", terms).map((m) => m.slug), ["white-matter"]);
  const gt = [{ slug: "genotype", title_ko: "유전형", title_en: "genotype", categories: ["bio"] }];
  assert.deepStrictEqual(matchTerms("GWAS 의\n유전형", gt).map((m) => m.slug), ["genotype"]);
  assert.deepStrictEqual(matchTerms("GWAS 의\r\n유전형", gt).map((m) => m.slug), ["genotype"]);
}

console.log("line-wrap fragment: all tests passed");
