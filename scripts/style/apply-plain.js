// 본문 말투 일괄 적용: Tier A(결정적 변환)를 소스 데이터와 정적 HTML 에 반영한다. Tier C 는 건드리지 않고 덤프한다.
//
// 단계
//   lex      : 말뭉치(변환 전 terms/*.html main + terms.json definition)로 어휘목록을 만들어 .superpowers/lex.json 에 저장
//   sources  : terms.json definition, data/term-extras/*.json, scripts/enrich-data/*.json 의 본문 문자열만 제자리 치환(서식 보존)
//   html     : terms/*.html <main> 본문 변환 + Tier C 덤프 (병렬 샤드)
//   literal  : 템플릿 문장(생성기 문구) 잔여분을 새 문구로 치환
// 사용: node scripts/style/apply-plain.js <단계> [--root <repo>]
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const P = require("./to-plain.js");

const args = process.argv.slice(2);
const stage = args[0];
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(opt("root", path.join(__dirname, "..", "..")));
const work = path.join(root, ".superpowers");
fs.mkdirSync(work, { recursive: true });
const lexPath = path.join(work, "lex.json");

const TEMPLATE_MAP = new Map([
  ["아래는 용어의 쓰임을 보여 주려고 만든 예시로, 실제 논문에서 가져온 문장이 아닙니다.", "아래 예문은 용어의 쓰임을 보이려고 만든 것으로, 실제 논문 문장이 아니다."],
  ["표의 기준값은 위 문헌에 근거한 관례이며, 분야·학술지마다 다른 기준을 쓸 수 있습니다.", "표의 기준값은 위 문헌에 따른 관례이고, 분야·학술지마다 기준이 다를 수 있다."],
  ["이 용어를 직접 쓴 국내 논문 문장을 아직 수집하지 못했습니다.", "이 용어를 직접 쓴 국내 논문 문장은 아직 모으지 못했다."],
  ["수집되는 대로 출처와 함께 싣겠습니다.", "모이는 대로 출처와 함께 싣는다."],
  ["국내 학술지 논문에서 이 용어가 쓰인 문장을 그대로 옮겼습니다.", "국내 학술지 논문에서 이 용어가 쓰인 문장을 그대로 옮겼다."],
  ["제목·학술지·연도와 원문 링크를 함께 적었습니다.", "제목·학술지·연도와 원문 링크를 함께 적었다."],
  ["개념 설명용 모식도 — 실제 데이터가 아닙니다", "개념 설명용 모식도 — 실제 데이터가 아니다"],
  ["열이 고온부에서 저온부로 이동하는 열전달 개념을 나타냅니다.", "열이 고온부에서 저온부로 이동하는 열전달 개념을 나타낸다."],
  ["가상의 예입니다.", "가상의 예이다."],
]);

function loadLex() {
  const j = JSON.parse(fs.readFileSync(lexPath, "utf8"));
  const lex = P.newLexicon();
  for (const k of ["V", "A", "N"]) lex[k] = new Map(j[k]);
  return lex;
}

function mainOf(h) {
  const a = h.indexOf("<main"), b = h.lastIndexOf("</main>");
  return a < 0 || b <= a ? null : [a, b];
}

// ---------- lex ----------
function stageLex() {
  const lex = P.newLexicon();
  const dir = path.join(root, "terms");
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".html")) continue;
    const h = fs.readFileSync(path.join(dir, f), "utf8");
    const r = mainOf(h);
    if (!r) continue;
    P.addToLexicon(lex, P.plainForLexicon(h.slice(r[0], r[1])));
  }
  for (const t of JSON.parse(fs.readFileSync(path.join(root, "terms.json"), "utf8"))) if (t.definition) P.addToLexicon(lex, t.definition);
  fs.writeFileSync(lexPath, JSON.stringify({ V: [...lex.V], A: [...lex.A], N: [...lex.N] }));
  console.log("lex saved", lex.V.size, lex.A.size, lex.N.size);
}

