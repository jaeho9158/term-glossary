# 통계·방법론 스타일 가이드
## 자주 맞는 type
- procedure: 분석·실험·실험실 절차가 압도적 다수. 예 `k-fold-cross-validation`(4단계), `meta-analysis`(5단계), `randomized-controlled-trial`, `western-blot`, `qpcr`, `prisma-flow-diagram`.
- hierarchy: 분류·구성요소·조건 묶음. 예 `levels-of-measurement`(측정수준 4단계), `missing-data-mechanism`(MCAR/MAR/MNAR), `instrumental-variable-theory`(세 조건), `picot-framework`(P·I·C·O·T), `research-misconduct`(FFP).
- contrast: 두 개념의 대비. 예 `type-1-error`(1종 vs 2종), `probability-sampling`(확률 vs 비확률), `placebo-controlled-design`.
- chain은 기전·반응 경로에 한정(`qpcr`, `central-dogma`). 연표·plot 스펙은 이 분야 검수 통과분에 없음.
## 라벨 관례
- 영문 약어는 sub나 라벨에 병기: MCAR·MAR·MNAR, QRP, FFP, HARKing, ITT, 2SLS, ΔΔCt, Ct.
- PICOT처럼 약자 자체가 노드면 라벨은 한 글자(P·I·C·O·T), sub에 풀이(대상(Population)).
- 고유명·연도는 sub에: `Stevens(1946)`. 기호·수식은 그대로: α, β, 1−β, K−1, ±표준편차.
- 괄호 예시는 sub에 짧게: `범주 구분만 (성별)`, `절대 0 있음 (체중·소득)`. 라벨은 한글 10자 내외 명사구, sub는 한 구절.
- 문서 제목형 용어는 루트 라벨을 개념명으로: `측정수준 4단계`, `인과 추론 조건`.
## 색 쓰는 법
- blue = 주체·구조·루트·기본 단계(루트 노드, 분석 대상, 처치군·대조군, 균형 확인).
- violet = 방법·도구·조건·신호(무작위 배정, 성향점수 추정, 가중치, 도구변수의 세 조건, 유의수준 α·확률 β).
- amber = 개입·외부 요인·주의 대상(PICOT의 중재 I, MAR, 이질성·편향 점검, QRP 전체, 2종 오류).
- green = 바람직한 결과·최종 산출(통합 추정치, 성능 평균, 효과 추정, 합의 도출, 일반화 가능, MCAR).
- rose = 문제·오류·위험(1종 오류, FFP 위조·변조·표절, 비확률표집의 일반화 제한, MNAR).
- gray = 배경·기준·대조(명목척도, 모집·검색 같은 입력 단계, 블로킹, PICOT의 P·C).
## 피할 것
- 인과 과장: 성향점수는 "측정된 교란변수만 통제 가능", 도구변수는 "배제 제약은 데이터로 검증 불가"처럼 한계 note(`limit`)로 못박는다.
- 논쟁적 사안의 단정: 리커트척도를 등간처럼 평균 내는 관행은 "여전히 논쟁적"으로 표기, MAR/MNAR는 "자료만으로 구별 불가"로 표기.
- 부정행위와 실수 혼동: `research-misconduct`는 고의성이 요건이며 정직한 실수·재현 실패는 제외한다고 명시.
- 단계 도식에 대안·대책 누락: `questionable-research-practices`는 pos note로 사전등록·확증/탐색 구분을 덧붙임.
- 한 용어 안에서 같은 색을 의미 없이 반복하지 말 것(절차는 blue→violet→green처럼 역할로 구분). 단, 전부 같은 범주면 단색 가능(QRP=amber, FFP=rose).
## v2 새 type
- 위 관찰은 cycle·matrix·venn·timeline·plot이 생기기 전 스펙 기준이다. 새로 쓸 때는 README의 9개 type 중 개념에 가장 맞는 것을 고른다.
- 분포·검정력·ROC·용량-반응처럼 **곡선 모양 자체가 개념**이면 plot을 먼저 고려한다(정규·t·카이제곱·ROC 등). 1종·2종 오류처럼 두 기준 네 칸이면 matrix.
## 좋은 예
- `missing-data-mechanism`: 세 메커니즘을 green/amber/rose로 위험도 순서에 대응시키고, 식별 불가라는 한계를 note로 남김.
- `type-1-error`: 좌우 행을 맞춘 contrast(오류명·의미·통제 모수), rose/amber로 두 오류를 구분하고 α·β는 violet으로 통일.
