// 검수된(reviewed:true) 도식 스펙을 terms/<slug>.html에 인라인으로 넣는다.
//
//   node scripts/diagrams/insert.js           검수된 스펙 반영 + 검수 취소·삭제된 도식 제거
//   node scripts/diagrams/insert.js --dry-run 무엇이 바뀔지 출력만
//
// - 위치: 한 줄 정의 박스(.definition-box) 바로 아래.
// - 이미 키워드 매칭으로 들어간 범용 도식(<figure class="term-figure">)이 있으면
//   이 도식으로 바꾼다(한 페이지에 도식 두 개는 혼란스럽다).
// - <!-- concept-diagram:start/end --> 마커 사이만 다시 쓰므로 여러 번 돌려도 안전하다.
// - 넣은 slug를 diagrams/inserted.json에 기록해, 검수를 취소하거나 스펙을 지우면
//   다음 실행 때 해당 페이지에서 도식을 걷어낸다(41,000개 페이지를 다 뒤지지 않도록).
"use strict";
const fs = require("fs");
const path = require("path");
const { validateSpec, renderFigure } = require("./lib.js");

const ROOT = path.join(__dirname, "..", "..");
const SPEC_DIR = path.join(ROOT, "diagrams", "specs");
const MANIFEST = path.join(ROOT, "diagrams", "inserted.json");
const START = "<!-- concept-diagram:start -->";
const END = "<!-- concept-diagram:end -->";
// 윈도 체크아웃은 CRLF라, 줄끝을 \n으로만 가정하면 정의 박스를 못 찾아 모든 페이지를
// 조용히 건너뛴다. 정규식은 \r?\n을 받고, 새로 쓰는 줄은 파일의 줄끝을 따른다.
const BLOCK = /(?:\r?\n)?[ \t]*<!-- concept-diagram:start -->[\s\S]*?<!-- concept-diagram:end -->(?:\r?\n)?/;
const GENERIC = /(?:\r?\n)?[ \t]*<figure class="term-figure">[\s\S]*?<\/figure>(?:\r?\n)?/;
const DEF_BOX = /<div class="definition-box">[\s\S]*?<\/div>\r?\n/;

// 순수 함수(테스트 대상): 도식 블록을 넣거나 교체한다.
function applyDiagram(html, figureHtml) {
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  const block = `${nl}  ${START}${nl}  ${figureHtml}${nl}  ${END}${nl}`;
  let out = html.replace(GENERIC, nl);
  if (BLOCK.test(out)) return out.replace(BLOCK, block);
  const m = DEF_BOX.exec(out);
  if (!m) return null; // 정의 박스가 없는 페이지(리다이렉트 스텁 등)는 건너뛴다
  const at = m.index + m[0].length;
  return out.slice(0, at) + block + out.slice(at);
}

function removeDiagram(html) {
  return html.replace(BLOCK, html.includes("\r\n") ? "\r\n" : "\n");
}

function run() {
  const dry = process.argv.includes("--dry-run");
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
  const titles = new Map(terms.map((t) => [t.slug, t.title_ko]));
  const known = new Set(titles.keys());
  const previous = new Set(fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : []);
  const now = new Set();
  let inserted = 0, removed = 0, skipped = 0, warned = 0;

  const files = fs.existsSync(SPEC_DIR) ? fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith(".json")) : [];
  for (const f of files) {
    const spec = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, f), "utf8"));
    if (spec.reviewed !== true) continue;
    const errs = validateSpec(spec, known);
    if (errs.length) {
      console.error(`✗ ${spec.slug}: ${errs.join("; ")}`);
      process.exitCode = 1;
      continue;
    }
    const page = path.join(ROOT, "terms", `${spec.slug}.html`);
    if (!fs.existsSync(page)) { skipped++; continue; }
    const fig = renderFigure(spec, titles.get(spec.slug));
    if (fig.warnings.length) {
      warned++;
      console.warn(`! ${spec.slug}: ${fig.warnings.join("; ")}`);
    }
    const html = fs.readFileSync(page, "utf8");
    const next = applyDiagram(html, fig.html);
    if (next === null) { skipped++; console.warn(`- ${spec.slug}: 정의 박스를 찾지 못해 건너뜀`); continue; }
    now.add(spec.slug);
    if (next !== html) {
      inserted++;
      if (!dry) fs.writeFileSync(page, next, "utf8");
    }
  }

  for (const slug of previous) {
    if (now.has(slug)) continue;
    const page = path.join(ROOT, "terms", `${slug}.html`);
    if (!fs.existsSync(page)) continue;
    const html = fs.readFileSync(page, "utf8");
    const next = removeDiagram(html);
    if (next !== html) {
      removed++;
      if (!dry) fs.writeFileSync(page, next, "utf8");
    }
  }

  if (!dry) fs.writeFileSync(MANIFEST, JSON.stringify([...now].sort(), null, 2) + "\n", "utf8");
  console.log(`${dry ? "[dry-run] " : ""}삽입·갱신 ${inserted} · 제거 ${removed} · 건너뜀 ${skipped} · 겹침 경고 ${warned} (검수된 도식 ${now.size}개)`);
}

if (require.main === module) run();

module.exports = { applyDiagram, removeDiagram, START, END };
