// 검수 체크 페이지용 데이터. core(구글 색인 대상) 용어마다 본문 지문을 만든다.
//   node scripts/review-data.js <출력.json>
// 지문 두 가지(sha1 앞 10자, 태그·공백을 걷어낸 글자 기준):
//   core = 정의 상자 + "쉽게 풀면" + "주의할 점"  → 바뀌면 재검수가 필요하다.
//   full = 정의 상자부터 "관련 용어" 앞까지 전체 → core 는 같고 full 만 바뀌면 "보강됨"(재검수 불필요).
// 도식·예문·심화 문단을 덧붙이는 작업은 core 지문을 건드리지 않는다.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");

const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 10);

// 본문을 { definition, sections: {제목: 글자} } 로 나눈다.
function parseTermPage(html) {
  const start = html.indexOf('<div class="definition-box"');
  if (start === -1) return null;
  let end = html.indexOf("<h2>관련 용어</h2>", start);
  if (end === -1) end = html.indexOf("</main>", start);
  if (end === -1) end = html.length;
  const raw = html.slice(start, end);
  // 도식(figure.concept-diagram)은 본문 지문에서 빼고 따로 지문을 만든다.
  // 도식을 다시 그려도 본문 검수는 유지되고, 도식 확인만 다시 하면 된다.
  const figures = raw.match(/<figure[^>]*class="[^"]*concept-diagram[\s\S]*?<\/figure>/g) || [];
  const diagram = figures.map(strip).join("\n");
  const body = raw.replace(/<figure[^>]*class="[^"]*concept-diagram[\s\S]*?<\/figure>/g, "");
  const parts = body.split(/<h2[^>]*>/);
  const definition = strip(parts[0]);
  const sections = {};
  for (const p of parts.slice(1)) {
    const i = p.indexOf("</h2>");
    if (i === -1) continue;
    sections[strip(p.slice(0, i))] = strip(p.slice(i + 5));
  }
  return { definition, sections, full: strip(body), hasDiagram: figures.length > 0, diagram };
}

function fingerprints(html) {
  const p = parseTermPage(html);
  if (!p) return null;
  const core = [p.definition, p.sections["쉽게 풀면"] || "", p.sections["주의할 점"] || ""].join("\n");
  return { core: hash(core), full: hash(p.full), diagram: p.hasDiagram ? hash(p.diagram) : "", definition: p.definition, easy: p.sections["쉽게 풀면"] || "" };
}

function main() {
  const out = process.argv[2];
  if (!out) { console.error("usage: node scripts/review-data.js <out.json>"); process.exit(1); }
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const archive = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "data", "index-tiers.json"), "utf8")).archive);
  const labels = require(path.join(ROOT, "assets", "category-data.js")).CATEGORY_LABELS;
  let ga = {};
  try { ga = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "prune", "ga4.json"), "utf8")); } catch (e) {}
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const rows = [];
  let missing = 0;
  for (const t of terms) {
    if (!t || !t.slug || archive.has(t.slug)) continue;
    const file = path.join(ROOT, "terms", t.slug + ".html");
    if (!fs.existsSync(file)) { missing++; continue; }
    const fp = fingerprints(fs.readFileSync(file, "utf8"));
    if (!fp) { missing++; continue; }
    const c = (t.categories || [])[0] || "";
    rows.push({ s: t.slug, k: t.title_ko, e: t.title_en || "", c, v: ga["/terms/" + t.slug + ".html"] || 0, hc: fp.core, hf: fp.full, hg: fp.diagram, d: clip(fp.definition, 220), y: clip(fp.easy, 200) });
  }
  rows.sort((a, b) => b.v - a.v || a.k.localeCompare(b.k, "ko"));
  const cats = {};
  for (const r of rows) cats[r.c] = labels[r.c] || r.c;
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), cats, rows }));
  console.log(`rows ${rows.length}, missing ${missing}, ${fs.statSync(out).size} bytes`);
}

if (require.main === module) main();
module.exports = { parseTermPage, fingerprints };
