# svg-illus

JSON 스펙을 SVG 그림으로 바꾸는 라이브러리입니다. 외부 의존성이 없고, Node와 브라우저에서 같은 코드(ESM)가 그대로 돌아갑니다.

두 종류의 그림을 같은 디자인 언어로 그립니다.

- **도해(illus)**: 선·호·곡선·해치 같은 기본 요소를 좌표로 놓는 그림입니다. 기하 도형, 단면도, 함수 그래프, 장치 개념도가 여기에 속합니다.
- **도식(diagram)**: 노드와 화살표를 자동으로 배치하는 개념 그림입니다. procedure, chain, hierarchy, matrix, contrast, plot, cycle, timeline, venn 9개 유형이 있습니다. 논문용어사전의 `diagrams/specs/*.json`을 고치지 않고 그대로 읽습니다.

색·글꼴·선 굵기·figure 마크업·범례·대응표는 두 종류가 같이 씁니다. 설계는 [DESIGN.md](DESIGN.md)에 정리했습니다.

## 설치 없이 쓰기

Node 18 이상이면 됩니다. `npm install`은 필요 없습니다.

```sh
# SVG 하나 만들기
node bin/svg-illus.js examples/specs/vector-projection.json -o out.svg

# figure + figcaption(캡션·기호 범례·대응표·출처) HTML 조각
node bin/svg-illus.js examples/specs/activity-process.json --html -o out.html

# 공통 CSS(색 토큰·다크 모드·figure 구조)
node bin/svg-illus.js --css > svg-illus.css
```

옵션은 다음과 같습니다.

| 옵션 | 뜻 |
|---|---|
| `-o 파일` | 파일로 저장합니다. 없으면 표준 출력으로 냅니다. |
| `--html` | SVG 대신 `<figure>` 조각을 냅니다. |
| `--embed-style` | SVG 안에 다크 모드 `<style>`을 넣습니다. 따로 떼어 쓰는 .svg 파일에 씁니다. |
| `--strict` | 라벨 겹침을 해결하지 못하면 오류로 끝냅니다. |
| `--css` | 공통 CSS를 출력합니다. |

스펙이 도식인지 도해인지는 CLI가 알아서 판단합니다. `type`이 9개 유형 중 하나이고 `elements`가 없으면 도식으로 봅니다.

### 코드에서 쓰기

```js
import { toSVG, toFigure, renderSVG, templates } from './svg-illus/src/index.js';

const svg = toSVG(spec);        // 도식·도해 공통
const html = toFigure(spec);    // figure 조각
const { svg: s, report } = renderSVG(spec, { templates }); // report.unresolved: 겹침이 남은 라벨
```

브라우저에서는 `<script type="module">`로 `src/index.js`를 불러오면 됩니다. 실제 글꼴로 글자 폭을 재려면 측정 훅을 넘깁니다.

```js
import { renderSVG, canvasMeasure } from './src/index.js';
renderSVG(spec, { measureText: canvasMeasure() });
```

## 도해 스펙 형식

```json
{
  "id": "vector-projection",
  "width": 520, "height": 330,
  "title": "벡터 정사영과 기각",
  "frame": { "origin": [70, 270], "scale": 48 },
  "points": { "O": [0, 0], "A": [3, 4], "B": [6, 1.2] },
  "elements": [
    { "type": "arrow", "from": "O", "to": "B", "width": 2 },
    { "type": "arc", "center": "O", "between": ["B", "A"], "r": 34, "label": "θ" },
    { "type": "text", "at": "A", "text": "a", "offset": [-14, -6], "weight": 700 }
  ],
  "legend": [{ "sym": "θ", "desc": "a와 b 사이의 각" }],
  "credit": "직접 작성 도해", "license": "CC BY 4.0"
}
```

### 좌표

