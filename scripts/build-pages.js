const fs = require("fs");
const path = require("path");
const { renderHeader, renderFooter } = require("./templates/site-chrome");

const ROOT_DIR = path.join(__dirname, "..");

// 파일럿 마이그레이션 대상 (작업지시서 A 4번): index / viewer / anova
const PAGE_MANIFEST = [
  { file: "index.html", basePath: "", navCta: true },
  { file: "viewer.html", basePath: "", navCta: true },
  { file: path.join("terms", "anova.html"), basePath: "../", navCta: false },
];

const HEADER_BLOCK = /<header class="site-header">[\s\S]*?<\/header>/;
const FOOTER_BLOCK = /<footer class="site-footer">[\s\S]*?<\/footer>/;

function buildPage({ file, basePath, navCta }) {
  const filePath = path.join(ROOT_DIR, file);
  const html = fs.readFileSync(filePath, "utf8");

  if (!HEADER_BLOCK.test(html) || !FOOTER_BLOCK.test(html)) {
    throw new Error(`${file}에서 header/footer 블록을 찾을 수 없습니다.`);
  }

  const nextHtml = html
    .replace(HEADER_BLOCK, renderHeader(basePath, { navCta }))
    .replace(FOOTER_BLOCK, renderFooter(basePath));

  fs.writeFileSync(filePath, nextHtml, "utf8");
  return nextHtml !== html;
}

function run() {
  let changed = 0;

  for (const page of PAGE_MANIFEST) {
    if (buildPage(page)) changed += 1;
  }

  console.log(`템플릿 빌드 완료: ${PAGE_MANIFEST.length}개 페이지 중 ${changed}개 갱신`);
}

run();
