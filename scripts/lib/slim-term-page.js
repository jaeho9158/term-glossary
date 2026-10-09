// 용어 페이지 슬림화 — 모든 페이지에서 바이트 단위로 똑같은 반복 블록을 HTML 밖으로 옮긴다.
//
// 변환(전부 <main> 바깥, 마커 주석은 그대로 둔다):
//   theme : <!-- theme-init --> 안의 인라인 스크립트(~530B) → <script src="../assets/site-head.js"></script>
//           (동기 외부 스크립트. 다크모드 깜빡임 방지를 위해 <head> 안, 같은 자리 그대로)
//   ga    : <!-- GA4 analytics --> 안의 인라인 gtag 초기화(~175B) 제거 — site-head.js 가 대신 실행.
//           async gtag/js?id=… 태그는 HTML 에 남긴다(Google 태그 감지).
//   indent: <header>/<footer> 블록의 줄 앞 들여쓰기 제거. 줄바꿈은 남기므로 공백 접힘 결과는 같다.
//
// 건드리지 않는 것: title/meta/canonical/JSON-LD/og/googlebot noindex, AdSense 태그, 본문(<main>),
//   헤더 내비 링크(크롤 가능한 내부 링크), 꼬리 스크립트 태그, 줄바꿈(CRLF/LF 혼재 그대로).
// 멱등: 이미 슬림인 페이지는 그대로 돌려준다.
const { renderThemeInit } = require("../templates/site-chrome.js");

const SITE_HEAD_SRC = "../assets/site-head.js";
const TRANSFORMS = ["theme", "ga", "indent"];

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "슬림 전" 인라인 테마 스크립트 — site-chrome 의 렌더러에서 그대로 가져와 한 곳에서만 정의한다.
const THEME_FAT = renderThemeInit().split("\n")[1]; // <script>…</script> 한 줄
const THEME_RE = new RegExp("(<!-- theme-init:start -->\\r?\\n)" + esc(THEME_FAT) + "(\\r?\\n<!-- theme-init:end -->)");
const THEME_SLIM_RE = new RegExp("<!-- theme-init:start -->\\r?\\n" + esc(`<script src="${SITE_HEAD_SRC}"></script>`) + "\\r?\\n<!-- theme-init:end -->");

const GA_RE = new RegExp(
  "(<!-- GA4 analytics:start -->\\r?\\n<script async src=\"https://www\\.googletagmanager\\.com/gtag/js\\?id=(G-[A-Z0-9]+)\"></script>)\\r?\\n" +
    "<script>\\r?\\n" +
    "  window\\.dataLayer = window\\.dataLayer \\|\\| \\[\\];\\r?\\n" +
    "  function gtag\\(\\)\\{dataLayer\\.push\\(arguments\\);\\}\\r?\\n" +
    "  gtag\\('js', new Date\\(\\)\\);\\r?\\n" +
    "  gtag\\('config', '(G-[A-Z0-9]+)'\\);\\r?\\n" +
    "</script>(\\r?\\n<!-- GA4 analytics:end -->)"
);

const BLOCK_RES = [/<header class="site-header">[\s\S]*?<\/header>/, /<footer class="site-footer">[\s\S]*?<\/footer>/];

function isTermPage(html) {
  return html.includes('<main class="delay-1">') && html.includes('<header class="site-header">');
}

/**
 * @param {string} html
 * @param {{transforms?: string[]}} [opts]
 * @returns {{html:string, applied:string[], notes:string[]}}  notes: 알아보지 못한(건너뛴) 변형 사유
 */
function slimPage(html, opts = {}) {
  const want = new Set(opts.transforms || TRANSFORMS);
  const applied = [];
  const notes = [];
  let out = html;

  if (want.has("theme")) {
    if (THEME_RE.test(out)) {
      out = out.replace(THEME_RE, (m, a, b) => a + `<script src="${SITE_HEAD_SRC}"></script>` + b);
      applied.push("theme");
    } else if (!THEME_SLIM_RE.test(out)) notes.push("theme-init 블록이 표준 형태가 아님");
  }

  if (want.has("ga")) {
    const m = GA_RE.exec(out);
    if (m) {
      if (m[2] !== m[3]) notes.push("GA4 async id 와 config id 가 다름");
      else {
        out = out.replace(GA_RE, (all, head, id1, id2, end) => head + end);
        applied.push("ga");
      }
    } else if (/window\.dataLayer/.test(out)) notes.push("GA4 인라인 스니펫이 표준 형태가 아님");
  }

  if (want.has("indent")) {
    let changed = false;
    for (const re of BLOCK_RES) {
      out = out.replace(re, (blk) => {
        const next = blk.replace(/(\r?\n)[ \t]+/g, "$1");
        if (next !== blk) changed = true;
        return next;
      });
    }
    if (changed) applied.push("indent");
  }

  return { html: out, applied, notes };
}

// ---- 검증 -------------------------------------------------------------------------------------

