#!/usr/bin/env node
// 도식 생성 배치 도구. LLM은 부르지 않는다 — 에이전트가 읽을 입력 묶음을 쓰고, 에이전트 출력을 검증해 반영한다.
//
//   batch.js new <n> --size 200 --order popular|random --seed 1 [--prune-dir <data/prune 경로>]
//   batch.js triage-in <n>        → batches/<n>/triage/in-XX.json (50개씩)
//   batch.js triage-apply <n>     ← batches/<n>/triage/out-*.json
//   batch.js write-in <n>         → batches/<n>/write/in-XX.json (10개씩, 참고 예시·스타일 경로 포함)
//   batch.js check <n>            diagrams/specs/<slug>.json 검증·겹침 → checked | check_failed
//   batch.js render <n>           checked 스펙 PNG(데스크톱·모바일·다크) → batches/<n>/render/png
//   batch.js review-in <n> [--no-png]  → batches/<n>/review/in-XX.json (10개씩)
//   batch.js review-apply <n>     ← batches/<n>/review/out-*.json (pass|fix|drop)
//   batch.js preview <n> --sample 25 --seed 1   승인용 미리보기·요약 → batches/<n>/approval/
//   batch.js approve <n> --yes    reviewed 상태 스펙을 reviewed:true로(사용자 승인 뒤에만)
//   batch.js report <n>           상태·type·분야군별 개수
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const C = require("./common.js");
const S = require("./status.js");
const { readPage } = require("./page.js");
const { buildIndex, exemplars } = require("./retrieve.js");
const { TYPES, validateSpec, renderFigure } = require("../lib.js");

const TRIAGE_CHUNK = 50;
const WRITE_CHUNK = 10;
const REVIEW_CHUNK = 10;
const INTENT_MIN = 10;

const rel = (p) => path.relative(C.ROOT, p).replace(/\\/g, "/");

function parseArgs(argv) {
  const [cmd, n, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--")) continue;
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) opts[key] = true;
    else { opts[key] = next; i++; }
  }
  return { cmd, n: Number(n), opts };
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 이전 입력 묶음(in-*.json)만 지우고 in-01.json… 으로 쓴다. 에이전트 출력(out-*.json)은
// 지우지 않는다 — 재실행해도 이미 받은 판정·검수 결과가 사라지지 않게.
function writeChunks(dir, items, size, extra) {
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/^in-\d+\.json$/.test(f)) fs.rmSync(path.join(dir, f));
  const parts = chunks(items, size);
  parts.forEach((part, i) => C.writeJSON(path.join(dir, `in-${String(i + 1).padStart(2, "0")}.json`), { ...extra, items: part }));
  return parts.length;
}

function readOutputs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^out-.*\.json$/.test(f)).sort().flatMap((f) => {
    const v = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!Array.isArray(v)) throw new Error(`${f}: 배열이 아님`);
    return v;
  });
}

function termMap() {
  return new Map(C.loadTerms().map((t) => [t.slug, t]));
}

function pageFor(slug) {
  const p = readPage(slug);
  if (!p) return null;
  const { hasLegacyFigure, hasConceptDiagram, ...text } = p;
  return text;
}

// ── new ─────────────────────────────────────────────────
function pruneExclusions(dir) {
  const out = new Set();
  if (!dir) return out;
  const tiers = C.readJSON(path.join(dir, "tiers.json"), {});
  for (const [slug, v] of Object.entries(tiers)) if (v && v.tier === "prune") out.add(slug);
  const merge = C.readJSON(path.join(dir, "merge-candidates.json"), { groups: [] });
  for (const g of merge.groups || []) for (const s of g.absorb || []) out.add(s);
  return out;
}

function legacySlugs(pool) {
  return pool.filter((slug) => {
    const f = path.join(C.ROOT, "terms", `${slug}.html`);
    return fs.existsSync(f) && fs.readFileSync(f, "utf8").includes('<figure class="term-figure">');
  });
}

