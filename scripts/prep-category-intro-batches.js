// scripts/prep-category-intro-batches.js
// 집필 에이전트에게 줄 재료를 만든다. 카테고리 10개씩 묶어 배치 파일로 쪼갠다
// (98개를 개별 에이전트 98번 돌리는 대신, 한 에이전트가 10개씩 맡아 왕복 횟수를
// 줄인다 — 짧은 소개 문단이라 품질 저하 없이 묶어도 된다).
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT_DIR, ".category-intro-drafts");
const BATCH_SIZE = 10;

function run() {
  const { CATEGORY_LABELS, CATEGORY_ORDER, SUB_CATEGORY_ORDER } =
    require(path.join(ROOT_DIR, "assets", "category-data.js"));
  const terms = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "terms.json"), "utf8"));

  const countByCode = {};
  for (const t of terms) for (const c of t.categories || []) countByCode[c] = (countByCode[c] || 0) + 1;

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const items = CATEGORY_ORDER.map((code) => ({
    code,
    label: CATEGORY_LABELS[code],
    termCount: countByCode[code] || 0,
    subcategories: SUB_CATEGORY_ORDER[code] || [],
  }));

  let batchCount = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batchCount += 1;
    const batch = items.slice(i, i + BATCH_SIZE);
    fs.writeFileSync(
      path.join(OUT_DIR, `input-batch-${batchCount}.json`),
      JSON.stringify(batch, null, 1),
      "utf8"
    );
  }
  console.log(`배치 ${batchCount}개 생성 (${items.length}개 분야, 배치당 최대 ${BATCH_SIZE}개)`);
}

run();
