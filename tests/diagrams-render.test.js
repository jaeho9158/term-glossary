// 개념 도식 렌더러: 검증·줄바꿈·4개 type 배치·겹침 검사
const assert = require("assert");
const { textWidth, wrap, validateSpec, renderSpec, renderFigure } = require("../scripts/diagrams/lib.js");

const chain = {
  slug: "microglial-phagocytosis",
  type: "chain",
  mode: "bio",
  nodes: [
    { id: "a", label: "손상 시냅스", color: "rose", sub: "PS 노출" },
    { id: "b", label: "MERTK", color: "violet" },
    { id: "c", label: "미세아교세포", color: "amber", sub: "포식" },
  ],
  edges: [
    { from: "a", to: "b", kind: "arrow", label: "Gas6" },
    { from: "b", to: "c", kind: "arrow" },
    { from: "a", to: "c", kind: "inhibit", label: "CD47" },
  ],
  notes: [{ text: "생체 내 인과는 부분적으로만 입증", tone: "limit" }],
  source: "test",
  reviewed: false,
};

const contrast = {
  slug: "agonist-antagonist",
  type: "contrast",
  axis: "수용체에 결합했을 때",
  nodes: [
    { id: "l0", side: "left", row: 0, label: "작용제", color: "green" },
    { id: "r0", side: "right", row: 0, label: "길항제", color: "rose" },
    { id: "l1", side: "left", row: 1, label: "수용체 활성화" },
    { id: "r1", side: "right", row: 1, label: "활성화 없음" },
  ],
  edges: [],
  source: "test",
  reviewed: false,
};

const hierarchy = {
  slug: "glial-cell",
  type: "hierarchy",
  nodes: [
    { id: "g", label: "신경교세포", color: "gray" },
    { id: "a", label: "별아교세포", color: "green" },
    { id: "m", label: "미세아교세포", color: "amber" },
    { id: "o", label: "희소돌기아교세포", color: "blue" },
  ],
  edges: [
    { from: "g", to: "a", kind: "arrow" },
    { from: "g", to: "m", kind: "arrow" },
    { from: "g", to: "o", kind: "arrow" },
  ],
  source: "test",
  reviewed: false,
};

const procedure = {
  slug: "optogenetics",
  type: "procedure",
  nodes: [
    { id: "1", label: "옵신 유전자 전달", color: "violet", sub: "AAV 벡터" },
    { id: "2", label: "광섬유 삽입", color: "gray" },
    { id: "3", label: "빛 자극", color: "blue", sub: "470 nm" },
    { id: "4", label: "행동 측정", color: "green" },
  ],
  edges: [
    { from: "1", to: "2", kind: "arrow" },
    { from: "2", to: "3", kind: "arrow" },
    { from: "3", to: "4", kind: "arrow" },
  ],
  source: "test",
  reviewed: false,
};

// 글자 폭: 한글이 영문보다 넓고, 굵게가 더 넓다
assert.ok(textWidth("가나다", 13) > textWidth("abc", 13));
assert.ok(textWidth("가나다", 13, true) > textWidth("가나다", 13));

// 줄바꿈: 폭을 넘으면 여러 줄, 각 줄은 폭 안
{
  const lines = wrap("희소돌기아교세포 전구세포 분화 촉진", 80, 13, true);
  assert.ok(lines.length >= 2);
  for (const l of lines) assert.ok(textWidth(l, 13, true) <= 80 + 0.01, `줄이 폭을 넘음: ${l}`);
}

// 검증
for (const s of [chain, contrast, hierarchy, procedure]) {
  assert.deepStrictEqual(validateSpec(s), [], `${s.slug} 검증 실패`);
}
assert.ok(validateSpec({ ...chain, edges: [{ from: "a", to: "zz" }] }).some((e) => e.includes("끝점")));
assert.ok(validateSpec({ ...contrast, nodes: contrast.nodes.slice(0, 3) }).some((e) => e.includes("좌우 행")));
assert.ok(validateSpec({ ...hierarchy, edges: [...hierarchy.edges, { from: "a", to: "g" }] }).some((e) => e.includes("루트") || e.includes("사이클")));
assert.ok(validateSpec(chain, new Set(["other"])).some((e) => e.includes("terms.json에 없는 slug")));

