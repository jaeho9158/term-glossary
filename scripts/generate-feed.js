const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");
const FEED_PATH = path.join(ROOT_DIR, "feed.xml");

const BASE_URL = "https://jaeho9158.github.io/term-glossary";
const FEED_TITLE = "논문용어사전";
const FEED_DESCRIPTION = "논문에 자주 나오는 통계·연구방법론 학술용어를 비전공자도 이해하기 쉽게 풀어 설명합니다.";
const MAX_ITEMS = 30;

function readTerms() {
  const content = fs.readFileSync(TERMS_PATH, "utf8");
  const terms = JSON.parse(content);

  if (!Array.isArray(terms)) {
    throw new Error("terms.json의 최상위 값은 배열이어야 합니다.");
  }

  return terms;
}

function getGitFirstAdded(relativePath) {
  try {
    const result = execFileSync(
      "git",
      ["log", "--follow", "--diff-filter=A", "--format=%cI", "--", relativePath],
      {
        cwd: ROOT_DIR,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    if (result.length > 0) {
      return result[result.length - 1];
    }
  } catch (error) {
    // Git 기록이 없으면 아래 fallback 사용
  }

  const absolutePath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`발행일을 계산할 파일이 없습니다: ${relativePath}`);
  }

  return fs.statSync(absolutePath).mtime.toISOString();
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createItemEntry(term, pubDate) {
  const loc = `${BASE_URL}/terms/${encodeURIComponent(term.slug)}.html`;
  const title = term.title_en ? `${term.title_ko} (${term.title_en})` : term.title_ko;

  return [
    "  <item>",
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(loc)}</link>`,
    `    <guid>${escapeXml(loc)}</guid>`,
    `    <pubDate>${new Date(pubDate).toUTCString()}</pubDate>`,
    `    <description>${escapeXml(term.definition || "")}</description>`,
    "  </item>",
  ].join("\n");
}

function generateFeed() {
  const terms = readTerms();

  const withDates = terms.map((term) => ({
    term,
    pubDate: getGitFirstAdded(path.posix.join("terms", `${term.slug}.html`)),
  }));

  withDates.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const recent = withDates.slice(0, MAX_ITEMS);
  const lastBuildDate = recent.length > 0 ? recent[0].pubDate : new Date(0).toISOString();

  const items = recent.map(({ term, pubDate }) => createItemEntry(term, pubDate));

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "<channel>",
    `  <title>${escapeXml(FEED_TITLE)}</title>`,
    `  <link>${escapeXml(BASE_URL)}/</link>`,
    `  <description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    "  <language>ko</language>",
    `  <lastBuildDate>${new Date(lastBuildDate).toUTCString()}</lastBuildDate>`,
    ...items,
    "</channel>",
    "</rss>",
    "",
  ].join("\n");

  fs.writeFileSync(FEED_PATH, xml, "utf8");

  console.log(`RSS feed generated: ${recent.length}/${terms.length} items`);
  console.log(`Output: ${path.relative(ROOT_DIR, FEED_PATH)}`);
}

try {
  generateFeed();
} catch (error) {
  console.error("Failed to generate feed.");
  console.error(error.message);
  process.exitCode = 1;
}
