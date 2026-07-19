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

function extractRelatedSlugs(html) {
  const blockMatch = html.match(
    /<div\s+class=["']related-terms["'][^>]*>([\s\S]*?)<\/div>/
  );

  if (!blockMatch) {
    return [];
  }

  const related = [];
  const hrefPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/g;

  let match;

  while ((match = hrefPattern.exec(blockMatch[1])) !== null) {
    const href = match[1].trim();

    const slugMatch = href.match(/(?:^|\/)([^/]+)\.html(?:[?#].*)?$/);

    if (slugMatch) {
      related.push(slugMatch[1]);
    }
  }

  return [...new Set(related)];
}

function writeTerms(terms) {
  const lines = terms.map((term) => `  ${JSON.stringify(term)}`);
  const output = `[\n${lines.join(",\n")}\n]\n`;

  fs.writeFileSync(TERMS_PATH, output, "utf8");
}

function main() {
  const terms = readTerms();
  const validSlugs = new Set(terms.map((term) => term.slug));

  let importedCount = 0;
  let termsWithRelated = 0;

  const missingFiles = [];
  const invalidReferences = [];

  for (const term of terms) {
    const filePath = path.join(TERMS_DIR, `${term.slug}.html`);

    if (!fs.existsSync(filePath)) {
      missingFiles.push(term.slug);
      continue;
    }

    const html = fs.readFileSync(filePath, "utf8");
    const extracted = extractRelatedSlugs(html);

    const existing = Array.isArray(term.related)
      ? term.related.filter((slug) => typeof slug === "string")
      : [];

    const merged = [...new Set([...existing, ...extracted])]
      .filter((slug) => slug !== term.slug);

    for (const slug of merged) {
      if (!validSlugs.has(slug)) {
        invalidReferences.push(`${term.slug} -> ${slug}`);
      }
    }

    term.related = merged.filter((slug) => validSlugs.has(slug));

    if (term.related.length > 0) {
      termsWithRelated += 1;
    }

    importedCount += extracted.length;
  }

  if (missingFiles.length > 0) {
    throw new Error(
      `HTML 파일이 없는 용어가 있습니다:\n${missingFiles.join("\n")}`
    );
  }

  writeTerms(terms);

  console.log(`Imported HTML relationships: ${importedCount}`);
  console.log(`Terms with related values: ${termsWithRelated}/${terms.length}`);

  if (invalidReferences.length > 0) {
    console.warn("Ignored invalid related references:");
    console.warn(invalidReferences.join("\n"));
  }
}

try {
  main();
} catch (error) {
  console.error("Failed to import related terms.");
  console.error(error.message);
  process.exitCode = 1;
}
