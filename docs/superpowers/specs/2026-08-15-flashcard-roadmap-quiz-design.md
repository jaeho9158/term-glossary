# 로드맵 플래시카드 + 퀴즈 연계 설계

## 배경

`roadmap.html`은 subcategory별로 위상정렬된 용어 리스트 + 체크박스 진도를 제공하고,
`quiz.html`은 독립적인 객관식 퀴즈 기능을 제공한다. 둘 다 "암기/학습"에 쓰이지만
서로 연결되어 있지 않다. 클래스카드/Quizlet처럼 카드를 넘기며 외우고, 바로 같은
범위로 퀴즈를 봐서 검증하는 흐름을 만든다.

## 기존 자산 (재사용)

- `roadmap.js`의 `topoSort(list)` — subcategory 안에서 선수지식 순서로 정렬된
  용어 배열을 만든다. 카드 순서로 그대로 재사용.
- `terms.json`의 `definition` 필드 — 카드 뒷면.
- `assets/quiz.js` — 기존 객관식 엔진. `category-select`/`difficulty-select` 기반
  필터링 로직이 있음(`filterDifficulty`, `categorySelect.value` 등, quiz.js:340-420).
- 북마크/로드맵 진도와 동일한 패턴: 로그인 시 Supabase, 비로그인 시 localStorage.

## 1. 진입점 — roadmap.html

`assets/roadmap.js`의 `render(category)` 함수가 만드는 각 `.roadmap-subcat`
섹션의 `<h2>` 옆에 버튼 추가:
```html
<button type="button" class="flashcard-start-btn" data-subcat="${sub}">🃏 플래시카드로 암기</button>
```
클릭 시 새 오버레이(모달)를 열어 그 subcategory의 `topoSort` 결과를 카드 덱으로 사용한다.
페이지 이동 없음 — `roadmap.html` 안에 `<div id="flashcard-overlay" hidden>` 컨테이너를
두고 내용만 채운다.

## 2. 카드 UI

- 카드 1장 = 용어 1개. 앞면: `title_ko (title_en)`. 클릭/스페이스바로 뒤집으면 뒷면에
  `definition` 한 줄 표시.
- 뒤집힌 후에만 "✅ 안다" / "❌ 모른다" 버튼 활성화. 클릭하면 판정을 기록하고 자동으로
  다음 카드로 넘어간다 (뒤집히지 않은 상태로).
- 좌우 화살표 키 / 이전·다음 버튼으로 판정 없이 이동 가능(둘러보기용).
- 상단바: 진행률(`3 / 24`), 닫기(×) 버튼, "모르는 것만 보기" 토글(현재 라운드에서
  '모른다'로 표시된 카드만 필터링해 재구성 — 토글 시 인덱스 0으로 리셋).
- 마지막 카드 판정 후 요약 화면으로 전환: "안다 18 · 모른다 6" + 두 버튼
  `🃏 모르는 것만 다시 보기`(모른다 카드로만 새 덱 구성), `📝 이 범위로 퀴즈 풀기`.

## 3. 데이터 모델

새 Supabase 테이블 `tg_flashcard_progress`:
```
id           uuid pk
user_id      uuid fk auth.users
term_slug    text
status       text check (status in ('known','unknown'))
updated_at   timestamptz default now()
unique(user_id, term_slug)
```
- upsert 방식: 같은 슬러그를 다시 판정하면 status만 갱신.
- 비로그인: `localStorage`에 `flashcard_progress_v1` 키로 `{ [slug]: 'known'|'unknown' }`
  객체 저장. 로그인 시 `roadmap.js`의 localStorage→DB 마이그레이션과 동일한 패턴으로
  1회 병합.
- 카드를 열 때 저장된 status가 있으면 초기 아이콘(작은 배지)으로 표시하되, 판정은
  다시 해야 갱신됨(자동 스킵하지 않음 — 매 학습 세션은 전체 덱을 보여주는 게
  기본이고, "모르는 것만 다시 보기"에서만 필터링에 사용).

## 4. 퀴즈 연계

- 요약 화면의 "이 범위로 퀴즈 풀기" 클릭 시:
  1. 현재 덱의 slug 배열을 `sessionStorage.setItem("quiz_scope_slugs", JSON.stringify(slugs))`
  2. `sessionStorage.setItem("quiz_scope_label", subcategoryName)`
  3. `location.href = "quiz.html?scope=roadmap"`으로 이동.
- `quiz.html`/`quiz.js` 확장:
  - `quiz.html`에 `scope=roadmap` 파라미터가 있으면 `category-select`,
    `difficulty-select`를 `hidden` 처리하고 상단에 `"○○○ 범위로 퀴즈를 풉니다"` 안내 표시.
  - `quiz.js`의 용어 목록 로딩부에서, `new URLSearchParams(location.search).get("scope") === "roadmap"`이면
    `allTerms`를 `sessionStorage`의 slug 목록으로 필터링한 뒤 나머지 퀴즈 로직(문제 생성,
    채점, 기록)은 기존 코드를 그대로 탄다. 슬러그 수가 4개 미만이면(4지선다 오답 생성 불가)
    "카드가 4개 미만이라 퀴즈를 만들 수 없습니다. 로드맵으로 돌아가기" 안내로 대체.

## 범위 밖

- 간격 반복(SRS) 알고리즘(다음 복습 시점 계산)은 이번 스펙에서 제외 — "모른다"
  카드를 다시 보여주는 것까지만.
- 플래시카드 단독 페이지 분리는 하지 않음(roadmap.html 내 오버레이로 통합).
- 퀴즈→플래시카드 역방향 연계는 범위 밖.
