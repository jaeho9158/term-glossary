// 카테고리별 "전체 용어 목록"을 완전한 정적 HTML로 생성한다.
//
// 배경: category.html은 카테고리-용어 매핑을 전부 JS(assets/site.js)가 클라이언트에서
// 렌더링한다. 그 결과 사이트 전체 37,000여 개 용어 페이지로 가는 정적 <a href> 링크가
// 사실상 존재하지 않아, Googlebot이 sitemap.xml 외에 내부 링크로 그 존재를 확인할
// 방법이 없었다(GSC "발견됨 - 크롤링되지 않음" 대량 발생의 핵심 원인).
// 이 스크립트는 카테고리마다 category/{code}.html을 만들어 그 안에 속한 용어를
// 전부 정적 <a href>로 나열한다. category.html에서 이 페이지들로 가는 정적 링크와
// 합치면, 홈 → category.html → category/{code}.html → terms/{slug}.html로
// JS 없이도 3클릭 안에 모든 용어에 도달할 수 있다.
const fs = require("fs");
const path = require("path");
const { renderHeader, renderFooter, renderThemeInit, SITE_TITLE } = require("./templates/site-chrome");
const { BASE_URL } = require("./site-config.js");
const {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CATEGORY_DESCRIPTIONS,
  CATEGORY_INTRO,
  SUB_CATEGORY_ORDER,
} = require("../assets/category-data.js");
const { buildSubcategorySections } = require("./category-subgroups.js");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "category");

const COMPARE_PAIRS_PATH = path.join(ROOT_DIR, "data", "compare-pairs.json");
function readComparePairs() {
  if (!fs.existsSync(COMPARE_PAIRS_PATH)) return [];
  return JSON.parse(fs.readFileSync(COMPARE_PAIRS_PATH, "utf8"));
}

function readTerms() {
  const terms = JSON.parse(fs.readFileSync(TERMS_PATH, "utf8"));
  if (!Array.isArray(terms)) {
    throw new Error("terms.json의 최상위 값은 배열이어야 합니다.");
  }
  return terms;
}

function groupByCategory(terms) {
  const groups = new Map();
  for (const code of CATEGORY_ORDER) groups.set(code, []);

  for (const term of terms) {
    if (!Array.isArray(term.categories)) continue;
    for (const code of term.categories) {
      if (!groups.has(code)) groups.set(code, []);
      groups.get(code).push(term);
    }
  }

  for (const list of groups.values()) {
    list.sort((a, b) => a.title_ko.localeCompare(b.title_ko, "ko"));
  }

  return groups;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function termLinkHTML(term) {
  const label = term.title_en && term.title_en !== term.title_ko
    ? `${escapeHtml(term.title_ko)} (${escapeHtml(term.title_en)})`
    : escapeHtml(term.title_ko);
  return `      <li><a href="../terms/${encodeURIComponent(term.slug)}.html">${label}</a></li>`;
}

function renderCategoryPage(code, label, terms, comparePairs) {
  const description = CATEGORY_DESCRIPTIONS[code] || `${label} 분야의 논문 학술용어를 모아봅니다.`;
  const intro = CATEGORY_INTRO[code];
  if (!intro) {
    throw new Error(`CATEGORY_INTRO에 "${code}"의 소개 문단이 없습니다. scripts/apply-category-intro.js를 먼저 실행하세요.`);
  }
  const title = `${label} 용어 전체 목록 (${terms.length}개) - ${SITE_TITLE}`;
  const canonical = `${BASE_URL}/category/${code}.html`;

  const sections = buildSubcategorySections(terms, SUB_CATEGORY_ORDER[code] || []);
  const pairsInCategory = comparePairs.filter((p) => p.category === code);

  const sectionsHtml = sections.map((section) => {
    const items = section.terms.map(termLinkHTML).join("\n");
    const related = pairsInCategory.filter((p) => p.subcategory === section.name);
    const compareLinksHtml = related.length
      ? `\n      <p class="compare-links">🔍 비교해서 보기: ${related
          .map((p) => `<a href="../compare/${p.pairSlug}.html">${escapeHtml(p.titleA)} vs ${escapeHtml(p.titleB)}</a>`)
          .join(" · ")}</p>`
      : "";
    return `    <h2>${escapeHtml(section.name)} <span class="section-count">(${section.terms.length}개)</span></h2>${compareLinksHtml}
    <ul class="term-list">
${items}
    </ul>`;
  }).join("\n\n");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
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
  <p class="breadcrumb"><a href="../index.html">용어 목록</a> &gt; <a href="../category.html">카테고리별 용어</a> &gt; ${escapeHtml(label)}</p>
  <h1>${escapeHtml(label)} 용어 전체 목록</h1>
  <p class="subtitle">${escapeHtml(intro)}</p>
  <p>총 ${terms.length}개 용어 · <a href="../category.html">다른 분야 보기</a></p>

${sectionsHtml}
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

function run() {
  const terms = readTerms();
  const groups = groupByCategory(terms);
  const comparePairs = readComparePairs();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let written = 0;
  let skippedEmpty = 0;

  for (const code of CATEGORY_ORDER) {
    const label = CATEGORY_LABELS[code];
    const list = groups.get(code) || [];

    if (!label) {
      throw new Error(`CATEGORY_ORDER에 있는 코드 "${code}"의 라벨이 CATEGORY_LABELS에 없습니다.`);
    }

    if (list.length === 0) {
      skippedEmpty += 1;
      continue;
    }

    const html = renderCategoryPage(code, label, list, comparePairs);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${code}.html`), html, "utf8");
    written += 1;
  }

  console.log(`카테고리 정적 페이지 생성 완료: ${written}개 (용어 0개라 건너뜀 ${skippedEmpty}개)`);
}

run();
