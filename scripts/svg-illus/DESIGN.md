# svg-illus 설계: 도식·도해 공통 엔진

## 1. 목표와 범위

- 논문용어사전의 **도식**(scripts/diagrams, 9개 유형, 스펙 7,382개)과 **도해**(.superpowers/illus/gen-svg.js, 손으로 짠 11개)를 하나의 엔진과 디자인 언어로 묶습니다.
- 도식 스펙 JSON은 **한 줄도 고치지 않습니다**. 어댑터가 그대로 읽습니다.
- 사이트와 무관하게 쓸 수 있어야 합니다(대외활동 노트 등). 외부 의존성은 없습니다.

## 2. 구조

```
src/
  index.js          공개 API (toSVG / toFigure가 도식·도해를 자동으로 고름)
  theme.js          공통 토큰(--si-*), METRICS, themeCss(), colorRef()
  markup.js         첨자·분수 파싱, toTspan / toHtml(MathML) / richTextSvg / fracSvg, 범례 kind, 글자 폭 추정
  labels.js         라벨 겹침 회피·지시선(도해, 도식 overlay 공용)
  validate.js       도해 스펙 검증
  render.js         도해 렌더러 + 공통 figureHTML / legendHTML / tableHTML
  templates.js      도해 템플릿 5종
  measure.js        브라우저 실측 훅(canvas)
  diagram/
    index.js        도식 어댑터(validateDiagram, renderDiagramSVG, renderDiagram)
    core.js, types/*.js, plot-fns.js   원본 배치 알고리즘(ESM으로 옮김)
tools/parity.mjs    원본 렌더러와 전수 비교
examples/           스펙·빌드·비교 페이지 생성기
```

## 3. 공통 토큰

값은 기존 사이트의 `--dg-*`(figlib 팔레트)와 사이트 강조색을 그대로 옮겼습니다. 이름만 `--si-*`로 바꿨습니다.

### 색 역할

| 토큰 | 라이트 | 다크 | 역할 |
|---|---|---|---|
| `--si-{blue,green,amber,rose,violet,gray}-f` | #dde5f0 … | #1d2a3e … | 박스 면 |
| `-s` | #7f9ac0 … | #6f8fbf … | 박스 테두리, 도해 역할색 선 |
| `-t` | #12305c … | #c9d8f0 … | 박스 글자 |
| `--si-navy` | #12305c | #9fb6db | 도식 기본 선·화살표·글자 |
| `--si-pos` | #14543c | #7fcfa8 | 좋은 결과, 장점(＋) |
| `--si-limit` | #7d2626 | #f0a0a0 | 한계, 억제, 차단(✕) |
| `--si-general` | #5c6b7f | #9aa8b8 | 보조 글자, 축, 주석(도해의 `muted`) |
| `--si-badge-t` | #ffffff | #14171a | 번호 원 안 글자 |
| `--si-ink` | #1f2328 | #e6edf3 | 도해 기본 글자·선(currentColor) |
| `--si-accent` | #2454ff | #6ea8ff | 도해 강조(정사영, 각도 등) |
| `--si-accent-soft` | #eef4ff | #1e2a44 | 범례 배경 |
| `--si-bg`, `--si-border` | #fff, #e2e5e9 | #1c2128, #30363d | figure 바탕·테두리 |

의미 규칙은 기존 도식의 것을 그대로 따릅니다. green(pos)은 좋은 결과, rose(limit)는 한계·억제, navy는 중립 흐름입니다. 도해의 색 이름에는 `good`→pos, `bad`→limit, `muted`→general 별칭이 있습니다.

### 글꼴·선·여백(METRICS)

| 항목 | 값 | 출처 |
|---|---|---|
| 글꼴 | Pretendard, Noto Sans KR, Apple SD Gothic Neo | 두 시스템 공통 |
| 기본 글자 | 13px | 공통 |
| 보조 글자(엣지·주석·overlay) | 11.5px | 도식 |
| 첨자 | 72% | 도해 |
| 분수 | 80%, 가로선 굵기 max(0.8, size/16) | 신규 |
| 선 | 주 1.5, 가는 선(지시선) 0.8, 굵은 선 2.4 | 도식·도해 |
| 여백 | 14px, 박스 둥근 모서리 6, 박스 안 여백 12×10 | 도식 |

### 다크 모드

