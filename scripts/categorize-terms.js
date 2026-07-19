// terms.json의 categories[0](대표 카테고리)을 기준으로 terms/*.html을
// <category>/*.html 로 물리 복제한다. terms/ 원본은 canonical로 그대로 유지.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const terms = JSON.parse(fs.readFileSync(path.join(root, "terms.json"), "utf8"));

const summary = {};
let copied = 0;
let missing = [];

for (const term of terms) {
  const primaryCategory = Array.isArray(term.categories) ? term.categories[0] : term.categories;
  if (!primaryCategory) continue;

  const src = path.join(root, "terms", `${term.slug}.html`);
  if (!fs.existsSync(src)) {
    missing.push(term.slug);
    continue;
  }

  const destDir = path.join(root, primaryCategory);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, `${term.slug}.html`));

  summary[primaryCategory] = (summary[primaryCategory] || 0) + 1;
  copied++;
}

console.log("Copied:", copied, "of", terms.length);
console.log("Per-category counts:", summary);
if (missing.length) console.log("Missing source files:", missing);
