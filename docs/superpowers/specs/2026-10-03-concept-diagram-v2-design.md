# 개념 도식 v2 설계 — PaperBanana식 생성 파이프라인과 커버리지 확대

작성 2026-10-03 · 브랜치 `feat/diagram-v2` · 선행 작업: 개념 도식 v1(2026-09-26, `diagrams/README.md`)

## 목표

도식이 의미 있는 모든 용어에 개념 도식을 붙인다. 현재 1,813개(4.4%) → 예상 4,000~8,000개(10~20%).
그림은 지금처럼 결정적 SVG 렌더러로 그린다. 오픈소스 PaperBanana(Retriever·Planner·Stylist·Visualizer·Critic)
에서 **Visualizer(이미지 생성 모델)를 뺀 나머지 네 단계**를 생성 파이프라인에 들인다.

이미지 생성 모델을 쓰지 않는 이유: 유료, 한글 라벨 깨짐, 다크 모드·모바일 세로판·접근성 텍스트 불가, 수정 불가.

### 성공 기준
- 렌더러 분리·확장 후 기존 스펙 1,813개의 렌더 결과가 바이트 단위로 같다.
- 파일럿 50개 사용자 검토에서 수정 요청 10% 이하.
- 본 배치 표본 25개당 내용 오류 1개 이하.

### 범위 밖
- 비교 페이지 확장, 분야 개요 미니 리뷰(별도 백로그로 보류).
- 이미지 생성 모델, 런타임 JS 렌더링.

## 현재 상태 (v1)

| 항목 | 상태 |
|---|---|
| 흐름 | 스펙 JSON → `check.js`(형식·겹침) → 페이지 대조 → 검수 → `insert.js`가 SVG 인라인 삽입 |
| 렌더러 | `scripts/diagrams/lib.js` 603줄, 4개 type(chain·procedure·contrast·hierarchy) |
| 웹 대응 | viewBox, CSS 변수 `--dg-*`, 다크 모드, 640px 이하 세로판, `<title>`/`<desc>` |
| 미리보기 | `preview.js --png` 헤드리스 Chrome으로 데스크톱 820px·모바일 400px PNG |
| 커버리지 | `terms.json` 41,230개 중 1,813개. 옛 키워드 범용 도식(`.term-figure`) 775개 페이지 |
| 색 의미 | 신경과학 기준(뉴런·별아교·미세아교)이 전 분야에 적용됨 |

## 1. 렌더러 확장

### 1.1 파일 구조
- `scripts/diagrams/lib.js`: 공통부만 남긴다 — 글자 폭 근사·줄바꿈, Canvas, 겹침 검사, describe, 검증 분배기, `renderSpec`/`renderFigure`.
- `scripts/diagrams/types/<type>.js`: type마다 `{ validate(spec, ctx) → string[], layout(cv, spec, orientation), dual: boolean }`.
  기존 4개(`linear.js`가 chain·procedure 공용, `contrast.js`, `hierarchy.js`)와 새 5개.
- 공개 API(`module.exports`)는 유지한다. `insert.js`·`preview.js`·`check.js`·테스트는 수정 없이 동작해야 한다.
- 회귀: `tests/diagrams-regression.test.js`가 `diagrams/specs/*.json` 전부를 렌더해 `terms/<slug>.html`의
  `<!-- concept-diagram:start/end -->` 사이 내용과 비교한다.

### 1.2 새 type

| type | 스펙 필드 | 배치 | 좁은 화면 |
|---|---|---|---|
| `cycle` | `nodes` 3~6개(순서 = 진행 방향) | 원형, 시계방향 화살표, 마지막→처음 연결 | 한 벌(축소) |
| `matrix` | `axes: {x:{label,low,high}, y:{label,low,high}}`, `nodes` 정확히 4개에 `cell: "tl"|"tr"|"bl"|"br"` | 2×2 격자 + 축 이름 | 한 벌 |
| `venn` | `nodes` 2~3개(집합), `regions: [{sets:["a","b"], label}]` | 겹치는 원, 영역 라벨 | 한 벌 |
| `timeline` | `events: [{when, label, sub?, color?}]` 2~7개 | 가로 축 위 표시 | 세로판 별도(dual) |
| `plot` | 아래 1.3 | 축 + 곡선 + 음영 + 수직선 | 한 벌, 범례 아래 |

