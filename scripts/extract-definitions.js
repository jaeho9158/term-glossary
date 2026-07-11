const fs = require("fs");
const path = require("path");

const termsPath = path.join(__dirname, "..", "terms.json");
const termsDir = path.join(__dirname, "..", "terms");

const terms = JSON.parse(fs.readFileSync(termsPath, "utf8"));
const missing = [];

for (const term of terms) {
  const filePath = path.join(termsDir, `${term.slug}.html`);
  const html = fs.readFileSync(filePath, "utf8");
  const match = html.match(/한 줄 정의:<\/strong>\s*([^\n]+)/);

  if (!match) {
    missing.push(term.slug);
    continue;
  }

  term.definition = match[1].replace(/<[^>]+>/g, "").trim();
}

const lines = terms.map((term) => "  " + JSON.stringify(term));
fs.writeFileSync(termsPath, "[\n" + lines.join(",\n") + "\n]\n", "utf8");

if (missing.length > 0) {
  console.error("Missing definition for:", missing.join(", "));
  process.exitCode = 1;
} else {
  console.log(`Extracted definitions for all ${terms.length} terms.`);
}
