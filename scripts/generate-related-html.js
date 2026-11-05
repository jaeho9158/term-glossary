const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");
const TERMS_DIR = path.join(ROOT_DIR, "terms");

const { filterRelatedLinks, isStub } = require("./lib/index-tier.js");
const { escapeHtml } = require("../assets/escape.js");
const { buildFieldIndex, fieldFillLines, RELATED_TARGET } = require("./lib/term-seo.js");
const { buildRelatedScorer } = require("./lib/related-score.js");

const RELATED_BLOCK_RE = /  <div\s+class=["']related-terms["'][^>]*>[\s\S]*?  <\/div>/;

function readTerms() {
  const terms = JSON.parse(fs.readFileSync(TERMS_PATH, "utf8"));
  if (!Array.isArray(terms)) {
    throw new Error("terms.json의 최상위 값은 배열이어야 합니다.");
  }
  return terms;
}

// related(terms.json) 링크 뒤에 같은 분야 용어(class="related-same-field")를 덧붙여
// 최대 RELATED_TARGET 개까지 채운다. terms.json 은 수정하지 않는다.
// 후보는 같은 subcategory 안에서 관련성 점수(related-score.js)가 FILL_MIN_SCORE 이상인 것만,
// 점수순. 하한을 넘는 후보가 모자라면 못 채운 채 둔다(분야 인기 용어 고정 부착 방지).
// 멱등성: 기존 채움 링크가 여전히 후보면 그 순서를 먼저 두고 모자란 만큼만 점수순으로 보충한다.
const FILL_MIN_SCORE = 4; // 표본(related-quality-sample.md)의 무관 칩은 대부분 0~3점
function pickFill(term, related, fieldIndex, previousFill = []) {
  if (term.relatedFill === false) return []; // 손으로 고른 related만 싣는 용어(채움 금지)
  const need = RELATED_TARGET - related.length;
  if (need <= 0 || !term.subcategory) return [];
  const cat = (term.categories || [])[0] || "";
  const skip = new Set([term.slug, ...related]);
  const pool = new Map();
  for (const t of fieldIndex.bySub.get(`${cat}|${term.subcategory}`) || []) {
    const s = fieldIndex.score(term.slug, t.slug);
    if (!skip.has(t.slug) && s >= FILL_MIN_SCORE) pool.set(t.slug, { t, s });
  }
  const kept = previousFill.filter((slug) => pool.has(slug)).slice(0, need);
  const rest = [...pool.keys()].filter((slug) => !kept.includes(slug))
    .sort((a, b) => pool.get(b).s - pool.get(a).s || (a < b ? -1 : 1));
  return [...kept, ...rest].slice(0, need).map((slug) => pool.get(slug).t);
}

function createRelatedBlock(term, termBySlug, fieldIndex, previousFill = [], eol = "\n") {
  const related = Array.isArray(term.related) ? term.related : [];
  const links = related.map((relatedSlug) => {
    const relatedTerm = termBySlug.get(relatedSlug);
    if (!relatedTerm) {
      throw new Error(`${term.slug}가 존재하지 않는 related slug를 참조합니다: ${relatedSlug}`);
    }
    return `    <a href="${escapeHtml(relatedSlug)}.html">${escapeHtml(relatedTerm.title_ko)}</a>`;
  });

  const fill = fieldIndex ? fieldFillLines(pickFill(term, related, fieldIndex, previousFill)) : [];

  return ['  <div class="related-terms">', ...links, ...fill, "  </div>"].join(eol);
}

function previousFillSlugs(block) {
  return [...block.matchAll(/<a href="([^"]+)\.html" class="related-same-field">/g)].map((m) => m[1]);
}

/**
 * 모든 페이지의 새 HTML을 메모리에서 계산한다. 파일은 쓰지 않는다.
 * readHtml(slug) → string | null(파일 없음).
 * 반환: { updates: [{slug, html}], unchanged, errors }
 */
function computeUpdates(terms, readHtml, archiveSet = null) {
  const termBySlug = new Map(terms.map((term) => [term.slug, term]));
  const fieldIndex = { ...buildFieldIndex(terms), score: buildRelatedScorer(terms) };
  const missingFiles = [];
  const missingBlocks = [];
  const failures = [];
  const unchanged = [];
  const updates = [];

  for (const term of terms) {
    const html = readHtml(term.slug);
    if (html == null) {
      missingFiles.push(term.slug);
      continue;
    }

    const match = html.match(RELATED_BLOCK_RE);
    if (!match) {
      // 숨김 처리로 "관련 용어" 섹션째 뺀 페이지는 건너뛴다(제목은 있는데 블록만 없을 때가 진짜 오류).
      if (!/<h2>관련 용어<\/h2>/.test(html)) { unchanged.push(term.slug); continue; }
      // core 페이지에서 링크가 모두 제거되어 블록 자체가 없는 경우는 정상
      if (archiveSet && !archiveSet.has(term.slug) && !isStub(html)) { unchanged.push(term.slug); continue; }
      missingBlocks.push(term.slug);
      continue;
    }

    let generatedBlock;
    try {
      // 기존 파일의 줄바꿈(CRLF/LF)을 따른다(core.autocrlf=true 작업 트리에서 전량 재작성 방지).
      const eol = /\r\n/.test(match[0]) ? "\r\n" : "\n";
      // core 페이지에서는 archive 링크가 어차피 필터로 빠지므로 '유지할 기존 채움'으로 세지 않는다
      // (세면 다음 실행 때 결과가 달라져 멱등성이 깨진다).
      let previousFill = previousFillSlugs(match[0]);
      if (archiveSet && !archiveSet.has(term.slug)) previousFill = previousFill.filter((s) => !archiveSet.has(s));
      generatedBlock = createRelatedBlock(term, termBySlug, fieldIndex, previousFill, eol);
    } catch (error) {
      failures.push(error.message);
      continue;
    }
    let nextHtml = html.replace(RELATED_BLOCK_RE, () => generatedBlock);
    if (archiveSet && !archiveSet.has(term.slug) && term.relatedFill !== false) nextHtml = filterRelatedLinks(nextHtml, archiveSet).html;

    if (nextHtml === html) unchanged.push(term.slug);
    else updates.push({ slug: term.slug, html: nextHtml });
  }

  const errors = [];
  if (failures.length > 0) errors.push(failures.join("\n"));
  if (missingFiles.length > 0) errors.push(`HTML 파일이 없는 용어가 있습니다:\n${missingFiles.join("\n")}`);
  if (missingBlocks.length > 0) errors.push(`관련 용어 블록이 없는 페이지가 있습니다:\n${missingBlocks.join("\n")}`);
  return { updates, unchanged, errors };
}

// 전부 계산한 뒤 오류가 없을 때만 한꺼번에 쓴다. 오류가 하나라도 있으면 아무 파일도 건드리지 않는다.
function run({ terms, termsDir, archiveSet = null, dryRun = false }) {
  const readHtml = (slug) => {
    const filePath = path.join(termsDir, `${slug}.html`);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  };
  const result = computeUpdates(terms, readHtml, archiveSet);
  if (result.errors.length > 0) throw new Error(result.errors.join("\n"));
  if (!dryRun) {
    for (const { slug, html } of result.updates) fs.writeFileSync(path.join(termsDir, `${slug}.html`), html, "utf8");
  }
  return result;
}

function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes("--dry-run");
  const terms = readTerms();

  // core 페이지는 archive 링크를 다시 넣지 않는다(data/index-tiers.json 기준; 파일이 없으면 필터 없음).
  const tiersPath = path.join(ROOT_DIR, "data", "index-tiers.json");
  const archiveSet = fs.existsSync(tiersPath) ? new Set(JSON.parse(fs.readFileSync(tiersPath, "utf8")).archive) : null;

  const { updates, unchanged } = run({ terms, termsDir: TERMS_DIR, archiveSet, dryRun });

  console.log(`Terms processed: ${terms.length}`);
  console.log(`HTML files ${dryRun ? "to update (dry run)" : "updated"}: ${updates.length}`);
  console.log(`HTML files unchanged: ${unchanged.length}`);
  return { updates, unchanged };
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("Failed to generate related-term HTML.");
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createRelatedBlock, computeUpdates, run, RELATED_BLOCK_RE };
