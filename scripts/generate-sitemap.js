const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");
const SITEMAP_PATH = path.join(ROOT_DIR, "sitemap.xml");

// 정식 도메인은 site-config.js가 단일 출처다 (과거 이 파일에 남은 옛
// github.io 주소로 sitemap 37,000여 개 URL이 롤백된 사고의 재발 방지).
const { BASE_URL } = require("./site-config.js");

const TOP_LEVEL_PAGES = [
  {
    loc: `${BASE_URL}/`,
    filePath: "index.html"
  },
  {
    loc: `${BASE_URL}/viewer.html`,
    filePath: "viewer.html"
  },
  {
    loc: `${BASE_URL}/about.html`,
    filePath: "about.html"
  },
  {
    loc: `${BASE_URL}/privacy.html`,
    filePath: "privacy.html"
  },
  // 내비게이션에 노출되는 공개 페이지인데 sitemap에서 빠져 있었다.
  // (contact.html은 문의 기능과 함께 삭제되어 여기서도 제거)
  {
    loc: `${BASE_URL}/category.html`,
    filePath: "category.html"
  },
  {
    loc: `${BASE_URL}/quiz.html`,
    filePath: "quiz.html"
  },
  {
    loc: `${BASE_URL}/roadmap.html`,
    filePath: "roadmap.html"
  }
];

function readTerms() {
  const content = fs.readFileSync(TERMS_PATH, "utf8");
  const terms = JSON.parse(content);

  if (!Array.isArray(terms)) {
    throw new Error("terms.json의 최상위 값은 배열이어야 합니다.");
  }

  return terms;
}

function validateTerms(terms) {
  const slugs = new Set();
  const errors = [];

  for (const [index, term] of terms.entries()) {
    if (!term || typeof term !== "object") {
      errors.push(`terms.json의 ${index + 1}번째 항목이 객체가 아닙니다.`);
      continue;
    }

    if (typeof term.slug !== "string" || term.slug.trim() === "") {
      errors.push(`terms.json의 ${index + 1}번째 항목에 유효한 slug가 없습니다.`);
      continue;
    }

    const slug = term.slug.trim();

    if (slugs.has(slug)) {
      errors.push(`중복 slug가 있습니다: ${slug}`);
    }

    slugs.add(slug);

    const relativePath = path.join("terms", `${slug}.html`);
    const absolutePath = path.join(ROOT_DIR, relativePath);

    if (!fs.existsSync(absolutePath)) {
      errors.push(`용어 HTML 파일이 없습니다: ${relativePath}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

function getGitLastModified(relativePath) {
  try {
    const result = execFileSync(
      "git",
      ["log", "-1", "--format=%cs", "--", relativePath],
      {
        cwd: ROOT_DIR,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }
    ).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(result)) {
      return result;
    }
  } catch (error) {
    // Git 기록이 없는 신규 파일은 아래 fallback 사용
  }

  const absolutePath = path.join(ROOT_DIR, relativePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`lastmod를 계산할 파일이 없습니다: ${relativePath}`);
  }

  return fs.statSync(absolutePath).mtime.toISOString().slice(0, 10);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createUrlEntry(loc, lastmod) {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
    "  </url>"
  ].join("\n");
}

function generateSitemap() {
  const terms = readTerms();

  validateTerms(terms);

  const pages = [
    ...TOP_LEVEL_PAGES,
    ...terms.map((term) => ({
      loc: `${BASE_URL}/terms/${encodeURIComponent(term.slug)}.html`,
      filePath: path.posix.join("terms", `${term.slug}.html`)
    }))
  ];

  const entries = pages.map((page) =>
    createUrlEntry(page.loc, getGitLastModified(page.filePath))
  );

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    ""
  ].join("\n");

  fs.writeFileSync(SITEMAP_PATH, xml, "utf8");

  const generatedUrlCount = (xml.match(/<url>/g) || []).length;
  const expectedUrlCount = terms.length + TOP_LEVEL_PAGES.length;

  if (generatedUrlCount !== expectedUrlCount) {
    throw new Error(
      `URL 개수 불일치: 예상 ${expectedUrlCount}개, 생성 ${generatedUrlCount}개`
    );
  }

  console.log(`Sitemap generated: ${generatedUrlCount} URLs`);
  console.log(`Terms: ${terms.length}`);
  console.log(`Top-level pages: ${TOP_LEVEL_PAGES.length}`);
  console.log(`Output: ${path.relative(ROOT_DIR, SITEMAP_PATH)}`);
}

try {
  generateSitemap();
} catch (error) {
  console.error("Failed to generate sitemap.");
  console.error(error.message);
  process.exitCode = 1;
}
