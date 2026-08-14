# 연결성 강화 + 분야별 로드맵 + 북마크 태그 설계

## 배경

논문용어사전은 현재 6481개 용어를 보유한 사전형 서비스다. 개별 용어 페이지는
독립적으로 소비되며, 학습 경로나 용어 간 네트워크를 보여주는 기능이 없다.
기존 북마크(`tg_bookmarks`)는 있으나 분류/태그가 없다.

이 스펙은 세 가지 기능을 다룬다:
1. 북마크 태그 (고정 카테고리 필터 + 자유 태그)
2. 관련 용어 미니맵 (category.html)
3. 분야별 로드맵 (roadmap.html, 난이도/선수지식 기반)

## 기존 자산 (재사용)

- `terms.json`: 각 용어에 `categories`, `subcategory`, `related[]`(최대 5개) 필드 존재.
- `tg_bookmarks` 테이블: user_id, term_slug, term_title, created_at.
- `assets/category-data.js`: 카테고리 슬러그 → 한글 라벨 매핑.
- `history.html` / `assets/history.js`: 북마크·기록 목록 렌더링.
- `category.html`: 카테고리별 용어 목록 페이지.

---

## 1. 북마크 태그

### 데이터 모델

새 Supabase 테이블 `tg_bookmark_tags`:
```
id          uuid pk
bookmark_id uuid fk -> tg_bookmarks.id (on delete cascade)
user_id     uuid (RLS: user_id = auth.uid())
tag         text (트림, 소문자 비교 안 함 — 사용자가 입력한 그대로 저장)
created_at  timestamptz default now()
```
- 태그는 북마크 1건당 여러 개 가능 (many-to-one).
- RLS 정책: 본인 소유 row만 select/insert/delete.

### UI

- `terms/*.html`의 북마크 버튼 옆에 "태그 추가" 입력창은 넣지 않는다 (개별 용어
  페이지는 가볍게 유지). 태그 편집은 **`history.html`의 즐겨찾기 목록에서만** 가능.
- `history.html` 즐겨찾기 섹션 상단에:
  - 고정 카테고리 필터 드롭다운 (`category-data.js`의 라벨 사용, "전체" 기본값).
    `tg_bookmarks`에는 카테고리가 없으므로, 렌더링 시 `term_slug`로 `terms.json`을
    조회해 카테고리를 매핑한다 (클라이언트에서 fetch, 캐시).
  - 자유 태그 필터 칩(사용자가 가진 모든 태그를 유니크하게 모아 표시, 클릭 시 토글).
- 각 북마크 행에 태그 칩 목록 + "+" 버튼(인라인 텍스트 입력 → Enter로 추가) 표시.
- 태그 칩에 x 버튼으로 삭제.

### 파일 변경

- `assets/history.js`: 태그 CRUD, 필터링 로직 추가.
- `history.html`: 필터 UI 마크업 추가.
- `style.css`: 태그 칩/필터 스타일 추가.
- Supabase 마이그레이션: `tg_bookmark_tags` 테이블 + RLS.

---

## 2. 관련 용어 미니맵

### 목표

`category.html`에서 카테고리(및 subcategory)를 선택했을 때, 그 안의 용어들이
서로 `related[]`로 어떻게 연결되는지 SVG 그래프로 보여준다.

### 데이터

- 새 데이터 생성 없음. `terms.json`의 `related[]`를 그대로 사용.
- 그래프 노드 = 선택한 subcategory에 속한 용어, 엣지 = `related[]` 중 같은
  subcategory 안에 있는 것만 연결 (다른 분야로 튀는 엣지는 미니맵에서 제외해
  그래프가 흩어지지 않게 함).

### 렌더링

- 외부 라이브러리 없이 순수 SVG.
- subcategory당 용어가 보통 수십 개 수준이므로, 원형 배치(circular layout)로
  노드를 배치하고 엣지는 직선으로 그린다. 노드 30개 초과 시 상위 20개(연결 수
  많은 순)만 표시 + "N개 더보기" 안내.