function cmdNew(n, o) {
  if (fs.existsSync(S.statusFile(n))) throw new Error(`배치 ${n} 이미 있음`);
  const size = Number(o.size || 200), seed = Number(o.seed || 1), order = o.order || "popular";
  const have = C.specSlugs(), batched = S.allBatchedSlugs(), excluded = pruneExclusions(o["prune-dir"]);
  if (o["prune-dir"] && !excluded.size) console.warn(`! --prune-dir에서 제외 목록을 못 읽음: ${o["prune-dir"]}`);
  const terms = C.loadTerms();
  const pool = terms.map((t) => t.slug).filter((s) => !have.has(s) && !batched.has(s) && !excluded.has(s));
  let ordered;
  if (order === "random") ordered = C.shuffle(pool, seed);
  else if (order === "popular") {
    const inPool = new Set(pool);
    const pop = C.readJSON(path.join(C.ROOT, "data", "popular-terms.json"), {});
    const lists = Object.keys(pop).sort().map((k) => pop[k]);
    const head = [];
    for (let r = 0; r < Math.max(0, ...lists.map((l) => l.length)); r++) {
      for (const l of lists) if (l[r] && inPool.has(l[r]) && !head.includes(l[r])) head.push(l[r]);
    }
    const headSet = new Set(head);
    const rest = pool.filter((s) => !headSet.has(s));
    const legacy = legacySlugs(rest);
    const legacySet = new Set(legacy);
    ordered = [...head, ...legacy, ...C.shuffle(rest.filter((s) => !legacySet.has(s)), seed)];
  } else throw new Error(`알 수 없는 --order: ${order}`);
  const tmap = termMap();
  const items = {};
  for (const slug of ordered.slice(0, size)) items[slug] = { state: "pending", group: C.groupOf(tmap.get(slug).categories) };
  S.save(n, { batch: n, created: new Date().toISOString(), order, seed, size, items });
  console.log(`배치 ${n}: ${Object.keys(items).length}개 (후보 ${pool.length}, 제외 ${excluded.size})`);
}

// ── triage ──────────────────────────────────────────────
function cmdTriageIn(n) {
  const st = S.load(n), tmap = termMap();
  const items = S.inState(st, "pending").map((slug) => {
    const t = tmap.get(slug);
    return { slug, title_ko: t.title_ko, title_en: t.title_en, categories: t.categories, group: st.items[slug].group, page: pageFor(slug) };
  });
  const k = writeChunks(path.join(S.batchDir(n), "triage"), items.filter((i) => i.page), TRIAGE_CHUNK, { prompt: "diagrams/prompts/triage.md", types: TYPES });
  const missing = items.filter((i) => !i.page).map((i) => i.slug);
  for (const s of missing) S.setState(st, s, "dropped", { reason: "page:페이지 없음" });
  S.save(n, st);
  console.log(`판정 입력 ${k}묶음 (${items.length - missing.length}개)${missing.length ? `, 페이지 없음 ${missing.length}개 탈락` : ""}`);
}

function cmdTriageApply(n) {
  const st = S.load(n);
  const errs = [];
  const missingFn = C.readJSON(path.join(S.batchDir(n), "missing-fn.json"), {});
  let applied = 0;
  for (const r of readOutputs(path.join(S.batchDir(n), "triage"))) {
    const it = r && st.items[r.slug];
    if (!it) { errs.push(`${r && r.slug}: 배치에 없음`); continue; }
    if (it.state !== "pending") continue; // 이미 반영됨(재실행 안전)
    if (r.verdict === "no") { S.setState(st, r.slug, "dropped", { reason: `triage:${r.reason || "no"}` }); applied++; continue; }
    if (r.verdict !== "yes") { errs.push(`${r.slug}: verdict는 yes|no`); continue; }
    const bad = [];
    if (!TYPES.includes(r.type)) bad.push(`type ${r.type}`);
    if (typeof r.intent !== "string" || r.intent.length < INTENT_MIN) bad.push("intent 너무 짧음");
    if (r.confidence !== "high" && r.confidence !== "low") bad.push("confidence는 high|low");
    if (bad.length) { errs.push(`${r.slug}: ${bad.join(", ")}`); continue; }
    S.setState(st, r.slug, "triaged", { type: r.type, intent: r.intent, confidence: r.confidence });
    if (r.missing_fn) missingFn[r.missing_fn] = (missingFn[r.missing_fn] || 0) + 1;
    applied++;
  }
  S.save(n, st);
  C.writeJSON(path.join(S.batchDir(n), "missing-fn.json"), missingFn);
  console.log(`판정 반영 ${applied}개 · 오류 ${errs.length}개`);
  for (const e of errs) console.log(`  ✗ ${e}`);
  console.log(JSON.stringify(S.counts(st)));
}

