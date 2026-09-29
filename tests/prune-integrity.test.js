// 용어 정리(병합·가지치기) 무결성 테스트. 계획서 6절 1~6.
// 기본은 저장소 루트를 검사한다. apply.js를 복사본에 시험할 때는 PRUNE_ROOT=<복사본 경로>로 같은 검사를 돌린다.
// (복사본에는 viewer-index.json이 없을 수 있어 5번은 그때 건너뛴다.)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const ROOT = process.env.PRUNE_ROOT ? path.resolve(process.env.PRUNE_ROOT) : REPO;
const viewer = require(path.join(REPO, "assets", "viewer.js"));

const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
const slugSet = new Set(terms.map((t) => t.slug));
const termsDir = path.join(ROOT, "terms");
const termFiles = fs.readdirSync(termsDir).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5));
const stubSlugs = termFiles.filter((s) => !slugSet.has(s));
const stubSet = new Set(stubSlugs);
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

// 실측된 기존 결함(이 작업 이전부터 있던 것)은 tests/fixtures/prune-known-failures.json({"검사번호":[내용...]})에
// 기록만 하고 여기서 고치지 않는다. 새 결함이 생기면 실패해야 하므로, 목록에 없는 위반만 실패로 센다.
// 결함을 고친 뒤에는 그 항목을 목록에서 지운다. PRUNE_DUMP_FAILURES=<파일>이면 이번에 잡힌 위반 전체를 그 파일에 쓴다.
const knownFile = path.join(__dirname, "fixtures", "prune-known-failures.json");
const KNOWN = fs.existsSync(knownFile) ? JSON.parse(fs.readFileSync(knownFile, "utf8")) : {};
const dumped = {};
const unknown = (list, tag) => {
  dumped[tag] = list;
  if (process.env.PRUNE_DUMP_FAILURES) fs.writeFileSync(process.env.PRUNE_DUMP_FAILURES, JSON.stringify(dumped, null, 1));
  const known = new Set(KNOWN[tag] || []);
  return list.filter((x) => !known.has(x));
};

// 파일이 많아(4만여 개) 읽기를 병렬로 돌린다.
async function mapLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const item = items[i++]; await fn(item); }
  }));
}

test("1) related/prerequisites가 가리키는 slug는 모두 terms.json에 있다(죽은 링크 0)", () => {
  const dead = [];
  for (const t of terms) {
    for (const field of ["related", "prerequisites"]) {
      for (const s of t[field] || []) if (!slugSet.has(s)) dead.push(`${t.slug}.${field}→${s}`);
    }
  }
  assert.deepStrictEqual(unknown(dead, "1").slice(0, 20), [], `죽은 링크 ${dead.length}개`);
});

test("2) terms.json에 없는 terms/*.html은 전부 스텁(noindex+canonical+refresh)이고 대상은 스텁이 아니다", () => {
  const bad = [];
  for (const slug of stubSlugs) {
    const html = read("terms", `${slug}.html`);
    const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
    const canonical = /<link rel="canonical" href="[^"]+"/.test(html);
    const refresh = html.match(/<meta http-equiv="refresh" content="0; url=([^"]+)"/);
    if (!noindex) { bad.push(`${slug}: noindex 없음`); continue; }
    if (!canonical) { bad.push(`${slug}: canonical 없음`); continue; }
    if (!refresh) { bad.push(`${slug}: refresh 없음`); continue; }
    const target = refresh[1];
    const term = target.match(/^([^/]+)\.html$/);
    const cat = target.match(/^\.\.\/category\/([^/]+)\.html$/);
    if (term) {
      if (!slugSet.has(term[1])) bad.push(`${slug}: 대상 ${target}이 없거나 스텁(체인)`);
    } else if (cat) {
      if (!fs.existsSync(path.join(ROOT, "category", `${cat[1]}.html`))) bad.push(`${slug}: 분야 페이지 없음 ${target}`);
    } else bad.push(`${slug}: 알 수 없는 refresh 대상 ${target}`);
  }
  assert.deepStrictEqual(unknown(bad, "2").slice(0, 20), [], `스텁 결함 ${bad.length}개 / 스텁 ${stubSlugs.length}개`);
  assert.ok(stubSlugs.length > 0 || terms.length === 0, "스텁이 하나도 없다 — 검사 대상 확인 필요");
});

