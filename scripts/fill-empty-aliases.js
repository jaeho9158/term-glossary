const fs = require("fs");
const path = require("path");

const TERMS_PATH = path.join(__dirname, "..", "terms.json");

// 확신도가 높은(실제로 흔히 쓰이는) 별칭만 채움. 나머지는 빈 배열로 유지.
const ALIASES = {
  "effect-size": ["ES"],
  "working-memory": ["WM"],
  "inter-rater-reliability": ["IRR"],
  "central-limit-theorem": ["CLT"],
  "evidence-based-medicine": ["EBM"],
  "likelihood-ratio": ["LR"],
  "functional-connectivity": ["FC"],
  "open-access-publishing": ["OA"],
  "finite-state-machine": ["FSM"],
  "regular-expression": ["정규식", "regex"],
  "credit-taxonomy": ["CRediT"],
  "clinical-practice-guidelines": ["CPG"],
  "number-needed-to-harm": ["NNH"],
  "loss-to-follow-up": ["LTFU"],
  "focus-group-interview": ["FGI"],
  "polymer": ["중합체"],
  "groupthink": ["집단순응사고"],
  "stratified-sampling": ["층화추출"],
  "viscosity": ["점성"],
  "permafrost": ["영구동토층"],
  "open-science-fair-principles": ["FAIR"],
  "impact-factor-h-index": ["IF"],
  "excitatory-inhibitory-balance": ["E/I 균형"],
  "data-availability-statement": ["DAS"],
  "ground-truth": ["실측값"],
  "publication-bias": ["출간편향"],
  "grounded-theory": ["근거이론법"],
  "carbon-cycle": ["탄소 순환"],
  "synapse": ["신경연접"],
  "incidence-rate": ["발병률"],
  "path-dependence": ["경로 의존성"],
  "meiosis": ["감수 분열"],
  "enzyme": ["효소단백질"],
  "predatory-journal": ["약탈적 저널"],
};

function main() {
  const terms = JSON.parse(fs.readFileSync(TERMS_PATH, "utf8"));

  let filled = 0;
  let leftEmpty = 0;

  for (const term of terms) {
    if (Array.isArray(term.aliases) && term.aliases.length > 0) continue;

    if (ALIASES[term.slug]) {
      term.aliases = ALIASES[term.slug];
      filled += 1;
    } else {
      term.aliases = [];
      leftEmpty += 1;
    }
  }

  fs.writeFileSync(TERMS_PATH, JSON.stringify(terms, null, 2) + "\n", "utf8");
  console.log(`별칭 채움: ${filled}개, 확신 부족으로 빈 배열 유지: ${leftEmpty}개`);
}

main();
