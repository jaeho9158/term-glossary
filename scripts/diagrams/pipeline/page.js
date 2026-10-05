// 용어 페이지 HTML에서 에이전트에게 줄 본문만 뽑는다.
// 절 제목은 사이트 템플릿 고정값(쉽게 풀면·왜 중요한가·논문에서는 이렇게 쓰입니다·조금 더 깊게 보면·주의할 점).
"use strict";
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./common.js");

const SECTIONS = {
  "쉽게 풀면": "easy",
  "왜 중요한가": "why",
  "논문에서는 이렇게 쓰입니다": "usage",
  "조금 더 깊게 보면": "deep",
  "주의할 점": "caution",
};

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<figure[\s\S]*?<\/figure>/g, " ")
    .replace(/<\/?(?:a|strong|em|b|i|span|code|sup|sub|mark|abbr)(?:\s[^>]*)?>/gi, "") // 인라인 태그: 공백 없이(조사가 떨어지지 않게)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPage(html) {
  const out = { definition: "", easy: "", why: "", usage: "", deep: "", caution: "" };
  const def = /<div class="definition-box">([\s\S]*?)<\/div>/.exec(html);
  if (def) out.definition = strip(def[1]).replace(/^한 줄 정의:\s*/, "");
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|<\/article>|<\/main>|$)/g;
  let m;
  while ((m = re.exec(html))) {
    const key = SECTIONS[strip(m[1])];
    if (key) out[key] = strip(m[2]);
  }
  out.hasLegacyFigure = html.includes('<figure class="term-figure">');
  out.hasConceptDiagram = html.includes("<!-- concept-diagram:start -->");
  return out;
}

function readPage(slug) {
  const file = path.join(ROOT, "terms", `${slug}.html`);
  return fs.existsSync(file) ? extractPage(fs.readFileSync(file, "utf8")) : null;
}

module.exports = { extractPage, readPage };
