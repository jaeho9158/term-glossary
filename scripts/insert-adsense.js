const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const EXCLUDE_DIRS = new Set(["node_modules", ".git"]);

const START_MARKER = "<!-- AdSense:start -->";
const END_MARKER = "<!-- AdSense:end -->";

const ADSENSE_CLIENT_ID = "ca-pub-7710727724213886";

function buildSnippet(clientId) {
  return [
    START_MARKER,
    `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}" crossorigin="anonymous"></script>`,
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

function collectHtmlFiles(dir, results) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      collectHtmlFiles(path.join(dir, entry.name), results);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

function run() {
  const snippet = buildSnippet(ADSENSE_CLIENT_ID);
  const files = collectHtmlFiles(ROOT_DIR, []);
  let updated = 0;

  for (const filePath of files) {
    const html = fs.readFileSync(filePath, "utf8");

    if (!html.includes("</head>")) {
      console.warn(`건너뜀 (head 태그 없음): ${path.relative(ROOT_DIR, filePath)}`);
      continue;
    }

    const nextHtml = insertSnippet(html, snippet);
    if (nextHtml !== html) {
      fs.writeFileSync(filePath, nextHtml, "utf8");
      updated += 1;
    }
  }

  console.log(`AdSense 스니펫 삽입 완료: ${updated}개 파일 갱신`);
}

run();
