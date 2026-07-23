const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");
const TERMS_DIR = path.join(ROOT_DIR, "terms");

function readTerms() {
  const terms = JSON.parse(fs.readFileSync(TERMS_PATH, "utf8"));

  if (!Array.isArray(terms)) {
    throw new Error("terms.json의 최상위 값은 배열이어야 합니다.");
  }

  return terms;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createRelatedBlock(term, termBySlug) {
  const links = term.related.map((relatedSlug) => {
    const relatedTerm = termBySlug.get(relatedSlug);

    if (!relatedTerm) {
      throw new Error(
        `${term.slug}가 존재하지 않는 related slug를 참조합니다: ${relatedSlug}`
      );
    }

    return `    <a href="${escapeHtml(relatedSlug)}.html">${escapeHtml(
      relatedTerm.title_ko
    )}</a>`;
  });

  return [
    '  <div class="related-terms">',
    ...links,
    "  </div>"
  ].join("\n");
}

function main() {
  const terms = readTerms();
  const termBySlug = new Map(terms.map((term) => [term.slug, term]));

  const missingFiles = [];
  const missingBlocks = [];
  const unchanged = [];
  const updated = [];

  for (const term of terms) {
    if (!Array.isArray(term.related) || term.related.length === 0) {
      throw new Error(`${term.slug}의 related가 비어 있습니다.`);
    }

    const filePath = path.join(TERMS_DIR, `${term.slug}.html`);

    if (!fs.existsSync(filePath)) {
      missingFiles.push(term.slug);
      continue;
    }

    const html = fs.readFileSync(filePath, "utf8");

    const relatedBlockPattern =
      /  <div\s+class=["']related-terms["'][^>]*>[\s\S]*?  <\/div>/;

    if (!relatedBlockPattern.test(html)) {
      missingBlocks.push(term.slug);
      continue;
    }

    const generatedBlock = createRelatedBlock(term, termBySlug);
    const nextHtml = html.replace(relatedBlockPattern, generatedBlock);

    if (nextHtml === html) {
      unchanged.push(term.slug);
      continue;
    }

    fs.writeFileSync(filePath, nextHtml, "utf8");
    updated.push(term.slug);
  }

  if (missingFiles.length > 0) {
    throw new Error(
      `HTML 파일이 없는 용어가 있습니다:\n${missingFiles.join("\n")}`
    );
  }

  if (missingBlocks.length > 0) {
    throw new Error(
      `관련 용어 블록이 없는 페이지가 있습니다:\n${missingBlocks.join("\n")}`
    );
  }

  console.log(`Terms processed: ${terms.length}`);
  console.log(`HTML files updated: ${updated.length}`);
  console.log(`HTML files unchanged: ${unchanged.length}`);
}

try {
  main();
} catch (error) {
  console.error("Failed to generate related-term HTML.");
  console.error(error.message);
  process.exitCode = 1;
}
