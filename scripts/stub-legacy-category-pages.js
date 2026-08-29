// 옛 카테고리 디렉터리(stat/, eng/ ...)의 페이지를 terms/<slug>.html 로의
// 리다이렉트 스텁으로 교체하는 일회성 스크립트 (2026-08-29 유지보수).
// 기존 병합 스텁과 동일 형식: canonical + noindex + meta refresh.
// terms/에 대응 파일이 없는 페이지는 건드리지 않고 목록만 출력한다.
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const { BASE_URL } = require("./site-config.js");

const DIRS = ["bioearth", "cs", "eng", "ethics", "medhealth", "method",
  "neuro", "physchem", "psych", "socialecon", "stat", "tool"];

function stub(title, slug) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${title} - 논문용어사전</title>
<link rel="canonical" href="${BASE_URL}/terms/${slug}.html">
<meta name="robots" content="noindex, follow">
<meta http-equiv="refresh" content="0; url=../terms/${slug}.html">
</head>
<body>
<p>이 페이지는 <a href="../terms/${slug}.html">${title}</a> 페이지로 이동했습니다.</p>
</body>
</html>
`;
}

let done = 0;
const missing = [];
for (const dir of DIRS) {
  const abs = path.join(ROOT_DIR, dir);
  if (!fs.existsSync(abs)) continue;
  for (const name of fs.readdirSync(abs).sort()) {
    if (!name.endsWith(".html")) continue;
    const slug = name.slice(0, -5);
    const target = path.join(ROOT_DIR, "terms", name);
    if (!fs.existsSync(target)) {
      missing.push(`${dir}/${name}`);
      continue;
    }
    const head = fs.readFileSync(target, "utf8").slice(0, 4000);
    // 사이트명 꼬리(" - 논문용어사전")만 떼야 한다 — 하이픈이 공백 없이 붙은
    // 용어명("p-value" 등) 중간에서 자르면 제목이 "p"처럼 뭉개진다.
    const m = head.match(/<title>([^<]+?)(?:\s[-|][^<]*)?<\/title>/);
    const title = m ? m[1].trim() : slug;
    fs.writeFileSync(path.join(abs, name), stub(title, slug), "utf8");
    done++;
  }
}

console.log("stubbed:", done);
console.log("missing target:", missing.length);
for (const x of missing) console.log("  ", x);
