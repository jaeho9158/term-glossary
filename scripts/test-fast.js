#!/usr/bin/env node
// 빠른 테스트: 바뀐 파일에서 slug를 뽑아 순회형 테스트를 TEST_SLUGS로 좁히고, 단위 테스트는 그대로 전부 돈다.
// 사용: node scripts/test-fast.js [--since <ref> | --staged] [--full]   (기본: HEAD~1..작업 트리)
// 공용 파일(terms.json·scripts·style·viewer 등)이 바뀌면 전체 실행이 필요하다. --full이면 npm test를 돌리고, 아니면 경고 후 종료(코드 2).
const { execFileSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const SLUG_RES = [
  /^terms\/([^/]+)\.html$/,
  /^data\/term-extras\/([^/]+)\.json$/,
  /^data\/term-usage\/([^/]+)\.json$/,
  /^data\/illus\/(?:specs\/)?([^/]+)\.json$/,
  /^diagrams\/specs\/([^/]+)\.json$/,
  /^assets\/illus\/([^/]+)\.svg$/,
];
const SHARED_RE = /^(terms\.json|terms-index\.json|terms-lite\.json|viewer[^/]*|style[^/]*\.css|assets\/|scripts\/|tests\/|package(-lock)?\.json)/;

function classify(files) {
  const slugs = new Set(), shared = [];
  for (const f of files) {
    const m = SLUG_RES.map((re) => f.match(re)).find(Boolean);
    if (m) slugs.add(m[1]);
    else if (SHARED_RE.test(f)) shared.push(f);
  }
  return { slugs: [...slugs].sort(), shared };
}

function changedFiles(args) {
  const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean);
  if (args.includes("--staged")) return git("diff", "--name-only", "--cached");
  const i = args.indexOf("--since");
  const base = i >= 0 ? args[i + 1] : "HEAD~1";
  if (!base) throw new Error("--since 뒤에 ref가 필요해요");
  return git("diff", "--name-only", base); // base..작업 트리(스테이징 포함)
}

function main(args) {
  const t0 = Date.now();
  const testFiles = fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".test.js")).map((f) => path.join("tests", f));
  let env = process.env.TEST_SLUGS != null ? process.env.TEST_SLUGS : null; // 직접 지정하면 git 비교를 건너뛴다
  if (env == null) {
    const { slugs, shared } = classify(changedFiles(args));
    if (shared.length) {
      console.log(`공용 파일이 바뀌어 전체 실행이 필요해요 (${shared.length}개: ${shared.slice(0, 5).join(", ")}${shared.length > 5 ? " …" : ""})`);
      if (!args.includes("--full")) { console.log("npm test 를 돌리거나 --full 로 다시 실행하세요."); return 2; }
      env = null;
    } else env = slugs.join(",") || "-"; // "-": 바뀐 slug 없음 → 순회형은 건너뛰고 단위 테스트만
    console.log(env == null ? "전체 실행" : `대상 slug ${slugs.length}개: ${slugs.slice(0, 10).join(", ")}${slugs.length > 10 ? " …" : ""}`);
  }
  const childEnv = { ...process.env };
  if (env == null) delete childEnv.TEST_SLUGS; else childEnv.TEST_SLUGS = env;
  const r = spawnSync(process.execPath, ["--test", ...testFiles], { cwd: ROOT, env: childEnv, encoding: "utf8", maxBuffer: 1 << 28 });
  const out = (r.stdout || "") + (r.stderr || "");
  if (r.status !== 0) process.stdout.write(out.split("\n").filter((l) => /^not ok|^✖|AssertionError|Error \[/.test(l) || /^\s+(error|expected|actual|location):/.test(l)).slice(0, 80).join("\n") + "\n");
  const pick = (k) => (out.match(new RegExp(`^(?:#|ℹ) ${k} (\\d+)`, "m")) || [])[1] || "?";
  console.log(`\n결과: ${r.status === 0 ? "통과" : "실패"} | 테스트 ${pick("tests")} 통과 ${pick("pass")} 실패 ${pick("fail")} | ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  return r.status === 0 ? 0 : 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { classify };