test("3) 사이트맵에 terms.json에 없는 용어 URL·noindex 페이지가 없다", () => {
  const files = ["sitemap.xml"];
  const dir = path.join(ROOT, "sitemaps");
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".xml"))) files.push(path.join("sitemaps", f));
  const bad = [];
  let count = 0;
  for (const f of files) {
    for (const m of read(f).matchAll(/<loc>[^<]*\/terms\/([^<]+)\.html<\/loc>/g)) {
      count++;
      if (!slugSet.has(m[1])) bad.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepStrictEqual(unknown(bad, "3").slice(0, 20), [], `사이트맵 결함 ${bad.length}개 / 용어 URL ${count}개`);
  assert.ok(count > 0, "사이트맵에 용어 URL이 하나도 없다");
});

test("4) 비스텁 용어 페이지·분야 페이지의 내부 링크가 스텁·없는 파일을 가리키지 않는다", async () => {
  const bad = [];
  const check = (from, slug) => { if (!slugSet.has(slug)) bad.push(`${from}→${slug}${stubSet.has(slug) ? "(스텁)" : "(없음)"}`); };
  await mapLimit(termFiles.filter((s) => slugSet.has(s)), 64, async (slug) => { // 스텁은 제외
    const html = await fs.promises.readFile(path.join(ROOT, "terms", `${slug}.html`), "utf8");
    for (const m of html.matchAll(/href="([a-z0-9][a-z0-9-]*)\.html(?:#[^"]*)?"/g)) check(`terms/${slug}`, m[1]);
    for (const m of html.matchAll(/href="\.\.\/terms\/([^"#/]+)\.html/g)) check(`terms/${slug}`, m[1]);
  });
  const catDir = path.join(ROOT, "category");
  for (const f of fs.existsSync(catDir) ? fs.readdirSync(catDir).filter((f) => f.endsWith(".html")) : []) {
    for (const m of read("category", f).matchAll(/href="\.\.\/terms\/([^"#/]+)\.html/g)) check(`category/${f}`, m[1]);
  }
  bad.sort();
  assert.deepStrictEqual(unknown(bad, "4").slice(0, 20), [], `링크 결함 ${bad.length}개`);
});

test("5) match_titles를 가진 용어는 viewer-index 디코드 결과에서 그 제목으로 대표에게 매칭된다", (t) => {
  const idxFile = path.join(ROOT, "viewer-index.json");
  if (!fs.existsSync(idxFile)) return t.skip("viewer-index.json 없음");
  const index = viewer.buildExactIndex(viewer.decodeViewerIndex(JSON.parse(fs.readFileSync(idxFile, "utf8"))));
  const bad = [];
  for (const term of terms) {
    for (const title of term.match_titles || []) {
      const text = /[가-힣]/.test(title) ? `본 연구는 ${title}을 다룬다.` : `We study ${title} in this paper.`;
      const hit = viewer.matchTermsWithIndex(text, index).some((m) => m.slug === term.slug);
      if (!hit) bad.push(`${term.slug}: ${title}`);
    }
  }
  assert.deepStrictEqual(unknown(bad, "5").slice(0, 20), [], `match_titles 미매칭 ${bad.length}개`);
});

test("6) apply-log.json이 있으면 pruned slug의 GA는 0", (t) => {
  const logFile = path.join(ROOT, "data", "prune", "apply-log.json");
  const gaFile = path.join(REPO, "data", "prune", "ga4.json");
  if (!fs.existsSync(logFile)) return t.skip("apply-log.json 없음");
  if (!fs.existsSync(gaFile)) return t.skip("ga4.json 없음");
  const log = JSON.parse(fs.readFileSync(logFile, "utf8"));
  const ga = JSON.parse(fs.readFileSync(gaFile, "utf8"));
  const bad = (log.pruned || []).filter((p) => (ga[`/terms/${p.slug}.html`] || 0) >= 1).map((p) => p.slug);
  assert.deepStrictEqual(bad, []);
});
