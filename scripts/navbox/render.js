// 틀(navbox) 렌더러: data/navboxes/<id>.json → 접히는 <nav><details><table> HTML.
//
//   node scripts/navbox/render.js --dry            틀마다 어느 용어 페이지에 들어가는지 집계만 출력
//   node scripts/navbox/render.js --dry brain      한 틀만
//   node scripts/navbox/render.js --preview <dir>  단독 미리보기 HTML 을 <dir> 에 쓴다(실제 페이지는 건드리지 않음)
//   node scripts/navbox/render.js --write          실제 용어 페이지에 반영(파일럿 단계에서는 실행하지 않는다)
//
// 개념 계통(scripts/taxonomy/build.js)과 같은 방식: 마커 주석 사이만 다시 쓰므로 여러 번 돌려도 안전하고,
// 틀에서 빠진 페이지는 블록이 걷힌다. 개행(CRLF/LF)은 페이지 것을 따른다.
"use strict";
const fs = require("fs");
const path = require("path");
const { loadResolver, loadBoxes, resolveBox, normalizeBox, walkItems, formatReport, BOX_DIR } = require("./resolve");

const ROOT = path.join(__dirname, "..", "..");
const N_START = "<!-- navbox:start -->", N_END = "<!-- navbox:end -->";
const N_BLOCK = /(?:\r?\n)?[ \t]*<!-- navbox:start -->[\s\S]*?<!-- navbox:end -->/g;
const CSS_LINK = '<link rel="stylesheet" href="../assets/navbox.css">';
const CSS_LINE = /(?:\r?\n)?[ \t]*<link rel="stylesheet" href="\.\.\/assets\/navbox\.css">/;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// opts: { current?: slug, archiveLinks?: bool (기본 false: 보관 등급 용어는 링크 없이 글자만), open?: bool,
//         base?: 링크 접두("" 이면 용어 페이지 기준 상대경로 `<slug>.html`) }
function renderNavbox(box, results, opts = {}) {
  normalizeBox(box);
  const base = opts.base == null ? "" : opts.base;
  const itemHtml = (it) => {
    const r = results.get(it) || { status: "none" };
    const linkable = r.slug && (r.status === "core" || (r.status === "archive" && opts.archiveLinks));
    let inner;
    if (linkable && r.slug === opts.current) inner = `<strong class="navbox-current" aria-current="page">${esc(it.label)}</strong>`;
    else if (linkable) inner = `<a href="${esc(base)}${esc(r.slug)}.html">${esc(it.label)}</a>`;
    else inner = `<span class="navbox-plain">${esc(it.label)}</span>`;
    if (it.sub && it.sub.length) inner += ` <span class="navbox-paren">(</span>${list(it.sub)}<span class="navbox-paren">)</span>`;
    return `<li>${inner}</li>`;
  };
  const list = (items) => `<ul class="navbox-list">${items.map(itemHtml).join("")}</ul>`;
  const rows = (groups, depth) => `<table class="navbox-table navbox-d${Math.min(depth, 4)}"><tbody>${groups.map((g) => {
    const body = (g.items && g.items.length ? list(g.items) : "") + (g.groups && g.groups.length ? rows(g.groups, depth + 1) : "");
    return `<tr><th scope="row">${esc(g.label)}</th><td>${body}</td></tr>`;
  }).join("")}</tbody></table>`;
  const count = (() => { let n = 0; walkItems(box, () => n++); return n; })();
  const id = `navbox-${esc(box.id)}`;
  return `<nav class="navbox" aria-labelledby="${id}-t" data-navbox="${esc(box.id)}"><details${opts.open ? " open" : ""}><summary><span id="${id}-t" class="navbox-title">${esc(box.title)}</span><span class="navbox-count">${count}개 항목</span></summary>${rows(box.groups || [], 1)}</details></nav>`;
}

// 틀 안에서 링크가 되는 용어 slug 집합(= 이 틀이 들어갈 페이지 후보)
function pagesFor(report, { archiveLinks = false } = {}) {
  return new Set(report.rows.filter((r) => r.slug && (r.status === "core" || (archiveLinks && r.status === "archive"))).map((r) => r.slug));
}

