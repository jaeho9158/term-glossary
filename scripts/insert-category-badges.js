const fs = require("fs");
const path = require("path");
const { CATEGORY_LABELS } = require("../assets/category-data.js");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");
const TERMS_DIR = path.join(ROOT_DIR, "terms");

const H1_BLOCK = /<h1>[\s\S]*?<\/h1>/;
const EXISTING_BADGES_BLOCK = /\n?  <div class="category-badges">[\s\S]*?<\/div>/;

function createBadgesBlock(categories) {
  const links = categories
    .filter((code) => CATEGORY_LABELS[code])
    .map(
      (code) =>
        `<a class="category-badge" href="../category.html?cat=${code}">${CATEGORY_LABELS[code]}</a>`
    )
    .join("\n    ");

  return `\n  <div class="category-badges">\n    ${links}\n  </div>`;
}

function main() {
  const terms = JSON.parse(fs.readFileSync(TERMS_PATH, "utf8"));

  let updated = 0;
  let unchanged = 0;
  const skipped = [];

  for (const term of terms) {
    const filePath = path.join(TERMS_DIR, `${term.slug}.html`);
    if (!fs.existsSync(filePath)) {
      skipped.push(term.slug);
      continue;
    }

    const html = fs.readFileSync(filePath, "utf8");
    if (!H1_BLOCK.test(html)) {
      skipped.push(term.slug);
      continue;
    }

    const categories = Array.isArray(term.categories) ? term.categories : [];
    const badgesBlock = createBadgesBlock(categories);

    let nextHtml;
    if (EXISTING_BADGES_BLOCK.test(html)) {
      nextHtml = html.replace(EXISTING_BADGES_BLOCK, badgesBlock);
    } else {
      nextHtml = html.replace(H1_BLOCK, (match) => match + badgesBlock);
    }

    if (nextHtml === html) {
      unchanged += 1;
      continue;
    }

    fs.writeFileSync(filePath, nextHtml, "utf8");
    updated += 1;
  }

  if (skipped.length > 0) {
    console.warn(`건너뜀 (파일 없음 또는 h1 없음): ${skipped.join(", ")}`);
  }

  console.log(`카테고리 배지 삽입 완료: ${updated}개 갱신, ${unchanged}개 변화 없음`);
}

main();
