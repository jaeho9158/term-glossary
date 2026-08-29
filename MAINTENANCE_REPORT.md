# 유지보수 보고서 (chore/maintenance)

작성일: 2026-08-29 · 작성: Claude (무인 유지보수 세션)

## 요약

(작업 완료 후 마지막에 채움)

---

## 1단계: 의존성 점검

### 상황
- `package.json`에 **npm 의존성이 하나도 없음** (dependencies/devDependencies 부재, 빌드 스크립트는 Node 내장 모듈만 사용). lockfile도 없어 `npm audit`은 실행 불가(ENOLOCK) — 감사할 npm 의존성 자체가 없으므로 정상.
- 외부 코드는 전부 vendored 또는 CDN:

| 라이브러리 | 버전 | 출처 | 취약점 |
|---|---|---|---|
| pdf.js | 4.0.379 (vendored, `assets/vendor/pdfjs/`) | mozilla | **CVE-2024-4367 (High)** — 악성 PDF의 폰트 매트릭스로 임의 JS 실행. 4.2.67에서 수정 |
| Fuse.js | 7.1.0 (vendored) | — | 알려진 취약점 없음, v7 최신 |
| supabase-js | `@2` (esm.sh CDN, 마이너 자동 추적) | — | 알려진 취약점 없음, 2.x 최신 자동 반영 |

### 조치 (적용됨)
- **CVE-2024-4367 완화 적용**: [viewer.js:1554](assets/viewer.js) `getDocument()`에 `isEvalSupported: false` 추가. Mozilla가 권고한 공식 완화책으로, PDF 업로드는 임의 사용자 입력이므로 실제 공격면이었음. 뷰어 기능에는 영향 없음(eval 기반 폰트 경로만 차단, 렌더링은 fallback 경로 사용).
- 적용 후 `npm test` 5/5 통과.

### 적용하지 않고 목록만 남김
- **pdf.js 4.0.379 → 4.2.67+ (또는 v5) 업그레이드**: vendored minified 파일 수동 교체가 필요하고, 최근 손본 PDF 뷰어(확대/검색/팬)의 렌더링 회귀를 브라우저에서 눈으로 검증해야 함. 자동 테스트가 PDF 렌더링을 커버하지 않아 무인 적용은 위험 → 보수적으로 보류. 위 완화책으로 해당 CVE는 차단된 상태. v5는 major이므로 어차피 적용 금지 대상.
- supabase-js: esm.sh `@2` 태그가 마이너를 자동 추적하므로 별도 조치 불요. (재현성 원하면 정확한 버전 고정 고려 — 판단 필요 항목)

---

## 2단계: 기술부채 조사 (코드 수정 없음, 조사만)

TODO/FIXME 주석은 사실상 0건 — 부채는 주석이 아니라 구조에 있음. 전체 발견 중 "수정 비용 × 방치 위험" 상위 10개:

| 순위 | 항목 | 위치 | 비용 | 위험 |
|---|---|---|---|---|
| 1 | 무방비 `fetch`+`JSON.parse` (카테고리 페이지 침묵 실패) | `assets/site.js:11-14, 267-269` | 소 | 대 |
| 2 | `BASE_URL` 3중 하드코딩 — **과거 37k URL이 옛 github.io로 롤백된 사고의 재발 구조** | `scripts/generate-sitemap.js:11`, `generate-feed.js:9`, `generate-en-pages.js:9` | 소 | 대 |
| 3 | 주관식 채점 `normalizeAnswer`/`acceptedAnswers` 테스트 부재 (사용자 입력 직접 채점) | `assets/quiz.js:790-810` | 소 | 대 |
| 4 | `escapeHtml` 8중 복붙 구현 (XSS 방어선 파편화; 통합본 `assets/security.js`는 죽은 파일) | `viewer.js:231` 외 7곳 | 소 | 중 |
| 5 | 25MB `terms.json` 무방비 fetch | `history.js:29`, `roadmap.js:56`, `viewer.js:879` 등 | 소 | 대 |
| 6 | `localStorage.setItem` 무방비 6곳 (읽기만 방어, 쓰기는 전부 무방비 — 프라이빗 모드에서 기능 중단) | `quiz.js:71`, `flashcards.js:22`, `roadmap.js:24`, `pdf-annotations.js:24`, `viewer.js:576`, `header-search.js:118` | 소 | 중 |
| 7 | `LOCAL_CATEGORY_LABELS` 복붙 (37k 용어 페이지 검색 드롭다운, 카테고리 개명 시 이중 수정) | `assets/header-search.js:8-28` | 중 | 중 |
| 8 | `quiz.js` 초장문 함수군 — `nextQuestion` 215줄, `applyRoadmapScope` 193줄, `finishQuiz` 155줄, `checkAnswer` 142줄 | `assets/quiz.js` (총 1652줄) | 대 | 대 |
| 9 | 죽은 파일: `assets/security.js`(455줄, 로드 0건), `assets/category.js`(143줄, 참조 0건), `scripts/generate-minimap-data.js`(산출물을 아무도 안 읽음) | — | 소 | 소 |
| 10 | `insert-*` 빌드 스크립트 비원자성 (37k 파일 중간 실패 시 절반만 수정된 상태) | `scripts/insert-category-badges.js` 등 | 중 | 중 |

기타 기록: `viewer.js:507-1596` 단일 IIFE 1090줄(내부 함수 33개가 가변 상태 15개 공유 → 개별 테스트 불가), Supabase URL/anon키가 `auth.js`·`header-search.js` 두 곳 하드코딩, `package.json` 미등록 일회성 마이그레이션 스크립트 9개 방치, `.claude/worktrees/paper-viewer-v2/` 잔존.

테스트 현황: 기존 5개 테스트는 `viewer.js` 순수 함수 4개 + terms.json 데이터 검증만 커버. `viewer.js`만 `module.exports` 보유 — 다른 파일은 export가 없어 테스트 자체가 불가능한 상태.
