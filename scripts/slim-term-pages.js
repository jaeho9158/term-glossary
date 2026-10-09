#!/usr/bin/env node
// terms/*.html 슬림화 (반복 블록을 assets/site-head.js 로 이동). 변환 규칙은 scripts/lib/slim-term-page.js.
//
//   node scripts/slim-term-pages.js                      # --dry-run (기본): 전체를 읽기만 하고 통계 출력
//   node scripts/slim-term-pages.js --sample 500         # 시드 고정 무작위 500쪽만
//   node scripts/slim-term-pages.js --only a,b,c         # 슬러그 지정
//   node scripts/slim-term-pages.js --transforms theme,ga   # 변환 선택 (기본: theme,ga,indent)
//   node scripts/slim-term-pages.js --export DIR         # 대상 페이지의 before/after 복사본을 DIR 에 저장(terms/ 는 건드리지 않음)
//   node scripts/slim-term-pages.js --write              # 실제 적용 — 검증을 통과한 페이지만 덮어쓴다
//
// 한 프로세스에서 전부 처리하고 git 은 호출하지 않는다. 검증에 실패한 페이지는 --write 에서도 건드리지 않는다.
const fs = require("fs");
const path = require("path");
const { slimPage, verifySlim, TRANSFORMS } = require("./lib/slim-term-page.js");

const ROOT = path.join(__dirname, "..");
const TERMS = path.join(ROOT, "terms");

function parseArgs(argv) {
  const o = { write: false, sample: 0, seed: 20261009, only: null, transforms: TRANSFORMS, exportDir: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") o.write = true;
    else if (a === "--dry-run") o.write = false;
    else if (a === "--json") o.json = true;
    else if (a === "--sample") o.sample = Number(argv[++i]);
    else if (a === "--seed") o.seed = Number(argv[++i]);
    else if (a === "--only") o.only = argv[++i].split(",").map((s) => s.trim().replace(/\.html$/, "")).filter(Boolean);
    else if (a === "--transforms") o.transforms = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--export") o.exportDir = path.resolve(argv[++i]);
    else throw new Error(`알 수 없는 옵션: ${a}`);
  }
  for (const t of o.transforms) if (!TRANSFORMS.includes(t)) throw new Error(`알 수 없는 변환: ${t}`);
  return o;
}

function seededPick(names, n, seed) {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const pool = names.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).sort();
}

