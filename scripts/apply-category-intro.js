// scripts/apply-category-intro.js
// .category-intro-drafts/output-batch-*.json (에이전트 산출물)을 검증 후
// assets/category-data.js의 CATEGORY_INTRO에 반영한다.
//
// usage: node scripts/apply-category-intro.js [--dry]
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const DRAFT_DIR = path.join(ROOT_DIR, ".category-intro-drafts");
const CATEGORY_DATA_PATH = path.join(ROOT_DIR, "assets", "category-data.js");

const MIN_LEN = 150;
const MAX_LEN = 320;

// item: {code, label, subcategories}, intro: 검증할 문자열
function validateIntro(item, intro) {
  if (typeof intro !== "string" || !intro.trim()) {
    return { ok: false, reason: "빈 값이거나 문자열이 아님" };
  }
  const text = intro.trim();
  if (text.length < MIN_LEN || text.length > MAX_LEN) {
    return { ok: false, reason: `길이 ${text.length}자 (허용 ${MIN_LEN}~${MAX_LEN})` };
  }
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return { ok: false, reason: "HTML 태그 포함 금지" };
  }
  const mentions = (item.subcategories || []).some((s) => text.includes(s));
  if (!mentions) {
    return { ok: false, reason: "하위분류 이름을 하나도 언급하지 않음" };
  }
  return { ok: true };
}

function loadItemsByCode() {
  const { CATEGORY_LABELS, CATEGORY_ORDER, SUB_CATEGORY_ORDER } = require(CATEGORY_DATA_PATH);
  const map = new Map();
  for (const code of CATEGORY_ORDER) {
    map.set(code, { code, label: CATEGORY_LABELS[code], subcategories: SUB_CATEGORY_ORDER[code] || [] });
  }
  return map;
}

// src: category-data.js 파일 전체 문자열, accepted: {[code]: string}
// 반환: 갱신된 src 문자열. src에 CATEGORY_INTRO가 이미 있으면 기존 값과 accepted를 병합,
// 없으면 새로 만든다. 두 경우 모두 marker(HOME_FEATURED_CATEGORIES 를 포함한 return문)를
// 올바르게 찾아야 한다 — 있는지 여부를 먼저 판별한 뒤 그에 맞는 marker로 검사해라.
function applyCategoryIntroToSource(src, accepted) {
  // 기존 CATEGORY_INTRO 블록 확인
  const existingMatch = /const CATEGORY_INTRO = (\{[\s\S]*?\n  \});\n\n/.exec(src);
  const existing = existingMatch ? JSON.parse(existingMatch[1]) : {};
  const merged = { ...existing, ...accepted };

  const block = `const CATEGORY_INTRO = ${JSON.stringify(merged, null, 2).replace(/^/gm, "  ").trim()};\n\n  `;

  // marker는 HOME_FEATURED_CATEGORIES 를 포함한 return문
  // CATEGORY_INTRO가 이미 있으면 marker는 CATEGORY_INTRO를 포함한 버전을 찾아야 함
  let marker, markerWithIntro;

  if (existingMatch) {
    // 이미 CATEGORY_INTRO가 있는 경우: return문에 CATEGORY_INTRO 가 포함되어 있음
    marker = "  return { CATEGORY_LABELS, CATEGORY_GROUPS, CATEGORY_ORDER, CATEGORY_ALIASES, SUB_CATEGORY_ORDER, CATEGORY_DESCRIPTIONS, HOME_FEATURED_CATEGORIES, CATEGORY_INTRO };";
    markerWithIntro = marker;
  } else {
    // CATEGORY_INTRO가 없는 경우: 새로 추가해야 함
    marker = "  return { CATEGORY_LABELS, CATEGORY_GROUPS, CATEGORY_ORDER, CATEGORY_ALIASES, SUB_CATEGORY_ORDER, CATEGORY_DESCRIPTIONS, HOME_FEATURED_CATEGORIES };";
    markerWithIntro = "  return { CATEGORY_LABELS, CATEGORY_GROUPS, CATEGORY_ORDER, CATEGORY_ALIASES, SUB_CATEGORY_ORDER, CATEGORY_DESCRIPTIONS, HOME_FEATURED_CATEGORIES, CATEGORY_INTRO };";
  }

  if (!src.includes(marker)) {
    throw new Error("category-data.js의 return 문 형태가 바뀌었습니다 — 스크립트를 다시 확인하세요.");
  }

  if (existingMatch) {
    // 기존 CATEGORY_INTRO 블록을 새 블록으로 교체
    src = src.slice(0, existingMatch.index) + block + src.slice(existingMatch.index + existingMatch[0].length);
  } else {
    // 새 CATEGORY_INTRO 블록을 삽입한 뒤 return문 업데이트
    src = src.replace(marker, `${block}${marker}`);
    src = src.replace(marker, markerWithIntro);
  }

  return src;
}

function main() {
  const dry = process.argv.includes("--dry");
  const itemsByCode = loadItemsByCode();

  const files = fs.existsSync(DRAFT_DIR)
    ? fs.readdirSync(DRAFT_DIR).filter((f) => /^output-batch-.*\.json$/.test(f))
    : [];

  const accepted = {};
  const rejected = [];
  for (const f of files) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(DRAFT_DIR, f), "utf8"));
    } catch (err) {
      console.error(`[skip-file] ${f}: JSON 파싱 실패 — ${err.message}`);
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : [];
    for (const entry of list) {
      const item = itemsByCode.get(entry.code);
      if (!item) { rejected.push([entry.code, "존재하지 않는 카테고리 코드"]); continue; }
      const r = validateIntro(item, entry.intro);
      if (!r.ok) { rejected.push([entry.code, r.reason]); continue; }
      accepted[entry.code] = entry.intro.trim();
    }
  }

  const missing = [...itemsByCode.keys()].filter((c) => !accepted[c]);
  console.log(`승인 ${Object.keys(accepted).length} / 반려 ${rejected.length} / 누락 ${missing.length}`);
  for (const [code, reason] of rejected) console.log(`  [반려] ${code}: ${reason}`);
  if (missing.length) console.log(`  [누락] ${missing.join(", ")}`);

  if (dry || !Object.keys(accepted).length) {
    console.log(dry ? "(dry run — 파일 미변경)" : "반영할 항목 없음.");
    return;
  }

  let src = fs.readFileSync(CATEGORY_DATA_PATH, "utf8");
  src = applyCategoryIntroToSource(src, accepted);

  fs.writeFileSync(CATEGORY_DATA_PATH, src, "utf8");
  console.log(`category-data.js 갱신 완료 (CATEGORY_INTRO ${Object.keys(accepted).length}개)`);
}

if (require.main === module) main();
module.exports = { validateIntro, applyCategoryIntroToSource };
