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
w("data/popular-terms.json", JSON.stringify({ stat: ["beta-term", "alpha-term"] }));

const run = (...args) => execFileSync(process.execPath, [path.join(REPO, "scripts/diagrams/pipeline/batch.js"), ...args], { env: { ...process.env, DG_ROOT: root }, encoding: "utf8" });
const status = () => JSON.parse(fs.readFileSync(path.join(root, "diagrams/batches/001/status.json"), "utf8"));

try {
  // new: 기존 스펙 있는 done-term은 빠지고, popular 순서가 앞에 온다
  run("new", "1", "--size", "10", "--order", "popular", "--seed", "1");
  assert.deepStrictEqual(Object.keys(status().items), ["beta-term", "alpha-term", "gamma-term"]);
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
  run("approve", "1", "--yes");
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, "diagrams/specs/alpha-term.json"), "utf8")).reviewed, true);
  assert.strictEqual(status().items["alpha-term"].state, "approved");

  // 입력 묶음을 다시 만들어도 에이전트 출력은 남는다
  run("triage-in", "1");
  assert.ok(fs.existsSync(path.join(root, "diagrams/batches/001/triage/out-01.json")), "triage-in 재실행이 out-*.json을 지움");
  console.log("diagrams-pipeline-batch: all tests passed");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