// 적용하지 않는 후보 절감량 추정(리포트용)
function potentials(html) {
  const pot = {};
  pot.crlf = (html.match(/\r/g) || []).length;
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (ld) {
    try { pot.jsonldMin = Buffer.byteLength(ld[1]) - Buffer.byteLength(JSON.stringify(JSON.parse(ld[1]))); } catch (e) { pot.jsonldMin = 0; }
  }
  const hd = /<header class="site-header">[\s\S]*?<\/header>/.exec(html);
  pot.header = hd ? Buffer.byteLength(hd[0]) : 0;
  const tail = /<\/footer>([\s\S]*)<\/html>/.exec(html);
  pot.tailScripts = tail ? Buffer.byteLength(tail[1]) : 0;
  return pot;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  let names = fs.readdirSync(TERMS).filter((f) => f.endsWith(".html")).sort();
  const total = names.length;
  if (o.only) names = o.only.map((s) => `${s}.html`).filter((f) => fs.existsSync(path.join(TERMS, f)));
  else if (o.sample) names = seededPick(names, o.sample, o.seed);

  const st = {
    mode: o.write ? "WRITE" : "dry-run", files: total, considered: names.length, stubs: 0, termPages: 0,
    before: 0, after: 0, changed: 0, alreadySlim: 0, failed: [], notes: [],
    perTransform: Object.fromEntries(TRANSFORMS.map((t) => [t, { pages: 0, bytes: 0 }])),
    pot: { crlf: 0, jsonldMin: 0, header: 0, tailScripts: 0 }, written: 0, exported: [],
  };
  if (o.exportDir) fs.mkdirSync(path.join(o.exportDir, "before"), { recursive: true }), fs.mkdirSync(path.join(o.exportDir, "after"), { recursive: true });

  for (const f of names) {
    const file = path.join(TERMS, f);
    const buf = fs.readFileSync(file);
    const html = buf.toString("utf8");
    if (!Buffer.from(html, "utf8").equals(buf)) { st.failed.push([f, "UTF-8 왕복 불일치(건드리지 않음)"]); continue; }
    if (!html.includes('<main class="delay-1">') || !html.includes('<header class="site-header">')) { st.stubs++; continue; }
    st.termPages++;
    st.before += buf.length;

    const r = slimPage(html, { transforms: o.transforms });
    for (const n of r.notes) st.notes.push([f, n]);
    const problems = r.html === html ? [] : verifySlim(html, r.html);
    // 멱등 확인
    if (!problems.length && r.html !== html && slimPage(r.html, { transforms: o.transforms }).html !== r.html) problems.push("멱등 아님");
    if (problems.length) { st.failed.push([f, problems.join("; ")]); st.after += buf.length; continue; }

    const outBytes = Buffer.byteLength(r.html);
    st.after += outBytes;
    if (r.html === html) st.alreadySlim++;
    else {
      st.changed++;
      for (const t of r.applied) {
        const one = slimPage(html, { transforms: [t] });
        st.perTransform[t].pages++;
        st.perTransform[t].bytes += buf.length - Buffer.byteLength(one.html);
      }
    }
    const pot = potentials(r.html);
    for (const k of Object.keys(st.pot)) st.pot[k] += pot[k] || 0;

    if (o.exportDir) {
      fs.writeFileSync(path.join(o.exportDir, "before", f), buf);
      fs.writeFileSync(path.join(o.exportDir, "after", f), r.html, "utf8");
      st.exported.push(f);
    }
    if (o.write && r.html !== html) {
      const tmp = `${file}.slim.tmp`;
      fs.writeFileSync(tmp, r.html, "utf8");
      fs.renameSync(tmp, file);
      st.written++;
    }
  }

  const saved = st.before - st.after;
  const pct = st.before ? ((saved / st.before) * 100).toFixed(2) : "0";
  if (o.json) { console.log(JSON.stringify(st, null, 1)); return; }
  console.log(`[${st.mode}] terms/ 파일 ${st.files}개 중 대상 ${st.considered}개: 용어 페이지 ${st.termPages}, 스텁 ${st.stubs}`);
  console.log(`바이트 ${st.before.toLocaleString()} -> ${st.after.toLocaleString()}  (절감 ${saved.toLocaleString()} B, ${pct}%, 페이지당 평균 ${st.termPages ? (saved / st.termPages).toFixed(0) : 0} B)`);
  console.log(`변경 ${st.changed}쪽, 이미 슬림 ${st.alreadySlim}쪽, 검증 실패/건너뜀 ${st.failed.length}쪽, 표준 형태 아님 노트 ${st.notes.length}건${o.write ? `, 실제로 쓴 파일 ${st.written}` : ""}`);
  for (const t of TRANSFORMS) console.log(`  ${t.padEnd(7)} ${String(st.perTransform[t].pages).padStart(6)}쪽  ${st.perTransform[t].bytes.toLocaleString()} B`);
  console.log(`(미적용 후보) CRLF의 CR ${st.pot.crlf.toLocaleString()} B, JSON-LD 압축 ${st.pot.jsonldMin.toLocaleString()} B, 헤더 ${st.pot.header.toLocaleString()} B, 꼬리(푸터 이후) ${st.pot.tailScripts.toLocaleString()} B`);
  const byReason = {};
  for (const [f, why] of [...st.failed, ...st.notes]) (byReason[why] = byReason[why] || []).push(f);
  for (const [why, fs_] of Object.entries(byReason)) console.log(`  ! ${why}: ${fs_.length}쪽 (예: ${fs_.slice(0, 3).join(", ")})`);
  if (!o.write) console.log("dry-run: 파일을 쓰지 않았습니다. 적용하려면 --write");
}

main();
