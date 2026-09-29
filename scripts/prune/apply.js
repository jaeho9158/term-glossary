// Phase 6: 승인된 병합·가지치기 적용. 계획: docs/superpowers/plans/2026-09-29-term-prune-merge.md 5절.
//
// 사용: node scripts/prune/apply.js --approved data/prune/approved.json [--dry] [--root <dir>] [--ga <ga4.json>]
//   --root  대상 트리(기본: 저장소 루트). 다른 세션이 같은 작업 트리를 쓰므로, 시험은 반드시 복사본 --root로 한다.
//   --dry   아무것도 쓰지 않고 계획만 출력한다.
// 입력 approved.json: {merge:[{keeper,absorb:[]}], prune:[{slug,redirect}]}
//   redirect는 slug(대체 용어) 또는 "category/<code>.html".
//
// 안전: terms.json은 처음 읽고, 쓰기 직전에 디스크에서 다시 읽어 바뀌었으면 중단한다(동시 편집 대비).
//       GA≥1 용어를 prune하려 하거나 slug가 없으면 아무것도 쓰기 전에 전체 중단한다.
// 커밋은 하지 않는다. 되돌리기: 작업 트리 변경이므로 git으로 복구(단, 다른 세션 작업이 섞여 있으면 --root 복사본으로 시험).
const fs = require("fs");
const path = require("path");
const lib = require("./lib.js");
const { rebuildPrevNext } = require("./rebuild-prevnext.js");
const { BASE_URL } = require("../site-config.js");
const { escapeHtml } = require("../../assets/escape.js");

const RELATED_CAP_DEFAULT = 12;
const norm = lib.norm;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uniq = (arr) => [...new Set(arr)];

function serializeTerms(terms) {
  // 기존 terms.json 형식: 들여쓰기 2칸, CRLF, 끝 개행 없음.
  return JSON.stringify(terms, null, 2).replace(/\n/g, "\r\n");
}

