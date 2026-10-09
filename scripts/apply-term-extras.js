// 용어 페이지에 "유형별 섹션 + 실제 논문 인용 + 헷갈리는 용어 표 + 참고 문헌"을 끼워 넣는다.
//
// 왜: 모든 용어 페이지가 같은 틀(정의 → 쉽게 풀면 → 왜 중요한가 → 예문 → 깊게 → 주의 → 관련 용어)이라
//   "대량 생성된 얇은 콘텐츠"로 보일 수 있다. 용어 유형(검정·지표·개념)에 맞는 내용과 실제 논문 문장,
//   출처 있는 참고 문헌을 데이터(data/term-extras, data/term-usage)로 두고 이 스크립트가 HTML 에 반영한다.
//   HTML 을 손으로 고치지 않는다 — 데이터를 고치고 다시 실행하면 된다(멱등).
//
// 입력
//   data/term-extras/<slug>.json : { type, fixes?, sections:[{heading, html}], compare?:{heading,intro?,headers,rows,note?}, references:[문자열] }
//   data/term-usage/<slug>.json  : [{quote, title, journal, year, url, kciId|source}]  (없거나 []이면 "수집된 문장 없음"으로 표시)
//
// 삽입 위치(마커 주석 <!-- term-extras:이름:start/end --> 로 감싸 재실행 시 갈아 끼운다)
//   sections : "논문에서는 이렇게 쓰입니다" 바로 앞(왜 중요한가 다음)
//   usage    : "논문에서는 이렇게 쓰입니다" 제목 바로 뒤 ("실제 논문에서" → "예시 문장" 표지)
//   tail     : "개념 계통"(있으면) 또는 "관련 용어" 바로 앞 (헷갈리기 쉬운 용어 표 + 참고 문헌)
//   CSS      : <link href="../assets/term-extras.css"> 를 term-nav.css 링크 다음에
//
// 건드리지 않는 것: 정의 상자, "쉽게 풀면", "주의할 점" 본문(검수 지문). 단 fixes 에 명시한 명백한 오류 교정만 예외.
// 건드리지 않는 페이지: 데이터가 없는 용어, 보관(archive) 등급 용어, 앵커 제목이 없는 스텁 페이지.
//
// 사용: node scripts/apply-term-extras.js [--only a,b] [--dry]
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TERMS_DIR = path.join(ROOT, "terms");
const EXTRAS_DIR = path.join(ROOT, "data", "term-extras");
const USAGE_DIR = path.join(ROOT, "data", "term-usage");
const CSS_LINK = '<link rel="stylesheet" href="../assets/term-extras.css">';
const NAV_CSS_LINK = '<link rel="stylesheet" href="../assets/term-nav.css">';
// 페이지 머리부에는 CRLF 줄바꿈이 섞여 있는 파일이 있어 줄바꿈은 \r?\n 로 받는다.
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CSS_LINE_RE = new RegExp(escRe(CSS_LINK) + "\\r?\\n", "g");
const NAV_LINE_RE = new RegExp("(" + escRe(NAV_CSS_LINK) + ")(\\r?\\n)");
const ANCHOR_H2 = "<h2>논문에서는 이렇게 쓰입니다</h2>";
// 유형별 섹션 제목(정확히 이 순서). 새 유형은 여기에 한 줄 추가한다.
const TYPE_HEADINGS = {
  test: ["언제 쓰나", "결과는 이렇게 읽는다", "논문에는 이렇게 보고한다"],
  metric: ["계산과 범위", "해석 기준", "보고 방법"],
  concept: ["핵심 정리", "예시로 보기", "자주 하는 오해"],
  method: ["어떤 절차인가", "언제 쓰고 무엇을 얻나", "논문에는 이렇게 적는다"],
  instrument: ["무엇을 재는가", "구성과 채점", "결과 읽는 법"],
  disorder: ["어떤 상태인가", "진단과 평가", "연구에서 다루는 방식"],
  substance: ["무엇이고 어디서 작용하나", "주요 기능과 기전", "연구에서 다루는 방식"],
  structure: ["어디에 있고 어떻게 생겼나", "맡은 기능", "연구에서 다루는 방식"],
  theory: ["핵심 주장", "근거와 대표 연구", "비판과 한계"],
};
const TYPES = Object.keys(TYPE_HEADINGS);
const ALLOWED_TAGS = new Set(["p", "ul", "ol", "li", "strong", "em", "code", "sub", "sup", "br", "table", "thead", "tbody", "tr", "th", "td", "caption", "a", "span", "h3", "small"]);
const ALLOWED_ATTRS = new Set(["href", "class", "colspan", "scope"]);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function termExists(slug) {
  return /^[a-z0-9-]+$/.test(slug) && fs.existsSync(path.join(TERMS_DIR, `${slug}.html`));
}

