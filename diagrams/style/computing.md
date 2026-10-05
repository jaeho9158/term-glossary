# 컴퓨팅·정보 스타일 가이드
(근거: reviewed 스펙 약 84개 중 type별로 고른 약 30개를 읽고 관찰한 내용)

## 자주 맞는 type
- chain: 공격 단계·학습 흐름 등 한 방향 인과. 예: cyber-kill-chain(7단계), syn-flood-attack(3단계), backpropagation, mapreduce.
- procedure: 알고리즘·프로토콜 절차. 반복은 뒤로 가는 엣지에 "반복" 라벨. 예: heap-sort, byte-pair-encoding, kerberos, pbkdf2, incident-response.
- contrast: 두 방식의 대칭 비교. 예: bell-lapadula-model(벨-라파둘라 대 비바), symmetric-key-cryptography, zero-trust-architecture, bagging(배깅 대 부스팅), generative-adversarial-network.
- hierarchy: 원칙·구성요소 목록(루트 1개 + 자식 3~5개). 예: cia-triad, solid-principles, cap-theorem, confusion-matrix.
- 순환 구조(actor-critic)도 chain으로 마지막 노드에서 첫 노드로 엣지를 돌려 표현했다.

## 라벨 관례
- 영문 약어는 괄호 병기(인증 서버(AS), 생성자(G), 판별자(D)) 또는 sub에 둔다(SRP·OCP·DIP, "No Read Up").
- 알고리즘 복잡도는 sub에 O(n log n)처럼 쓴다. 규격·문헌은 sub나 source에 쓴다(NIST SP 800-207, RFC 4120).
- 공격·알고리즘 이름은 통용 표기를 그대로 쓴다(C2, TGT, TP·FP·FN·TN, HMAC).
- 라벨은 짧은 명사구(정찰, 전달, Map), 부연은 sub로 뺀다. 계산식은 note에 쓴다(정밀도=TP/(TP+FP)).
- contrast는 머리(row 0)에 두 모델 이름, 아래 행에 같은 속성을 같은 순서로 맞춘다.

## 색 쓰는 법
- blue 시스템 주체·기본 단계(인증 서버, 순전파), violet 방법·도구·매개(PRF 반복, 크리틱, 기밀성 등 속성), amber 입력·외부 요인·공격 전달(액터, 취약점 악용, Reduce), green 바람직한 결과(유도 키, 정렬 완료, 가용성), rose 위험·오류(설치·C2·목표 달성, FP·FN, 자원 고갈), gray 환경·준비·기준(환경, 경계기반 보안, 입력 분할).
- 공격 chain은 정찰=blue, 무기화=violet, 전달·악용=amber, 설치 이후=rose로 위험이 단계적으로 짙어진다.
- 대칭 쌍(생성자·판별자)처럼 대등한 두 주체는 서로 다른 색(amber 대 violet)이다. 비교 대상 중 낡은 쪽은 gray 헤더(경계기반 보안), 새 쪽은 blue 헤더다.
- 같은 층위의 원칙 목록(CIA, SOLID)은 자식을 모두 violet으로 통일하고 루트만 blue다.

## 피할 것
- 보안 도식에서 "이것만 하면 안전"으로 읽히는 단정. 한계 note를 단다(제로트러스트는 제품이 아니라 설계 철학, PBKDF2는 GPU 병렬 공격에 상대적 취약).
- 관련 개념의 범위 혼동. 역전파는 기울기 계산까지이고 갱신은 경사하강법의 몫이라고 note로 구분했다.
- 모델 비교를 우열로 표시하는 것. bagging은 "분산만 줄이고 편향은 못 줄임"처럼 각자의 효과·한계를 병기한다.
- 한 도식에 구현 세부까지 넣는 것. 단계 3~7개, note 1~2개로 억제한다(예외적으로 kill-chain 7단계).
- 서비스 모델·구현에 따라 달라지는 경계를 고정선처럼 그리는 것(shared-responsibility-model에 "경계가 달라짐" note).

## v2 새 type
- 위 관찰은 cycle·matrix·venn·timeline·plot이 생기기 전 스펙 기준이다. 새로 쓸 때는 README의 9개 type 중 개념에 가장 맞는 것을 고른다.
## 좋은 예
- mapreduce: 5단계 chain에 색 역할이 분명하고(입력 gray, Map violet, Shuffle blue, Reduce amber, 출력 green), pos(장애 내성)와 limit(디스크 왕복으로 느림 → Spark) note가 짝을 이룬다.
- zero-trust-architecture: contrast로 경계기반(rose 약점)과 제로트러스트(violet 방법·green 이점)를 같은 행 수로 대칭 비교하고, "제품이 아닌 설계 철학" 한계 note와 출처(NIST SP 800-207)를 단다.
