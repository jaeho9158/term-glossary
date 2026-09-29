// Phase 5 → 6: 체크리스트 db 덤프 → data/prune/approved.json
// 입력(--in <dump.json>): ArtifactData list 결과. 배열([{id|doc_id, ...필드} 또는 {id, data:{...}}]),
//   {docs:[...]}, 또는 {<id>: {...}} 형태를 모두 받는다. prune_groups 문서만 본다.
// 규칙: 문서 decision이 "none"/"reject"면 건너뜀. "approve"면 items 중 decision!=="reject" 전부,
//   "partial"이면 items[].decision==="approve"만. review 문서는 items[].choice가 "prune"/"absorb"인 것만
//   (choice 기본 "keep"). merge 문서의 keeper 행과 review의 "keep"은 적용 대상이 아니다.
// 출력: {merge:[{keeper,absorb:[]}], prune:[{slug,redirect}]}
// 사용: node scripts/prune/export-approved.js --in <dump.json> [--out <approved.json>]
const fs = require("fs");
const path = require("path");
const lib = require("./lib.js");

function normalizeDump(dump) {
  let list;
  if (Array.isArray(dump)) list = dump;
  else if (dump && Array.isArray(dump.docs)) list = dump.docs;
  else list = Object.entries(dump || {}).map(([id, v]) => ({ id, ...v }));
  return list.map((d) => {
    const id = d.id || d.doc_id;
    const body = d.data && typeof d.data === "object" ? d.data : d;
    return { id, ...body };
  }).filter((d) => d.id && d.kind && Array.isArray(d.items));
}

function exportApproved(dump) {
  const merge = new Map();
  const prune = new Map();
  const addAbsorb = (keeper, slug) => {
    if (!merge.has(keeper)) merge.set(keeper, new Set());
    merge.get(keeper).add(slug);
  };
  for (const doc of normalizeDump(dump)) {
    if (doc.decision !== "approve" && doc.decision !== "partial") continue;
    for (const it of doc.items) {
      const selected = doc.decision === "approve" ? it.decision !== "reject" : it.decision === "approve";
      if (!selected) continue;
      if (doc.kind === "merge") {
        if (it.role === "absorb" && it.redirect) addAbsorb(it.redirect, it.slug);
      } else if (doc.kind === "prune") {
        if (it.role === "prune") prune.set(it.slug, it.redirect);
      } else if (doc.kind === "review") {
        if (it.choice === "prune") prune.set(it.slug, it.redirect);
        else if (it.choice === "absorb" && it.redirect) addAbsorb(it.redirect, it.slug);
      }
    }
  }
  return {
    merge: [...merge.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([keeper, s]) => ({ keeper, absorb: [...s].sort() })),
    prune: [...prune.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([slug, redirect]) => ({ slug, redirect })),
  };
}

function main() {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const input = arg("--in");
  if (!input) { console.error("usage: node scripts/prune/export-approved.js --in <dump.json> [--out <approved.json>]"); process.exit(1); }
  const out = arg("--out") ? path.resolve(arg("--out")) : path.join(lib.PRUNE_DIR, "approved.json");
  const approved = exportApproved(JSON.parse(fs.readFileSync(path.resolve(input), "utf8")));
  fs.writeFileSync(out, JSON.stringify(approved, null, 1) + "\n");
  console.log(`approved: merge ${approved.merge.length}그룹, prune ${approved.prune.length}개`);
}

if (require.main === module) main();

module.exports = { exportApproved, normalizeDump };
