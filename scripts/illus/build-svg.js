#!/usr/bin/env node
// 도해 스펙(data/illus/specs/<slug>.json, svg-illus 형식) → assets/illus/<slug>.svg
//   node scripts/illus/build-svg.js           모든 스펙을 렌더해 SVG 파일을 쓴다(바뀐 것만)
//   node scripts/illus/build-svg.js --check   파일이 스펙과 같은지만 확인(다르면 종료 코드 1)
// 글자 겹침이 풀리지 않으면 오류로 끝낸다(strict).
"use strict";
const fs = require("fs");
const path = require("path");
const { renderSVG, templates } = require("../svg-illus/src/index.js");

const ROOT = path.join(__dirname, "..", "..");
const SPEC_DIR = path.join(ROOT, "data", "illus", "specs");
const OUT_DIR = path.join(ROOT, "assets", "illus");

function build(spec) {
  return renderSVG(spec, { templates, strict: true }).svg + "\n";
}

function run() {
  const check = process.argv.includes("--check");
  let changed = 0, same = 0;
  for (const f of fs.readdirSync(SPEC_DIR).filter((x) => x.endsWith(".json")).sort()) {
    const spec = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, f), "utf8"));
    if (spec.id + ".json" !== f) throw new Error(`${f}: id 불일치`);
    const out = path.join(OUT_DIR, spec.id + ".svg");
    const svg = build(spec);
    const prev = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null;
    if (prev === svg) { same++; continue; }
    changed++;
    if (!check) fs.writeFileSync(out, svg, "utf8");
  }
  console.log(`${check ? "[check] " : ""}도해 SVG 갱신 ${changed} · 그대로 ${same}`);
  if (check && changed) process.exitCode = 1;
}

if (require.main === module) run();
module.exports = { build };
