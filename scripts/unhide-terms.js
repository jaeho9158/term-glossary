// 숨긴 용어를 다시 공개한다(hide-terms.js --slugs 의 역연산, 멱등).
// 사용: node scripts/unhide-terms.js --slugs <파일> [--dry] [--tag before-hide-unchecked]
// 원본은 태그 판(기본 before-hide-unchecked). 하는 일:
//   1) terms.json: 태그 판 항목을 전체 순서(viewer-hidden-terms 의 order) 자리에 되넣고, 남은 용어의 related·prerequisites 에서 뺐던 대상 slug 를 태그 판 위치에 되넣는다.
//      data/viewer-hidden-terms.json 에서 대상을 뺀다. data/popular-terms.json 도 태그 판 위치에 되넣는다(GA 없이 재생성하면 순위가 바뀌므로).
//   2) terms/<slug>.html: 태그 판 페이지에 그 뒤 공통 변경(관련 용어 블록 재생성, 아직 숨긴 용어 링크 벗기기, stage-link, 그림 받기·후원 스크립트 태그, 검수 표시)을 다시 적용.
//      숨김 때 지운 리다이렉트 스텁 중 대상으로 가는 것도 되살린다.
//   3) 숨김 커밋이 고친 공개 파일(HTML·보조 JSON)에서 대상 slug 로 가던 링크를 앞뒤 문맥으로 찾아 되돌린다(restoreLinks).
//   4) 관련 용어 블록(대상과 대상을 가리키는 페이지만)·이전/다음 링크를 기존 생성 규칙으로 다시 만든다.
// 파생 파일(분야 목록·사이트맵·검색 색인·피드·영문 표본)은 이 스크립트가 끝난 뒤 출력되는 명령으로 다시 만든다.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { unlinkHidden } = require("./hide-terms.js");
const { filterRelatedLinks } = require("./lib/index-tier.js");
const { computeUpdates } = require("./generate-related-html.js");
const { applyStage } = require("./apply-term-seo.js");
const { syncFigureDownloadTag } = require("./lib/figure-download-tag.js");
const { applyToHtml, levelOf, readMap } = require("./apply-reviewed-badge.js");
const { rebuildPrevNext } = require("./prune/rebuild-prevnext.js");

const ROOT = path.join(__dirname, "..");
const HIDE_COMMITS = ["6a4a00ae8", "99dfeed07", "3146f3cbc"];
const CTX = 15;
const BACK = '<script src="../assets/term-back-nav.js"></script>';
const SUPPORT = '<script src="../assets/support.js"></script>';

// ---------- 링크 복원(순수 함수) ----------
// 태그를 벗긴 글자와, 글자 하나하나의 원문 위치.
function stripMap(raw) {
  let text = "";
  const map = [];
  for (let i = 0; i < raw.length; ) {
    if (raw[i] === "<") {
      const j = raw.indexOf(">", i);
      if (j !== -1) { i = j + 1; continue; }
    }
    text += raw[i];
    map.push(i);
    i++;
  }
  return { text, map };
}

// <a ...>글자</a>. JSON 안의 \" 도 받는다.
const ANCHOR_RE = /<a\b[^>]*?\bhref=\\?"([^"\\]*)\\?"[^>]*>([\s\S]*?)<\/a>/g;

