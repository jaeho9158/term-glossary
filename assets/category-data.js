(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = data;
  } else {
    Object.assign(root, data);
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  const CATEGORY_LABELS = {
    stat: "통계",
    method: "연구방법론",
    tool: "측정·도구",
    ethics: "윤리·출판",
    physchem: "물리학·화학",
    bioearth: "생물학·지구과학",
    neuro: "뇌과학·신경과학",
    medhealth: "의학·보건",
    psych: "심리학",
    socialecon: "사회과학·경제학",
    eng: "공학",
    cs: "컴퓨터과학·AI",
    math: "수학",
  };

  const CATEGORY_ORDER = ["stat", "method", "tool", "ethics", "physchem", "bioearth", "neuro", "medhealth", "psych", "socialecon", "eng", "cs", "math"];

  const CATEGORY_DESCRIPTIONS = {
    stat: "평균, 분산, 유의확률처럼 데이터를 요약하고 가설을 검정하는 데 쓰이는 통계 개념을 다룹니다. 논문의 '결과' 섹션에 나오는 숫자와 검정 방법을 해석하려는 사람이 주로 찾습니다.",
    method: "연구를 어떻게 설계하고 진행하는지에 관한 용어를 모았습니다. 종단연구, 질적연구, 메타분석처럼 '이 연구가 어떤 방식으로 이뤄졌는지'를 이해하는 데 필요한 개념입니다.",
    tool: "설문 척도나 신뢰도·타당도처럼 무언가를 측정하기 위한 도구와 그 품질을 평가하는 개념을 다룹니다. 설문 조사나 실험 도구를 직접 설계·평가해야 하는 사람에게 유용합니다.",
    ethics: "동료심사, 출판편향, 이중맹검처럼 연구가 공정하고 신뢰할 수 있게 이뤄지고 발표되도록 하는 절차와 원칙을 다룹니다. 논문의 신뢰성을 판단하려는 독자가 찾아봅니다.",
    physchem: "물리학과 화학의 기초 개념(엔트로피, 촉매, 동위원소 등)을 다룹니다. 자연과학 논문을 읽다가 낯선 물리·화학 용어를 만난 비전공자를 위한 카테고리입니다.",
    bioearth: "생명과학과 지구과학 전반의 용어(유전자 발현, 생물다양성, 판구조론 등)를 모았습니다. 생물학·환경·지구과학 관련 논문이나 뉴스를 이해하려는 사람에게 도움이 됩니다.",
    neuro: "뇌와 신경계의 구조·기능, fMRI·EEG 같은 측정 기법을 다룹니다. 뇌과학 연구나 인지과학 논문을 읽는 학생·연구자가 자주 찾는 카테고리입니다.",
    medhealth: "임상시험, 역학, 유병률처럼 의학·보건 연구에서 쓰이는 용어를 모았습니다. 의학 논문이나 건강 관련 통계 기사를 읽을 때 나오는 개념을 확인하려는 사람에게 유용합니다.",
    psych: "인지편향, 자기효능감처럼 사람의 생각과 행동을 연구할 때 쓰이는 심리학 개념을 다룹니다. 심리학 논문이나 교양서를 읽는 사람이 주로 찾습니다.",
    socialecon: "지니계수, 외부효과처럼 사회 현상과 경제를 분석하는 데 쓰이는 사회과학·경제학 개념을 모았습니다. 정책·경제 관련 논문이나 보고서를 이해하려는 사람에게 도움이 됩니다.",
    eng: "유한요소해석, 신호대잡음비처럼 공학 설계·해석에 쓰이는 개념을 다룹니다. 공학 논문이나 기술 문서를 읽는 학생·실무자를 위한 카테고리입니다.",
    cs: "머신러닝, 신경망, 자연어처리처럼 컴퓨터과학·인공지능 분야의 핵심 개념을 다룹니다. AI 관련 논문이나 기사를 이해하려는 사람이 가장 많이 찾는 카테고리 중 하나입니다.",
    math: "논문 전반에서 배경 지식으로 등장하는 수학 개념을 다룹니다. 통계·공학·CS 용어를 이해하는 데 필요한 기초를 보완하려는 사람에게 유용합니다.",
  };

  const SUB_CATEGORY_RULES = {
    "stat":{
        "기초통계":[
            "variance",
            "standard-deviation",
            "standard-error",
            "normal-distribution",
            "outlier",
            "confidence-interval",
            "effect-size",
            "odds-ratio",
        ],
        "가설검정":[
            "p-value",
            "null-hypothesis",
            "significance-level",
            "type-1-error",
            "type-2-error",
            "statistical-power"
        ],
        "분석기법":[
            "regression",
            "anova",
            "t-test",
            "chi-square-test",
            "factor-analysis",
            "difference-in-differences"
        ]
    },
    "method":{
        "연구설계":[
            "longitudinal-study",
            "cross-sectional-study",
            "case-study",
            "case-control-study"
        ],
        "방법론 유형":[
            "qualitative-research",
            "mixed-methods",
            "grounded-theory"
        ],
        "문헌·분석":[
            "meta-analysis",
            "literature-review",
            "systematic-review",
            "content-analysis",
            "intention-to-treat"
        ]
    },
    "tool":{
        "측정척도":[
            "likert-scale",
            "construct"
        ],
        "신뢰도·타당도":[
            "validity",
            "reliability"
        ],
        "세포 배양·분자생물학":[
            "primary-cell-culture",
            "dissection-dissociation",
            "cell-line",
            "conditioned-medium",
            "cytokine",
            "central-dogma",
            "reverse-transcription"
        ],
        "웨스턴 블롯·항체 기법":[
            "bradford-assay",
            "sds-page",
            "disulfide-bond",
            "loading-control",
            "housekeeping-gene",
            "epitope",
            "primary-secondary-antibody",
            "chemiluminescence",
            "blotting-technique-naming",
            "blocking-western-blot",
            "protein-transfer",
            "hrp-enzyme",
            "transcription",
            "translation"
        ]
    },
    "ethics":{
        "연구윤리":[
            "blinding",
            "double-blind",
            "placebo"
        ],
        "논문출판":[
            "peer-review",
            "publication-bias",
            "reproducibility"
        ]
    },
    "physchem":{
        "물리학":[
            "quantum-entanglement",
            "entropy",
            "spectroscopy"
        ],
        "화학":[
            "catalyst",
            "isotope",
            "polymer",
            "phase-transition",
            "chirality"
        ]
    },
    "bioearth":{
        "생물학":[
            "gene-expression",
            "crispr",
            "phylogenetics",
            "biodiversity",
            "symbiosis"
        ],
        "지구과학":[
            "plate-tectonics",
            "carbon-cycle",
            "ecosystem-service"
        ]
    },
    "neuro":{
        "뇌 구조":[
            "synapse",
            "amygdala",
            "neurotransmitter"
        ],
        "뇌 기능":[
            "neuroplasticity",
            "cognitive-load",
            "neurodegeneration"
        ],
        "측정 기법":[
            "fmri",
            "eeg"
        ],
        "실험모델·행동검사":[
            "handling-non-aversive",
            "open-field-test",
            "elevated-plus-maze",
            "light-dark-box-test",
            "marble-burying-test",
            "forced-swim-test",
            "tail-suspension-test",
            "sucrose-preference-test",
            "conditioned-place-preference",
            "y-maze-test",
            "morris-water-maze",
            "novel-object-recognition-test",
            "passive-avoidance-test",
            "social-interaction-test",
            "observational-fear",
            "allogrooming",
            "freezing-behavior",
            "avatar-3d-behavior-analysis",
            "aav-lentivirus-vector",
            "perfusion-fixation",
            "intrinsic-optical-signal",
            "muscimol",
            "cre-lox-system",
            "conditional-knockout-gene",
            "stereotaxic-coordinates",
            "balance-beam-test",
            "footprint-analysis",
            "grip-strength-test",
            "inverted-screen-test",
            "ladder-rung-test",
            "pole-test",
            "wire-suspension-test",
            "burrowing-test",
            "hargreaves-test",
            "nest-building-test",
            "hot-cold-plate-test",
            "tail-flick-test",
            "temperature-preference-test",
            "voluntary-wheel-running",
            "von-frey-test",
            "object-placement-test",
            "radial-arm-water-maze",
            "water-t-maze",
            "wild-type-transgenic",
            "vehicle-control",
            "ad-libitum",
            "acquisition-retention",
            "innate-curiosity"
        ]
    },
    "medhealth":{
        "임상연구":[
            "clinical-trial",
            "cohort-study",
            "rct"
        ],
        "역학":[
            "epidemiology",
            "incidence-rate",
            "prevalence",
            "comorbidity"
        ],
        "의학기초":[
            "biomarker"
        ]
    },

    "psych":{
        "인지심리":[
            "meta-cognition",
            "cognitive-bias",
            "confirmation-bias",
            "cognitive-load"
        ],
        "발달·성격":[
            "attachment-theory",
            "self-efficacy"
        ],
        "사회심리":[
            "social-desirability-bias"
        ],
        "임상·신경심리":[
            "neuroplasticity",
            "neurotransmitter",
            "neurodegeneration"
        ]
    },
    "socialecon":{
        "경제학":[
            "gini-coefficient",
            "externality",
            "social-capital"
        ],
        "계량경제학":[
            "endogeneity",
            "instrumental-variable",
            "panel-data",
            "difference-in-differences"
        ],
        "사회과학":[
            "intervention",
            "content-analysis"
        ]
    },
    "eng":{
        "해석·설계":[
            "finite-element-analysis",
            "simulation"
        ],
        "제어공학":[
            "feedback-control"
        ],
        "신호처리":[
            "signal-to-noise-ratio"
        ],
        "재료공학":[
            "fatigue-failure",
            "polymer"
        ],
        "에너지":[
            "renewable-energy",
            "life-cycle-assessment"
        ],
        "시스템공학":[
            "redundancy"
        ]
    },
    "cs":{
        "머신러닝 기법":[
            "machine-learning",
            "overfitting",
            "cross-validation",
            "gradient-descent",
            "reinforcement-learning"
        ],
        "딥러닝 알고리즘":[
            "neural-network",
            "transformer",
            "attention-mechanism",
            "convolutional-neural-network"
        ],
        "자연어처리":[
            "natural-language-processing",
            "embedding"
        ],
        "데이터 처리":[
            "data-augmentation"
        ],
        "AI 윤리":[
            "algorithm-bias"
        ]
    }
  };

  return { CATEGORY_LABELS, CATEGORY_ORDER, SUB_CATEGORY_RULES, CATEGORY_DESCRIPTIONS };
});