// [[slug|라벨]] → 용어 페이지 링크. 없는 슬러그는 오류(깨진 링크 방지).
// 자기 자신을 가리키는 링크는 링크 없이 굵게만 표시한다(applyToHtml 이 currentSlug 를 정한다).
let currentSlug = null;
function linkify(html) {
  return html.replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, (m, slug, label) => {
    if (!termExists(slug)) throw new Error(`존재하지 않는 용어 링크: ${slug}`);
    if (slug === currentSlug) return `<strong>${label}</strong>`;
    return `<a href="${slug}.html">${label}</a>`;
  });
}

// 저작된 HTML 조각 검사: 허용 태그·속성만, 링크는 내부 *.html 또는 https 만.
function sanitizeFragment(html) {
  if (/&(?!(?:amp|lt|gt|quot|#[0-9]+);)/.test(html)) throw new Error("이스케이프되지 않은 & 가 있습니다");
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*\/?>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const [, , name, attrs] = m;
    if (!ALLOWED_TAGS.has(name.toLowerCase())) throw new Error(`허용되지 않는 태그: <${name}>`);
    const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;
    let rest = attrs || "";
    let a;
    while ((a = attrRe.exec(attrs || ""))) {
      if (!ALLOWED_ATTRS.has(a[1])) throw new Error(`허용되지 않는 속성: ${a[1]}`);
      if (a[1] === "href" && !/^(?:[a-z0-9-]+\.html|https:\/\/[^\s"]+)$/.test(a[2])) throw new Error(`허용되지 않는 링크: ${a[2]}`);
      rest = rest.replace(a[0], "");
    }
    if (rest.trim()) throw new Error(`해석할 수 없는 속성: ${rest.trim()}`);
  }
  if (/<\s*\/?\s*(script|iframe|style|object|embed)/i.test(html)) throw new Error("금지된 요소");
  return html;
}

function wrapTables(html) {
  return html
    .replace(/<table(?=[\s>])/g, '<div class="te-table-wrap" tabindex="0" role="region" aria-label="표 (좌우로 스크롤)"><table class="te-table"')
    .replace(/<\/table>/g, "</table></div>");
}

function renderFragment(html) {
  return wrapTables(linkify(sanitizeFragment(html)));
}

// 일반 텍스트 칸(이스케이프 + [[링크]])
function renderCell(text) {
  return linkify(esc(text));
}

function renderTable(headers, rows) {
  const head = headers.map((h) => `<th scope="col">${renderCell(h)}</th>`).join("");
  const body = rows.map((r) => {
    if (r.length !== headers.length) throw new Error(`표의 칸 수가 머리말과 다릅니다: ${r.join(" | ")}`);
    return `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${renderCell(c)}</th>` : `<td>${renderCell(c)}</td>`)).join("")}</tr>`;
  }).join("");
  return wrapTables(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
}

function validateExtras(x, slug) {
  if (!x || typeof x !== "object") throw new Error(`${slug}: extras 형식 오류`);
  if (!TYPES.includes(x.type)) throw new Error(`${slug}: type 은 ${TYPES.join("/")} 중 하나`);
  if (!Array.isArray(x.sections) || !x.sections.length) throw new Error(`${slug}: sections 필요`);
  for (const s of x.sections) if (!s.heading || !s.html) throw new Error(`${slug}: section 에 heading/html 필요`);
  const want = TYPE_HEADINGS[x.type].join(" / ");
  const got = x.sections.map((s) => s.heading).join(" / ");
  if (want !== got) throw new Error(`${slug}: ${x.type} 유형의 섹션 제목은 "${want}" 이어야 합니다 (현재 "${got}")`);
  if (!Array.isArray(x.references) || x.references.length < 2) throw new Error(`${slug}: 참고 문헌 2건 이상 필요`);
  if (x.compare && (!Array.isArray(x.compare.headers) || !Array.isArray(x.compare.rows))) throw new Error(`${slug}: compare 형식 오류`);
}

function renderSections(x) {
  return x.sections.map((s) => `<h2>${esc(s.heading)}</h2>\n  ${renderFragment(s.html).replace(/\n/g, "\n  ")}`).join("\n\n  ");
}

function sourceLabel(q) {
  if (q.kciId) return "KCI 한국학술지인용색인";
  if (q.source === "koreamed") return "KoreaMed Synapse";
  return "";
}

function renderUsage(quotes) {
  const parts = ['<h3 class="te-sub">실제 논문에서</h3>'];
  if (!quotes || !quotes.length) {
    parts.push('<p class="te-note">이 용어를 직접 쓴 국내 논문 문장을 아직 수집하지 못했습니다. 수집되는 대로 출처와 함께 싣겠습니다.</p>');
  } else {
    parts.push('<p class="te-note">국내 학술지 논문에서 이 용어가 쓰인 문장을 그대로 옮겼습니다. 제목·학술지·연도와 원문 링크를 함께 적었습니다.</p>');
    parts.push('<ul class="te-quotes">');
    for (const q of quotes) {
      if (!q.quote || !q.title || !q.journal || !q.year || !/^https:\/\//.test(q.url || "")) throw new Error("인용 항목에 quote/title/journal/year/url 필요");
      const src = sourceLabel(q);
      parts.push(`<li><blockquote class="te-quote">“${esc(q.quote)}”</blockquote><p class="te-cite">${esc(q.title)}, ${esc(q.journal)}, ${esc(String(q.year))}${src ? ` · ${esc(src)}` : ""} · <a href="${esc(q.url)}" target="_blank" rel="noopener">원문 보기 ↗</a></p></li>`);
    }
    parts.push("</ul>");
  }
  parts.push('<h3 class="te-sub">예시 문장</h3>');
  parts.push('<p class="te-note">아래는 용어의 쓰임을 보여 주려고 만든 예시로, 실제 논문에서 가져온 문장이 아닙니다.</p>');
  return parts.join("\n  ");
}

function renderTail(x) {
  const out = [];
  if (x.compare) {
    const c = x.compare;
    out.push(`<h2>${esc(c.heading || "헷갈리기 쉬운 용어")}</h2>`);
    if (c.intro) out.push(`<p>${renderCell(c.intro)}</p>`);
    out.push(renderTable(c.headers, c.rows));
    if (c.note) out.push(`<p class="te-note">${renderCell(c.note)}</p>`);
  }
  out.push("<h2>참고 문헌</h2>");
  out.push(`<ol class="te-refs">\n${x.references.map((r) => `    <li>${esc(r)}</li>`).join("\n")}\n  </ol>`);
  out.push('<p class="te-note">표의 기준값은 위 문헌에 근거한 관례이며, 분야·학술지마다 다른 기준을 쓸 수 있습니다.</p>');
  return out.join("\n  ");
}

const blockRe = (name) => new RegExp(`[ ]*<!-- term-extras:${name}:start -->[\\s\\S]*?<!-- term-extras:${name}:end -->\\n\\n?`, "g");

function stripAll(html) {
  for (const n of ["sections", "usage", "tail"]) html = html.replace(blockRe(n), "");
  return html.replace(CSS_LINE_RE, "");
}

function wrap(name, body, blankAfter) {
  return `  <!-- term-extras:${name}:start -->\n  ${body}\n  <!-- term-extras:${name}:end -->\n${blankAfter ? "\n" : ""}`;
}

function insertBeforeLine(html, needle, text) {
  const i = html.indexOf(needle);
  if (i < 0) return null;
  const ls = html.lastIndexOf("\n", i) + 1;
  return html.slice(0, ls) + text + html.slice(ls);
}

// 순수 함수: 페이지 HTML 에 extras/usage 를 반영한 새 HTML (앵커가 없으면 null).
function applyToHtml(html, slug, extras, usage) {
  currentSlug = slug;
  validateExtras(extras, slug);
  let out = stripAll(html);
  for (const f of extras.fixes || []) {
    if (!f.find || typeof f.replace !== "string") throw new Error(`${slug}: fixes 형식 오류`);
    out = out.split(f.find).join(f.replace);
  }
  if (!out.includes(ANCHOR_H2) || !out.includes(NAV_CSS_LINK)) return null;
  // 뒤에서부터 넣어 앞쪽 위치가 밀리지 않게 한다.
  // "관련 용어" 제목이 없는 쪽은 연구 단계 안내나 이전/다음 줄 앞에 넣는다.
  const tailAnchor = ["<!-- concept-family:start -->", "<h2>관련 용어</h2>", '<aside class="stage-link"', '<nav class="term-pager"'].find((a) => out.includes(a)) || "<h2>관련 용어</h2>";
  let r = insertBeforeLine(out, tailAnchor, wrap("tail", renderTail(extras), true));
  if (r === null) return null;
  out = r;
  const h2i = out.indexOf(ANCHOR_H2);
  const eol = out.indexOf("\n", h2i) + 1;
  out = out.slice(0, eol) + wrap("usage", renderUsage(usage), false) + out.slice(eol);
  r = insertBeforeLine(out, ANCHOR_H2, wrap("sections", renderSections(extras), true));
  out = r;
  if (!NAV_LINE_RE.test(out)) return null;
  out = out.replace(NAV_LINE_RE, (m, link, nl) => link + nl + CSS_LINK + nl);
  return out;
}

function archiveSet() {
  try { return new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "data", "index-tiers.json"), "utf8")).archive || []); } catch (e) { return new Set(); }
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { if (fallback !== undefined) return fallback; throw e; }
}

function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes("--dry");
  const oi = argv.indexOf("--only");
  const only = oi >= 0 ? argv[oi + 1].split(",").filter(Boolean) : null;
  const archive = archiveSet();
  const slugs = fs.readdirSync(EXTRAS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter((s) => !only || only.includes(s));
  let changed = 0, skipped = 0, same = 0;
  for (const slug of slugs) {
    const file = path.join(TERMS_DIR, `${slug}.html`);
    if (!fs.existsSync(file)) { console.warn(`건너뜀(페이지 없음): ${slug}`); skipped++; continue; }
    if (archive.has(slug)) { console.warn(`건너뜀(보관 등급): ${slug}`); skipped++; continue; }
    const html = fs.readFileSync(file, "utf8");
    const next = applyToHtml(html, slug, readJson(path.join(EXTRAS_DIR, `${slug}.json`)), readJson(path.join(USAGE_DIR, `${slug}.json`), []));
    if (next === null) { console.warn(`건너뜀(앵커 없음, 스텁?): ${slug}`); skipped++; continue; }
    if (next === html) { same++; continue; }
    if (!dry) fs.writeFileSync(file, next);
    changed++;
    console.log(`${dry ? "[dry] " : ""}반영: ${slug}`);
  }
  console.log(`반영 ${changed}, 변경 없음 ${same}, 건너뜀 ${skipped}`);
}

module.exports = { TYPE_HEADINGS, applyToHtml, renderUsage, renderTable, renderCell, sanitizeFragment, linkify, esc, stripAll };
if (require.main === module) main();
