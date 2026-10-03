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
console.log("diagrams-cycle: all tests passed");