- 변수 값은 `prefers-color-scheme: dark`(단 `data-theme="light"`가 아닐 때)와 `:root[data-theme="dark"]` 두 곳에서 바뀝니다.
- SVG 속성의 색은 모두 `var(--si-x, 라이트 기본값)` 형식입니다. 그래서 CSS 없이 떼어 놓아도 라이트 색으로 보입니다. 떼어 쓰는 .svg 파일에는 `--embed-style`로 다크 값을 넣습니다.
- 분수의 MathML은 색을 지정하지 않습니다. 부모의 글자색을 상속하므로 다크 모드에서도 따라 바뀝니다(compare.html 다크에서 확인).

### 접근성

- `<svg role="img">`에 `<title>`을 둡니다. 도식은 기존대로 `<desc>`(유형별 describe 문장)와 `aria-labelledby`를 둡니다.
- 도해는 `desc` 필드를 주면 `<desc>`가 붙습니다.
- 표의 머리칸에는 `scope="col"`을 붙입니다.

## 4. 공통 마크업

```html
<figure class="si-figure [si-dual]" data-kind="diagram|illus" data-type="procedure|…" id="fig-…">
  <div class="si-frame">
    <svg class="si dg dg-h">…</svg><svg class="si dg dg-v">…</svg>   <!-- 도식: 가로·세로판(기존 규칙 그대로) -->
    <svg class="si si-illus">…</svg>                                 <!-- 도해 -->
  </div>
  <figcaption>
    <span class="si-caption">캡션</span>
    <dl class="si-legend"><div data-kind="var"><dt>…</dt><dd>…</dd></div></dl>
    <p class="si-note">기호 없는 주석</p>
    <div class="si-table-wrap"><table class="si-table">…</table></div>
    <span class="si-credit">출처 · 라이선스</span>
  </figcaption>
</figure>
```

- 기존 `.concept-diagram`과 `.term-illus`가 하나의 `.si-figure`로 합쳐집니다.
- 도식의 `spec.source`는 지금처럼 싣지 않습니다(검수 메모). 공개할 출처는 `credit`, `license` 필드를 따로 둡니다.
- plot의 "개념 설명용 모식도" 캡션은 `si-caption`으로 들어갑니다. 기존에는 작은 회색 글씨였는데, 이제 도해 캡션처럼 본문색으로 나옵니다. 이것이 눈에 보이는 유일한 변화이며, 승인할 때 확인할 항목입니다.

## 5. 어댑터 방식

1. 원본 `core.js`, `types/*.js`, `plot-fns.js`를 ESM으로 옮겼습니다. 배치 알고리즘은 바꾸지 않았고, 색 변수 이름만 `--dg-` → `--si-`로 바꿨습니다.
2. `renderDiagramSVG`는 원본 `renderSpec`과 같은 값을 돌려줍니다. 마지막에 `withFallbacks`가 색 기본값을 채웁니다.
3. `renderDiagram`은 원본 `renderFigure`와 같은 가로·세로 판단(dual, `H_FIT_W` 680)을 쓰고, 마크업은 `figureHTML`로 냅니다.
4. 확장 필드는 모두 선택입니다. 기존 스펙에는 없으므로 출력이 바뀌지 않습니다.
   - `overlay`: 도해 요소입니다. plot에서는 `cv.frame`(데이터 → 픽셀 변환)을 받아 데이터 좌표로 놓습니다. 라벨은 도식의 글자·박스를 장애물로 보고 피합니다.
   - `legend`, `table`, `caption`, `credit`, `license`.
   - 분수 `\frac{a}{b}` / `{frac:a,b}`, `autoFrac`. 분수가 없으면 `richTextSvg`는 원본과 같은 `<text>`를 냅니다. 노드 높이 보정 값도 0이 됩니다.
5. **동등성 검증**: `tools/parity.mjs`가 사이트의 전체 스펙 7,382개 × 가로·세로 = 14,764개 SVG를 원본 렌더러와 비교합니다. 색 변수 이름, 마커 id, svg 클래스만 같게 맞춘 뒤 비교하며, 결과는 **14,764개 모두 같음**입니다. 검증 오류 개수도 모든 스펙에서 원본과 같습니다.
6. plot 함수는 원본 10개에 plot-ext.json이 제안한 7개를 더했습니다(power, reciprocal, prospect_value, quadratic_pair, step_survival, concentration_time, cox_hazard). 배열 매개변수 규칙 `{arr:true}`를 추가했습니다.

