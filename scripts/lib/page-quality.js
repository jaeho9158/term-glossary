// 용어 페이지 분량 기준. 새 페이지가 "섹션은 있지만 한두 줄뿐인" 얇은 상태로
// 들어오지 않게 테스트(tests/term-page-quality.test.js)에서 쓴다.
"use strict";

const MIN_BODY_CHARS = 700; // 제목부터 '관련 용어' 앞까지 본문 글자 수(태그 제외)
const MIN_EXAMPLES = 2; // "논문에서는 이렇게 쓰입니다" 예문 수
const REQUIRED_H2 = ["쉽게 풀면", "왜 중요한가", "논문에서는 이렇게 쓰입니다", "조금 더 깊게 보면", "주의할 점"];

function checkPage(html) {
  const problems = [];
  const main = /<main[\s\S]*?(?=<h2>관련 용어<\/h2>|<\/main>)/.exec(html);
  if (!main) return ["본문(main)을 찾지 못함"];
  // 도식·개념 계통 블록은 자동 삽입물이라 분량에서 뺀다.
  const body = main[0]
    .replace(/<!-- concept-[a-z]+:start -->[\s\S]*?<!-- concept-[a-z]+:end -->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ");
  if (body.length < MIN_BODY_CHARS) problems.push(`본문 ${body.length}자 < ${MIN_BODY_CHARS}자`);
  const examples = (main[0].match(/class="example"/g) || []).length;
  if (examples < MIN_EXAMPLES) problems.push(`예문 ${examples}개 < ${MIN_EXAMPLES}개`);
  for (const h of REQUIRED_H2) if (!main[0].includes(`<h2>${h}</h2>`)) problems.push(`'${h}' 섹션 없음`);
  return problems;
}

module.exports = { checkPage, MIN_BODY_CHARS, MIN_EXAMPLES, REQUIRED_H2 };
