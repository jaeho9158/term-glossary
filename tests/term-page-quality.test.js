// 새 용어 페이지는 분량 기준(scripts/lib/page-quality.js)을 통과해야 한다.
// 기준 도입 전부터 얇았던 페이지는 tests/fixtures/thin-pages-baseline.json 에 묶어 두고
// 점진적으로 보강한다. 목록은 줄어들기만 해야 한다(새로 얇은 페이지를 넣지 말 것).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { checkPage } = require("../scripts/lib/page-quality.js");

const ROOT = path.join(__dirname, "..");
const baseline = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "thin-pages-baseline.json"), "utf8")));

test("checkPage: 짧은 페이지를 잡는다", () => {
  const thin = `<main><h1>x</h1><h2>쉽게 풀면</h2><p>짧다</p><div class="example">"a"</div><h2>관련 용어</h2></main>`;
  const problems = checkPage(thin);
  assert.ok(problems.some((p) => p.includes("본문")));
  assert.ok(problems.some((p) => p.includes("예문")));
  assert.ok(problems.some((p) => p.includes("왜 중요한가")));
});

test("기준선 밖의 모든 용어 페이지가 분량 기준을 통과한다", () => {
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const failures = [];
  for (const t of terms) {
    if (baseline.has(t.slug)) continue;
    const file = path.join(ROOT, "terms", `${t.slug}.html`);
    if (!fs.existsSync(file)) continue;
    const problems = checkPage(fs.readFileSync(file, "utf8"));
    if (problems.length) failures.push(`${t.slug}: ${problems.join(", ")}`);
  }
  assert.deepStrictEqual(failures.slice(0, 20), [], `얇은 새 페이지 ${failures.length}개`);
});
