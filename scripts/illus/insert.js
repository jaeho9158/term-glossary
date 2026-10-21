#!/usr/bin/env node
// 도해(illustration) 삽입: data/illus/<slug>.json → terms/<slug>.html
//   node scripts/illus/insert.js            반영(바뀐 페이지만 씀)
//   node scripts/illus/insert.js --dry-run  무엇이 바뀔지 출력만
//
// - 블록은 <!-- term-illus:start --> … <!-- term-illus:end --> 로 감싸고, 재실행하면 마커 사이만 갈아 끼운다.
// - 위치: 도식 블록(<!-- concept-diagram:end -->)이 있으면 그 뒤, 없으면 정의 박스 뒤.
//   도식 insert.js 는 정의 박스 바로 뒤에 넣으므로 나중에 도식이 생겨도 순서는 정의 → 도식 → 도해로 유지된다.
// - figure 클래스는 term-illus(도식 insert.js 가 지우는 term-figure 와 다름).
// - 코드 SVG(assets/illus/<slug>.svg)는 인라인으로 넣는다(사이트 CSS 변수로 다크 모드 색이 바뀜).
// - 위키미디어 공용 그림은 assets/illus 의 축소본을 loading="lazy" 로 넣고, 출처·라이선스를 그림 아래에 적는다.
// - 데이터에서 빠진 slug 는 data/illus/inserted.json 매니페스트로 찾아 블록을 지운다.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "data", "illus");
const MANIFEST = path.join(DATA_DIR, "inserted.json");
const START = "<!-- term-illus:start -->";
const END = "<!-- term-illus:end -->";
const CSS_HREF = "../assets/term-illus.css";
const BLOCK = /(?:\r?\n)?[ \t]*<!-- term-illus:start -->[\s\S]*?<!-- term-illus:end -->[ \t]*(?=\r?\n|$)/;
const DIAGRAM_END = /<!-- concept-diagram:end -->[ \t]*\r?\n/;
const DEF_BOX = /<div class="definition-box">[\s\S]*?<\/div>[ \t]*\r?\n/;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NO_URL_OK = new Set(["CC0", "Public domain", "PD"]);
const ALLOWED_LICENSE = /^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+( [a-z]+)?)$/i;

// 데이터 검사: 공용 그림은 작성자·라이선스·라이선스 URL·원본 페이지가 꼭 있어야 하고, NC/ND 는 거부한다.
function validate(d) {
  const errs = [];
  if (!d || !d.slug || !/^[a-z0-9-]+$/.test(d.slug)) errs.push("slug");
  if (!d.caption) errs.push("caption");
  if (!d.credit || !d.credit.author) errs.push("credit.author");
  if (d.method === "commons") {
    const c = d.credit || {};
    if (!c.license) errs.push("credit.license");
    else if (!ALLOWED_LICENSE.test(c.license) || /\b(NC|ND)\b/.test(c.license)) errs.push("credit.license 허용 밖: " + c.license);
    if (!NO_URL_OK.has(c.license) && !c.licenseUrl) errs.push("credit.licenseUrl");
    if (!c.pageUrl || !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(c.pageUrl)) errs.push("credit.pageUrl");
    if (!d.image || !/^assets\/illus\/[a-z0-9-]+\.(jpg|png|webp)$/.test(d.image.src) || !(d.image.width > 0) || !(d.image.height > 0)) errs.push("image");
    if (!d.alt) errs.push("alt");
  } else if (d.method === "svg") {
    if (!d.svg || !/^assets\/illus\/[a-z0-9-]+\.svg$/.test(d.svg)) errs.push("svg");
    if (!Array.isArray(d.sources) || !d.sources.length) errs.push("sources");
  } else errs.push("method");
  return errs;
}

function renderLegend(d) {
  if (!d.legend || !d.legend.length) return "";
  const items = d.legend.map((x) => `<div><dt class="k-${esc(x.kind)}">${x.symHtml}</dt><dd>${x.desc}</dd></div>`).join("");
  return `<dl class="illus-legend" aria-label="기호 설명">${items}</dl>`;
}
function renderTable(d) {
  const t = d.labelTable;
  if (!t) return "";
  const rows = t.rows.map((r) => `<tr><td class="n">${r.n}</td><td lang="${esc(t.lang)}" class="orig">${r.origHtml}</td><td>${r.link ? `<a href="${esc(r.link.replace(/^\/terms\//, ""))}">${esc(r.ko)}</a>` : esc(r.ko)}</td><td>${r.desc ? esc(r.desc) : ""}</td></tr>`).join("");
  const tr = d.captionTranslation ? `<p class="illus-note">원문 설명: <span lang="${esc(t.lang)}">${esc(d.captionTranslation.original)}</span> → ${esc(d.captionTranslation.ko)}</p>` : "";
  const note = d.tableNote ? `<p class="illus-note">${esc(d.tableNote)}</p>` : "";
  return `${tr}${note}<div class="illus-table-wrap"><table class="illus-labels"><caption>그림 속 라벨 대응표 (${esc(t.order)})</caption><thead><tr><th scope="col">#</th><th scope="col">원문</th><th scope="col">한국어</th><th scope="col">설명</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderCredit(d) {
  const c = d.credit;
  if (d.method === "commons") {
    const lic = c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" rel="license noopener" target="_blank">${esc(c.license)}</a>` : esc(c.license);
    return `<small class="illus-credit">그림: <a href="${esc(c.pageUrl)}" rel="noopener" target="_blank">${esc(c.author)}</a>, ${lic}, 위키미디어 공용${c.modified ? ` · 변경: ${esc(c.modified)}` : ""}</small>`;
  }
  const src = (d.sources || []).map((u) => `<a href="${esc(u)}" rel="noopener" target="_blank">${esc(u.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>`).join(", ");
  return `<small class="illus-credit">그림: ${esc(c.author)} 작성, <a href="https://creativecommons.org/licenses/by/4.0/deed.ko" rel="license noopener" target="_blank">CC BY 4.0</a> · 대조한 출처: ${src}</small>`;
}

