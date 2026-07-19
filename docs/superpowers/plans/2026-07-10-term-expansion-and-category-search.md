# 용어 확장 및 카테고리·검색 UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 논문용어사전 사이트를 12개 용어에서 100개(기존 12 + 신규 88) 용어로 확장하고, 홈페이지를 카테고리별 섹션 + 클라이언트 사이드 검색 UX로 재구성한다.

**Architecture:** 용어 메타데이터는 `terms.json`(정적 데이터 파일)에 저장한다. `index.html`은 빌드 없이 `assets/site.js`가 `terms.json`을 fetch해 카테고리 섹션과 검색 결과를 렌더링하고, `<noscript>` 블록으로 JS 없는 환경(크롤러)에서도 전체 목록이 보이게 한다. 각 용어 상세 페이지는 기존 12개와 동일한 정적 HTML 템플릿을 따르는 개별 파일이다(`terms/<slug>.html`).

**Tech Stack:** 순수 HTML/CSS/vanilla JS, 빌드 도구 없음, `npx serve`로 로컬 프리뷰, GitHub Pages 배포.

이 사이트는 자동화 테스트 프레임워크가 없는 정적 콘텐츠 사이트다. 이 계획의 "테스트"는 (a) `node -e`로 JSON 파싱/스키마 검증, (b) 브라우저 프리뷰로 렌더링·검색·링크 동작을 직접 확인하는 것으로 대체한다.

---

## 신규 용어 88개 목록

카테고리 코드: `stat`(통계) `method`(연구방법론) `tool`(측정·도구) `ethics`(윤리·출판) `physchem`(물리학·화학) `bioearth`(생물학·지구과학) `neuro`(뇌과학·신경과학) `medhealth`(의학·보건) `psych`(심리학) `socialecon`(사회과학·경제학) `eng`(공학) `cs`(컴퓨터과학·AI)

각 항목은 `slug | title_ko | title_en | categories | 콘텐츠 브리프(한 줄 정의 + 핵심 포인트)`. 실제 상세 페이지 작성 시 이 브리프를 바탕으로 기존 12개 페이지와 동일한 구성(정의box/쉬운풀이/논문예문/주의할점/관련용어)으로 살을 붙인다.

### 방법론 계열 (24개)

1. `variance` | 분산 | Variance | stat | 데이터가 평균에서 얼마나 퍼져 있는지 나타내는 수치. 표준편차는 분산의 제곱근.
2. `standard-deviation` | 표준편차 | Standard Deviation | stat | 분산에 제곱근을 씌워 원래 단위로 되돌린 산포도 지표.
3. `standard-error` | 표준오차 | Standard Error | stat | 표본평균이 모평균에서 얼마나 벗어날 수 있는지를 나타내는 추정 오차.
4. `null-hypothesis` | 귀무가설 | Null Hypothesis | stat,method | "차이가 없다"를 기본 전제로 놓고 통계적으로 기각을 시도하는 가설.
5. `type-1-error` | 1종 오류 | Type I Error | stat | 실제로는 차이가 없는데 있다고 잘못 판단하는 오류(false positive).
6. `type-2-error` | 2종 오류 | Type II Error | stat | 실제로 차이가 있는데 없다고 놓치는 오류(false negative).
7. `statistical-power` | 검정력 | Statistical Power | stat,method | 실제로 존재하는 효과를 통계적으로 검출해낼 확률.
8. `anova` | 분산분석 | ANOVA | stat | 세 개 이상 집단의 평균을 동시에 비교하는 통계 기법.
9. `t-test` | t검정 | t-test | stat | 두 집단의 평균 차이가 우연인지 통계적으로 검정하는 방법.
10. `chi-square-test` | 카이제곱검정 | Chi-square Test | stat | 범주형 변수 간의 연관성을 검정하는 방법.
11. `outlier` | 이상치 | Outlier | stat,tool | 다른 데이터와 크게 동떨어진 값으로, 분석 결과를 왜곡할 수 있는 관측치.
12. `normal-distribution` | 정규분포 | Normal Distribution | stat | 평균을 중심으로 좌우 대칭인 종 모양 확률분포.
13. `longitudinal-study` | 종단연구 | Longitudinal Study | method | 동일 대상을 시간에 따라 반복 관찰하며 변화를 추적하는 연구.
14. `cross-sectional-study` | 횡단연구 | Cross-sectional Study | method | 한 시점에서 여러 대상을 조사해 비교하는 연구.
15. `case-study` | 사례연구 | Case Study | method | 특정 개인·집단·사건을 깊이 있게 분석하는 연구 방법.
16. `mixed-methods` | 혼합연구방법 | Mixed Methods | method | 양적연구와 질적연구를 함께 사용해 서로의 한계를 보완하는 연구 설계.
17. `literature-review` | 문헌고찰 | Literature Review | method | 기존 연구 결과를 체계적으로 정리·평가하는 작업.
18. `systematic-review` | 체계적 문헌고찰 | Systematic Review | method | 사전에 정한 엄격한 절차로 관련 연구를 빠짐없이 검색·평가하는 문헌고찰.
19. `blinding` | 눈가림법 | Blinding | method,tool | 연구자나 참가자가 배정 정보를 모르게 해 편향을 줄이는 기법.
20. `placebo` | 위약 | Placebo | method,medhealth | 실제 효과가 없는 가짜 처치로, 심리적 효과와 실제 효과를 구분하는 데 쓰인다.
21. `validity` | 타당도 | Validity | tool,method | 측정 도구가 측정하려는 개념을 실제로 얼마나 정확히 재는지의 정도.
22. `reliability` | 신뢰도 | Reliability | tool,method | 같은 측정을 반복했을 때 결과가 얼마나 일관되게 나오는지의 정도.
23. `peer-review` | 동료심사 | Peer Review | ethics | 같은 분야 전문가들이 논문의 질과 타당성을 검토하는 출판 전 절차.
24. `publication-bias` | 출판편향 | Publication Bias | ethics,stat | 유의한 결과가 나온 연구가 그렇지 않은 연구보다 더 잘 출판되는 경향.

### 물리학·화학 (8개)

