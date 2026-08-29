const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");
const FEED_PATH = path.join(ROOT_DIR, "feed.xml");

const BASE_URL = "https://termglossary.kr";
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

// 파일별 최초 추가 시각을 git 기록에서 얻는다.
//
// 원래는 용어마다 `git log --follow`를 한 번씩 실행했는데, 용어가
// 37,000개를 넘으면서 피드 생성 한 번에 git 프로세스를 3만 번 이상
// 띄우게 되어 수십 분씩 걸렸다(사실상 실행 불가). 저장소 전체를
// 한 번만 훑어 terms/ 아래 모든 파일의 추가 시각 맵을 만들면 수 초로
// 끝난다. --follow(개명 추적)는 포기하지만, 피드는 "최근 추가 30개"만
// 쓰므로 개명 이력까지 따라갈 이유가 없다.
let gitAddedDates = null;

function buildGitAddedDates() {
  const out = execFileSync(
    "git",
    ["log", "--diff-filter=A", "--name-only", "--format=%cI", "--", "terms"],
    { cwd: ROOT_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1024 * 1024 * 256 }
  );
  const map = new Map();
  let currentDate = null;
  for (const line of out.split("\n")) {
    if (!line) continue;
    if (/^\d{4}-\d{2}-\d{2}T/.test(line)) { currentDate = line.trim(); continue; }
    // 로그는 최신 커밋부터 나오므로, 같은 파일이 여러 번 나오면 마지막
    // (가장 오래된) 기록이 최초 추가 시각이다 — 덮어써서 그 값을 남긴다.
    if (currentDate) map.set(line.trim(), currentDate);
  }
  return map;
}

function getGitFirstAdded(relativePath) {
  if (gitAddedDates === null) {
    try { gitAddedDates = buildGitAddedDates(); }
    catch (error) { gitAddedDates = new Map(); }
  }
  const fromGit = gitAddedDates.get(relativePath);
  if (fromGit) return fromGit;

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
