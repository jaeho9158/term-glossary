// 결정표에서 승인한 "분야 병합"(catmerge) 적용. 흡수 분야 A의 용어를 대표 분야 K로 옮기고 A를 없앤다.
//
// 사용: node scripts/prune/apply-category-merge.js (--in <결정표 덤프> | --plan <plan.json>) [--texts <json>] [--dry] [--root <dir>] [--rebuild]
//   --in    ArtifactData list 결과. 배열/{docs:[...]}/{id: doc} JSON 파일 또는 문서별 JSON 파일이 든 폴더.
//           분야 병합 묶음(항목 slug가 "../category/<code>")만 읽고, decision이 approve/partial인 것만 쓴다.
//   --plan  {groups:[{keeper, label?, absorb:[...], description?, intro?}]}. 덤프 대신 직접 줄 때.
//   --texts 이름이 바뀌는 대표 분야의 새 설명·소개문 {code:{description,intro}}. 기본: scripts/prune/category-merge-texts.json
//   --root  대상 트리(기본: 저장소 루트). 시험은 복사본(git worktree)에서 한다.
//   --dry   아무것도 쓰지 않고 계획만 출력한다.
//   --rebuild  직접 고친 뒤 대상 트리에서 생성 스크립트(색인·분야 페이지·학습·개념 지도·사이트맵)를 차례로 돌린다.
//
// 직접 고치는 것: terms.json(categories), assets/category-data.js(모든 표), 진단 파이프라인 groups.json,
//   OA 수집기 분야 매핑 2곳, 헤더 검색 라벨 사본, popular-terms·index-tiers·oa-stats의 분야 키, compare-pairs,
//   learn-levels, category-short/A.json 삭제, category/A.html → K로 넘기는 스텁, A 분야 페이지로 가던 용어 스텁,
//   영향받은 용어 페이지의 분야 배지·JSON-LD 경로·이전/다음 링크.
// 나머지(분야 페이지·분야 허브·색인·사이트맵·개념 지도)는 생성 스크립트 몫이다. 끝에 순서를 출력한다.
//
// 안전: 검증에 실패하면 아무것도 쓰지 않는다. terms.json은 쓰기 직전에 다시 읽어 바뀌었으면 중단한다.
// 커밋은 하지 않는다.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");
const { BASE_URL } = require("../site-config.js");
const { escapeHtml } = require("../../assets/escape.js");
const { stubHtml } = require("./apply.js");
const { rebuildPrevNext } = require("./rebuild-prevnext.js");
const { applyTermMeta, isStub } = require("../lib/term-meta.js");

const CAT_PREFIX = /^(?:\.\.\/)?category\//;
const codeOf = (s) => String(s || "").replace(CAT_PREFIX, "").replace(/\.html$/, "");

// ---- 결정표 덤프 → 계획 -----------------------------------------------------

function readDump(p) {
  if (fs.statSync(p).isDirectory()) {
    return fs.readdirSync(p).filter((f) => f.endsWith(".json")).map((f) => {
      const v = JSON.parse(fs.readFileSync(path.join(p, f), "utf8"));
      return { id: f.slice(0, -5), ...(v.data && typeof v.data === "object" ? v.data : v) };
    });
  }
  const dump = JSON.parse(fs.readFileSync(p, "utf8"));
  const list = Array.isArray(dump) ? dump : Array.isArray(dump && dump.docs) ? dump.docs : Object.entries(dump || {}).map(([id, v]) => ({ id, ...v }));
  return list.map((d) => ({ id: d.id || d.doc_id, ...(d.data && typeof d.data === "object" ? d.data : d) }));
}

// 분야 병합 묶음인지: 항목 slug가 분야 페이지 경로다(용어 병합 적용기는 이 묶음을 건너뛴다).
function isCategoryMergeDoc(doc) {
  return doc && doc.kind === "merge" && Array.isArray(doc.items) && doc.items.some((i) => CAT_PREFIX.test(String(i.slug || "")));
}

