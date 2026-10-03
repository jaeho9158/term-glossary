// 도식 생성 파이프라인 도구
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");

// ── 분야군: 98개 분야가 정확히 한 번씩 ─────────────────────
{
  const { GROUPS, groupOf } = require("../scripts/diagrams/pipeline/common.js");
  const src = fs.readFileSync(path.join(REPO, "assets", "category-data.js"), "utf8");
  const labels = eval("(" + src.match(/CATEGORY_LABELS\s*=\s*(\{[\s\S]*?\});/)[1] + ")");
  const all = Object.values(GROUPS).flat();
  assert.strictEqual(new Set(all).size, all.length, "분야가 두 군에 들어 있음");
  assert.deepStrictEqual([...all].sort(), Object.keys(labels).sort(), "분야군이 CATEGORY_LABELS와 다름");
  assert.strictEqual(Object.keys(GROUPS).length, 12);
  assert.strictEqual(groupOf(["stat", "psych"]), "stats");
  assert.strictEqual(groupOf("neuro"), "life");
  assert.strictEqual(groupOf(["nope"]), null);
}

// ── 시드 셔플은 재현된다 ───────────────────────────────────
{
  const { shuffle } = require("../scripts/diagrams/pipeline/common.js");
  const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], 42), b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], 42);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual([...a].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.notDeepStrictEqual(shuffle([1, 2, 3, 4, 5, 6, 7, 8], 43), a);
}

// ── 페이지 본문 추출 ───────────────────────────────────────
{
  const { extractPage } = require("../scripts/diagrams/pipeline/page.js");
  const html = [
    '<div class="definition-box">',
    "  <p><strong>한 줄 정의:</strong> 두 변수가 함께 변하는 정도.</p>",
    "</div>",
    "  <!-- concept-diagram:start -->",
    '  <figure class="concept-diagram"><svg><text>무시</text></svg></figure>',
    "  <!-- concept-diagram:end -->",
    "<h2>쉽게 풀면</h2><p>키가 크면 &amp; 몸무게도</p>",
    '<h2>왜 중요한가</h2><p>많이 쓴다</p><figure class="term-figure"><svg></svg></figure>',
    "<h2>논문에서는 이렇게 쓰입니다</h2><p class=\"example\">r = .45</p>",
    "<h2>조금 더 깊게 보면</h2><p>피어슨</p>",
    "<h2>주의할 점</h2><p>인과 아님</p>",
    "<h2>관련 용어</h2><ul><li>회귀</li></ul></article>",
  ].join("\n");
  const p = extractPage(html);
  assert.strictEqual(p.definition, "두 변수가 함께 변하는 정도.");
  assert.strictEqual(p.easy, "키가 크면 & 몸무게도");
  assert.strictEqual(p.usage, "r = .45");
  assert.strictEqual(p.caution, "인과 아님");
  assert.ok(p.hasLegacyFigure && p.hasConceptDiagram);
  assert.ok(!JSON.stringify(p).includes("회귀"), "관련 용어 절은 넣지 않음");

  // 실제 페이지 하나
  const real = extractPage(fs.readFileSync(path.join(REPO, "terms", "correlation.html"), "utf8"));
  for (const k of ["definition", "easy", "why", "usage", "deep", "caution"]) assert.ok(real[k].length > 10, `correlation ${k} 비어 있음`);
}

// ── BM25 ───────────────────────────────────────────────────
{
  const { tokens, BM25 } = require("../scripts/diagrams/pipeline/bm25.js");
  assert.deepStrictEqual(tokens("신경 염증 TNF-a"), ["신경", "염증", "tnf"]);
  assert.deepStrictEqual(tokens("미세아교"), ["미세", "세아", "아교"]);
  const idx = new BM25([
    { id: "a", text: "미세아교세포 활성화 염증", meta: { type: "chain" } },
    { id: "b", text: "회귀 분석 잔차", meta: { type: "plot" } },
    { id: "c", text: "별아교세포 반응 염증 반응", meta: { type: "chain" } },
  ]);
  assert.strictEqual(idx.search("미세아교 염증", { k: 1 })[0].id, "a");
  assert.deepStrictEqual(idx.search("염증", { k: 5, filter: (d) => d.meta.type === "plot" }).map((h) => h.id), ["b"]);
}

// ── 참고 예시: 같은 type·분야군 → type만 → diagrams/examples ──
{
  const { buildIndex, exemplars } = require("../scripts/diagrams/pipeline/retrieve.js");
  const idx = buildIndex();
  assert.ok(idx.N > 1000, "검수 통과 스펙 색인이 비어 있음");
  const ex = exemplars(idx, { slug: "x", type: "chain", group: "life", query: "미세아교세포 염증 활성화" });
  assert.strictEqual(ex.length, 3);
  assert.ok(ex.every((s) => s.type === "chain" && s.reviewed === true));
  const cyc = exemplars(idx, { slug: "x", type: "cycle", group: "life", query: "순환" });
  assert.ok(cyc.length >= 1 && cyc.every((s) => s.type === "cycle"), "cycle은 examples에서라도 1개 이상");
  const self = exemplars(idx, { slug: ex[0].slug, type: "chain", group: "life", query: "미세아교세포 염증 활성화" });
  assert.ok(!self.some((s) => s.slug === ex[0].slug), "자기 자신은 예시에서 뺀다");
}

console.log("diagrams-pipeline: all tests passed");
