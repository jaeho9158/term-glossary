// 오탐 감축 C단계: 분야 거리 규칙. 짧은 표제어(한글 2음절 이하, 또는 영문
// 한 단어로만 잡힌 것)의 분야가 문서의 상위 분야군과도, 그 인접 분야군과도
// 무관하면 결과에서 빼지 않고 distant로 강등한다(밑줄 없음, "다른 분야" 맨 아래). 의학 논문의 "여과"(화학공학)·"감마"(금융 옵션)·
// "제대"(군사) 같은 동음이의어가 대상이다.
const assert = require("assert");
const { filterDistantFieldMatches, estimateFieldGroups, fieldGroupOf, matchTerms, groupMatchesByField } = require("../assets/viewer.js");

const m = (slug, title_ko, cats, extra) => ({ slug, title_ko, title_en: "", categories: cats, viaHangul: true, ...extra });

// 분야군: CATEGORY_GROUPS를 재사용하되 한의학은 따로 뗀다
assert.strictEqual(fieldGroupOf("neuro"), fieldGroupOf("med"));
assert.notStrictEqual(fieldGroupOf("kmed"), fieldGroupOf("med"));
assert.notStrictEqual(fieldGroupOf("finance"), fieldGroupOf("med"));

// 의학 문서: 의학 용어 12개 + 동음이의어들
const medDoc = [
  ...Array.from({ length: 12 }, (_, i) => m(`med-${i}`, `의학용어${i}`, ["med"])),
  m("stat-1", "분산", ["stat"]),
  m("gamma-option", "감마", ["finance"]),
  m("echelon", "제대", ["military"]),
  m("qi-mechanism", "기기", ["kmed"]),
  m("filtration", "여과", ["chemeng"]),
  m("long-far", "중독관리센터", ["toxicol"]),
  m("long-unrelated", "포트폴리오이론", ["finance"]),
  m("multi", "응집", ["env", "med"]),
  m("food", "항산화", ["food"]),
];
{
  const groups = estimateFieldGroups(medDoc);
  assert.deepStrictEqual(groups, [fieldGroupOf("med")], "의학이 압도적");
  const kept = new Set(filterDistantFieldMatches(medDoc).filter((x) => !x.distant).map((x) => x.slug));
  assert.ok(kept.has("med-0"));
  assert.ok(kept.has("stat-1"), "연구 기초·방법은 어느 문서와도 가깝다");
  assert.ok(!kept.has("gamma-option"), "금융은 의학과 무관");
  assert.ok(!kept.has("echelon"), "군사는 의학과 무관");
  assert.ok(!kept.has("qi-mechanism"), "한의학은 의학 문서에서 인접으로 보지 않는다");
  assert.ok(!kept.has("filtration"), "공학은 의학의 인접 분야가 아니다");
  assert.ok(kept.has("long-unrelated"), "3음절 이상은 규칙 밖");
  assert.ok(kept.has("multi"), "categories 중 하나라도 가까우면 남긴다");
  assert.ok(kept.has("food"), "농림수산·식품은 의학의 인접 분야");
}

// 영문 한 단어로만 잡힌 경우도 짧은 표제어로 본다. 한글로 잡혔으면 길이로 판단.
{
  const doc = [
    ...Array.from({ length: 12 }, (_, i) => m(`med-${i}`, `의학용어${i}`, ["med"])),
    m("attachment", "애착", ["childdev"], { title_en: "Attachment", viaHangul: false }),
    m("treatment", "트리트먼트", ["gamestudy"], { title_en: "Treatment", viaHangul: false }),
    m("two-words", "진위감정법", ["artstudy"], { title_en: "Open Attribution", viaHangul: false }),
  ];
  const kept = new Set(filterDistantFieldMatches(doc).filter((x) => !x.distant).map((x) => x.slug));
  assert.ok(!kept.has("attachment"));
  assert.ok(!kept.has("treatment"), "한글 표제어가 길어도 영문 한 단어로만 잡혔으면 대상");
  assert.ok(kept.has("two-words"), "영문 두 단어는 대상 밖");
}

// 용어가 10개 미만이면 분야 추정을 믿을 수 없으므로 아무것도 빼지 않는다
{
  const small = [m("a", "의학", ["med"]), m("b", "감마", ["finance"])];
  assert.deepStrictEqual(filterDistantFieldMatches(small).filter((x) => !x.distant).map((x) => x.slug), ["a", "b"]);
}

// 한의학 문서에서는 한의학 용어가 남고, 의학은 인접 분야로 남는다
{
  const doc = [
    ...Array.from({ length: 8 }, (_, i) => m(`k-${i}`, `한의용어${i}`, ["kmed"])),
    ...Array.from({ length: 4 }, (_, i) => m(`n-${i}`, `신경용어${i}`, ["neuro"])),
    m("qi", "경기", ["kmed"]),
    m("med-short", "혈압", ["med"]),
    m("dance", "신체", ["dance"]),
  ];
  const kept = new Set(filterDistantFieldMatches(doc).filter((x) => !x.distant).map((x) => x.slug));
  assert.ok(kept.has("qi"));
  assert.ok(kept.has("med-short"));
  assert.ok(!kept.has("dance"));
}