25. `quantum-entanglement` | 양자얽힘 | Quantum Entanglement | physchem | 두 입자가 멀리 떨어져도 한쪽 상태가 다른 쪽 상태를 즉시 결정짓는 양자역학 현상.
26. `catalyst` | 촉매 | Catalyst | physchem | 자신은 소모되지 않으면서 화학반응 속도를 빠르게 하는 물질.
27. `entropy` | 엔트로피 | Entropy | physchem | 계의 무질서한 정도를 나타내는 열역학적 척도.
28. `isotope` | 동위원소 | Isotope | physchem | 양성자 수는 같지만 중성자 수가 달라 질량이 다른 같은 원소.
29. `spectroscopy` | 분광법 | Spectroscopy | physchem,tool | 물질이 빛을 흡수·방출하는 패턴을 분석해 성분을 알아내는 기법.
30. `polymer` | 고분자 | Polymer | physchem | 작은 단위체가 반복적으로 연결되어 만들어진 거대 분자.
31. `phase-transition` | 상전이 | Phase Transition | physchem | 물질이 고체·액체·기체 등 상태를 바꾸는 현상.
32. `chirality` | 카이랄성 | Chirality | physchem | 분자가 거울상과 겹쳐지지 않는 비대칭 구조적 성질.

### 생물학·지구과학 (8개)

33. `gene-expression` | 유전자 발현 | Gene Expression | bioearth | DNA에 담긴 유전정보가 실제 단백질로 만들어지는 과정.
34. `crispr` | 크리스퍼 | CRISPR | bioearth,tool | 특정 DNA 서열을 정밀하게 자르고 편집할 수 있는 유전자 가위 기술.
35. `phylogenetics` | 계통발생학 | Phylogenetics | bioearth | 생물 종 사이의 진화적 유연관계를 나무 형태로 분석하는 학문.
36. `biodiversity` | 생물다양성 | Biodiversity | bioearth | 특정 생태계 안에 존재하는 생물종의 다양함 정도.
37. `ecosystem-service` | 생태계서비스 | Ecosystem Service | bioearth,socialecon | 생태계가 인간에게 제공하는 정화, 식량, 기후조절 등의 혜택.
38. `plate-tectonics` | 판구조론 | Plate Tectonics | bioearth | 지구 표면이 여러 판으로 나뉘어 이동한다는 지질학 이론.
39. `carbon-cycle` | 탄소순환 | Carbon Cycle | bioearth | 탄소가 대기·바다·생물·땅 사이를 순환하는 과정.
40. `symbiosis` | 공생 | Symbiosis | bioearth | 서로 다른 두 생물종이 밀접하게 상호작용하며 살아가는 관계.

### 뇌과학·신경과학 (8개)

41. `neuroplasticity` | 신경가소성 | Neuroplasticity | neuro | 뇌가 경험에 따라 신경 연결을 재조직하는 능력.
42. `synapse` | 시냅스 | Synapse | neuro | 신경세포 사이에서 신호를 전달하는 접합 부위.
43. `fmri` | 기능적자기공명영상 | fMRI | neuro,tool | 뇌 혈류 변화를 측정해 활성화된 부위를 영상으로 보여주는 기법.
44. `eeg` | 뇌파검사 | EEG | neuro,tool | 두피에서 뇌의 전기적 활동을 기록하는 측정 방법.
45. `neurotransmitter` | 신경전달물질 | Neurotransmitter | neuro,medhealth | 시냅스에서 신경세포 간 신호를 전달하는 화학물질.
46. `cognitive-load` | 인지부하 | Cognitive Load | neuro,psych | 특정 과제를 수행할 때 작업기억에 걸리는 정신적 부담의 양.
47. `amygdala` | 편도체 | Amygdala | neuro | 공포와 감정 처리에 핵심적인 역할을 하는 뇌 구조.
48. `neurodegeneration` | 신경퇴행 | Neurodegeneration | neuro,medhealth | 신경세포가 점차 손상되어 기능을 잃어가는 과정.

### 의학·보건 (8개)

49. `biomarker` | 생체지표 | Biomarker | medhealth,tool | 질병 상태나 신체 반응을 객관적으로 나타내는 측정 가능한 지표.
50. `clinical-trial` | 임상시험 | Clinical Trial | medhealth,method | 새로운 치료법이나 약물의 효과와 안전성을 사람 대상으로 검증하는 연구.
51. `epidemiology` | 역학 | Epidemiology | medhealth,method | 질병의 분포와 원인을 인구 집단 수준에서 연구하는 학문.
52. `comorbidity` | 동반질환 | Comorbidity | medhealth | 한 사람에게 두 가지 이상의 질환이 동시에 존재하는 상태.
53. `incidence-rate` | 발생률 | Incidence Rate | medhealth,stat | 일정 기간 동안 특정 집단에서 새로 발생한 환자 수의 비율.
54. `prevalence` | 유병률 | Prevalence | medhealth,stat | 특정 시점에 특정 질병을 가진 사람의 비율.
55. `double-blind` | 이중맹검 | Double-blind | medhealth,method | 연구자와 참가자 모두 누가 실제 치료를 받는지 모르게 하는 임상시험 설계.
56. `meta-cognition` | 메타인지 | Metacognition | medhealth,psych | 자신의 사고 과정을 스스로 인식하고 조절하는 능력.

### 심리학 (8개)

57. `cognitive-bias` | 인지편향 | Cognitive Bias | psych | 정보를 처리할 때 체계적으로 왜곡되는 사고 패턴.
58. `confirmation-bias` | 확증편향 | Confirmation Bias | psych | 자신의 기존 신념을 뒷받침하는 정보만 선택적으로 받아들이는 경향.
59. `self-efficacy` | 자기효능감 | Self-efficacy | psych | 특정 과제를 성공적으로 수행할 수 있다는 스스로에 대한 믿음.
60. `attachment-theory` | 애착이론 | Attachment Theory | psych | 초기 양육자와의 관계가 이후 정서적 유대 방식에 영향을 준다는 이론.
61. `likert-scale` | 리커트척도 | Likert Scale | psych,tool | 동의 정도를 여러 단계로 나눠 응답하게 하는 설문 척도.
62. `construct` | 구성개념 | Construct | psych,tool | 직접 관찰할 수 없어 여러 지표를 통해 간접적으로 측정하는 추상적 개념.
63. `social-desirability-bias` | 사회적바람직성편향 | Social Desirability Bias | psych,method | 응답자가 실제 생각보다 사회적으로 바람직해 보이는 답을 하는 경향.
64. `intervention` | 개입 | Intervention | psych,method | 특정 결과를 바꾸기 위해 의도적으로 실시하는 처치나 프로그램.