## 6. 도해의 일반화

- 손으로 짠 `begin/txt/line/finish` 패턴을 JSON 요소 목록으로 바꿨습니다. 장애물(선분, 테두리, 작은 원, 호 근사, 곡선)은 요소에서 바로 계산합니다. 정규식으로 SVG를 다시 읽던 방식을 대체했습니다.
- 겹침 회피 알고리즘은 원본(후보 오프셋을 거리순으로 탐색하고 16px 넘게 옮기면 지시선)을 그대로 씁니다. 측정 훅(`measureText`)과 `fixed`·`avoid:false`·명시 `leader`를 더했습니다.
- 원본 대비 재현: vector-projection, dihedral-angle, actuator를 스펙으로 다시 만들었습니다. examples/index.html에서 원본과 나란히 볼 수 있습니다. 차이는 actuator의 캡·헤드 마개를 회색 채움 대신 해치(단면 빗금)로 바꾼 것, θ 라벨 위치가 몇 px 다른 것입니다.
- 원본 gen-svg.js에서 발견한 문제: vector-projection 블록의 `LEG`에 color-wheel의 범례(HSL·보색)가 들어가 있습니다. legend.json에는 올바른 범례가 있어서 페이지에는 영향이 없습니다. 하지만 gen-svg.js를 다시 돌리면 legend.json이 틀린 내용으로 덮어써집니다. 이 예제에는 legend.json의 올바른 범례를 넣었습니다.

## 7. 이행 계획(실행하지 않음)

**전제: 사용자가 compare.html을 승인한 뒤에만 시작합니다.**

| 단계 | 내용 | 바뀌는 페이지(추정) | 확인 |
|---|---|---|---|
| 0 | `style.css`에 `--si-*` 토큰과 `.si-figure` 규칙을 **추가**합니다. 기존 `--dg-*`, `.concept-diagram`, `.term-illus`는 그대로 둡니다. | 0(마크업 변화 없음) | 시각 회귀 없음 |
| 1 | `scripts/diagrams/lib.js`의 `renderFigure`가 svg-illus 어댑터를 부르게 합니다. 유형별 플래그로 한 유형씩 켭니다. 순서는 venn(52) → timeline(159) → matrix(184) → cycle(301) → plot(323) → contrast(1,264) → procedure(1,224) → hierarchy(1,362) → chain(2,513)입니다. 작은 유형부터 켜서 문제를 일찍 잡습니다. | 유형별 스펙 수 = 그 유형 페이지 수. 전체는 도식이 들어간 페이지 약 7,378개 | 유형마다 golden 갱신, check.js, 표본 20쪽 육안 확인(라이트·다크·폭 375px) |
| 2 | 도해 19개(`term-illus`)를 `.si-figure` 마크업으로 바꿉니다(scripts/illus/insert.js). 코드 SVG 11개는 스펙으로 옮기고, 위키미디어 그림 8개는 `<img>`를 si-frame에 넣고 credit·license를 붙입니다. | 19 | 원본과 나란히 비교 |
| 3 | 모든 페이지가 바뀐 뒤 `--dg-*`, `.concept-diagram`, `.term-illus` CSS를 지웁니다. | 0 | grep으로 남은 사용처 0건 확인 |

- **golden 테스트**: `tests/fixtures/diagrams-golden.json`은 렌더 HTML의 해시라서 마크업이 바뀌면 모든 항목이 달라집니다. 단계 1에서 유형을 하나 켤 때마다 다음 순서로 진행합니다. (1) `tools/parity.mjs`로 SVG 동등성을 확인합니다(색 이름·클래스 차이 외 0건). (2) 그 유형의 golden만 `golden.js --write`로 다시 씁니다. (3) 커밋 메시지에 "마크업만 변경, SVG 동등성 14,764/14,764"라고 적습니다.
- 바뀌는 것: figure 클래스, 색 변수 이름, plot 캡션의 글자색. 배치, 글자, 크기는 같습니다.
- 되돌리기: 단계마다 플래그 한 줄이라 바로 되돌릴 수 있습니다. CSS는 단계 3 전까지 두 벌이 함께 있습니다.
- 사이트 저장소는 공개 저장소입니다. svg-illus를 vendor 폴더로 복사할지 서브모듈로 둘지는 승인할 때 정합니다(vendor 복사를 권장합니다. 의존성이 없는 파일 13개입니다).
