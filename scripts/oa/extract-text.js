// 말뭉치 PDF → 본문 텍스트. 뷰어와 같은 경로(pdf.js + joinTextItems + excludedRanges)로
// 뽑아야 통계가 뷰어가 실제로 보는 글자와 어긋나지 않는다.
//
// cMap: 정찰에서 구형 논문(CID 글꼴)이 cMap 없이 열면 한글이 깨졌다. 뷰어 번들
// (assets/vendor/pdfjs)에는 cmaps가 없으므로 같은 버전의 pdfjs-dist(devDependency)에서
// cmaps/·standard_fonts/만 빌려 쓴다.
//
// 사용: node scripts/oa/extract-text.js [--force]
// 출력: data/oa-corpus/text/<id>.txt. 한글 < MIN_HANGUL이면 index.jsonl에 skipped 표시.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "data", "oa-corpus");
const INDEX = path.join(OUT_DIR, "index.jsonl");
const TEXT_DIR = path.join(OUT_DIR, "text");
const viewer = require(path.join(ROOT, "assets", "viewer.js"));
// 스캔본·깨진 글꼴은 한글이 거의 안 나온다. 국문 논문 한 편이면 수천 자는 된다.
const MIN_HANGUL = 500;

const toUrl = (p) => p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:");

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const vendor = path.join(ROOT, "assets", "vendor", "pdfjs");
      const pdfjs = await import(toUrl(path.join(vendor, "pdf.min.mjs")));
      pdfjs.GlobalWorkerOptions.workerSrc = toUrl(path.join(vendor, "pdf.worker.min.mjs"));
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

// Node에서 pdf.js는 cMap·표준 글꼴을 fs로 읽는다(NodeCMapReaderFactory). 끝 슬래시 필수.
function assetDir(name) {
  const dir = path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), name);
  return dir.replace(/\\/g, "/") + "/";
}

async function extractPdf(file) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(fs.readFileSync(file));
  const pdf = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: assetDir("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: assetDir("standard_fonts"),
    verbosity: 0,
  }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(viewer.joinTextItems(content.items));
  }
  await pdf.destroy();
  return pages.join("\n\n");
}

// 참고문헌·영문 초록·감사의 글 구간을 뺀다(뷰어 matchTermsWithIndex와 같은 구간).
// 빈칸으로 채우지 않고 줄바꿈 하나로 잇는다 — 통계는 위치가 아니라 낱말만 본다.
function stripExcluded(text) {
  const ranges = viewer.excludedRanges(text);
  if (!ranges.length) return text;
  let out = "";
  let pos = 0;
  for (const [s, e] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (s > pos) out += text.slice(pos, s) + "\n";
    pos = Math.max(pos, e);
  }
  return out + text.slice(pos);
}

function hangulCount(text) {
  return (text.match(/[가-힣]/g) || []).length;
}

async function main() {
  const force = process.argv.includes("--force");
  fs.mkdirSync(TEXT_DIR, { recursive: true });
  const lines = fs.readFileSync(INDEX, "utf8").split("\n").filter((l) => l.trim());
  const recs = lines.map((l) => JSON.parse(l));
  let ok = 0, skipped = 0, failed = 0;
  for (const rec of recs) {
    const out = path.join(TEXT_DIR, `${rec.id}.txt`);
    const pdf = path.join(OUT_DIR, rec.source, `${rec.id}.pdf`);
    if (!force && (fs.existsSync(out) || rec.skipped)) { rec.skipped ? skipped++ : ok++; continue; }
    if (!fs.existsSync(pdf)) { failed++; continue; }
    try {
      const text = stripExcluded(await extractPdf(pdf));
      const n = hangulCount(text);
      if (n < MIN_HANGUL) {
        rec.skipped = `hangul ${n}`;
        if (fs.existsSync(out)) fs.rmSync(out);
        skipped++;
      } else {
        delete rec.skipped;
        fs.writeFileSync(out, text, "utf8");
        ok++;
      }
    } catch (err) {
      console.warn(`  추출 실패: ${rec.id} (${err.message})`);
      rec.skipped = "error";
      failed++;
    }
  }
  fs.writeFileSync(INDEX, recs.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  console.log(`텍스트 ${ok}편, 제외 ${skipped}편, 실패 ${failed}편`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { extractPdf, stripExcluded, hangulCount, MIN_HANGUL };