### 사회과학·경제학 (8개)

65. `endogeneity` | 내생성 | Endogeneity | socialecon,stat | 설명변수가 오차항과 상관관계를 가져 인과관계 추정이 왜곡되는 문제.
66. `instrumental-variable` | 도구변수 | Instrumental Variable | socialecon,stat | 내생성 문제를 해결하기 위해 원인에는 영향을 주되 결과에는 직접 영향이 없는 보조 변수.
67. `panel-data` | 패널데이터 | Panel Data | socialecon,stat | 여러 대상을 여러 시점에 걸쳐 반복 관측한 데이터.
68. `gini-coefficient` | 지니계수 | Gini Coefficient | socialecon | 소득이나 자산 분배의 불평등 정도를 0에서 1 사이 값으로 나타내는 지표.
69. `externality` | 외부효과 | Externality | socialecon | 한 경제주체의 행동이 거래 당사자가 아닌 제3자에게 의도치 않게 미치는 영향.
70. `social-capital` | 사회적자본 | Social Capital | socialecon | 신뢰와 네트워크처럼 사회 구성원 간 협력을 가능케 하는 무형의 자원.
71. `content-analysis` | 내용분석 | Content Analysis | socialecon,method | 텍스트나 매체 내용을 체계적으로 범주화해 분석하는 연구 기법.
72. `grounded-theory` | 근거이론 | Grounded Theory | socialecon,method | 데이터로부터 반복적으로 개념을 도출해 이론을 구축하는 질적연구 방법.

### 공학 (8개)

73. `finite-element-analysis` | 유한요소해석 | Finite Element Analysis | eng,tool | 복잡한 구조물을 작은 요소로 쪼개 하중이나 응력을 수치적으로 계산하는 방법.
74. `feedback-control` | 피드백제어 | Feedback Control | eng | 출력값을 측정해 입력을 자동으로 조정하는 제어 방식.
75. `signal-to-noise-ratio` | 신호대잡음비 | Signal-to-Noise Ratio | eng,tool | 원하는 신호의 크기와 잡음의 크기를 비교한 값으로, 신호 품질의 척도.
76. `fatigue-failure` | 피로파괴 | Fatigue Failure | eng | 반복적인 하중이 누적되어 재료가 파괴되는 현상.
77. `renewable-energy` | 재생에너지 | Renewable Energy | eng,physchem | 태양광, 풍력처럼 고갈되지 않고 지속적으로 얻을 수 있는 에너지원.
78. `life-cycle-assessment` | 전과정평가 | Life Cycle Assessment | eng,socialecon | 제품이 원료 채취부터 폐기까지 환경에 미치는 영향을 종합 평가하는 방법.
79. `redundancy` | 이중화 | Redundancy | eng | 시스템 일부가 고장 나도 전체가 작동하도록 예비 요소를 두는 설계 원칙.
80. `simulation` | 시뮬레이션 | Simulation | eng,cs | 실제 시스템을 컴퓨터 모델로 재현해 결과를 미리 예측하는 기법.

### 컴퓨터과학·AI (8개)

81. `machine-learning` | 머신러닝 | Machine Learning | cs | 데이터로부터 패턴을 학습해 명시적 규칙 없이 예측·판단하는 컴퓨터 기법.
82. `overfitting` | 과적합 | Overfitting | cs,stat | 모델이 학습 데이터에만 지나치게 맞춰져 새로운 데이터에서 성능이 떨어지는 현상.
83. `neural-network` | 인공신경망 | Neural Network | cs,neuro | 뇌 신경세포 연결 구조를 본떠 만든 다층 예측 모델 구조.
84. `algorithm-bias` | 알고리즘편향 | Algorithm Bias | cs,ethics | 학습 데이터나 설계 과정에서 비롯되어 특정 집단에 불리한 결과를 내는 인공지능의 편향.
85. `natural-language-processing` | 자연어처리 | Natural Language Processing | cs | 컴퓨터가 사람의 언어를 이해하고 생성하도록 다루는 기술 분야.
86. `reproducibility` | 재현성 | Reproducibility | cs,ethics | 같은 데이터와 코드로 동일한 연구 결과를 다시 얻을 수 있는 정도.
87. `data-augmentation` | 데이터증강 | Data Augmentation | cs,tool | 기존 데이터를 변형·복제해 학습 데이터의 양과 다양성을 늘리는 기법.
88. `cross-validation` | 교차검증 | Cross-validation | cs,stat | 데이터를 여러 부분으로 나눠 번갈아 학습·검증하며 모델 성능을 평가하는 방법.

---

## 파일 구조

- 수정: `index.html` — 하드코딩 목록 제거, 검색창·카테고리 섹션·noscript 추가
- 생성: `terms.json` — 100개 용어 메타데이터
- 생성: `assets/site.js` — 렌더링·검색 로직
- 생성: `terms/<slug>.html` × 88 — 신규 용어 상세 페이지 (기존 템플릿과 동일 구조)
- 수정: `README.md` — 콘텐츠 페이지 수 갱신 (12개 → 100개)

---

## Task 1: terms.json 데이터 파일 생성

**Files:**
- Create: `terms.json`

- [ ] **Step 1: 기존 12개 + 신규 88개 용어를 담은 terms.json 작성**

기존 12개는 스펙 문서의 이전 표를, 신규 88개는 위 목록의 slug/title_ko/title_en/categories를 그대로 사용한다.