function stubHtml({ title, canonical, refresh, bodyHtml }) {
  return [
    "<!DOCTYPE html>",
    '<html lang="ko">',
    "<head>",
    '<meta charset="UTF-8">',
    `<title>${title} - 논문용어사전</title>`,
    `<link rel="canonical" href="${canonical}">`,
    '<meta name="robots" content="noindex, follow">',
    `<meta http-equiv="refresh" content="0; url=${refresh}">`,
    "</head>",
    "<body>",
    `<p>${bodyHtml}</p>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function categoryLabel(code) {
  const { CATEGORY_LABELS } = require("../../assets/category-data.js");
  return CATEGORY_LABELS[code] || code;
}

// 계획 검증. 실패 사유 배열을 돌려준다(비어 있으면 통과).
function validate({ terms, approved, ga, root }) {
  const errors = [];
  const bySlug = new Map(terms.map((t) => [t.slug, t]));
  const removed = new Set();
  const keepers = new Set();
  for (const g of approved.merge || []) {
    if (!bySlug.has(g.keeper)) errors.push(`keeper 없음: ${g.keeper}`);
    keepers.add(g.keeper);
    for (const a of g.absorb || []) {
      if (!bySlug.has(a)) errors.push(`흡수 대상 없음: ${a}`);
      if (a === g.keeper) errors.push(`대표가 자기 자신을 흡수: ${a}`);
      if (removed.has(a)) errors.push(`흡수 대상 중복: ${a}`);
      removed.add(a);
    }
  }
  for (const p of approved.prune || []) {
    if (!bySlug.has(p.slug)) errors.push(`prune 대상 없음: ${p.slug}`);
    if (removed.has(p.slug)) errors.push(`prune 대상이 이미 흡수 대상: ${p.slug}`);
    if (keepers.has(p.slug)) errors.push(`prune 대상이 병합 대표: ${p.slug}`);
    if ((ga.get(p.slug) || 0) >= 1) errors.push(`GA≥1 용어는 prune 불가: ${p.slug} (GA ${ga.get(p.slug)})`);
    removed.add(p.slug);
  }
  for (const k of keepers) if (removed.has(k)) errors.push(`대표가 다른 그룹에서 흡수/삭제됨(체인 금지): ${k}`);
  for (const p of approved.prune || []) {
    const r = String(p.redirect || "");
    const m = r.match(/^category\/([a-z0-9-]+)\.html$/);
    if (m) { if (!fs.existsSync(path.join(root, "category", `${m[1]}.html`))) errors.push(`분야 페이지 없음: ${r}`); }
    else if (!bySlug.has(r)) errors.push(`redirect 대상 없음: ${p.slug} → ${r}`);
  }
  return errors;
}

// terms 배열을 복사해 병합·삭제·참조 재작성. 결과: { terms, absorbTo(Map), pruneTo(Map), rewrites }
function transformTerms(terms, approved) {
  const bySlug = new Map(terms.map((t) => [t.slug, { ...t }]));
  const absorbTo = new Map();
  const pruneTo = new Map();
  const detail = { merged: [], pruned: [] };

  for (const g of approved.merge || []) {
    const keeper = bySlug.get(g.keeper);
    const origRelated = (keeper.related || []).length;
    const origPrereq = (keeper.prerequisites || []).length;
    const kNorms = new Set([norm(keeper.title_ko), norm(keeper.title_en)]);
    const aliases = [...(keeper.aliases || [])];
    const matchTitles = [...(keeper.match_titles || [])];
    const categories = [...(keeper.categories || [])];
    let related = [...(keeper.related || [])];
    let prereq = [...(keeper.prerequisites || [])];
    const addAlias = (list, s) => {
      if (typeof s !== "string" || !s.trim()) return;
      const n = norm(s);
      if (!n || kNorms.has(n) || list.some((x) => norm(x) === n)) return;
      list.push(s);
    };
    for (const slug of g.absorb) {
      const a = bySlug.get(slug);
      absorbTo.set(slug, g.keeper);
      addAlias(aliases, a.title_ko); addAlias(aliases, a.title_en);
      for (const al of a.aliases || []) addAlias(aliases, al);
      addAlias(matchTitles, a.title_ko); addAlias(matchTitles, a.title_en);
      for (const c of a.categories || []) if (!categories.includes(c)) categories.push(c);
      related = related.concat(a.related || []);
      prereq = prereq.concat(a.prerequisites || []);
    }
    const drop = new Set([g.keeper, ...g.absorb]);
    const cap = (orig) => Math.max(RELATED_CAP_DEFAULT, orig);
    keeper.aliases = aliases;
    if (matchTitles.length) keeper.match_titles = matchTitles;
    keeper.categories = categories;
    keeper.related = uniq(related).filter((s) => !drop.has(s)).slice(0, cap(origRelated));
    keeper.prerequisites = uniq(prereq).filter((s) => !drop.has(s)).slice(0, cap(origPrereq));
    detail.merged.push({ keeper: g.keeper, absorb: g.absorb });
  }
  for (const p of approved.prune || []) { pruneTo.set(p.slug, p.redirect); detail.pruned.push({ slug: p.slug, redirect: p.redirect }); }

  // 삭제
  for (const s of [...absorbTo.keys(), ...pruneTo.keys()]) bySlug.delete(s);

  // prune 리다이렉트가 흡수/삭제된 slug면 최종 대표로 바꾸고, 그것도 안 되면 분야 페이지로.
  const original = new Map(terms.map((t) => [t.slug, t]));
  for (const [slug, redirect] of pruneTo) {
    let r = redirect;
    if (absorbTo.has(r)) r = absorbTo.get(r);
    if (!r.startsWith("category/") && !bySlug.has(r)) r = `category/${(original.get(slug).categories || ["none"])[0]}.html`;
    pruneTo.set(slug, r);
  }
  for (const d of detail.pruned) d.redirect = pruneTo.get(d.slug);

  // 참조 재작성: 흡수 → 대표, prune → 삭제 (자기 참조·중복 제거)
  let relatedRewrites = 0;
  const fix = (t, field) => {
    const list = t[field];
    if (!Array.isArray(list) || !list.some((s) => absorbTo.has(s) || pruneTo.has(s))) return;
    const next = [];
    for (const s of list) {
      const m = absorbTo.has(s) ? absorbTo.get(s) : pruneTo.has(s) ? null : s;
      if (m && m !== t.slug && !next.includes(m)) next.push(m);
    }
    t[field] = next;
    relatedRewrites++;
  };
  for (const t of bySlug.values()) { fix(t, "related"); fix(t, "prerequisites"); }

  const out = terms.filter((t) => bySlug.has(t.slug)).map((t) => bySlug.get(t.slug));
  return { terms: out, absorbTo, pruneTo, relatedRewrites, detail };
}

// ---- HTML 링크 재작성 ------------------------------------------------------
function makeLinkRewriter({ absorbTo, pruneTo }) {
  const all = [...absorbTo.keys(), ...pruneTo.keys()];
  if (!all.length) return null;
  const alt = all.map(escRe).join("|");
  const probe = new RegExp(`href="(?:\\.\\./terms/|${escRe(BASE_URL)}/terms/)?(?:${alt})\\.html`);
  const hrefRe = new RegExp(`href="((?:\\.\\./terms/|${escRe(BASE_URL)}/terms/)?)(${alt})\\.html((?:#[^"]*)?)"`, "g");
  const unwrapRe = new RegExp(`<a\\b[^>]*\\bhref="(?:\\.\\./terms/)?(${alt})\\.html(?:#[^"]*)?"[^>]*>([\\s\\S]*?)</a>`, "g");
  const relatedLineRe = new RegExp(`[ \\t]*<a\\b[^>]*\\bhref="(${alt})\\.html"[^>]*>[\\s\\S]*?</a>[ \\t]*\\r?\\n`, "g");
  const liRe = new RegExp(`[ \\t]*<li><a href="\\.\\./terms/(${alt})\\.html"[^>]*>[\\s\\S]*?</a></li>[ \\t]*\\r?\\n`, "g");

  return {
    probe: (html) => probe.test(html),
    // kind: "term"(selfSlug 필요) | "category" | "compare". 바뀌었으면 새 html, 아니면 null.
    rewrite(html, kind, selfSlug) {
      let out = html;
      if (kind === "category") {
        // 목록 항목은 통째로 뺀다(대표는 제 분야 목록에 이미 있고, 목록 개수는 재생성 때 갱신된다).
        out = out.replace(liRe, "");
      } else if (kind === "term") {
        // 관련 용어 블록: prune은 줄째 삭제, 흡수는 대표로 치환한 뒤 중복·자기 링크를 걷어낸다.
        out = out.replace(/<div class="related-terms">[\s\S]*?<\/div>/, (block) => {
          block = block.replace(relatedLineRe, (line, slug) => (pruneTo.has(slug) ? "" : line));
          block = block.replace(hrefRe, (m, prefix, slug, hash) => (absorbTo.has(slug) ? `href="${prefix}${absorbTo.get(slug)}.html${hash}"` : m));
          const seen = new Set();
          block = block.replace(/[ \t]*<a\b[^>]*\bhref="([^"#]+)\.html"[^>]*>[\s\S]*?<\/a>[ \t]*\r?\n/g, (line, slug) => {
            if (slug === selfSlug || seen.has(slug)) return "";
            seen.add(slug);
            return line;
          });
          return block;
        });
      }
      // 나머지 본문·compare 페이지: 흡수 → 대표 치환, prune → 앵커를 텍스트로 풀기
      out = out.replace(unwrapRe, (m, slug, text) => (pruneTo.has(slug) ? text : m));
      out = out.replace(hrefRe, (m, prefix, slug, hash) => (absorbTo.has(slug) ? `href="${prefix}${absorbTo.get(slug)}.html${hash}"` : m));
      return out === html ? null : out;
    },
  };
}

