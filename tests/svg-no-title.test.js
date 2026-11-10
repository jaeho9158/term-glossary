// 인라인 SVG의 <title>은 페이지 <title>과 함께 세어져 검색엔진(네이버)이 title 중복으로 본다.
// 그림 제목은 <svg aria-label>로 두고, 페이지마다 <title>은 <head>의 하나뿐이어야 한다.
const test = require("node:test");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { keep } = require("./helpers/test-slugs.js");

const DIR = path.join(__dirname, "..", "terms");

test("terms/*.html: <svg> 안에 <title>이 없고 <title>은 하나뿐", () => {
  const bad = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".html") || !keep(f.slice(0, -5))) continue;
    const h = fs.readFileSync(path.join(DIR, f), "utf8");
    const n = (h.match(/<title[\s>]/g) || []).length;
    if (n > 1 || /<svg\b(?:(?!<\/svg>)[\s\S])*?<title[\s>]/.test(h)) bad.push(`${f}(${n})`);
  }
  assert.deepStrictEqual(bad.slice(0, 20), [], `title 중복 ${bad.length}쪽`);
});
