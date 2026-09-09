// scripts/build-compare-page.js
// 콘텐츠 JSON → compare/<pairSlug>.html. category 페이지와 같은 공용 크롬
// (templates/site-chrome.js)을 쓴다 — terms/*.html 전용 크롬 추출 방식
// (build-term-page.js)과는 별개다.
const fs = require("fs");
const path = require("path");
const { renderHeader, renderFooter, renderThemeInit, SITE_TITLE } = require("./templates/site-chrome");
const { BASE_URL } = require("./site-config.js");
const { pairSlug, renderComparisonTable } = require("./compare-page-core.js");
const { renderProse, buildContext } = require("./build-term-page.js");
const { escapeHtml } = require("../assets/escape.js");

const ROOT_DIR = path.join(__dirname, "..");

function renderComparePage(content, ctx) {
  const slug = pairSlug(content.slugA, content.slugB);
  const [firstSlug, firstTitle, secondSlug, secondTitle] =
    content.slugA < content.slugB
      ? [content.slugA, content.titleA, content.slugB, content.titleB]
      : [content.slugB, content.titleB, content.slugA, content.titleA];

  const heading = `${escapeHtml(content.titleA)} vs ${escapeHtml(content.titleB)}`;
  const title = `${content.titleA} vs ${content.titleB}: 무엇이 다른가 - ${SITE_TITLE}`;
  const canonical = `${BASE_URL}/compare/${slug}.html`;

  const rows = content.rows.map((r) => ({ label: r.label, a: r.a, b: r.b }));

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(content.headline)}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="canonical" href="${canonical}">
<link rel="stylesheet" href="../style.css">
${renderThemeInit()}
<!-- AdSense:start -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7710727724213886" crossorigin="anonymous"></script>
<!-- AdSense:end -->
</head>
<body data-base="../">
${renderHeader("../", { navCta: true, authNav: true })}
<main class="delay-1">
  <p class="breadcrumb"><a href="../index.html">용어 목록</a> &gt; <a href="../category.html">카테고리별 용어</a> &gt; <a href="../category/${content.category}.html">${escapeHtml(content.categoryLabel)}</a> &gt; ${heading}</p>
  <h1>${heading}</h1>
  <p class="subtitle">${escapeHtml(content.headline)}</p>

  <table class="compare-table">
    <thead><tr><th scope="col"></th><th scope="col">${escapeHtml(content.titleA)}</th><th scope="col">${escapeHtml(content.titleB)}</th></tr></thead>
    <tbody>
${renderComparisonTable(rows, escapeHtml)}
    </tbody>
  </table>

  <h2>${escapeHtml(content.titleA)}는 언제 쓰나</h2>
  <p>${renderProse(content.whenA, ctx.validSlugs)}</p>

  <h2>${escapeHtml(content.titleB)}는 언제 쓰나</h2>
  <p>${renderProse(content.whenB, ctx.validSlugs)}</p>

  <h2>흔한 혼동 지점</h2>
  <p>${renderProse(content.confusion, ctx.validSlugs)}</p>

  <h2>더 알아보기</h2>
  <ul class="related-terms">
    <li><a href="../terms/${firstSlug}.html">${escapeHtml(firstTitle)} 자세히 보기 →</a></li>
    <li><a href="../terms/${secondSlug}.html">${escapeHtml(secondTitle)} 자세히 보기 →</a></li>
  </ul>
</main>
${renderFooter("../")}
<script src="../assets/vendor/fuse.min.js"></script>
<script src="../assets/header-search.js"></script>
<script type="module" src="../assets/nav-auth.js"></script>
<script src="../assets/mobile-nav.js"></script>
</body>
</html>
`;
}

module.exports = { renderComparePage };

if (require.main === module) {
  const [contentPath] = process.argv.slice(2);
  if (!contentPath) {
    console.error("usage: node scripts/build-compare-page.js <content.json>");
    process.exit(1);
  }
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "terms.json"), "utf8"));
  const ctx = buildContext(terms, [content.slugA, content.slugB]);
  const html = renderComparePage(content, ctx);
  const outDir = path.join(ROOT_DIR, "compare");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${require("./compare-page-core.js").pairSlug(content.slugA, content.slugB)}.html`);
  fs.writeFileSync(outPath, html, "utf8");
  console.log("wrote", outPath);
}