```json
[
  {"slug": "p-value", "title_ko": "유의확률", "title_en": "p-value", "categories": ["stat", "method"]},
  {"slug": "correlation", "title_ko": "상관관계", "title_en": "Correlation", "categories": ["stat"]},
  {"slug": "regression", "title_ko": "회귀분석", "title_en": "Regression", "categories": ["stat"]},
  {"slug": "meta-analysis", "title_ko": "메타분석", "title_en": "Meta-analysis", "categories": ["method", "stat"]},
  {"slug": "sample-size", "title_ko": "표본크기", "title_en": "Sample Size", "categories": ["stat", "method"]},
  {"slug": "confidence-interval", "title_ko": "신뢰구간", "title_en": "Confidence Interval", "categories": ["stat"]},
  {"slug": "significance-level", "title_ko": "유의수준", "title_en": "Significance Level", "categories": ["stat"]},
  {"slug": "control-group", "title_ko": "통제집단", "title_en": "Control Group", "categories": ["method"]},
  {"slug": "cohort-study", "title_ko": "코호트연구", "title_en": "Cohort Study", "categories": ["method", "medhealth"]},
  {"slug": "rct", "title_ko": "무작위대조시험", "title_en": "RCT", "categories": ["method", "medhealth"]},
  {"slug": "qualitative-research", "title_ko": "질적연구", "title_en": "Qualitative Research", "categories": ["method", "socialecon"]},
  {"slug": "effect-size", "title_ko": "효과크기", "title_en": "Effect Size", "categories": ["stat"]},
  {"slug": "variance", "title_ko": "분산", "title_en": "Variance", "categories": ["stat"]},
  {"slug": "standard-deviation", "title_ko": "표준편차", "title_en": "Standard Deviation", "categories": ["stat"]},
  {"slug": "standard-error", "title_ko": "표준오차", "title_en": "Standard Error", "categories": ["stat"]},
  {"slug": "null-hypothesis", "title_ko": "귀무가설", "title_en": "Null Hypothesis", "categories": ["stat", "method"]},
  {"slug": "type-1-error", "title_ko": "1종 오류", "title_en": "Type I Error", "categories": ["stat"]},
  {"slug": "type-2-error", "title_ko": "2종 오류", "title_en": "Type II Error", "categories": ["stat"]},
  {"slug": "statistical-power", "title_ko": "검정력", "title_en": "Statistical Power", "categories": ["stat", "method"]},
  {"slug": "anova", "title_ko": "분산분석", "title_en": "ANOVA", "categories": ["stat"]},
  {"slug": "t-test", "title_ko": "t검정", "title_en": "t-test", "categories": ["stat"]},
  {"slug": "chi-square-test", "title_ko": "카이제곱검정", "title_en": "Chi-square Test", "categories": ["stat"]},
  {"slug": "outlier", "title_ko": "이상치", "title_en": "Outlier", "categories": ["stat", "tool"]},
  {"slug": "normal-distribution", "title_ko": "정규분포", "title_en": "Normal Distribution", "categories": ["stat"]},
  {"slug": "longitudinal-study", "title_ko": "종단연구", "title_en": "Longitudinal Study", "categories": ["method"]},
  {"slug": "cross-sectional-study", "title_ko": "횡단연구", "title_en": "Cross-sectional Study", "categories": ["method"]},
  {"slug": "case-study", "title_ko": "사례연구", "title_en": "Case Study", "categories": ["method"]},
  {"slug": "mixed-methods", "title_ko": "혼합연구방법", "title_en": "Mixed Methods", "categories": ["method"]},
  {"slug": "literature-review", "title_ko": "문헌고찰", "title_en": "Literature Review", "categories": ["method"]},
  {"slug": "systematic-review", "title_ko": "체계적 문헌고찰", "title_en": "Systematic Review", "categories": ["method"]},
  {"slug": "blinding", "title_ko": "눈가림법", "title_en": "Blinding", "categories": ["method", "tool"]},
  {"slug": "placebo", "title_ko": "위약", "title_en": "Placebo", "categories": ["method", "medhealth"]},
  {"slug": "validity", "title_ko": "타당도", "title_en": "Validity", "categories": ["tool", "method"]},
  {"slug": "reliability", "title_ko": "신뢰도", "title_en": "Reliability", "categories": ["tool", "method"]},
  {"slug": "peer-review", "title_ko": "동료심사", "title_en": "Peer Review", "categories": ["ethics"]},
  {"slug": "publication-bias", "title_ko": "출판편향", "title_en": "Publication Bias", "categories": ["ethics", "stat"]},
  {"slug": "quantum-entanglement", "title_ko": "양자얽힘", "title_en": "Quantum Entanglement", "categories": ["physchem"]},
  {"slug": "catalyst", "title_ko": "촉매", "title_en": "Catalyst", "categories": ["physchem"]},
  {"slug": "entropy", "title_ko": "엔트로피", "title_en": "Entropy", "categories": ["physchem"]},
  {"slug": "isotope", "title_ko": "동위원소", "title_en": "Isotope", "categories": ["physchem"]},
  {"slug": "spectroscopy", "title_ko": "분광법", "title_en": "Spectroscopy", "categories": ["physchem", "tool"]},
  {"slug": "polymer", "title_ko": "고분자", "title_en": "Polymer", "categories": ["physchem"]},
  {"slug": "phase-transition", "title_ko": "상전이", "title_en": "Phase Transition", "categories": ["physchem"]},
  {"slug": "chirality", "title_ko": "카이랄성", "title_en": "Chirality", "categories": ["physchem"]},
  {"slug": "gene-expression", "title_ko": "유전자 발현", "title_en": "Gene Expression", "categories": ["bioearth"]},
  {"slug": "crispr", "title_ko": "크리스퍼", "title_en": "CRISPR", "categories": ["bioearth", "tool"]},
  {"slug": "phylogenetics", "title_ko": "계통발생학", "title_en": "Phylogenetics", "categories": ["bioearth"]},
  {"slug": "biodiversity", "title_ko": "생물다양성", "title_en": "Biodiversity", "categories": ["bioearth"]},
  {"slug": "ecosystem-service", "title_ko": "생태계서비스", "title_en": "Ecosystem Service", "categories": ["bioearth", "socialecon"]},
  {"slug": "plate-tectonics", "title_ko": "판구조론", "title_en": "Plate Tectonics", "categories": ["bioearth"]},
  {"slug": "carbon-cycle", "title_ko": "탄소순환", "title_en": "Carbon Cycle", "categories": ["bioearth"]},
  {"slug": "symbiosis", "title_ko": "공생", "title_en": "Symbiosis", "categories": ["bioearth"]},
  {"slug": "neuroplasticity", "title_ko": "신경가소성", "title_en": "Neuroplasticity", "categories": ["neuro"]},
  {"slug": "synapse", "title_ko": "시냅스", "title_en": "Synapse", "categories": ["neuro"]},
  {"slug": "fmri", "title_ko": "기능적자기공명영상", "title_en": "fMRI", "categories": ["neuro", "tool"]},
  {"slug": "eeg", "title_ko": "뇌파검사", "title_en": "EEG", "categories": ["neuro", "tool"]},
  {"slug": "neurotransmitter", "title_ko": "신경전달물질", "title_en": "Neurotransmitter", "categories": ["neuro", "medhealth"]},
  {"slug": "cognitive-load", "title_ko": "인지부하", "title_en": "Cognitive Load", "categories": ["neuro", "psych"]},
  {"slug": "amygdala", "title_ko": "편도체", "title_en": "Amygdala", "categories": ["neuro"]},
  {"slug": "neurodegeneration", "title_ko": "신경퇴행", "title_en": "Neurodegeneration", "categories": ["neuro", "medhealth"]},
  {"slug": "biomarker", "title_ko": "생체지표", "title_en": "Biomarker", "categories": ["medhealth", "tool"]},
  {"slug": "clinical-trial", "title_ko": "임상시험", "title_en": "Clinical Trial", "categories": ["medhealth", "method"]},
  {"slug": "epidemiology", "title_ko": "역학", "title_en": "Epidemiology", "categories": ["medhealth", "method"]},
  {"slug": "comorbidity", "title_ko": "동반질환", "title_en": "Comorbidity", "categories": ["medhealth"]},
  {"slug": "incidence-rate", "title_ko": "발생률", "title_en": "Incidence Rate", "categories": ["medhealth", "stat"]},
  {"slug": "prevalence", "title_ko": "유병률", "title_en": "Prevalence", "categories": ["medhealth", "stat"]},
  {"slug": "double-blind", "title_ko": "이중맹검", "title_en": "Double-blind", "categories": ["medhealth", "method"]},
  {"slug": "meta-cognition", "title_ko": "메타인지", "title_en": "Metacognition", "categories": ["medhealth", "psych"]},
  {"slug": "cognitive-bias", "title_ko": "인지편향", "title_en": "Cognitive Bias", "categories": ["psych"]},
  {"slug": "confirmation-bias", "title_ko": "확증편향", "title_en": "Confirmation Bias", "categories": ["psych"]},
  {"slug": "self-efficacy", "title_ko": "자기효능감", "title_en": "Self-efficacy", "categories": ["psych"]},
  {"slug": "attachment-theory", "title_ko": "애착이론", "title_en": "Attachment Theory", "categories": ["psych"]},
  {"slug": "likert-scale", "title_ko": "리커트척도", "title_en": "Likert Scale", "categories": ["psych", "tool"]},
  {"slug": "construct", "title_ko": "구성개념", "title_en": "Construct", "categories": ["psych", "tool"]},
  {"slug": "social-desirability-bias", "title_ko": "사회적바람직성편향", "title_en": "Social Desirability Bias", "categories": ["psych", "method"]},
  {"slug": "intervention", "title_ko": "개입", "title_en": "Intervention", "categories": ["psych", "method"]},
  {"slug": "endogeneity", "title_ko": "내생성", "title_en": "Endogeneity", "categories": ["socialecon", "stat"]},
  {"slug": "instrumental-variable", "title_ko": "도구변수", "title_en": "Instrumental Variable", "categories": ["socialecon", "stat"]},
  {"slug": "panel-data", "title_ko": "패널데이터", "title_en": "Panel Data", "categories": ["socialecon", "stat"]},
  {"slug": "gini-coefficient", "title_ko": "지니계수", "title_en": "Gini Coefficient", "categories": ["socialecon"]},
  {"slug": "externality", "title_ko": "외부효과", "title_en": "Externality", "categories": ["socialecon"]},
  {"slug": "social-capital", "title_ko": "사회적자본", "title_en": "Social Capital", "categories": ["socialecon"]},
  {"slug": "content-analysis", "title_ko": "내용분석", "title_en": "Content Analysis", "categories": ["socialecon", "method"]},
  {"slug": "grounded-theory", "title_ko": "근거이론", "title_en": "Grounded Theory", "categories": ["socialecon", "method"]},
  {"slug": "finite-element-analysis", "title_ko": "유한요소해석", "title_en": "Finite Element Analysis", "categories": ["eng", "tool"]},
  {"slug": "feedback-control", "title_ko": "피드백제어", "title_en": "Feedback Control", "categories": ["eng"]},
  {"slug": "signal-to-noise-ratio", "title_ko": "신호대잡음비", "title_en": "Signal-to-Noise Ratio", "categories": ["eng", "tool"]},
  {"slug": "fatigue-failure", "title_ko": "피로파괴", "title_en": "Fatigue Failure", "categories": ["eng"]},
  {"slug": "renewable-energy", "title_ko": "재생에너지", "title_en": "Renewable Energy", "categories": ["eng", "physchem"]},
  {"slug": "life-cycle-assessment", "title_ko": "전과정평가", "title_en": "Life Cycle Assessment", "categories": ["eng", "socialecon"]},
  {"slug": "redundancy", "title_ko": "이중화", "title_en": "Redundancy", "categories": ["eng"]},
  {"slug": "simulation", "title_ko": "시뮬레이션", "title_en": "Simulation", "categories": ["eng", "cs"]},
  {"slug": "machine-learning", "title_ko": "머신러닝", "title_en": "Machine Learning", "categories": ["cs"]},
  {"slug": "overfitting", "title_ko": "과적합", "title_en": "Overfitting", "categories": ["cs", "stat"]},
  {"slug": "neural-network", "title_ko": "인공신경망", "title_en": "Neural Network", "categories": ["cs", "neuro"]},
  {"slug": "algorithm-bias", "title_ko": "알고리즘편향", "title_en": "Algorithm Bias", "categories": ["cs", "ethics"]},
  {"slug": "natural-language-processing", "title_ko": "자연어처리", "title_en": "Natural Language Processing", "categories": ["cs"]},
  {"slug": "reproducibility", "title_ko": "재현성", "title_en": "Reproducibility", "categories": ["cs", "ethics"]},
  {"slug": "data-augmentation", "title_ko": "데이터증강", "title_en": "Data Augmentation", "categories": ["cs", "tool"]},
  {"slug": "cross-validation", "title_ko": "교차검증", "title_en": "Cross-validation", "categories": ["cs", "stat"]}
]
```