// 승인된 묶음만 계획으로. 이름은 제목 "[분야 병합 · …] 새 이름 ← …"에서 읽는다.
function planFromDocs(docs) {
  const byKeeper = new Map();
  for (const doc of docs) {
    if (!isCategoryMergeDoc(doc)) continue;
    if (doc.decision !== "approve" && doc.decision !== "partial") continue;
    const keeper = doc.items.find((i) => i.role === "keeper");
    if (!keeper) throw new Error(`대표 분야 없음: ${doc.id}`);
    const k = codeOf(keeper.slug);
    const absorb = doc.items.filter((i) => i.role !== "keeper")
      .filter((i) => (doc.decision === "approve" ? i.decision !== "reject" : i.decision === "approve"))
      .map((i) => codeOf(i.slug));
    if (!absorb.length) continue;
    const m = String(doc.title || "").match(/\]\s*(.+?)\s*←/);
    const label = m ? m[1].trim() : null;
    const g = byKeeper.get(k) || { keeper: k, label: null, absorb: [], from: [] };
    if (label && g.label && label !== g.label) throw new Error(`같은 대표 분야 ${k}에 이름이 둘: "${g.label}" / "${label}" (${g.from.join(", ")}, ${doc.id})`);
    g.label = g.label || label;
    for (const a of absorb) if (!g.absorb.includes(a)) g.absorb.push(a);
    g.from.push(doc.id);
    byKeeper.set(k, g);
  }
  return { groups: [...byKeeper.values()] };
}

// ---- 검증 -------------------------------------------------------------------

function validatePlan(plan, cat) {
  const errors = [];
  const labels = cat.CATEGORY_LABELS;
  const seenAbsorb = new Map();
  const keepers = new Set(plan.groups.map((g) => g.keeper));
  for (const g of plan.groups) {
    if (!labels[g.keeper]) errors.push(`대표 분야 코드 없음: ${g.keeper}`);
    if (g.label && /[{}]/.test(g.label)) errors.push(`이름에 중괄호를 쓸 수 없음: ${g.label}`);
    for (const a of g.absorb) {
      if (!labels[a]) errors.push(`흡수 분야 코드 없음: ${a}`);
      if (a === g.keeper) errors.push(`자기 자신을 흡수: ${a}`);
      if (keepers.has(a)) errors.push(`흡수 분야 ${a}가 다른 묶음의 대표이기도 함(연쇄 병합은 두 번에 나눠 적용)`);
      if (seenAbsorb.has(a) && seenAbsorb.get(a) !== g.keeper) errors.push(`흡수 분야 ${a}가 두 대표(${seenAbsorb.get(a)}, ${g.keeper})에 걸림`);
      seenAbsorb.set(a, g.keeper);
    }
  }
  return errors;
}

// ---- terms.json -------------------------------------------------------------

function mergeTerms(terms, absorbTo) {
  const changed = [];
  const out = terms.map((t) => {
    const cats = Array.isArray(t.categories) ? t.categories : [];
    if (!cats.some((c) => absorbTo.has(c))) return t;
    const next = [];
    for (const c of cats) { const n = absorbTo.get(c) || c; if (!next.includes(n)) next.push(n); }
    changed.push(t.slug);
    return { ...t, categories: next };
  });
  return { terms: out, changed };
}

