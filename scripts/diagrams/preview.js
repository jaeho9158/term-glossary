// 도식 스펙 전체를 검증하고 미리보기를 만든다(검수 전 스펙 포함).
//
//   node scripts/diagrams/preview.js            검증 + diagrams/preview.html + svg 사본
//   node scripts/diagrams/preview.js --png      + 데스크톱(820px)·모바일(400px) PNG
//   node scripts/diagrams/preview.js --strict   겹침 경고가 있으면 실패 코드로 종료
//
// PNG는 시스템 Chrome의 --headless --screenshot을 쓴다(npm 의존성 추가 없음).
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { validateSpec, renderFigure, renderSpec } = require("./lib.js");

const ROOT = path.join(__dirname, "..", "..");
const SPEC_DIR = path.join(ROOT, "diagrams", "specs");
const OUT_SVG = path.join(ROOT, "diagrams", "svg");
const OUT_PNG = path.join(ROOT, "diagrams", "png");
const args = new Set(process.argv.slice(2));

function loadTitles() {
  // 39MB라 한 번만 읽고 slug→제목 맵만 남긴다.
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  return new Map(terms.map((t) => [t.slug, t.title_ko]));
}

function loadSpecs() {
  if (!fs.existsSync(SPEC_DIR)) return [];
  return fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => {
    const file = path.join(SPEC_DIR, f);
    try {
      return { file: f, spec: JSON.parse(fs.readFileSync(file, "utf8")) };
    } catch (e) {
      return { file: f, parseError: e.message };
    }
  });
}

function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  return cands.find((p) => fs.existsSync(p));
}

