# 개념 도식 (diagrams/)

용어 하나에 도식 1점. 좌표를 손으로 찍지 않고 **type + 노드/엣지**만 쓰면 자동 배치된다.
스타일은 `tools/figlib.py`(학회 기록용 SVG DSL)의 팔레트·박스·화살표 규칙을 따른다.

## 흐름

```
diagrams/specs/<slug>.json      스펙(사람이 검수)  ← 여기만 손으로 쓴다
        │  npm run preview:diagrams      검증 + diagrams/preview.html (+ --png)
        │  reviewed: true 로 바꾼 뒤
        ▼  npm run build:diagrams        terms/<slug>.html 에 인라인 삽입
terms/<slug>.html  <!-- concept-diagram:start/end -->
```

- `reviewed: false`인 스펙은 **사이트에 넣지 않는다.** 미리보기에서만 보인다.
- 검수를 취소하거나 스펙을 지우면 다음 `build:diagrams` 때 페이지에서도 빠진다(`inserted.json`이 추적).
- 이미 키워드 매칭으로 들어간 범용 도식(`.term-figure`)이 있는 페이지는 이 도식으로 교체된다.

## 스펙 형식

```json
{
  "slug": "neuroinflammation-cascade",
  "type": "chain",
  "mode": "bio",
  "nodes": [
    {"id": "a", "label": "손상·병원체", "color": "rose", "sub": "DAMP·PAMP"},
    {"id": "b", "label": "미세아교 활성", "color": "amber", "sub": "TLR 인식"}
  ],
  "edges": [{"from": "a", "to": "b", "kind": "arrow", "label": "선택"}],
  "notes": [{"text": "급성 반응은 회복에 기여", "tone": "limit"}],
  "source": "근거 문헌",
  "reviewed": false
}
```

| 필드 | 값 |
|---|---|
| `type` | `chain` 기전·경로 · `procedure` 방법 단계(①② 번호 자동) · `contrast` 좌우 대비 · `hierarchy` 포함·분류 트리 · `cycle` 순환 · `matrix` 2×2 · `venn` 집합 겹침 · `timeline` 연표 · `plot` 함수 곡선 |
| `nodes[].color` | 역할 기준: `blue` 주체·구조·기본 · `violet` 방법·도구·매개·신호 · `amber` 외부 요인·개입·입력 · `green` 바람직한 결과·보호·성공 · `rose` 문제·손상·위험·실패 · `gray` 배경·기준·대조군. `mode: "bio"`에서는 blue 뉴런, green 별아교, amber 미세아교·면역, rose 병리, violet 분자·신호 |
| `nodes[].label` / `sub` | 라벨 한글 10자, sub 14자 이내 권장(넘으면 자동 줄바꿈) |
| `edges[].kind` | `arrow` 활성화 · `inhibit` 억제(평평한 끝) · `blocked` 차단(✕) |
| `notes[].tone` | `pos` 긍정·보호 · `limit` 한계·논쟁 · `general` |
| `source` | 근거 문헌. **검수용 메모**라 페이지에는 표시하지 않는다 |
| `reviewed` | `false`면 사이트에 안 나감 |

type별 규칙:
- **chain / procedure**: `nodes` 순서대로 한 줄 배치. 인접하지 않은 노드 사이 엣지는 위쪽 호로 그린다(최대 1~2개).
- **contrast**: 노드마다 `side`(`left`/`right`)와 `row`(0=머리, 1…=비교 속성). 좌우 행 수가 같아야 한다. `edges`는 `[]`. 선택적으로 최상위 `axis`(비교 기준 한마디).
- **hierarchy**: `edges`가 부모→자식. 루트 1개, 사이클 없음. 자식 순서는 `nodes` 순서를 따른다.
- **cycle**: `nodes` 3~6개, 순서가 진행 방향(12시부터 시계방향). `edges`는 `[]`(자동 연결). 선택적 `center`(가운데 이름).
- **matrix**: `axes: {x: {label, low, high}, y: {label, low, high}}`, `nodes` 정확히 4개에 `cell`(`tl`·`tr`·`bl`·`br`). `edges`는 `[]`.
- **venn**: `nodes` 2~3개가 집합. `regions: [{sets: [id…], label}]`로 영역 라벨(선택). `edges`는 `[]`.
- **timeline**: `nodes`·`edges` 대신 `events: [{when, label, sub?, color?}]` 2~7개. 간격은 균등. 가로·세로 두 벌.
- **plot**: `nodes`·`edges` 대신 `plot`. 좌표를 쓰지 않고 함수 이름과 매개변수만 쓴다.
  `series` 1~3개(`fn`·`params`·`label`·`color`), `shade` 0~3개(`series` 번호·`from`·`to`(null=끝까지)·`label`),
  `vlines` 0~3개(`x`·`label`), `x: {label, range: [lo, hi], ticks?}`, `y: {label, ticks?}`.
  함수: `normal(mu,sigma)` `t(df)` `chi2(df)` `exponential(rate)` `logistic(x0,k)` `linear(a,b)`
  `roc(auc)`(0.5≤auc<1, 범위 [0,1] 고정, 다른 함수와 혼용 불가) `hill(ec50,n)` `inverted_u(peak,width)` `decay(rate)`.
  눈금 숫자는 기본으로 숨기고, 페이지에는 "개념 설명용 모식도" 캡션이 붙는다.
  곡선·음영은 그래프 영역 밖을 잘라 내고, 0 근처에서 발산하는 곡선(chi2 df<2 등)은 세로 범위를 98백분위로 자른다.

## 웹 대응

- `viewBox`만 쓰고 `width`/`height` 속성은 없음. svg에 `max-width: <viewBox 폭>px`를 인라인으로 걸어 좁은 도식이 확대되지 않게 한다.
- 렌더러 구조: `scripts/diagrams/core.js`(공통) + `types/<type>.js`(검증·배치·설명문) + `lib.js`(공개 API). 새 type은 `types/index.js`에 등록한다.
- 회귀: `tests/diagrams-golden.test.js`가 기존 스펙의 렌더 결과가 바뀌지 않았는지 본다. 렌더 결과를 의도적으로 바꿨다면 `node scripts/diagrams/golden.js --write`로 갱신한다.
- 색은 전부 CSS 변수(`--dg-*`, style.css). 다크 모드 값은 `:root[data-theme="dark"]`.
- chain·procedure(그리고 가로판이 450px를 넘는 hierarchy)는 가로·세로 두 벌을 넣고, 640px 이하에서 세로판만 보인다.
- `<title>`(용어명)과 `<desc>`(읽는 순서 한 문장)을 자동 생성한다.
- 글자 폭은 근사치로 재서 줄바꿈하고, 텍스트끼리·텍스트와 박스의 겹침을 검사해 경고한다(`--strict`면 실패).
- 겹침 검사에 더해 보기 영역 밖으로 나간 글자, venn 영역 라벨이 제 영역에 안 들어간 경우, cycle 가운데 글자를 화살표가 지나는 경우도 경고한다.
