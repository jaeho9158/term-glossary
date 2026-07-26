const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_DIR = path.join(ROOT_DIR, "terms");

const BADGES_BLOCK = /(\r?\n  <div class="category-badges">[\s\S]*?<\/div>\r?\n)/;
const EXISTING_BTN_BLOCK = /\r?\n  <button id="bookmark-btn"[\s\S]*?<\/button>\r?\n/;
const BOOKMARK_BTN_HTML = `
  <button id="bookmark-btn" class="bookmark-btn" type="button" hidden>
    <span class="bookmark-icon" aria-hidden="true">☆</span>
    <span class="bookmark-label">즐겨찾기</span>
  </button>
`;
const SCRIPT_TAG = '<script type="module" src="../assets/term-bookmark.js"></script>';

function insertBookmarkButton(html) {
  if (EXISTING_BTN_BLOCK.test(html)) {
    return html.replace(EXISTING_BTN_BLOCK, BOOKMARK_BTN_HTML);
  }
  if (!BADGES_BLOCK.test(html)) return null;
  return html.replace(BADGES_BLOCK, `$1${BOOKMARK_BTN_HTML}`);
}

function insertScriptTag(html) {
  if (html.includes("term-bookmark.js")) return html;
  return html.replace("</body>", `${SCRIPT_TAG}\n</body>`);
}

function main() {
  const files = fs.readdirSync(TERMS_DIR).filter((f) => f.endsWith(".html"));

  let updated = 0;
  const skipped = [];

  for (const file of files) {
    const filePath = path.join(TERMS_DIR, file);
    const html = fs.readFileSync(filePath, "utf8");

    const withButton = insertBookmarkButton(html);
    if (withButton === null) {
      skipped.push(file);
      continue;
    }

    const nextHtml = insertScriptTag(withButton);

    if (nextHtml === html) continue;

    fs.writeFileSync(filePath, nextHtml, "utf8");
    updated += 1;
  }

  if (skipped.length > 0) {
    console.warn(`건너뜀 (category-badges 블록 없음): ${skipped.join(", ")}`);
  }

  console.log(`즐겨찾기 버튼 삽입 완료: ${updated}개 갱신`);
}

main();
