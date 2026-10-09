const assert = require("assert");
const { validateSpec, renderSpec, renderFigure } = require("../scripts/diagrams/lib.js");

const base = (n) => ({
  slug: "pdca-cycle", type: "cycle", center: "PDCA",
  nodes: ["계획", "실행", "점검", "개선", "표준화", "공유"].slice(0, n).map((l, i) => ({ id: `n${i}`, label: l, color: "blue" })),
  edges: [], source: "test", reviewed: false,
});

for (const n of [3, 4, 5, 6]) {
  const s = base(n);
  assert.deepStrictEqual(validateSpec(s), [], `n=${n}`);
  const r = renderSpec(s, { title: "PDCA" });
  assert.deepStrictEqual(r.warnings, [], `n=${n} 겹침: ${r.warnings.join("; ")}`);
  assert.strictEqual((r.svg.match(/<line /g) || []).length, n, "화살표는 노드 수만큼");
  assert.ok(!/#[0-9a-fA-F]{6}/.test(r.svg.replace(/<desc[\s\S]*?<\/desc>/, "")));
}
assert.ok(validateSpec(base(2)).some((e) => e.includes("3~6")));
assert.ok(validateSpec({ ...base(7), nodes: [...base(6).nodes, { id: "x", label: "추가" }] }).some((e) => e.includes("3~6")));
assert.ok(validateSpec({ ...base(4), edges: [{ from: "n0", to: "n1" }] }).some((e) => e.includes("edges")));

const r = renderSpec(base(4), { title: "PDCA" });
assert.ok(r.desc.includes("다시 계획"));
// 가로판이 343px 이하(짧은 라벨 4개)면 한 벌
assert.strictEqual((renderFigure(base(4), "t").html.match(/<svg/g) || []).length, 1);
// 긴 가운데 글자: 줄바꿈하고 원을 키워 화살표·상자와 닿지 않게
{
  const L = ["데이터 수집 및 전처리 단계", "가설 설정과 연구 설계 수립", "통계적 유의성 검정 수행하기", "결과 해석과 일반화 가능성 검토", "이론 수정 및 후속 연구 제안", "사회적 합의와 제도화 과정"];
  for (const n of [3, 4, 5, 6]) {
    for (const center of ["과학적 연구의 순환 과정", "과학적 방법론에 기반한 연구의 순환 과정 전체", "물 순환"]) {
      const s = { ...base(n), center, nodes: L.slice(0, n).map((l, i) => ({ id: `n${i}`, label: l, sub: i % 2 ? "세부 설명 문구 열두 글자" : undefined })) };
      const r = renderSpec(s, { title: "t" });
      assert.deepStrictEqual(r.warnings, [], `n=${n} ${center}: ${r.warnings.join("; ")}`);
      // 가운데 글자 줄은 110px 폭 안에서 감긴다
      const lines = [...r.svg.matchAll(/<text[^>]*fill="var\(--dg-general\)">([^<]*)</g)].map((m) => m[1]);
      assert.ok(lines.length >= 1 && lines.join(" ").replace(/\s+/g, "") === center.replace(/\s+/g, ""), lines.join("|"));
      const { textWidth, FS } = require("../scripts/diagrams/core.js");
      for (const l of lines) assert.ok(textWidth(l, FS, true) <= 110 || !l.includes(" "), l);
    }
  }
}
// 휴대폰판: 343px 폭 한 열, 가운데 글자는 맨 위, 노드 수만큼 화살표(사이 n-1 + 되돌림 1)
for (const n of [3, 4, 5, 6]) {
  const s = base(n);
  const v = renderSpec(s, { title: "PDCA", orientation: "v" });
  assert.strictEqual(v.width, 343);
  assert.deepStrictEqual(v.warnings, [], `n=${n} v: ${v.warnings.join("; ")}`);
  assert.strictEqual((v.svg.match(/<line /g) || []).length, n - 1, "아래 화살표");
  assert.strictEqual((v.svg.match(/<path [^>]*fill="none"/g) || []).length, 1, "되돌림 화살표");
  const c = v.texts.find((t) => t.owner === "center");
  assert.ok(c && v.boxes.every((b) => c.y + c.h <= b.y), "가운데 글자가 노드 위에");
  assert.ok(v.texts.every((t) => (t.fs || 13) >= 11), "글자 11px 이상(1:1)");
}
// 가로판이 343px보다 넓을 때만 두 벌
{
  const wide = base(6);
  assert.ok(renderSpec(wide, { title: "t" }).width > 343);
  assert.strictEqual((renderFigure(wide, "t").html.match(/<svg/g) || []).length, 2);
}
console.log("diagrams-cycle: all tests passed");
