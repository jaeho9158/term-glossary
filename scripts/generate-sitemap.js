const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");
const SITEMAP_PATH = path.join(ROOT_DIR, "sitemap.xml");

const BASE_URL = "https://jaeho9158.github.io/term-glossary";

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
  {
    loc: `${BASE_URL}/contact.html`,
    filePath: "contact.html"
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
