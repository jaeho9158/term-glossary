// 기존 terms/*.html 에 용어 페이지 SEO 규칙(scripts/lib/term-seo.js)을 일괄 적용한다. 재실행 안전(멱등).
//
//   1) <head>: <title>, meta description, (있으면) og:title/og:description
//      — canonical 은 건드리지 않는다.
//   2) .related-terms: 기존 링크는 그대로 두고, 같은 분야 용어(class="related-same-field")로 목표 개수까지 채움.
//      재실행 시 기존 related-same-field 줄을 걷어내고 다시 계산하므로 중복이 쌓이지 않는다.
//   3) <aside class="stage-link">: 관련 용어 블록 아래, term-pager 위에 연구할Lab 단계 링크 1개.
//
// 통합 스텁(meta refresh)과 terms.json 에 없는 파일은 건너뛴다.
// 2)·3) 은 sitemap-lastmod.js 의 해시 제외 영역이라 sitemap lastmod 를 바꾸지 않는다.
//
// usage: node scripts/apply-term-seo.js [--dry-run] [--sample N]
const fs = require("fs");
const path = require("path");
const seo = require("./lib/term-seo.js");
const { escapeHtml } = require("../assets/escape.js");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_DIR = path.join(ROOT_DIR, "terms");

const RELATED_RE = /(<div class="related-terms">)([\s\S]*?)(\r?\n  <\/div>)/;
const STAGE_RE = /<aside class="stage-link">[\s\S]*?<\/aside>\r?\n?/g;

function applyHead(html, term) {
  const title = escapeHtml(seo.buildTermTitle(term));
  const desc = escapeHtml(seo.buildTermDescription(term));
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${desc}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${desc}">`);
  // 2026-09 기준 용어 페이지에 JSON-LD·og 태그는 없다(0/41,227). og 는 생기면 위 치환으로 함께 맞춘다.
}

function applyRelated(html, term, index) {
  const m = html.match(RELATED_RE);
  if (!m) {
    // 관련 용어 블록 자체가 없는 페이지(related 0개): 같은 분야 용어로 새 블록을 만든다.
    // "<h2>관련 용어</h2> + div.related-terms" 형태 그대로라 lastmod 해시 제외 규칙에 걸린다.
    const fill = seo.fieldFillLines(seo.fieldFill(term, [], index));
    const pos = html.indexOf('<nav class="term-pager"') !== -1 ? html.indexOf('<nav class="term-pager"') : html.lastIndexOf("</main>");
    if (!fill.length || pos === -1) return { html, ok: false, total: 0 };
    const nl = html.includes("\r\n") ? "\r\n" : "\n";
    const block = `  <h2>관련 용어</h2>${nl}  <div class="related-terms">${fill.map((l) => nl + l).join("")}${nl}  </div>${nl}`;
    return { html: html.slice(0, pos) + block + html.slice(pos), ok: false, total: fill.length };
  }
  const nl = m[3].startsWith("\r\n") ? "\r\n" : "\n";
  const kept = m[2]
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.includes('class="related-same-field"'));
  const existing = kept.map((l) => (l.match(/href="([^"]+)\.html"/) || [])[1]).filter(Boolean);
  const fill = seo.fieldFillLines(seo.fieldFill(term, existing, index));
  const body = [...kept, ...fill].map((l) => nl + l).join("");
  return { html: html.replace(RELATED_RE, (_, open, _old, close) => open + body + close), ok: true, total: kept.length + fill.length };
}

function applyStage(html, term) {
  let out = html.replace(STAGE_RE, "");
  const nl = out.includes("\r\n") ? "\r\n" : "\n";
  const aside = seo.stageLinkHtml(term).replace(/\n/g, nl) + nl;
  const pager = out.indexOf('<nav class="term-pager"');
  const relEnd = out.search(RELATED_RE);
  if (pager !== -1 && pager > relEnd) return out.slice(0, pager) + aside + out.slice(pager);
  const mainEnd = out.lastIndexOf("</main>");
  if (mainEnd === -1) return out;
  return out.slice(0, mainEnd) + aside + out.slice(mainEnd);
}

function pickHead(html) {
  const t = (html.match(/<title>[\s\S]*?<\/title>/) || [""])[0];
  const d = (html.match(/<meta name="description" content="[^"]*">/) || [""])[0];
  return `${t}\n${d}`;
}

// OneDrive·백신이 파일을 잠깐 잡고 있으면 Windows 에서 UNKNOWN/EBUSY 로 쓰기가 실패한다(4만 파일 중
// 한두 개꼴). 짧게 기다렸다가 다시 시도한다.
function writeWithRetry(file, content, tries = 5) {
  for (let i = 0; ; i++) {
    try {
      return fs.writeFileSync(file, content, "utf8");
    } catch (e) {
      if (i >= tries - 1 || !["UNKNOWN", "EBUSY", "EPERM"].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * (i + 1));
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const sampleN = Number(args[args.indexOf("--sample") + 1]) || 20;
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "terms.json"), "utf8"));
  const index = seo.buildFieldIndex(terms);
  const step = Math.max(1, Math.floor(terms.length / sampleN));
  const stats = { terms: terms.length, updated: 0, unchanged: 0, stub: 0, missing: 0, noRelated: 0 };
  const totals = {};
  const samples = [];

  terms.forEach((term, i) => {
    const file = path.join(TERMS_DIR, `${term.slug}.html`);
    if (!fs.existsSync(file)) return void stats.missing++;
    const html = fs.readFileSync(file, "utf8");
    if (html.includes('http-equiv="refresh"')) return void stats.stub++;
    let next = applyHead(html, term);
    const rel = applyRelated(next, term, index);
    if (!rel.ok) stats.noRelated++;
    next = rel.html;
    totals[rel.total] = (totals[rel.total] || 0) + 1;
    next = applyStage(next, term);
    if (i % step === 0 && samples.length < sampleN) {
      samples.push({ slug: term.slug, before: pickHead(html), after: pickHead(next) });
    }
    if (next === html) return void stats.unchanged++;
    if (!dry) writeWithRetry(file, next);
    stats.updated++;
  });

  for (const s of samples) console.log(`--- ${s.slug}\n[before]\n${s.before}\n[after]\n${s.after}`);
  console.log(dry ? "(dry-run)" : "", JSON.stringify(stats));
  console.log("related links per page:", JSON.stringify(totals));
}

if (require.main === module) main();
module.exports = { applyHead, applyRelated, applyStage };
