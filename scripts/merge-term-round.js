// 심화 라운드 병합기 — 서브에이전트가 쓴 콘텐츠 JSON들을 검증·중복제거 후
// terms/<slug>.html 생성 + terms.json/sitemap.xml 반영.
//
// usage: node scripts/merge-term-round.js <dir-with-round-json> [--dry]
//
// 안전 규칙 (과거 동시 실행 사고 기록에서 나온 것들):
//  - terms.json은 쓰기 직전에 항상 디스크에서 새로 읽는다(캐시 사용 금지).
//  - 슬러그 정확 일치뿐 아니라 제목 정규화 일치로 유사 중복도 걸러낸다.
//  - related는 실제 존재하는 슬러그만 남긴다(죽은 링크 0 유지).
const fs = require("fs");
const path = require("path");
const { renderTermPage, buildContext } = require("./build-term-page.js");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_JSON = path.join(ROOT_DIR, "terms.json");
const SITEMAP = path.join(ROOT_DIR, "sitemap.xml");
const { SUB_CATEGORY_ORDER, CATEGORY_LABELS } = require("../assets/category-data.js");

const REQUIRED = ["slug", "title_ko", "title_en", "categories", "subcategory",
  "definition", "easy", "why", "deeper", "caution", "examples", "related"];

const normTitle = (s) =>
  String(s || "").toLowerCase().replace(/[\s\-–—_·.()（）,'"]/g, "");

// 검수 에이전트가 남긴 verdict-*.json ({drop:[{slug,reason}]}) 을 모아 제외 목록을 만든다.
function loadDrops(dir) {
  const drops = new Map();
  for (const f of fs.readdirSync(dir).filter((f) => /^verdict-.*\.json$/i.test(f))) {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const d of v.drop || []) {
        if (typeof d === "string") drops.set(d, "검수 반려");
        else if (d && d.slug) drops.set(d.slug, d.reason || "검수 반려");
      }
    } catch (err) {
      console.error(`[verdict 파싱 실패] ${f}: ${err.message}`);
    }
  }
  return drops;
}

function loadRound(dir) {
  const files = fs.readdirSync(dir)
    .filter((f) => /\.json$/i.test(f) && !/^verdict-/i.test(f))
    .sort();
  const out = [];
  for (const f of files) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch (err) {
      console.error(`[skip-file] ${f}: JSON 파싱 실패 — ${err.message}`);
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : parsed.terms || [];
    for (const t of list) out.push({ ...t, __src: f });
  }
  return out;
}

