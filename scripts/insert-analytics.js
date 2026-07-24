const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(__dirname, "analytics-config.json");

const START_MARKER = "<!-- GA4 analytics:start -->";
const END_MARKER = "<!-- GA4 analytics:end -->";

const TARGET_FILES = [
  ...fs
    .readdirSync(ROOT_DIR)
    .filter((name) => name.endsWith(".html")),
  ...fs
    .readdirSync(path.join(ROOT_DIR, "terms"))
    .filter((name) => name.endsWith(".html"))
    .map((name) => path.join("terms", name)),
];

function buildSnippet(measurementId) {
  return [
    START_MARKER,
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>`,
    "<script>",
    "  window.dataLayer = window.dataLayer || [];",
    "  function gtag(){dataLayer.push(arguments);}",
    "  gtag('js', new Date());",
    `  gtag('config', '${measurementId}');`,
    "</script>",
    END_MARKER,
  ].join("\n");
}

function stripExistingSnippet(html) {
  const startIndex = html.indexOf(START_MARKER);
  const endIndex = html.indexOf(END_MARKER);
  if (startIndex === -1 || endIndex === -1) return html;
  const before = html.slice(0, startIndex);
  const after = html.slice(endIndex + END_MARKER.length);
  return before.replace(/\n?$/, "") + after;
}

function insertSnippet(html, snippet) {
  const cleaned = stripExistingSnippet(html);
  return cleaned.replace("</head>", `${snippet}\n</head>`);
}

function run() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const measurementId = config.ga4MeasurementId;

  if (!measurementId || measurementId === "G-XXXXXXX") {
    console.error(
      "scripts/analytics-config.json의 ga4MeasurementId를 실제 GA4 Measurement ID로 채운 뒤 다시 실행하세요."
    );
    process.exitCode = 1;
    return;
  }

  const snippet = buildSnippet(measurementId);
  let updated = 0;

  for (const relativePath of TARGET_FILES) {
    const filePath = path.join(ROOT_DIR, relativePath);
    const html = fs.readFileSync(filePath, "utf8");

    if (!html.includes("</head>")) {
      console.warn(`건너뜀 (head 태그 없음): ${relativePath}`);
      continue;
    }

    const nextHtml = insertSnippet(html, snippet);
    if (nextHtml !== html) {
      fs.writeFileSync(filePath, nextHtml, "utf8");
      updated += 1;
    }
  }

  console.log(`GA4 스니펫 삽입 완료: ${updated}개 파일 갱신`);
}

run();
