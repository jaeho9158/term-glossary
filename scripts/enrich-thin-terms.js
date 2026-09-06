// 얇은 용어 페이지(3섹션)에 "왜 중요한가"·"조금 더 깊게 보면" 두 섹션을 외과적으로 삽입한다.
//
// 전면 재렌더(build-term-page.js)는 term-pager·figure·SVG defs 등 후속 삽입물이 소실되므로 금지.
// insert-*.js 규약대로 기존 HTML을 파싱하지 않고 앵커 문자열 앞에 블록만 끼워넣는다.
//
// 사용법:
//   node scripts/enrich-thin-terms.js --input=<json> --category=<code>        # dry-run
//   node scripts/enrich-thin-terms.js --input=<json> --slugs=a,b,c --write    # 실제 반영
//
// 입력 JSON: { "<slug>": { "why": "...", "deeper": "..." }, ... }
//   본문에는 build-term-page.js와 같은 [[slug|라벨]] 링크 문법을 쓸 수 있다.
//
// 동작:
//   - --category 또는 --slugs로 대상을 고르고, 입력 JSON에 본문이 있는 slug만 처리한다.
//   - 이미 해당 h2가 있는 페이지는 스킵(멱등). 두 섹션 중 빠진 것만 채운다.
//   - terms.json의 해당 항목에 why/deeper 필드를 함께 기록해 파생 산출물과 정합을 유지한다.

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_DIR = path.join(ROOT_DIR, "terms");
const TERMS_JSON = path.join(ROOT_DIR, "terms.json");
// insert-*.js와 동일한 제외 규약. 대상은 terms/ 한 곳이지만 규약 문서화를 위해 유지한다.
const EXCLUDE_DIRS = new Set(["node_modules", ".git", ".claude", "docs", "supabase", "tests", "en"]);

const WHY_H2 = "<h2>왜 중요한가</h2>";
const DEEPER_H2 = "<h2>조금 더 깊게 보면</h2>";
// 삽입 앵커: 완전판에서 각 섹션 바로 다음에 오는 h2.
const WHY_ANCHOR = "  <h2>논문에서는 이렇게 쓰입니다</h2>";
const DEEPER_ANCHOR = "  <h2>주의할 점</h2>";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// build-term-page.js의 renderProse와 동일한 [[slug|label]] 처리.
function renderProse(text, validSlugs) {
  const raw = String(text || "");
  let out = "";
  let last = 0;
  const re = /\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    out += escapeHtml(raw.slice(last, m.index));
    const [, slug, label] = m;
    out += validSlugs.has(slug) ? `<a href="${slug}.html">${escapeHtml(label)}</a>` : escapeHtml(label);
    last = m.index + m[0].length;
  }
  return out + escapeHtml(raw.slice(last));
}

function parseArgs(argv) {
  const opts = { write: false, category: null, slugs: null, input: null };
  for (const a of argv) {
    if (a === "--write") opts.write = true;
    else if (a.startsWith("--category=")) opts.category = a.slice("--category=".length);
    else if (a.startsWith("--slugs=")) opts.slugs = a.slice("--slugs=".length).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--input=")) opts.input = a.slice("--input=".length);
  }
  return opts;
}

function insertBefore(html, anchor, block) {
  const idx = html.indexOf(anchor);
  if (idx === -1) return null;
  return html.slice(0, idx) + block + html.slice(idx);
}

function enrichHtml(html, body, validSlugs) {
  let next = html;
  const done = [];
  if (body.why && !next.includes(WHY_H2)) {
    const block = `  ${WHY_H2}\n  <p>${renderProse(body.why, validSlugs)}</p>\n\n`;
    const r = insertBefore(next, WHY_ANCHOR, block);
    if (!r) return { html: next, done, error: "앵커 없음: 논문에서는 이렇게 쓰입니다" };
    next = r;
    done.push("why");
  }
  if (body.deeper && !next.includes(DEEPER_H2)) {
    const block = `  ${DEEPER_H2}\n  <p>${renderProse(body.deeper, validSlugs)}</p>\n\n`;
    const r = insertBefore(next, DEEPER_ANCHOR, block);
    if (!r) return { html: next, done, error: "앵커 없음: 주의할 점" };
    next = r;
    done.push("deeper");
  }
  return { html: next, done, error: null };
}

function run() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.input) {
    console.error("사용법: node scripts/enrich-thin-terms.js --input=<json> (--category=<code> | --slugs=a,b,c) [--write]");
    process.exit(1);
  }
  if (!opts.category && !opts.slugs) {
    console.error("--category 또는 --slugs 중 하나는 필요합니다.");
    process.exit(1);
  }

  const bodies = JSON.parse(fs.readFileSync(path.resolve(ROOT_DIR, opts.input), "utf8"));
  const terms = JSON.parse(fs.readFileSync(TERMS_JSON, "utf8"));
  const validSlugs = new Set(terms.map((t) => t.slug));
  const bySlug = new Map(terms.map((t) => [t.slug, t]));

  let targets;
  if (opts.slugs) targets = opts.slugs;
  else targets = terms.filter((t) => (t.categories || []).includes(opts.category)).map((t) => t.slug);

  const dry = !opts.write;
  let updated = 0, skipped = 0, noBody = 0, missing = 0, failed = 0;
  let termsChanged = false;

  for (const slug of targets) {
    const body = bodies[slug];
    if (!body || (!body.why && !body.deeper)) { noBody += 1; continue; }
    const filePath = path.join(TERMS_DIR, `${slug}.html`);
    if (!bySlug.has(slug) || !fs.existsSync(filePath)) {
      console.warn(`건너뜀 (terms.json 또는 파일 없음): ${slug}`);
      missing += 1;
      continue;
    }
    const html = fs.readFileSync(filePath, "utf8");
    const { html: nextHtml, done, error } = enrichHtml(html, body, validSlugs);
    if (error) { console.warn(`실패 (${error}): ${slug}`); failed += 1; continue; }
    if (done.length === 0) { skipped += 1; continue; }

    console.log(`${dry ? "[dry-run] " : ""}${slug}: ${done.join("+")} 삽입`);
    if (!dry) {
      fs.writeFileSync(filePath, nextHtml, "utf8");
      const term = bySlug.get(slug);
      if (body.why && term.why !== body.why) { term.why = body.why; termsChanged = true; }
      if (body.deeper && term.deeper !== body.deeper) { term.deeper = body.deeper; termsChanged = true; }
    }
    updated += 1;
  }

  if (!dry && termsChanged) fs.writeFileSync(TERMS_JSON, JSON.stringify(terms, null, 2) + "\n", "utf8");

  console.log(
    `얇은 페이지 보강 ${dry ? "[dry-run] 갱신 예정" : "완료"}: 대상 ${targets.length} · 갱신 ${updated} · 스킵(이미 완전판) ${skipped} · 본문 없음 ${noBody} · 파일 없음 ${missing} · 실패 ${failed}` +
      (dry ? " — 실제 반영은 --write" : termsChanged ? " · terms.json 갱신" : "")
  );
}

if (require.main === module) run();
module.exports = { enrichHtml, EXCLUDE_DIRS };