- 점은 `[x, y]`, `spec.points`에 정의한 이름(`"A"`), 극좌표 `{ "polar": [r, 각도], "from": 중심 }` 중 하나로 씁니다. 각도의 단위는 도(°)이고, 오른쪽이 0°, 반시계 방향이 + 입니다.
- `frame`이 없으면 픽셀 좌표를 씁니다(y가 아래로 커짐).
- `frame: {origin: [px, py], scale: k 또는 [kx, ky]}`를 주면 수학 좌표를 씁니다(y가 위로 커짐). 요소에 `"px": true`를 붙이면 그 요소만 픽셀 좌표로 씁니다.
- `axes: {x: {min, max, step?, label?}, y: {...}, grid?: true}`를 주면 frame을 자동으로 정하고 축과 눈금을 그립니다.
- 코드에서는 `polar(r, deg, center)` 함수도 쓸 수 있습니다.

### 요소

| type | 필수 필드 | 비고 |
|---|---|---|
| `line`, `arrow` | `from`, `to` | `arrow: "end"|"start"|"both"`, `label` |
| `circle` | `center`, `r` | |
| `ellipse` | `center`, `rx`, `ry` | `rotate`(도) |
| `polygon`, `polyline` | `points` | |
| `rect` | `x,y,w,h` 또는 `from,to` | `radius`, `label` |
| `arc` | `center`, `r` + `start,end` 또는 `between:[점,점]` | 각도 표시. `label`, `labelRadius`. 반지름은 항상 px입니다. |
| `rightAngle` | `at`, `dir1`, `dir2` | 직각 표시 |
| `curve` | `fn`+`domain` 또는 `points` | `fn`은 `"sin(x)^2"`처럼 x와 Math 함수만 씁니다. `smooth`(점 목록) |
| `hatch` | `points` 또는 `x,y,w,h` | 단면 빗금. `angle`, `gap` |
| `text` | `at`, `text` | `size`, `anchor`, `weight`, `italic`, `color`, `offset`, `fixed`, `leader:[x,y]`, `avoid:false` |
| `dot` | `at` | |
| `marker` | `at`, `n` | 대응표 번호 원. `target`을 주면 지시선 |
| `path` | `d` | SVG path 그대로 |
| `group` | `elements` | `transform`, `opacity` |

공통 스타일 필드는 `stroke`(또는 `color`), `fill`, `width`, `dash`(`true`, `"6 4"`, 배열), `opacity`, `fillOpacity`, `obstacle:false`입니다. `obstacle:false`를 붙인 요소는 라벨 겹침 검사에서 뺍니다.

### 라벨

- **자동 겹침 회피**: 모든 라벨의 경계상자를 추정합니다. 다른 라벨, 선분, 작은 점, 캔버스 밖과 겹치면 가까운 빈자리로 옮깁니다. 16px보다 멀리 옮기면 원래 자리에서 지시선을 긋습니다. 옮기면 안 되는 라벨에는 `fixed: true`를 붙입니다.
- **첨자**: `x_{1}`, `x^{2}`를 씁니다. 한 글자면 `x_1`처럼 중괄호를 빼도 됩니다.
- **분수**: `\frac{1}{3}` 또는 `{frac:1,3}`로 씁니다. SVG에서는 분자, 가로선, 분모를 따로 배치합니다. 글자 크기는 0.8배이고, 폭은 분자와 분모 중 긴 쪽에 맞춥니다. HTML 범례와 캡션에서는 MathML `<mfrac>`을 씁니다. 스펙에 `"autoFrac": true`를 주면 `1/3`처럼 숫자/숫자인 것만 분수로 바꿉니다. km/h, 날짜, URL, 소수는 바꾸지 않습니다.
- JSON 안에서는 역슬래시를 두 번 써야 합니다: `"\\frac{1}{3}"`.

### 기호 범례(`legend`)

`[{ sym, desc, kind? }]` 형식입니다. `kind`를 생략하면 자동으로 판정합니다. 판정 결과에 따라 기울임 여부가 정해집니다.