// matchTerms 경로에서도 적용된다(텍스트·PDF 모드 공통)
{
  const terms = [
    ...Array.from({ length: 12 }, (_, i) => ({ slug: `med-${i}`, title_ko: `의학말${String.fromCharCode(0xac00 + i)}`, title_en: "", categories: ["med"] })),
    { slug: "gamma-option", title_ko: "감마", title_en: "Gamma", categories: ["finance"] },
  ];
  const text = terms.map((t) => t.title_ko).join(" ") + " 감마 파가 증가했다.";
  const result = matchTerms(text, terms);
  const gamma = result.find((x) => x.slug === "gamma-option");
  assert.ok(result.some((x) => x.slug === "med-0" && !x.distant));
  assert.ok(gamma && gamma.distant, "버리지 않고 강등 표시");
  assert.strictEqual(result[result.length - 1].slug, "gamma-option", "강등 용어는 맨 뒤");
}

// 강등 용어는 패널에서 "다른 분야" 그룹 맨 아래
{
  const list = [m("a", "가", ["med"]), m("d", "나", ["finance"], { distant: true }), m("o", "다", ["law"])];
  const g = groupMatchesByField(list, ["med"]);
  assert.deepStrictEqual(g.primary.map((x) => x.slug), ["a"]);
  assert.deepStrictEqual(g.others.map((x) => x.slug), ["o", "d"]);
}

// 2패스(thesis-toc 형태): 한의학 짧은 오탐 4개가 1차에서 한의학을 상위(4/10=0.4)로
// 올려 스스로를 살린다. 2차에서는 다른 상위 분야군이 뒷받침하지 않는 짧은
// 표제어를 빼고 다시 추정하므로 한의학이 상위에서 빠지고 이들이 강등된다.
{
  const doc = [
    ...Array.from({ length: 10 }, (_, i) => m(`med-${i}`, `의학용어${i}`, ["med"])),
    m("qi-a", "기기", ["kmed"]),
    m("qi-b", "기체", ["kmed"]),
    m("qi-c", "혈", ["kmed"]),
    m("qi-d", "경기", ["kmed"]),
  ];
  assert.deepStrictEqual(estimateFieldGroups(doc), [fieldGroupOf("med"), fieldGroupOf("kmed")], "1차는 오염됨");
  const res = filterDistantFieldMatches(doc);
  for (const s of ["qi-a", "qi-b", "qi-c", "qi-d"]) assert.ok(res.find((x) => x.slug === s).distant, s);
  assert.ok(res.filter((x) => x.slug.startsWith("med-")).every((x) => !x.distant));
}
// 인접 분야로 뒷받침되는 상위 분야군은 2차에서도 지킨다: 사회과학 상위 + 인문학 짧은 용어
{
  const doc = [
    ...Array.from({ length: 10 }, (_, i) => m(`law-${i}`, `법학용어${i}`, ["law"])),
    ...Array.from({ length: 4 }, (_, i) => m(`h-${i}`, `인${String.fromCharCode(0xac00 + i)}`, ["philo"])),
  ];
  assert.ok(filterDistantFieldMatches(doc).every((x) => !x.distant));
}

// 2차 추정은 1차 상위 분야군의 부분집합만(신규 승격 금지). 1차: 의학·공학(짧은 오탐 5)·
// 사회과학, 인문학은 3개 한도에 밀려 탈락. 2차에서 공학이 빠져도 인문학이 새로
// 올라오면 안 된다 — 올라오면 인문학 인접(예술·체육)의 짧은 용어가 되살아난다.
{
  const doc = [
    ...Array.from({ length: 10 }, (_, i) => m(`med-${i}`, `의학용어${i}`, ["med"])),
    ...Array.from({ length: 5 }, (_, i) => m(`eng-${i}`, `공${String.fromCharCode(0xac00 + i)}`, ["eng"])),
    ...Array.from({ length: 4 }, (_, i) => m(`law-${i}`, `법학용어${i}`, ["law"])),
    ...Array.from({ length: 4 }, (_, i) => m(`philo-${i}`, `철학용어${i}`, ["philo"])),
    m("art", "미술", ["artstudy"]),
  ];
  const first = estimateFieldGroups(doc);
  assert.ok(!first.includes(fieldGroupOf("philo")), "1차에 인문학 없음");
  assert.deepStrictEqual(estimateFieldGroups(doc, [fieldGroupOf("med")]), [fieldGroupOf("med")], "allowed 밖은 순위에 없음");
  const res = filterDistantFieldMatches(doc);
  assert.ok(res.find((x) => x.slug === "art").distant, "인문학이 2차에서 승격되면 안 됨");
  assert.ok(res.filter((x) => x.slug.startsWith("eng-")).every((x) => x.distant));
  assert.ok(res.filter((x) => x.slug.startsWith("law-")).every((x) => !x.distant));
}

console.log("field distance: all tests passed");
