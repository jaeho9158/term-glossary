const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const TERMS_PATH = path.join(ROOT_DIR, "terms.json");
const EN_DIR = path.join(ROOT_DIR, "en");
const EN_TERMS_DIR = path.join(EN_DIR, "terms");

const BASE_URL = "https://termglossary.kr";

function readTerms() {
  const content = fs.readFileSync(TERMS_PATH, "utf8");
  const terms = JSON.parse(content);

  if (!Array.isArray(terms)) {
    throw new Error("terms.json의 최상위 값은 배열이어야 합니다.");
  }

  return terms;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTermPage(term) {
  const title = term.title_en || term.title_ko;
  const translated = Boolean(term.definition_en);

  const definitionBlock = translated
    ? `<div class="definition-box">
    <strong>One-line definition:</strong> ${escapeHtml(term.definition_en)}
  </div>`
    : `<div class="definition-box translation-pending">
    <strong>Translation pending.</strong> The definition below is still in Korean (placeholder) until this term is translated.
  </div>

  <h2>정의 (한국어 원문 / Korean original, untranslated)</h2>
  <p>${escapeHtml(term.definition || "")}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)} - Term Glossary${translated ? "" : " (translation pending)"}</title>
<meta name="description" content="${escapeHtml(title)}: ${translated ? escapeHtml(term.definition_en) : "English page structure. Full translation not yet available."}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="canonical" href="${BASE_URL}/en/terms/${encodeURIComponent(term.slug)}.html">
<link rel="alternate" hreflang="ko" href="${BASE_URL}/terms/${encodeURIComponent(term.slug)}.html">
<link rel="stylesheet" href="../../style.css">
</head>
<body data-base="../../">
<header class="site-header">
  <div class="inner">
    <a class="logo" href="../index.html">Term Glossary (EN)</a>
    <nav id="site-nav" class="site-nav">
      <a href="../index.html">Term list (EN samples)</a>
      <a href="../../index.html">한국어 사이트</a>
    </nav>
  </div>
</header>

<main class="delay-1">
  <p class="breadcrumb"><a href="../index.html">Term list (EN samples)</a> &gt; ${escapeHtml(title)}</p>
  <h1>${escapeHtml(title)}</h1>

  ${definitionBlock}
</main>

<footer class="site-footer">
  <p>&copy; 2026 Term Glossary. All rights reserved.</p>
  <a href="../../about.html">About (KO)</a> &middot; <a href="../../privacy.html">Privacy (KO)</a> &middot; <a href="../../contact.html">Contact (KO)</a>
</footer>
</body>
</html>
`;
}

function buildIndexPage(terms) {
  const translatedCount = terms.filter((t) => t.definition_en).length;
  const items = terms
    .map((term) => {
      const label = escapeHtml(term.title_en || term.title_ko);
      const tag = term.definition_en ? "" : " (translation pending)";
      return `      <li><a href="terms/${encodeURIComponent(term.slug)}.html">${label}</a>${tag}</li>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Term Glossary (English, sample pages)</title>
<meta name="description" content="English structure sample for the term glossary. Translation work is in progress.">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="canonical" href="${BASE_URL}/en/index.html">
<link rel="stylesheet" href="../style.css">
</head>
<body data-base="../">
<header class="site-header">
  <div class="inner">
    <a class="logo" href="index.html">Term Glossary (EN)</a>
    <nav id="site-nav" class="site-nav">
      <a href="../index.html">한국어 사이트</a>
    </nav>
  </div>
</header>

<main class="delay-1">
  <h1>Term Glossary — English (sample)</h1>
  <p class="translation-pending">This is a structural pilot for the English site. ${translatedCount} of ${terms.length} listed terms have a real English definition so far; the rest are untranslated Korean placeholders.</p>
  <ul>
${items}
  </ul>
</main>

<footer class="site-footer">
  <p>&copy; 2026 Term Glossary. All rights reserved.</p>
</footer>
</body>
</html>
`;
}

// 구조 파일럿 때 만든 5개는 번역 여부와 무관하게 계속 유지하고,
// definition_en이 채워진 용어(우선순위 번역분)를 모두 추가한다.
const PILOT_SLUGS = [
  "p-value",
  "correlation",
  "regression",
  "effect-size",
  "confidence-interval",
];

function generate() {
  const terms = readTerms();
  const slugs = new Set(PILOT_SLUGS);
  for (const term of terms) {
    if (term.definition_en) slugs.add(term.slug);
  }

  const samples = [...slugs].map((slug) => {
    const term = terms.find((t) => t.slug === slug);
    if (!term) {
      throw new Error(`terms.json에 slug를 찾을 수 없습니다: ${slug}`);
    }
    return term;
  });

  fs.mkdirSync(EN_TERMS_DIR, { recursive: true });

  for (const term of samples) {
    const filePath = path.join(EN_TERMS_DIR, `${term.slug}.html`);
    fs.writeFileSync(filePath, buildTermPage(term), "utf8");
  }

  fs.writeFileSync(path.join(EN_DIR, "index.html"), buildIndexPage(samples), "utf8");

  const translatedCount = samples.filter((t) => t.definition_en).length;
  console.log(`English pages generated: ${samples.length} term pages (${translatedCount} translated) + en/index.html`);
}

try {
  generate();
} catch (error) {
  console.error("Failed to generate English pages.");
  console.error(error.message);
  process.exitCode = 1;
}
