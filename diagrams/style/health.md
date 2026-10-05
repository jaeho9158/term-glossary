# 의학·보건 스타일 가이드
## 자주 맞는 type
- chain: 병태생리·기전·약리 경로. 예 atherosclerosis-pathogenesis(내피 손상→LDL→거품세포→죽상반→협착), sepsis-pathophysiology, seir-model(S→E→I→R), chain-of-survival.
- procedure: 응급·검사·임상 절차의 순서. 예 abcde-approach(A→E 5단계), start-triage(보행→호흡→순환→의식→4범주), surgical-safety-checklist.
- hierarchy: 분류·병기·유형. 예 shock-classification(쇼크→4유형), vaccine-types, tnm-staging, rule-of-nines, primary-prevention(1~4차).
- contrast: 두 질환·반응·개념 비교. 예 apoptosis-vs-necrosis, type-2-hypersensitivity(2형 대 3형), 능동면역과 수동면역.
- 한의학 변증도 chain/hierarchy로 처리(five-phases-generation-restraint-cycle, eight-principle-pattern-identification).
## 라벨 관례
- 영문 약어는 sub에 병기하거나 라벨에 그대로 둔다: 감수성자 S, 기도[Airway], 보행 확인, 호흡 평가 등.
- 수치·기준은 sub에 넣는다: ">30회 적", "모세혈관재충혈 >2초 적", "9%·18%", "각 9%".
- 라벨은 짧은 명사구(쇼크 유형·단계 이름), 설명은 sub에 "원인·기전" 한 구절로 쓴다(예: 출혈·탈수, 펌프 기능 저하).
- 기전 단계 라벨은 사건 이름(내피 손상, 거품세포 형성), sub에 세부 기전(단핵구→대식세포).
- 계산식·정의는 notes(general)로 뺀다: "민감도=진양성/환자".
## 색 쓰는 법
- rose: 손상·병리·위험 결과(내피 손상, 다발장기부전, 위음성, 괴사, 쇼크 유형 전체).
- amber: 유발 요인·개입·입력(LDL 축적, 조기 CPR·AED, 병원체 약독화, 감염자 이전의 노출 단계).
- green: 회복·보호·정상 결과(진양성, 회복자 R, 1차 예방, 염증 거의 없는 세포자멸사 결과).
- violet: 신호·방법·검사 단계(카스파제 활성화, START 평가 단계, mRNA 같은 전달 방식).
- blue: 주체·루트·기본 상태(감수성자, 분류 루트, ABCDE 단계). gray: 기준·대조(사백신, 회음부 1%).
- 한 도식에서 같은 역할은 같은 색을 유지한다(procedure에서 단계가 모두 blue 또는 violet인 경우가 흔함).
## 피할 것
- 단계 수를 임의로 늘리지 않는다: 5~6개 이하로, 합의된 지침 단계 이름을 그대로 쓴다.
- 지침 간 차이는 단정하지 말고 limit 노트로 남긴다(예: C-ABC 변형, 최근 지침의 회복 단계 추가, 임상 대 병리 병기 차이).
- 중간 형태·예외는 limit 노트로 표시한다(조절된 괴사·파이롭토시스 등). 이분법으로 과장하지 않는다.
- 위험 단계라고 모두 rose로 칠하지 않는다: 요인(amber)과 결과(rose)를 구분한다.
- 한의학 개념은 "~로 본다" 수준의 이론 체계 설명에 머물고 효능을 단정하지 않는다(장부·경락 병리는 다른 변증과 함께 판단한다는 limit 노트 사례).
## v2 새 type
- 위 관찰은 cycle·matrix·venn·timeline·plot이 생기기 전 스펙 기준이다. 새로 쓸 때는 README의 9개 type 중 개념에 가장 맞는 것을 고른다.
## 좋은 예
- atherosclerosis-pathogenesis: chain에 rose·amber로 병리와 유발 요인을 구분하고, 섬유피막 파열 위험을 limit 노트로 덧붙임.
- apoptosis-vs-necrosis: contrast에서 좌우 4행으로 신호·형태·결과를 맞대응시키고, 중간 형태 존재를 limit 노트로 처리.
