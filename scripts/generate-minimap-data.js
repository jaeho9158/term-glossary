const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const terms = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "terms.json"), "utf-8"));

const bySubcategory = new Map();
for (const t of terms) {
  const sub = t.subcategory || "미분류";
  if (!bySubcategory.has(sub)) bySubcategory.set(sub, []);
  bySubcategory.get(sub).push(t);
}

const output = {};
for (const [sub, list] of bySubcategory) {
  const slugSet = new Set(list.map((t) => t.slug));
  const nodes = list.map((t) => ({ slug: t.slug, title: t.title_ko || t.title_en || t.slug }));
  const edgeSet = new Set();
  const edges = [];
  for (const t of list) {
    for (const relSlug of t.related || []) {
      if (!slugSet.has(relSlug) || relSlug === t.slug) continue;
      const key = [t.slug, relSlug].sort().join("|");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push([t.slug, relSlug]);
    }
  }
  output[sub] = { nodes, edges };
}

fs.writeFileSync(
  path.join(ROOT_DIR, "assets", "minimap-data.json"),
  JSON.stringify(output),
  "utf-8"
);
console.log(`generated ${Object.keys(output).length} subcategories`);
