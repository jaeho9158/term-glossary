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

  return { CATEGORY_LABELS, CATEGORY_ORDER, SUB_CATEGORY_RULES };
});
