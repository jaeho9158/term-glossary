const fs = require("fs");
const path = require("path");

const TERMS_PATH = path.join(__dirname, "..", "terms.json");
const terms = JSON.parse(fs.readFileSync(TERMS_PATH, "utf-8"));

const bySubcategory = new Map();
for (const t of terms) {
  const sub = t.subcategory || "미분류";
  if (!bySubcategory.has(sub)) bySubcategory.set(sub, []);
  bySubcategory.get(sub).push(t);
}

for (const [, list] of bySubcategory) {
  const slugSet = new Set(list.map((t) => t.slug));
  const inboundCount = new Map(list.map((t) => [t.slug, 0]));
  for (const t of list) {
    for (const r of t.related || []) {
      if (slugSet.has(r)) inboundCount.set(r, (inboundCount.get(r) || 0) + 1);
    }
  }

  const sortedBySlug = [...list].sort(
    (a, b) => (inboundCount.get(b.slug) || 0) - (inboundCount.get(a.slug) || 0)
  );
  const n = sortedBySlug.length;
  const cut1 = Math.ceil(n / 3);
  const cut2 = Math.ceil((2 * n) / 3);

  sortedBySlug.forEach((t, idx) => {
    const inbound = inboundCount.get(t.slug) || 0;
    let difficulty;
    if (inbound === 0) difficulty = 3;
    else if (idx < cut1) difficulty = 1;
    else if (idx < cut2) difficulty = 2;
    else difficulty = 3;
    t.difficulty = difficulty;
  });

  const difficultyMap = new Map(list.map((t) => [t.slug, t.difficulty]));
  for (const t of list) {
    const prereqs = (t.related || [])
      .filter((r) => slugSet.has(r) && r !== t.slug)
      .filter((r) => (difficultyMap.get(r) || 3) < t.difficulty)
      .slice(0, 3);
    t.prerequisites = prereqs;
  }
}

fs.writeFileSync(TERMS_PATH, JSON.stringify(terms, null, 2) + "\n", "utf-8");
console.log(`updated ${terms.length} terms with difficulty/prerequisites`);