// 순수 함수(테스트 대상). block 이 빈 문자열이면 틀을 걷어낸다.
function insertNavbox(html, block) {
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  let out = html.replace(N_BLOCK, "").replace(CSS_LINE, "");
  if (!block) return out;
  const wrapped = `  ${N_START}${block}${N_END}${nl}`;
  let at;
  const fam = /<!-- concept-family:end -->(?:\r?\n)?/.exec(out);
  if (fam) at = fam.index + fam[0].length;
  else {
    const h = /[ \t]*<h2>관련 용어<\/h2>/.exec(out);
    at = h ? h.index : out.indexOf("</main>");
  }
  if (at < 0) return null;
  const lead = fam && !/\n$/.test(out.slice(0, at)) ? nl : "";
  out = out.slice(0, at) + lead + wrapped + out.slice(at);
  const css = /<link rel="stylesheet" href="\.\.\/assets\/term-nav\.css">|<link rel="stylesheet" href="\.\.\/style\.css">/.exec(out);
  if (css) out = out.slice(0, css.index + css[0].length) + `${nl}${CSS_LINK}` + out.slice(css.index + css[0].length);
  else { const h = out.indexOf("</head>"); if (h >= 0) out = out.slice(0, h) + `${CSS_LINK}${nl}` + out.slice(h); }
  return out;
}

// 단독 미리보기 문서(사이트 style.css 와 navbox.css 를 가리킨다). cssBase 는 두 CSS 가 있는 폴더 URL.
function previewDoc(box, results, { cssBase, current, theme = "", archiveLinks = false, intro = "" } = {}) {
  const t = theme ? ` data-theme="${theme}"` : "";
  return `<!DOCTYPE html>
<html lang="ko"${t}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(box.title)} 틀 미리보기</title>
<link rel="stylesheet" href="${cssBase}style.css">
<link rel="stylesheet" href="${cssBase}assets/navbox.css">
</head>
<body>
<main style="max-width:var(--max-width);margin:0 auto;padding:1rem 16px 3rem">
<h1>${esc(current ? current.title : box.title + " 미리보기")}</h1>
<p>${esc(intro || "용어 본문이 끝난 뒤, 관련 용어 위에 이 틀이 들어갑니다. (미리보기: 실제 페이지에는 아직 반영되지 않았습니다.)")}</p>
${renderNavbox(box, results, { open: true, current: current && current.slug, base: "", archiveLinks })}
</main>
</body>
</html>
`;
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const write = args.includes("--write");
  const pi = args.indexOf("--preview");
  const previewDir = pi >= 0 ? args[pi + 1] : null;
  const ids = args.filter((a, i) => !a.startsWith("--") && !(pi >= 0 && i === pi + 1));
  if (!dry && !write && !previewDir) { console.error("--dry, --preview <dir>, --write 중 하나가 필요합니다."); process.exitCode = 1; return; }
  const resolver = loadResolver();
  const boxes = loadBoxes(BOX_DIR, ids);
  const reports = boxes.map((b) => ({ box: b, rep: resolveBox(b, resolver) }));

  if (previewDir) {
    fs.mkdirSync(previewDir, { recursive: true });
    for (const theme of ["", "dark"]) for (const { box, rep } of reports) {
      const file = path.join(previewDir, `${box.id}${theme ? "-dark" : ""}.html`);
      fs.writeFileSync(file, previewDoc(box, rep.results, { cssBase: "file:///" + ROOT.replace(/\\/g, "/") + "/", theme }), "utf8");
      console.log("wrote " + file);
    }
  }
  for (const { box, rep } of reports) {
    const pages = [...pagesFor(rep)].filter((s) => fs.existsSync(path.join(ROOT, "terms", s + ".html")));
    if (dry) console.log(formatReport(rep) + `\n  → 반영 대상 페이지 ${pages.length}개 (아직 쓰지 않음)\n`);
    if (write) {
      let changed = 0;
      for (const slug of pages) {
        const file = path.join(ROOT, "terms", slug + ".html");
        const html = fs.readFileSync(file, "utf8");
        const next = insertNavbox(html, renderNavbox(box, rep.results, { current: slug }));
        if (next && next !== html) { fs.writeFileSync(file, next, "utf8"); changed++; }
      }
      console.log(`${box.id}: ${changed}쪽 갱신`);
    }
  }
}

if (require.main === module) main();
module.exports = { renderNavbox, insertNavbox, pagesFor, previewDoc, N_START, N_END, CSS_LINK };
