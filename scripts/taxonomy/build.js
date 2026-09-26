// 개념 계통(상위·하위 관계)을 용어 페이지와 분야별 개념 지도에 반영한다.
//
//   node scripts/taxonomy/build.js            taxonomy/broader.json 반영
//   node scripts/taxonomy/build.js --dry-run  바뀔 페이지 수만 출력
//
// 데이터: taxonomy/broader.json  { "<slug>": { "broader": "<상위 slug>", "relation": "type-of"|"part-of" } }
// - 용어 페이지: 제목 아래 경로(신경계 › 말초신경계 › 체성신경계), '관련 용어' 위에 상위·같은 갈래·하위 칩.
// - 개념 지도: concept-map/<분야>.html 에 접고 펴는 트리.
// 마커 사이만 다시 쓰므로 여러 번 돌려도 안전하고, 관계가 빠진 페이지에서는 블록을 걷어낸다.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "taxonomy", "broader.json");
const MANIFEST = path.join(ROOT, "taxonomy", "inserted.json");
const MAP_DIR = path.join(ROOT, "concept-map");
const P_START = "<!-- concept-path:start -->", P_END = "<!-- concept-path:end -->";
const F_START = "<!-- concept-family:start -->", F_END = "<!-- concept-family:end -->";
const P_BLOCK = /(?:\r?\n)?[ \t]*<!-- concept-path:start -->[\s\S]*?<!-- concept-path:end -->/;
const F_BLOCK = /(?:\r?\n)?[ \t]*<!-- concept-family:start -->[\s\S]*?<!-- concept-family:end -->/;
const SIBLING_MAX = 12;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 검증: 존재하지 않는 slug, 자기 참조, 사이클
function validate(links, known) {
  const errs = [];
  for (const [slug, v] of Object.entries(links)) {
    if (!known.has(slug)) errs.push(`${slug}: terms.json에 없음`);
    if (!known.has(v.broader)) errs.push(`${slug}: 상위 ${v.broader}가 terms.json에 없음`);
    if (slug === v.broader) errs.push(`${slug}: 자기 자신이 상위`);
    if (!["type-of", "part-of"].includes(v.relation)) errs.push(`${slug}: relation ${v.relation}`);
  }
  for (const start of Object.keys(links)) {
    const seen = new Set([start]);
    let cur = links[start].broader;
    while (cur && links[cur]) {
      if (seen.has(cur)) { errs.push(`${start}: 사이클`); break; }
      seen.add(cur);
      cur = links[cur].broader;
    }
  }
  return errs;
}

function buildIndex(links) {
  const children = new Map();
  for (const [slug, v] of Object.entries(links)) {
    if (!children.has(v.broader)) children.set(v.broader, []);
    children.get(v.broader).push(slug);
  }
  const ancestors = (slug) => {
    const out = [];
    let cur = links[slug] && links[slug].broader;
    while (cur) { out.unshift(cur); cur = links[cur] && links[cur].broader; }
    return out;
  };
  const rootOf = (slug) => ancestors(slug)[0] || slug;
  return { children, ancestors, rootOf };
}

const link = (slug, titles) => `<a href="${esc(slug)}.html">${esc(titles.get(slug) || slug)}</a>`;

function pathHtml(slug, idx, titles) {
  const anc = idx.ancestors(slug);
  if (!anc.length) return "";
  return `<nav class="concept-path" aria-label="개념 위치">${anc.map((s) => link(s, titles)).join('<span class="concept-path-sep" aria-hidden="true">›</span>')}<span class="concept-path-sep" aria-hidden="true">›</span><span aria-current="page">${esc(titles.get(slug) || slug)}</span></nav>`;
}

function familyHtml(slug, links, idx, titles, mapHref) {
  const up = links[slug] && links[slug].broader;
  const kids = (idx.children.get(slug) || []).slice().sort((a, b) => (titles.get(a) || a).localeCompare(titles.get(b) || b, "ko"));
  const sibs = up ? (idx.children.get(up) || []).filter((s) => s !== slug).sort((a, b) => (titles.get(a) || a).localeCompare(titles.get(b) || b, "ko")) : [];
  if (!up && !kids.length) return "";
  const row = (label, items, more) => items.length
    ? `<div class="concept-family-row"><span class="concept-family-label">${label}</span><div class="related-terms">${items.map((s) => link(s, titles)).join("")}${more ? `<span class="concept-family-more">외 ${more}개</span>` : ""}</div></div>`
    : "";
  return `<section class="concept-family" aria-labelledby="concept-family-h"><h2 id="concept-family-h">개념 계통</h2>${
    row("상위 개념", up ? [up] : [])}${
    row("같은 갈래", sibs.slice(0, SIBLING_MAX), Math.max(0, sibs.length - SIBLING_MAX))}${
    row("하위 개념", kids)}${
    mapHref ? `<p class="concept-family-map"><a href="${mapHref}">분야 전체 개념 지도 보기 →</a></p>` : ""}</section>`;
}

