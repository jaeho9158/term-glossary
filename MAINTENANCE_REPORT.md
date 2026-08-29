# 유지보수 보고서 (chore/maintenance)

작성일: 2026-08-29 · 작성: Claude (무인 유지보수 세션)

## 요약

**실제로 바뀐 것** (커밋 5개, 모두 chore/maintenance 로컬 브랜치 — push 안 함):
- 보안 수정 1건: `assets/viewer.js` pdf.js CVE-2024-4367 완화 (`isEvalSupported: false`)
- 테스트 8파일 신규 (5개 → 13개 테스트, 전부 통과): 채점·초성·이스케이프·인덱스·하이라이트 겹침·카테고리 별칭·오늘의단어·정규화 + `tests/helpers/extract-fn.js` 헬퍼
- 이 보고서 (`MAINTENANCE_REPORT.md`)
- 프로덕션 코드 변경은 viewer.js 한 줄뿐. 2단계는 조사만, 4단계는 계획만.

**판단이 필요한 것**:
1. pdf.js 4.0.379 → 4.2.67+ 업그레이드 — vendored 파일 교체 + 브라우저 육안 검증 필요해 무인 적용 보류 (CVE는 완화 적용으로 차단됨)
2. 4단계 리팩터링 계획 A~D 착수 여부 (아래 상세)
3. 무방비 fetch·BASE_URL 하드코딩 — 저위험 수정이지만 "테스트 확보된 것만" 조건에 걸려 보류, 별도 지시 시 30분 내 처리 가능
4. 죽은 파일 3개 삭제 (security.js는 계획 A 재료로 쓸지 먼저 결정)
5. (이전 세션부터 미결) 옛 카테고리 디렉터리 12개(stat/, eng/ 등 369파일) 처리

**막혀서 건너뛴 것**:
- `quiz.js`·`viewer.js` IIFE 내부 DOM 결합 함수들의 단위 테스트 — 구조상 불가, 리팩터링(계획 B) 선행 필요. 연속 실패로 포기한 대상은 없음.
- `npm audit` — npm 의존성이 0개라 감사 대상 자체가 없음 (vendored/CDN만).

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

---

## 3단계: 테스트 작성

테스트 5개 → **13개 (전부 통과)**. 신규 8개 파일/헬퍼:

| 파일 | 대상 | 케이스 |
|---|---|---|
| `tests/viewer-escape.test.js` | `viewer.js escapeHtml` (XSS 방어선) | 정상/5개 위험문자/이중 이스케이프 순서/스크립트·속성 주입 페이로드 |
| `tests/viewer-exactindex.test.js` | `buildExactIndex` (용어 인덱스 안전장치) | 정규화/1글자 제외/모호어 제외/중복 slug/제목 없는 항목 |
| `tests/viewer-keptspans.test.js` | `computeKeptSpans` (하이라이트 겹침 해소) | 비겹침/동일 시작점 긴 스팬 우선/내부 시작 흡수/맞닿음/다중 출현/위치 없음 |
| `tests/quiz-answer.test.js` | `normalizeAnswer`/`acceptedAnswers` (주관식 채점 — 2단계 3순위) | 대소문자·공백·기호 무시/null·숫자/별칭 인정/빈 답 거부 |
| `tests/quiz-choseong.test.js` | `toChoseong` (자동 초성 힌트) | 일반어/쌍자음/음절 범위 양끝(가·힣)/비한글 통과/빈 문자열 |
| `tests/site-category.test.js` | `site.js resolveCategoryParam` (URL 외부 입력 — 2단계 1순위 인접) | 현행 코드/1:N 별칭 분할/복사본 반환/미지 코드·null |
| `tests/word-of-day.test.js` | `seededPick` (오늘의 단어 결정론 계약) | 동일 시드 재현성/다른 시드/중복 없음/풀 초과 요청/빈 풀/원본 불변 |
| `tests/viewer-normalize.test.js` | `normalizeWord`/`extractWords` (매칭 파이프라인 입구) | 정규화/토큰화·중복 제거/숫자·기호만 |

