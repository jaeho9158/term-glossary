# 논문 뷰어(viewer.html) 설계

## 배경

DBpia 논문 뷰어 UI(좌측 본문 + 우측 검색/용어 패널)에서 영감을 받아, 사용자가 논문 텍스트를 붙여넣으면 `terms.json`에 등록된 학술용어를 자동으로 찾아 우측 패널에 나열해주는 정적 페이지를 만든다. 서버/AI API 없이 클라이언트 JS만으로 동작한다.

## 목표

- 사용자가 논문 텍스트(초록, 본문 일부 등)를 붙여넣으면, 사전에 등록된 106개 용어 중 본문에 실제로 등장하는 용어만 추려 우측에 보여준다.
- 우측 용어 카드를 클릭하면 좌측 본문에서 해당 용어가 처음 등장하는 위치로 스크롤 이동 + 하이라이트 강조.
- 용어 카드에서 "자세히 보기"를 클릭하면 기존 `terms/{slug}.html` 상세 페이지로 이동한다.
- 기존 사이트(`index.html`, `style.css`, `terms.json`)와 룩앤필·데이터 구조를 그대로 재사용한다.

## 페이지 구조

`viewer.html` (사이트 루트에 신규 추가)

- 공통 헤더/푸터는 기존 페이지와 동일 (`site-header`, `site-footer`), nav에 "논문 뷰어" 링크 추가.
- `<main>` 내부를 2단 레이아웃(`.viewer-layout`)으로 구성:
  - **좌측 (`.viewer-input`)**: 논문 텍스트 입력용 `<textarea>` + "용어 찾기" 버튼. 플레이스홀더에 샘플 문단 예시 텍스트를 안내 문구로 넣어둔다 (입력값 아님, `placeholder` 속성 사용).
  - **우측 (`.viewer-terms`, sticky)**: 상단 필터 검색창(`<input type="search">`, 결과 리스트 내 텍스트 필터링용) + "이 논문에 나온 용어 (N개)" 카드 리스트(`#matched-terms`).

## 인터랙션 흐름

1. 사용자가 좌측 textarea에 텍스트 입력 후 "용어 찾기" 클릭 (텍스트 비어있으면 버튼 비활성화).
2. JS가 `terms.json`을 fetch(이미 홈페이지에서 쓰는 것과 동일 파일, 캐시 재사용).
3. 각 용어의 `title_ko`, `title_en`을 텍스트 내에서 검색:
   - 영문: 대소문자 무시 + 단어 경계(`\b...\b`) 정규식 매칭.
   - 한글: 대소문자 개념 없음, 단순 포함 매칭 (조사 결합 고려해 단어 경계 미적용).
4. 매칭된 용어만 등장 횟수 내림차순으로 정렬해 우측 카드 리스트 렌더.
   - 카드 = 한글명 + 영문명(`title_en`, 회색 보조 텍스트) + 카테고리 뱃지 + "자세히 보기" 링크(`terms/{slug}.html`).
5. 좌측 textarea 영역은 제출 후 읽기 전용 렌더 뷰(`<div class="viewer-rendered">`)로 교체되고, 각 용어의 첫 매칭 위치를 `<mark data-slug="{slug}">`로 감싸 하이라이트.
6. 우측 카드 클릭 시:
   - 해당 `slug`를 가진 `<mark>` 요소로 `scrollIntoView({behavior:'smooth', block:'center'})`.
   - 잠시(예: 1.2초) 강조 애니메이션 클래스(`.mark-flash`)를 추가했다가 제거.
7. "자세히 보기" 링크 클릭은 카드 클릭 스크롤 동작과 별개로 정상적으로 `terms/{slug}.html`로 이동(이벤트 버블링 시 스크롤 핸들러가 같이 동작해도 무방, 페이지 이동이 우선).

## 빈 상태 / 예외 처리

- 텍스트 미입력: "용어 찾기" 버튼 `disabled`.
- 매칭 0건: 우측 패널에 "본문에서 사전 등록된 용어를 찾지 못했습니다." 안내 텍스트 표시 (에러 아님, 정상 빈 상태).
- `terms.json` fetch 실패: 우측 패널에 "용어 데이터를 불러오지 못했습니다. 새로고침 해주세요." 표시.

## 스타일 (style.css에 추가)

- `.viewer-layout`: `display:flex; gap:24px;` — 좌측 `flex:1 1 60%`, 우측 `flex:1 1 320px; position:sticky; top:20px;`
- 이 페이지에서는 기존 `--max-width: 760px` 제약을 넘어서는 넓은 컨테이너가 필요하므로, `viewer.html` 전용으로 `<main class="wide">` 클래스를 추가해 `max-width: 1200px`을 오버라이드한다 (기존 페이지들의 `max-width: 760px`은 그대로 유지).
- 모바일(`max-width: 720px` 미디어쿼리)에서는 `.viewer-layout`을 세로 스택으로 전환, sticky 해제.
- `<mark>` 기본 스타일: `background: #fff3b0; border-radius:2px; padding:0 2px;` — `.mark-flash` 상태에서는 `background: var(--accent)`로 전환 후 트랜지션으로 원복.
- 우측 카드(`.term-card`)는 기존 `.term-list li a` 스타일을 재사용/확장.

## 데이터

- 기존 `terms.json` 그대로 사용 (구조 변경 없음).
- 신규 파일 없음 (viewer.html, style.css 추가분, 필요 시 `assets/viewer.js` 신규 스크립트 파일).

## SEO / 사이트 통합

- `index.html` nav와 `about.html` 등 공통 nav에 "논문 뷰어" 링크 추가.
- `sitemap.xml`에 `viewer.html` 항목 추가.
- `viewer.html`에도 기존 페이지와 동일한 형식의 `<title>`, `meta description`, canonical, OG 태그 적용.

## 테스트 관점

- 샘플 논문 문단(예: p-value, 상관관계, 회귀분석이 포함된 문장)을 붙여넣어 우측에 정확히 매칭되는지 확인.
- 카드 클릭 → 스크롤 이동 및 하이라이트 애니메이션 동작 확인.
- "자세히 보기" 링크가 실제 `terms/{slug}.html`로 정상 이동하는지 확인.
- 매칭 0건, `terms.json` fetch 실패 케이스 수동 확인.
- 모바일 뷰(세로 스택) 레이아웃 확인.