- [ ] **Step 2: JSON 유효성 및 개수 검증**

Run: `node -e "const t=require('./terms.json'); console.log(t.length); const slugs=new Set(t.map(x=>x.slug)); console.log('unique:', slugs.size);"`
Expected: `100` 그리고 `unique: 100` (중복 slug 없음)

- [ ] **Step 3: Commit**

```bash
git add terms.json
git commit -m "feat: terms.json 데이터 파일 추가 (100개 용어)"
```

---

## Task 2: assets/site.js 작성 (카테고리 렌더링 + 검색)

**Files:**
- Create: `assets/site.js`

- [ ] **Step 1: 렌더링·검색 스크립트 작성**

```javascript
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
};

const CATEGORY_ORDER = ["stat", "method", "tool", "ethics", "physchem", "bioearth", "neuro", "medhealth", "psych", "socialecon", "eng", "cs"];

async function loadTerms() {
  const res = await fetch("terms.json");
  return res.json();
}

function termLinkHTML(term) {
  const enPart = term.title_en ? ` <span class="term-en">(${term.title_en})</span>` : "";
  return `<li><a href="terms/${term.slug}.html">${term.title_ko}${enPart}</a></li>`;
}

function render(terms, query) {
  const container = document.getElementById("category-sections");
  container.innerHTML = "";
  const q = query.trim().toLowerCase();

  for (const code of CATEGORY_ORDER) {
    const matched = terms.filter((t) => {
      if (!t.categories.includes(code)) return false;
      if (!q) return true;
      return t.title_ko.toLowerCase().includes(q) || (t.title_en || "").toLowerCase().includes(q);
    });
    if (matched.length === 0) continue;

    const section = document.createElement("section");
    section.innerHTML = `<h2>${CATEGORY_LABELS[code]}</h2><ul class="term-list">${matched.map(termLinkHTML).join("")}</ul>`;
    container.appendChild(section);
  }
}

async function init() {
  const terms = await loadTerms();
  render(terms, "");

  const searchInput = document.getElementById("term-search");
  searchInput.addEventListener("input", () => {
    render(terms, searchInput.value);
  });
}

init();
```

