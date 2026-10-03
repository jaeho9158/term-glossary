// 참고 예시(PaperBanana의 Retriever): 검수 통과(reviewed:true) 스펙 중 정의가 비슷한 것.
// 우선순위: 같은 type·같은 분야군 → 같은 type → diagrams/examples의 같은 type 예시.
"use strict";
const fs = require("fs");
const path = require("path");
const { SPEC_DIR, EXAMPLE_DIR, loadTerms, groupOf } = require("./common.js");
const { BM25 } = require("./bm25.js");

function readSpecs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

function buildIndex() {
  const terms = new Map(loadTerms().map((t) => [t.slug, t]));
  const docs = [];
  for (const spec of readSpecs(SPEC_DIR)) {
    if (spec.reviewed !== true) continue;
    const t = terms.get(spec.slug);
    if (!t) continue;
    docs.push({ id: spec.slug, text: `${t.title_ko} ${t.title_en || ""} ${t.definition || ""}`, meta: { type: spec.type, group: groupOf(t.categories), spec } });
  }
  const idx = new BM25(docs);
  idx.examples = readSpecs(EXAMPLE_DIR);
  return idx;
}

function exemplars(idx, { slug, type, group, query, k = 3 }) {
  const picked = [];
  const take = (hits) => { for (const h of hits) if (picked.length < k && !picked.some((p) => p.slug === h.meta.spec.slug)) picked.push(h.meta.spec); };
  const base = (d) => d.id !== slug && d.meta.type === type;
  take(idx.search(query, { k, filter: (d) => base(d) && d.meta.group === group }));
  if (picked.length < k) take(idx.search(query, { k: k * 2, filter: base }));
  for (const ex of idx.examples) if (picked.length < k && ex.type === type) picked.push(ex);
  return picked;
}

module.exports = { buildIndex, exemplars };