// 4개 type 모두 겹침 경고 없이 렌더되고, 웹 요구사항을 지킨다
for (const s of [chain, contrast, hierarchy, procedure]) {
  for (const o of ["h", "v"]) {
    const r = renderSpec(s, { title: s.slug, orientation: o });
    assert.deepStrictEqual(r.warnings, [], `${s.slug}/${o} 겹침: ${r.warnings.join("; ")}`);
    assert.ok(/viewBox="0 0 \d+ \d+"/.test(r.svg));
    assert.ok(!/<svg[^>]*\swidth=/.test(r.svg), "svg에 width 속성이 있으면 안 됨");
    assert.ok(r.svg.includes("<title") && r.svg.includes("<desc"), "접근성 title/desc 필요");
    assert.ok(!/#[0-9a-fA-F]{6}/.test(r.svg.replace(/<desc[\s\S]*?<\/desc>/, "")), "색은 CSS 변수만 써야 함");
  }
}

// 세로 배치는 가로보다 좁고 길다
{
  const h = renderSpec(procedure, { orientation: "h" });
  const v = renderSpec(procedure, { orientation: "v" });
  assert.ok(v.width < h.width && v.height > h.height);
}

// 선형 도식 figure에는 두 벌, 좁은 hierarchy·contrast는 한 벌
assert.strictEqual((renderFigure(chain, "t").html.match(/<svg/g) || []).length, 2);
assert.strictEqual((renderFigure(hierarchy, "t").html.match(/<svg/g) || []).length, 1);
assert.strictEqual((renderFigure(contrast, "t").html.match(/<svg/g) || []).length, 1);

// 잎이 많아 넓은 hierarchy는 모바일용 아웃라인 세로판을 함께 넣고, 세로판은 좁다
{
  const wide = {
    ...hierarchy,
    nodes: [...hierarchy.nodes, { id: "s", label: "슈반세포" }, { id: "e", label: "위성세포" }],
    edges: [...hierarchy.edges, { from: "g", to: "s", kind: "arrow" }, { from: "g", to: "e", kind: "arrow" }],
  };
  const fig = renderFigure(wide, "t");
  assert.strictEqual((fig.html.match(/<svg/g) || []).length, 2);
  assert.deepStrictEqual(fig.warnings, []);
  assert.ok(renderSpec(wide, { orientation: "v" }).width < 360);
}

// 억제·차단 엣지, desc 문장
{
  const r = renderSpec(chain, { title: "미세아교 포식" });
  assert.ok(r.svg.includes("inh-"), "억제 마커가 있어야 함");
  assert.ok(r.desc.includes("억제"));
  const blocked = renderSpec({ ...chain, edges: [{ from: "a", to: "b", kind: "blocked", label: "차단" }] }, { title: "t" });
  assert.ok(blocked.desc.includes("차단"));
}

// 겹침 검사가 실제로 잡는지: 엣지 라벨을 아주 길게 하면 세로 배치에서 넘치지 않고
// 가로 배치에서 간격이 늘어나야 한다(경고가 아니라 배치로 해결).
{
  const long = { ...procedure, edges: [{ from: "1", to: "2", kind: "arrow", label: "아주 긴 엣지 라벨 문장입니다" }, ...procedure.edges.slice(1)] };
  assert.deepStrictEqual(renderSpec(long, { orientation: "h" }).warnings, []);
}

// 겹침 검사 자체가 겹침을 잡는지(배치가 잘 돼서 실제 스펙에서는 경고가 안 나므로 직접 만든다)
{
  const { Canvas, checkOverlaps } = require("../scripts/diagrams/lib.js");
  const cv = new Canvas("t");
  cv.text(100, 50, "첫 번째 라벨");
  cv.text(110, 52, "두 번째 라벨");
  assert.ok(checkOverlaps(cv).some((w) => w.includes("글자 겹침")));
  const cv2 = new Canvas("t2");
  cv2.rect(0, 0, 40, 30, "blue", "n1");
  cv2.text(20, 20, "박스보다 훨씬 긴 라벨", { owner: "n1" });
  assert.ok(checkOverlaps(cv2).some((w) => w.includes("박스 넘침")));
}

console.log("diagrams-render: all tests passed");

// 되돌이 엣지가 없는 긴 선형 도식은 가로판에서 H_WRAP_W 안으로 줄을 감고, 세로판만 남기지 않는다
{
  const { H_WRAP_W, H_FIT_W } = require("../scripts/diagrams/lib.js");
  const long = {
    ...procedure,
    nodes: Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, label: `단계 ${i + 1} 검토` })),
    edges: Array.from({ length: 8 }, (_, i) => ({ from: `s${i}`, to: `s${i + 1}`, kind: "arrow", label: i === 3 ? "승인" : undefined })),
  };
  const h = renderSpec(long, { orientation: "h" });
  assert.ok(h.width <= H_WRAP_W, `감은 가로판 폭 ${h.width} > ${H_WRAP_W}`);
  assert.ok(h.height > 120, "두 줄 이상이어야 함");
  assert.deepStrictEqual(h.warnings, []);
  assert.ok(h.svg.includes("승인"), "줄을 건너는 엣지 라벨도 그려야 함");
  const fig = renderFigure(long, "t");
  assert.strictEqual((fig.html.match(/<svg/g) || []).length, 2);
  assert.ok(fig.html.includes("dg-dual"));
  // 되돌이 엣지가 있어 감을 수 없고 폭이 H_FIT_W를 넘으면 세로판만 싣는다
  const arc = { ...long, edges: [...long.edges, { from: "s8", to: "s0", kind: "arrow", label: "반복" }] };
  const hh = renderSpec(arc, { orientation: "h" });
  assert.ok(hh.width > H_FIT_W);
  const fig2 = renderFigure(arc, "t");
  assert.strictEqual((fig2.html.match(/<svg/g) || []).length, 1);
  assert.ok(fig2.html.includes("dg-v") && !fig2.html.includes("dg-dual"));
  assert.ok(fig2.html.includes("반복"), "세로판에서도 되돌이 엣지 라벨을 그려야 함");
  assert.deepStrictEqual(fig2.warnings, []);
}
