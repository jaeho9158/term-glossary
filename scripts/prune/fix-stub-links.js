// 스텁 링크 결함 수선: (1) 스텁→스텁 체인을 최종 대상으로 직접 연결, (2) 실제 페이지가 스텁을 가리키는 링크를 최종 대상으로 교체.
// 사용: node scripts/prune/fix-stub-links.js [--dry] [--root <dir>]   (멱등: 고칠 것이 없으면 아무것도 쓰지 않는다)
// 스텁 HTML 형식은 apply.js의 stubHtml을 그대로 쓴다. 관련 용어 블록(<div class="related-terms">)은 생성기 형식대로
// 링크 문구를 대상 용어 제목으로 맞추고, 블록 안 중복·자기 링크는 걷어낸다. 본문 링크는 href만 바꾼다(문구 유지).
// 대상이 분야 페이지(category/…)로 끝나는 스텁을 가리키는 링크: 관련 블록은 줄째 삭제, 본문은 앵커를 텍스트로 푼다.
const fs = require("fs");
const path = require("path");
const lib = require("./lib.js");
const { stubHtml, serializeTerms } = require("./apply.js");
const { BASE_URL } = require("../site-config.js");
const { escapeHtml } = require("../../assets/escape.js");

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const listHtml = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".html")) : []);

// 대상이 사라져 체인이 끝나는 스텁은 옛 용어의 첫 분야 페이지로 보낸다(apply.js prune 규칙과 같다).
// 옛 용어 정보는 terms.json에 더는 없어, 실측한 값(옛 terms.json·같은 계열 용어의 분야)을 고정해 둔다.
const FORMER_CATEGORY = {
  "character-literary": "lit", "coping-nursing": "nursing", "goal-setting-in-practice": "socwelfare",
  "landscape-spatial-composition": "landscape", "dramatic-climax": "film", "rehearsal-room-etiquette": "film",
  "education-for-the-elderly": "geronto",
};

function categoryLabel(code) {
  const { CATEGORY_LABELS } = require("../../assets/category-data.js");
  return CATEGORY_LABELS[code] || code;
}

