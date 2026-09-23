const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");
const SITEMAP_INDEX_PATH = path.join(ROOT_DIR, "sitemap.xml");
const SITEMAP_DIR = path.join(ROOT_DIR, "sitemaps");
const LASTMOD_STORE_PATH = path.join(ROOT_DIR, "data", "term-lastmod.json");

// 정식 도메인은 site-config.js가 단일 출처다 (과거 이 파일에 남은 옛
// github.io 주소로 sitemap 37,000여 개 URL이 롤백된 사고의 재발 방지).
const { BASE_URL } = require("./site-config.js");
const { CATEGORY_ORDER } = require("../assets/category-data.js");
const { resolveLastmod } = require("./lib/sitemap-lastmod.js");

// 우선 사이트맵에 넣을 용어 수. 다른 용어의 「관련 용어」에 많이 인용될수록
// 사이트 안에서 중심에 가까운 용어라고 보고, 인용 횟수 상위부터 담는다.
// 신생 도메인의 크롤 예산(하루 수백 페이지)으로 먼저 색인받고 싶은 페이지를
// 별도 파일로 제출하면 서치콘솔에서 이 파일만의 색인률을 따로 볼 수 있다.
const PRIORITY_TERM_COUNT = 2000;

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

// 용어가 아닌 페이지(홈·카테고리·비교)는 수십 개뿐이라 git 최종 커밋일로 충분하다.
// 파일 하나마다 `git log`를 새로 띄우면 프로세스 생성 비용으로 실행이 사실상
// 멈추므로(2026-09-09 실제 발생) 전체 히스토리를 한 번만 훑어 맵을 만든다.
// 용어 페이지는 이 맵을 쓰지 않는다 — 역링크 삽입 같은 일괄 작업으로 4만 개
// 파일의 커밋일이 같은 날로 찍히는 문제 때문에 본문 해시 기반(lib/sitemap-lastmod.js)으로 바꿨다.
let gitLastModifiedCache = null;

function buildGitLastModifiedMap() {
  if (gitLastModifiedCache) return gitLastModifiedCache;

  const map = new Map();
  try {
    const output = execFileSync(
      "git",
      ["log", "--name-only", "--format=%x00%cs", "--", ".", ":!terms"],
      {
        cwd: ROOT_DIR,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"]
      }
    );

    let currentDate = null;
    for (const line of output.split("\n")) {
      if (line.startsWith("\0")) {
        currentDate = line.slice(1).trim();
        continue;
      }
      const filePath = line.trim();
      if (!filePath || !currentDate) continue;
      // git log는 최신 커밋부터 순서대로 나오므로, 파일별로 처음 만나는
      // 날짜가 곧 최신 수정일이다 — 이미 있으면 덮어쓰지 않는다.
      if (!map.has(filePath)) {
        map.set(filePath, currentDate);
      }
    }
  } catch (error) {
    // git log 자체가 실패하면(예: git 없는 환경) 빈 맵으로 두고 전부 mtime fallback
  }

  gitLastModifiedCache = map;
  return map;
}

function getGitLastModified(relativePath) {
  const posixPath = relativePath.split(path.sep).join("/");
  const map = buildGitLastModifiedMap();
  const cached = map.get(posixPath);

  if (cached && /^\d{4}-\d{2}-\d{2}$/.test(cached)) {
    return cached;
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

function urlsetXml(entries) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    ""
  ].join("\n");
}