// ── write ───────────────────────────────────────────────
function cmdWriteIn(n) {
  const st = S.load(n), tmap = termMap();
  const todo = S.inState(st, "triaged").filter((s) => !fs.existsSync(C.specPath(s)));
  const groups = [...new Set(todo.map((s) => st.items[s].group))];
  const noStyle = groups.filter((g) => !fs.existsSync(path.join(C.STYLE_DIR, `${g}.md`)));
  if (noStyle.length) throw new Error(`스타일 가이드 없음: ${noStyle.map((g) => `diagrams/style/${g}.md`).join(", ")}`);
  const idx = buildIndex();
  const items = todo.map((slug) => {
    const t = tmap.get(slug), it = st.items[slug];
    return {
      slug, title_ko: t.title_ko, title_en: t.title_en, group: it.group, type: it.type, intent: it.intent, confidence: it.confidence,
      page: pageFor(slug),
      exemplars: exemplars(idx, { slug, type: it.type, group: it.group, query: `${t.title_ko} ${t.title_en || ""} ${t.definition || ""}` }),
      style: `diagrams/style/${it.group}.md`,
    };
  });
  const k = writeChunks(path.join(S.batchDir(n), "write"), items, WRITE_CHUNK, { prompt: "diagrams/prompts/write.md", readme: "diagrams/README.md", out: "diagrams/specs/<slug>.json" });
  console.log(`작성 입력 ${k}묶음 (${items.length}개)`);
}

// ── check ───────────────────────────────────────────────
function checkOne(slug, known) {
  const file = C.specPath(slug);
  let spec;
  try { spec = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return [`JSON 오류: ${e.message}`]; }
  const errs = validateSpec(spec, known);
  if (spec.slug !== slug) errs.push("파일명과 slug 불일치");
  if (spec.reviewed !== false) errs.push("작성 단계 스펙은 reviewed:false 여야 함");
  if (errs.length) return errs;
  return renderFigure(spec, slug).warnings;
}

function cmdCheck(n) {
  const st = S.load(n);
  const known = new Set(C.loadTerms().map((t) => t.slug));
  let ok = 0, bad = 0;
  for (const slug of S.inState(st, "triaged", "check_failed", "checked")) {
    if (!fs.existsSync(C.specPath(slug))) continue;
    const errors = checkOne(slug, known);
    if (errors.length) { S.setState(st, slug, "check_failed", { errors }); bad++; }
    else { S.setState(st, slug, "checked", { errors: [] }); ok++; }
  }
  S.save(n, st);
  console.log(`검사 통과 ${ok} · 실패 ${bad}`);
  for (const slug of S.inState(st, "check_failed")) console.log(`  ✗ ${slug}: ${st.items[slug].errors.join("; ")}`);
}

// ── render ──────────────────────────────────────────────
function copySpecs(slugs, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const s of slugs) fs.copyFileSync(C.specPath(s), path.join(dir, `${s}.json`));
}

function cmdRender(n) {
  const st = S.load(n);
  const slugs = S.inState(st, "checked");
  const dir = path.join(S.batchDir(n), "render");
  copySpecs(slugs, dir);
  execFileSync(process.execPath, [path.join(__dirname, "..", "preview.js"), "--dir", dir, "--png"], { stdio: "inherit", env: process.env });
  console.log(`렌더 ${slugs.length}개 → ${rel(path.join(dir, "png"))}`);
}

// ── review ──────────────────────────────────────────────
function cmdReviewIn(n, o) {
  const st = S.load(n), tmap = termMap();
  const png = path.join(S.batchDir(n), "render", "png");
  const items = S.inState(st, "checked").map((slug) => {
    const t = tmap.get(slug), it = st.items[slug];
    const shots = Object.fromEntries(["desktop", "mobile", "dark"].map((k) => [k, path.join(png, `${slug}.${k}.png`)]));
    if (!o["no-png"] && !fs.existsSync(shots.desktop)) throw new Error(`PNG 없음: ${slug} — 먼저 render ${n}`);
    return {
      slug, title_ko: t.title_ko, group: it.group, type: it.type, intent: it.intent,
      page: pageFor(slug), spec: JSON.parse(fs.readFileSync(C.specPath(slug), "utf8")),
      spec_file: rel(C.specPath(slug)), png: o["no-png"] ? null : shots,
    };
  });
  const k = writeChunks(path.join(S.batchDir(n), "review"), items, REVIEW_CHUNK, { prompt: "diagrams/prompts/review.md", readme: "diagrams/README.md" });
  console.log(`검수 입력 ${k}묶음 (${items.length}개)`);
}