// 순수 함수(테스트 대상)
function applyBlocks(html, pathBlock, familyBlock) {
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  let out = html.replace(P_BLOCK, "").replace(F_BLOCK, "");
  if (pathBlock) {
    const m = /<h1>[\s\S]*?<\/h1>/.exec(out);
    if (!m) return null;
    const at = m.index + m[0].length;
    out = out.slice(0, at) + `${nl}  ${P_START}${pathBlock}${P_END}` + out.slice(at);
  }
  if (familyBlock) {
    const m = /[ \t]*<h2>관련 용어<\/h2>/.exec(out);
    const at = m ? m.index : out.indexOf("</main>");
    if (at < 0) return null;
    out = out.slice(0, at) + `  ${F_START}${familyBlock}${F_END}${nl}` + out.slice(at);
  }
  return out;
}

const H_BLOCK = /(?:\r?\n)?[ \t]*<!-- concept-map-link:start -->[\s\S]*?<!-- concept-map-link:end -->/;
function applyHubLink(html, block) {
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  let out = html.replace(H_BLOCK, "");
  if (!block) return out;
  const m = /<p class="subtitle">[\s\S]*?<\/p>/.exec(out) || /<h1>[\s\S]*?<\/h1>/.exec(out);
  if (!m) return null;
  const at = m.index + m[0].length;
  return out.slice(0, at) + `${nl}  <!-- concept-map-link:start -->${block}<!-- concept-map-link:end -->` + out.slice(at);
}

function mapPage(cat, catName, slugs, idx, titles, template, subOf) {
  const roots = [...new Set(slugs.map((s) => idx.rootOf(s)))].filter((r) => (idx.children.get(r) || []).length)
    .sort((a, b) => (titles.get(a) || a).localeCompare(titles.get(b) || b, "ko"));
  // 뿌리 하나 = 카드 하나. 카드 안에서 둘째 단계는 행, 셋째 단계 이하는 그 행의 작은 칩으로 보여
  // 들여쓰기 목록보다 "큰 개념 → 갈래 → 세부"가 한눈에 들어오게 한다.
  const kidsOf = (s) => (idx.children.get(s) || []).slice().sort((a, b) => (titles.get(a) || a).localeCompare(titles.get(b) || b, "ko"));
  const size = (s) => kidsOf(s).reduce((n, k) => n + 1 + size(k), 0);
  const deep = (s) => kidsOf(s).flatMap((k) => [k, ...deep(k)]);
  const a = (s, cls) => `<a class="${cls}" href="../terms/${esc(s)}.html">${esc(titles.get(s) || s)}</a>`;
  // 갈래 아래: 더 내려가지 않는 개념은 칩, 자기 하위가 있는 개념은 테두리 묶음(이름 + 그 아래 칩)으로
  // 한 번 더 묶어 셋째·넷째 단계가 한 줄에 섞이지 않게 한다.
  const leaves = (k) => {
    const ks = kidsOf(k);
    if (!ks.length) return "";
    const flat = ks.filter((x) => !kidsOf(x).length);
    const nested = ks.filter((x) => kidsOf(x).length);
    return `<span class="cmap-leaves">${flat.map((x) => a(x, "cmap-leaf")).join("")}${
      nested.map((x) => `<span class="cmap-sub">${a(x, "cmap-sub-head")}${deep(x).map((y) => a(y, "cmap-leaf")).join("")}</span>`).join("")}</span>`;
  };
  const card = (r) => `<article class="cmap-card"><h3 class="cmap-root">${a(r, "cmap-root-link")}<span class="cmap-count">${size(r)}</span></h3><ul class="cmap-branches">${
    kidsOf(r).map((k) => `<li class="cmap-branch">${a(k, "cmap-branch-link")}${leaves(k)}</li>`).join("")
  }</ul></article>`;
  // 뿌리 개념을 하위분류별로 묶고, 큰 계통부터 보여 준다. 하위 개념이 하나뿐인 작은 계통은 뒤에 모은다.
  const bySub = new Map();
  for (const r of roots) { const g = subOf.get(r) || "기타"; if (!bySub.has(g)) bySub.set(g, []); bySub.get(g).push(r); }
  const groups = [...bySub].sort((x, y) => y[1].reduce((n, r) => n + size(r), 0) - x[1].reduce((n, r) => n + size(r), 0));
  const section = ([g, rs], i) => {
    const big = rs.filter((r) => size(r) > 1).sort((x, y) => size(y) - size(x));
    const small = rs.filter((r) => size(r) === 1);
    return `<section class="cmap-section" id="g${i}"><h2>${esc(g)}</h2><div class="cmap-grid">${big.map(card).join("")}</div>${
      small.length ? `<div class="cmap-pairs"><span class="cmap-pairs-label">작은 갈래</span>${small.map((r) => `<span class="cmap-pair">${a(r, "cmap-pair-root")}<span aria-hidden="true">›</span>${a(kidsOf(r)[0], "cmap-pair-kid")}</span>`).join("")}</div>` : ""}</section>`;
  };
  const title = `${catName} 개념 지도`;
  const main = `<main class="delay-1 concept-map-page">
  <p class="breadcrumb"><a href="../index.html">용어 목록</a> &gt; <a href="../category/${cat}.html">${esc(catName)}</a> &gt; 개념 지도</p>
  <h1>${esc(title)}</h1>
  <p class="concept-map-lead">큰 개념(굵은 제목) 아래로 갈래와 세부 개념이 이어집니다. 이름을 누르면 용어 설명으로 이동합니다.</p>
  <nav class="cmap-toc" aria-label="하위분류">${groups.map(([g], i) => `<a href="#g${i}">${esc(g)}</a>`).join("")}</nav>
  ${groups.map(section).join("")}
</main>`;
  // 헤더·테마·분석 스크립트는 용어 페이지 한 장을 틀로 빌려 쓴다(같은 terms/ 깊이라 상대경로가 맞다).
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)} | 논문용어사전</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(catName)} 용어를 상위·하위 개념 계통으로 정리한 트리입니다.">`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="https://termglossary.kr/concept-map/${cat}.html">`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, "")
    .replace(/<meta property="og:[^>]*>\s*/g, "")
    .replace(/<main[\s\S]*<\/main>/, main)
    .replace(/<script[^>]*src="\.\.\/assets\/term-[^"]*"[^>]*><\/script>\s*/g, "");
}

