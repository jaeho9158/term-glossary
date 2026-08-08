const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const MAP_DIR = "C:\\Users\\hssh9\\AppData\\Local\\Temp\\claude\\C--Users-hssh9-----\\c6d1be8f-64de-4ad0-bc7a-fb5cee01a28b\\scratchpad";

const CATEGORIES = ["stat", "method", "tool", "ethics", "physchem", "bioearth", "neuro", "medhealth", "psych", "socialecon", "eng", "cs", "math"];

function run() {
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "terms.json"), "utf8"));
  const { SUB_CATEGORY_ORDER } = require(path.join(ROOT_DIR, "assets", "category-data.js"));

  const merged = {};
  for (const cat of CATEGORIES) {
    const mapPath = path.join(MAP_DIR, `map-${cat}.json`);
    const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    for (const slug in map) {
      merged[slug] = map[slug];
    }
  }

  let assigned = 0;
  let missing = [];
  let outOfList = [];

  for (const term of terms) {
    const primaryCat = term.categories && term.categories[0];
    if (!primaryCat) continue;
    const sub = merged[term.slug];
    if (!sub) {
      missing.push(term.slug);
      continue;
    }
    const allowed = SUB_CATEGORY_ORDER[primaryCat] || [];
    if (!allowed.includes(sub)) {
      outOfList.push(`${term.slug} -> ${sub} (cat=${primaryCat})`);
    }
    term.subcategory = sub;
    assigned++;
  }

  fs.writeFileSync(path.join(ROOT_DIR, "terms.json"), JSON.stringify(terms, null, 2) + "\n", "utf8");

  console.log(`assigned: ${assigned}`);
  console.log(`missing (no mapping found): ${missing.length}`);
  if (missing.length) console.log(missing.slice(0, 50));
  console.log(`out-of-list subcategory values (not in fixed SUB_CATEGORY_ORDER): ${outOfList.length}`);
  if (outOfList.length) console.log(outOfList.slice(0, 50));
}

run();
