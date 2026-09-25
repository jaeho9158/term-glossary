// 뷰어 용어 매칭 채점기. docs/viewer-corpus/README.md 참고.
//
// 뷰어(assets/viewer.js)와 같은 인덱스(viewer-index.json)와 같은 매칭 함수
// (buildExactIndex/matchTermsWithIndex)를 그대로 돌려서, 브라우저에서 보는
// 결과와 채점 결과가 어긋나지 않게 한다. PDF 텍스트 추출도 뷰어와 같은
// pdf.js + joinTextItems 경로를 쓴다.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CORPUS = path.join(ROOT, "docs", "viewer-corpus");
const viewer = require(path.join(ROOT, "assets", "viewer.js"));

function loadIndex() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "viewer-index.json"), "utf8"));
  return viewer.decodeViewerIndex(raw);
}

async function extractPdfText(file) {
  const toUrl = (p) => p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:");
  const vendor = path.join(ROOT, "assets", "vendor", "pdfjs");
  const pdfjs = await import(toUrl(path.join(vendor, "pdf.min.mjs")));
  // Node에서는 워커 경로를 자동으로 못 찾아 "fake worker" 설정에 실패한다. 명시해 준다.
  pdfjs.GlobalWorkerOptions.workerSrc = toUrl(path.join(vendor, "pdf.worker.min.mjs"));
  const data = new Uint8Array(fs.readFileSync(file));
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(viewer.joinTextItems(content.items));
  }
  return pages.join("\n\n");
}

async function readDocText(base) {
  if (fs.existsSync(base + ".txt")) return fs.readFileSync(base + ".txt", "utf8");
  if (fs.existsSync(base + ".pdf")) return extractPdfText(base + ".pdf");
  return null;
}

function listDocs() {
  if (!fs.existsSync(CORPUS)) return [];
  return fs.readdirSync(CORPUS)
    .filter((f) => f.endsWith(".expected.json"))
    .map((f) => f.replace(/\.expected\.json$/, ""))
    .sort();
}

// 패널 정렬은 뷰어의 sortMatches와 같다(score 오름차순 → count 내림차순).
// nested 검사: 짧은 용어의 순위가 긴 용어보다 앞이면 정렬 오류.
function rankOf(matches, slug) {
  const i = matches.findIndex((m) => m.slug === slug);
  return i === -1 ? Infinity : i;
}

async function gradeDoc(name, index, terms, verbose) {
  const base = path.join(CORPUS, name);
  const spec = JSON.parse(fs.readFileSync(base + ".expected.json", "utf8"));
  const text = await readDocText(base);
  if (text === null) return { name, error: "본문 파일 없음(.pdf/.txt)" };
  if (!text.trim()) return { name, error: "추출된 텍스트 없음(스캔본?)", scanned: true };

  const matches = viewer.matchTermsWithIndex(text, index);
  const got = new Set(matches.map((m) => m.slug));
  const expected = new Set(spec.expected || []);
  const notExpected = new Set(spec.not_expected || []);

  const missed = [...expected].filter((s) => !got.has(s));
  const falsePos = [...notExpected].filter((s) => got.has(s));
  const unlabeled = [...got].filter((s) => !expected.has(s) && !notExpected.has(s));
  const orderErrors = (spec.nested || []).filter(([long, short]) => rankOf(matches, short) < rankOf(matches, long));

  return { name, text, matches, expected, notExpected, missed, falsePos, unlabeled, orderErrors, verbose };
}

function title(terms, slug) {
  const t = terms.get(slug);
  return t ? `${slug}(${t.title_ko})` : slug;
}

async function main() {
  const args = process.argv.slice(2);
  const decoded = loadIndex();
  const terms = new Map(decoded.map((t) => [t.slug, t]));

  if (args[0] === "--find") {
    const q = args.slice(1).join(" ").toLowerCase();
    for (const t of decoded) {
      if (t.title_ko.includes(q) || t.title_en.toLowerCase().includes(q) || t.slug.includes(q)) {
        console.log(`${t.slug}\t${t.title_ko}\t${t.title_en}\t${t.categories[0] || ""}`);
      }
    }
    return;
  }

  const index = viewer.buildExactIndex(decoded);
  const docs = args.length ? args : listDocs();
  if (!docs.length) {
    console.log(`말뭉치가 비어 있습니다: ${CORPUS}\nREADME.md대로 NAME.pdf + NAME.expected.json을 넣으세요.`);
    return;
  }

  let sumExp = 0, sumMissed = 0, sumGot = 0, sumFp = 0, sumOrder = 0;
  for (const name of docs) {
    const r = await gradeDoc(name, index, terms, args.length === 1);
    if (r.error) { console.log(`\n[${name}] ${r.error}`); continue; }
    sumExp += r.expected.size; sumMissed += r.missed.length;
    sumGot += r.matches.length; sumFp += r.falsePos.length; sumOrder += r.orderErrors.length;
    console.log(`\n[${name}] 잡힘 ${r.matches.length} / 정답 ${r.expected.size} — 미탐 ${r.missed.length}, 오탐 ${r.falsePos.length}, 미분류 ${r.unlabeled.length}, 정렬 오류 ${r.orderErrors.length}`);
    if (r.missed.length) console.log("  미탐:", r.missed.map((s) => title(terms, s)).join(", "));
    if (r.falsePos.length) console.log("  오탐:", r.falsePos.map((s) => title(terms, s)).join(", "));
    for (const [l, s] of r.orderErrors) console.log(`  정렬 오류: ${title(terms, s)} 가 ${title(terms, l)} 보다 위`);
    if (r.verbose) {
      console.log("  잡힌 용어(패널 순서):");
      r.matches.forEach((m, i) => console.log(`   ${String(i + 1).padStart(3)}. ${m.slug} ${m.title_ko} ×${m.count}`));
    } else if (r.unlabeled.length) {
      console.log("  미분류:", r.unlabeled.slice(0, 15).map((s) => title(terms, s)).join(", ") + (r.unlabeled.length > 15 ? ` … 외 ${r.unlabeled.length - 15}` : ""));
    }
  }
  const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "-");
  console.log(`\n합계: 미탐 ${sumMissed}/${sumExp} (${pct(sumMissed, sumExp)}), 오탐 ${sumFp}/${sumGot} (${pct(sumFp, sumGot)}), 정렬 오류 ${sumOrder}`);
  console.log("목표: 미탐 ≤ 10%, 오탐 ≤ 5%, 정렬 오류 0");
}

main().catch((e) => { console.error(e); process.exit(1); });
