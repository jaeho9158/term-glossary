const fs = require("fs");
const path = require("path");
const { renderHeader, renderFooter, renderThemeInit } = require("./templates/site-chrome");

const ROOT_DIR = path.join(__dirname, "..");

// admin.html은 로그인/회원가입/기록/로그아웃 링크를 노출하지 않음
const AUTH_NAV_EXCEPTIONS = {
  "admin.html": false,
};

const TOP_LEVEL_PAGES = [
  "index.html",
  "viewer.html",
  "category.html",
  "about.html",
  "contact.html",
  "privacy.html",
  "login.html",
  "signup.html",
  "history.html",
  "quiz.html",
  "admin.html",
];

function buildManifest() {
  const manifest = TOP_LEVEL_PAGES.map((file) => ({
    file,
    basePath: "",
    navCta: true,
    authNav: AUTH_NAV_EXCEPTIONS[file] ?? true,
  }));

  const termFiles = fs
    .readdirSync(path.join(ROOT_DIR, "terms"))
    .filter((f) => f.endsWith(".html"))
    .sort();

  for (const file of termFiles) {
    manifest.push({
      file: path.join("terms", file),
      basePath: "../",
      navCta: false,
      authNav: true,
    });
  }

  return manifest;
}

const HEADER_BLOCK = /<header class="site-header[^"]*">[\s\S]*?<\/header>/;
const FOOTER_BLOCK = /<footer class="site-footer[^"]*">[\s\S]*?<\/footer>/;
const THEME_INIT_BLOCK = /<!-- theme-init:start -->[\s\S]*?<!-- theme-init:end -->\n?/;

function buildPage({ file, basePath, navCta, authNav }) {
  const filePath = path.join(ROOT_DIR, file);
  const html = fs.readFileSync(filePath, "utf8");

  const headerMatch = HEADER_BLOCK.exec(html);
  const footerMatch = FOOTER_BLOCK.exec(html);
  if (!headerMatch || !footerMatch) {
    throw new Error(`${file}에서 header/footer 블록을 찾을 수 없습니다.`);
  }

  const footerClassMatch = /class="(site-footer[^"]*)"/.exec(footerMatch[0]);
  const footerClass = footerClassMatch[1];

  let nextHtml = html
    .replace(HEADER_BLOCK, renderHeader(basePath, { navCta, authNav }))
    .replace(FOOTER_BLOCK, renderFooter(basePath).replace("site-footer", footerClass));

  const themeInit = renderThemeInit() + "\n";
  if (THEME_INIT_BLOCK.test(nextHtml)) {
    nextHtml = nextHtml.replace(THEME_INIT_BLOCK, themeInit);
  } else {
    nextHtml = nextHtml.replace("</head>", themeInit + "</head>");
  }

  fs.writeFileSync(filePath, nextHtml, "utf8");
  return nextHtml !== html;
}

function run() {
  const manifest = buildManifest();
  let changed = 0;

  for (const page of manifest) {
    if (buildPage(page)) changed += 1;
  }

  console.log(`템플릿 빌드 완료: ${manifest.length}개 페이지 중 ${changed}개 갱신`);
}

run();
