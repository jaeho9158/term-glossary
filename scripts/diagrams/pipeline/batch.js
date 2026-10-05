#!/usr/bin/env node
// 도식 생성 배치 도구. LLM은 부르지 않는다 — 에이전트가 읽을 입력 묶음을 쓰고, 에이전트 출력을 검증해 반영한다.
//
//   batch.js new <n> --size 200 --order popular|random|views --seed 1 [--fields psych,stat] [--views <GA4 JSON>] [--prune-dir <data/prune 경로>]
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
const WRITE_CHUNK = 6;
const REVIEW_CHUNK = 6;
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

// out-*.json을 읽는다. 깨진 파일·배열 아님은 이름을 밝혀 건너뛴다(그대로 둔다 — 고쳐서 다시 돌릴 수 있게).
// 반환: { entries: [{ file, index, value }], files: [정상으로 읽은 파일], errs }
function readOutputs(dir) {
  const res = { entries: [], files: [], errs: [] };
  if (!fs.existsSync(dir)) return res;
  for (const f of fs.readdirSync(dir).filter((x) => /^out-.*\.json$/.test(x)).sort()) {
    let v;
    try { v = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { res.errs.push(`${f}: JSON 오류 — ${e.message} (건너뜀)`); continue; }
    if (!Array.isArray(v)) { res.errs.push(`${f}: 배열이 아님 (건너뜀)`); continue; }
    res.files.push(f);
    v.forEach((value, index) => res.entries.push({ file: f, index, value }));
  }
  return res;
}

// 처리한 출력은 <dir>/applied/<시각>-out-XX.json 으로 옮겨, 다음 apply가 새 출력만 보게 한다.
function archiveOutputs(dir, files) {
  if (!files.length) return;
  const ap = path.join(dir, "applied");
  fs.mkdirSync(ap, { recursive: true });
  const ts = new Date().toISOString().replace(/\.\d+Z$/, "").replace(/:/g, "-");
  for (const f of files) {
    let dest = path.join(ap, `${ts}-${f}`);
    for (let k = 2; fs.existsSync(dest); k++) dest = path.join(ap, `${ts}-${k}-${f}`);
    fs.renameSync(path.join(dir, f), dest);
  }
}

// 출력 항목에서 slug를 꺼낸다. 없으면 오류 문구를 errs에 넣고 null.
function slugOf(e, errs) {
  const r = e.value;
  if (!r || typeof r.slug !== "string" || !r.slug) { errs.push(`항목 #${e.index + 1}: slug 없음 (${e.file})`); return null; }
  return r.slug;
}

function reportNoVerdict(label, pendingSlugs, seen) {
  const none = pendingSlugs.filter((s) => !seen.has(s));
  if (none.length) console.log(`${label}판정 없음 ${none.length}개: ${none.slice(0, 10).join(", ")}${none.length > 10 ? ", …" : ""}`);
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
  const prune = new Set(), absorb = new Set();
  if (!dir) return { prune, absorb, all: new Set() };
  const tiers = C.readJSON(path.join(dir, "tiers.json"), {});
  for (const [slug, v] of Object.entries(tiers)) if (v && v.tier === "prune") prune.add(slug);
  const merge = C.readJSON(path.join(dir, "merge-candidates.json"), { groups: [] });
  // 병합 후보는 흡수되는 쪽뿐 아니라 남는 쪽(keeper)도 뺀다 — 병합되면 본문이 바뀌어 지금 그린 그림이 헛일이 된다.
  for (const g of merge.groups || []) for (const x of [g.keeper, ...(g.absorb || [])]) if (x && !prune.has(x)) absorb.add(x);
  return { prune, absorb, all: new Set([...prune, ...absorb]) };
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
  const have = C.specSlugs(), batched = S.allBatchedSlugs(), ex = pruneExclusions(o["prune-dir"]), excluded = ex.all;
  if (o["prune-dir"] && !excluded.size) console.warn(`! --prune-dir에서 제외 목록을 못 읽음: ${o["prune-dir"]}`);
  // --fields psych,stat: 분야 중 하나라도 해당하는 용어만(첫 분야가 아니어도)
  const fields = o.fields ? String(o.fields).split(",").map((x) => x.trim()).filter(Boolean) : null;
  const terms = C.loadTerms().filter((t) => !fields || (t.categories || []).some((c) => fields.includes(c)));
  const pool = terms.map((t) => t.slug).filter((s) => !have.has(s) && !batched.has(s) && !excluded.has(s));
  let ordered;
  if (order === "random") ordered = C.shuffle(pool, seed);
  else if (order === "views") {
    // --views <GA4 JSON>: {"/terms/<slug>.html": 조회수}. 조회 많은 순(같으면 slug 순), 조회 0은 뒤에 무작위.
    if (!o.views) throw new Error("--order views에는 --views <GA4 JSON 경로> 필요");
    const ga = C.readJSON(o.views, null);
    if (!ga) throw new Error(`조회수 파일을 못 읽음: ${o.views}`);
    const v = (slug) => Number(ga[`/terms/${slug}.html`]) || 0;
    const seen = pool.filter((x) => v(x) > 0).sort((x, y) => v(y) - v(x) || (x < y ? -1 : 1));
    ordered = [...seen, ...C.shuffle(pool.filter((x) => v(x) === 0), seed)];
  }
  else if (order === "popular") {
    const inPool = new Set(pool);
    const pop = C.readJSON(path.join(C.ROOT, "data", "popular-terms.json"), {});
    const fields = (Array.isArray(pop._fields) ? pop._fields : Object.keys(pop).sort()).filter((k) => !k.startsWith("_") && Array.isArray(pop[k]));
    const lists = fields.map((k) => pop[k]);
    const head = [], headSet = new Set();
    for (let r = 0; r < Math.max(0, ...lists.map((l) => l.length)); r++) {
      for (const l of lists) if (l[r] && inPool.has(l[r]) && !headSet.has(l[r])) { head.push(l[r]); headSet.add(l[r]); }
    }
    if (head.length >= size) ordered = head; // 머리가 size를 채우면 옛 그림 스캔(파일 수만 개 읽기)이 필요 없다
    else {
      const rest = pool.filter((s) => !headSet.has(s));
      const legacy = legacySlugs(rest);
      const legacySet = new Set(legacy);
      ordered = [...head, ...legacy, ...C.shuffle(rest.filter((s) => !legacySet.has(s)), seed)];
    }
  } else throw new Error(`알 수 없는 --order: ${order}`);
  const tmap = termMap();
  const items = {};
  for (const slug of ordered.slice(0, size)) items[slug] = { state: "pending", group: C.groupOf(tmap.get(slug).categories) };
  S.save(n, { batch: n, created: new Date().toISOString(), order, seed, size, fields, items });
  console.log(`배치 ${n}: ${Object.keys(items).length}개 (후보 ${pool.length})`);
  console.log(`제외: prune ${ex.prune.size}, 병합 흡수 ${ex.absorb.size}`);
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
  const dir = path.join(S.batchDir(n), "triage");
  const out = readOutputs(dir);
  const errs = [...out.errs];
  const missingFn = C.readJSON(path.join(S.batchDir(n), "missing-fn.json"), {});
  const pendingBefore = S.inState(st, "pending");
  const seen = new Set();
  let applied = 0;
  for (const e of out.entries) {
    const slug = slugOf(e, errs);
    if (!slug) continue;
    const r = e.value, it = st.items[slug];
    if (!it) { errs.push(`${slug}: 배치에 없음`); continue; }
    seen.add(slug);
    if (it.state !== "pending") continue; // 이미 반영됨(재실행 안전)
    if (r.verdict === "no") S.setState(st, slug, "dropped", { reason: `triage:${r.reason || "no"}` });
    else if (r.verdict !== "yes") { errs.push(`${slug}: verdict는 yes|no`); continue; }
    else {
      const bad = [];
      if (!TYPES.includes(r.type)) bad.push(`type ${r.type}`);
      if (typeof r.intent !== "string" || r.intent.length < INTENT_MIN) bad.push("intent 너무 짧음");
      if (r.confidence !== "high" && r.confidence !== "low") bad.push("confidence는 high|low");
      if (bad.length) { errs.push(`${slug}: ${bad.join(", ")}`); continue; }
      S.setState(st, slug, "triaged", { type: r.type, intent: r.intent, confidence: r.confidence });
    }
    applied++;
    if (r.missing_fn !== undefined && r.missing_fn !== null) {
      if (typeof r.missing_fn === "string" && r.missing_fn.trim()) missingFn[r.missing_fn.trim()] = (missingFn[r.missing_fn.trim()] || 0) + 1;
      else errs.push(`${slug}: missing_fn은 비어 있지 않은 문자열이어야 함(판정은 반영됨)`);
    }
  }
  S.save(n, st);
  C.writeJSON(path.join(S.batchDir(n), "missing-fn.json"), missingFn);
  archiveOutputs(dir, out.files);
  console.log(`판정 반영 ${applied}개 · 오류 ${errs.length}개`);
  for (const e of errs) console.log(`  ✗ ${e}`);
  reportNoVerdict("", pendingBefore, seen);
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
  let ok = 0, bad = 0, back = 0;
  for (const slug of S.inState(st, "triaged", "check_failed", "checked")) {
    if (!fs.existsSync(C.specPath(slug))) {
      const cur = st.items[slug].state;
      if (cur === "checked" || cur === "check_failed") { S.setState(st, slug, "triaged", { errors: [], note: "스펙 없음 — 작성 단계로 되돌림" }); back++; }
      continue;
    }
    const errors = checkOne(slug, known);
    if (errors.length) { S.setState(st, slug, "check_failed", { errors }); bad++; }
    else { S.setState(st, slug, "checked", { errors: [] }); ok++; }
  }
  S.save(n, st);
  console.log(`검사 통과 ${ok} · 실패 ${bad}${back ? ` · 스펙 없어 triaged로 ${back}` : ""}`);
  for (const slug of S.inState(st, "check_failed")) console.log(`  ✗ ${slug}: ${st.items[slug].errors.join("; ")}`);
}

// ── render ──────────────────────────────────────────────
function copySpecs(slugs, dir) {
  // PNG_RESUME=1이면 중단된 렌더를 이어 가도록 이미 찍힌 png/는 남기고 스펙 사본만 갈아 끼운다.
  if (process.env.PNG_RESUME && fs.existsSync(dir)) { for (const f of fs.readdirSync(dir)) if (f.endsWith(".json")) fs.rmSync(path.join(dir, f)); }
  else fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const s of slugs) fs.copyFileSync(C.specPath(s), path.join(dir, `${s}.json`));
}

