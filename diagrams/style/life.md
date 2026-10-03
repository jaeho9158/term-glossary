# 생명과학 스타일 가이드
(관찰 대상: 검수 통과 스펙 212개 — chain 114, procedure 41, contrast 37, hierarchy 20. cycle·matrix·venn·timeline·plot은 0개. 40개가 `mode: "bio"`)
## 자주 맞는 type
- chain: 신호전달·대사·기전 경로가 압도적. 예 baroreceptor-reflex(혈압 변화→수용체→뇌줄기→자율신경→회복), gene-expression, ltp-molecular-cascade, 중독·독성 경로.
- procedure: 실험·제조 프로토콜의 단계. 예 acute-brain-slice, digital-pcr-quantification, cell-line-development, mitosis-phases(분열기 순서).
- contrast: 쌍으로 비교되는 개념. 예 AAV vs 렌티바이러스, 렙틴 vs 그렐린, 이소적 vs 동소적 종분화, 촉진 vs 저하(단기 시냅스 가소성). `axis`에 비교 기준(예 "격리 방식")을 한마디 둔다.
- hierarchy: 분류·구성 체계. 예 mimicry-types, glial-cell, ATC 분류체계, BCS(루트 1개+Class I~IV).
- 순환 대사(해당과정·시트르산 회로 등)도 cycle이 아니라 chain으로 쓴 스펙이 대부분이다.
## 라벨 관례
- 노드 label은 짧은 명사구(관찰 최대 14자), sub에 부위·분자·수치를 병기: "미세아교 활성 | TLR 인식", "절편 제작 | 비브라톰 200–400 μm".
- 영문 약어·고유명은 그대로: CaMKII, AMPA, BsaI, FACS, ChR2·NpHR, IL-1β·TNF-α. 이온은 위·아래첨자 사용(Ca²⁺, Mg²⁺).
- 단위는 숫자와 붙여 sub에(ms, μm, 약 5kb 미만). 부등식·규칙은 기호 그대로(rB > C).
- 엣지 label은 경로·기전 이름 한두 단어: "관통로", "이끼섬유", "샤퍼 곁가지", "반복 농축".
- contrast: 좌우 머리(row 0)는 대상 이름만, 이후 행에 속성(기원·특징·장단점)을 같은 순서로 맞춘다.
## 색 쓰는 법
- 일반(비 bio) 스펙은 역할 기준: blue=주체·구조·기본 단계(흡수·분포·대사, 전기생리 준비), violet=방법·도구·매개(gRNA 결합, 제한효소, 선별), amber=개입·외부 요인·입력(Cas9 절단, 시험관 증식, 전처치), green=최종 산물·바람직한 결과(유전체 편집, 세포은행화, 절대 정량), rose=손상·위험·병리(과량 복용, 대사성 산증), gray=대조·배경.
- 경로의 마지막 노드가 green(산물·회복), 첫 노드가 rose(손상·유발)인 패턴이 흔하다(baroreceptor-reflex, salicylate-poisoning).
- `mode: "bio"`: blue=뉴런·신경 구성요소(trisynaptic-circuit은 전 노드 blue), green=별아교·긍정적 기능, amber=미세아교·면역, rose=병리, violet=분자·신호·Ca²⁺·키나아제(ltp-molecular-cascade). 글리아 hierarchy는 gray 루트 아래 blue 부위, 세포별 색 구분.
- contrast에서는 좌 머리 blue, 우 머리는 대비색(amber·violet·green)으로 구분하는 경우가 많다(회분식 blue / 유가식 amber).
- 억제는 `inhibit`(관찰 7개뿐)이고 거의 모두 arrow. 한 도식에 색 4~5종 이내.
## 피할 것
- 단계 순서가 실제로 병렬·되먹임인 과정을 일직선 chain으로 과장하기. 노트에 "초~분 단위 단기 조절; 장기 조절은 콩팥" 식 한계를 적은 예가 있다.
- 기전의 인과 단정: 실제 스펙은 limit 노트(95개)로 "mRNA 양과 단백질 양이 항상 비례하지는 않음", "annexin V만으로 사멸 단정 금물"처럼 한정한다.
- 실험법 도식에서 한계 누락(절편은 온전한 회로를 반영 못함, 높은 농도에서 한 구획에 여러 분자 등).
- 진화·행동 설명의 목적론: 혈연선택에서 "개체가 r을 계산한다는 뜻이 아님"을 명시했다.
- 급성 반응과 만성화를 구분 없이 하나의 부정적 경로로 그리기(신경염증: 급성은 회복에 기여).
- 라벨 한 노드에 sub를 길게 몰기(14자 초과 시 줄바꿈 경고).
## v2 새 type
- 위 관찰은 cycle·matrix·venn·timeline·plot이 생기기 전 스펙 기준이다. 새로 쓸 때는 README의 9개 type 중 개념에 가장 맞는 것을 고른다.
## 좋은 예
- `neuroinflammation-cascade` (chain, bio): rose→amber→amber→green→rose로 bio 색 의미를 지키고, limit 노트로 "급성은 회복, 지속 시 해로움"을 명시.
- `immune-checkpoint-pd1` (chain): 기전을 4단계로 압축하고 pos 노트(항체 차단)와 limit 노트(T세포 소진 표지)를 나눠 담음.
- `golden-gate-cloning` (procedure): 효소명·오버행 등 sub가 구체적이고 pos/limit 노트로 장점과 주의점(내부 인식 서열)을 균형 있게 제시.
