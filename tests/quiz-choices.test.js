// buildChoiceOptions: 객관식 보기 구성. 원래 nextQuestion 안의 while 루프로,
// 풀에 서로 다른 보기가 4개 미만이면 무한 루프에 빠질 수 있었다 — 순수 함수로
// 분리하면서 시도 상한을 두었고, 그 계약을 여기서 고정한다.
const assert = require("assert");
const { buildChoiceOptions } = require("../assets/quiz-core.js");

const pool = [
  { title_ko: "유의확률", definition: "정의A" },
  { title_ko: "상관관계", definition: "정의B" },
  { title_ko: "분산분석", definition: "정의C" },
  { title_ko: "회귀분석", definition: "정의D" },
  { title_ko: "표본크기", definition: "정의E" },
];

// 정상: 정답 1개 + 오답 3개 = 4개, 정답은 항상 첫 자리(셔플은 호출부 책임)
{
  const opts = buildChoiceOptions("정답용어", pool, "definition");
  assert.strictEqual(opts.length, 4);
  assert.strictEqual(opts[0], "정답용어");
  assert.strictEqual(new Set(opts).size, 4, "중복 보기 금지");
}

// 정상: mode에 따라 보기 소스가 바뀐다 (definition→용어명, term→정의)
{
  const rand = () => 0; // 항상 pool[0]
  const a = buildChoiceOptions("x", pool.slice(0, 1), "definition", rand);
  assert.ok(a.includes("유의확률"));
  const b = buildChoiceOptions("x", pool.slice(0, 1), "term", rand);
  assert.ok(b.includes("정의A"));
}

// 경계: 정답과 같은 문자열은 오답으로 다시 들어가지 않는다
{
  const opts = buildChoiceOptions("유의확률", pool, "definition");
  assert.strictEqual(opts.filter((o) => o === "유의확률").length, 1);
}

// 경계: 풀에 서로 다른 보기가 4개 미만이면 무한 루프 대신 있는 만큼만 반환
{
  const tiny = [{ title_ko: "하나" }, { title_ko: "둘" }];
  const opts = buildChoiceOptions("정답", tiny, "definition");
  assert.ok(opts.length >= 1 && opts.length <= 3);
  assert.strictEqual(opts[0], "정답");
}

// 실패: 보기 값이 비어 있는 항목(definition 없음 등)은 건너뛴다
{
  const holey = [{ title_ko: "하나" }, {}, { title_ko: "둘" }, { title_ko: "셋" }];
  const opts = buildChoiceOptions("정답", holey, "definition");
  assert.ok(!opts.includes(undefined) && !opts.includes(""));
}

console.log("quiz-choices: all tests passed");