function cmdRender(n) {
  const st = S.load(n);
  const all = S.inState(st, "checked");
  const slugs = all.filter((s) => fs.existsSync(C.specPath(s)));
  for (const s of all) if (!slugs.includes(s)) console.warn(`! 스펙 없음, 렌더 건너뜀: ${s}`);
  const dir = path.join(S.batchDir(n), "render");
  if (!slugs.length) { console.log("렌더할 스펙 없음"); return; }
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
    const shots = Object.fromEntries(["desktop", "mobile", "dark"].map((k) => [k, rel(path.join(png, `${slug}.${k}.png`))]));
    if (!o["no-png"] && !fs.existsSync(path.join(C.ROOT, shots.desktop))) throw new Error(`PNG 없음: ${slug} — 먼저 render ${n}`);
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
  const dir = path.join(S.batchDir(n), "review");
  const out = readOutputs(dir);
  const errs = [...out.errs];
  const checkedBefore = S.inState(st, "checked");
  const seen = new Set();
  let applied = 0;
  for (const e of out.entries) {
    const slug = slugOf(e, errs);
    if (!slug) continue;
    const r = e.value, it = st.items[slug];
    if (!it) { errs.push(`${slug}: 배치에 없음`); continue; }
    seen.add(slug);
    if (it.state !== "checked") continue;
    if (r.verdict === "drop") {
      const extra = { reason: `review:${r.reason || "drop"}` };
      const src = C.specPath(slug);
      if (fs.existsSync(src)) {
        const keep = path.join(S.batchDir(n), "dropped-specs", `${slug}.json`);
        fs.mkdirSync(path.dirname(keep), { recursive: true });
        fs.renameSync(src, keep);
      } else extra.note = "spec 없음 — 이미 치워졌거나 지워짐";
      S.setState(st, slug, "dropped", extra);
    } else if (r.verdict === "pass" || r.verdict === "fix") {
      const errors = checkOne(slug, known); // fix면 검수자가 고친 파일을 다시 검사
      if (errors.length) S.setState(st, slug, "check_failed", { errors, review: r.verdict, reason: r.reason || "" });
      else S.setState(st, slug, "reviewed", { review: r.verdict, reason: r.reason || "" });
    } else { errs.push(`${slug}: verdict는 pass|fix|drop`); continue; }
    S.save(n, st); // 항목마다 저장: 중간에 죽어도 옮긴 파일과 상태가 어긋나지 않게
    applied++;
  }
  S.save(n, st);
  archiveOutputs(dir, out.files);
  console.log(`검수 반영 ${applied}개 · 오류 ${errs.length}개`);
  for (const e of errs) console.log(`  ✗ ${e}`);
  reportNoVerdict("검수 ", checkedBefore, seen);
  console.log(JSON.stringify(S.counts(st)));
}