function serializeLike(raw, value) {
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const compact = !/^[[{]\s*\n/.test(raw);
  let s = compact ? JSON.stringify(value) : JSON.stringify(value, null, 2);
  if (eol === "\r\n") s = s.replace(/\n/g, "\r\n");
  return /\r?\n$/.test(raw) ? s + eol : s;
}

// ---- assets/category-data.js ------------------------------------------------

// 시작 정규식부터 닫는 "\n  };" 또는 "\n  ];"까지(그 줄 포함)의 [시작, 끝] 문자 위치.
function blockRange(src, startRe, close) {
  const m = startRe.exec(src);
  if (!m) throw new Error(`category-data.js에서 블록을 찾지 못함: ${startRe}`);
  const end = src.indexOf(close, m.index);
  if (end < 0) throw new Error(`블록 끝을 찾지 못함: ${startRe}`);
  return [m.index, end + close.length];
}
function editBlock(src, startRe, close, fn) {
  const [s, e] = blockRange(src, startRe, close);
  return src.slice(0, s) + fn(src.slice(s, e)) + src.slice(e);
}
const keyOf = (line) => { const m = line.match(/^\s+"?([A-Za-z0-9_-]+)"?\s*:/); return m ? m[1] : null; };
const isEntry = (line) => keyOf(line) !== null;

// 객체 블록에서 항목 줄을 고치거나 지운다. 원래 마지막 항목에 쉼표가 없었으면(엄격한 JSON) 새 마지막 항목도 없앤다.
function editObjectLines(block, fn) {
  const lines = block.split("\n");
  const entryIdx = lines.map((l, i) => (isEntry(l) ? i : -1)).filter((i) => i >= 0);
  const lastHadComma = entryIdx.length ? /,\s*$/.test(lines[entryIdx[entryIdx.length - 1]]) : true;
  const out = [];
  for (const line of lines) {
    if (!isEntry(line)) { out.push(line); continue; }
    const r = fn(keyOf(line), line);
    if (r === null) continue;
    out.push(r);
  }
  if (!lastHadComma) {
    for (let i = out.length - 1; i >= 0; i--) if (isEntry(out[i])) { out[i] = out[i].replace(/,(\s*)$/, "$1"); break; }
  }
  return out.join("\n");
}
const fmtArr = (arr, sep) => "[" + arr.map((x) => JSON.stringify(x)).join(sep) + "]";

function editCategoryData(src, groups, cat) {
  const absorbTo = new Map(); for (const g of groups) for (const a of g.absorb) absorbTo.set(a, g.keeper);
  const byKeeper = new Map(groups.map((g) => [g.keeper, g]));
  const gone = (k) => absorbTo.has(k);

  src = editBlock(src, /^  const CATEGORY_LABELS = \{$/m, "\n  };", (b) => editObjectLines(b, (k, line) => {
    if (gone(k)) return null;
    const g = byKeeper.get(k);
    if (g && g.label) return line.replace(/:\s*".*?"(,?)\s*$/, `: ${JSON.stringify(g.label)}$1`);
    return line;
  }));

  src = editBlock(src, /^  const CATEGORY_GROUPS = \[$/m, "\n  ];", (b) => b.replace(/codes: (\[[^\]]*\])/g, (_, arr) =>
    "codes: " + JSON.stringify(JSON.parse(arr).filter((c) => !gone(c)))));

  src = src.replace(/^(  const CATEGORY_ORDER = )(\[[^\n]*\]);$/m, (_, head, arr) =>
    head + JSON.stringify(JSON.parse(arr).filter((c) => !gone(c))) + ";");

  // 별칭: 옛 코드 → 새 코드 배열. 이미 있던 별칭이 A를 가리키면 K로 돌린다.
  src = editBlock(src, /^  const CATEGORY_ALIASES = \{$/m, "\n  };", (b) => {
    const lines = b.split("\n");
    const head = lines[0], tail = lines[lines.length - 1];
    const map = {};
    for (const line of lines.slice(1, -1)) {
      const k = keyOf(line); if (!k) continue;
      const v = JSON.parse(line.slice(line.indexOf(":") + 1).replace(/,\s*$/, "").trim());
      map[k] = v;
    }
    for (const k of Object.keys(map)) {
      const next = [];
      for (const c of map[k]) { const n = absorbTo.get(c) || c; if (!next.includes(n)) next.push(n); }
      map[k] = next;
    }
    for (const [a, k] of absorbTo) map[a] = [k];
    const body = Object.keys(map).sort().map((k) => `    ${/^[a-z][a-z0-9_]*$/.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(map[k])},`);
    return [head, ...body, tail].join("\n");
  });

  src = editBlock(src, /^  const CATEGORY_DESCRIPTIONS = \{$/m, "\n  };", (b) => editObjectLines(b, (k, line) => {
    if (gone(k)) return null;
    const g = byKeeper.get(k);
    if (g && g.description) return line.replace(/:\s*".*"(,?)\s*$/, `: ${JSON.stringify(g.description)}$1`);
    return line;
  }));

  // 하위 주제: 대표 분야 목록 뒤에 흡수 분야 목록을 붙인다(용어의 subcategory는 첫 분야 목록 기준이라 그대로 맞는다).
  src = editBlock(src, /^  const SUB_CATEGORY_ORDER = \{$/m, "\n  };", (b) => editObjectLines(b, (k, line) => {
    if (gone(k)) return null;
    const g = byKeeper.get(k);
    if (!g) return line;
    const merged = [...(cat.SUB_CATEGORY_ORDER[k] || [])];
    for (const a of g.absorb) for (const s of cat.SUB_CATEGORY_ORDER[a] || []) if (!merged.includes(s)) merged.push(s);
    return line.replace(/:\s*\[.*\](,?)\s*$/, `: ${fmtArr(merged, ", ")}$1`);
  }));

  src = editBlock(src, /^  const HOME_FEATURED_CATEGORIES = \[$/m, "\n  ];", (b) =>
    b.replace(/"([a-z0-9_-]+)",[ ]?/g, (m, c) => (gone(c) ? "" : m)).replace(/\n[ \t]*(?=\n)/g, ""));

  src = editBlock(src, /^\s*const CATEGORY_INTRO = \{$/m, "\n  };", (b) => editObjectLines(b, (k, line) => {
    if (gone(k)) return null;
    const g = byKeeper.get(k);
    if (g && g.intro) return line.replace(/:\s*".*"(,?)\s*$/, `: ${JSON.stringify(g.intro)}$1`);
    return line;
  }));
  return src;
}

function evalCategoryData(src) {
  const sandbox = { module: { exports: {} }, globalThis: {} };
  sandbox.window = undefined;
  vm.runInNewContext(src, sandbox, { filename: "category-data.js" });
  // 다른 realm의 객체라 이 파일 쪽 객체로 옮겨 돌려준다(비교·직렬화가 일반 객체처럼 되도록).
  return JSON.parse(JSON.stringify(sandbox.module.exports));
}

// 편집 결과가 서로 맞는지(코드 집합 일치, INTRO는 엄격한 JSON, 테스트가 쓰는 정규식이 그대로 잡히는지).
function checkCategoryData(src) {
  const errors = [];
  const c = evalCategoryData(src);
  const labels = Object.keys(c.CATEGORY_LABELS).sort().join(",");
  const same = (name, keys) => { if (keys.slice().sort().join(",") !== labels) errors.push(`${name}의 코드가 CATEGORY_LABELS와 다름`); };
  same("CATEGORY_ORDER", c.CATEGORY_ORDER);
  same("CATEGORY_GROUPS", c.CATEGORY_GROUPS.flatMap((g) => g.codes));
  same("CATEGORY_DESCRIPTIONS", Object.keys(c.CATEGORY_DESCRIPTIONS));
  same("SUB_CATEGORY_ORDER", Object.keys(c.SUB_CATEGORY_ORDER));
  same("CATEGORY_INTRO", Object.keys(c.CATEGORY_INTRO));
  if (c.CATEGORY_ORDER.join(",") !== c.CATEGORY_GROUPS.flatMap((g) => g.codes).join(",")) errors.push("CATEGORY_ORDER가 CATEGORY_GROUPS 순서와 다름");
  for (const [k, v] of Object.entries(c.CATEGORY_ALIASES)) {
    if (c.CATEGORY_LABELS[k]) errors.push(`별칭 ${k}가 살아 있는 코드임`);
    for (const t of v) if (!c.CATEGORY_LABELS[t]) errors.push(`별칭 ${k} → 없는 코드 ${t}`);
  }
  const intro = src.match(/const CATEGORY_INTRO = (\{[\s\S]*?\n  \});\n\n/);
  if (!intro) errors.push("CATEGORY_INTRO 블록 형식이 바뀜(apply-category-intro.js가 못 찾음)");
  else { try { JSON.parse(intro[1]); } catch (e) { errors.push("CATEGORY_INTRO가 엄격한 JSON이 아님: " + e.message); } }
  if (!/CATEGORY_LABELS\s*=\s*(\{[\s\S]*?\});/.test(src)) errors.push("CATEGORY_LABELS 블록 형식이 바뀜");
  return { errors, data: c };
}

// ---- 다른 코드·데이터 파일 ----------------------------------------------------

// "const NAME = {" … "\n};" 블록 안의 `code: [...]` / `code: "..."` 항목을 지운다(한 줄에 여러 항목).
function dropInlineEntries(src, constName, codes) {
  const start = src.indexOf(`const ${constName} = {`);
  if (start < 0) return { src, removed: [] };
  const end = src.indexOf("\n};", start);
  let block = src.slice(start, end);
  const removed = [];
  for (const c of codes) {
    const re = new RegExp(`(^|[ \\t{])${c}: (?:\\[[^\\]]*\\]|"[^"]*"),[ ]?`, "m");
    if (re.test(block)) { block = block.replace(re, "$1"); removed.push(c); }
  }
  block = block.replace(/\n[ \t]*(?=\n)/g, "").replace(/[ \t]+\n/g, "\n");
  return { src: src.slice(0, start) + block + src.slice(end), removed };
}

function editGroupsJson(raw, absorbTo) {
  return raw.split(/(\r?\n)/).map((line) => line.replace(/^(\s*"[^"]+":\s*)(\[[^\]]*\])/, (_, head, arr) =>
    head + fmtArr(JSON.parse(arr).filter((c) => !absorbTo.has(c)), ", "))).join("");
}

function editLocalLabels(src, absorbTo, byKeeper) {
  const start = src.indexOf("const LOCAL_CATEGORY_LABELS = {");
  if (start < 0) return src;
  const end = src.indexOf("};", start);
  const block = src.slice(start, end).split("\n").filter((l) => !absorbTo.has(keyOf(l))).map((l) => {
    const g = byKeeper.get(keyOf(l));
    return g && g.label ? l.replace(/:\s*".*?"(,?)\s*$/, `: ${JSON.stringify(g.label)}$1`) : l;
  }).join("\n");
  return src.slice(0, start) + block + src.slice(end);
}

// {code: 수} 사전에서 A의 값을 K에 더하고 A를 지운다(숫자가 아니면 K에 이미 있을 때 A만 지운다).
function foldCounts(obj, absorbTo) {
  if (!obj || typeof obj !== "object") return false;
  let touched = false;
  for (const [a, k] of absorbTo) {
    if (!(a in obj)) continue;
    if (typeof obj[a] === "number") obj[k] = (obj[k] || 0) + obj[a];
    else if (!(k in obj)) obj[k] = obj[a];
    delete obj[a];
    touched = true;
  }
  return touched;
}

// ---- 용어 페이지(배지·경로·이전/다음) ------------------------------------------

const H1_BLOCK = /<h1>[\s\S]*?<\/h1>/;
const BADGES_BLOCK = /\n?  <div class="category-badges">[\s\S]*?<\/div>/;
function badgesBlock(categories, labels) {
  const links = categories.filter((c) => labels[c])
    .map((c) => `<a class="category-badge" href="../category.html?cat=${c}">${labels[c]}</a>`).join("\n    ");
  return `\n  <div class="category-badges">\n    ${links}\n  </div>`;
}
function updateTermPage(html, term, labels, date) {
  if (isStub(html) || !H1_BLOCK.test(html)) return html;
  const block = badgesBlock(term.categories || [], labels);
  let out = BADGES_BLOCK.test(html) ? html.replace(BADGES_BLOCK, () => block) : html.replace(H1_BLOCK, (m) => m + block);
  const withMeta = applyTermMeta(out, term, { categoryLabels: labels, date });
  return withMeta == null ? out : withMeta;
}

// ---- 적용 -------------------------------------------------------------------

function applyCategoryMerge({ plan, root, dry = false, log = console.log }) {
  const rel = (...p) => path.join(root, ...p);
  const catFile = rel("assets", "category-data.js");
  const catSrc = fs.readFileSync(catFile, "utf8");
  const cat = evalCategoryData(catSrc);
  const groups = plan.groups.map((g) => ({ ...g, label: g.label && g.label !== cat.CATEGORY_LABELS[g.keeper] ? g.label : null }));

  const errors = validatePlan({ groups }, cat);
  if (errors.length) throw new Error("계획 검증 실패:\n  " + errors.join("\n  "));
  const absorbTo = new Map(); for (const g of groups) for (const a of g.absorb) absorbTo.set(a, g.keeper);
  const byKeeper = new Map(groups.map((g) => [g.keeper, g]));
  const renamed = groups.filter((g) => g.label);

  // category-data.js
  const nextCatSrc = editCategoryData(catSrc, groups, cat);
  const { errors: catErrors, data: nextCat } = checkCategoryData(nextCatSrc);
  if (catErrors.length) throw new Error("category-data.js 편집 결과 불일치:\n  " + catErrors.join("\n  "));
  const labels = nextCat.CATEGORY_LABELS;

  // terms.json
  const termsFile = rel("terms.json");
  const rawBefore = fs.readFileSync(termsFile, "utf8");
  const terms = JSON.parse(rawBefore);
  const { terms: nextTerms, changed } = mergeTerms(terms, absorbTo);
  const renamedKeepers = new Set(renamed.map((g) => g.keeper));
  const affected = new Set(changed);
  for (const t of nextTerms) if ((t.categories || []).some((c) => renamedKeepers.has(c))) affected.add(t.slug);
  // 첫 분야의 하위 주제가 대표 분야의 합친 목록에 있는지(없으면 분야 페이지에서 "기타"로 접힌다).
  const subMiss = nextTerms.filter((t) => changed.includes(t.slug) && t.subcategory && !(nextCat.SUB_CATEGORY_ORDER[t.categories[0]] || []).includes(t.subcategory)).length;

  const writes = new Map(); // 절대경로 → 내용(null이면 삭제)
  const notes = [];
  writes.set(catFile, nextCatSrc);

  // 진단 파이프라인 groups.json
  const groupsFile = rel("scripts", "diagrams", "pipeline", "groups.json");
  if (fs.existsSync(groupsFile)) {
    const raw = fs.readFileSync(groupsFile, "utf8"); const out = editGroupsJson(raw, absorbTo);
    if (out !== raw) writes.set(groupsFile, out);
  }
  // OA 수집기 분야 매핑
  for (const [file, name] of [[rel("scripts", "oa", "collect-openalex.js"), "CODE_FIELDS"], [rel("scripts", "oa", "collect-s2.js"), "FOS"]]) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8"); const r = dropInlineEntries(raw, name, [...absorbTo.keys()]);
    if (r.src !== raw) writes.set(file, r.src);
  }
  // 헤더 검색의 라벨 사본
  const headerFile = rel("assets", "header-search.js");
  if (fs.existsSync(headerFile)) {
    const raw = fs.readFileSync(headerFile, "utf8"); const out = editLocalLabels(raw, absorbTo, byKeeper);
    if (out !== raw) writes.set(headerFile, out);
  }
  // 분야 키가 있는 데이터
  const popFile = rel("data", "popular-terms.json");
  if (fs.existsSync(popFile)) {
    const raw = fs.readFileSync(popFile, "utf8"); const o = JSON.parse(raw); let t = false;
    for (const a of absorbTo.keys()) if (a in o) { delete o[a]; t = true; }
    if (Array.isArray(o._fields)) {
      const f = []; for (const c of o._fields) { const n = absorbTo.get(c) || c; if (!f.includes(n)) f.push(n); }
      if (f.join() !== o._fields.join()) { o._fields = f; t = true; }
    }
    if (t) writes.set(popFile, serializeLike(raw, o));
  }
  const tiersFile = rel("data", "index-tiers.json");
  if (fs.existsSync(tiersFile)) {
    const raw = fs.readFileSync(tiersFile, "utf8"); const o = JSON.parse(raw);
    const per = o.counts && o.counts.perCategory;
    if (per) {
      let t = false;
      for (const [a, k] of absorbTo) if (per[a]) {
        per[k] = per[k] || {}; for (const [n, v] of Object.entries(per[a])) per[k][n] = (per[k][n] || 0) + v;
        delete per[a]; t = true;
      }
      if (t) writes.set(tiersFile, serializeLike(raw, o));
    }
  }
  // OA 통계: 분야별 문서 수와 용어별 분야 분포를 대표 분야로 합친다(두 분야에 걸친 문서는 두 번 세어진 값이 된다).
  const oaFile = rel("data", "oa-stats.json");
  if (fs.existsSync(oaFile)) {
    const raw = fs.readFileSync(oaFile, "utf8"); const o = JSON.parse(raw); let t = false;
    for (const key of ["fieldDocs", "fieldDocsEn", "fieldDocsNeutral"]) t = foldCounts(o[key], absorbTo) || t;
    for (const v of Object.values(o.terms || {})) for (const key of ["fields", "fieldsNeutral", "fieldsEn"]) t = foldCounts(v && v[key], absorbTo) || t;
    if (t) writes.set(oaFile, serializeLike(raw, o));
  }
  const pairsFile = rel("data", "compare-pairs.json");
  if (fs.existsSync(pairsFile)) {
    const raw = fs.readFileSync(pairsFile, "utf8"); const o = JSON.parse(raw); let t = false;
    for (const p of o) if (absorbTo.has(p.category)) { p.category = absorbTo.get(p.category); t = true; }
    if (t) writes.set(pairsFile, serializeLike(raw, o));
  }
  for (const [a, k] of absorbTo) {
    const from = rel("data", "learn-levels", `${a}.json`);
    if (!fs.existsSync(from)) continue;
    const to = rel("data", "learn-levels", `${k}.json`);
    if (fs.existsSync(to)) notes.push(`data/learn-levels/${a}.json은 ${k}.json이 이미 있어 그대로 둠(손으로 합칠 것)`);
    else { writes.set(to, fs.readFileSync(from, "utf8")); writes.set(from, null); }
  }
  for (const a of absorbTo.keys()) {
    const f = rel("data", "category-short", `${a}.json`);
    if (fs.existsSync(f)) writes.set(f, null);
  }

  // 흡수 분야 페이지 → 대표 분야로 넘기는 스텁
  for (const [a, k] of absorbTo) {
    const label = labels[k];
    writes.set(rel("category", `${a}.html`), stubHtml({
      title: escapeHtml(cat.CATEGORY_LABELS[a]),
      canonical: `${BASE_URL}/category/${k}.html`,
      refresh: `${k}.html`,
      bodyHtml: `이 분야는 <a href="${k}.html">${escapeHtml(label)}</a> 분야로 통합되었습니다.`,
    }));
  }
  // 개념 지도: taxonomy/build.js가 돌면 A 페이지를 지우지만, 그 스크립트가 실패해도 링크가 깨지지 않게 넘겨 둔다.
  for (const [a, k] of absorbTo) {
    if (!fs.existsSync(rel("concept-map", `${a}.html`))) continue;
    const to = fs.existsSync(rel("concept-map", `${k}.html`)) ? `${k}.html` : `../category/${k}.html`;
    writes.set(rel("concept-map", `${a}.html`), stubHtml({
      title: escapeHtml(cat.CATEGORY_LABELS[a]) + " 개념 지도",
      canonical: `${BASE_URL}/${to.startsWith("../") ? to.slice(3) : "concept-map/" + to}`,
      refresh: to,
      bodyHtml: `이 분야는 <a href="${to}">${escapeHtml(labels[k])}</a> 분야로 통합되었습니다.`,
    }));
  }
  // 흡수 분야 페이지로 가던 용어 스텁(정리된 용어) → 대표 분야 페이지로
  const termsDir = rel("terms");
  const slugSet = new Set(nextTerms.map((t) => t.slug));
  let stubRewrites = 0;
  for (const f of fs.readdirSync(termsDir)) {
    if (!f.endsWith(".html") || slugSet.has(f.slice(0, -5))) continue;
    const p = path.join(termsDir, f);
    const html = fs.readFileSync(p, "utf8");
    if (!/category\//.test(html)) continue;
    let out = html;
    for (const [a, k] of absorbTo) {
      if (!out.includes(`category/${a}.html`)) continue;
      out = out.split(`category/${a}.html`).join(`category/${k}.html`)
        .split(`>${escapeHtml(cat.CATEGORY_LABELS[a])}</a>`).join(`>${escapeHtml(labels[k])}</a>`);
    }
    if (out !== html) { writes.set(p, out); stubRewrites++; }
  }

  // 영향받은 용어 페이지의 배지·JSON-LD 경로
  const lastmodFile = rel("data", "term-lastmod.json");
  const lastmod = fs.existsSync(lastmodFile) ? JSON.parse(fs.readFileSync(lastmodFile, "utf8")) : {};
  const bySlug = new Map(nextTerms.map((t) => [t.slug, t]));
  let pageUpdates = 0;
  for (const slug of affected) {
    const p = path.join(termsDir, `${slug}.html`);
    if (!fs.existsSync(p)) continue;
    const html = fs.readFileSync(p, "utf8");
    const out = updateTermPage(html, bySlug.get(slug), labels, lastmod[slug] && lastmod[slug].date);
    if (out !== html) { writes.set(p, out); pageUpdates++; }
  }

  const summary = {
    groups: groups.map((g) => ({ keeper: g.keeper, label: labels[g.keeper], renamedFrom: g.label ? cat.CATEGORY_LABELS[g.keeper] : undefined, absorb: g.absorb })),
    termsRecategorized: changed.length,
    subcategoryOutsideKeeperList: subMiss,
    termPagesUpdated: pageUpdates,
    termStubsRetargeted: stubRewrites,
    filesWritten: [...writes].filter(([, v]) => v !== null).length,
    filesDeleted: [...writes].filter(([, v]) => v === null).length,
    staleTextForRenamed: renamed.filter((g) => !g.description || !g.intro).map((g) => g.keeper),
    notes,
  };
  for (const g of summary.groups) log(`  ${g.keeper} [${g.label}${g.renamedFrom ? ` ← 이름 바뀜: ${g.renamedFrom}` : ""}] ← ${g.absorb.map((a) => `${a}[${cat.CATEGORY_LABELS[a]}]`).join(", ")}`);
  log(`용어 분야 변경 ${changed.length}개 · 용어 페이지 갱신 ${pageUpdates}개 · 용어 스텁 재지정 ${stubRewrites}개 · 쓰기 ${summary.filesWritten} · 삭제 ${summary.filesDeleted}`);
  if (subMiss) log(`주의: 하위 주제가 대표 분야 목록에 없는 용어 ${subMiss}개(분야 페이지에서 "기타"로 접힘)`);
  if (summary.staleTextForRenamed.length) log(`주의: 이름이 바뀐 분야의 설명·소개문은 옛 분야 기준 그대로: ${summary.staleTextForRenamed.join(", ")} (계획에 description/intro를 주면 바꿈)`);
  for (const n of notes) log("주의: " + n);
  if (dry) { log("[dry] 아무것도 쓰지 않음"); return summary; }

  // 쓰기 직전 terms.json 재확인(동시 편집 대비)
  if (fs.readFileSync(termsFile, "utf8") !== rawBefore) throw new Error("terms.json이 작업 중에 바뀌었습니다. 다시 실행하세요.");
  for (const [file, content] of writes) {
    if (content === null) { if (fs.existsSync(file)) fs.unlinkSync(file); continue; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  fs.writeFileSync(termsFile, serializeLike(rawBefore, nextTerms));
  const pn = rebuildPrevNext({ root, terms: nextTerms, categories: new Set([...absorbTo.keys(), ...byKeeper.keys()]) });
  log(`이전/다음 링크 다시 계산: ${pn.changed}개 페이지`);
  summary.prevNextChanged = pn.changed;
  return summary;
}

// 직접 고친 뒤 돌릴 생성 스크립트(대상 트리 안의 스크립트를 그 트리에서 실행).
const REBUILD = [
  "npm run build:terms-index",
  "node scripts/generate-category-short.js",
  "npm run build:learn",
  "npm run build:category-pages",
  "node scripts/taxonomy/build.js",
  "npm run build:sitemap",
];

function main() {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const has = (name) => process.argv.includes(name);
  const root = path.resolve(arg("--root") || path.join(__dirname, "..", ".."));
  let plan;
  if (arg("--plan")) plan = JSON.parse(fs.readFileSync(path.resolve(arg("--plan")), "utf8"));
  else if (arg("--in")) plan = planFromDocs(readDump(path.resolve(arg("--in"))));
  else { console.error("usage: node scripts/prune/apply-category-merge.js (--in <dump> | --plan <plan.json>) [--texts <json>] [--dry] [--root <dir>] [--rebuild]"); process.exit(1); }
  if (!plan.groups.length) { console.log("승인된 분야 병합이 없습니다."); return; }
  // 이름이 바뀌는 대표 분야의 새 설명·소개문(계획에 없으면 이 파일에서).
  const textsFile = path.resolve(arg("--texts") || path.join(__dirname, "category-merge-texts.json"));
  if (fs.existsSync(textsFile)) {
    const texts = JSON.parse(fs.readFileSync(textsFile, "utf8"));
    for (const g of plan.groups) {
      const t = texts[g.keeper];
      if (!t) continue;
      if (t.description && !g.description) g.description = t.description;
      if (t.intro && !g.intro) g.intro = t.intro;
    }
  }
  console.log(`대상: ${root}`);
  applyCategoryMerge({ plan, root, dry: has("--dry") });
  if (has("--dry")) return;
  if (has("--rebuild")) {
    // 한 단계가 실패해도(예: 기존 데이터 결함으로 멈추는 생성기) 나머지는 돌리고 끝에 모아 알린다.
    const failed = [];
    for (const cmd of REBUILD) {
      console.log(`\n$ ${cmd}`);
      try { execSync(cmd, { cwd: root, stdio: "inherit" }); } catch (e) { failed.push(cmd); }
    }
    if (failed.length) { console.error(`\n실패한 단계(원인을 고친 뒤 이것만 다시):\n  ${failed.join("\n  ")}`); process.exitCode = 1; }
    console.log("\n다음: npm test");
  } else {
    console.log("\n다음 순서로 다시 만든 뒤 npm test:\n  " + REBUILD.join("\n  "));
  }
}

if (require.main === module) main();

module.exports = {
  applyCategoryMerge, planFromDocs, readDump, isCategoryMergeDoc, validatePlan, mergeTerms,
  editCategoryData, checkCategoryData, evalCategoryData, dropInlineEntries, editGroupsJson, serializeLike, REBUILD,
};