function listHtml(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".html")) : [];
}

// ---- 사이트맵에서 삭제된 slug의 URL 제거(전체 재생성은 Phase 7에서) -------------------
function pruneSitemaps(root, removedSlugs, dry) {
  const dir = path.join(root, "sitemaps");
  let removed = 0;
  if (!fs.existsSync(dir)) return removed;
  const set = new Set(removedSlugs);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".xml"))) {
    const file = path.join(dir, f);
    const xml = fs.readFileSync(file, "utf8");
    if (!xml.includes("/terms/")) continue;
    const out = xml.replace(/[ \t]*<url>\s*<loc>[^<]*\/terms\/([^<]+)\.html<\/loc>[\s\S]*?<\/url>[ \t]*\r?\n?/g, (m, slug) => {
      if (!set.has(slug)) return m;
      removed++;
      return "";
    });
    if (out !== xml && !dry) fs.writeFileSync(file, out);
  }
  return removed;
}

function applyApproved({ root, approved, ga, dry = false, log = console.log }) {
  const termsFile = path.join(root, "terms.json");
  const rawBefore = fs.readFileSync(termsFile, "utf8");
  const terms = JSON.parse(rawBefore);
  const errors = validate({ terms, approved, ga, root });
  if (errors.length) throw new Error(`검증 실패 — 아무것도 쓰지 않았습니다:\n  ${errors.join("\n  ")}`);

  const t = transformTerms(terms, approved);
  const removedSlugs = [...t.absorbTo.keys(), ...t.pruneTo.keys()];
  const originalBySlug = new Map(terms.map((x) => [x.slug, x]));
  const termsBySlugAfter = new Map(t.terms.map((x) => [x.slug, x]));
  const oldSlugSet = new Set(terms.map((x) => x.slug));
  log(`계획: 병합 ${approved.merge.length}그룹(흡수 ${t.absorbTo.size}개), prune ${t.pruneTo.size}개, 결과 용어 ${t.terms.length}개(${terms.length} → ${t.terms.length})`);

  // 스텁 목록(현재 terms.json에 없는 terms/*.html)
  const termFiles = listHtml(path.join(root, "terms"));
  const oldStubSlugs = termFiles.map((f) => f.slice(0, -5)).filter((s) => !oldSlugSet.has(s));

  // 페이지 재작성 계획
  const rewriter = makeLinkRewriter(t);
  const writes = new Map(); // 절대경로 → 내용
  let htmlRewrites = 0;
  if (rewriter) {
    const scan = (dirName, kind, files) => {
      for (const f of files) {
        const slug = f.slice(0, -5);
        if (kind === "term" && !termsBySlugAfter.has(slug)) continue; // 스텁·삭제 페이지는 건드리지 않는다
        const file = path.join(root, dirName, f);
        const html = fs.readFileSync(file, "utf8");
        if (!rewriter.probe(html)) continue;
        const out = rewriter.rewrite(html, kind, slug);
        if (out !== null) { writes.set(file, out); htmlRewrites++; }
      }
    };
    scan("terms", "term", termFiles);
    scan("category", "category", listHtml(path.join(root, "category")));
    scan("compare", "compare", listHtml(path.join(root, "compare")));
  }

  // 새 스텁(흡수·prune 페이지) + 옛 스텁 재지정(체인 금지)
  const stubTarget = (slug) => {
    if (t.absorbTo.has(slug)) return { kind: "term", to: t.absorbTo.get(slug), pruned: false };
    if (t.pruneTo.has(slug)) {
      const r = t.pruneTo.get(slug);
      return r.startsWith("category/") ? { kind: "category", to: r.replace(/^category\/|\.html$/g, ""), pruned: true } : { kind: "term", to: r, pruned: true };
    }
    return null;
  };
  const stubFor = (title, target) => {
    if (target.kind === "category") {
      const label = categoryLabel(target.to);
      return stubHtml({ title, canonical: `${BASE_URL}/category/${target.to}.html`, refresh: `../category/${target.to}.html`,
        bodyHtml: `이 용어는 정리되었습니다. <a href="../category/${target.to}.html">${escapeHtml(label)}</a> 분야에서 관련 용어를 찾아보세요.` });
    }
    const dest = termsBySlugAfter.get(target.to);
    const link = `<a href="${target.to}.html">${escapeHtml(dest.title_ko)}</a>`;
    return stubHtml({ title, canonical: `${BASE_URL}/terms/${target.to}.html`, refresh: `${target.to}.html`,
      bodyHtml: target.pruned ? `이 용어는 정리되었습니다. ${link} 페이지에서 관련 용어를 찾아보세요.` : `이 용어는 ${link} 페이지로 통합되었습니다.` });
  };
  for (const slug of removedSlugs) {
    const o = originalBySlug.get(slug);
    writes.set(path.join(root, "terms", `${slug}.html`), stubFor(escapeHtml(o.title_ko), stubTarget(slug)));
  }
  let restubbed = 0;
  for (const slug of oldStubSlugs) {
    const file = path.join(root, "terms", `${slug}.html`);
    const html = fs.readFileSync(file, "utf8");
    const m = html.match(/http-equiv="refresh" content="0; url=([^"]+)"/);
    if (!m) continue;
    const dest = m[1].match(/^([a-z0-9-]+)\.html$/);
    if (!dest || !stubTarget(dest[1])) continue;
    const title = (html.match(/<title>([\s\S]*?) - 논문용어사전<\/title>/) || [])[1] || slug;
    writes.set(file, stubFor(title, stubTarget(dest[1])));
    restubbed++;
  }

  const sitemapRemoved = pruneSitemaps(root, removedSlugs, true);
  log(`페이지: 링크 재작성 ${htmlRewrites}개, 새 스텁 ${removedSlugs.length}개, 옛 스텁 재지정 ${restubbed}개, 사이트맵 URL 제거 ${sitemapRemoved}개, related/prerequisites 재작성 ${t.relatedRewrites}개 용어`);

  const result = { merged: t.detail.merged, pruned: t.detail.pruned,
    rewrites: { related: t.relatedRewrites, html: htmlRewrites, stubs: removedSlugs.length, restubbed, sitemap: sitemapRemoved } };
  if (dry) { log("--dry: 아무것도 쓰지 않았습니다."); return { ...result, dry: true }; }

  // 쓰기 직전 terms.json 재확인(동시 편집 대비)
  if (fs.readFileSync(termsFile, "utf8") !== rawBefore) throw new Error("terms.json이 적용 도중 바뀌었습니다(다른 세션의 편집). 아무것도 쓰지 않았습니다 — 다시 실행하세요.");
  for (const [file, content] of writes) fs.writeFileSync(file, content);
  fs.writeFileSync(termsFile, serializeTerms(t.terms));
  pruneSitemaps(root, removedSlugs, false);

  // 이전/다음: 지워진 용어가 속했던 첫 분야만 다시 계산
  const cats = new Set(removedSlugs.map((s) => (originalBySlug.get(s).categories || ["none"])[0]));
  const pn = rebuildPrevNext({ root, terms: t.terms, categories: cats });
  result.rewrites.prevnext = pn.changed;
  log(`이전/다음: 분야 ${cats.size}개, 변경 ${pn.changed}개`);

  const logDir = path.join(root, "data", "prune");
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, "apply-log.json"), JSON.stringify(result, null, 1) + "\n");
  return result;
}

function main() {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const root = arg("--root") ? path.resolve(arg("--root")) : lib.ROOT;
  const approvedFile = path.resolve(arg("--approved") || path.join(lib.PRUNE_DIR, "approved.json"));
  const gaFile = arg("--ga") ? path.resolve(arg("--ga")) : path.join(lib.PRUNE_DIR, "ga4.json");
  const approved = JSON.parse(fs.readFileSync(approvedFile, "utf8"));
  approved.merge = approved.merge || [];
  approved.prune = approved.prune || [];
  if (root !== lib.ROOT) console.log(`대상 트리: ${root}`);
  const result = applyApproved({ root, approved, ga: lib.loadGa(gaFile), dry: process.argv.includes("--dry") });
  if (!result.dry) {
    console.log("\n다음 단계(컨트롤러): 아래 순서로 재생성·검증");
    console.log("  npm run build:terms-index && node scripts/generate-category-pages.js && node scripts/generate-sitemap.js && node scripts/viewer-eval.js && npm test");
  }
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { applyApproved, validate, transformTerms, serializeTerms, stubHtml };
