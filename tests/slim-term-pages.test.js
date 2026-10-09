const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { slimPage, verifySlim, SITE_HEAD_SRC, THEME_FAT } = require("../scripts/lib/slim-term-page.js");
const { renderThemeInit } = require("../scripts/templates/site-chrome.js");

const FIX = fs
  .readFileSync(path.join(__dirname, "fixtures", "slim", "fat-term.html"), "utf8")
  .replace(/\r\n/g, "\n");
const CRLF = FIX.replace(/\n/g, "\r\n");
const MIXED = FIX.replace(/\n/g, "\r\n").replace(/(<!-- term-meta:start -->)\r\n/, "$1\n"); // term-meta.js 는 \n 으로 이어 붙인다

const bare = (s) => (s.match(/(?<!\r)\n/g) || []).length;
const crlf = (s) => (s.match(/\r\n/g) || []).length;

for (const [name, page] of [["LF", FIX], ["CRLF", CRLF], ["혼재", MIXED]]) {
  test(`${name}: 슬림 변환 + 검증 통과 + 멱등 + 줄바꿈 종류 유지`, () => {
    const r = slimPage(page);
    assert.deepEqual(r.applied, ["theme", "ga", "indent"]);
    assert.deepEqual(r.notes, []);
    assert.deepEqual(verifySlim(page, r.html), []);
    assert.ok(r.html.length < page.length - 700, "700B 이상 줄어야 한다");
    const again = slimPage(r.html);
    assert.equal(again.html, r.html);
    assert.deepEqual(again.applied, []);
    // 이 변환은 줄을 지울 뿐 새 종류의 줄바꿈을 만들지 않는다
    if (name === "CRLF") assert.equal(bare(r.html), 0);
    if (name === "LF") assert.equal(crlf(r.html), 0);
    assert.equal(r.html.split("site-head.js").length - 1, 1);
  });
}

test("변환 후에도 마커 주석·앵커·SEO 태그가 그대로다", () => {
  const out = slimPage(CRLF).html;
  for (const s of [
    "<!-- GA4 analytics:start -->", "<!-- GA4 analytics:end -->", "<!-- theme-init:start -->", "<!-- theme-init:end -->",
    "<!-- AdSense:start -->", "<!-- AdSense:end -->", "<!-- term-meta:start -->", "<!-- term-meta:end -->",
    "<!-- index-tier:start -->", "<!-- index-tier:end -->",
    'googletagmanager.com/gtag/js?id=G-7SW2PGCN27"></script>', "adsbygoogle.js?client=ca-pub-7710727724213886",
    '<meta name="googlebot" content="noindex">', '<link rel="canonical"', 'type="application/ld+json"',
    '<link rel="stylesheet" href="../assets/term-nav.css">\r\n', '<main class="delay-1">', "<h2>관련 용어</h2>",
    '<nav class="term-pager"', '<aside class="stage-link">', "</head>", '<script type="module" src="../assets/term-bookmark.js"></script>',
  ]) assert.ok(out.includes(s), `없어짐: ${s}`);
  assert.ok(!out.includes("window.dataLayer"), "인라인 gtag 초기화는 제거돼야 한다");
  assert.ok(!out.includes("localStorage.getItem"), "인라인 테마 스크립트는 제거돼야 한다");
  // <main> 은 바이트 단위로 같다
  const m = (s) => s.slice(s.indexOf("<main"), s.lastIndexOf("</main>"));
  assert.equal(m(out), m(CRLF));
  // 헤더 내비 링크는 그대로 인라인
  for (const href of ["../index.html", "../viewer.html", "../quiz.html", "../roadmap.html", "../about.html", "../login.html"]) {
    assert.ok(out.includes(`href="${href}"`), href);
  }
});

test("--transforms 로 일부만 적용할 수 있다", () => {
  const r = slimPage(FIX, { transforms: ["theme"] });
  assert.deepEqual(r.applied, ["theme"]);
  assert.ok(r.html.includes("window.dataLayer"));
  assert.deepEqual(verifySlim(FIX, r.html), []);
});

