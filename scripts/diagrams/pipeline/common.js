// 파이프라인 공통: 경로, terms.json, 분야군, JSON 입출력, 시드 난수.
// DG_ROOT 환경변수를 주면 그 폴더를 저장소 루트로 본다(테스트가 임시 루트를 쓴다).
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = process.env.DG_ROOT || path.join(__dirname, "..", "..", "..");
const SPEC_DIR = path.join(ROOT, "diagrams", "specs");
const EXAMPLE_DIR = path.join(ROOT, "diagrams", "examples");
const BATCH_DIR = path.join(ROOT, "diagrams", "batches");
const STYLE_DIR = path.join(ROOT, "diagrams", "style");
const PROMPT_DIR = path.join(ROOT, "diagrams", "prompts");

const GROUPS = JSON.parse(fs.readFileSync(path.join(__dirname, "groups.json"), "utf8"));
const CAT2GROUP = new Map();
for (const [g, cats] of Object.entries(GROUPS)) for (const c of cats) CAT2GROUP.set(c, g);

// 용어의 분야군 = 첫 번째 분야의 군
function groupOf(categories) {
  const c = Array.isArray(categories) ? categories[0] : categories;
  return CAT2GROUP.get(c) || null;
}

let termsCache = null;
function loadTerms() {
  if (!termsCache) termsCache = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  return termsCache;
}

const readJSON = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback);
function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

const specPath = (slug) => path.join(SPEC_DIR, `${slug}.json`);
const specSlugs = () => new Set(fs.existsSync(SPEC_DIR) ? fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : []);

// mulberry32: 같은 시드면 같은 수열(표본 추출 재현용)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, seed) {
  const r = rng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { ROOT, SPEC_DIR, EXAMPLE_DIR, BATCH_DIR, STYLE_DIR, PROMPT_DIR, GROUPS, groupOf, loadTerms, readJSON, writeJSON, specPath, specSlugs, rng, shuffle };