// PNG 한 장용 독립 HTML. style.css의 --dg-* 변수를 그대로 쓴다.
// headless Chrome은 창 폭을 약 500px 아래로 줄이지 못해서 480px 미디어쿼리가
// 켜지지 않는다. 그래서 모바일 PNG는 창 폭이 아니라 400px짜리 컨테이너에 넣고,
// 미디어쿼리와 같은 효과(세로판 표시)를 클래스로 직접 준다.
function pngPage(figureHtml, theme, width, narrow) {
  const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
  const narrowCss = narrow
    ? ".wrap .concept-diagram.dg-dual .dg-h{display:none}.wrap .concept-diagram.dg-dual .dg-v{display:block}"
    : "";
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${css}
body{margin:0;padding:12px;background:var(--bg);font-family:'Pretendard','Noto Sans KR','Apple SD Gothic Neo',sans-serif}
.wrap{width:${width}px;box-sizing:border-box}.concept-diagram{margin:0}${narrowCss}</style></head><body><div class="wrap">${figureHtml}</div></body></html>`;
}

function run() {
  const titles = loadTitles();
  const known = new Set(titles.keys());
  const rows = [];
  let errors = 0, warned = 0;
  fs.mkdirSync(OUT_SVG, { recursive: true });

  for (const { file, spec, parseError } of loadSpecs()) {
    if (parseError) {
      errors++;
      rows.push({ file, slug: file, errs: [`JSON 파싱 실패: ${parseError}`], warnings: [] });
      continue;
    }
    const errs = validateSpec(spec, known);
    if (`${spec.slug}.json` !== file) errs.push(`파일명과 slug 불일치: ${file}`);
    if (errs.length) {
      errors++;
      rows.push({ file, slug: spec.slug, type: spec.type, errs, warnings: [] });
      continue;
    }
    const title = titles.get(spec.slug);
    const fig = renderFigure(spec, title);
    if (fig.warnings.length) warned++;
    fs.writeFileSync(path.join(OUT_SVG, `${spec.slug}.svg`), renderSpec(spec, { title }).svg, "utf8");
    rows.push({ file, slug: spec.slug, type: spec.type, title, reviewed: spec.reviewed, errs: [], warnings: fig.warnings, html: fig.html });
  }

  // 미리보기 HTML: 라이트·다크를 나란히, 폭 400px 컬럼으로 모바일 모습도 함께.
  const cards = rows.map((r) => {
    const head = `<h2>${r.title || r.slug} <small>${r.slug} · ${r.type || "?"}${r.reviewed ? " · 검수됨" : " · 검수 전"}</small></h2>`;
    const problems = [...r.errs.map((e) => `<li class="err">${e}</li>`), ...r.warnings.map((w) => `<li class="warn">${w}</li>`)].join("");
    const body = r.html
      ? `<div class="cols"><div data-theme="light" class="pane">${r.html}</div><div data-theme="dark" class="pane dark">${r.html}</div><div class="pane narrow">${r.html}</div></div>`
      : "";
    return `<section>${head}${problems ? `<ul>${problems}</ul>` : ""}${body}</section>`;
  }).join("\n");
  const page = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><title>개념 도식 미리보기</title>
<link rel="stylesheet" href="../style.css"><style>
body{padding:20px;font-family:'Pretendard','Noto Sans KR',sans-serif;background:#f4f5f7}
section{background:#fff;margin:0 0 28px;padding:12px 16px;border-radius:8px}
h2{font-size:16px;margin:0 0 8px} small{color:#888;font-weight:400}
.cols{display:grid;grid-template-columns:1fr 1fr 400px;gap:12px;align-items:start}
.pane{padding:4px} .dark{background:#14171a}
.err{color:#b00} .warn{color:#a60}
/* 미리보기에서도 좁은 컬럼은 세로판을 보여 준다(미디어쿼리 대신 컨테이너 기준). */
.narrow .concept-diagram.dg-dual .dg-h{display:none} .narrow .concept-diagram.dg-dual .dg-v{display:block}
</style></head><body><h1>개념 도식 미리보기 (${rows.length}개)</h1>${cards}</body></html>`;
  // 다크 칸은 data-theme 속성만으로 변수가 바뀌도록 style.css 선택자를 흉내 낸다.
  const darkVars = fs.readFileSync(path.join(ROOT, "style.css"), "utf8").match(/:root\[data-theme="dark"\] \{\n  --dg-blue-f[\s\S]*?\n\}/);
  const pageWithDark = darkVars ? page.replace("</style>", `${darkVars[0].replace(':root[data-theme="dark"]', '[data-theme="dark"].pane, .dark')}\n</style>`) : page;
  fs.writeFileSync(path.join(ROOT, "diagrams", "preview.html"), pageWithDark, "utf8");

  if (args.has("--png")) {
    const chrome = findChrome();
    if (!chrome) console.warn("Chrome을 찾지 못해 PNG를 건너뜁니다(CHROME_PATH로 지정 가능).");
    else {
      fs.mkdirSync(OUT_PNG, { recursive: true });
      const tmp = path.join(OUT_PNG, "_page.html");
      for (const r of rows.filter((x) => x.html)) {
        for (const [tag, w, theme, narrow] of [["desktop", 796, "light", false], ["mobile", 376, "light", true], ["dark", 796, "dark", false]]) {
          fs.writeFileSync(tmp, pngPage(r.html, theme, w, narrow), "utf8");
          const out = path.join(OUT_PNG, `${r.slug}.${tag}.png`);
          execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--window-size=${w + 24},${narrow ? 1100 : 640}`, `--screenshot=${out}`, `file:///${tmp.replace(/\\/g, "/")}`], { stdio: "ignore" });
        }
      }
      fs.rmSync(tmp, { force: true });
    }
  }

  for (const r of rows) {
    const flag = r.errs.length ? "오류" : r.warnings.length ? "경고" : "OK";
    console.log(`${flag.padEnd(3)} ${r.slug} (${r.type || "?"})`);
    for (const e of r.errs) console.log(`     ✗ ${e}`);
    for (const w of r.warnings) console.log(`     ! ${w}`);
  }
  console.log(`\n스펙 ${rows.length}개 · 오류 ${errors} · 겹침 경고 ${warned} → diagrams/preview.html`);
  if (errors || (args.has("--strict") && warned)) process.exitCode = 1;
}

run();