function sitemapIndexXml(files) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...files.map(({ name, lastmod }) =>
      [
        "  <sitemap>",
        `    <loc>${escapeXml(`${BASE_URL}/sitemaps/${name}`)}</loc>`,
        `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
        "  </sitemap>"
      ].join("\n")
    ),
    "</sitemapindex>",
    ""
  ].join("\n");
}

// 카테고리 정적 허브 페이지(scripts/generate-category-pages.js 생성물). 용어가
// 0개인 카테고리는 그 스크립트가 파일 자체를 만들지 않으므로, 폴더에 실제로
// 존재하는 파일만 사이트맵에 넣는다(CATEGORY_ORDER를 그대로 믿으면 존재하지
// 않는 URL이 sitemap에 섞여 GSC에 404로 잡힌다).
function readCategoryPages() {
  const categoryDir = path.join(ROOT_DIR, "category");
  if (!fs.existsSync(categoryDir)) return [];

  return CATEGORY_ORDER
    .filter((code) => fs.existsSync(path.join(categoryDir, `${code}.html`)))
    .map((code) => ({
      loc: `${BASE_URL}/category/${code}.html`,
      filePath: path.posix.join("category", `${code}.html`)
    }));
}

// 비교 페이지(scripts/apply-compare-pairs.js 생성물). 매니페스트에 있는데
// 실제 파일이 없으면 sitemap에 깨진 URL이 들어가므로 파일 존재를 다시 확인한다.
function readComparePairs() {
  const manifestPath = path.join(ROOT_DIR, "data", "compare-pairs.json");
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return manifest
    .filter((p) => fs.existsSync(path.join(ROOT_DIR, "compare", `${p.pairSlug}.html`)))
    .map((p) => ({
      loc: `${BASE_URL}/compare/${p.pairSlug}.html`,
      filePath: path.posix.join("compare", `${p.pairSlug}.html`)
    }));
}

function readLastmodStore() {
  if (!fs.existsSync(LASTMOD_STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(LASTMOD_STORE_PATH, "utf8"));
}

function writeLastmodStore(store, liveSlugs) {
  // 삭제·병합된 용어의 항목은 정리한다(스토어가 무한히 자라지 않게).
  const pruned = {};
  for (const slug of Object.keys(store).sort()) {
    if (liveSlugs.has(slug)) pruned[slug] = store[slug];
  }
  fs.writeFileSync(LASTMOD_STORE_PATH, JSON.stringify(pruned, null, 0) + "\n", "utf8");
}

// 「관련 용어」로 인용된 횟수 — 우선 사이트맵 선별 기준.
function countInboundRelated(terms) {
  const inbound = new Map();
  for (const term of terms) {
    for (const slug of term.related || []) {
      inbound.set(slug, (inbound.get(slug) || 0) + 1);
    }
  }
  return inbound;
}

function primaryCategory(term) {
  const cat = Array.isArray(term.categories) ? term.categories[0] : null;
  return cat && CATEGORY_ORDER.includes(cat) ? cat : "etc";
}

function termLoc(term) {
  return `${BASE_URL}/terms/${encodeURIComponent(term.slug)}.html`;
}

function generateSitemap() {
  const terms = readTerms();

  validateTerms(terms);

  const today = new Date().toISOString().slice(0, 10);
  const store = readLastmodStore();
  const liveSlugs = new Set(terms.map((t) => t.slug));

  // 용어별 lastmod: 본문 해시가 바뀐 경우에만 오늘로 갱신.
  const termLastmod = new Map();
  let changedCount = 0;
  for (const term of terms) {
    const html = fs.readFileSync(path.join(ROOT_DIR, "terms", `${term.slug}.html`), "utf8");
    const { date, changed } = resolveLastmod(store, term.slug, html, { today });
    if (changed) changedCount++;
    termLastmod.set(term.slug, date);
  }
  writeLastmodStore(store, liveSlugs);

  // 1) 용어 외 페이지
  const categoryPages = readCategoryPages();
  const comparePages = readComparePairs();
  const pageEntries = [...TOP_LEVEL_PAGES, ...categoryPages, ...comparePages].map((page) =>
    createUrlEntry(page.loc, getGitLastModified(page.filePath))
  );

  // 2) 우선 용어: 인용 횟수 상위 N개
  const inbound = countInboundRelated(terms);
  const bySlug = new Map(terms.map((t) => [t.slug, t]));
  const prioritySlugs = [...terms]
    .sort((a, b) => (inbound.get(b.slug) || 0) - (inbound.get(a.slug) || 0) || a.slug.localeCompare(b.slug))
    .slice(0, PRIORITY_TERM_COUNT)
    .map((t) => t.slug);
  const prioritySet = new Set(prioritySlugs);
  const priorityEntries = prioritySlugs.map((slug) =>
    createUrlEntry(termLoc(bySlug.get(slug)), termLastmod.get(slug))
  );

  // 3) 나머지 용어를 1차 카테고리별 파일로
  const byCategory = new Map();
  for (const term of terms) {
    if (prioritySet.has(term.slug)) continue;
    const cat = primaryCategory(term);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(term);
  }

  fs.rmSync(SITEMAP_DIR, { recursive: true, force: true });
  fs.mkdirSync(SITEMAP_DIR);

  const files = [];
  const writeFile = (name, entries, lastmods) => {
    fs.writeFileSync(path.join(SITEMAP_DIR, name), urlsetXml(entries), "utf8");
    const lastmod = lastmods.length > 0 ? lastmods.reduce((a, b) => (a > b ? a : b)) : today;
    files.push({ name, lastmod, count: entries.length });
  };

  writeFile(
    "pages.xml",
    pageEntries,
    [...TOP_LEVEL_PAGES, ...categoryPages, ...comparePages].map((p) => getGitLastModified(p.filePath))
  );
  writeFile("priority.xml", priorityEntries, prioritySlugs.map((s) => termLastmod.get(s)));

  const categoryOrder = [...CATEGORY_ORDER, "etc"].filter((c) => byCategory.has(c));
  for (const cat of categoryOrder) {
    const list = byCategory.get(cat).sort((a, b) => a.slug.localeCompare(b.slug));
    writeFile(
      `terms-${cat}.xml`,
      list.map((t) => createUrlEntry(termLoc(t), termLastmod.get(t.slug))),
      list.map((t) => termLastmod.get(t.slug))
    );
  }

  fs.writeFileSync(SITEMAP_INDEX_PATH, sitemapIndexXml(files), "utf8");

  const generatedUrlCount = files.reduce((n, f) => n + f.count, 0);
  const expectedUrlCount = terms.length + TOP_LEVEL_PAGES.length + categoryPages.length + comparePages.length;

  if (generatedUrlCount !== expectedUrlCount) {
    throw new Error(
      `URL 개수 불일치: 예상 ${expectedUrlCount}개, 생성 ${generatedUrlCount}개`
    );
  }

  console.log(`Sitemap index generated: ${files.length} files, ${generatedUrlCount} URLs`);
  console.log(`Terms: ${terms.length} (priority ${prioritySlugs.length}, lastmod changed ${changedCount})`);
  console.log(`Category pages: ${categoryPages.length}`);
  console.log(`Compare pages: ${comparePages.length}`);
  console.log(`Top-level pages: ${TOP_LEVEL_PAGES.length}`);
  console.log(`Output: ${path.relative(ROOT_DIR, SITEMAP_INDEX_PATH)} + ${path.relative(ROOT_DIR, SITEMAP_DIR)}/`);
}

try {
  generateSitemap();
} catch (error) {
  console.error("Failed to generate sitemap.");
  console.error(error.message);
  process.exitCode = 1;
}
