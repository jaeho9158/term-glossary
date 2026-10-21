// 사이트에 복사해 둔 통합 엔진(scripts/svg-illus)의 자체 테스트를 사이트 테스트에서 함께 돌린다.
const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");
const dir = path.join(__dirname, "..", "scripts", "svg-illus");
const r = spawnSync(process.execPath, ["--test", "test/core.test.js", "test/frac.test.js"], { cwd: dir, encoding: "utf8" });
assert.strictEqual(r.status, 0, r.stdout + r.stderr);
console.log("svg-illus: 엔진 자체 테스트 통과");