| kind | 예 | 표시 |
|---|---|---|
| `var` | θ, n_{1} | 기울임 |
| `expr` | proj_{b} a | 한 글자 변수만 기울임(proj는 정체) |
| `func` | cos | 정체 |
| `const` | π | 정체 |
| `abbr` | HSL | 정체 |
| `unit` | µm | 정체(명시할 때만) |
| `term` | 피스톤 | 정체 |
| `note` | (sym 없음) | 범례 아래 주석 문단 |

### 대응표(`table`)

```json
"table": { "numbered": true, "columns": ["영어", "한국어"], "rows": [["piston", "피스톤"], ["rod", "로드"]] }
```

`numbered`가 true면 번호 열이 붙습니다. 그림 안에서는 `{ "type": "marker", "at": [...], "n": 1 }`로 같은 번호를 찍습니다.

## 템플릿

템플릿은 매개변수를 받아 스펙을 만드는 함수입니다. 스펙에 `"template"`과 `"params"`를 쓰면 됩니다.

| 템플릿 | 용도 | 주요 params |
|---|---|---|
| `crossSection` | 단면도(부품 라벨) | `parts:[{name, x,y,w,h, fill?, hatch?}]`. 라벨은 바깥 열에 늘어놓고 지시선으로 잇습니다. |
| `geometry` | 기하 도형 + 각도 | `points`(수학 좌표), `polygons`, `segments`, `angles:[{at,from,to,label}]`, `rightAngles` |
| `functionPlot` | 좌표 평면 + 함수 | `x`, `y` 범위, `fns:[{expr,label,color}]`, `shade:[{expr,from,to}]`, `points` |
| `structure` | 라벨 있는 구조도 | `nodes:[{id,text,sub,at,color}]`, `edges:[{from,to,label}]`, `numbered` |
| `flow` | 단계 흐름(활동 과정) | `steps:[문자열 또는 {text,sub,color}]`, `perRow` |

```json
{ "template": "functionPlot", "title": "사인 곡선",
  "params": { "x": [-4, 4], "y": [-1.5, 1.5], "fns": [{ "expr": "sin(x)", "label": "y = sin x" }] } }
```

## 도식(9개 유형)

사이트 스펙을 그대로 넣으면 됩니다.

```sh
node bin/svg-illus.js ../term-style/diagrams/specs/3-hydroxykynurenine.json --html
```

도식 스펙에는 다음 필드를 선택해서 더 쓸 수 있습니다. 기존 스펙에는 없는 필드라 넣지 않으면 결과가 원래와 같습니다.

- `overlay`: 도해 요소 배열입니다. plot에서는 데이터 좌표, 다른 유형에서는 픽셀 좌표로 놓습니다(`overlayCoords: "px"`로 강제할 수 있습니다). 라벨은 도식의 글자와 박스를 피해서 놓입니다. 주석 라벨이나 영역 음영을 넣을 때 씁니다.
- `legend`, `table`, `caption`, `credit`, `license`: 도해와 같은 figcaption 구조로 나옵니다.

plot 함수는 기존 10개(normal, t, chi2, exponential, logistic, linear, roc, hill, inverted_u, decay)에 27개를 더했습니다: bet, binomial_pmf, saturation_exp, birthday_collision, planck(λ는 µm), log, arrhenius_ratio, complement_power, gain_amplification, poisson, bose_einstein, cohesive_triangle, unbalance_response, laplace, sin_squared, cumulative_sin_squared, stretched_exp, damped_oscillation, km_function(쿠벨카-뭉크 K/S), mixing_free_energy(플로리-허긴스 혼합 자유에너지, 매개변수 N1·N2·chi), power, reciprocal, prospect_value, quadratic_pair(branch 0=펌프, 1=계통), step_survival, concentration_time, cox_hazard. 이어서 f_dist(F 분포), moving_avg_mag(이동평균 진폭 응답), iso834(표준 화재 곡선), square_partial(사각파 푸리에 부분합), eps_ntu(열교환기 유효도, branch 0=대향류·1=병류)를 더했습니다.

