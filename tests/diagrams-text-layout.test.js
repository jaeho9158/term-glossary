// 도식 글자 배치: 줄바꿈 후보, 노드 박스 자동 크기, 주석 꼬리표 분리, 감사 스크립트
const assert = require("assert");
const core = require("../scripts/diagrams/core.js");
const { renderSpec } = require("../scripts/diagrams/lib.js");
const { auditOne } = require("../scripts/diagrams/audit-text.js");

// 1) 가운뎃점 뒤에서 끊고, 단어 중간은 끊지 않는다
assert.deepStrictEqual(core.wrap("만성질환·급성출혈", 90, 13, true), ["만성질환·", "급성출혈"]);
assert.deepStrictEqual(core.wrap("Disability", 132, 11.5), ["Disability"]);
assert.deepStrictEqual(core.wrap("1,000/2,000", 400, 13), ["1,000/2,000"]);
// 숫자 사이 쉼표는 끊을 자리가 아니다
assert.ok(core.pieces("1,000").length === 1);
// 조각 하나가 칸보다 길면 최후 수단으로 글자 단위 분할
assert.ok(core.wrap("가나다라마바사아자차카타파하", 40, 13).length > 1);
// 이어 붙이는 조각은 공백 없이, 공백으로 나뉜 조각은 공백 하나로
assert.deepStrictEqual(core.wrap("심층 전략·자기조절", 400, 13), ["심층 전략·자기조절"]);

// 2) 노드: 10자 한글 라벨도 단어 중간에서 끊기지 않고(칸 확대), 글자는 11px 아래로 안 내려간다
for (const label of ["만성질환급성출혈증", "항생제내성균감염증", "신경인지장애평가"]) {
  const m = core.measureNode({ id: "a", label, sub: "대표 원인" });
  assert.strictEqual(m.labelLines.length, 1, label);
  assert.ok(m.fsL >= core.FS_FLOOR && m.fsS >= core.FS_FLOOR);
}
{
  const m = core.measureNode({ id: "a", label: "아주아주아주아주긴한글라벨이이어집니다", sub: "x" });
  assert.ok(m.fsL >= core.FS_FLOOR, "글자 크기 바닥");
}
// 줄 수: 라벨 2줄·전체 3줄 이내를 먼저 시도한다
{
  const m = core.measureNode({ id: "a", label: "급성 관상동맥증후군", sub: "불안정 협심증과 심근경색" });
  assert.ok(m.labelLines.length + m.subLines.length <= 3, JSON.stringify(m.labelLines.concat(m.subLines)));
}

// 3) 주석: 꼬리표("한계")는 따로 그려지고 본문과 간격이 있다. 줄이 바뀌어도 내어쓰기
{
  const spec = {
    slug: "t", type: "chain", source: "t", reviewed: false,
    nodes: [{ id: "a", label: "가" }, { id: "b", label: "나" }],
    edges: [{ from: "a", to: "b" }],
    notes: [{ text: "투입 순서는 이론에 근거해 미리 정한다. 데이터를 본 뒤에 바꾸면 안 된다는 점을 꼭 기억해야 한다", tone: "limit" }],
  };
  const r = renderSpec(spec, { title: "t", orientation: "v" });
  const tag = r.texts.find((t) => t.owner === "note-tag");
  const body = r.texts.filter((t) => t.owner === "note").sort((a, b) => a.base - b.base);
  assert.strictEqual(tag.label, "한계");
  assert.ok(body.length >= 2);
  assert.ok(body[0].x - (tag.x + tag.w) >= 5, "꼬리표와 본문 사이 간격");
  assert.strictEqual(body[0].x, body[1].x, "내어쓰기: 둘째 줄도 본문 시작 위치에 맞춤");
  assert.ok(!/한계\s/.test(body[0].label));
  assert.deepStrictEqual(auditOne(spec, "t").filter((f) => f.problem === "label_run_together"), []);
}

// 4) 감사 스크립트: 가운뎃점 뒤 끊김·긴 영문 단어는 단어 중간 끊김으로 세지 않는다
{
  const spec = {
    slug: "t", type: "chain", source: "t", reviewed: false,
    nodes: [{ id: "a", label: "만성질환·급성출혈", sub: "Disability" }, { id: "b", label: "나" }],
    edges: [{ from: "a", to: "b" }],
  };
  assert.deepStrictEqual(auditOne(spec, "t").filter((f) => f.problem === "midword"), []);
}
console.log("diagrams-text-layout: all tests passed");
