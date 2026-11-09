// 아래·위 첨자 회귀 검사: 용어 페이지 본문·그림에 첨자가 글자 그대로(H2O, x^2, V_d, Ca2+, ×10-3, _{…}) 남지 않게 한다.
// 논문 인용(term-extras:usage 블록)은 원문 그대로 두므로 검사하지 않는다.
// 첨자가 아닌 것이 맞는 예(식별자·전극 이름·도메인 이름·연산자 표기 설명)는 ALLOW에 slug와 글자로 적는다.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "terms");
const ALLOW = {
  "dublin-core": ["oai_dc"], // OAI-PMH 형식 이름
  eeg: ["O2"], // 10-20 전극 위치
  "immunoglobulin-structure": ["CH2", "CH3"], // 불변 영역 도메인 이름
  "four-arithmetic-operations": ["*"], // ^ 연산자 결합 순서를 설명하는 쪽
};
const COMMON = new Set("H2O CO2 O2 N2 H2 CH4 NH3 NO2 N2O SO2 SO3 O3 H2SO4 HNO3 H3PO4 NaHCO3 CaCO3 C6H12O6 H2O2 CO3 HCO3 NO3 PO4 SO4 NH4 Cl2 NaOH Fe2O3 Al2O3 SiO2 C2H5OH CH3COOH C2H4 C2H6 C3H8 MgSO4 CaCl2 MgCl2 CuSO4 H2S CH3 CH2 TiO2 P2O5 K2O Fe3O4 FADH2 H2CO3 CaSO4 Na2CO3 KNO3 NH4NO3 UO2 MnO2 CS2 CCl4 CHCl3 SF6 CO2e".split(" "));
const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

function findLeaks(text) {
  const out = [];
  const RULES = [
    /\{(?:sub|sup|frac):[^}]*\}|\\frac\{|[A-Za-zα-ωΑ-Ω)\]]_\{[^}]{1,12}\}|[A-Za-z0-9α-ωΑ-Ω)\]]\^\{[^}]{1,12}\}/g,
    /(?<![\w^])[A-Za-z0-9α-ωΑ-Ω)\]]{1,6}\^\(?[-−+]?[0-9A-Za-z]{1,4}\)?(?![{\w])/g,
    /(?<![\w/.:@-])[A-Za-zα-ωΑ-Ω]{1,3}_[A-Za-z0-9]{1,3}(?![\w_])/g,
    /(?<=(?:\d|[/·])\s?)(?:m|cm|mm|km|μm|nm|s|kg|g|mol|ha|yr)(?:2|3|-1|-2|-3|−1|−2|−3)(?![\w.])/g,
    /×\s?10[-−]\d{1,2}(?![\d.,])/g,
  ];
  for (const re of RULES) for (const m of text.matchAll(re)) {
    if (/https?:|www\./.test(text.slice(Math.max(0, m.index - 40), m.index))) continue;
    out.push(m[0]);
  }
  for (const m of text.matchAll(/(?<![A-Za-z0-9_\-./])((?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*){1,8})(?![A-Za-z0-9_\-])/g)) if (COMMON.has(m[1]) && /\d/.test(m[1])) out.push(m[1]);
  return out;
}

test("용어 페이지에 첨자가 글자 그대로 남지 않는다(논문 인용 제외)", () => {
  const bad = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".html"))) {
    const slug = f.slice(0, -5);
    const allow = ALLOW[slug] || [];
    if (allow.includes("*")) continue;
    let h = fs.readFileSync(path.join(DIR, f), "utf8");
    const m0 = h.match(/<main[\s\S]*<\/main>/);
    if (!m0) continue;
    h = m0[0].replace(/<!-- term-extras:usage:start -->[\s\S]*?<!-- term-extras:usage:end -->/g, " ")
      .replace(/<(script|style|code|pre|kbd|samp|math|title|desc)\b[\s\S]*?<\/\1>/g, " ").replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(su[bp])\b[^>]*>[\s\S]*?<\/\1>/g, "⁣").replace(/<tspan[^>]*(?:baseline-shift|dy=)[^>]*>[^<]*<\/tspan>/g, "⁣")
      .replace(/<[^>]+>/g, " ");
    for (const t of findLeaks(decode(h))) if (!allow.includes(t)) bad.push(`${slug}: ${t}`);
  }
  assert.deepStrictEqual(bad, [], `첨자가 글자로 남은 곳 ${bad.length}개:\n${bad.slice(0, 40).join("\n")}`);
});

test("검사 규칙 자체: 첨자 글자는 잡고 렌더된 첨자·식별자는 넘긴다", () => {
  assert.deepStrictEqual(findLeaks("물은 H2O, V_d, x^2, 5 m2, ×10-3 배, Z_{2}"), ["Z_{2}", "x^2", "V_d", "m2", "×10-3", "H2O"]);
  assert.deepStrictEqual(findLeaks("max_iter http://a.org/x_y H2N2 B2B"), []);
});