function main() {
  const dir = process.argv[2];
  const dry = process.argv.includes("--dry");
  if (!dir) {
    console.error("usage: node scripts/merge-term-round.js <dir> [--dry]");
    process.exit(1);
  }

  // 쓰기 직전 최신 상태 (동시 실행 대비)
  const terms = JSON.parse(fs.readFileSync(TERMS_JSON, "utf8"));
  const bySlug = new Set(terms.map((t) => t.slug));
  const byTitleKo = new Set(terms.map((t) => normTitle(t.title_ko)));
  const byTitleEn = new Set(terms.map((t) => normTitle(t.title_en)));

  const incoming = loadRound(dir);
  const drops = loadDrops(dir);
  const accepted = [];
  const rejected = [];
  const seen = new Set();

  for (const t of incoming) {
    if (drops.has(t.slug)) { rejected.push([t.slug, drops.get(t.slug)]); continue; }
    const miss = REQUIRED.filter((k) => t[k] === undefined || t[k] === null || t[k] === "");
    if (miss.length) { rejected.push([t.slug || "(no slug)", `필드 누락: ${miss.join(",")}`]); continue; }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(t.slug)) { rejected.push([t.slug, "슬러그 형식 위반"]); continue; }
    if (bySlug.has(t.slug)) { rejected.push([t.slug, "기존 슬러그 중복"]); continue; }
    if (seen.has(t.slug)) { rejected.push([t.slug, "라운드 내 슬러그 중복"]); continue; }
    if (byTitleKo.has(normTitle(t.title_ko))) { rejected.push([t.slug, `한글 제목 중복(${t.title_ko})`]); continue; }
    if (byTitleEn.has(normTitle(t.title_en))) { rejected.push([t.slug, `영문 제목 중복(${t.title_en})`]); continue; }
    if (!Array.isArray(t.categories) || !t.categories.length) { rejected.push([t.slug, "categories 비어있음"]); continue; }
    const unknownCat = t.categories.find((c) => !CATEGORY_LABELS[c]);
    if (unknownCat) { rejected.push([t.slug, `미등록 카테고리 ${unknownCat}`]); continue; }
    const subs = SUB_CATEGORY_ORDER[t.categories[0]] || [];
    if (subs.length && !subs.includes(t.subcategory)) {
      rejected.push([t.slug, `subcategory 불일치: ${t.subcategory}`]); continue;
    }
    if (!Array.isArray(t.examples) || t.examples.length < 1) { rejected.push([t.slug, "예문 없음"]); continue; }
    if (t.examples.some((e) => !e || !e.sentence || !e.explanation)) { rejected.push([t.slug, "예문 형식 오류"]); continue; }

    seen.add(t.slug);
    byTitleKo.add(normTitle(t.title_ko));
    byTitleEn.add(normTitle(t.title_en));
    accepted.push(t);
  }

  console.log(`수집 ${incoming.length}건 → 승인 ${accepted.length} / 반려 ${rejected.length}`);
  for (const [slug, why] of rejected) console.log(`  [반려] ${slug}: ${why}`);
  if (dry) { console.log("(dry run — 파일 미변경)"); return; }
  if (!accepted.length) { console.log("반영할 항목 없음."); return; }

  // 관련 용어는 기존 슬러그 + 이번 라운드 승인분까지만 인정
  const ctx = buildContext(terms, accepted.map((t) => t.slug));
  for (const t of accepted) ctx.titleBySlug.set(t.slug, t.title_ko);

  let dead = 0;
  for (const t of accepted) {
    const before = (t.related || []).length;
    t.related = (t.related || []).filter((s) => ctx.validSlugs.has(s) && s !== t.slug);
    dead += before - t.related.length;
    fs.writeFileSync(path.join(ROOT_DIR, "terms", `${t.slug}.html`), renderTermPage(t, ctx), "utf8");
  }
  console.log(`페이지 ${accepted.length}개 생성, 죽은 related 링크 ${dead}건 제거`);

  // terms.json에는 사이트가 쓰는 필드만 넣는다(본문 섹션은 HTML에만 존재)
  const fresh = JSON.parse(fs.readFileSync(TERMS_JSON, "utf8"));
  if (fresh.length !== terms.length) {
    console.error(`중단: 처리 중 terms.json이 ${terms.length} → ${fresh.length}로 바뀌었습니다(동시 실행 의심). 다시 실행하세요.`);
    process.exit(2);
  }
  const merged = fresh.concat(accepted.map((t) => ({
    slug: t.slug,
    title_ko: t.title_ko,
    title_en: t.title_en,
    categories: t.categories,
    definition: t.definition,
    related: t.related,
    aliases: t.aliases || [],
    subcategory: t.subcategory,
    difficulty: 2,
    prerequisites: [],
  })));
  fs.writeFileSync(TERMS_JSON, JSON.stringify(merged, null, 2) + "\n", "utf8");

  const today = new Date().toISOString().slice(0, 10);
  let sitemap = fs.readFileSync(SITEMAP, "utf8");
  const blocks = accepted
    .map((t) => `  <url>\n    <loc>https://termglossary.kr/terms/${t.slug}.html</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n`)
    .join("");
  sitemap = sitemap.replace("</urlset>", blocks + "</urlset>");
  fs.writeFileSync(SITEMAP, sitemap, "utf8");

  console.log(`terms.json ${fresh.length} → ${merged.length}, sitemap +${accepted.length}`);
  const byCat = {};
  for (const t of accepted) byCat[t.categories[0]] = (byCat[t.categories[0]] || 0) + 1;
  console.log("분야별:", Object.entries(byCat).map(([k, v]) => `${CATEGORY_LABELS[k] || k} +${v}`).join(", "));
}

main();
