const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

// 코드 그림이 있는 용어 페이지는 내려받기 버튼 스크립트를 싣는다(새 그림을 넣으면 태그도 함께 넣을 것).
test("si-figure 가 있는 용어 페이지마다 figure-download.js 가 한 번 실린다", () => {
  const dir = path.join(__dirname, "..", "terms");
  const miss = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".html"))) {
    const h = fs.readFileSync(path.join(dir, f), "utf8");
    const n = (h.match(/assets\/figure-download\.js/g) || []).length;
    if (h.includes('class="si-figure') ? n !== 1 : n > 1) miss.push(f);
  }
  assert.deepStrictEqual(miss, []);
});

test("syncFigureDownloadTag: 그림이 있으면 넣고, 없으면 빼고, 멱등", () => {
  const { syncFigureDownloadTag: s } = require("../scripts/lib/figure-download-tag.js");
  const back = '<script src="../assets/term-back-nav.js"></script>\n</body>';
  const withFig = '<figure class="si-figure"></figure>\n' + back;
  const once = s(withFig);
  assert.ok(once.includes("figure-download.js"));
  assert.strictEqual(s(once), once);
  assert.strictEqual(s(once.replace('<figure class="si-figure"></figure>\n', "")), back);
  assert.strictEqual(s(null), null);
});
