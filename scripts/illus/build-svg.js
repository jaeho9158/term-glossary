#!/usr/bin/env node
// 도해 스펙(data/illus/specs/<slug>.json, svg-illus 형식) → assets/illus/<slug>.svg
//   node scripts/illus/build-svg.js           모든 스펙을 렌더해 SVG 파일을 쓴다(바뀐 것만)
//   node scripts/illus/build-svg.js --check   파일이 스펙과 같은지만 확인(다르면 종료 코드 1)
//   node scripts/illus/build-svg.js --check --warn-obscured   글자 가림 경고 목록도 출력
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

// 글자 가림(글자가 도형·선·점에 가려지거나 걸침) 경고 목록. 렌더는 막지 않는다.
function obscured(spec) {
  return renderSVG(spec, { templates, strict: true }).report.obscured;
}

function run() {
  const check = process.argv.includes("--check");
  let changed = 0, same = 0, warnSpecs = 0, warnItems = 0;
  const warn = process.argv.includes("--warn-obscured");
  for (const f of fs.readdirSync(SPEC_DIR).filter((x) => x.endsWith(".json")).sort()) {
    const spec = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, f), "utf8"));
    if (spec.id + ".json" !== f) throw new Error(`${f}: id 불일치`);
    const out = path.join(OUT_DIR, spec.id + ".svg");
    const svg = build(spec);
    if (warn) { const o = obscured(spec); if (o.length) { warnSpecs++; warnItems += o.length; console.log(`가림 경고 ${spec.id}: ${o.map((x) => x.text + "(" + x.by + "/" + x.why + ")").join(", ")}`); } }
    const prev = fs.existsSync(out) ? fs.readFileSync(out, "utf8").replace(/\r\n/g, "\n") : null;
    if (prev === svg) { same++; continue; }
    changed++;
    if (!check) fs.writeFileSync(out, svg, "utf8");
  }
  console.log(`${check ? "[check] " : ""}도해 SVG 갱신 ${changed} · 그대로 ${same}`);
  if (warn) console.log(`글자 가림 경고: 도해 ${warnSpecs}개 · ${warnItems}건`);
  if (check && changed) process.exitCode = 1;
}

if (require.main === module) run();
module.exports = { build, obscured };