공통: `nodes[].label`·`sub`·`color` 규칙은 v1과 같다. `edges`는 chain·procedure·hierarchy 전용,
cycle은 자동 생성, 나머지는 `[]`.

### 1.3 plot
좌표를 받지 않는다. 함수 이름과 매개변수만 받고 렌더러가 점을 계산한다(좌표가 틀리면 곧 거짓 정보이므로).

```json
"plot": {
  "series": [{"fn": "normal", "params": {"mu": 0, "sigma": 1}, "label": "귀무가설", "color": "gray"},
             {"fn": "normal", "params": {"mu": 2, "sigma": 1}, "label": "대립가설", "color": "blue"}],
  "shade":  [{"series": 1, "from": 1.64, "to": null, "label": "검정력"}],
  "vlines": [{"x": 1.64, "label": "임계값"}],
  "x": {"label": "검정통계량", "range": [-4, 6]},
  "y": {"label": "밀도"}
}
```

- 함수 10개: `normal(mu,sigma)`, `t(df)`, `chi2(df)`, `exponential(rate)`, `logistic(x0,k)`, `linear(a,b)`,
  `roc(auc)`(이항정규 모형, x·y 범위 [0,1] 고정), `hill(ec50,n)`, `inverted_u(peak,width)`, `decay(rate)`.
- `series` 1~3개, `shade` 0~2개, `vlines` 0~3개. `to: null`은 범위 끝까지.
- 눈금 숫자는 기본으로 숨긴다(`x.ticks: true`로만 표시). 도식 아래 "개념 설명용 모식도" 고정 문구.
- 검증: 미지의 `fn`, 매개변수 누락·범위 밖(sigma≤0, 0.5≤auc<1 아님 등), 계산값 NaN이면 오류.
- 겹침 검사는 라벨 bbox끼리, 그리고 라벨과 곡선 표본점 사이까지 본다.

### 1.4 공통 규칙
- 색은 기존 `--dg-*` 변수만 쓴다. plot 선은 팔레트 선 색, 음영은 채움 색.
- 새 type도 `<title>`·`<desc>`를 자동 생성한다(type별 읽는 순서 문장).

## 2. 스타일 가이드 (Stylist)

### 2.1 색 의미를 역할 기준으로
색값은 figlib 그대로 두고 작성 규칙만 바꾼다.

| 색 | 범용 | `mode: "bio"` |
|---|---|---|
| blue | 주체·구조·기본 요소 | 뉴런·구조 |
| violet | 방법·도구·매개·신호 | 분자·신호·방법 |
| amber | 외부 요인·개입·입력 | 미세아교·면역 |
| green | 바람직한 결과·보호·성공 | 별아교·보호 |
| rose | 문제·손상·위험·실패 | 병리·손상 |
| gray | 배경·기준·대조군 | 배경·대조 |

기존 스펙은 일괄 재색칠하지 않는다. `diagrams/README.md`의 색 표를 이 표로 바꾼다.

### 2.2 분야군 스타일 가이드
- 98개 분야를 약 12개 분야군으로 묶는 매핑: `diagrams/style/groups.json` (`{group: [category...]}`).
- 분야군마다 `diagrams/style/<group>.md`: 자주 맞는 type, 라벨 표기 관례(영문 약어 병기, 길이), 피할 표현, 좋은 예 2개.
- Stylist 에이전트가 그 분야군의 reviewed 스펙을 읽고 초안을 쓴다. 사용자가 한 번 승인한다.

## 3. 선별 (Planner 전반부)

- 대상: `terms.json`에서 기존 스펙 보유 용어, 용어 정리(prune/merge) 대상·스텁을 뺀 나머지.
  `.term-figure`가 있는 775개는 반드시 판정에 넣는다.