// ---------- sources: JSON 문자열 제자리 치환 ----------
const STR_RE = /"(?:[^"\\]|\\.)*"/y;
function rewriteJson(raw, decide) {
  // decide(pathArray, value) -> 새 문자열 또는 null
  let out = "", i = 0, last = 0, n = 0;
  const stack = [];
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"') {
      STR_RE.lastIndex = i;
      const m = STR_RE.exec(raw);
      const tok = m[0];
      const top = stack[stack.length - 1];
      if (top && top.t === "o" && top.expectKey) {
        top.key = JSON.parse(tok);
        top.expectKey = false;
      } else {
        const p = stack.map((c) => (c.t === "o" ? c.key : c.idx));
        const v = JSON.parse(tok);
        const nv = decide(p, v);
        if (nv !== null && nv !== v) {
          out += raw.slice(last, i) + JSON.stringify(nv);
          last = i + tok.length;
          n++;
        }
      }
      i += tok.length;
      continue;
    }
    if (ch === "{") stack.push({ t: "o", key: null, expectKey: true });
    else if (ch === "[") stack.push({ t: "a", idx: 0 });
    else if (ch === "}" || ch === "]") stack.pop();
    else if (ch === ",") {
      const top = stack[stack.length - 1];
      if (top) { if (top.t === "o") top.expectKey = true; else top.idx++; }
    }
    i++;
  }
  return { text: out + raw.slice(last), changed: n };
}

function convStr(lex, s, mode) {
  if (mode === "html") return P.convertHtml(s, lex).html;
  const t = s.replace(/</g, "\u0003").replace(/>/g, "\u0004");
  return P.convertHtml(t, lex).html.replace(/\u0003/g, "<").replace(/\u0004/g, ">");
}

function stageSources() {
  const lex = loadLex();
  const stat = {};
  const doFile = (file, decide, label) => {
    const raw = fs.readFileSync(file, "utf8");
    const r = rewriteJson(raw, decide);
    if (r.changed) {
      JSON.parse(r.text); // 구문 검증
      fs.writeFileSync(file, r.text);
      stat[label] = (stat[label] || 0) + 1;
      stat[label + ":strings"] = (stat[label + ":strings"] || 0) + r.changed;
    }
  };
  doFile(path.join(root, "terms.json"), (p, v) => (p.length === 2 && p[1] === "definition" ? convStr(lex, v, "text") : null), "terms.json");
  const exDir = path.join(root, "data", "term-extras");
  for (const f of fs.readdirSync(exDir)) {
    if (!f.endsWith(".json")) continue;
    doFile(path.join(exDir, f), (p, v) => {
      const k = p.join(".").replace(/\.\d+/g, ".#");
      if (k === "sections.#.html" || k === "fixes.#.find" || k === "fixes.#.replace") return convStr(lex, v, "html");
      if (k === "compare.intro" || k === "compare.note" || k === "compare.rows.#.#") return convStr(lex, v, "text");
      return null;
    }, "term-extras");
  }
  const enDir = path.join(root, "scripts", "enrich-data");
  for (const f of fs.readdirSync(enDir)) {
    if (!f.endsWith(".json")) continue;
    doFile(path.join(enDir, f), (p, v) => (p[p.length - 1] === "why" || p[p.length - 1] === "deeper" ? convStr(lex, v, "text") : null), "enrich-data");
  }
  console.log(JSON.stringify(stat));
}

// ---------- html ----------
function stageHtmlShard(si, sn) {
  const lex = loadLex();
  const templates = new Set(TEMPLATE_MAP.keys());
  const dir = path.join(root, "terms");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort().filter((_, i) => i % sn === si);
  const cOut = [];
  let changed = 0, aCount = 0, tCount = 0;
  for (const f of files) {
    const fp = path.join(dir, f);
    const h = fs.readFileSync(fp, "utf8");
    const r = mainOf(h);
    if (!r) continue;
    const slug = f.slice(0, -5);
    const res = P.convertHtml(h.slice(r[0], r[1]), lex, { templates });
    for (const e of res.edits) {
      if (e.tier === "A") aCount++;
      else if (e.tier === "T") tCount++;
      else cOut.push({ slug, file: "terms/" + f, field_or_section: e.field, sentence: e.sentBefore, context: e.para, reason: e.rule });
    }
    const nh = h.slice(0, r[0]) + res.html + h.slice(r[1]);
    if (nh !== h) { fs.writeFileSync(fp, nh); changed++; }
  }
  fs.writeFileSync(path.join(work, `c-shard-${si}.jsonl`), cOut.map((o) => JSON.stringify(o)).join("\n") + (cOut.length ? "\n" : ""));
  fs.writeFileSync(path.join(work, `html-shard-${si}.json`), JSON.stringify({ files: files.length, changed, aCount, tCount, c: cOut.length }));
}

