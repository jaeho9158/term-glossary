const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");

const MIN_RELATED = 3;
const MAX_RELATED = 5;

function readTerms() {
  const terms = JSON.parse(fs.readFileSync(TERMS_PATH, "utf8"));

  if (!Array.isArray(terms)) {
    throw new Error("terms.json의 최상위 값은 배열이어야 합니다.");
  }

  return terms;
}

function writeTerms(terms) {
  const lines = terms.map((term) => `  ${JSON.stringify(term)}`);
  fs.writeFileSync(
    TERMS_PATH,
    `[\n${lines.join(",\n")}\n]\n`,
    "utf8"
  );
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function intersectionSize(first, second) {
  const secondSet = new Set(second);
  return new Set(first.filter((value) => secondSet.has(value))).size;
}

function scoreCandidate(source, candidate) {
  const sourceCategories = Array.isArray(source.categories)
    ? source.categories
    : [];

  const candidateCategories = Array.isArray(candidate.categories)
    ? candidate.categories
    : [];

  const sharedCategories = intersectionSize(
    sourceCategories,
    candidateCategories
  );

  if (sharedCategories === 0) {
    return -1;
  }

  const sourceTitleTokens = tokenize(
    `${source.slug} ${source.title_ko} ${source.title_en}`
  );

  const candidateTitleTokens = tokenize(
    `${candidate.slug} ${candidate.title_ko} ${candidate.title_en}`
  );

  const sourceDefinitionTokens = tokenize(source.definition);
  const candidateDefinitionTokens = tokenize(candidate.definition);

  const sharedTitleTokens = intersectionSize(
    sourceTitleTokens,
    candidateTitleTokens
  );

  const sharedDefinitionTokens = intersectionSize(
    sourceDefinitionTokens,
    candidateDefinitionTokens
  );

  let score = 0;

  score += sharedCategories * 100;
  score += sharedTitleTokens * 20;
  score += sharedDefinitionTokens * 2;

  if (
    sourceCategories.length === candidateCategories.length &&
    sharedCategories === sourceCategories.length
  ) {
    score += 15;
  }

  return score;
}

function normalizeExistingRelated(term, validSlugs) {
  if (!Array.isArray(term.related)) {
    return [];
  }

  return [...new Set(term.related)]
    .filter((slug) => typeof slug === "string")
    .filter((slug) => slug !== term.slug)
    .filter((slug) => validSlugs.has(slug));
}

function addRelated(term, slug) {
  if (term.slug === slug) {
    return false;
  }

  if (!Array.isArray(term.related)) {
    term.related = [];
  }

  if (term.related.includes(slug)) {
    return false;
  }

  if (term.related.length >= MAX_RELATED) {
    return false;
  }

  term.related.push(slug);
  return true;
}

function main() {
  const terms = readTerms();
  const termBySlug = new Map(terms.map((term) => [term.slug, term]));
  const validSlugs = new Set(termBySlug.keys());

  let suggestedCount = 0;
  let reciprocalCount = 0;

  for (const term of terms) {
    term.related = normalizeExistingRelated(term, validSlugs);
  }

  for (const term of terms) {
    if (term.related.length >= MIN_RELATED) {
      continue;
    }

    const candidates = terms
      .filter((candidate) => candidate.slug !== term.slug)
      .filter((candidate) => !term.related.includes(candidate.slug))
      .map((candidate) => ({
        slug: candidate.slug,
        score: scoreCandidate(term, candidate)
      }))
      .filter((candidate) => candidate.score >= 0)
      .sort((first, second) => {
        if (second.score !== first.score) {
          return second.score - first.score;
        }

        return first.slug.localeCompare(second.slug);
      });

    for (const candidate of candidates) {
      if (term.related.length >= MAX_RELATED) {
        break;
      }

      if (addRelated(term, candidate.slug)) {
        suggestedCount += 1;
      }
    }
  }

  /*
   * 기존 관계와 추천 관계를 양방향으로 맞춘다.
   *
   * 반대쪽 related가 이미 5개라면 가장 낮은 점수 관계를 교체하지 않고,
   * consistency 오류를 피하기 위해 원래 방향의 관계를 제거한다.
   */
  for (const term of terms) {
    for (const relatedSlug of [...term.related]) {
      const relatedTerm = termBySlug.get(relatedSlug);

      if (!relatedTerm) {
        continue;
      }

      if (relatedTerm.related.includes(term.slug)) {
        continue;
      }

      if (relatedTerm.related.length < MAX_RELATED) {
        relatedTerm.related.push(term.slug);
        reciprocalCount += 1;
        continue;
      }

      term.related = term.related.filter(
        (slug) => slug !== relatedSlug
      );
    }
  }

  /*
   * 양방향 처리 과정에서 3개 미만이 된 용어를 다시 채운다.
   */
  for (const term of terms) {
    if (term.related.length >= MIN_RELATED) {
      continue;
    }

    const candidates = terms
      .filter((candidate) => candidate.slug !== term.slug)
      .filter((candidate) => !term.related.includes(candidate.slug))
      .filter((candidate) => candidate.related.length < MAX_RELATED)
      .map((candidate) => ({
        term: candidate,
        score: scoreCandidate(term, candidate)
      }))
      .filter((candidate) => candidate.score >= 0)
      .sort((first, second) => {
        if (second.score !== first.score) {
          return second.score - first.score;
        }

        return first.term.slug.localeCompare(second.term.slug);
      });

    for (const candidate of candidates) {
      if (term.related.length >= MIN_RELATED) {
        break;
      }

      const addedForward = addRelated(term, candidate.term.slug);
      const addedReverse = addRelated(candidate.term, term.slug);

      if (addedForward && addedReverse) {
        suggestedCount += 1;
        reciprocalCount += 1;
      } else if (addedForward && !addedReverse) {
        term.related = term.related.filter(
          (slug) => slug !== candidate.term.slug
        );
      }
    }
  }

  for (const term of terms) {
    term.related = [...new Set(term.related)].slice(0, MAX_RELATED);
  }

  const emptyTerms = terms.filter(
    (term) => !Array.isArray(term.related) || term.related.length === 0
  );

  if (emptyTerms.length > 0) {
    throw new Error(
      `related가 비어 있는 용어가 있습니다:\n${emptyTerms
        .map((term) => term.slug)
        .join("\n")}`
    );
  }

  writeTerms(terms);

  console.log(`Suggested relationships: ${suggestedCount}`);
  console.log(`Added reciprocal relationships: ${reciprocalCount}`);
  console.log(`Terms processed: ${terms.length}`);
  console.log(`Minimum related target: ${MIN_RELATED}`);
  console.log(`Maximum related target: ${MAX_RELATED}`);
}

try {
  main();
} catch (error) {
  console.error("Failed to suggest related terms.");
  console.error(error.message);
  process.exitCode = 1;
}
