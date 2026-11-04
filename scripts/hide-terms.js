// 심화(data/term-extras)가 없고 최근 조회가 적은 용어를 사이트에서 뺀다(애드센스 심사 대비, 운영자 결정 2026-11-02).
// 사용: node scripts/hide-terms.js --ga <ga4.json> [--dry]
// 빠진 용어의 페이지·데이터 원본은 태그 before-hide-terms에 있고, 뷰어용 데이터는 data/viewer-hidden-terms.json에 있다.
// shortcut: 공개 페이지 본문의 링크는 글자만 남기므로 다시 공개해도 자동 복원되지 않는다. 대량 재공개 때는 태그 판을 기준으로 다시 돌린다.
"use strict";
const fs = require("fs");
const path = require("path");
const { filterRelatedLinks } = require("./lib/index-tier.js");
const { rebuildPrevNext } = require("./prune/rebuild-prevnext.js");

const ROOT = path.join(__dirname, "..");
const MIN_VIEWS = 3;
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };

// 링크 대상이 숨김 용어면 <a>를 벗기고 글자만 남긴다.
function unlinkHidden(html, hidden) {
  return html.replace(/<a\b[^>]*\bhref="(?:\.\/)?([^"\/#?]+)\.html(?:#[^"]*)?"[^>]*>([\s\S]*?)<\/a>/g, (all, href, text) => {
    let s = href;
    try { s = decodeURIComponent(s); } catch { /* 그대로 */ }
    // span으로 감싸야 관련 용어 칩이 서로 붙지 않는다.
    return hidden.has(s) ? `<span class="rt-plain">${text}</span>` : all;
  });
}

function run() {
  const dry = process.argv.includes("--dry");
  // --ga: GA4 최근 30일 "slug<탭>조회" 목록. 조회 MIN_VIEWS 이상이면 심화가 없어도 공개한다.
  const views = new Map(fs.readFileSync(arg("--ga"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => { const [k, v] = l.split("\t"); return [k, +v]; }));
  const file = path.join(ROOT, "terms.json");
  const terms = JSON.parse(fs.readFileSync(file, "utf8"));
  const extras = new Set(fs.readdirSync(path.join(ROOT, "data", "term-extras")).map((f) => f.replace(/\.json$/, "")));
  const isPublic = (t) => extras.has(t.slug) || (views.get(t.slug) || 0) >= MIN_VIEWS;
  const kept = terms.filter(isPublic);
  const hidden = new Set(terms.filter((t) => !isPublic(t)).map((t) => t.slug));
  console.log(`전체 ${terms.length} · 공개 ${kept.length} · 숨김 ${hidden.size}`);
  if (dry) return;
  for (const t of kept) for (const k of ["related", "prerequisites"]) if (t[k]) t[k] = t[k].filter((s) => !hidden.has(s));
  fs.writeFileSync(file, JSON.stringify(kept, null, 2) + "\n");
  for (const s of hidden) fs.rmSync(path.join(ROOT, "terms", s + ".html"), { force: true });
  for (const t of kept) {
    const p = path.join(ROOT, "terms", t.slug + ".html");
    if (!fs.existsSync(p)) continue;
    const html = fs.readFileSync(p, "utf8");
    const next = unlinkHidden(filterRelatedLinks(html, hidden).html, hidden);
    if (next !== html) fs.writeFileSync(p, next);
  }
  rebuildPrevNext({ root: ROOT, terms: kept });
}

if (require.main === module) run();
module.exports = { unlinkHidden };
