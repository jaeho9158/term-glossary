// scripts/generate-translate-glossary.js
// terms.json → 번역 함수가 프롬프트에 붙일 압축 용어표.
// 37,000개를 매 요청에 보내지 않고, 함수가 원문에 등장하는 항목만 골라 쓴다.
// 영문 표제어가 3자 이상이고 ASCII로만 된 항목만 넣는다(한글·기호 표제어는 매칭 불가).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "supabase", "functions", "translate", "glossary.json");

const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "terms.json"), "utf8"));
const map = {};
let skipped = 0;
for (const t of terms) {
  const en = String(t.title_en || "").trim();
  if (en.length < 3 || !/^[\x20-\x7E]+$/.test(en)) { skipped++; continue; }
  const key = en.toLowerCase();
  // 같은 영문 표제어가 여러 분야에 있으면 먼저 나온 것을 유지한다.
  if (!(key in map)) map[key] = t.title_ko;
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(map), "utf8");
console.log(`glossary.json: ${Object.keys(map).length}개 (제외 ${skipped})`);
