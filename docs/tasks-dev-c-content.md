# 개발자 C 작업지시서 — 콘텐츠 / 용어 확충 (바이브코딩)

담당 영역: 용어 콘텐츠 추가/보강, 카테고리 설명, 관련 용어 보완, 간단한 UI 카피 작업.
반복 패턴이 많은 작업 위주로 구성했습니다. AI 코딩 도구로 속도 내기 좋은 영역이라, 패턴 하나 익히면 나머지는 빠르게 처리 가능합니다.
피드백 주기가 길 수 있으니, 각 작업은 아래 **완료 기준**을 스스로 체크하고 다음 작업으로 넘어가면 됩니다.

---

## 1. 신규 용어 추가 (최우선, 지속 작업)

**현재 구조 파악**
- [terms.json](../terms.json)에 각 용어가 아래 형식으로 들어있음:
```json
{
  "slug": "p-value",
  "title_ko": "유의확률",
  "title_en": "p-value",
  "categories": ["stat", "method"],
  "definition": "...",
  "aliases": ["유의값", "p값"]
}
```
- `aliases`는 검색창에서 정식 명칭(`title_ko`/`title_en`)이 아닌 다른 이름으로 검색해도 이 용어가 나오게 하는 필드 (연관검색어). 예: 표준편차 → `["SD", "std"]`
- 각 용어는 `terms/<slug>.html` 페이지도 별도로 존재 (예: [terms/anova.html](../terms/anova.html) 참고해서 동일한 HTML 구조로 새 페이지 작성)
- 카테고리 코드는 12개 중에서 선택: stat, method, tool, ethics, physchem, bioearth, neuro, medhealth, psych, socialecon, eng, cs

**할 일**
- 기존 용어 중 애매하거나 부실한 정의 개선
- 아직 없는 용어 신규 추가 — 우선순위: 검색은 많이 되는데 없는 용어 (개발자 A가 만드는 `tg_search_log`에서 0건 검색어 확인해서 우선순위 삼기, 아직 준비 안 됐으면 일단 통계/연구방법론 기초 용어부터)
- 새 용어 추가 시 **반드시** terms.json 업데이트 + terms/<slug>.html 페이지 생성 두 가지 다 해야 함 (하나만 하면 사이트맵/검색에서 깨짐)
- terms.json 업데이트 시 **`aliases`(연관검색어)도 같이 채울 것** — 이 용어가 다른 이름/약어/표기법으로도 불리는지 확인해서 배열로 추가 (없으면 빈 배열 `[]`로 명시). 예: 약어(SD, RCT), 다른 한글 표기(카이자승검정), 잘 쓰이는 영문 표기 등. 확신 없는 약한 후보는 넣지 말 것 — 실제로 흔히 쓰이는 이름만.

### 대량 신규 용어 추가 시 (수백 개 단위) — 서브에이전트 사용 루틴

토큰 절약을 위해 아래 방식을 따를 것 (한 번에 여러 서브에이전트를 병렬로 쪼개 쓰지 말 것 — 에이전트마다 고정 오버헤드가 붙어서 쪼갤수록 총 토큰이 늘어남):

- **배치 크기: 한 번에 100개**씩 처리
- **서브에이전트 1개**가 그 100개를 전부 맡음 (terms.json 항목 + aliases + terms/<slug>.html 페이지 생성까지 한 번에). 5개로 쪼개서 병렬 실행하지 말 것.
- 100개가 서브에이전트 컨텍스트에 부담되면 최대 2개까지만 분할 (그 이상 쪼개지 말 것)
- 한 배치(100개) 완료 후 결과 중 10~15개 스팟체크(slug 중복, JSON 유효성, aliases 확신도) 하고 다음 100개로 넘어감

### 새 용어 페이지 작성 시 반드시 지킬 형식 (임의 변형 금지)

[terms/anova.html](../terms/anova.html)을 표준 템플릿으로 삼아 아래 구조를 **그대로** 따라주세요. 헤더/푸터/스크립트 태그를 빠뜨리거나 순서를 바꾸면 검색·로그인 상태 표시·모바일 메뉴가 깨집니다.

