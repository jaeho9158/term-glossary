const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");

function main() {
  const terms = JSON.parse(fs.readFileSync(TERMS_PATH, "utf8"));

  if (!Array.isArray(terms)) {
    throw new Error("terms.json의 최상위 값은 배열이어야 합니다.");
  }

  const termBySlug = new Map(terms.map((term) => [term.slug, term]));

  const errors = [];
  const warnings = [];

  for (const term of terms) {
    if (!Array.isArray(term.related)) {
      errors.push(`${term.slug}: related가 배열이 아닙니다.`);
      continue;
    }

    if (term.related.length === 0) {
      errors.push(`${term.slug}: related가 비어 있습니다.`);
    }

    if (term.related.length > 5) {
      warnings.push(
        `${term.slug}: related가 5개를 초과합니다 (${term.related.length}개).`
      );
    }

    const unique = new Set(term.related);

    if (unique.size !== term.related.length) {
      errors.push(`${term.slug}: related에 중복 slug가 있습니다.`);
    }

    for (const relatedSlug of term.related) {
      if (relatedSlug === term.slug) {
        errors.push(`${term.slug}: 자기 자신을 related로 참조합니다.`);
        continue;
      }

      const relatedTerm = termBySlug.get(relatedSlug);

      if (!relatedTerm) {
        errors.push(
          `${term.slug}: 존재하지 않는 slug를 참조합니다: ${relatedSlug}`
        );
        continue;
      }

      if (
        !Array.isArray(relatedTerm.related) ||
        !relatedTerm.related.includes(term.slug)
      ) {
        errors.push(
          `${term.slug} -> ${relatedSlug}: 역방향 관계가 없습니다.`
        );
      }
    }
  }

  console.log(`Terms checked: ${terms.length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Errors: ${errors.length}`);

  if (warnings.length > 0) {
    console.warn("\nWarnings:");
    console.warn(warnings.join("\n"));
  }

  if (errors.length > 0) {
    console.error("\nConsistency errors:");
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }

  console.log("Related-term consistency check passed.");
}

try {
  main();
} catch (error) {
  console.error("Failed to check related-term consistency.");
  console.error(error.message);
  process.exitCode = 1;
}