function fixStubLinks({ root, dry = false, log = console.log }) {
  const terms = JSON.parse(fs.readFileSync(path.join(root, "terms.json"), "utf8"));
  const titleBySlug = new Map(terms.map((t) => [t.slug, t.title_ko]));
  const termFiles = listHtml(path.join(root, "terms")).map((f) => f.slice(0, -5));
  const stubSlugs = termFiles.filter((s) => !titleBySlug.has(s));

  // 스텁 읽기: slug → {file, html, title, pruned, target:{kind:"term"|"category", to}}
  const stubs = new Map();
  for (const slug of stubSlugs) {
    const file = path.join(root, "terms", `${slug}.html`);
    const html = fs.readFileSync(file, "utf8");
    const m = html.match(/http-equiv="refresh" content="0; url=([^"]+)"/);
    if (!m) continue;
    const term = m[1].match(/^([^/]+)\.html$/);
    const cat = m[1].match(/^\.\.\/category\/([^/]+)\.html$/);
    const title = (html.match(/<title>([\s\S]*?) - 논문용어사전<\/title>/) || [])[1] || slug;
    stubs.set(slug, { file, html, title, pruned: !/통합되었습니다/.test(html),
      target: term ? { kind: "term", to: term[1] } : cat ? { kind: "category", to: cat[1] } : null });
  }

  // 최종 대상 해석(체인 따라가기). 순환·없는 대상은 unresolved로 기록한다.
  const unresolved = [];
  const finalOf = new Map();
  for (const slug of stubs.keys()) {
    const seen = new Set([slug]);
    let cur = stubs.get(slug).target;
    let out = null;
    while (cur) {
      if (cur.kind === "category" || titleBySlug.has(cur.to)) { out = cur; break; }
      if (seen.has(cur.to) || !stubs.has(cur.to)) break;
      seen.add(cur.to);
      cur = stubs.get(cur.to).target;
    }
    if (!out && FORMER_CATEGORY[slug]) out = { kind: "category", to: FORMER_CATEGORY[slug] };
    if (!out) unresolved.push(slug);
    finalOf.set(slug, out);
  }

  const writes = new Map();
  let chainFixed = 0;

  // 1) 스텁 재작성: 대상이 스텁(또는 없는 slug)인 것만
  for (const [slug, st] of stubs) {
    if (!st.target || st.target.kind === "category" || titleBySlug.has(st.target.to)) continue;
    const fin = finalOf.get(slug);
    if (!fin) continue;
    let html;
    if (fin.kind === "category") {
      html = stubHtml({ title: st.title, canonical: `${BASE_URL}/category/${fin.to}.html`, refresh: `../category/${fin.to}.html`,
        bodyHtml: `이 용어는 정리되었습니다. <a href="../category/${fin.to}.html">${escapeHtml(categoryLabel(fin.to))}</a> 분야에서 관련 용어를 찾아보세요.` });
    } else {
      const link = `<a href="${fin.to}.html">${escapeHtml(titleBySlug.get(fin.to))}</a>`;
      html = stubHtml({ title: st.title, canonical: `${BASE_URL}/terms/${fin.to}.html`, refresh: `${fin.to}.html`,
        bodyHtml: st.pruned ? `이 용어는 정리되었습니다. ${link} 페이지에서 관련 용어를 찾아보세요.` : `이 용어는 ${link} 페이지로 통합되었습니다.` });
    }
    if (html !== st.html) { writes.set(st.file, html); chainFixed++; }
  }

  // 2) 실제 페이지의 스텁 링크
  const resolvable = [...stubs.keys()].filter((s) => finalOf.get(s));
  let pageFixed = 0, linkFixed = 0;
  if (resolvable.length) {
    const alt = resolvable.map(escRe).join("|");
    const probe = new RegExp(`href="(?:\\.\\./terms/|${escRe(BASE_URL)}/terms/)?(?:${alt})\\.html`);
    const anchorRe = /([ \t]*)<a\b([^>]*?)href="([^"#]+)\.html((?:#[^"]*)?)"([^>]*)>([\s\S]*?)<\/a>([ \t]*\r?\n)?/g;
    const hrefRe = new RegExp(`href="((?:\\.\\./terms/|${escRe(BASE_URL)}/terms/)?)(${alt})\\.html((?:#[^"]*)?)"`, "g");
    const unwrapRe = new RegExp(`<a\\b[^>]*\\bhref="(?:\\.\\./terms/)?(${alt})\\.html(?:#[^"]*)?"[^>]*>([\\s\\S]*?)</a>`, "g");
    const rewrite = (html, selfSlug) => {
      let n = 0;
      // 관련 용어 블록(개념 계통 안의 것 포함)은 블록별로 처리
      let out = html.replace(/<div class="related-terms">[\s\S]*?<\/div>/g, (block) => {
        if (!probe.test(block)) return block;
        const seen = new Set();
        return block.replace(anchorRe, (m, ind, a1, slug, hash, a2, text, tail) => {
          const fin = stubs.has(slug) ? finalOf.get(slug) : null;
          if (fin) n++;
          if (fin && fin.kind === "category") return "";
          const s = fin ? fin.to : slug;
          if (s === selfSlug || seen.has(s)) return "";
          seen.add(s);
          if (!fin) return m;
          return `${ind}<a ${a1.trim() ? a1.trim() + " " : ""}href="${s}.html${hash}"${a2}>${escapeHtml(titleBySlug.get(s))}</a>${tail || ""}`.replace(/<a href/, "<a href");
        });
      });
      // 본문 등: 분야로 끝나는 스텁·자기 자신 대상은 앵커를 텍스트로 풀고, 나머지는 href만 교체
      out = out.replace(unwrapRe, (m, slug, text) => {
        const fin = finalOf.get(slug);
        if (fin && (fin.kind === "category" || fin.to === selfSlug)) { n++; return text; }
        return m;
      });
      out = out.replace(hrefRe, (m, prefix, slug, hash) => { n++; return `href="${prefix}${finalOf.get(slug).to}.html${hash}"`; });
      return { out, n };
    };
    const scan = (dirName, files, isTerm) => {
      for (const f of files) {
        const slug = f.slice(0, -5);
        if (isTerm && !titleBySlug.has(slug)) continue; // 스텁은 1)에서 다룬다
        const file = path.join(root, dirName, f);
        const html = fs.readFileSync(file, "utf8");
        if (!probe.test(html)) continue;
        const { out, n } = rewrite(html, isTerm ? slug : null);
        if (out !== html) { writes.set(file, out); pageFixed++; linkFixed += n; }
      }
    };
    scan("terms", termFiles.map((s) => `${s}.html`), true);
    scan("category", listHtml(path.join(root, "category")), false);
    scan("compare", listHtml(path.join(root, "compare")), false);
  }

  // terms.json related/prerequisites에 스텁이 남아 있으면 같이 고친다(dedupe, 자기 링크 제거)
  let jsonFixed = 0;
  for (const t of terms) {
    for (const field of ["related", "prerequisites"]) {
      const list = t[field];
      if (!Array.isArray(list) || !list.some((s) => finalOf.get(s))) continue;
      const next = [];
      for (const s of list) {
        const fin = finalOf.get(s);
        const m = fin ? (fin.kind === "term" ? fin.to : null) : s;
        if (m && m !== t.slug && !next.includes(m)) next.push(m);
      }
      t[field] = next;
      jsonFixed++;
    }
  }

  log(`스텁 체인 재지정 ${chainFixed}개, 링크 재작성 페이지 ${pageFixed}개(링크 ${linkFixed}개), terms.json 필드 ${jsonFixed}개, 해석 불가 스텁 ${unresolved.length}개`);
  if (unresolved.length) log(`해석 불가: ${unresolved.join(", ")}`);
  if (dry) { log("--dry: 아무것도 쓰지 않았습니다."); return { chainFixed, pageFixed, linkFixed, jsonFixed, unresolved, dry: true }; }
  for (const [file, content] of writes) fs.writeFileSync(file, content);
  if (jsonFixed) fs.writeFileSync(path.join(root, "terms.json"), serializeTerms(terms));
  return { chainFixed, pageFixed, linkFixed, jsonFixed, unresolved };
}

function main() {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const root = arg("--root") ? path.resolve(arg("--root")) : lib.ROOT;
  fixStubLinks({ root, dry: process.argv.includes("--dry") });
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { fixStubLinks };