## 예제

| 파일 | 내용 |
|---|---|
| `vector-projection`, `dihedral-angle`, `actuator` | 사전의 기존 도해를 스펙으로 다시 만든 것입니다. 원본은 `examples/original/`에 있습니다. |
| `activity-process` | 대외활동 노트용 예시입니다. 활동 6단계 흐름과 번호 대응표를 담았습니다. |
| `device-concept` | 장치 개념도 예시입니다(센서 → 제어기 → 펌프·알림). |
| `fn-plot`, `triangle-angles`, `pipe-section` | 템플릿 예시입니다. |
| `plot-overlay` | 도식(plot) 위에 도해 요소를 얹은 예시입니다. |
| `fraction-bar`, `fraction-chain` | 분수 표기 예시입니다(도해와 도식). |

```sh
node examples/build.js     # examples/out/*.svg, examples/index.html (원본과 나란히 보기)
node examples/compare.js   # compare.html: 기존 도식 렌더러 vs svg-illus 27개 + 도해 예제
node tools/parity.mjs      # 사이트 스펙 전체로 기존 렌더러와 결과가 같은지 확인
npm test                   # 또는 node --test
```

`examples/index.html`이나 `compare.html`을 브라우저에서 열어 확인합니다. 오른쪽 위 버튼을 누르면 다크 모드로 바뀝니다.

## 다크 모드와 팔레트

- 모든 색은 `--si-*` CSS 변수로 나옵니다. 각 변수에는 기본값이 붙어 있습니다(`var(--si-accent,#2454ff)`). 그래서 CSS가 없어도 라이트 색으로 보입니다.
- `svg-illus --css`로 만든 CSS를 페이지에 넣으면 `prefers-color-scheme: dark`나 `:root[data-theme="dark"]`일 때 다크 값으로 바뀝니다.
- 글자와 기본 선은 `currentColor`를 씁니다. 부모 요소의 글자색을 따라갑니다.
- 색 이름에는 `fg`, `muted`, `accent`, `navy`, `pos`(=good), `limit`(=bad), 역할색 `blue·green·amber·rose·violet·gray`(테두리), `blue-f`(면), `blue-t`(글자)를 쓸 수 있습니다. CSS 색값을 그대로 써도 됩니다.
- 그림 하나의 팔레트만 바꾸려면 스펙에 `"palette": {"accent": "#d6336c"}`을 넣습니다.
- 페이지에 인라인으로 넣지 않고 따로 떼어 쓰는 .svg 파일에는 `--embed-style`을 붙입니다.

## 노트에 넣기

**HTML 노트**: `--html` 출력을 본문에 붙이고 `svg-illus.css`를 한 번 불러옵니다. 그림이 페이지에 인라인으로 들어가야 다크 모드 변수가 적용됩니다.

```html
<link rel="stylesheet" href="svg-illus.css">
<!-- node bin/svg-illus.js activity.json --html 출력 -->
<figure class="si-figure" ...>...</figure>
```

**마크다운 노트**(Obsidian, Notion, GitHub 등)는 두 방법 중 하나를 씁니다.

1. 이미지로 넣기: `node bin/svg-illus.js a.json --embed-style -o a.svg`로 만든 뒤 `![활동 과정](a.svg)`로 넣습니다. 범례는 마크다운 표로 따로 적습니다.
2. HTML을 허용하는 편집기라면 `--html` 조각을 그대로 붙입니다. GitHub처럼 `<style>`을 지우는 곳에서도 색 변수의 기본값 덕분에 라이트 색으로는 보입니다.

## 테스트

`node --test`로 돌립니다. 다음 항목을 확인합니다: 겹침 회피(빈자리 찾기, 지시선, fixed, 측정 훅), 첨자와 분수 파싱, MathML 출력, 범례 kind, 스펙 검증 오류(경로 표시, 수식 이름 제한), 템플릿, 도식 어댑터와 overlay, plot 함수 37개.