1. **`<head>` 필수 태그 4종** (다른 값으로 채워야 하는 부분만 아래처럼 바꾸고 구조는 그대로):
   ```html
   <title>{한글명}({영문약어 있으면 병기})란? 쉬운 뜻과 논문 예문 - 논문용어사전</title>
   <meta name="description" content="{이 용어를 왜/누가 찾는지 1~2문장, 120자 내외}">
   <link rel="canonical" href="https://jaeho9158.github.io/term-glossary/terms/{slug}.html">
   ```
   - `title`과 `description`은 페이지마다 **반드시 다르게** 작성 (중복 title은 검색엔진 감점 요인 — 개발자 D의 서치콘솔 작업과 직결)
2. **`<body data-base="../">`** 속성 그대로 유지 (검색 스크립트가 이 값으로 상대경로 계산함)
3. **헤더/네비게이션**: anova.html의 `<header class="site-header">` 전체 블록을 통째로 복붙 (로고, 검색창, 메뉴 토글, nav 링크 6개 — 절대 일부만 가져오지 말 것)
4. **breadcrumb + h1**: `<p class="breadcrumb"><a href="../index.html">용어 목록</a> &gt; {한글명}</p>` 다음 줄에 `<h1>{한글명} ({영문명 있으면})</h1>`
5. **정의 박스**: 아래 클래스명/문구를 정확히 지킬 것 — `extract-definitions.js` 스크립트가 `한 줄 정의:` 뒤 텍스트를 정규식으로 긁어서 terms.json에 자동 반영하므로, 이 문구가 다르면 자동화가 깨짐
   ```html
   <div class="definition-box">
     <strong>한 줄 정의:</strong> {한 문장 정의}
   </div>
   ```
6. **본문 섹션**: `<h2>쉽게 풀면</h2>`(비유/예시 포함 설명), `<h2>논문에서는 이렇게 쓰입니다</h2>`(`<div class="example">` 안에 실제 논문 문장 예시 + 해석), `<h2>주의할 점</h2>`(흔한 오해나 한계) — 이 3개 섹션 제목은 고정, 순서도 그대로
7. **관련 용어**: 위 2번 작업 형식과 동일 (`<div class="related-terms">`)
8. **`<footer class="site-footer">`**: anova.html 그대로 복붙 (연도만 실제 작성 연도로)
9. **스크립트 태그 4개, 이 순서 그대로 `</body>` 직전에**:
   ```html
   <script src="../assets/header-search.js"></script>
   <script type="module" src="../assets/nav-auth.js"></script>
   <script type="module" src="../assets/term-history.js"></script>
   <script src="../assets/mobile-nav.js"></script>
   ```

### terms.json 작성 시 주의사항
- 파일은 **UTF-8**로 저장 (한글 깨짐 주의, 에디터의 인코딩 설정 확인)
- `slug`는 파일명과 완전히 동일해야 함 (`{slug}.html`), 소문자+하이픈만 사용
- **slug 중복 검사 필수** — 새 용어 추가 후 아래 스크립트로 확인 (Node 설치되어 있으면 터미널에서 실행):
  ```
  node -e "const d=require('./terms.json'); const s=d.map(x=>x.slug); console.log('중복:', s.filter((v,i)=>s.indexOf(v)!==i))"
  ```
  출력이 빈 배열(`[]`)이어야 정상
- `categories`는 반드시 아래 12개 코드 중에서만 골라 배열로: `stat, method, tool, ethics, physchem, bioearth, neuro, medhealth, psych, socialecon, eng, cs` (오탈자로 새 코드를 만들면 홈페이지 카테고리 섹션에서 안 보이거나 "일반 용어"로 빠짐)
- terms.json은 배열 전체를 다시 저장하는 구조이므로, 편집 후 **유효한 JSON인지 검증** (아래 명령으로 확인):
  ```
  python -c "import json; d=json.load(open('terms.json',encoding='utf-8')); print('OK', len(d))"
  ```