- [ ] **Step 2: Commit**

```bash
git add assets/site.js
git commit -m "feat: 카테고리 렌더링 및 검색 로직 추가"
```

---

## Task 3: index.html 재구성

**Files:**
- Modify: `index.html`

- [ ] **Step 1: `<main>` 내부의 하드코딩된 `<ul class="term-list">`를 검색창 + 카테고리 컨테이너 + noscript로 교체**

기존 `index.html`의 `<main>...</main>` 블록 전체를 다음으로 바꾼다 (header/footer는 그대로 유지):

```html
<main>
  <h1>논문용어사전</h1>
  <p class="subtitle">논문에 나오는 어려운 학술용어를 쉽게 풀어드립니다.</p>

  <input type="search" id="term-search" placeholder="용어 검색 (예: p-value, 상관관계)" aria-label="용어 검색">

  <div id="category-sections"></div>

  <noscript>
    <ul class="term-list">
      <li><a href="terms/p-value.html">유의확률 (p-value)</a></li>
      <li><a href="terms/correlation.html">상관관계 (Correlation)</a></li>
      <li><a href="terms/regression.html">회귀분석 (Regression)</a></li>
      <li><a href="terms/meta-analysis.html">메타분석 (Meta-analysis)</a></li>
      <li><a href="terms/sample-size.html">표본크기 (Sample Size)</a></li>
      <li><a href="terms/confidence-interval.html">신뢰구간 (Confidence Interval)</a></li>
      <li><a href="terms/significance-level.html">유의수준 (Significance Level)</a></li>
      <li><a href="terms/control-group.html">통제집단 (Control Group)</a></li>
      <li><a href="terms/cohort-study.html">코호트연구 (Cohort Study)</a></li>
      <li><a href="terms/rct.html">무작위대조시험 (RCT)</a></li>
      <li><a href="terms/qualitative-research.html">질적연구 (Qualitative Research)</a></li>
      <li><a href="terms/effect-size.html">효과크기 (Effect Size)</a></li>
      <li><a href="terms/variance.html">분산 (Variance)</a></li>
      <li><a href="terms/standard-deviation.html">표준편차 (Standard Deviation)</a></li>
      <li><a href="terms/standard-error.html">표준오차 (Standard Error)</a></li>
      <li><a href="terms/null-hypothesis.html">귀무가설 (Null Hypothesis)</a></li>
      <li><a href="terms/type-1-error.html">1종 오류 (Type I Error)</a></li>
      <li><a href="terms/type-2-error.html">2종 오류 (Type II Error)</a></li>
      <li><a href="terms/statistical-power.html">검정력 (Statistical Power)</a></li>
      <li><a href="terms/anova.html">분산분석 (ANOVA)</a></li>
      <li><a href="terms/t-test.html">t검정 (t-test)</a></li>
      <li><a href="terms/chi-square-test.html">카이제곱검정 (Chi-square Test)</a></li>
      <li><a href="terms/outlier.html">이상치 (Outlier)</a></li>
      <li><a href="terms/normal-distribution.html">정규분포 (Normal Distribution)</a></li>
      <li><a href="terms/longitudinal-study.html">종단연구 (Longitudinal Study)</a></li>
      <li><a href="terms/cross-sectional-study.html">횡단연구 (Cross-sectional Study)</a></li>
      <li><a href="terms/case-study.html">사례연구 (Case Study)</a></li>
      <li><a href="terms/mixed-methods.html">혼합연구방법 (Mixed Methods)</a></li>
      <li><a href="terms/literature-review.html">문헌고찰 (Literature Review)</a></li>
      <li><a href="terms/systematic-review.html">체계적 문헌고찰 (Systematic Review)</a></li>
      <li><a href="terms/blinding.html">눈가림법 (Blinding)</a></li>
      <li><a href="terms/placebo.html">위약 (Placebo)</a></li>
      <li><a href="terms/validity.html">타당도 (Validity)</a></li>
      <li><a href="terms/reliability.html">신뢰도 (Reliability)</a></li>
      <li><a href="terms/peer-review.html">동료심사 (Peer Review)</a></li>
      <li><a href="terms/publication-bias.html">출판편향 (Publication Bias)</a></li>
      <li><a href="terms/quantum-entanglement.html">양자얽힘 (Quantum Entanglement)</a></li>
      <li><a href="terms/catalyst.html">촉매 (Catalyst)</a></li>
      <li><a href="terms/entropy.html">엔트로피 (Entropy)</a></li>
      <li><a href="terms/isotope.html">동위원소 (Isotope)</a></li>
      <li><a href="terms/spectroscopy.html">분광법 (Spectroscopy)</a></li>
      <li><a href="terms/polymer.html">고분자 (Polymer)</a></li>
      <li><a href="terms/phase-transition.html">상전이 (Phase Transition)</a></li>
      <li><a href="terms/chirality.html">카이랄성 (Chirality)</a></li>
      <li><a href="terms/gene-expression.html">유전자 발현 (Gene Expression)</a></li>
      <li><a href="terms/crispr.html">크리스퍼 (CRISPR)</a></li>
      <li><a href="terms/phylogenetics.html">계통발생학 (Phylogenetics)</a></li>
      <li><a href="terms/biodiversity.html">생물다양성 (Biodiversity)</a></li>
      <li><a href="terms/ecosystem-service.html">생태계서비스 (Ecosystem Service)</a></li>
      <li><a href="terms/plate-tectonics.html">판구조론 (Plate Tectonics)</a></li>
      <li><a href="terms/carbon-cycle.html">탄소순환 (Carbon Cycle)</a></li>
      <li><a href="terms/symbiosis.html">공생 (Symbiosis)</a></li>
      <li><a href="terms/neuroplasticity.html">신경가소성 (Neuroplasticity)</a></li>
      <li><a href="terms/synapse.html">시냅스 (Synapse)</a></li>
      <li><a href="terms/fmri.html">기능적자기공명영상 (fMRI)</a></li>
      <li><a href="terms/eeg.html">뇌파검사 (EEG)</a></li>
      <li><a href="terms/neurotransmitter.html">신경전달물질 (Neurotransmitter)</a></li>
      <li><a href="terms/cognitive-load.html">인지부하 (Cognitive Load)</a></li>
      <li><a href="terms/amygdala.html">편도체 (Amygdala)</a></li>
      <li><a href="terms/neurodegeneration.html">신경퇴행 (Neurodegeneration)</a></li>
      <li><a href="terms/biomarker.html">생체지표 (Biomarker)</a></li>
      <li><a href="terms/clinical-trial.html">임상시험 (Clinical Trial)</a></li>
      <li><a href="terms/epidemiology.html">역학 (Epidemiology)</a></li>
      <li><a href="terms/comorbidity.html">동반질환 (Comorbidity)</a></li>
      <li><a href="terms/incidence-rate.html">발생률 (Incidence Rate)</a></li>
      <li><a href="terms/prevalence.html">유병률 (Prevalence)</a></li>
      <li><a href="terms/double-blind.html">이중맹검 (Double-blind)</a></li>
      <li><a href="terms/meta-cognition.html">메타인지 (Metacognition)</a></li>
      <li><a href="terms/cognitive-bias.html">인지편향 (Cognitive Bias)</a></li>
      <li><a href="terms/confirmation-bias.html">확증편향 (Confirmation Bias)</a></li>
      <li><a href="terms/self-efficacy.html">자기효능감 (Self-efficacy)</a></li>
      <li><a href="terms/attachment-theory.html">애착이론 (Attachment Theory)</a></li>
      <li><a href="terms/likert-scale.html">리커트척도 (Likert Scale)</a></li>
      <li><a href="terms/construct.html">구성개념 (Construct)</a></li>
      <li><a href="terms/social-desirability-bias.html">사회적바람직성편향 (Social Desirability Bias)</a></li>
      <li><a href="terms/intervention.html">개입 (Intervention)</a></li>
      <li><a href="terms/endogeneity.html">내생성 (Endogeneity)</a></li>
      <li><a href="terms/instrumental-variable.html">도구변수 (Instrumental Variable)</a></li>
      <li><a href="terms/panel-data.html">패널데이터 (Panel Data)</a></li>
      <li><a href="terms/gini-coefficient.html">지니계수 (Gini Coefficient)</a></li>
      <li><a href="terms/externality.html">외부효과 (Externality)</a></li>
      <li><a href="terms/social-capital.html">사회적자본 (Social Capital)</a></li>
      <li><a href="terms/content-analysis.html">내용분석 (Content Analysis)</a></li>
      <li><a href="terms/grounded-theory.html">근거이론 (Grounded Theory)</a></li>
      <li><a href="terms/finite-element-analysis.html">유한요소해석 (Finite Element Analysis)</a></li>
      <li><a href="terms/feedback-control.html">피드백제어 (Feedback Control)</a></li>
      <li><a href="terms/signal-to-noise-ratio.html">신호대잡음비 (Signal-to-Noise Ratio)</a></li>
      <li><a href="terms/fatigue-failure.html">피로파괴 (Fatigue Failure)</a></li>
      <li><a href="terms/renewable-energy.html">재생에너지 (Renewable Energy)</a></li>
      <li><a href="terms/life-cycle-assessment.html">전과정평가 (Life Cycle Assessment)</a></li>
      <li><a href="terms/redundancy.html">이중화 (Redundancy)</a></li>
      <li><a href="terms/simulation.html">시뮬레이션 (Simulation)</a></li>
      <li><a href="terms/machine-learning.html">머신러닝 (Machine Learning)</a></li>
      <li><a href="terms/overfitting.html">과적합 (Overfitting)</a></li>
      <li><a href="terms/neural-network.html">인공신경망 (Neural Network)</a></li>
      <li><a href="terms/algorithm-bias.html">알고리즘편향 (Algorithm Bias)</a></li>
      <li><a href="terms/natural-language-processing.html">자연어처리 (Natural Language Processing)</a></li>
      <li><a href="terms/reproducibility.html">재현성 (Reproducibility)</a></li>
      <li><a href="terms/data-augmentation.html">데이터증강 (Data Augmentation)</a></li>
      <li><a href="terms/cross-validation.html">교차검증 (Cross-validation)</a></li>
    </ul>
  </noscript>

  <script src="assets/site.js"></script>
</main>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: 홈페이지를 카테고리·검색 UX로 재구성"
```