// href 가 가리키는 용어 slug(용어 페이지가 아니면 null). inTerms: 파일이 terms/ 안에 있음.
function slugOfHref(href, inTerms) {
  const m = /^(?:\.\/|\.\.\/terms\/|\/terms\/|terms\/)?([^\/"#?]+)\.html(?:#.*)?$/.exec(href);
  if (!m) return null;
  const prefixed = /^(?:\.\.\/terms\/|\/terms\/|terms\/)/.test(href);
  if (!inTerms && !prefixed) return null;
  if (inTerms && /^(?:\.\.\/|\/)/.test(href)) return null;
  let s = m[1];
  try { s = decodeURIComponent(s); } catch { /* 그대로 */ }
  return s;
}

const insideAnchor = (raw, pos) => raw.lastIndexOf("<a ", pos) > raw.lastIndexOf("</a>", pos);
// 글자 구간 안의 태그가 짝이 맞는지(구간이 문단 경계를 걸치면 감싸지 않는다).
function balanced(inner) {
  const stack = [];
  for (const m of inner.matchAll(/<(\/?)([a-zA-Z0-9]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) stack.push(m[2].toLowerCase());
    else if (stack.pop() !== m[2].toLowerCase()) return false;
  }
  return stack.length === 0;
}

// 제외 구간(관련 용어 블록·이전/다음)은 생성 스크립트가 다시 만든다.
function skipRanges(raw) {
  const out = [];
  for (const re of [/<div class="related-terms">[\s\S]*?<\/div>/g, /<nav class="term-pager"[\s\S]*?<\/nav>/g]) {
    for (const m of raw.matchAll(re)) out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

// tagHtml 안에서 targets(slug 집합)로 가던 링크를, cur 에서 같은 문맥(태그 제거 기준 앞 15자+글자+뒤 15자)의 맨 글자를 찾아 되돌린다.
// 반환 {html, restored, already, failed, failedSamples}
function restoreLinks(tagHtml, cur, targets, { inTerms = true } = {}) {
  const skip = skipRanges(tagHtml);
  const tag = stripMap(tagHtml);
  const anchors = [];
  for (const m of tagHtml.matchAll(ANCHOR_RE)) {
    const s = slugOfHref(m[1], inTerms);
    if (!s || !targets.has(s)) continue;
    if (skip.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const open = m[0].slice(0, m[0].length - m[2].length - 4);
    // 태그 판 글자 위치: 여는 태그 뒤 첫 글자
    const innerStart = m.index + open.length;
    let lo = 0, hi = tag.map.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tag.map[mid] < innerStart) lo = mid + 1; else hi = mid; }
    const a = lo < tag.map.length ? lo : -1;
    const len = stripMap(m[2]).text.length;
    if (a < 0 || !len) continue;
    anchors.push({ open, pre: tag.text.slice(Math.max(0, a - CTX), a), word: tag.text.slice(a, a + len), post: tag.text.slice(a + len, a + len + CTX) });
  }
  let html = cur;
  let restored = 0, already = 0, failed = 0;
  const failedSamples = [];
  let c = anchors.length ? stripMap(html) : null;
  for (const k of anchors) {
    const key = k.pre + k.word + k.post;
    let done = false, found = false;
    for (let at = c.text.indexOf(key); at !== -1; at = c.text.indexOf(key, at + 1)) {
      const ti = at + k.pre.length;
      let start = c.map[ti];
      let end = c.map[ti + k.word.length - 1] + 1;
      if (insideAnchor(html, start)) { found = true; continue; }
      const inner = html.slice(start, end);
      if (!balanced(inner)) continue;
      const SP = '<span class="rt-plain">';
      if (html.slice(start - SP.length, start) === SP && html.startsWith("</span>", end)) { start -= SP.length; end += 7; }
      html = html.slice(0, start) + k.open + inner + "</a>" + html.slice(end);
      restored++; done = true;
      c = stripMap(html);
      break;
    }
    if (done) continue;
    if (found) already++;
    else { failed++; if (failedSamples.length < 5) failedSamples.push(key); }
  }
  return { html, restored, already, failed, failedSamples };
}

// cur 목록에 없는 targets 원소를 tagList 에서의 위치(앞 원소 바로 뒤)에 끼운다.
function insertMissing(cur, tagList, targets) {
  const out = [...cur];
  tagList.forEach((s, i) => {
    if (!targets.has(s) || out.includes(s)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const k = out.indexOf(tagList[j]); if (k !== -1) { at = k + 1; break; } }
    out.splice(at, 0, s);
  });
  return out;
}

// ---------- 실행 ----------
const git = (args) => execFileSync("git", args, { cwd: ROOT, maxBuffer: 1 << 30 }).toString("utf8");
// 태그 판 파일을 한 번에 읽어 둔다(git show 수천 번은 너무 느리다).
const blobCache = new Map();
function prefetch(tag, paths) {
  const want = [...new Set(paths)].filter((p) => !blobCache.has(`${tag}:${p}`));
  if (!want.length) return;
  const buf = execFileSync("git", ["cat-file", "--batch"], { cwd: ROOT, input: want.map((p) => `${tag}:${p}`).join("\n") + "\n", maxBuffer: 2 ** 31 - 1 });
  let i = 0;
  for (const p of want) {
    const nl = buf.indexOf(10, i);
    const head = buf.slice(i, nl).toString();
    i = nl + 1;
    if (/ missing$/.test(head)) { blobCache.set(`${tag}:${p}`, null); continue; }
    const size = +head.split(" ")[2];
    blobCache.set(`${tag}:${p}`, buf.slice(i, i + size).toString("utf8"));
    i += size + 1;
  }
}
const gitShow = (tag, p) => { const k = `${tag}:${p}`; if (!blobCache.has(k)) prefetch(tag, [p]); return blobCache.get(k); };
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
// 작업 트리는 CRLF(core.autocrlf), git 원본은 LF라 맞춘다.
const crlf = (h) => (h == null ? h : h.replace(/\r?\n/g, "\r\n"));
const nlOf = (h) => (h.includes("\r\n") ? "\r\n" : "\n");

function addSupportTag(html) {
  if (html.includes(SUPPORT) || !html.includes(BACK)) return html;
  return html.replace(BACK, BACK + nlOf(html) + SUPPORT);
}

function run() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
  const dry = process.argv.includes("--dry");
  const TAG = arg("--tag") || "before-hide-unchecked";
  const S = new Set(fs.readFileSync(arg("--slugs"), "utf8").split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
  const written = new Set();
  const write = (rel, content) => {
    const p = path.join(ROOT, rel);
    if (fs.existsSync(p) && fs.readFileSync(p, "utf8") === content) return;
    written.add(rel.replace(/\\/g, "/"));
    if (!dry) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); }
  };

  // 1) 데이터
  const tagTerms = JSON.parse(gitShow(TAG, "terms.json"));
  const tagBy = new Map(tagTerms.map((t) => [t.slug, t]));
  const cur = readJson("terms.json");
  const curSet = new Set(cur.map((t) => t.slug));
  const missing = [...S].filter((s) => !tagBy.has(s));
  if (missing.length) throw new Error("태그 판 terms.json에 없는 slug: " + missing.slice(0, 5).join(", "));
  const vhidden = readJson("data/viewer-hidden-terms.json");
  // generate-viewer-index.js 와 같은 방식으로 전체 순서를 복원한다.
  const full = [];
  for (const t of vhidden) full[t.order] = t;
  for (let i = 0, p = 0; p < cur.length; i++) if (!full[i]) full[i] = cur[p++];
  const finalSet = new Set([...curSet, ...S]);
  const curBy = new Map(cur.map((t) => [t.slug, t]));
  const next = full.filter((t) => t && finalSet.has(t.slug)).map((t) => (curBy.has(t.slug) ? curBy.get(t.slug) : { ...tagBy.get(t.slug) }));
  const lost = [...S].filter((s) => !next.some((t) => t.slug === s));
  if (lost.length) throw new Error("전체 순서에서 자리를 못 찾은 slug: " + lost.slice(0, 5).join(", "));
  const newly = [...S].filter((s) => !curSet.has(s));
  const stillHidden = new Set(tagTerms.map((t) => t.slug).filter((s) => !finalSet.has(s)));
  let relFixed = 0;
  for (const t of next) {
    const tt = tagBy.get(t.slug);
    for (const k of ["related", "prerequisites"]) {
      if (S.has(t.slug)) { if (t[k]) t[k] = t[k].filter((s) => finalSet.has(s)); continue; }
      if (!tt || !tt[k]) continue;
      const v = insertMissing(t[k] || [], tt[k], S);
      if (v.length !== (t[k] || []).length) { t[k] = v; relFixed++; }
    }
  }
  write("terms.json", JSON.stringify(next, null, 2) + "\n");
  write("data/viewer-hidden-terms.json", JSON.stringify(vhidden.filter((t) => !S.has(t.slug))));
  const pop = readJson("data/popular-terms.json");
  const tagPop = JSON.parse(gitShow(TAG, "data/popular-terms.json"));
  for (const c of Object.keys(pop)) if (tagPop[c]) pop[c] = insertMissing(pop[c], tagPop[c], S);
  write("data/popular-terms.json", JSON.stringify(pop));
  console.log(`terms.json ${cur.length} -> ${next.length} (새로 공개 ${newly.length}) · related/prerequisites 복원 ${relFixed}`);

  // 2) 대상 페이지 원본 + 3) 공개 파일 링크 복원 (메모리)
  const pages = new Map(); // rel -> html
  prefetch(TAG, [...S].map((s) => `terms/${s}.html`));
  for (const s of S) {
    const rel = `terms/${s}.html`;
    const h = fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : crlf(gitShow(TAG, rel));
    if (h == null) throw new Error("태그 판에 페이지 없음: " + rel);
    pages.set(rel, h);
  }
  const touched = new Set();
  const stubs = [];
  const deleted = [];
  for (const c of HIDE_COMMITS) {
    for (const line of git(["show", "--name-status", "--format=", c]).split("\n")) {
      const [st, f] = line.split("\t");
      if (!f) continue;
      if (st === "M") touched.add(f);
      if (st === "D" && f.startsWith("terms/") && !S.has(f.slice(6, -5)) && !fs.existsSync(path.join(ROOT, f))) deleted.push(f);
    }
  }
  prefetch(TAG, deleted);
  for (const f of deleted) {
    const h = gitShow(TAG, f);
    const m = h && /http-equiv="refresh" content="0; url=([^"]+)\.html"/.exec(h);
    if (m && S.has(m[1])) stubs.push([f, crlf(h)]);
  }
  prefetch(TAG, [...touched, ...[...S].map((s) => `terms/${s}.html`)]);
  // 생성 스크립트가 다시 만드는 파일은 건너뛴다.
  const GENERATED = /^(category\/|category\.html$|sitemap|feed\.xml$|home-data\.json$|terms(-lite|-index)?\.json$|viewer|data\/(category-short|popular-terms|term-lastmod|viewer-hidden-terms)|en\/)/;
  const link = { restored: 0, already: 0, failed: 0, files: 0, samples: [] };
  for (const f of [...touched].sort()) {
    if (GENERATED.test(f) || S.has(f.replace(/^terms\/|\.html$/g, ""))) continue;
    if (!/\.(html|json)$/.test(f)) continue;
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    let tagHtml = gitShow(TAG, f);
    if (tagHtml == null) continue;
    const before = pages.get(f) ?? fs.readFileSync(p, "utf8");
    if (before.includes("\r\n")) tagHtml = crlf(tagHtml);
    const r = restoreLinks(tagHtml, before, S, { inTerms: f.startsWith("terms/") || f.endsWith(".json") });
    let out = r.html;
    // 그림 데이터의 "link": null 은 태그 판 값으로 되돌린다.
    if (f.startsWith("data/illus/")) {
      const tj = JSON.parse(tagHtml), cj = JSON.parse(out);
      const walk = (a, b) => {
        if (!a || !b || typeof a !== "object") return;
        for (const k of Object.keys(b)) {
          if (k === "link" && b[k] === null && typeof a[k] === "string" && S.has((/\/terms\/([^\/]+)\.html/.exec(a[k]) || [])[1])) { b[k] = a[k]; link.restored++; }
          else walk(a[k], b[k]);
        }
      };
      walk(tj, cj);
      const ind = /^\s*\{\s*\n(\s+)/.exec(out);
      const restoredJson = JSON.stringify(cj, null, ind ? ind[1].length : 2) + (out.endsWith("\n") ? "\n" : "");
      if (JSON.stringify(JSON.parse(out)) !== JSON.stringify(cj)) out = restoredJson;
    }
    link.restored += r.restored; link.already += r.already; link.failed += r.failed;
    if (r.failed && link.samples.length < 10) link.samples.push(`${f}: ${r.failedSamples[0]}`);
    if (out !== before) { pages.set(f, out); link.files++; }
  }

  // 4) 관련 용어 블록: 대상 페이지 + 태그 판 관련 용어 블록이 대상을 가리키던 페이지
  const tiersPath = path.join(ROOT, "data", "index-tiers.json");
  const archiveSet = fs.existsSync(tiersPath) ? new Set(readJson("data/index-tiers.json").archive) : null;
  const relTargets = new Set(S);
  for (const t of next) if (!S.has(t.slug) && (t.related || []).some((s) => S.has(s))) relTargets.add(t.slug);
  for (const f of touched) {
    const m = /^terms\/(.+)\.html$/.exec(f);
    if (!m || !finalSet.has(m[1])) continue;
    const th = gitShow(TAG, f);
    const blk = th && /<div class="related-terms">[\s\S]*?<\/div>/.exec(th);
    if (blk && [...blk[0].matchAll(/href="([^"]+)\.html"/g)].some((x) => S.has(x[1]))) relTargets.add(m[1]);
  }
  const readHtml = (slug) => {
    if (!relTargets.has(slug)) return null;
    const rel = `terms/${slug}.html`;
    if (pages.has(rel)) return pages.get(rel);
    return fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : null;
  };
  const ru = computeUpdates(next, readHtml, archiveSet);
  const relErr = ru.errors.filter((e) => !e.startsWith("HTML 파일이 없는"));
  if (relErr.length) throw new Error(relErr.join("\n"));
  for (const { slug, html } of ru.updates) pages.set(`terms/${slug}.html`, html);

  // 대상 페이지 공통 후처리
  const reviewed = readMap("reviewed.json");
  const checked = readMap("source-checked.json");
  for (const s of S) {
    const rel = `terms/${s}.html`;
    let h = pages.get(rel);
    h = unlinkHidden(filterRelatedLinks(h, stillHidden).html, stillHidden);
    h = applyStage(h, tagBy.get(s));
    h = addSupportTag(syncFigureDownloadTag(h));
    const lv = levelOf(s, reviewed, checked);
    h = lv ? applyToHtml(h, lv[0], lv[1]) : applyToHtml(h, null);
    pages.set(rel, h);
  }
  for (const [f, h] of stubs) pages.set(f, h);
  for (const [rel, h] of pages) write(rel, h);

  // 이전/다음: 대상이 속한 첫 분야만
  const cats = new Set([...S].map((s) => (tagBy.get(s).categories || [])[0] || "none"));
  let pn = { changed: 0 };
  if (!dry) {
    pn = rebuildPrevNext({ root: ROOT, terms: next, categories: cats });
    // shortcut: title_ko 에 첨자가 없어 쪽 이동 링크의 CO2 아래첨자만 되살린다(99dfeed07 과 같음). 다른 첨자가 생기면 표로 늘린다.
    for (const t of next) {
      if (!cats.has((t.categories || [])[0] || "none")) continue;
      const p = path.join(ROOT, "terms", `${t.slug}.html`);
      if (!fs.existsSync(p)) continue;
      const h = fs.readFileSync(p, "utf8");
      const out = h.replace(/<nav class="term-pager"[\s\S]*?<\/nav>|<div class="related-terms">[\s\S]*?<\/div>/g, (blk) => blk.replace(/>CO2(?= )|← 이전: CO2(?= )|다음: CO2(?= )/g, (m) => m.replace("CO2", "CO<sub>2</sub>")));
      if (out !== h) { fs.writeFileSync(p, out); written.add(`terms/${t.slug}.html`); }
    }
  }
  else {
    const changedPages = [...pages.keys()].filter((r) => r.startsWith("terms/"));
    pn.changed = `(dry: 실제 쓰기 전이라 계산 생략, 분야 ${cats.size}개)`;
    void changedPages;
  }
  for (const s of pn.changedSlugs || []) written.add(`terms/${s}.html`);

  console.log(`페이지 복원 ${S.size}(스텁 ${stubs.length}) · 링크 복원 ${link.restored} · 이미 링크 ${link.already} · 실패 ${link.failed} · 링크 고친 파일 ${link.files}`);
  if (link.samples.length) console.log("실패 예:\n  " + link.samples.join("\n  "));
  console.log(`관련 용어 블록 재생성 ${ru.updates.length}/${relTargets.size} · 이전/다음 변경 ${pn.changed}`);
  console.log(`${dry ? "(dry) 바뀔" : "바뀐"} 파일 ${written.size}개`);
  const outList = arg("--changed");
  if (outList) fs.writeFileSync(outList, [...written].sort().join("\n") + "\n");
  console.log("다음: node scripts/apply-term-extras.js && node scripts/generate-category-pages.js && node scripts/build-category-links.js && node scripts/generate-category-short.js && node scripts/generate-en-pages.js && npm run build:terms-index && npm run build:sitemap && npm run build:feed");
}

if (require.main === module) run();
module.exports = { restoreLinks, insertMissing, stripMap, slugOfHref };
