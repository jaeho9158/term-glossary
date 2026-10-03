# 경영·경제 스타일 가이드
## 자주 맞는 type
검수 통과 스펙(약 150개) 기준 chain·contrast·procedure·hierarchy 네 type만 쓰였다.
- chain: 인과·파급 경로. 예: j-curve-effect(평가절하→단기 악화→물량 조정→개선), triffin-dilemma, modigliani-miller-proposition-ii, aida-model.
- contrast: 두 제도·전략의 좌우 대비(row 3~4, `axis`로 비교 기준 명시). 예: tax-credit(세액공제 vs 소득공제), vertical-integration, blue-ocean-strategy, jeonse-system.
- procedure: 법정·실무 절차(특허·무역·세무·회계). 예: patent-prosecution, documentary-collection, revenue-recognition-five-step-model.
- hierarchy: 프레임워크의 구성요소 분해·분류. 예: porters-five-forces, bcg-matrix(4칸), dupont-analysis(ROE=세 요소), incoterms-2020.
- 2×2 모형(BCG, 안소프)도 matrix가 아니라 hierarchy로 그린 사례가 있다.
## 라벨 관례
- 라벨은 명사구 한글 10자 안팎. 모형명은 루트에 쓰고 sub에 축·구성 요약(예: BCG 매트릭스 / 성장률×점유율).
- 영문 약어는 sub에 병기하거나 라벨에 직접 쓴다: AIDA의 "Attention", ROE, D/E, WACC, CCC, MM.
- 방향·증감은 화살표 기호로 짧게: 수출↑ 수입↓, 자기자본비용↑. 수식은 notes에 한 줄(예: CCC = 재고기간 + 채권기간 − 매입채무기간, ROE = 세 요소의 곱).
- 고유명·인명 모형은 한글 표기를 쓰고 sub에 원어(Porter의 상충 명제)를 단다.
- contrast 비교 행의 마지막 행에는 예시나 귀결을 gray·green·rose로 둔다(예: 제조사→유통망 인수).
## 색 쓰는 법
- blue: 모형의 주체·기준 개념·루트(ROE, 전방통합, 신규 출발점인 평가절하·유동성 공급).
- amber: 외부 충격·입력·중간 매개·위협 요인(부채비율 상승, 신규 진입 위협, 물량 조정).
- violet: 방법·도구·교섭력 등 매개(구매자·공급자 교섭력, 재무레버리지, 실체심사).
- green: 바람직한 최종 결과(수지 개선, 현금 회수, 등록, WACC 불변, 스타).
- rose: 위험·손실·실패(재무위험 상승, 신뢰 훼손, 도그, 의견제출통지 단계).
- gray: 형식 단계나 대조군(방식심사, 월세 쪽, 예시 행).
- contrast에서 좋고 나쁨이 없는 중립 대비는 좌우를 blue/violet 또는 blue/gray로 구분한다(tax-credit은 green/blue 병용).
## 피할 것
- 이론의 가정을 빼고 인과를 확정하지 않는다: 조건은 notes에 limit로 적는다(J커브는 마샬-러너 조건 전제, MM은 세금·파산비용 없는 완전시장 가정, BCG는 경험곡선 가정).
- 전략 프레임워크를 보편 처방처럼 쓰지 않는다. 비판은 limit 노트로 단다(블루오션의 모방·생존자 편향, AIDA의 순서 변동).
- 법·세무·무역 절차의 단계·기한을 보편 사실처럼 쓰지 않는다. 국가별 차이를 limit로 표기한다(patent-prosecution).
- 제도 용어를 혼동하지 않는다: 법적 구분이 있으면 note로 짚는다(전세권 vs 채권적 전세계약).
- 위협 요인(amber)과 실제 손실(rose)을 같은 색으로 뭉뚱그리지 않는다.
## v2 새 type
- 위 관찰은 cycle·matrix·venn·timeline·plot이 생기기 전 스펙 기준이다. 새로 쓸 때는 README의 9개 type 중 개념에 가장 맞는 것을 고른다.
## 좋은 예
- j-curve-effect: 블루→rose→amber→green으로 단기 악화와 시차 후 개선이 색만으로 읽히고, 마샬-러너 조건을 limit 노트로 단다.
- jeonse-system: 좌우 3행 대비에 axis(주택 임대차 방식)를 명시하고, 한국 특유 성격(general)과 법적 구분(limit)을 노트로 분리했다.
