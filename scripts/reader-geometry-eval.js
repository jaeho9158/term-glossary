#!/usr/bin/env node
// 리더 글자 상자 위치 측정 — 사용법 안내.
//
// 글자 상자의 맞고 틀림은 pdf.js 캔버스와 브라우저에 등록되는 PDF 내장 글꼴이 있어야 잴 수 있다.
// Node 에는 그것이 없으므로 이 스크립트는 직접 재지 않고, 브라우저 측정 페이지
// tools/reader-geometry-eval.html 의 사용법을 출력한다(측정 페이지는 noindex, 커밋 대상).
//
//   node scripts/reader-geometry-eval.js <pdf>...
//
// 인자로 준 PDF 는 이 저장소 안(같은 출처)에 있어야 페이지가 읽을 수 있다. 저장소 밖 PDF 는
// 측정 페이지의 파일 선택으로 직접 고른다. docs/viewer-corpus/*.pdf 는 커밋하지 않는다.
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);

console.log("리더 글자 상자 위치 측정 (스펙 §7.1)");
console.log("1) 개발 서버를 띄운다(예: python -m http.server 8782 --directory " + root.replace(/\\/g, "/") + ")");
if (!args.length) {
  console.log("2) 브라우저에서 http://localhost:8782/tools/reader-geometry-eval.html 을 열고 PDF 를 고른 뒤 '측정 시작'.");
  console.log("   사용: node scripts/reader-geometry-eval.js <pdf>...  (그러면 바로 열 수 있는 주소를 출력한다)");
  process.exit(0);
}

const rels = [];
for (const a of args) {
  const abs = path.resolve(a);
  if (!fs.existsSync(abs)) { console.error("없는 파일: " + a); process.exitCode = 1; continue; }
  const rel = path.relative(root, abs).replace(/\\/g, "/");
  if (rel.startsWith("..")) {
    console.error("저장소 밖 파일이라 주소로 열 수 없음(측정 페이지의 파일 선택을 쓰세요): " + a);
    continue;
  }
  rels.push("../" + rel);
}
if (rels.length) {
  const list = rels.map(encodeURI).join(",");
  console.log("2) 아래 주소를 연다. 글꼴 측정 켬/끔을 모두 재고 바로 시작한다:");
  console.log("   http://localhost:8782/tools/reader-geometry-eval.html?auto=1&both=1&pdf=" + list);
  console.log("   글꼴 측정을 끈 결과(가중치 분할)만 보려면 &both=1 대신 &measure=off");
}
console.log("3) 표(문서별·전체 맞은 비율)와 틀린 낱말 목록이 화면과 console.table 에 나온다. 통과 기준은 전체 98% 이상.");
console.log("   고정 시드(기본 20261013)라 같은 PDF 는 항상 같은 낱말을 뽑는다. 바꾸려면 &seed=N.");
