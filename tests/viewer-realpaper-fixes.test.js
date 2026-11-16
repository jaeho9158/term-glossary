// 실제 논문 시험(2026-11-16)에서 나온 문제 4건의 회귀 테스트: 별칭·약어 매칭, 영어 복수형,
// 일상어·절 제목 오탐, electrooculography 표제어 오기.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const TM = require("../assets/term-match.js");
const { indexAliases, buildRow, computeEnglishCommon, englishGrade, CURATED_COMMON_WORDS } = require("../scripts/generate-viewer-index.js");

const slugsOf = (text, terms) => TM.matchTerms(text, terms).map((m) => m.slug).sort();

// 1. 별칭·약어: 인덱스에는 match_titles로 실리고, 약어는 대소문자·낱말 단위로만 잡힌다.
{
  const ltp = { slug: "ltp", title_ko: "장기강화", title_en: "Long-Term Potentiation", categories: ["neuro"], aliases: ["LTP", "AND", "장기 강화"] };
  const row = buildRow(ltp, { codeOf: () => 0, titleKoSet: new Set(["장기강화"]) });
  assert.deepStrictEqual(row[7], ["LTP"], "AND(영어 일반어)와 공백만 다른 별칭은 뺀다");
  const neuron = { slug: "neuron", title_ko: "신경세포(뉴런)", title_en: "Neuron", categories: ["neuro"], aliases: ["뉴런", "교세포", "x"] };
  assert.deepStrictEqual(indexAliases(neuron, new Set(["교세포"])), ["뉴런"], "다른 용어의 표제어와 같은 별칭은 뺀다");

  const decoded = TM.decodeViewerIndex({ categories: ["neuro"], terms: [row] })[0];
  const terms = [decoded, { slug: "and-gate", title_ko: "논리곱", title_en: "AND gate", categories: ["cs"] }];
  assert.deepStrictEqual(slugsOf("LTP를 측정했다.", terms), ["ltp"]);
  assert.deepStrictEqual(slugsOf("ltp 와 Ltp", terms), [], "약어 별칭은 대소문자가 같아야 한다");
  assert.deepStrictEqual(slugsOf("LTPs and AND CAN OR", terms), [], "낱말 일부·일반어는 잡지 않는다");
  const csf = { slug: "csf", title_ko: "뇌척수액", title_en: "Cerebrospinal Fluid", categories: ["neuro"], match_titles: ["CSF"] };
  assert.deepStrictEqual(slugsOf("CSF 검사", [csf]), ["csf"]);
  assert.deepStrictEqual(slugsOf("csf 검사", [csf]), []);
  const korean = { slug: "neuron", title_ko: "신경세포", title_en: "Neuron", categories: ["neuro"], match_titles: ["뉴런"] };
  assert.deepStrictEqual(slugsOf("뉴런이 발화한다.", [korean]), ["neuron"], "한글 별칭은 조사까지 처리된다");
}

// 2. 영어 복수형: 단수 표제어를 s/es/ies 복수로 잡는다(낱말 단위, 다어절은 마지막 낱말).
{
  const terms = [
    { slug: "neuron", title_ko: "신경세포", title_en: "Neuron", categories: ["neuro"] },
    { slug: "synapse", title_ko: "시냅스", title_en: "Synapse", categories: ["neuro"] },
    { slug: "cell-line", title_ko: "세포주", title_en: "Cell Line", categories: ["bio"] },
    { slug: "contrast-agent", title_ko: "조영제", title_en: "Contrast Agent", categories: ["med"] },
    { slug: "assay", title_ko: "분석법", title_en: "Assay", categories: ["bio"] },
    { slug: "eeg", title_ko: "뇌파검사", title_en: "EEG", categories: ["neuro"] },
  ];
  for (const [text, slug] of [["neurons are", "neuron"], ["many synapses", "synapse"], ["cell lines were used", "cell-line"], ["contrast agents", "contrast-agent"], ["assays", "assay"]]) {
    assert.deepStrictEqual(slugsOf(text, terms), [slug], text);
  }
  assert.deepStrictEqual(slugsOf("neuronsx synapsess", terms), [], "복수 어미 뒤에 글자가 더 있으면 잡지 않는다");
  assert.deepStrictEqual(slugsOf("eegs and EEGs", terms), [], "약어 복수는 다루지 않는다");
  const m = TM.matchTerms("synapses", terms)[0];
  assert.strictEqual(m.firstLength, "synapses".length, "복수형 전체가 하이라이트 범위");
}