- 판정 에이전트 1개가 50개씩. 입력은 용어별 정의, "쉽게 풀면", "조금 더 깊게 보면".
- 출력(용어당):

```json
{"slug": "...", "verdict": "yes", "type": "plot",
 "intent": "이 그림을 보면 ___을 알 수 있다",
 "confidence": "high", "missing_fn": null}
```

- yes 조건(모두): ① 관계를 맺는 구성 요소 3개 이상(기전·단계·포함·비교 축·순환·시간 순서·수치 모양)
  ② 그림이 정의 반복이 아니라 새로 보여 주는 것이 있다(`intent`를 못 쓰면 no) ③ 논쟁 중인 주장을 단정하지 않고 그릴 수 있다.
- no 전형: 물질·화합물명, 인물, 지명, 단일 속성, 도식 있는 다른 용어의 동의어.
- `missing_fn`: plot이 맞는데 함수 10개로 못 그릴 때 필요한 함수 이름. 집계해 추가 여부를 정한다.

## 4. 생성·검수 파이프라인

```
판정(50개씩) → 작성(10개씩) → check.js ─실패→ 수정(최대 2회, 그래도 실패면 보류)
            → PNG(820/400) → 작성 에이전트 시각 자기검수 1회(Critic)
            → 독립 검수(다른 모델: 내용 + 두 PNG) → 통과/수정/탈락
            → 배치 표본 사용자 승인 → reviewed:true → build:diagrams
```

- 작성 입력: 페이지 본문, 판정의 type·intent, 참고 예시 3개, 분야군 스타일 가이드, README 규칙.
- 참고 예시(Retriever): 같은 type·같은 분야군의 reviewed 스펙 중 정의 텍스트 BM25 상위 3개.
  없으면 type만 맞춘다. 로컬 계산(`scripts/diagrams/retrieve.js`), 외부 의존성 없음.
- 모델: 판정·작성 Sonnet, 독립 검수 Opus 또는 Fable. 실행은 Claude Code 에이전트(구독 내).
- 확신이 낮은 연결은 스펙에 넣지 않고 `diagrams/batches/<n>/uncertain.md`에 기록한다.
- 상태: `diagrams/batches/<n>/status.json`에 용어별 `pending → triaged → drafted → checked → reviewed → approved | dropped`
  와 사유. 재실행 시 끝난 상태는 건너뛴다(멱등).
- 검수에서 "수정"이면 검수 에이전트가 직접 고치고 check.js·PNG를 다시 통과해야 한다.

## 5. 배치 운영

1. 파일럿: 무작위 500개 판정으로 수율·type 분포 실측. 9개 type 각 5개 이상, 스펙 50개 작성 → 전부 사용자 검토.
   프롬프트·스타일 가이드·함수 목록 조정, 하루 처리량 실측 후 일정 재산정.
2. 본 배치: 200개 단위, `data/popular-terms.json` 순서 우선. 배치마다 `diagrams/batches/<n>/preview.html`
   (무작위 표본 25개 + 검수 "수정" 전부 + 탈락 사유 목록)을 보여 주고 승인받는다.
3. 승인 시 `reviewed: true` → `npm run build:diagrams` → 배치별 커밋. 배포(push)는 매번 따로 확인.
4. 되돌리기: `inserted.json` 추적(v1과 같음).
5. 도식 삽입은 용어 정리 작업이 반영된 main 위에서 한다(같은 HTML 파일을 건드리므로 주기적으로 main 병합).

## 테스트

- 회귀: 기존 1,813개 렌더 결과 동일(1.1).
- type별 단위 테스트: 유효 스펙 렌더 성공·겹침 경고 0, 경계값(노드 수 상·하한), 잘못된 스펙의 검증 오류 메시지.
- plot: 함수별 수치 검증(예: normal 최대점이 mu, roc(0.5)는 대각선), 매개변수 오류.
- retrieve.js: 같은 type·분야군 우선, 대체 규칙.
- status.json 멱등 처리.