---

## Task 4: 홈페이지 브라우저 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 프리뷰 서버로 확인**

`mcp__Claude_Browser__preview_start`(name: "static-site") 실행 후 `http://localhost:5500/index.html`을 열어 다음을 확인한다:
- 12개 카테고리 섹션이 모두 렌더링되는가
- `p-value`를 검색창에 입력했을 때 "통계"/"연구방법론" 섹션에만 결과가 남고 나머지 섹션은 사라지는가
- 검색어를 지우면 전체 뷰로 복귀하는가
- 임의로 신규 용어 링크(예: `terms/machine-learning.html`) 클릭 시 404가 아니라 실제 페이지가 뜨는가 (Task 5~9에서 페이지 생성 후 재확인)

Expected: 위 항목 모두 통과. 실패 시 `assets/site.js` 로직 또는 `terms.json` 데이터 오류를 원인으로 지목하고 수정.

---

## Task 5~12: 신규 용어 상세 페이지 88개 생성 (8개 배치, 배치당 11개)

각 배치는 독립적이며 병렬(서브에이전트) 실행이 가능하다. 모든 페이지는 [terms/effect-size.html](../../../stat/effect-size.html)의 구조를 그대로 따른다: `<head>`(title/description/canonical `https://example.github.io/terms/<slug>.html`), header/nav(`../` 상대경로), breadcrumb, `<h1>`, `definition-box`(한 줄 정의), "쉽게 풀면" 섹션(일상 비유 포함 300~500자), "논문에서는 이렇게 쓰입니다"(example 박스 + 해설), "주의할 점", "관련 용어"(2~3개 링크), footer.

