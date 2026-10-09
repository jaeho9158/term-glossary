// 틀 항목 해석기: 이름·영문·별칭, 표기 차이, 동의어, 리다이렉트 스텁, 모호/공백 보고(픽스처만 사용)
const assert = require("assert");
const { norm, createResolver, normalizeBox, resolveBox, walkItems, formatReport } = require("../scripts/navbox/resolve.js");

const terms = [
  { slug: "hippocampus", title_ko: "해마", title_en: "Hippocampus", aliases: [] },
  { slug: "neuron", title_ko: "신경세포", title_en: "Neuron", aliases: ["뉴우런"] },
  { slug: "frontal-lobe", title_ko: "전두엽", title_en: "frontal lobe", aliases: ["이마엽"] },
  { slug: "mann-whitney", title_ko: "맨-휘트니 U 검정", title_en: "Mann-Whitney U test", aliases: [] },
  { slug: "reliability", title_ko: "신뢰도", title_en: "reliability", aliases: ["신뢰성"] },
  { slug: "reliability-eng", title_ko: "신뢰성 공학", title_en: "reliability engineering", aliases: ["신뢰성"] },
  { slug: "info-asym", title_ko: "정보 비대칭", title_en: "Information asymmetry", aliases: [] },
  { slug: "dup-a", title_ko: "중복", title_en: "dup a", aliases: [] },
  { slug: "dup-b", title_ko: "중복", title_en: "dup b", aliases: [] },
  { slug: "ssri-mech", title_ko: "SSRI(선택적세로토닌재흡수억제제) 작용기전", title_en: "SSRI mechanism", aliases: [] },
];
const stubs = { "asymmetric-information": { target: "info-asym", title: "정보의 비대칭" } };
const archive = new Set(["frontal-lobe"]);
const r = createResolver({ terms, archive, stubs });

assert.strictEqual(norm("맨–휘트니 U·검정"), norm("맨휘트니u검정"), "하이픈·가운뎃점·공백 무시");
assert.strictEqual(r.resolve({ label: "해마" }).slug, "hippocampus");
assert.strictEqual(r.resolve({ label: "hippocampus" }).slug, "hippocampus", "영문 제목");
assert.strictEqual(r.resolve({ label: "뉴우런" }).slug, "neuron", "별칭");
assert.strictEqual(r.resolve({ label: "뉴런" }).slug, "neuron", "동의어(뉴런=신경세포)");
assert.strictEqual(r.resolve({ label: "맨 휘트니 U 검정" }).slug, "mann-whitney");
assert.strictEqual(r.resolve({ label: "SSRI 작용기전" }).slug, "ssri-mech", "괄호를 뗀 제목");
assert.strictEqual(r.resolve({ label: "SSRI 기전" }).status, "none", "비슷하기만 한 이름은 추측하지 않는다");
assert.strictEqual(r.resolve({ label: "SSRI (선택적세로토닌재흡수억제제) 작용기전" }).slug, "ssri-mech");

// 등급
assert.deepStrictEqual([r.resolve({ label: "해마" }).status, r.resolve({ label: "이마엽" }).status], ["core", "archive"]);
assert.strictEqual(r.resolve({ label: "이마엽" }).slug, "frontal-lobe");

// 리다이렉트 스텁: 옛 이름 → 대상
assert.strictEqual(r.resolve({ label: "정보의 비대칭" }).slug, "info-asym");
assert.strictEqual(r.resolve({ label: "asymmetric information" }).slug, "info-asym");
assert.strictEqual(r.resolve({ label: "x", slug: "asymmetric-information" }).slug, "info-asym", "slug 고정도 스텁을 따라간다");

// 모호: 후보를 보고하고 고르지 않는다
const amb = r.resolve({ label: "중복" });
assert.strictEqual(amb.status, "ambiguous");
assert.deepStrictEqual(amb.candidates.map((c) => c.slug).sort(), ["dup-a", "dup-b"]);
assert.strictEqual(r.resolve({ label: "신뢰성" }).status, "ambiguous", "별칭이 두 용어에 걸리면 모호");
assert.strictEqual(r.resolve({ label: "신뢰성", slug: "reliability" }).slug, "reliability", "slug 로 고정하면 해결");

// 없음 / 없는 slug
assert.strictEqual(r.resolve({ label: "도파민" }).status, "none");
assert.strictEqual(r.resolve({ label: "x", slug: "no-such" }).status, "none");

// 상자 단위 보고
const box = { id: "t", title: "T", groups: [
  { label: "A", items: ["해마", "이마엽", "도파민", "중복", { label: "대뇌", sub: ["뉴런"] }] },
  { label: "B", groups: [{ label: "C", items: ["전두엽"] }] },
] };
const rep = resolveBox(box, r);
assert.deepStrictEqual(rep.counts, { items: 7, core: 2, archive: 2, none: 2, ambiguous: 1, uniqueCore: 2 });
assert.strictEqual(typeof box.groups[0].items[0], "object", "문자열 항목이 { label } 로 정규화됨");
const text = formatReport(rep);
assert.ok(text.includes("용어 없음") && text.includes("도파민") && text.includes("보관 등급만") && text.includes("dup-a(중복,core)"));
let n = 0; walkItems(box, () => n++); assert.strictEqual(n, 7, "sub 항목까지 방문");
assert.strictEqual(normalizeBox(normalizeBox(box)), box, "정규화는 멱등");