const CAT_NAMES = require("../../assets/category-data.js").CATEGORY_LABELS;

function run() {
  const dry = process.argv.includes("--dry-run");
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const titles = new Map(terms.map((t) => [t.slug, t.title_ko]));
  const subOf = new Map(terms.map((t) => [t.slug, t.subcategory]));
  const catOf = new Map(terms.map((t) => [t.slug, t.categories[0]]));
  const links = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, "utf8")) : {};
  const errs = validate(links, new Set(titles.keys()));
  if (errs.length) { console.error(errs.join("\n")); process.exitCode = 1; return; }
  const idx = buildIndex(links);

  const involved = new Set([...Object.keys(links), ...Object.values(links).map((v) => v.broader)]);
  const cats = new Set([...involved].map((s) => catOf.get(s)).filter((c) => CAT_NAMES[c]));
  const previous = new Set(fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : []);
  let changed = 0;
  for (const slug of new Set([...involved, ...previous])) {
    const file = path.join(ROOT, "terms", `${slug}.html`);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, "utf8");
    const c = catOf.get(slug);
    const on = involved.has(slug);
    const next = applyBlocks(html,
      on ? pathHtml(slug, idx, titles) : "",
      on ? familyHtml(slug, links, idx, titles, CAT_NAMES[c] ? `../concept-map/${c}.html` : "") : "");
    if (next && next !== html) { changed++; if (!dry) fs.writeFileSync(file, next, "utf8"); }
  }
  if (!dry) {
    fs.mkdirSync(MAP_DIR, { recursive: true });
    for (const c of cats) {
      const slugs = terms.filter((t) => t.categories[0] === c && involved.has(t.slug)).map((t) => t.slug);
      fs.writeFileSync(path.join(MAP_DIR, `${c}.html`), mapPage(c, CAT_NAMES[c], slugs, idx, titles, fs.readFileSync(path.join(ROOT, "terms", "nmda-receptor.html"), "utf8"), subOf), "utf8");
    }
    // 분야 허브(정적 category/<분야>.html과 동적 category.html)에서 개념 지도로 가는 링크
    for (const c of Object.keys(CAT_NAMES)) {
      const hub = path.join(ROOT, "category", `${c}.html`);
      if (!fs.existsSync(hub)) continue;
      const html = fs.readFileSync(hub, "utf8");
      const next = applyHubLink(html, cats.has(c) ? `<p class="concept-map-cta"><a href="../concept-map/${c}.html">개념 지도로 계통 한눈에 보기 →</a></p>` : "");
      if (next && next !== html) fs.writeFileSync(hub, next, "utf8");
    }
    for (const f of fs.readdirSync(MAP_DIR)) {
      const c = f.replace(/.html$/, "");
      if (f.endsWith(".html") && !cats.has(c)) fs.unlinkSync(path.join(MAP_DIR, f));
    }
    fs.writeFileSync(path.join(ROOT, "assets", "concept-map-cats.js"),
      `// 생성 파일(scripts/taxonomy/build.js): 개념 지도가 있는 분야
window.CONCEPT_MAP_CATS = ${JSON.stringify([...cats].sort())};
`, "utf8");
    fs.writeFileSync(MANIFEST, JSON.stringify([...involved].sort(), null, 2) + "\n", "utf8");
  }
  console.log(`${dry ? "[dry-run] " : ""}관계 ${Object.keys(links).length} · 페이지 갱신 ${changed} · 개념 지도 ${[...cats].join(", ")}`);
}

if (require.main === module) run();
module.exports = { applyHubLink, validate, buildIndex, pathHtml, familyHtml, applyBlocks };