// ── recheck: 검수자가 고친(fix) 스펙을 다시 렌더해 그림으로 재확인 ──
function recheckPending(st) {
  return S.inState(st, "reviewed").filter((s) => st.items[s].review === "fix" && st.items[s].rechecked !== true && fs.existsSync(C.specPath(s)));
}

function cmdRecheckIn(n) {
  const st = S.load(n), tmap = termMap();
  const slugs = recheckPending(st);
  if (!slugs.length) { console.log("재확인할 스펙 없음"); return; }
  const dir = path.join(S.batchDir(n), "recheck");
  const render = path.join(dir, "render");
  copySpecs(slugs, render);
  execFileSync(process.execPath, [path.join(__dirname, "..", "preview.js"), "--dir", render, "--png"], { stdio: "inherit", env: process.env });
  const png = path.join(render, "png");
  const items = slugs.map((slug) => {
    const t = tmap.get(slug), it = st.items[slug];
    const shots = Object.fromEntries(["desktop", "mobile", "dark"].map((k) => [k, rel(path.join(png, `${slug}.${k}.png`))]));
    if (!fs.existsSync(path.join(C.ROOT, shots.desktop))) throw new Error(`PNG 없음: ${slug}`);
    return {
      slug, title_ko: t.title_ko, group: it.group, type: it.type, intent: it.intent,
      page: pageFor(slug), spec: JSON.parse(fs.readFileSync(C.specPath(slug), "utf8")),
      spec_file: rel(C.specPath(slug)), png: shots, first_review: it.reason || "",
    };
  });
  const k = writeChunks(dir, items, REVIEW_CHUNK, { prompt: "diagrams/prompts/review.md", readme: "diagrams/README.md" });
  console.log(`재확인 입력 ${k}묶음 (${items.length}개)`);
}