// 순수 함수: 데이터(+SVG 문자열) → 블록 안쪽 HTML(한 줄씩)
function renderFigure(d, svgText) {
  const errs = validate(d);
  if (errs.length) throw new Error(`${d && d.slug}: ${errs.join(", ")}`);
  let media;
  if (d.method === "svg") {
    if (!svgText || !/^<svg[\s>]/.test(svgText.trim())) throw new Error(`${d.slug}: SVG 없음`);
    media = svgText.trim().replace(/\r?\n/g, " ");
  } else {
    media = `<img src="../${esc(d.image.src)}" width="${d.image.width}" height="${d.image.height}" alt="${esc(d.alt)}" loading="lazy" decoding="async">`;
  }
  const notes = (d.notes || []).map((n) => `<p class="illus-note">${n}</p>`).join("");
  return `<link rel="stylesheet" href="${CSS_HREF}">\n  <figure class="term-illus" id="illus" data-method="${d.method}"><div class="illus-frame">${media}</div><figcaption><span class="illus-caption">${esc(d.caption)}</span>${renderLegend(d)}${notes}${renderTable(d)}${renderCredit(d)}</figcaption></figure>`;
}

// 순수 함수: 페이지에 블록을 넣거나 교체. 앵커가 없으면 null.
function applyIllus(html, inner) {
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  const block = `  ${START}${nl}  ${inner.replace(/\n/g, nl)}${nl}  ${END}`;
  if (BLOCK.test(html)) return html.replace(BLOCK, (m) => (m.match(/^\r?\n/) ? nl : "") + block);
  let m = DIAGRAM_END.exec(html);
  if (!m) m = DEF_BOX.exec(html);
  if (!m) return null;
  const at = m.index + m[0].length;
  return html.slice(0, at) + block + nl + html.slice(at);
}
function removeIllus(html) {
  return html.replace(BLOCK, "");
}

function loadAll() {
  const out = [];
  for (const f of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json") && f !== "inserted.json").sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
    if (d.slug + ".json" !== f) throw new Error(`${f}: slug 불일치`);
    out.push(d);
  }
  return out;
}

function run() {
  const dry = process.argv.includes("--dry-run");
  const all = loadAll();
  const prev = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : [];
  let changed = 0, same = 0, removed = 0;
  const done = [];
  for (const d of all) {
    const file = path.join(ROOT, "terms", d.slug + ".html");
    if (!fs.existsSync(file)) { console.warn(`건너뜀(페이지 없음): ${d.slug}`); continue; }
    const svg = d.method === "svg" ? fs.readFileSync(path.join(ROOT, d.svg), "utf8") : null;
    if (d.method === "commons" && !fs.existsSync(path.join(ROOT, d.image.src))) throw new Error(`${d.slug}: 그림 파일 없음 ${d.image.src}`);
    const html = fs.readFileSync(file, "utf8");
    const next = applyIllus(html, renderFigure(d, svg));
    if (next === null) { console.warn(`건너뜀(정의 박스 없음): ${d.slug}`); continue; }
    done.push(d.slug);
    if (next === html) { same++; continue; }
    changed++;
    if (!dry) fs.writeFileSync(file, next);
  }
  for (const slug of prev.filter((s) => !done.includes(s))) {
    const file = path.join(ROOT, "terms", slug + ".html");
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, "utf8");
    const next = removeIllus(html);
    if (next !== html) { removed++; if (!dry) fs.writeFileSync(file, next); }
  }
  if (!dry) fs.writeFileSync(MANIFEST, JSON.stringify(done.sort(), null, 1) + "\n");
  console.log(`${dry ? "[dry-run] " : ""}삽입·갱신 ${changed} · 그대로 ${same} · 제거 ${removed} (도해 ${done.length}개)`);
}

if (require.main === module) run();
module.exports = { START, END, BLOCK, validate, renderFigure, applyIllus, removeIllus, loadAll };
