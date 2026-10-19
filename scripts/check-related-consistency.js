const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");
const TERMS_DIR = path.join(ROOT_DIR, "terms");

const { isStub } = require("./lib/index-tier.js");

// 검사 기준
// - errors(빌드 중단): related가 배열 아님, 중복 slug, 자기 참조, 존재하지 않는 slug,
//   HTML 파일이 없거나 스텁(noindex+refresh)인 용어를 가리키는 related.
// - warnings: related가 비어 있음(generate-related-html은 같은 분야 용어로 채운다), 5개 초과.
// - info: 역방향(B→A) 없음. related는 "함께 볼 용어"라 단방향이 정상이다(용어 4만여 개 규모에서
//   간선 대부분이 단방향). 예전에는 error로 세어 수만 줄을 출력했지만 데이터 결함이 아니다.
// pageState(slug) → "ok" | "missing" | "stub" (테스트에서 주입 가능)
function checkRelated(terms, pageState = () => "ok") {
  const termBySlug = new Map(terms.map((term) => [term.slug, term]));
  const errors = [];
  const warnings = [];
  const oneWay = [];

  for (const term of terms) {
    if (!Array.isArray(term.related)) {
      errors.push(`${term.slug}: related가 배열이 아닙니다.`);
      continue;
    }

    if (term.related.length === 0) {
      warnings.push(`${term.slug}: related가 비어 있습니다.`);
    }

    if (term.related.length > 5) {
      warnings.push(`${term.slug}: related가 5개를 초과합니다 (${term.related.length}개).`);
    }

    if (new Set(term.related).size !== term.related.length) {
      errors.push(`${term.slug}: related에 중복 slug가 있습니다.`);
    }

    for (const relatedSlug of term.related) {
      if (relatedSlug === term.slug) {
        errors.push(`${term.slug}: 자기 자신을 related로 참조합니다.`);
        continue;
      }

      const relatedTerm = termBySlug.get(relatedSlug);
      if (!relatedTerm) {
        errors.push(`${term.slug}: 존재하지 않는 slug를 참조합니다: ${relatedSlug}`);
        continue;
      }

      const state = pageState(relatedSlug);
      if (state === "missing") errors.push(`${term.slug}: HTML 파일이 없는 용어를 참조합니다: ${relatedSlug}`);
      else if (state === "stub") errors.push(`${term.slug}: 스텁(리다이렉트) 페이지를 참조합니다: ${relatedSlug}`);

      if (!Array.isArray(relatedTerm.related) || !relatedTerm.related.includes(term.slug)) {
        oneWay.push(`${term.slug} -> ${relatedSlug}`);
      }
    }
  }

  return { errors, warnings, oneWay };
}

function sample(list, verbose, n = 10) {
  if (verbose || list.length <= n) return list.join("\n");
  return `${list.slice(0, n).join("\n")}\n… 외 ${list.length - n}건 (--verbose로 전체 출력)`;
}

function main(argv = process.argv.slice(2)) {
  const verbose = argv.includes("--verbose");
  const terms = JSON.parse(fs.readFileSync(TERMS_PATH, "utf8"));
  if (!Array.isArray(terms)) {
    throw new Error("terms.json의 최상위 값은 배열이어야 합니다.");
  }

  const cache = new Map();
  const pageState = (slug) => {
    if (!cache.has(slug)) {
      const filePath = path.join(TERMS_DIR, `${slug}.html`);
      cache.set(slug, !fs.existsSync(filePath) ? "missing" : isStub(fs.readFileSync(filePath, "utf8")) ? "stub" : "ok");
    }
    return cache.get(slug);
  };

  const { errors, warnings, oneWay } = checkRelated(terms, pageState);

  console.log(`Terms checked: ${terms.length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`One-way links (info): ${oneWay.length}`);

  if (warnings.length > 0) {
    console.warn("\nWarnings:");
    console.warn(sample(warnings, verbose));
  }

  if (verbose && oneWay.length > 0) {
    console.log("\nOne-way links:");
    console.log(oneWay.join("\n"));
  }

  if (errors.length > 0) {
    console.error("\nConsistency errors:");
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }

  console.log("Related-term consistency check passed.");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("Failed to check related-term consistency.");
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { checkRelated };