function cmdReviewApply(n) {
  const st = S.load(n);
  const known = new Set(C.loadTerms().map((t) => t.slug));
  const errs = [];
  let applied = 0;
  for (const r of readOutputs(path.join(S.batchDir(n), "review"))) {
    const it = r && st.items[r.slug];
    if (!it) { errs.push(`${r && r.slug}: 배치에 없음`); continue; }
    if (it.state !== "checked") continue;
    if (r.verdict === "drop") {
      const keep = path.join(S.batchDir(n), "dropped-specs", `${r.slug}.json`);
      fs.mkdirSync(path.dirname(keep), { recursive: true });
      fs.renameSync(C.specPath(r.slug), keep);
      S.setState(st, r.slug, "dropped", { reason: `review:${r.reason || "drop"}` });
      applied++;
      continue;
    }
    if (r.verdict !== "pass" && r.verdict !== "fix") { errs.push(`${r.slug}: verdict는 pass|fix|drop`); continue; }
    const errors = checkOne(r.slug, known); // fix면 검수자가 고친 파일을 다시 검사
    if (errors.length) S.setState(st, r.slug, "check_failed", { errors, review: r.verdict, reason: r.reason || "" });
    else S.setState(st, r.slug, "reviewed", { review: r.verdict, reason: r.reason || "" });
    applied++;
  }
  S.save(n, st);
  console.log(`검수 반영 ${applied}개 · 오류 ${errs.length}개`);
  for (const e of errs) console.log(`  ✗ ${e}`);
  console.log(JSON.stringify(S.counts(st)));
}

// ── preview / approve / report ─────────────────────────
function cmdPreview(n, o) {
  const st = S.load(n);
  const size = Number(o.sample || 25), seed = Number(o.seed || 1);
  const reviewed = S.inState(st, "reviewed");
  const fixed = reviewed.filter((s) => st.items[s].review === "fix");
  const sample = C.shuffle(reviewed.filter((s) => !fixed.includes(s)), seed).slice(0, size);
  const show = [...fixed, ...sample];
  const dir = path.join(S.batchDir(n), "approval");
  copySpecs(show, path.join(dir, "specs"));
  const lines = [`# 배치 ${n} 승인 요약`, "", `상태: ${JSON.stringify(S.counts(st))}`, "",
    `미리보기: ${rel(path.join(dir, "specs", "preview.html"))} — 검수에서 고친 ${fixed.length}개 + 무작위 표본 ${sample.length}개`, "",
    "## 탈락", "", ...S.inState(st, "dropped").map((s) => `- ${s}: ${st.items[s].reason}`), "",
    "## 검사 실패(작성 재시도 필요)", "", ...S.inState(st, "check_failed").map((s) => `- ${s}: ${(st.items[s].errors || []).join("; ")}`), ""];
  fs.writeFileSync(path.join(dir, "summary.md"), lines.join("\n"), "utf8");
  if (show.length) execFileSync(process.execPath, [path.join(__dirname, "..", "preview.js"), "--dir", path.join(dir, "specs")], { stdio: "ignore", env: process.env });
  console.log(`승인 미리보기 ${show.length}개 → ${rel(path.join(dir, "summary.md"))}`);
}

function cmdApprove(n, o) {
  if (!o.yes) throw new Error("approve는 사용자 승인 뒤에만: --yes 필요");
  const st = S.load(n);
  let k = 0;
  for (const slug of S.inState(st, "reviewed")) {
    const spec = JSON.parse(fs.readFileSync(C.specPath(slug), "utf8"));
    spec.reviewed = true;
    C.writeJSON(C.specPath(slug), spec);
    S.setState(st, slug, "approved");
    k++;
  }
  S.save(n, st);
  console.log(`승인 ${k}개 → 다음: npm run build:diagrams`);
}

function cmdReport(n) {
  const st = S.load(n);
  const by = (key) => {
    const c = {};
    for (const it of Object.values(st.items)) if (it[key]) c[it[key]] = (c[it[key]] || 0) + 1;
    return c;
  };
  console.log(JSON.stringify({ state: S.counts(st), type: by("type"), group: by("group") }, null, 2));
}

const COMMANDS = {
  new: cmdNew, "triage-in": cmdTriageIn, "triage-apply": cmdTriageApply, "write-in": cmdWriteIn,
  check: cmdCheck, render: cmdRender, "review-in": cmdReviewIn, "review-apply": cmdReviewApply,
  preview: cmdPreview, approve: cmdApprove, report: cmdReport,
};

if (require.main === module) {
  const { cmd, n, opts } = parseArgs(process.argv.slice(2));
  if (!COMMANDS[cmd] || !Number.isInteger(n) || n < 1) {
    console.error(`사용: batch.js <${Object.keys(COMMANDS).join("|")}> <배치번호> [옵션]`);
    process.exit(2);
  }
  try { COMMANDS[cmd](n, opts); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}

module.exports = { parseArgs, chunks, pruneExclusions };