// 변환 전후로 개수가 같아야 하는 문자열(다른 스크립트들이 위치 찾기에 쓰는 앵커 + SEO/크롤 신호).
const INVARIANT_STRINGS = [
  "<!DOCTYPE html>", '<html lang="ko">', "</head>", '<body data-base="../">', '<main class="delay-1">', "</main>",
  '<header class="site-header">', "</header>", '<footer class="site-footer">', "</footer>", "</body>", "</html>",
  '<link rel="canonical"', '<meta name="googlebot" content="noindex">',
  '<link rel="stylesheet" href="../style.css">', '<link rel="stylesheet" href="../assets/term-nav.css">',
  "<h2>관련 용어</h2>", '<div class="related-terms">', '<nav class="term-pager"', '<aside class="stage-link">',
  '<div class="definition-box">', '<div class="category-badges">', '<button id="bookmark-btn"',
  'id="theme-toggle"', 'id="menu-toggle"', 'id="site-nav"', 'id="global-term-search"',
  "googletagmanager.com/gtag/js?id=", "pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=",
  'type="application/ld+json"', "../assets/vendor/fuse.min.js", "../assets/header-search.js", "../assets/nav-auth.js",
  "../assets/term-history.js", "../assets/mobile-nav.js", "../assets/term-back-nav.js", "../assets/term-bookmark.js",
  "<!-- concept-diagram:start -->", "<!-- concept-diagram:end -->", "<!-- concept-path:start -->", "<!-- concept-family:start -->",
  "<!-- navbox:start -->", "<!-- term-extras:", "<!-- term-updated:start -->",
];

const countOf = (s, needle) => {
  let n = 0;
  for (let i = s.indexOf(needle); i !== -1; i = s.indexOf(needle, i + needle.length)) n++;
  return n;
};
const all = (s, re) => s.match(re) || [];
const mainOf = (s) => {
  const a = s.indexOf("<main");
  const b = s.lastIndexOf("</main>");
  return a === -1 || b === -1 ? "" : s.slice(a, b + 7);
};
const eolKind = (s) => `${all(s, /\r\n/g).length}/${all(s, /(?<!\r)\n/g).length}`;
const wsFree = (s) => s.replace(/\s+/g, "");

/** 변환 전후 비교. 문제 목록(빈 배열이면 통과)을 돌려준다. */
function verifySlim(before, after) {
  const p = [];
  if (mainOf(before) !== mainOf(after)) p.push("(a) <main> 바이트가 달라짐");
  if (wsFree(all(mainOf(before).replace(/<[^>]+>/g, ""), /\S+/g).join("")) !== wsFree(all(mainOf(after).replace(/<[^>]+>/g, ""), /\S+/g).join(""))) p.push("(a) <main> 텍스트가 달라짐");

  const cb = all(before, /<!--[\s\S]*?-->/g);
  const ca = all(after, /<!--[\s\S]*?-->/g);
  if (cb.join("\u0000") !== ca.join("\u0000")) p.push("(b) 주석(마커) 목록이 달라짐");
  for (const s of INVARIANT_STRINGS) {
    if (countOf(before, s) !== countOf(after, s)) p.push(`(b) 앵커 개수 변화: ${s}`);
  }

  // (c) SEO·메타 신호
  const same = (name, re) => {
    if (all(before, re).join("\u0000") !== all(after, re).join("\u0000")) p.push(`(c) ${name} 변경`);
  };
  same("title", /<title>[\s\S]*?<\/title>/g);
  same("meta", /<meta\b[^>]*>/g);
  same("link", /<link\b[^>]*>/g);
  same("JSON-LD", /<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  same("AdSense 태그", /<script async src="https:\/\/pagead2[^>]*><\/script>/g);
  same("<html>/<body> 열기 태그", /<(?:html|body)\b[^>]*>/g);

  // 외부 스크립트 태그: 순서 유지, 추가는 site-head.js 하나뿐
  const ext = (s) => all(s, /<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/g);
  const eb = ext(before);
  const ea = ext(after).filter((t, i, arr) => !(t.includes("site-head.js") && !eb.includes(t)));
  if (eb.join("\n") !== ea.join("\n")) p.push("(b) 외부 스크립트 태그 목록이 달라짐");
  if (countOf(after, "site-head.js") > 1) p.push("site-head.js 중복");
  // site-head.js 를 쓰면 인라인 gtag 초기화가 남아 있어도(마커 없는 변형) config 이중 호출은 가드가 막는다 — 여기선 theme/ga 짝만 확인
  if (after.includes("site-head.js") && /localStorage\.getItem\("theme"\)/.test(after)) p.push("테마 인라인 스크립트가 site-head.js 와 함께 남아 있음");

  // 줄바꿈: 종류별 개수 유지(이 변환은 줄을 지우지 않는다 — 단 GA 인라인 6줄 제거분은 별도 계산)
  const crB = all(before, /\r\n/g).length, lfB = all(before, /(?<!\r)\n/g).length;
  const crA = all(after, /\r\n/g).length, lfA = all(after, /(?<!\r)\n/g).length;
  if ((crB === 0) !== (crA === 0) || (lfB === 0) !== (lfA === 0)) p.push(`줄바꿈 종류 변화 ${eolKind(before)} → ${eolKind(after)}`);

  // 헤더/푸터: 공백만 달라졌는지
  for (const re of BLOCK_RES) {
    const hb = (re.exec(before) || [""])[0];
    const ha = (re.exec(after) || [""])[0];
    if (wsFree(hb) !== wsFree(ha) || hb.replace(/(\r?\n)[ \t]+/g, "$1") !== ha.replace(/(\r?\n)[ \t]+/g, "$1")) p.push("(b) header/footer 가 공백 외에 달라짐");
  }
  return p;
}

// 슬림 전/후 상태 판별 (리포트용)
function stateOf(html) {
  return {
    themeFat: THEME_RE.test(html),
    themeSlim: THEME_SLIM_RE.test(html),
    gaFat: GA_RE.test(html),
  };
}

module.exports = { slimPage, verifySlim, isTermPage, stateOf, SITE_HEAD_SRC, TRANSFORMS, INVARIANT_STRINGS, THEME_FAT };