function cmdRecheckApply(n) {
  const st = S.load(n);
  const known = new Set(C.loadTerms().map((t) => t.slug));
  const dir = path.join(S.batchDir(n), "recheck");
  const out = readOutputs(dir);
  const errs = [...out.errs];
  const c = { pass: 0, fix: 0, drop: 0 };
  for (const e of out.entries) {
    const slug = slugOf(e, errs);
    if (!slug) continue;
    const r = e.value, it = st.items[slug];
    if (!it) { errs.push(`${slug}: 배치에 없음`); continue; }
    if (it.state !== "reviewed") continue;
    if (r.verdict === "drop") {
      const src = C.specPath(slug);
      if (fs.existsSync(src)) {
        const keep = path.join(S.batchDir(n), "dropped-specs", `${slug}.json`);
        fs.mkdirSync(path.dirname(keep), { recursive: true });
        fs.renameSync(src, keep);
      }
      S.setState(st, slug, "dropped", { reason: `recheck:${r.reason || "drop"}` });
    } else if (r.verdict === "pass") {
      S.setState(st, slug, "reviewed", { rechecked: true, recheck_reason: r.reason || "" });
    } else if (r.verdict === "fix") { // 다시 고쳤으면 다음 recheck-in에서 한 번 더 그려 본다
      const errors = checkOne(slug, known);
      if (errors.length) S.setState(st, slug, "check_failed", { errors, reason: r.reason || "" });
      else S.setState(st, slug, "reviewed", { rechecked: false, reason: r.reason || "" });
    } else { errs.push(`${slug}: verdict는 pass|fix|drop`); continue; }
    c[r.verdict]++;
    S.save(n, st);
  }
  S.save(n, st);
  archiveOutputs(dir, out.files);
  console.log(`재확인 반영 pass ${c.pass} · fix ${c.fix} · drop ${c.drop} · 오류 ${errs.length}개 · 남은 재확인 ${recheckPending(st).length}개`);
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
    show.length ? `미리보기: ${rel(path.join(dir, "specs", "preview.html"))} — 검수에서 고친 ${fixed.length}개 + 무작위 표본 ${sample.length}개`
      : "미리보기: 없음(reviewed 스펙이 없어 표본 0개)", "",
    "## 탈락", "", ...S.inState(st, "dropped").map((s) => `- ${s}: ${st.items[s].reason}`), "",
    "## 검사 실패(작성 재시도 필요)", "", ...S.inState(st, "check_failed").map((s) => `- ${s}: ${(st.items[s].errors || []).join("; ")}`), ""];
  fs.writeFileSync(path.join(dir, "summary.md"), lines.join("\n"), "utf8");
  if (show.length) execFileSync(process.execPath, [path.join(__dirname, "..", "preview.js"), "--dir", path.join(dir, "specs")], { stdio: "ignore", env: process.env });
  console.log(`승인 미리보기 ${show.length}개 → ${rel(path.join(dir, "summary.md"))}`);
}

function cmdApprove(n, o) {
  if (o.yes !== true) throw new Error("approve는 사용자 승인 뒤에만: --yes 필요");
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
  "recheck-in": cmdRecheckIn, "recheck-apply": cmdRecheckApply,
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