// 3. 절 제목은 용어가 아니다. 일반 영어는 영문 키에서 빠진다. 문서 분야 밖의 영어 한 구절은 강등된다.
{
  const intro = { slug: "introduction", title_ko: "서주", title_en: "Introduction", categories: ["music"] };
  for (const heading of ["Introduction", "1. Introduction", "INTRODUCTION", "Methods", "Results and Discussion", "Conclusion"]) {
    assert.deepStrictEqual(slugsOf(`${heading}\n본문`, [intro]), [], heading);
  }
  const ko = { slug: "ko-intro", title_ko: "서론", title_en: "Prologue", categories: ["lit"] };
  const method = { slug: "ko-method", title_ko: "방법", title_en: "Means", categories: ["lit"] };
  assert.deepStrictEqual(slugsOf("Ⅰ. 서론\n2. 연구 방법\n결과\n고찰\n결론\n초록\n", [ko, method]), []);
  assert.deepStrictEqual(slugsOf("서론에서 방법을 논한다\n", [ko, method]), ["ko-intro", "ko-method"], "본문 속 낱말은 그대로");

  const terms = [
    { slug: "introduction", title_ko: "서주", title_en: "Introduction", categories: ["music"] },
    { slug: "population-parameter", title_ko: "모수", title_en: "Parameter", categories: ["stat"] },
    { slug: "sequence", title_ko: "수열", title_en: "Sequence", categories: ["math"] },
    { slug: "artifact", title_ko: "유물", title_en: "Artifact", categories: ["archaeo"] },
    { slug: "proportion", title_ko: "비례", title_en: "Proportion", categories: ["design"] },
  ];
  const en = computeEnglishCommon(terms);
  for (const t of terms) assert.strictEqual(englishGrade(t, en), 1, `${t.slug} 영문 키 제외`);
  assert.ok(["억제", "조합", "상호", "여기"].every((w) => CURATED_COMMON_WORDS.includes(w)));

  // 신경과학 문서(상위 분야군: 의학·생명)에서 영어로만 한두 번 나온 지리·스포츠 용어는 강등.
  const base = ["Neuron", "Synapse", "Hippocampus", "Thalamus", "Cerebellum", "Amygdala", "Dopamine", "Glutamate", "Neurotransmitter", "Optogenetics", "Engram"]
    .map((en2) => ({ slug: en2.toLowerCase(), title_ko: `ko-${en2}`, title_en: en2, categories: ["neuro"] }));
  const geo = { slug: "temporal-resolution", title_ko: "시간해상도", title_en: "Temporal Resolution", categories: ["geo"] };
  const sports = { slug: "reaction-time", title_ko: "반응시간", title_en: "Reaction Time", categories: ["sports"] };
  const text = "Neuron Synapse Hippocampus Thalamus Cerebellum Amygdala Dopamine Glutamate Neurotransmitter Optogenetics Engram. Temporal resolution and reaction time.";
  const res = TM.matchTerms(text, [...base, geo, sports]);
  assert.ok(res.length >= 12);
  for (const slug of ["temporal-resolution", "reaction-time"]) {
    const x = res.find((m) => m.slug === slug);
    assert.ok(x && x.distant, `${slug} 강등`);
  }
  assert.ok(!res.find((m) => m.slug === "neuron").distant);
}

// 4. electrooculography 표제어 오기 수정(원천 데이터).
{
  const hidden = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "viewer-hidden-terms.json"), "utf8"));
  assert.strictEqual(hidden.find((t) => t.slug === "electrooculography").title_ko, "안구전도검사");
  assert.ok(!hidden.some((t) => t.title_ko === "안전도검사"));
}

console.log("viewer real-paper fixes: all tests passed");