인프라: `quiz.js`·`site.js`·`word-of-day.js`는 최상위에서 DOM에 바로 접근해 Node에서 `require()` 자체가 불가 → **프로덕션 코드를 전혀 건드리지 않고** 소스에서 함수 선언만 잘라내 `vm` 샌드박스로 평가하는 `tests/helpers/extract-fn.js` 헬퍼를 도입. 함수가 파일 내에서 이동해도 이름만 유지되면 테스트는 깨지지 않음. (vm cross-realm 배열은 `Array.from`으로 복사 후 비교 — 헬퍼 사용 시 주의점으로 기록)

건너뛴 것: `quiz.js`의 장문 함수들(`nextQuestion` 등)과 `viewer.js` IIFE 내부 함수 33개는 DOM·공유 가변 상태 결합으로 단위 테스트 불가 — 리팩터링(4단계 계획) 선행 필요. getter성 자명 코드(`termLinkHTML` 등)는 의도적으로 생략.

---

## 4단계: 리팩터링 계획 (실행 안 함 — 검토 후 지시 대기)

2단계 항목 중 **3단계에서 테스트가 확보된 것만** 대상. 각 계획은 보호 테스트가 깨지지 않는 것을 완료 조건으로 삼는다.

### 계획 A — `escapeHtml` 8중 구현 통합 (2단계 4순위)
- **보호 테스트**: `tests/viewer-escape.test.js` (치환 집합·순서 회귀 감지)
- **변경**: 새 파일 `assets/escape.js`에 단일 `escapeHtml` 정의(전역 + module.exports 겸용, `word-of-day.js`처럼 `String()` 코어션 포함 버전 채택). 각 HTML `<head>`~스크립트 로드부에 `<script src="assets/escape.js">`를 다른 assets보다 먼저 추가(대상: index/viewer/quiz/history/roadmap/about 등 — terms/*.html은 escapeHtml 미사용이라 무변경). `viewer.js:231`, `history.js:3`, `flashcards.js:5`, `roadmap.js:7`, `home-featured.js:6`, `word-of-day.js:5`의 로컬 정의 삭제 후 공용 함수 참조. 빌드 스크립트 쪽(`generate-en-pages.js:22`, `generate-related-html.js:18`)은 `require("../assets/escape.js")`로 교체.
- **주의**: `viewer.js`는 CRLF + module.exports 목록에서 escapeHtml re-export 유지 필요(기존 테스트 3개가 참조). 죽은 `assets/security.js`는 이 통합으로 대체되므로 삭제 후보(계획 D와 함께).
- **완료 조건**: `npm test` 13/13 + 각 페이지 스모크(검색·뷰어 카드·기록 페이지 렌더).

### 계획 B — 주관식 채점 로직의 모듈화 (2단계 3·8순위의 부분)
- **보호 테스트**: `tests/quiz-answer.test.js`, `tests/quiz-choseong.test.js`
- **변경**: `quiz.js` 하단에 viewer.js와 같은 패턴의 `if (typeof module !== "undefined" && module.exports)` 블록 추가해 `normalizeAnswer`/`acceptedAnswers`/`toChoseong`/`seededPick`류 순수 함수를 정식 export. 이후 테스트에서 extract 헬퍼 대신 직접 require… 는 불가(최상위 DOM 접근). 따라서 **선행 작업**: `quiz.js:97` 이후의 DOM 초기화 전체를 viewer.js처럼 `if (typeof document !== "undefined") { (function(){ … })(); }`로 감싸기. 함수 선언 호이스팅이 블록 스코프로 바뀌므로, IIFE 밖에서 정의된 순수 함수(채점·초성)와 IIFE 안 DOM 함수의 경계를 명확히 나눠야 함 — 기계적이지만 1,652줄 전체를 건드리는 변경이라 브라우저 스모크 필수.
- **완료 조건**: `npm test` 통과 + 퀴즈 4개 모드(정의/용어/랜덤/주관식) 실제 플레이 1회씩.

### 계획 C — `nextQuestion` 215줄 분해 (2단계 8순위, 계획 B 이후에만)
- **보호 테스트**: 현재는 채점·초성 테스트만 간접 보호. **계획 B로 export가 열린 뒤** `renderSubjectiveQuestion`/보기 생성 로직을 순수 부분(보기 4개 추출·셔플)과 DOM 부분으로 분리하고, 순수 부분에 테스트를 먼저 추가한 다음 분해. 테스트 없는 상태로 분해 착수 금지.

### 계획 D — 죽은 파일 삭제 (2단계 9순위)
- **보호 테스트**: 해당 없음(참조 0건이 근거). `assets/category.js`, `scripts/generate-minimap-data.js` + `package.json`의 `build:minimap-data` 항목 삭제. `assets/security.js`는 계획 A에서 통합본 재료로 쓸지 먼저 결정 후 삭제.
- **완료 조건**: 전체 HTML에서 삭제 파일 참조 0건 재확인(grep) + `npm test`.

### 계획 외 (테스트 미확보 — 착수 보류 근거)
- `site.js`/`history.js`의 무방비 fetch(2단계 1·5순위): fetch 자체는 브라우저 통합 지점이라 단위 테스트로 보호 불가. 수정 자체는 `header-search.js`의 기존 try-catch 패턴 복사로 저위험이지만, "테스트 확보된 것만" 조건에 따라 계획서에서 제외하고 여기 기록만 남김.
- `BASE_URL` 3중 하드코딩(2순위): 공유 상수 파일 1개로 즉시 해소 가능하나 동일 사유로 보류.

---

## 후속 작업 (사용자 "순서대로 처리" 지시, 2026-08-29)

| # | 항목 | 결과 |
|---|---|---|
| 1 | pdf.js 4.0.379 → 4.10.38 업그레이드 | **미완 — 차단됨.** 파일 다운로드(curl·npm pack)가 세션 권한 정책에 막힘. CVE-2024-4367은 완화 적용으로 이미 차단된 상태라 보안상 급하지 않음. 사용자가 직접 받거나 다운로드 권한 허용 후 재시도 필요 (`assets/vendor/pdfjs/`의 pdf.min.mjs·pdf.worker.min.mjs 두 파일 교체 + 뷰어 육안 확인) |
| 2 | 계획 A: escapeHtml 통합 | **완료.** `assets/escape.js` 단일본, 로컬 구현 7곳 제거, 4개 페이지에 로드 추가. 브라우저에서 홈·기록·로드맵·뷰어 콘솔 무오류, 뷰어 카드 렌더·XSS 이스케이프 확인 |
| 3 | 계획 B: 퀴즈 순수 로직 분리 | **완료.** `assets/quiz-core.js`(채점·초성), 테스트는 직접 require로 전환. 주관식 초성 공개·정답 판정 실플레이 확인 |
| 4 | 계획 C: nextQuestion 분해 | **완료(부분).** 보기 생성 while 루프를 `buildChoiceOptions` 순수 함수로 추출 + 테스트(`tests/quiz-choices.test.js`). 부수 효과: 풀에 보기 4개 미만일 때의 무한 루프 가능성을 시도 상한으로 방어. 객관식 실플레이 확인 |
| 5 | 계획 D: 죽은 파일 삭제 | **완료.** category.js·security.js·generate-minimap-data.js 삭제, package.json 정리 |
| 6 | fetch·localStorage 보강 | **완료.** fetch 4곳(site/history/roadmap/viewer)에 ok 검사·실패 안내, setItem 5곳 try/catch |
| 7 | BASE_URL 단일화 | **완료.** `scripts/site-config.js` 단일 출처, 스크립트 3곳 require로 전환 |
| 8 | 옛 카테고리 디렉터리 12개 | **완료.** 369페이지 전부 terms/로의 리다이렉트 스텁으로 교체(`scripts/stub-legacy-category-pages.js`). 삭제 대신 스텁을 택해 외부 유입 링크 보존, 깨진 내부 링크 335건은 콘텐츠와 함께 소멸. 누락 대상 0건 |

테스트 15/15 통과, 각 단계 브라우저 검증 완료. 커밋 7개 추가(모두 chore/maintenance, push 안 함).

**사고·복구 기록**: 6번 작업 검증 중 `require()`로 generate-related-html.js를 불러오다 스크립트가 실행돼 terms/*.html 26,211개가 재생성됨(905개는 실제 내용 변화). 커밋 전이라 `git checkout -- terms`로 전량 복원, 실작업은 영향 없음. 교훈: 이 리포지토리의 scripts/*.js는 require 즉시 실행되므로 문법 검사는 `node --check`만 쓸 것.
