#!/usr/bin/env node
// 도해 SVG를 다크·라이트 PNG 두 장으로 렌더한다(헤드리스 Chrome, 별도 설치 불필요).
//   node scripts/illus/render-png.js <slug...>           → <OUT>/<slug>-dark.png, <slug>-light.png
//   환경변수 CHROME(실행 파일), ILLUS_PNG_DIR(출력 폴더)로 바꿀 수 있다.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { TOKENS } = require("../svg-illus/src/index.js");

const ROOT = path.join(__dirname, "..", "..");
const OUT = process.env.ILLUS_PNG_DIR || "C:/Users/hssh9/용돈벌이/.superpowers/illus-rep/png";
const CHROMES = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean);
const chrome = CHROMES.find((p) => fs.existsSync(p));
if (!chrome) { console.error("Chrome/Edge 실행 파일을 찾지 못했습니다(CHROME 환경변수로 지정)."); process.exit(1); }

function page(svg, mode) {
  const t = TOKENS[mode], vars = Object.entries(t).map(([k, v]) => `--si-${k}:${v};`).join("");
  return `<!doctype html><meta charset="utf-8"><style>:root{${vars}}html,body{margin:0;background:${t.bg};color:${t.ink}}
body{padding:12px}svg{display:block;width:100%}</style>${svg}`;
}

function shot(slug, mode, svg, w, h) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "illus-png-"));
  const html = path.join(tmp, "p.html");
  fs.writeFileSync(html, page(svg, mode), "utf8");
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, `${slug}-${mode}.png`);
  const r = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=1500", "--run-all-compositor-stages-before-draw", "--force-device-scale-factor=2",
    `--window-size=${Math.ceil(w) + 24},${Math.ceil(h) + 24}`, `--user-data-dir=${path.join(tmp, "u")}`,
    `--screenshot=${out}`, require("url").pathToFileURL(html).href], { encoding: "utf8", timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!fs.existsSync(out)) throw new Error(`${slug} ${mode}: 렌더 실패 ${r.stderr || ""}`);
  return out;
}

for (const slug of process.argv.slice(2)) {
  const f = path.join(ROOT, "assets", "illus", slug + ".svg");
  if (!fs.existsSync(f)) { console.error(`${slug}: assets/illus/${slug}.svg 없음`); process.exitCode = 1; continue; }
  const svg = fs.readFileSync(f, "utf8");
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), w = +vb[1], h = +vb[2];
  for (const mode of ["dark", "light"]) console.log(shot(slug, mode, svg, w, h));
}
