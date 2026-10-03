// 배치 CLI 한 바퀴: new → triage-in → triage-apply → write-in → (스펙 작성) → check → review-in(--no-png) → review-apply → preview → approve
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "dg-batch-"));
const w = (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s, "utf8"); };
const page = (def) => `<div class="definition-box"><p>한 줄 정의: ${def}</p></div>\n<h2>쉽게 풀면</h2><p>쉽게 ${def}</p><h2>조금 더 깊게 보면</h2><p>깊게</p><h2>주의할 점</h2><p>주의</p></article>`;
const terms = [
  { slug: "alpha-term", title_ko: "알파", title_en: "Alpha", categories: ["stat"], definition: "검정에서 1종 오류 확률" },
  { slug: "beta-term", title_ko: "베타", title_en: "Beta", categories: ["stat"], definition: "2종 오류 확률" },
  { slug: "gamma-term", title_ko: "감마", title_en: "Gamma", categories: ["neuro"], definition: "뇌파 대역" },
  { slug: "done-term", title_ko: "기존", title_en: "Done", categories: ["stat"], definition: "이미 도식 있음" },
];
w("terms.json", JSON.stringify(terms));
for (const t of terms) w(`terms/${t.slug}.html`, page(t.definition));
w("diagrams/specs/done-term.json", JSON.stringify({ slug: "done-term", type: "chain", nodes: [{ id: "a", label: "가" }, { id: "b", label: "나" }], edges: [{ from: "a", to: "b" }], source: "t", reviewed: true }));
w("diagrams/style/stats.md", "# stats 스타일\n");
w("diagrams/style/life.md", "# life 스타일\n");
// _fields가 순서를 정하고(정렬하면 neuro가 먼저), _로 시작하는 키는 목록이 아니다
w("data/popular-terms.json", JSON.stringify({ _note: "메모", _fields: ["stat", "neuro"], neuro: ["gamma-term"], stat: ["beta-term", "alpha-term"] }));

const run = (...args) => execFileSync(process.execPath, [path.join(REPO, "scripts/diagrams/pipeline/batch.js"), ...args], { env: { ...process.env, DG_ROOT: root }, encoding: "utf8" });
const status = () => JSON.parse(fs.readFileSync(path.join(root, "diagrams/batches/001/status.json"), "utf8"));

