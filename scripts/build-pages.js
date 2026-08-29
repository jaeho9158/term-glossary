const fs = require("fs");
const path = require("path");
const { renderHeader, renderFooter, renderThemeInit } = require("./templates/site-chrome");

const ROOT_DIR = path.join(__dirname, "..");

// admin.html은 로그인/회원가입/기록/로그아웃 링크를 노출하지 않음
const AUTH_NAV_EXCEPTIONS = {
  "admin.html": false,
};

// 최상위 페이지 목록은 실제 파일에서 찾는다. 예전엔 하드코딩이라 이미 삭제된
// contact.html·admin.html이 남아 스크립트가 죽었고, 나중에 추가된 roadmap.html·
// changelog.html은 갱신 대상에서 빠져 헤더가 페이지마다 어긋났다.
function findTopLevelPages() {
  return fs
    .readdirSync(ROOT_DIR)
    .filter((f) => f.endsWith(".html"))
    .filter((f) =>
      /<header class="site-header/.test(fs.readFileSync(path.join(ROOT_DIR, f), "utf8"))
    )
    .sort();
}

let skippedStubs = 0;

function buildManifest() {
  const manifest = findTopLevelPages().map((file) => ({
    file,
    basePath: "",
    navCta: true,
    authNav: AUTH_NAV_EXCEPTIONS[file] ?? true,
  }));

  const termFiles = fs
    .readdirSync(path.join(ROOT_DIR, "terms"))
    .filter((f) => f.endsWith(".html"))
    .sort();

  // 중복 병합으로 생긴 리다이렉트 스텁은 header/footer가 없는 최소 페이지다.
  // 예전엔 이걸 만나면 예외를 던지고 죽어서, 알파벳 순으로 첫 스텁 이후의
  // 3만여 페이지가 통째로 갱신되지 않았다.
  for (const file of termFiles) {
    const html = fs.readFileSync(path.join(ROOT_DIR, "terms", file), "utf8");
    if (!/<header class="site-header/.test(html)) {
      skippedStubs++;
      continue;
    }
    manifest.push({
      file: path.join("terms", file),
      basePath: "../",
      // 용어 페이지에도 '논문 뷰어' CTA가 실제로 들어가 있다. 예전 false 설정은
      // 낡은 가정이라, 그대로 두면 빌드가 37,438개 페이지에서 CTA를 지워버린다.
      navCta: true,
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

  console.log(`템플릿 빌드 완료: ${manifest.length}개 페이지 중 ${changed}개 갱신 (리다이렉트 스텁 ${skippedStubs}개 건너뜀)`);
}

run();