각 용어의 콘텐츠 브리프(한 줄 정의)는 위 "신규 용어 88개 목록"에 있다. 이를 바탕으로 실제 본문(쉬운 풀이·논문 예문·주의할 점)을 작성한다 — 브리프의 정의를 그대로 정의box에 쓰고, 나머지 섹션은 그 정의를 확장해 새로 작성한다.

### Task 5: 방법론 배치 1/2 (variance ~ statistical-power, 9개)
### Task 6: 방법론 배치 2/2 (anova ~ publication-bias, 15개)
### Task 7: 물리학·화학 (8개) + 생물학·지구과학 (8개)
### Task 8: 뇌과학 (8개) + 의학·보건 (8개)
### Task 9: 심리학 (8개) + 사회과학·경제학 (8개)
### Task 10: 공학 (8개) + 컴퓨터과학·AI (8개)

각 Task 공통 Step:

- [ ] **Step 1: 배치에 포함된 각 slug에 대해 `terms/<slug>.html` 생성**

`terms/effect-size.html`을 템플릿으로 복사해 title, description, canonical, breadcrumb, h1, definition-box, 쉬운 풀이, 예문, 주의할 점, 관련 용어를 해당 용어 내용으로 교체한다. 관련 용어는 같은 카테고리를 공유하는 다른 slug 중 2~3개를 선택해 링크한다.

- [ ] **Step 2: 생성된 파일 개수 검증**

Run (배치별 slug 목록에 맞게): `ls terms/ | wc -l`
Expected: 배치 누적 진행에 따라 12(기존) + 생성된 개수와 일치.

- [ ] **Step 3: 임의 1개 페이지를 브라우저로 열어 스타일·링크 확인**

`http://localhost:5500/terms/<임의slug>.html` 접속 → definition-box, example 박스 스타일이 기존 페이지와 동일하게 적용되는지, 관련 용어 링크가 깨지지 않는지 확인.

- [ ] **Step 4: Commit**

```bash
git add terms/
git commit -m "feat: <배치명> 용어 페이지 추가"
```

---

## Task 13: 전체 검증 및 README 갱신

**Files:**
- Modify: `README.md`

- [ ] **Step 1: terms.json의 모든 slug에 대해 실제 파일이 존재하는지 검증**

```bash
node -e "
const terms = require('./terms.json');
const fs = require('fs');
const missing = terms.filter(t => !fs.existsSync('terms/' + t.slug + '.html'));
console.log('missing:', missing.map(m => m.slug));
console.log('total terms:', terms.length);
"
```
Expected: `missing: []`, `total terms: 100`

- [ ] **Step 2: README.md의 콘텐츠 페이지 수 관련 문구 갱신**

`README.md`의 "콘텐츠 페이지 12개 이상 확보 (완료)"를 "콘텐츠 페이지 100개 이상 확보 (완료)"로, `terms/*.html — 용어별 상세 페이지 12개`를 `terms/*.html — 용어별 상세 페이지 100개`로 수정한다.

- [ ] **Step 3: 홈페이지 전체 재검증**

프리뷰 서버에서 검색창에 카테고리별 키워드(예: "뇌", "머신러닝", "지니") 각각 입력해 해당 섹션에 결과가 정상적으로 뜨는지 확인.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README 콘텐츠 페이지 수 갱신 (100개)"
```

---

## Self-Review

- **스펙 커버리지**: terms.json 스키마(Task 1), 홈페이지 6단계 재구성 전부(Task 3: 하드코딩 제거·검색창·섹션·site.js 분리·검색 로직·noscript) (Task 2), 88개 신규 용어 생성(Task 5~12), 기존 12개 이전(Task 1의 terms.json에 포함) 모두 태스크로 매핑됨.
- **플레이스홀더 스캔**: 없음. 88개 용어 전부 slug/title_ko/title_en/categories/콘텐츠 브리프까지 구체적으로 명시했고, terms.json 전체 내용을 Task 1에 실제 값으로 작성함.
- **타입/네이밍 일관성**: `terms.json`의 `categories` 배열 값(코드)과 `assets/site.js`의 `CATEGORY_LABELS`/`CATEGORY_ORDER` 키가 12개 모두 1:1 일치.
- **범위 점검**: PDF 도구는 포함하지 않음. 단일 플랜으로 실행 가능.
