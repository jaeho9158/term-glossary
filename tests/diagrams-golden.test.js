// 렌더러 리팩터링·확장 후에도 기존 스펙의 렌더 결과가 바이트 단위로 같아야 한다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { snapshot, OUT } = require("../scripts/diagrams/golden.js");

const golden = JSON.parse(fs.readFileSync(OUT, "utf8"));
const now = snapshot();
let compared = 0;
const changed = [];
for (const [slug, [specHash, htmlHash]] of Object.entries(golden)) {
  if (!now[slug] || now[slug][0] !== specHash) continue; // 스펙이 바뀌었거나 지워짐
  compared++;
  if (now[slug][1] !== htmlHash) changed.push(slug);
}
assert.ok(compared > 1000, `비교 대상이 너무 적음: ${compared}`);
assert.deepStrictEqual(changed, [], `렌더 결과가 바뀐 스펙 ${changed.length}개: ${changed.slice(0, 10).join(", ")}`);
console.log(`diagrams-golden: ${compared}개 동일`);