- 카테고리 선택 시 subcategory 목록이 먼저 뜨고(칩 형태), subcategory를 클릭하면
  그 아래에 미니맵이 펼쳐진다(아코디언). 기본은 전부 접힌 상태.
- 노드 클릭 → 해당 용어 페이지로 이동. 호버 시 용어명 툴팁.

### 파일 변경

- `category.html`: subcategory 칩 + 미니맵 컨테이너 마크업.
- 새 파일 `assets/category-minimap.js`: subcategory 데이터 필터링, SVG 생성,
  아코디언 토글.
- `style.css`: 미니맵 스타일.

---

## 3. 분야별 로드맵

### 메타데이터 확장 (LLM 일괄 태깅)

`terms.json`의 각 항목에 필드 추가:
```json
{
  "difficulty": 1,            // 1(입문) ~ 3(심화)
  "prerequisites": ["slug1", "slug2"]  // 같은 subcategory 내 선수 용어 slug, 최대 3개
}
```

- **작업 방식**: subcategory 단위로 배치를 나눠 서브에이전트에 위임, 결과를
  JSON으로 반환받아 병합. subcategory가 22개 카테고리 × 여러 개이므로 상당수
  배치가 되며, 한 번에 다 하지 않고 카테고리 단위로 순차 진행하며 중간 검증한다.
- **검증**: 각 배치 완료 후 다음을 스팟체크
  - `prerequisites`에 존재하지 않는 slug가 없는지 (terms.json 전체 slug set과 대조)
  - 순환 참조가 없는지 (위상 정렬 시도 → 실패하면 해당 카테고리 재작업)
  - difficulty 분포가 1~3에 고르게 퍼져 있는지 (전부 2로 몰리는 등 부실 태깅 감지)
- **저장 방식**: 기존 `terms.json`을 직접 갱신. `terms-index.json`은 검색용이라
  별도 갱신 불필요 (필드 없어도 검색에 영향 없음).

### roadmap.html (신규 페이지)

- 상단: 카테고리 선택 드롭다운 (22개 대분야).
- 카테고리 선택 시 해당 subcategory들을 섹션으로 나누고, 각 섹션 안에서
  `prerequisites`를 위상 정렬(topological sort)한 순서로 용어 리스트 표시.
  선수지식이 아직 없는 순환/누락 케이스는 difficulty 순 정렬로 폴백.
- 각 용어 항목에 체크박스("학습 완료") 표시.
  - 로그인 시: 새 테이블 `tg_roadmap_progress` (user_id, term_slug, completed_at)에 저장.
  - 비로그인 시: `localStorage`에 `roadmap_progress_v1` 키로 저장, 로그인 시 1회
    마이그레이션 시도(중복은 무시).
- 진행률 바(섹션별 완료 %) 표시.

### 파일 변경

- 새 파일 `roadmap.html`, `assets/roadmap.js`.
- Supabase 마이그레이션: `tg_roadmap_progress` 테이블 + RLS.
- 헤더 nav에 "로드맵" 링크 추가 (`quiz.html` 링크 옆).
- `terms.json` 데이터 갱신 (LLM 배치 작업으로 `difficulty`, `prerequisites` 추가).

---

## 범위 밖 (이번 스펙에서 제외)

- 용어 페이지 자체의 관련 용어 섹션을 그래프로 바꾸는 것 (기존 4개 링크 유지).
- 로드맵 자동 추천/개인화(사용자 수준 진단 등).
- 태그 공유/공개 기능 (태그는 본인만 볼 수 있음).

## 작업 순서 제안

1. 북마크 태그 (DB 마이그레이션 + UI) — 독립적, 빠름.
2. 관련 용어 미니맵 (신규 데이터 불필요) — 독립적, 빠름.
3. 로드맵 — `terms.json` 메타데이터 확장(LLM 배치, 가장 오래 걸림) → roadmap.html 구현.

세 기능은 서로 의존성이 없으므로 별도 구현 계획(plan)으로 나눠 순서대로 진행한다.
