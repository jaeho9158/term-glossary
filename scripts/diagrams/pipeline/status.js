// 배치 상태: diagrams/batches/<NNN>/status.json
"use strict";
const fs = require("fs");
const path = require("path");
const { BATCH_DIR, readJSON, writeJSON } = require("./common.js");

const STATES = ["pending", "triaged", "dropped", "checked", "check_failed", "reviewed", "approved"];

const batchDir = (n) => path.join(BATCH_DIR, String(n).padStart(3, "0"));
const statusFile = (n) => path.join(batchDir(n), "status.json");

function load(n) {
  const st = readJSON(statusFile(n), null);
  if (!st) throw new Error(`배치 ${n} 없음: ${statusFile(n)}`);
  return st;
}
const save = (n, st) => writeJSON(statusFile(n), st);

function setState(st, slug, state, extra = {}) {
  if (!STATES.includes(state)) throw new Error(`알 수 없는 상태: ${state}`);
  const cur = st.items[slug];
  if (!cur) throw new Error(`배치에 없는 slug: ${slug}`);
  Object.assign(cur, extra, { state });
}

const inState = (st, ...states) => Object.keys(st.items).filter((s) => states.includes(st.items[s].state));

function counts(st) {
  const c = {};
  for (const it of Object.values(st.items)) c[it.state] = (c[it.state] || 0) + 1;
  return c;
}

// 모든 배치에 이미 든 slug(새 배치가 겹치지 않게)
function allBatchedSlugs() {
  const out = new Set();
  if (!fs.existsSync(BATCH_DIR)) return out;
  for (const d of fs.readdirSync(BATCH_DIR)) {
    const st = readJSON(path.join(BATCH_DIR, d, "status.json"), null);
    if (st) for (const s of Object.keys(st.items)) out.add(s);
  }
  return out;
}

module.exports = { STATES, batchDir, statusFile, load, save, setState, inState, counts, allBatchedSlugs };
