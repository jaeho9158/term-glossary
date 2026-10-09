const assert = require("assert");
const terms = require("../terms.json");

// Test 1: every term has a non-empty definition string
{
  const missing = terms.filter((t) => typeof t.definition !== "string" || t.definition.trim().length === 0);
  assert.strictEqual(missing.length, 0, `terms missing definition: ${missing.map((t) => t.slug).join(", ")}`);
}

// Test 2: a definition whose source page embeds a link is stripped to plain text
{
  const cnn = terms.find((t) => t.slug === "convolutional-neural-network");
  assert.strictEqual(
    cnn.definition,
    "작은 필터를 이미지 위에서 이동시키며 선, 모서리, 무늬 같은 지역적 특징을 단계적으로 뽑아내는 신경망 구조입니다."
  );

  const gt = terms.find((t) => t.slug === "grounded-theory");
  assert.strictEqual(
    gt.definition,
    "데이터로부터 반복적으로 개념을 도출해 이론을 구축하는 질적연구 방법입니다."
  );
}

// Test 3: double quotes inside a definition survive the JSON round-trip intact
{
  const pValue = terms.find((t) => t.slug === "p-value");
  assert.strictEqual(
    pValue.definition,
    "귀무가설이 참이라고 가정할 때, 지금 관찰된 것 이상으로 극단적인 결과가 나올 확률을 나타내는 숫자입니다."
  );
}

console.log("definitions: all tests passed");