function stageHtml() {
  const sn = +opt("shards", 6);
  let done = 0;
  for (let i = 0; i < sn; i++) {
    const c = cp.spawn(process.execPath, [__filename, "html-shard", "--root", root, "--i", String(i), "--n", String(sn)], { stdio: "inherit" });
    c.on("exit", (code) => {
      if (code) { console.error("shard", i, "failed", code); process.exitCode = 1; }
      if (++done === sn) finishHtml(sn);
    });
  }
}

function finishHtml(sn) {
  const all = [];
  const tot = { files: 0, changed: 0, aCount: 0, tCount: 0, c: 0 };
  for (let i = 0; i < sn; i++) {
    const t = fs.readFileSync(path.join(work, `c-shard-${i}.jsonl`), "utf8");
    for (const l of t.split("\n")) if (l) all.push(JSON.parse(l));
    const s = JSON.parse(fs.readFileSync(path.join(work, `html-shard-${i}.json`), "utf8"));
    for (const k of Object.keys(tot)) tot[k] += s[k];
  }
  all.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const per = {};
  all.forEach((o, i) => { per[o.slug] = (per[o.slug] || 0) + 1; o.id = o.slug + "#" + per[o.slug]; });
  const lines = all.map((o) => JSON.stringify({ id: o.id, slug: o.slug, file: o.file, field_or_section: o.field_or_section, sentence: o.sentence, context: o.context, reason: o.reason }));
  fs.writeFileSync(path.join(work, "tierc.jsonl"), lines.join("\n") + "\n");
  const per6 = Math.ceil(lines.length / 6);
  for (let k = 0; k < 6; k++) fs.writeFileSync(path.join(work, `tierc-${k + 1}.jsonl`), lines.slice(k * per6, (k + 1) * per6).join("\n") + "\n");
  console.log(JSON.stringify({ ...tot, tierC: lines.length }));
}

// ---------- literal ----------
function stageLiteral() {
  const dir = path.join(root, "terms");
  let changed = 0;
  const cnt = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".html")) continue;
    const fp = path.join(dir, f);
    let h = fs.readFileSync(fp, "utf8");
    let o = h;
    for (const [a, b] of TEMPLATE_MAP) if (o.includes(a)) { o = o.split(a).join(b); cnt[a] = (cnt[a] || 0) + 1; }
    if (o !== h) { fs.writeFileSync(fp, o); changed++; }
  }
  console.log(changed, JSON.stringify(cnt));
}


// ---------- head ----------
// <title>, meta/og description, JSON-LD description 의 정의 조각을 같은 규칙으로 해라체로 바꾼다.
// 손으로 고친 제목·날짜·관련 링크 등 다른 곳은 건드리지 않는다(생성기를 다시 돌리면 손질한 제목이 덮인다).
function stageHead() {
  const lex = loadLex();
  const dir = path.join(root, "terms");
  const st = { pages: 0, changed: 0 };
  const cv = (x) => convStr(lex, x, "text");
  const TAIL = "정리했습니다 - 논문용어사전";
  const fixDesc = (v) => cv(v.split(TAIL).join("정리했다 - 논문용어사전"));
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".html")) continue;
    const fp = path.join(dir, f);
    const h = fs.readFileSync(fp, "utf8");
    const i = h.indexOf("</head>");
    if (i < 0) continue;
    st.pages++;
    let head = h.slice(0, i);
    head = head
      .replace(/(<meta name="description" content=")([^"]*)(">)/, (m, a, v, c) => a + fixDesc(v) + c)
      .replace(/(<meta property="og:description" content=")([^"]*)(">)/, (m, a, v, c) => a + fixDesc(v) + c)
      .replace(/("description": ")((?:[^"\\]|\\.)*)(")/, (m, a, v, c) => a + fixDesc(v) + c)
      .replace(/(<title>)([^<]*?)( \| 논문용어사전<\/title>)/, (m, a, v, c) => {
        const o = cv(v + ".");
        return a + (o.endsWith(".") ? o.slice(0, -1) : v) + c;
      });
    if (head !== h.slice(0, i)) {
      st.changed++;
      fs.writeFileSync(fp, head + h.slice(i));
    }
  }
  console.log(JSON.stringify(st));
}

if (stage === "lex") stageLex();
else if (stage === "sources") stageSources();
else if (stage === "html") stageHtml();
else if (stage === "html-shard") stageHtmlShard(+opt("i"), +opt("n"));
else if (stage === "literal") stageLiteral();
else if (stage === "head") stageHead();
else { console.error("단계: lex|sources|html|literal"); process.exit(2); }
