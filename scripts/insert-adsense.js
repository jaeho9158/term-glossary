const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const EXCLUDE_DIRS = new Set(["node_modules", ".git", ".claude", "docs", "supabase", "tests", "en"]);

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
  // 기본은 dry-run. 실제 파일 갱신은 --write 옵트인.
  const dry = !process.argv.includes("--write");
  const snippet = buildSnippet(ADSENSE_CLIENT_ID);
  const files = collectHtmlFiles(ROOT_DIR, []);
  let updated = 0;
  let skipped = 0;

  for (const filePath of files) {
    const html = fs.readFileSync(filePath, "utf8");

    if (!html.includes("</head>")) {
      console.warn(`건너뜀 (head 태그 없음): ${path.relative(ROOT_DIR, filePath)}`);
      continue;
    }

    // 리다이렉트 스텁(noindex + meta refresh)에는 광고 로더를 넣지 않는다.
    if (html.includes('http-equiv="refresh"')) {
      skipped += 1;
      continue;
    }

    const nextHtml = insertSnippet(html, snippet);
    if (nextHtml !== html) {
      if (!dry) fs.writeFileSync(filePath, nextHtml, "utf8");
      updated += 1;
    }
  }

  console.log(
    `AdSense 스니펫 ${dry ? "[dry-run] 갱신 예정" : "삽입 완료"}: 대상 ${files.length} · 갱신 ${updated} · 스킵(스텁) ${skipped}` +
      (dry ? " — 실제 반영은 --write" : "")
  );
}

run();