try {
  // new: 기존 스펙 있는 done-term은 빠지고, popular 순서가 앞에 온다
  run("new", "1", "--size", "10", "--order", "popular", "--seed", "1");
  assert.deepStrictEqual(Object.keys(status().items), ["beta-term", "gamma-term", "alpha-term"]);
  assert.throws(() => run("new", "1", "--size", "1"), /이미 있음/);

  // triage-in: 50개씩 묶음
  run("triage-in", "1");
  const tin = JSON.parse(fs.readFileSync(path.join(root, "diagrams/batches/001/triage/in-01.json"), "utf8"));
  assert.strictEqual(tin.items.length, 3);
  assert.strictEqual(tin.items[0].page.easy, "쉽게 2종 오류 확률");

  // triage-apply: 잘못된 항목은 pending으로 남고 오류 출력
  w("diagrams/batches/001/triage/out-01.json", JSON.stringify([
    { slug: "alpha-term", verdict: "yes", type: "plot", intent: "이 그림을 보면 꼬리 면적이 α임을 알 수 있다", confidence: "high", missing_fn: null },
    { slug: "beta-term", verdict: "yes", type: "matrix", intent: "이 그림을 보면 네 칸 판단 결과를 알 수 있다", confidence: "low", missing_fn: null },
    { slug: "gamma-term", verdict: "yes", type: "spiral", intent: "짧음", confidence: "high" },
  ]));
  const out = run("triage-apply", "1");
  assert.ok(out.includes("gamma-term"), "잘못된 판정을 알려야 함");
  assert.strictEqual(status().items["alpha-term"].state, "triaged");
  assert.strictEqual(status().items["gamma-term"].state, "pending");
  w("diagrams/batches/001/triage/out-02.json", JSON.stringify([{ slug: "gamma-term", verdict: "no", reason: "단일 개념" }]));
  run("triage-apply", "1");
  assert.strictEqual(status().items["gamma-term"].state, "dropped");

  // write-in: 페이지 본문·의도·예시·스타일 경로
  run("write-in", "1");
  const win = JSON.parse(fs.readFileSync(path.join(root, "diagrams/batches/001/write/in-01.json"), "utf8"));
  assert.strictEqual(win.items.length, 2);
  assert.strictEqual(win.items.find((i) => i.slug === "alpha-term").style, "diagrams/style/stats.md");
  assert.ok(Array.isArray(win.items[0].exemplars));

  // 작성 에이전트 흉내: 하나는 올바른 스펙, 하나는 깨진 스펙
  w("diagrams/specs/alpha-term.json", JSON.stringify({ slug: "alpha-term", type: "plot", plot: { series: [{ fn: "normal", params: { mu: 0, sigma: 1 } }], shade: [{ series: 0, from: 1.64, to: null, label: "α" }], x: { label: "통계량", range: [-4, 4] }, y: { label: "밀도" } }, source: "t", reviewed: false }));
  w("diagrams/specs/beta-term.json", JSON.stringify({ slug: "beta-term", type: "matrix", nodes: [], source: "t", reviewed: false }));
  run("check", "1");
  assert.strictEqual(status().items["alpha-term"].state, "checked");
  assert.strictEqual(status().items["beta-term"].state, "check_failed");
  assert.ok(status().items["beta-term"].errors.length > 0);

  // review-in --no-png: 검사 통과한 것만, 스펙 내용 포함
  run("review-in", "1", "--no-png");
  const rin = JSON.parse(fs.readFileSync(path.join(root, "diagrams/batches/001/review/in-01.json"), "utf8"));
  assert.deepStrictEqual(rin.items.map((i) => i.slug), ["alpha-term"]);
  assert.strictEqual(rin.items[0].spec.type, "plot");

  w("diagrams/batches/001/review/out-01.json", JSON.stringify([{ slug: "alpha-term", verdict: "fix", reason: "라벨 수정" }]));
  run("review-apply", "1");
  assert.strictEqual(status().items["alpha-term"].state, "reviewed");
  assert.strictEqual(status().items["alpha-term"].review, "fix");

  // preview: 승인용 폴더와 요약
  run("preview", "1", "--sample", "5", "--seed", "3");
  assert.ok(fs.existsSync(path.join(root, "diagrams/batches/001/approval/specs/alpha-term.json")));
  const summary = fs.readFileSync(path.join(root, "diagrams/batches/001/approval/summary.md"), "utf8");
  assert.ok(summary.includes("gamma-term") && summary.includes("단일 개념"), "탈락 사유 목록");
  assert.ok(summary.includes("beta-term"), "검사 실패 목록");

  // approve는 --yes 없이 거부, 있으면 reviewed:true
  assert.throws(() => run("approve", "1"), /--yes/);
  assert.throws(() => run("approve", "1", "--yes", "no"), /--yes/, "--yes는 값 없는 플래그여야 함");
  assert.strictEqual(status().items["alpha-term"].state, "reviewed");
  run("approve", "1", "--yes");
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, "diagrams/specs/alpha-term.json"), "utf8")).reviewed, true);
  assert.strictEqual(status().items["alpha-term"].state, "approved");

  // 입력 묶음을 다시 만들어도 에이전트 출력은 남는다
  w("diagrams/batches/001/triage/out-09.json", "[]");
  run("triage-in", "1");
  assert.ok(fs.existsSync(path.join(root, "diagrams/batches/001/triage/out-09.json")), "triage-in 재실행이 out-*.json을 지움");

  // ── 두 번째 배치: 출력 재적용 방지·부분 실패·누락 판정 ──────────
  const specOf = (slug) => JSON.stringify({ slug, type: "plot", plot: { series: [{ fn: "normal", params: { mu: 0, sigma: 1 } }], shade: [{ series: 0, from: 1.64, to: null, label: "α" }], x: { label: "통계량", range: [-4, 4] }, y: { label: "밀도" } }, source: "t", reviewed: false });
  const bad = (slug) => JSON.stringify({ slug, type: "matrix", nodes: [], source: "t", reviewed: false });
  const P = ["p1", "p2", "p3", "p4", "p5", "p6"].map((x) => `${x}-term`);
  for (const x of P) { terms.push({ slug: x, title_ko: x, title_en: x, categories: ["stat"], definition: "정의 " + x }); w(`terms/${x}.html`, page("정의 " + x)); }
  w("terms.json", JSON.stringify(terms));
  const b = "diagrams/batches/003";
  const st3 = () => JSON.parse(fs.readFileSync(path.join(root, b, "status.json"), "utf8"));
  const intent = "이 그림을 보면 꼬리 면적이 α임을 알 수 있다";
  const yes = (slug, extra = {}) => ({ slug, verdict: "yes", type: "plot", intent, confidence: "high", ...extra });
  run("new", "3", "--size", "6", "--order", "random", "--seed", "1");
  assert.strictEqual(Object.keys(st3().items).length, 6);
  run("triage-in", "3");
  w(`${b}/triage/out-01.json`, JSON.stringify([
    yes("p1-term"), yes("p2-term", { missing_fn: "poisson" }), { slug: "p3-term", verdict: "no", reason: "x", missing_fn: "poisson" },
    yes("p4-term", { missing_fn: 5 }), yes("p6-term"), null, { verdict: "no" },
  ]));
  w(`${b}/triage/out-02.json`, "{ 깨진 json");
  const tout = run("triage-apply", "3");
  assert.ok(tout.includes("out-02.json"), "깨진 파일 이름을 알려야 함");
  assert.ok(tout.includes("판정 없음 1개") && tout.includes("p5-term"), "판정 없는 항목 보고");
  assert.ok(tout.includes("항목 #6: slug 없음") && tout.includes("항목 #7: slug 없음"), "slug 없는 항목 보고");
  assert.ok(tout.includes("missing_fn"), "잘못된 missing_fn 보고");
  assert.strictEqual(st3().items["p4-term"].state, "triaged", "missing_fn이 틀려도 판정은 반영");
  assert.strictEqual(st3().items["p3-term"].state, "dropped");
  assert.strictEqual(st3().items["p5-term"].state, "pending");
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(root, b, "missing-fn.json"), "utf8")), { poisson: 2 });
  assert.ok(!fs.existsSync(path.join(root, b, "triage/out-01.json")), "처리한 출력은 applied/로 옮김");
  assert.ok(fs.readdirSync(path.join(root, b, "triage/applied")).some((f) => /^\d{4}-\d\d-\d\dT[\d-]+-out-01\.json$/.test(f)));
  assert.ok(fs.existsSync(path.join(root, b, "triage/out-02.json")), "깨진 파일은 그대로 둠");
  run("triage-in", "3"); // applied/는 입력 묶음 재작성에 영향 없음
  assert.ok(fs.existsSync(path.join(root, b, "triage/applied")));

  run("write-in", "3");
  const S3 = ["p1-term", "p2-term", "p4-term", "p6-term"];
  for (const x of S3) w(`diagrams/specs/${x}.json`, specOf(x));
  run("check", "3");
  assert.deepStrictEqual(Object.keys(st3().items).filter((k) => st3().items[k].state === "checked").sort(), S3);

  // 스펙 파일이 사라진 checked 항목: render는 건너뛰고 경고, check는 triaged로 되돌림
  for (const x of S3) fs.rmSync(path.join(root, "diagrams/specs", `${x}.json`));
  assert.ok(/스펙 없음/.test(run("render", "3")), "render는 스펙 없는 항목을 경고하고 건너뜀");
  run("check", "3");
  for (const x of S3) { assert.strictEqual(st3().items[x].state, "triaged"); assert.ok(st3().items[x].note); }
  for (const x of S3) w(`diagrams/specs/${x}.json`, specOf(x));
  run("check", "3");
  assert.strictEqual(st3().items["p1-term"].state, "checked");

  // review-in: png 경로는 저장소 루트 기준 상대(슬래시)
  for (const x of S3) for (const k of ["desktop", "mobile", "dark"]) w(`${b}/render/png/${x}.${k}.png`, "x");
  run("review-in", "3");
  const rin3 = JSON.parse(fs.readFileSync(path.join(root, b, "review/in-01.json"), "utf8"));
  assert.strictEqual(rin3.items[0].png.desktop, `${b}/render/png/${rin3.items[0].slug}.desktop.png`);

  // review-apply: fix인데 스펙이 깨짐 → check_failed, 고친 뒤 check → checked, 재실행해도 checked
  w(`${b}/review/out-01.json`, JSON.stringify([
    { slug: "p1-term", verdict: "fix", reason: "수정" }, { slug: "p2-term", verdict: "drop", reason: "오해" }, { slug: "p4-term", verdict: "drop", reason: "근거 부족" },
  ]));
  w("diagrams/specs/p1-term.json", bad("p1-term"));
  fs.rmSync(path.join(root, "diagrams/specs/p2-term.json")); // 이미 치워진 스펙
  const rout = run("review-apply", "3");
  assert.strictEqual(st3().items["p1-term"].state, "check_failed");
  assert.strictEqual(st3().items["p2-term"].state, "dropped");
  assert.ok(String(st3().items["p2-term"].note).includes("spec 없음"));
  assert.strictEqual(st3().items["p4-term"].state, "dropped");
  assert.ok(fs.existsSync(path.join(root, b, "dropped-specs/p4-term.json")));
  assert.ok(rout.includes("판정 없음 1개") && rout.includes("p6-term"), "검수 판정 없는 항목 보고");
  w("diagrams/specs/p1-term.json", specOf("p1-term"));
  run("check", "3");
  assert.strictEqual(st3().items["p1-term"].state, "checked");
  run("review-apply", "3");
  assert.strictEqual(st3().items["p1-term"].state, "checked", "이미 처리한 검수 출력이 다시 적용됨");

  // preview: reviewed가 0개면 preview.html 링크 없이 그렇게 말한다
  run("preview", "3");
  const sum3 = fs.readFileSync(path.join(root, b, "approval/summary.md"), "utf8");
  assert.ok(!sum3.includes("preview.html") && sum3.includes("표본 0개"));

  // new: 인기 목록 머리가 size를 채우면 옛 그림 스캔(.term-figure)을 하지 않는다
  terms.push({ slug: "head-term", title_ko: "머리", title_en: "Head", categories: ["stat"], definition: "머리" }, { slug: "dir-term", title_ko: "디렉터리", title_en: "Dir", categories: ["stat"], definition: "d" });
  w("terms.json", JSON.stringify(terms));
  w("terms/head-term.html", page("머리"));
  w("terms/dir-term.html/x", "읽으면 EISDIR로 터지는 함정");
  w("data/popular-terms.json", JSON.stringify({ _fields: ["stat"], stat: ["head-term"] }));
  w("prune/tiers.json", JSON.stringify({ "gamma-term": { tier: "prune" }, "alpha-term": { tier: "keep" } }));
  w("prune/merge-candidates.json", JSON.stringify({ groups: [{ absorb: ["zzz-term"] }] }));
  const nout = run("new", "4", "--size", "1", "--order", "popular", "--prune-dir", path.join(root, "prune"));
  assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, "diagrams/batches/004/status.json"), "utf8")).items), ["head-term"]);
  assert.ok(nout.includes("제외: prune 1, 병합 흡수 1"), nout);
  console.log("diagrams-pipeline-batch: all tests passed");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