**완료 기준**
- 새 용어마다: terms.json에 slug/title_ko/title_en/categories/definition/aliases 다 채워짐, 대응하는 terms/<slug>.html 페이지가 위 9개 항목 형식을 전부 지켜서 실제로 브라우저에서 정상 열림, 홈페이지 카테고리 섹션에 자동으로 노출됨 확인
- 정의는 최소 2~3문장, 전문용어 남발하지 않고 처음 보는 사람도 이해할 수 있는 수준으로
- slug 중복 검사 스크립트 실행 결과 빈 배열, terms.json JSON 유효성 검증 통과

---

## 2. 관련 용어 보완

**현재 문제**: [terms/anova.html](../terms/anova.html)의 "관련 용어" 섹션처럼, 대부분 페이지에 관련 용어 링크가 수작업으로 몇 개씩만 들어가 있거나 아예 없음.

**할 일**
- 개발자 A가 자동 추천 스크립트를 만들면, 그 결과가 실제로 말이 되는 관련어인지 검수 (기계적으로 카테고리만 같다고 묶으면 엉뚱한 조합이 나올 수 있음)
- 자동화 전이라면, 직접 각 용어 페이지 돌면서 진짜 연관 있는 용어 2~4개 골라서 아래 마크업 형식으로 추가:
```html
<h2>관련 용어</h2>
<div class="related-terms">
  <a href="t-test.html">t검정</a>
  <a href="variance.html">분산</a>
</div>
```
(용어 페이지 안에서는 `../terms/` 없이 그냥 파일명만 씀)

**완료 기준**
- 담당한 용어들 전부 관련 용어 섹션 존재, 링크 클릭했을 때 실제로 관련 있다고 느껴지는 페이지로 이동

---

## 3. 카테고리 설명 문구 작성

**배경**: 개발자 B가 카테고리별 개별 페이지(`category/<code>.html`)를 만들 예정. 지금은 카테고리 이름표(라벨)만 있고 설명이 없음.

**할 일**
- 12개 카테고리(stat, method, tool, ethics, physchem, bioearth, neuro, medhealth, psych, socialecon, eng, cs) 각각에 대해 2~3문장짜리 소개 문구 작성 (이 카테고리가 뭘 다루는지, 어떤 사람이 왜 찾는지)
- 개발자 B와 협의해서 어느 파일에 넣을지 정하기 (예: 새 `categories.json` 만들어서 code별 description 필드 추가하는 방식 제안)

**완료 기준**
- 12개 카테고리 전부 소개 문구 작성 완료, 어색하거나 기계번역 느낌 없이 자연스러운 한국어

---

## 4. 영문 버전 콘텐츠 보조 (개발자 A의 다국어 작업과 연계)

**배경**: 개발자 A가 `/en/terms/<slug>.html` 구조를 잡으면, 실제 영문 정의 텍스트가 필요함.

**할 일**
- 우선순위 높은 용어(자주 검색되는 것) 20~30개부터 영문 정의 작성 (title_en은 이미 terms.json에 있음, definition의 영문 버전만 새로 작성)
- 직역이 아니라 영어 독자 기준으로 자연스럽게, 단 원문 한국어 정의와 의미가 어긋나지 않도록

**완료 기준**
- 담당한 용어들의 영문 정의가 terms.json 또는 개발자 A가 정한 위치에 채워짐, 문법 오류 없음

---

## 5. 퀴즈 문제 검수 (개발자 B의 퀴즈 기능과 연계)

**배경**: 개발자 B가 `quiz.html`을 만들면 terms.json 데이터로 자동 문제를 생성함. 자동 생성된 오답 선택지가 너무 뻔하거나 말이 안 되는 경우가 생길 수 있음.

**할 일**
- 퀴즈 기능 완성되면 몇 개 카테고리 돌려보고, 오답 선택지가 정답과 헷갈릴 만큼 그럴듯한지 확인 (너무 쉽거나 너무 뜬금없는 오답 걸러내기)
- 필요하면 특정 용어에 대해 수동으로 오답 후보 지정하는 필드 제안 (예: `quiz_distractors` 배열)

**완료 기준**
- 최소 5개 카테고리 퀴즈를 직접 풀어보고 문제 품질 피드백 정리

---

## 작업 순서 제안
1번(신규 용어 추가)이 가장 반복적이고 즉시 시작 가능하니 우선 진행하고, 2~5번은 개발자 A/B 진행 상황 봐가며 순서대로 붙이면 됩니다.
