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

const { filterRelatedLinks, isStub } = require("./lib/index-tier.js");
const { escapeHtml } = require("../assets/escape.js");
const { buildFieldIndex, fieldFill, fieldFillLines } = require("./lib/term-seo.js");

// related(terms.json) 링크 뒤에 같은 분야 용어(class="related-same-field")를 덧붙여
// 목표 개수(term-seo.js RELATED_TARGET)까지 채운다. terms.json 은 수정하지 않는다.
function createRelatedBlock(term, termBySlug, fieldIndex) {
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

  const fill = fieldIndex ? fieldFillLines(fieldFill(term, term.related, fieldIndex)) : [];

  return [
    '  <div class="related-terms">',
    ...links,
    ...fill,
    "  </div>"
  ].join("\n");
}

function main() {
  const terms = readTerms();
  const termBySlug = new Map(terms.map((term) => [term.slug, term]));
  const fieldIndex = buildFieldIndex(terms);

  // core 페이지는 archive 링크를 다시 넣지 않는다(data/index-tiers.json 기준; 파일이 없으면 필터 없음).
  const tiersPath = path.join(ROOT_DIR, "data", "index-tiers.json");
  const archiveSet = fs.existsSync(tiersPath) ? new Set(JSON.parse(fs.readFileSync(tiersPath, "utf8")).archive) : null;

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
      // core 페이지에서 링크가 모두 제거되어 블록 자체가 없는 경우는 정상
      if (archiveSet && !archiveSet.has(term.slug) && !isStub(html)) { unchanged.push(term.slug); continue; }
      missingBlocks.push(term.slug);
      continue;
    }

    const generatedBlock = createRelatedBlock(term, termBySlug, fieldIndex);
    let nextHtml = html.replace(relatedBlockPattern, generatedBlock);
    if (archiveSet && !archiveSet.has(term.slug)) nextHtml = filterRelatedLinks(nextHtml, archiveSet).html;

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
