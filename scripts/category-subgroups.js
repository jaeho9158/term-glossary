// scripts/category-subgroups.js
// 카테고리 페이지의 하위분류 섹션화. 하위분류당 용어가 FOLD_THRESHOLD 미만이면
// "기타"로 접어, 표류하는 1~2개짜리 하위분류가 목록을 어지럽히지 않게 한다.
const FOLD_THRESHOLD = 3;
const OTHER_LABEL = "기타";

function buildSubcategorySections(terms, subOrder) {
  const bySub = new Map();
  for (const t of terms) {
    const key = t.subcategory && subOrder.includes(t.subcategory) ? t.subcategory : OTHER_LABEL;
    if (!bySub.has(key)) bySub.set(key, []);
    bySub.get(key).push(t);
  }

  const sections = [];
  const otherOverflow = bySub.has(OTHER_LABEL) ? bySub.get(OTHER_LABEL).slice() : [];

  for (const name of subOrder) {
    const list = bySub.get(name);
    if (!list || !list.length) continue;
    if (list.length < FOLD_THRESHOLD) {
      otherOverflow.push(...list);
      continue;
    }
    sections.push({ name, terms: list.slice() });
  }

  if (otherOverflow.length) {
    sections.push({ name: OTHER_LABEL, terms: otherOverflow });
  }

  for (const s of sections) {
    s.terms.sort((a, b) => a.title_ko.localeCompare(b.title_ko, "ko"));
  }

  return sections;
}

module.exports = { buildSubcategorySections, FOLD_THRESHOLD, OTHER_LABEL };