test("표준이 아닌 GA4/테마 블록은 건드리지 않고 노트만 남긴다", () => {
  const odd = FIX.replace("gtag('js', new Date());", "gtag('js', new Date()); gtag('set', 'x', 1);")
    .replace(/<script>\(function\(\)\{try\{var t=/, "<script>(function(){var u=1;try{var t=");
  const r = slimPage(odd, { transforms: ["theme", "ga"] });
  assert.deepEqual(r.applied, []);
  assert.equal(r.html, odd);
  assert.equal(r.notes.length, 2);
});

test("GA4 async id 와 config id 가 다르면 변환하지 않는다", () => {
  const odd = FIX.replace("gtag('config', 'G-7SW2PGCN27')", "gtag('config', 'G-OTHER00000')");
  const r = slimPage(odd, { transforms: ["ga"] });
  assert.deepEqual(r.applied, []);
  assert.match(r.notes[0], /id/);
});

test("verifySlim: 본문/메타/앵커가 바뀌면 잡아낸다", () => {
  const good = slimPage(CRLF).html;
  const bad = (fn) => verifySlim(CRLF, fn(good));
  assert.ok(bad((h) => h.replace("종을 알아내는", "종을 모르는")).some((x) => x.startsWith("(a)")));
  assert.ok(bad((h) => h.replace(/<link rel="canonical"[^>]*>\r\n/, "")).length > 0);
  assert.ok(bad((h) => h.replace('<meta name="googlebot" content="noindex">', "")).length > 0);
  assert.ok(bad((h) => h.replace(/<title>[\s\S]*?<\/title>/, "<title>x</title>")).some((x) => x.includes("title")));
  assert.ok(bad((h) => h.replace(/<script async src="https:\/\/pagead2[^>]*><\/script>/, "")).length > 0);
  assert.ok(bad((h) => h.replace("<!-- AdSense:start -->", "")).some((x) => x.startsWith("(b)")));
  assert.ok(bad((h) => h.replace(/"name": "논문용어사전"/, '"name": "x"')).some((x) => x.includes("JSON-LD")));
  assert.ok(bad((h) => h.replace('<script type="module" src="../assets/term-history.js"></script>', "")).length > 0);
  assert.ok(bad((h) => h.replace(/\r\n/g, "\n")).some((x) => x.includes("줄바꿈")));
  assert.ok(bad((h) => h.replace('href="../about.html">소개', 'href="../about.html">소개2')).some((x) => x.includes("header/footer")));
});

test("THEME_FAT 은 site-chrome 의 인라인 테마 스크립트와 같고, 슬림 형식은 마커 사이에 src 한 줄이다", () => {
  assert.equal(renderThemeInit().split("\n")[1], THEME_FAT);
  assert.equal(
    renderThemeInit({ external: SITE_HEAD_SRC }),
    `<!-- theme-init:start -->\n<script src="${SITE_HEAD_SRC}"></script>\n<!-- theme-init:end -->`
  );
});

// ---- assets/site-head.js 동작 ------------------------------------------------------------------
function runSiteHead({ theme = null, dark = false, gtagSrc = "https://www.googletagmanager.com/gtag/js?id=G-TEST123", preGtag = false } = {}) {
  const attrs = {};
  const listeners = [];
  const win = {
    dataLayer: undefined,
    matchMedia: () => ({ matches: dark }),
  };
  const doc = {
    documentElement: { setAttribute: (k, v) => (attrs[k] = v), getAttribute: (k) => attrs[k] },
    addEventListener: (ev, fn) => listeners.push([ev, fn]),
    querySelector: () => (gtagSrc ? { getAttribute: () => gtagSrc } : null),
  };
  const store = { theme };
  const ctx = {
    window: win, document: doc, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) },
    matchMedia: win.matchMedia,
  };
  win.window = win;
  if (preGtag) win.gtag = () => { win.preCalled = true; };
  vm.createContext(Object.assign(win, ctx));
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "assets", "site-head.js"), "utf8"), win);
  return { win, attrs, listeners, store };
}

test("site-head.js: 테마 결정 (저장값 > 시스템 설정) 과 토글", () => {
  assert.equal(runSiteHead({ theme: "dark" }).attrs["data-theme"], "dark");
  assert.equal(runSiteHead({ theme: null, dark: true }).attrs["data-theme"], "dark");
  assert.equal(runSiteHead({ theme: null, dark: false }).attrs["data-theme"], "light");
  const r = runSiteHead({ theme: "light" });
  const click = r.listeners.find(([e]) => e === "click")[1];
  click({ target: { closest: (sel) => (sel === "#theme-toggle" ? {} : null) } });
  assert.equal(r.attrs["data-theme"], "dark");
  assert.equal(r.store.theme, "dark");
  click({ target: { closest: () => null } });
  assert.equal(r.attrs["data-theme"], "dark");
});

test("site-head.js: gtag/js 태그의 id 로 GA4 를 정확히 한 번 초기화한다", () => {
  const { win } = runSiteHead();
  const calls = Array.from(win.dataLayer, (a) => Array.from(a));
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], "js");
  assert.equal(Object.prototype.toString.call(calls[0][1]), "[object Date]");
  assert.deepEqual(calls[1], ["config", "G-TEST123"]);
});

test("site-head.js: 인라인 gtag 가 이미 있으면 config 를 또 부르지 않고, gtag 태그가 없으면 아무것도 안 한다", () => {
  const pre = runSiteHead({ preGtag: true });
  assert.equal(pre.win.dataLayer, undefined);
  const none = runSiteHead({ gtagSrc: null });
  assert.equal(none.win.dataLayer, undefined);
  assert.equal(none.attrs["data-theme"], "light");
});

test("site-head.js 의 측정 ID 는 HTML 의 async 태그에서만 읽는다(하드코딩 없음)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "assets", "site-head.js"), "utf8");
  assert.ok(!/G-[A-Z0-9]{6,}/.test(src));
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scripts", "analytics-config.json"), "utf8"));
  assert.ok(FIX.includes(`gtag/js?id=${cfg.ga4MeasurementId}"`));
});
