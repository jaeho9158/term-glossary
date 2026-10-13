# PDF 리더 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 논문 뷰어를 PDF 원문 한 화면에서 형광펜·메모·용어 표시·검색·목차·인용 카드·미리보기가 모두 동작하는 전체 화면 리더로 다시 만든다.

**Architecture:** 용어 찾기 로직은 `assets/term-match.js`로 떼어내 그대로 쓰고, 화면은 `assets/reader/` 아래 역할별 파일로 새로 짓는다. 표시는 텍스트 레이어 span을 감싸지 않고, `getTextContent` 글자 조각에서 계산한 글자별 상자를 쪽 위 겹침층에 사각형으로 그린다. 옛 뷰어(`viewer.html`)는 작업 10 전까지 그대로 서비스한다.

**Tech Stack:** 정적 HTML/CSS/바닐라 JS(빌드 도구 없음) · pdf.js 4.x(`assets/vendor/pdfjs/pdf.min.mjs`) · Supabase(기존 저장 계층) · `node --test`

**Spec:** `docs/superpowers/specs/2026-10-13-pdf-reader-stage1-design.md` — 구현자는 자기 작업과 관련된 절을 반드시 읽는다.

## Global Constraints

- 작업 폴더는 `C:\Users\hssh9\term-reader`(브랜치 `feature/reader-stage1`). 다른 폴더의 파일을 고치지 않는다. `main`에 푸시하지 않는다.
- 사이트는 GitHub Pages 정적 호스팅. 번들러·npm 의존성 추가 금지. 외부 CDN 스크립트 추가 금지.
- 계산만 하는 파일은 `assets/viewer.js`와 같은 패턴(브라우저 전역 함수 + 파일 끝의 `if (typeof module !== "undefined" && module.exports) module.exports = {...}`)으로 만들어 `tests/*.test.js`에서 `require`로 검증한다. 전역 이름 충돌을 피하려고 새 파일의 전역은 `window.Reader<Name>` 객체 하나로 노출한다(예: `window.ReaderGeometry`).
- DOM을 만지는 파일도 클래식 스크립트(IIFE)로 쓰고 `window.Reader<Name>`으로 노출한다. `assets/pdf-annotations.js`만 ES module이므로 `reader.html`의 `<script type="module">`에서 불러 `window.ReaderStore`로 넘긴다.
- 표시를 텍스트 레이어 span 안에 `<mark>`로 감싸는 방식 금지(스펙 §4.3). 표시는 `overlay.js`의 사각형으로만 그린다.
- 쪽 글(문자열)은 `joinTextItems(items, pageWidth)`의 결과와 글자 하나까지 같아야 한다. 기존 형광펜·메모의 글자 위치가 이 문자열 기준이다.
- 저장 형식·DB 변경 금지. `assets/pdf-annotations.js`, `assets/viewer-storage.js`의 공개 함수는 그대로 쓴다.
- DOM에 넣는 모든 외부 문자열(PDF 글, 서지 조회 결과, 용어 정의)은 `escapeHtml`(`assets/escape.js`)을 거치거나 `textContent`로 넣는다.
- 외부 요청에 개인 식별 정보(이메일, 이름)를 넣지 않는다.
- 사용자에게 보이는 문구는 한국어, 스펙에 적힌 문구는 그대로 쓴다.
- 실패는 조용히 넘기지 않는다. 사용자에게 보이는 문구로 알리거나, 스펙이 "띄우지 않는다"고 정한 경우에만 생략한다.
- 실행 환경: Windows Git Bash. 테스트는 `npm test`(= `node --test tests/*.test.js`). 한 파일만은 `node --test tests/<file>.test.js`. `node --test tests/`는 쓰지 않는다.
- 한글이 든 파일은 Write/Edit 도구로 만든다(Bash heredoc은 한글을 손상시킬 수 있다).
- `data/oa-corpus/`, `docs/viewer-corpus/*.pdf`는 커밋하지 않는다(이미 .gitignore). 시험용 PDF는 주 저장소 `C:\Users\hssh9\용돈벌이\docs\viewer-corpus\`에 있다(작업 폴더에는 없다). 읽기만 한다.
- 커밋은 작업 폴더에서 경로를 명시해 `git add <paths>` 후 커밋. `git add -A` 금지. 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 프로세스를 이름으로 죽이지 않는다. 개발 서버가 필요하면 `python -m http.server <port> --directory C:/Users/hssh9/term-reader`를 백그라운드로 띄우고 끝나면 그 PID만 종료한다. 포트는 8781~8789.
- 기존 테스트 245개는 모든 작업 뒤에도 통과해야 한다.

## Review Focus

1. **두 단 논문에서 표시가 옆 단으로 새거나 어긋남** — 한 줄로 보이는 좌표에 두 단의 조각이 섞여 있다. 글자 범위 → 사각형은 조각 단위로 끊어 그려야 하고 단 사이 여백을 덮으면 안 된다. (작업 3 테스트)
2. **자간을 벌린 한글 제목("연 구 방 법")** — `collapseLetterSpacedHangul`이 공백을 지우므로 쪽 글의 글자 수와 조각의 글자 수가 다르다. 글자 ↔ 조각 대응이 어긋나면 그 쪽의 모든 표시가 밀린다. (작업 3 테스트)
3. **쪽을 넘는 선택, 빈 선택, 캡션·머리말만 걸친 선택** — 형광펜이 쪽 경계를 넘으면 쪽마다 한 건씩 나눠 저장한다. 글자가 없는 영역만 선택하면 도구를 띄우지 않는다. (작업 4 테스트)
4. **참고문헌 번호가 쪽 번호·수식 번호·연도와 겹침** — `[2020]`, `(5)`, 각주 번호를 인용으로 잘못 연결하면 틀린 문헌 카드가 뜬다. 범위 밖 번호, 참고문헌 구역 안의 번호는 연결하지 않는다. (작업 7 테스트)
5. **저장소에 깨진 기록이 있을 때** — `localStorage`의 JSON이 깨졌거나 필드가 빠진 옛 기록이 있어도 리더가 열려야 한다. 그 기록만 건너뛰고 나머지는 보인다. (작업 4 테스트)

---

## 파일 구조

| 파일 | 상태 | 책임 |
|---|---|---|
| `assets/term-match.js` | 새로(작업 1, `viewer.js`에서 이동) | 용어 찾기·쪽 글 만들기·기록 다시 붙이기 등 순수 함수 전부 |
| `assets/viewer.js` | 수정(작업 1), 정리(작업 10) | 옛 뷰어 화면 코드 |
| `reader.html` | 새로(작업 2) | 첫 화면 + 리더 뼈대 마크업 |
| `assets/reader/reader.css` | 새로(작업 2) | 리더 전용 스타일 |
| `assets/reader/doc.js` | 새로(작업 2) | PDF 열기, 쪽 그리기, 배율, 쪽 이동 |
| `assets/reader/panels.js` | 새로(작업 2) | 좌우 패널, 탭, 서랍 |
| `assets/reader/reader.js` | 새로(작업 2), 이후 작업마다 연결 추가 | 조립, 도구 막대, 키보드 |
| `assets/reader/geometry.js` | 새로(작업 3) | 사각형 계산(순수) |
| `assets/reader/text-map.js` | 새로(작업 3) | 쪽 글 + 글자 상자 |
| `assets/reader/overlay.js` | 새로(작업 3) | 겹침층 그리기 |
| `assets/reader/search.js` | 새로(작업 3) | 본문 검색 |
| `scripts/reader-geometry-eval.js` | 새로(작업 3) | 위치 오차 측정 |
| `assets/reader/selection.js` | 새로(작업 4) | 드래그 → 글자 범위, 선택 도구 |
| `assets/reader/annotations.js` | 새로(작업 4) | 형광펜·메모 |
| `assets/reader/terms-layer.js` | 새로(작업 5) | 용어 밑줄·카드·패널 |
| `assets/reader/outline.js` | 새로(작업 6) | 목차, 쪽 축소 그림 |
| `assets/reader/refs.js` | 새로(작업 7) | 참고문헌·인용·참조 찾기(순수) |
| `assets/reader/preview.js` | 새로(작업 7) | 인용 카드, 미리보기, 돌아가기 |
| `assets/reader/biblio.js` | 새로(작업 8) | 외부 서지 조회 |
| `privacy.html` | 수정(작업 8) | 한 문장 추가 |
| `viewer.html` | 교체(작업 10) | 새 리더로 |

공용 약속(모든 작업이 따른다):

- **쪽 좌표계**: pdf.js viewport(배율 1, 회전 반영) 기준, 원점은 쪽 왼쪽 위, 단위는 CSS px at scale 1. 사각형은 `{x, y, w, h}`.
- **글자 범위**: 쪽 글 문자열 기준 `{page, start, end}`(end 제외). `page`는 1부터.
- **이벤트**: 리더 루트 요소 `#reader`에서 `CustomEvent`로 주고받는다. `reader:pagerendered`(detail `{page}`), `reader:pagetext`(detail `{page}` — 쪽 글과 글자 상자가 준비됨), `reader:scalechange`(detail `{scale}`), `reader:pagechange`(detail `{page}`), `reader:docopen`(detail `{docHash, title, numPages}`), `reader:docclose`.

---

### Task 1: 용어 찾기 로직을 `assets/term-match.js`로 떼어내기

**Files:**
- Create: `assets/term-match.js`
- Modify: `assets/viewer.js`(1~1808행의 순수 함수 영역 제거, 화면 코드만 남김), `viewer.html`(스크립트 태그 추가), `scripts/stamp-viewer-version.js`(필요 시), `viewer.js`를 `require`하는 `tests/*.test.js`와 `scripts/*.js` 전부
- Test: 기존 테스트 전부

**Interfaces:**
- Produces: `assets/term-match.js`가 지금 `assets/viewer.js`의 `module.exports`에 있는 이름 전부를 같은 이름으로 내보낸다(`joinTextItems`, `orderTextItemsByColumn`, `matchTermsWithIndex`, `buildExactIndex`, `decodeViewerIndex`, `decodeDefChunk`, `defBucket`, `termCardHTML`, `popoverHTML`, `splitMatchesByPage`, `termsOnPage`, `buildPageOffsets`, `resolveAnnotationAnchor`, `findNearestOccurrence`, `mergeOverlappingRanges`, `shouldPersistReanchor`, `computeFitPageScale`, `clampPdfScale`, `clampPdfPageNumber`, `assetVersionFromSrc`, `withAssetVersion`, `escapeRegExp` 등). 브라우저에서는 지금처럼 전역 함수로 남는다. 추가로 `computeDocHash`와 `collapseLetterSpacedHangul`, `textItemX`, `textItemY`도 내보낸다.

- [ ] **Step 1: 경계 확인.** `assets/viewer.js`에서 `if (typeof document !== "undefined") {`(화면 코드 시작) 바로 앞까지가 순수 영역이다. 그 안의 모든 최상위 함수·상수와 `module.exports` 블록을 `assets/term-match.js`로 **글자 그대로** 옮긴다. 내용은 고치지 않는다. 화면 코드가 쓰는 상수(`PDF_MIN_SCALE` 등)는 양쪽에서 필요하면 `term-match.js`에 두고 전역으로 쓴다.
- [ ] **Step 2: 불러오기 수정.** `viewer.html`에서 `assets/viewer.js` 태그 앞에 `<script src="assets/term-match.js?v=…"></script>`를 넣는다(버전 문자열은 `viewer.js` 태그와 같은 값). `scripts/stamp-viewer-version.js`가 버전을 찍는 대상에 `term-match.js`가 포함되는지 확인하고, 해시 계산과 태그 갱신 양쪽에 포함시킨다.
- [ ] **Step 3: `require` 경로 수정.** `grep -rln "assets/viewer.js\|assets\", \"viewer.js\|../assets/viewer" tests scripts`로 찾은 파일의 `require`를 `term-match.js`로 바꾼다. `viewer.js` 자체는 Node에서 더 이상 `require`되지 않아도 된다.
- [ ] **Step 4: 검증.** `npm test` → 245 통과. `node scripts/viewer-eval.js`가 오류 없이 돌고 결과 숫자가 작업 전과 같다(작업 전에 한 번 돌려 출력 저장 후 비교). `node scripts/generate-viewer-index.js`를 돌려 `git diff --stat viewer-index.json viewer-defs`가 비어 있음을 확인(바뀌면 되돌리고 원인 수정).
- [ ] **Step 5: 브라우저 확인.** 개발 서버를 띄워 `viewer.html`에서 `docs/viewer-corpus/drug-law-1col.pdf`를 열고(주 저장소 경로에서 파일 선택이 불가하면 Node로 로드만 확인하고 그 사실을 보고) 콘솔 오류가 없는지 본다.
- [ ] **Step 6: 커밋.** `뷰어: 용어 찾기 로직을 term-match.js로 분리(동작 변경 없음)`

---

### Task 2: 리더 뼈대

**Files:**
- Create: `reader.html`, `assets/reader/reader.css`, `assets/reader/doc.js`, `assets/reader/panels.js`, `assets/reader/reader.js`
- Test: `tests/reader-doc.test.js`

**Interfaces:**
- Consumes: `term-match.js`의 `computeDocHash`, `computeFitPageScale`, `clampPdfScale`, `clampPdfPageNumber`; `window.ViewerStorage`(최근 문서: `listDocuments`, `saveDocument`, `loadDocument`, `touchDocument`, `toFile`, `formatRecentLabel`).
- Produces (`window.ReaderDoc`):
  - `open(file) → Promise<{docHash, title, numPages}>` — 실패 시 `Error`(message는 사용자 문구). `reader:docopen` 발생.
  - `close()` — `reader:docclose`.
  - `getPdf()`, `getPage(n) → Promise<PDFPageProxy>`, `numPages()`, `docHash()`, `title()`.
  - `getScale()`, `setScale(scale)`, `fitWidth()`, `fitPage()` — `reader:scalechange`.
  - `currentPage()`, `goToPage(n, {yRatio})` — `yRatio`(0~1)는 쪽 안 세로 위치. `reader:pagechange`.
  - `pageEl(n) → HTMLElement`(`.rd-page`, `data-page`), `pageSize(n) → {w, h}`(배율 1), `scrollEl()`.
  - `visiblePages() → number[]`.
  - `pageToClient(n, {x, y}) → {x, y}`, `clientToPage(clientX, clientY) → {page, x, y} | null`.
  - `planWindow(current, total, radius) → number[]`(순수, 테스트 대상): 그릴 쪽 목록.
- Produces (`window.ReaderPanels`): `init()`, `toggle("left"|"right")`, `open(side)`, `close(side)`, `selectTab(side, tabId)`, `tabPanel(side, tabId) → HTMLElement`, `isOpen(side)`.
- Produces (`reader.html` 요소 id): `#reader`(전체 화면 루트, 기본 `hidden`), `#rd-toolbar`, `#rd-close`, `#rd-title`, `#rd-page-input`, `#rd-page-total`, `#rd-zoom-out`, `#rd-zoom-in`, `#rd-zoom-label`, `#rd-fit-width`, `#rd-fit-page`, `#rd-search-input`, `#rd-search-prev`, `#rd-search-next`, `#rd-search-count`, `#rd-terms-toggle`, `#rd-left-toggle`, `#rd-right-toggle`, `#rd-more`, `#rd-left`(탭 `outline`, `pages`), `#rd-right`(탭 `terms`, `notes`), `#rd-scroll`(쪽 목록 스크롤 영역), `#rd-notice`(안내 문구, `aria-live="polite"`), `#rd-back`(돌아가기 버튼, 기본 `hidden`), `#home`(첫 화면).
- 쪽 요소 구조: `<div class="rd-page" data-page="3" style="width;height"><canvas class="rd-canvas"></canvas><div class="textLayer"></div><div class="rd-overlay"></div></div>`. `.rd-overlay`와 `.textLayer`는 캔버스 위에 절대 배치, 겹침층이 텍스트 레이어 **아래**(선택을 가로막지 않게), 겹침층의 클릭 대상은 작업 3이 정한다.

요구사항:

- [ ] **Step 1: 테스트 먼저.** `tests/reader-doc.test.js`: `planWindow(5, 20, 2)` → `[3,4,5,6,7]`; `planWindow(1, 20, 2)` → `[1,2,3]`; `planWindow(20, 20, 2)` → `[18,19,20]`; `planWindow(1, 1, 2)` → `[1]`; `planWindow(0, 0, 2)` → `[]`. 실행해 실패 확인.
- [ ] **Step 2: `reader.html`.** `viewer.html`을 본떠 `<head>`(메타, `style.css`, `noindex` 메타 `<meta name="robots" content="noindex">`), 사이트 헤더·푸터, 첫 화면 `#home`(끌어다 놓기 `#rd-dropzone`, 파일 선택 `#rd-file`, 최근 문서 `#rd-recent`), 리더 `#reader`를 만든다. 광고 스크립트는 넣지 않는다. 글 붙여넣기 분석은 작업 10에서 옮기므로 여기서는 넣지 않는다. 스크립트 순서: pdf.js 모듈 블록(`viewer.html`과 동일) → `escape.js` → `category-data.js` → `viewer-storage.js` → `term-match.js` → `reader/*.js` → `reader/reader.js`.
- [ ] **Step 3: `doc.js`.** `open`은 `pdfjsLib.getDocument({data, isEvalSupported:false})`로 열고, 암호(`PasswordException`)는 "암호가 걸린 PDF는 열 수 없습니다", 그 밖의 실패는 "PDF를 열 수 없습니다. 파일이 손상되었을 수 있습니다"로 던진다. 쪽 자리는 처음에 1쪽 크기로 모두 만들고(스크롤 길이 확보), 쪽마다 실제 크기는 그릴 때 보정한다. `IntersectionObserver`로 보이는 쪽을 추적해 `planWindow(current, total, 2)`의 쪽만 캔버스에 그리고, 벗어난 쪽은 캔버스 크기를 0으로 줄여 메모리를 내린다. 그릴 때 `devicePixelRatio`를 반영하고, 진행 중인 `renderTask`는 다시 그리기 전에 `cancel()`한다. 텍스트 레이어는 `new pdfjsLib.TextLayer({textContentSource, container, viewport}).render()`로 그린다(`viewer.js`의 3873~3910행 방식 참고: `--scale-factor` 지정). 쪽을 그린 뒤 `reader:pagerendered`. 가장 많이 보이는 쪽이 바뀌면 `reader:pagechange`. 문서를 열면 `ViewerStorage.saveDocument`로 최근 문서에 넣는다(실패는 `#rd-notice`에 안내).
- [ ] **Step 4: `panels.js`와 CSS.** 넓은 화면: 3열 그리드(왼쪽 260px, 가운데 1fr, 오른쪽 340px), 접으면 0. 좁은 화면(`max-width: 767px`): 패널은 아래 서랍(높이 70vh, 한 번에 하나만 열림, 바깥을 누르면 닫힘). 열림 상태는 `localStorage` 키 `rd-panels`에 `{left:boolean,right:boolean}`으로 저장(읽기·쓰기 모두 try/catch). 탭은 `role="tablist"`/`role="tab"`/`aria-selected`. 색·글꼴은 `style.css`의 기존 CSS 변수를 쓴다(새 색을 만들지 않는다). 다크 모드가 사이트에 있으면 따른다.
- [ ] **Step 5: `reader.js`.** 파일 선택·끌어다 놓기·최근 문서 클릭 → `ReaderDoc.open` → `#home` 숨김, `#reader` 표시, `document.body`에 `rd-open` 클래스(사이트 헤더·푸터 숨김, 스크롤 잠금), `history.pushState`로 `#doc=<docHash 앞 12자>`. `popstate`와 `#rd-close`는 리더를 닫는다. 도구 막대: 쪽 번호 입력(Enter), 확대·축소(1.1배씩, `clampPdfScale`), 너비 맞춤, 쪽 맞춤, 패널 버튼. 배율은 `localStorage` `rd-scale`에 `"fit-width"|"fit-page"|숫자`로 기억. 첫 배율은 너비 맞춤. 검색·용어 버튼은 요소만 두고 동작은 뒤 작업이 붙인다(그때까지 `disabled`).
- [ ] **Step 6: 스캔본 안내.** 문서를 연 뒤 앞 3쪽의 `getTextContent().items`가 모두 비면 `#rd-notice`에 "이 PDF는 글자를 인식할 수 없어 형광펜·용어 표시를 쓸 수 없습니다"를 띄운다.
- [ ] **Step 7: 검증.** `npm test` 통과. 개발 서버에서 `reader.html`을 열어 PDF 2개(한 단, 두 단)를 열고: 스크롤, 쪽 번호 이동, 확대·축소 후 선명도, 패널 여닫기, 뒤로 가기, 375px 폭 서랍을 확인한다. 화면 사진을 보고서에 첨부 경로로 남긴다. 30쪽 문서에서 캔버스가 동시에 5개 이하만 살아 있는지 콘솔로 확인한다.
- [ ] **Step 8: 커밋.** `리더 뼈대: 전체 화면, 도구 막대, 쪽 그리기, 배율, 패널`

---

### Task 3: 글자 상자, 겹침층, 본문 검색, 위치 측정

**Files:**
- Create: `assets/reader/geometry.js`, `assets/reader/text-map.js`, `assets/reader/overlay.js`, `assets/reader/search.js`, `scripts/reader-geometry-eval.js`
- Modify: `assets/reader/reader.js`, `reader.html`(스크립트 태그)
- Test: `tests/reader-geometry.test.js`, `tests/reader-text-map.test.js`

**Interfaces:**
- Consumes: `ReaderDoc`(작업 2), `joinTextItems`, `orderTextItemsByColumn`, `collapseLetterSpacedHangul`.
- Produces (`ReaderGeometry`, 순수):
  - `charWeights(str) → number[]` — 글자 종류 가중치(한글·한자·가나 1, 라틴 대문자 0.7, 소문자·숫자 0.55, 공백 0.3, 그 밖 0.5).
  - `splitWidth(totalWidth, weights) → number[]` — 누적 경계(길이 `weights.length + 1`, 첫 값 0, 끝 값 `totalWidth`).
  - `rangeRects(charBoxes, start, end) → Rect[]` — 글자 상자 배열에서 범위를 **줄·조각 단위로 병합**한 사각형. 같은 조각 안의 연속 글자는 하나로, 서로 다른 조각이라도 같은 줄(세로 겹침 50% 이상)이고 가로 간격이 글자 높이의 0.6 미만이면 하나로. 그보다 벌어지면(단 사이 여백) 끊는다. `null` 상자(줄바꿈 등 화면에 없는 글자)는 건너뛴다.
  - `hitTest(charBoxes, x, y) → index | -1`.
  - `unionRect(rects) → Rect | null`.
- Produces (`ReaderTextMap`):
  - `buildPageText(items, pageWidth) → {text, charItem: Int32Array, charOffset: Int32Array}` — 순수. `text === joinTextItems(items, pageWidth)`. `charItem[i]`는 글자 i가 나온 조각의 **원래 `items` 배열 번호**(삽입된 공백·줄바꿈은 -1), `charOffset[i]`는 그 조각의 (자간 접기 **전**) `str` 안 위치.
  - `buildCharBoxes(items, viewportTransform, pageText, measure) → (Rect|null)[]` — 순수. `measure(fontName, fontSizePx, str) → number[] | null`(글자별 폭; 없으면 null)을 주입받는다. 조각의 시작점은 `transform`을 `viewportTransform`으로 변환해 구하고, 글자 높이는 `|transform[3]|`(배율 1 기준), 상자 위쪽 y는 기준선 − 높이×0.85, 높이는 높이×1.15. 측정값이 있으면 그 합을 조각 폭(`item.width`)에 맞춰 비율 보정, 없으면 `charWeights`로 나눈다. 회전된 조각(`transform[1]`이나 `[2]`가 0이 아님)은 조각 전체 상자를 글자 수로 균등 분할한다.
  - `get(page) → Promise<{text, charBoxes, items} | null>` — 글자가 없는 쪽은 `text === ""`. 결과를 캐시. 준비되면 `reader:pagetext`.
  - `allPageTexts() → Promise<string[]>` — 문서 전체 쪽 글(목차·참고문헌용). 4쪽씩 묶어 순차 처리.
  - `domPointToOffset(page, node, offsetInNode) → number` — 텍스트 레이어 span(조각 하나에 대응)과 그 안 글자 위치를 쪽 글 위치로. span ↔ 조각 번호 대응은 텍스트 레이어를 그릴 때 pdf.js가 주는 `textDivs` 순서(= `items` 순서 중 `str`이 있는 것)로 잡는다.
- Produces (`ReaderOverlay`):
  - `setRects(page, layer, entries)` — `layer`는 `"highlight"|"term"|"search"|"ref"|"flash"`, `entries`는 `[{id, rects, className, data}]`. 그 쪽의 그 층을 통째로 바꾼다. 쪽이 아직 안 그려졌으면 보관했다가 `reader:pagerendered` 때 그린다. 배율이 바뀌면 다시 계산하지 않고 CSS 변환(`transform: scale(var(--rd-scale))`, 원점 왼쪽 위)으로 따라간다.
  - `clear(layer)`, `clearPage(page, layer)`.
  - `entryAt(clientX, clientY, layers) → {page, layer, id, data} | null` — 겹침층은 `pointer-events: none`이므로 좌표로 직접 찾는다.
  - `flash(page, rects)` — 1.2초 반짝임.
- Produces (`ReaderSearch`): `run(query) → Promise<number>`(건수), `next()`, `prev()`, `clear()`, `count()`, `index()`.

요구사항과 테스트:

- [ ] **Step 1: `tests/reader-geometry.test.js`.**
  - `splitWidth(100, [1,1,1,1])` → `[0,25,50,75,100]`; `splitWidth(0, [])` → `[0]`.
  - `charWeights("가A a")` → `[1, 0.7, 0.3, 0.55]`.
  - `rangeRects`: 한 줄 5글자 상자(x 0·10·20·30·40, w 10, y 0, h 12)에서 `(1,4)` → `[{x:10,y:0,w:30,h:12}]`.
  - 두 줄에 걸친 범위 → 사각형 2개.
  - **Review Focus 1**: 같은 y에 x 0~40(왼쪽 단)과 x 300~340(오른쪽 단) 상자가 이어진 배열에서 전체 범위 → 사각형 2개이고 어느 것도 x 40~300 구간을 덮지 않는다.
  - `null` 상자가 섞인 범위 → `null`을 건너뛰고 오류 없음. 빈 범위(`start === end`) → `[]`. 범위가 배열을 넘으면 잘라서 처리.
  - `hitTest`: 상자 안 좌표 → 그 번호, 밖 → -1.
- [ ] **Step 2: `tests/reader-text-map.test.js`.** `tests/viewer-jointextitems.test.js`의 `item()` 도우미와 그 파일의 입력 사례를 가져와, 각 사례에서 `buildPageText(items, w).text === joinTextItems(items, w)`를 확인한다. 추가:
  - 한 낱말이 두 조각으로 쪼개진 경우: `charItem`이 `[0,0,…,1,1,…]`, 삽입 공백 없음.
  - 조각 사이에 공백이 삽입된 경우: 그 위치의 `charItem`은 -1.
  - **Review Focus 2**: `str`이 `"연 구 방 법"`인 조각 → `text`는 `"연구방법"`, `charOffset`은 `[0,2,4,6]`.
  - 두 단(`orderTextItemsByColumn`이 순서를 바꾸는 입력): `charItem`은 **원래 배열 번호**를 가리킨다.
  - `buildCharBoxes`: 폭 40짜리 4글자 조각, `measure`가 `[10,10,10,10]` → 상자 x가 10씩 증가. `measure`가 `[5,5,5,5]`(합 20) → 비율 보정으로 여전히 10씩. `measure`가 `null` → `charWeights` 분할. 삽입 공백·줄바꿈 → `null`.
- [ ] **Step 3: 구현.** `geometry.js`, `text-map.js`를 테스트가 통과하도록 구현. `get(page)`의 `measure`는 화면 밖 캔버스 2D 컨텍스트로 만든다: `ctx.font = `${size}px "${fontName}"``, `document.fonts.check(ctx.font)`가 false면 `null` 반환. 조각의 글꼴 이름은 `item.fontName`(pdf.js가 `document.fonts`에 등록하는 이름과 같다). 쪽 캔버스를 그린 뒤에야 글꼴이 등록되므로 `get(page)`는 그 쪽의 `reader:pagerendered`를 기다린 뒤 측정하고, 문서 전체 쪽 글만 필요한 `allPageTexts()`는 측정 없이 `buildPageText`만 쓴다.
- [ ] **Step 4: `overlay.js`.** 사각형은 쪽 좌표(배율 1)로 `<div class="rd-rect rd-<layer> <className>">`를 절대 배치한다. 층 순서: search > highlight > ref > term. 형광펜은 `mix-blend-mode: multiply`인 반투명 배경, 용어는 아래쪽 1px 점선, 검색은 테두리 + 옅은 배경(현재 결과는 진하게).
- [ ] **Step 5: `search.js`와 도구 막대 연결.** 대소문자 무시, 연속 공백·줄바꿈은 공백 하나로 접어 비교(쪽 글에서 줄바꿈으로 끊긴 구절도 찾는다). 결과는 쪽 순서·글자 위치 순서. `next`/`prev`는 그 결과로 스크롤하고 `#rd-search-count`에 "3 / 17". 결과가 없으면 "0건". 입력이 비면 지운다. 입력은 250ms 디바운스.
- [ ] **Step 6: 위치 측정 스크립트.** `scripts/reader-geometry-eval.js <pdf>…`: Node에서는 pdf.js 캔버스·글꼴 측정을 쓸 수 없으므로, **브라우저 측정 페이지** `tools/reader-geometry-eval.html`(작업 폴더, `noindex`)을 만들어 그 안에서 측정하고 스크립트는 그 사용법을 출력한다. 측정 페이지: PDF를 골라 열고, 쪽마다 낱말 20개를 무작위(고정 시드)로 뽑아 (a) `buildCharBoxes`의 낱말 상자, (b) 캔버스에서 그 상자 주변(좌우 글자 높이 1배, 상하 0.5배)의 잉크 픽셀(밝기 < 128) 분포를 구해, 상자 안에 들어온 잉크 비율과 상자 좌우 경계에서 가장 가까운 "잉크 없는 세로 틈"까지의 거리를 잰다. 스펙 §7.1의 기준으로 맞음/틀림을 세어 문서별·전체 표와 틀린 낱말 목록(쪽, 낱말, 어긋남 px)을 화면과 `console.table`에 낸다. `?measure=off`로 열면 글꼴 측정을 끄고 가중치 분할만 쓴다(비교용).
- [ ] **Step 7: 측정과 판정.** 주 저장소 `docs/viewer-corpus/`의 PDF 중 한 단 2개, 두 단 2개, 영문 1개 이상을 열어 측정한다. 전체 맞은 비율이 98% 이상이면 통과. 못 미치면 틀린 낱말 유형을 분석해 고치고(기준선 비율, 글꼴 이름 대응, 회전 등), 그래도 안 되면 스펙 §4.3의 물러나는 순서를 적용하고 **보고서에 그 사실과 수치를 적는다**(조용히 넘어가지 않는다).
- [ ] **Step 8: 검증·커밋.** `npm test` 통과. 브라우저에서 검색어 3개(한글 낱말, 영문 구절, 줄바꿈에 걸친 구절)가 원문 글자 위에 정확히 놓이는지 확대 100%·200%에서 화면 사진으로 확인. 커밋 `리더: 글자 상자, 겹침층, 본문 검색, 위치 측정 도구`

---

### Task 4: 선택 도구, 형광펜·메모, 메모 패널

**Files:**
- Create: `assets/reader/selection.js`, `assets/reader/annotations.js`
- Modify: `assets/reader/reader.js`, `reader.html`, `assets/reader/reader.css`
- Test: `tests/reader-annotations.test.js`, `tests/reader-selection.test.js`

**Interfaces:**
- Consumes: `ReaderTextMap.get/domPointToOffset`, `ReaderOverlay.setRects/entryAt/flash`, `ReaderGeometry.rangeRects`, `resolveAnnotationAnchor`, `shouldPersistReanchor`, `mergeOverlappingRanges`(term-match.js), 저장 계층 `window.ReaderStore = {loadAnnotations(docHash), createAnnotation(docHash, docTitle, annotation), updateAnnotationNote(docHash, id, note), updateAnnotationAnchor(docHash, id, anchor), deleteAnnotation(docHash, id)}`(reader.html의 module 블록에서 `assets/pdf-annotations.js`를 import해 넘긴다). 저장 기록의 필드 이름은 `assets/pdf-annotations.js`와 `viewer.js`의 `renderAnnotationMarks`·`createAnnotation` 호출부를 읽어 **그대로** 따른다(page, startOffset, endOffset, quoteText, color, note 등).
- Produces (`ReaderSelection`):
  - `normalizeRanges(pieces) → [{page, start, end}]`(순수) — `pieces`는 쪽별 `{page, a, b}`(a, b는 쪽 글 위치, 순서 무관). 쪽마다 `start < end`로 정렬하고 빈 것 제거, 쪽 오름차순.
  - `current() → {ranges, text, clientRect} | null`.
  - `onSelect(callback)`, `clear()`.
  - 선택 도구 요소 `#rd-seltool`(버튼 `data-act="hl"` + `data-color`, `data-act="memo"`, `data-act="copy"`, `data-act="lookup"`). `lookup`은 `reader:lookup` 이벤트(detail `{text}`)만 내고 처리는 작업 5.
- Produces (`ReaderAnnotations`):
  - `load(docHash, title) → Promise<void>`, `add(ranges, text, color, note) → Promise<record[]>`, `setColor(id, color)`, `setNote(id, note)`, `remove(id)`.
  - `sanitizeRecords(raw) → record[]`(순수) — 배열이 아니면 `[]`, 항목이 객체가 아니거나 `page`가 양의 정수가 아니면 버림.
  - `placeRecords(records, pageText) → [{record, start, end, status}]`(순수) — `resolveAnnotationAnchor` 적용, `status`는 `"offset"|"quote"|"lost"`.
  - `list() → [{record, status}]`, `goTo(id)`.

요구사항과 테스트:

- [ ] **Step 1: `tests/reader-selection.test.js`.** `normalizeRanges([{page:2,a:10,b:3},{page:1,a:5,b:9}])` → `[{page:1,start:5,end:9},{page:2,start:3,end:10}]`. **Review Focus 3**: `a === b`인 조각은 제거, 전부 제거되면 `[]`. 같은 쪽 조각이 둘이면 합친 최소~최대 범위 하나.
- [ ] **Step 2: `tests/reader-annotations.test.js`.** **Review Focus 5**: `sanitizeRecords(null)`, `sanitizeRecords("x")`, `sanitizeRecords([null, 3, {page:0}, {page:"2"}, {page:2,startOffset:1,endOffset:4,quoteText:"abc"}])` → 마지막 한 건만. `placeRecords`: 위치가 맞는 기록 → `status:"offset"`; 글이 밀려 위치가 어긋났지만 글귀가 있는 기록 → `"quote"`와 새 위치; 글귀가 쪽에 없는 기록 → `"lost"`.
- [ ] **Step 3: `selection.js`.** `selectionchange`(디바운스 120ms)와 `pointerup`에서 브라우저 선택을 읽는다. 선택의 시작·끝 노드가 `.textLayer` 안이 아니면 무시. 쪽을 넘는 선택은 걸친 쪽마다 조각을 만든다(시작 쪽은 시작점~쪽 끝, 중간 쪽은 전체, 끝 쪽은 처음~끝점). 두 단에서 브라우저 선택이 DOM 순서로 번지는 문제: 시작점·끝점의 쪽 글 위치만 쓰고 그 사이는 쪽 글의 읽기 순서 범위로 본다. 글자 수 2 미만이면 도구를 띄우지 않는다. 도구는 선택 사각형 위(공간이 없으면 아래)에 띄우고, 스크롤·Esc·바깥 클릭으로 닫는다. 터치 기기에서는 OS 선택 메뉴와 겹치지 않게 선택 아래에 띄운다.
- [ ] **Step 4: `annotations.js`.** `load`는 `ReaderStore.loadAnnotations` → `sanitizeRecords` → 쪽 글이 준비되는 대로(`reader:pagetext`) `placeRecords` → `ReaderOverlay.setRects(page, "highlight", …)`. `status === "quote"`이고 `shouldPersistReanchor`가 참이면 `updateAnnotationAnchor`로 새 위치를 저장한다(옛 뷰어 동작과 같다). `add`는 쪽마다 한 건씩 만든다. 저장 계층이 실패를 알리면(`false`/throw) `#rd-notice`에 스펙 §6 문구. 형광펜을 누르면(`ReaderOverlay.entryAt`, 글자 선택 중이 아닐 때) 작은 편집 창(색 4개, 메모 입력, 저장, 삭제). 메모가 있는 형광펜은 오른쪽 끝에 작은 표시.
- [ ] **Step 5: 메모 패널.** 오른쪽 "메모" 탭에 쪽 순서로 목록(쪽 번호, 색, 글귀 앞 80자, 메모). `status === "lost"`는 맨 아래 "위치를 찾지 못함" 묶음. 항목을 누르면 `goTo` → 스크롤 + `flash`. 탭 이름 옆에 건수.
- [ ] **Step 6: 옛 기록 호환 확인.** 개발 서버에서 `viewer.html`(옛 뷰어)로 PDF를 열어 텍스트 보기에서 형광펜 3개·메모 1개를 남긴 뒤, 같은 PDF를 `reader.html`로 열어 같은 글귀 위에 보이는지 확인한다(같은 origin이라 `localStorage`를 공유한다). 화면 사진.
- [ ] **Step 7: 검증·커밋.** `npm test`. 한 단·두 단 문서에서 한 줄, 여러 줄, 쪽을 넘는 선택, 두 단에서 왼쪽 단 여러 줄 선택이 오른쪽 단으로 새지 않는지 확인. 커밋 `리더: 원문 위 형광펜·메모, 선택 도구, 메모 패널`

---

### Task 5: 용어 밑줄·카드·용어 패널

**Files:**
- Create: `assets/reader/terms-layer.js`
- Modify: `assets/reader/reader.js`, `reader.html`, `assets/reader/reader.css`
- Test: `tests/reader-terms-layer.test.js`

**Interfaces:**
- Consumes: `term-match.js`의 `decodeViewerIndex`, `buildExactIndex`, `matchTermsWithIndex`, `applySenseToMatches`, `defBucket`, `decodeDefChunk`, `termCardHTML`, `popoverHTML`, `buildCardUnits`, `estimateDocumentFields`, `groupMatchesByField`, `withAssetVersion`; `ReaderTextMap`, `ReaderOverlay`, `ReaderGeometry`. 용어 데이터 로딩 방식은 `viewer.js`의 `loadTerms()`와 정의 청크 로딩을 읽고 **같은 파일·같은 순서**로 한다(`viewer-index.json`, `viewer-defs/<bucket>.json`).
- Produces (`ReaderTerms`):
  - `firstPerPage(matches) → [{slug, start, end}]`(순수) — 쪽 하나의 매치 목록에서 용어(slug)마다 가장 앞의 등장 하나만.
  - `init()`, `setVisible(bool)`, `isVisible()`, `hide(slug)`, `restoreAll()`, `lookup(text) → matches`.
  - 문서 전체 매치는 옛 뷰어처럼 **문서 전체 글에 한 번** 돌린 뒤 `splitMatchesByPage`로 쪽에 나눈다(분야 추정·동음이의어 판정이 문서 단위이기 때문). 쪽 단위로 따로 돌리지 않는다.

요구사항과 테스트:

- [ ] **Step 1: 테스트.** `firstPerPage([{slug:"a",start:5,end:7},{slug:"a",start:20,end:22},{slug:"b",start:9,end:12}])` → a는 5~7만, b는 9~12. 빈 입력 → `[]`. 같은 위치에 겹친 긴 용어·짧은 용어가 있으면 `term-match.js`의 `orderNestedMatches`/`computeKeptSpans` 결과(긴 것 우선)를 따른다 — 그 함수에 넘기는 입력과 기대 출력을 `tests/viewer-nested.test.js`·`viewer-keptspans.test.js`에서 가져와 한 사례 확인.
- [ ] **Step 2: 구현.** 문서를 열면 `ReaderTextMap.allPageTexts()` → 옛 뷰어와 같은 방식(`buildPageOffsets`의 이음 문자 포함)으로 이어 붙여 매칭 → 쪽별 분배 → 쪽이 준비되면 `firstPerPage` → `ReaderOverlay.setRects(page, "term", …)`. 매칭은 화면을 막지 않게 `requestIdleCallback`(없으면 `setTimeout`)으로 미룬다.
- [ ] **Step 3: 카드.** 용어 위에 마우스를 300ms 올리면(`pointermove` + `ReaderOverlay.entryAt`, 글자 선택 중에는 띄우지 않음) `popoverHTML`로 카드. 카드로 마우스를 옮기면 유지, 떠나면 200ms 뒤 닫힘. 누르면 오른쪽 패널 "용어" 탭을 열고 그 용어 카드를 맨 위에 펼친다. 카드에 "이 용어 숨기기"(옛 뷰어의 숨김 저장 키를 그대로 쓴다 — `viewer.js`의 `loadHiddenSlugs`/`saveHiddenSlugs` 참고). 터치(`pointerType === "touch"`)에서는 누르면 카드.
- [ ] **Step 4: 용어 패널.** 옛 뷰어의 오른쪽 패널을 옮긴다: 지금 쪽의 용어(쪽이 바뀌면 이 부분만 다시 그림), 전체 용어(분야 필터, 패널 내 검색, 영어 용어만, 8개씩 더 보기, 숨긴 용어 복원, 찾은 용어로 퀴즈 링크). 카드를 누르면 그 용어가 처음 나온 위치로 이동 + `flash`. `reader:lookup`(작업 4의 "사전에서 찾기")을 받으면 `lookup(text)` 결과를 패널 맨 위에 보여 주고, 없으면 "사전에 없는 말입니다"와 사이트 검색 링크.
- [ ] **Step 5: 도구 막대.** `#rd-terms-toggle`로 켜고 끈다(`localStorage` `rd-terms-visible`, 기본 켬). 끄면 밑줄만 사라지고 패널 목록은 남는다.
- [ ] **Step 6: 검증.** `npm test`. `node scripts/viewer-eval.js` 결과가 작업 1 직후와 같다(로직을 건드리지 않았는지 확인). 브라우저: 옛 뷰어와 새 리더에서 같은 PDF의 전체 용어 수가 같은지 비교. 화면 사진(밑줄, 카드, 패널).
- [ ] **Step 7: 커밋.** `리더: 원문 위 용어 밑줄·카드, 용어 패널`

---

### Task 6: 목차와 쪽 축소 그림

**Files:**
- Create: `assets/reader/outline.js`
- Modify: `assets/reader/reader.js`, `reader.html`, `assets/reader/reader.css`
- Test: `tests/reader-outline.test.js`

**Interfaces:**
- Consumes: `ReaderDoc.getPdf/getPage/goToPage/pageSize`, `ReaderTextMap.get/allPageTexts`.
- Produces (`ReaderOutline`):
  - `guessHeadings(pages) → [{title, page, y, level}]`(순수) — `pages`는 `[{page, lines:[{text, fontSize, bold, x, y}]}]`.
  - `linesFromItems(items, viewportTransform) → lines`(순수) — 조각을 줄로 묶어 줄별 글, 대표 글자 크기, 굵기(글꼴 이름에 `Bold`/`Black`/`Heavy`), 위치.
  - `load() → Promise<{source:"pdf"|"guess"|"none", entries}>`, `entries`는 `[{title, page, y, level, children}]`.
  - `currentEntry(page, y)` — 지금 읽는 위치의 목차 항목(패널 강조용).

요구사항과 테스트:

- [ ] **Step 1: 테스트(`guessHeadings`).** 본문 크기 10이 대부분인 입력에서: `"1. 서론"`(크기 13) → level 1; `"1.1 연구 배경"`(크기 11, 굵음) → level 2; `"Abstract"`(크기 10, 굵음) → level 1; `"참고문헌"`(크기 12) → level 1; 본문 문장 `"본 연구는 … 하였다."`(크기 10) → 제외; 번호로 시작하지만 본문 크기·보통 굵기인 `"3. 표본은 다음과 같다"` → 제외; 80자를 넘는 줄 → 제외; 쪽마다 반복되는 머리말(같은 글이 3쪽 이상 같은 y에 등장) → 제외. 결과가 3개 미만이면 `[]`.
- [ ] **Step 2: 구현.** `pdf.getOutline()`이 있으면 `getDestination`/`getPageIndex`로 쪽과 y를 구해 쓴다(대상이 없는 항목은 건너뜀). 없으면 `guessHeadings`. 왼쪽 "목차" 탭에 들여쓰기 목록으로 그리고, 누르면 `goToPage(page, {yRatio})` + 돌아가기 버튼(`#rd-back`, 8초; 돌아가기 동작 자체는 여기서 구현하고 작업 7이 재사용한다 — `window.ReaderNav = {jump(page, yRatio), back()}`를 `reader.js`에 둔다). 목차가 없으면 스펙 문구를 보이고 "쪽" 탭을 기본으로.
- [ ] **Step 3: 쪽 축소 그림.** "쪽" 탭에 쪽마다 폭 120px 캔버스. 탭이 열려 있고 화면에 보이는 것만 그린다(`IntersectionObserver`), 한 번 그린 것은 유지. 지금 쪽 강조, 누르면 이동.
- [ ] **Step 4: 검증·커밋.** `npm test`. 목차가 든 PDF 1개, 없는 PDF 2개(국문·영문)에서 추정 결과를 눈으로 확인하고 틀린 항목 수를 보고서에 적는다. 커밋 `리더: 목차(내장·추정)와 쪽 축소 그림`

---

### Task 7: 참고문헌·인용 카드, 참조 미리보기

**Files:**
- Create: `assets/reader/refs.js`, `assets/reader/preview.js`
- Modify: `assets/reader/reader.js`, `reader.html`, `assets/reader/reader.css`
- Test: `tests/reader-refs.test.js`

**Interfaces:**
- Consumes: `ReaderTextMap`, `ReaderOverlay`(층 `"ref"`), `ReaderDoc`, `ReaderNav`, `ReaderOutline.load()`(절 참조의 대상).
- Produces (`ReaderRefs`, 전부 순수):
  - `findReferenceSection(pageTexts) → {page, offset, endPage, endOffset} | null`
  - `splitReferences(text) → [{n: number|null, text, start, end}]`
  - `findNumericCitations(pageText, refCount) → [{start, end, numbers:number[]}]`
  - `findAuthorYearCitations(pageText) → [{start, end, authors:string[], year:string}]`
  - `matchAuthorYear(citation, refs) → index | -1` — 정확히 하나일 때만.
  - `findCrossRefs(pageText) → [{start, end, kind:"fig"|"table"|"sec"|"eq", label:string}]`
  - `findTargets(pageTexts) → Map<"fig:3"|"table:2"|"eq:5", {page, offset}>`
- Produces (`ReaderPreview`): `init()`. 카드 요소에 `data-ref-index`를 두고 "자세히" 버튼(`.rd-ref-more`)은 `reader:refdetail` 이벤트(detail `{index, text, container}`)만 낸다(작업 8이 처리).

요구사항과 테스트:

- [ ] **Step 1: 테스트(`tests/reader-refs.test.js`).**
  - `findReferenceSection`: `"…결론…\nReferences\n[1] Kim…"` → 그 제목 줄 다음 위치. `"참고문헌"`, `"참 고 문 헌"`(자간은 이미 접힌 글이 들어오므로 `"참고문헌"`), `"REFERENCES"`. 본문 중의 `"…in the references section…"` 문장은 제목이 아니다(줄 전체가 제목일 때만). 뒤에 `"Appendix"`/`"부록"` 제목 줄이 있으면 거기서 끝. 없으면 `null`.
  - `splitReferences`: `"[1] A. Kim, Title, 2020.\n[2] B. Lee,\n  Long title, 2019."` → 2건, 둘째는 줄바꿈을 포함. `"1. Kim …\n2. Lee …"` → 2건. 번호 없는 저자-연도 목록 `"Kim, A. (2020). Title.\nLee, B. (2019). Other."` → 2건, `n`은 null.
  - `findNumericCitations("as shown [3], [4,7] and [10–12].", 12)` → 3건, numbers `[3]`, `[4,7]`, `[10,11,12]`. **Review Focus 4**: `"[2020]"`(범위 밖) → 없음; `"[0]"` → 없음; `"식 (5)"`·`"(5)"` → 없음(소괄호 숫자는 인용으로 보지 않는다); `refCount`가 0 → `[]`.
  - `findAuthorYearCitations`: `"(Kim, 2020)"`, `"(Kim & Lee, 2020)"`, `"(Kim et al., 2020; Park, 2019)"`(2건), `"Kim et al. (2020)"`, `"(김철수, 2020)"`, `"(김철수 외, 2020)"`. `"(Figure 3, 2020)"`처럼 저자가 아닌 말(`Figure`, `Table`, `Eq`, `그림`, `표`)은 제외.
  - `matchAuthorYear`: Kim 2020이 하나 → 그 번호; Kim 2020a/2020b 둘 → -1; 없음 → -1.
  - `findCrossRefs("see Fig. 3 and Table 2, Section 2.1, Eq. (5), 그림 4, 표 1")` → 6건과 각 label.
  - `findTargets`: 줄 머리의 `"Figure 3."`·`"Fig. 3:"`·`"Table 2."`·`"그림 4."`·`"표 1."`만 대상. 본문 중간의 `"…as in Figure 3. The…"`는 대상이 아니다(줄 머리가 아니다). 같은 번호가 두 번 나오면 첫 번째.
- [ ] **Step 2: 구현(`refs.js`).** 참고문헌 구역 안에서는 인용·참조를 찾지 않는다(호출부에서 범위 제외).
- [ ] **Step 3: `preview.js`.** 문서를 열면 한가할 때 `allPageTexts()`로 참고문헌·대상을 구한다. 쪽이 준비되면 그 쪽의 인용·참조를 찾아 `"ref"` 층에 등록(보이는 표시는 마우스를 올렸을 때의 옅은 배경뿐, 평소에는 투명). 300ms 올리면: 인용 → 참고문헌 문구 카드(여러 번호면 목록, 최대 5건 + "외 n건"), 참조 → 대상 영역 미리보기(작은 캔버스에 `page.render`로 해당 영역만, 폭 360px; 그림은 캡션 위쪽으로, 표는 아래쪽으로 쪽 높이의 40%; 식·절은 대상 줄 위아래 15%). 누르면 `ReaderNav.jump`. 연결 못 한 것은 등록하지 않는다. 터치에서는 누르면 카드, 카드의 "이동" 버튼으로 이동.
- [ ] **Step 4: 정밀도 측정.** `tools/reader-refs-eval.html`(noindex): PDF를 열면 연결된 인용을 문서당 최대 30건 무작위(고정 시드)로 뽑아 "인용 주변 문장 / 연결된 참고문헌 문구"를 나란히 표로 보여 준다. 구현자는 corpus PDF 3개 이상(번호식 2, 저자-연도식 1 이상)에서 이 표를 직접 읽고 맞음/틀림을 세어 보고서에 문서별 정밀도와 재현율(연결된 인용 수 / 찾은 인용 수)을 적는다. 정밀도 98% 미만인 형식은 원인을 고치거나 그 형식을 끈다(끈 경우 보고서에 명시).
- [ ] **Step 5: 검증·커밋.** `npm test`. 화면 사진(인용 카드, 그림 미리보기, 돌아가기). 커밋 `리더: 인용 카드와 그림·표·절·식 미리보기`

---

### Task 8: 외부 서지 조회

**Files:**
- Create: `assets/reader/biblio.js`
- Modify: `assets/reader/reader.js`, `reader.html`, `assets/reader/reader.css`, `privacy.html`
- Test: `tests/reader-biblio.test.js`

**Interfaces:**
- Consumes: `reader:refdetail`(작업 7).
- Produces (`ReaderBiblio`):
  - `normalizeTitle(s) → string[]`(순수) — 소문자, 기호 제거, 낱말 배열(2글자 미만 제외).
  - `yearsIn(s) → string[]`(순수) — 1900~2099의 4자리 수.
  - `isMatch(refText, candidate) → boolean`(순수) — `candidate`는 `{title, year}`. 제목 낱말의 80% 이상이 `refText`에 있고, `candidate.year`가 `yearsIn(refText)`에 있을 때 true. 제목 낱말이 3개 미만이면 false.
  - `pickMatch(refText, items) → item | null`(순수) — Crossref `message.items` 중 첫 일치.
  - `lookup(refText) → Promise<{status:"ok", data} | {status:"nomatch"} | {status:"error"}>` — 같은 `refText`는 문서를 닫을 때까지 캐시.

요구사항과 테스트:

- [ ] **Step 1: 테스트.** `isMatch("A. Kim and B. Lee, Deep learning for cats, J. Cat Sci., 2020.", {title:"Deep Learning for Cats", year:"2020"})` → true; 연도 2019 → false; 제목 `"Deep Learning for Dogs"` → false(4낱말 중 3 = 75%); 제목 `"Cats"` → false. `pickMatch`가 둘째 항목을 고르는 사례, 전부 불일치 → null. `yearsIn("vol. 2020, pp. 1999–2005, 2021")` → `["2020","1999","2005","2021"]`.
- [ ] **Step 2: 구현.** `fetch("https://api.crossref.org/works?rows=3&select=title,author,issued,container-title,DOI,abstract,URL&query.bibliographic=" + encodeURIComponent(refText.slice(0, 300)))`. 헤더를 추가하지 않는다(개인 식별 정보 금지). 8초 타임아웃(`AbortController`). 응답 연도는 `issued["date-parts"][0][0]`. 초록의 JATS 태그는 제거하고 `textContent`로 넣는다. 링크는 `https://doi.org/<DOI>`만 만들고 `rel="noopener noreferrer" target="_blank"`.
- [ ] **Step 3: 카드 연결.** "자세히"를 누르면 "불러오는 중…" → 결과(제목, 저자 3명 + "외", 연도, 학술지, 초록 앞 600자, 원문 링크) / "일치하는 문헌을 찾지 못했습니다" / "정보를 가져오지 못했습니다" + 다시 시도.
- [ ] **Step 4: `privacy.html`.** 제3자 제공·외부 서비스 관련 절을 찾아 다음 문장을 추가한다: "논문 읽기 도구의 인용 카드에서 '자세히'를 누르면, 해당 참고문헌의 서지 문구가 서지 정보 조회를 위해 Crossref(api.crossref.org)로 전송됩니다. 이 요청에는 계정 정보가 포함되지 않습니다."
- [ ] **Step 5: 검증·커밋.** `npm test`. 브라우저에서 성공·불일치·실패(개발자 도구로 오프라인) 세 경우 화면 사진. 커밋 `리더: 인용 카드의 외부 서지 조회(Crossref), 개인정보처리방침 문장`

---

### Task 9: 좁은 화면, 키보드, 접근성

**Files:**
- Modify: `assets/reader/reader.js`, `assets/reader/reader.css`, `assets/reader/panels.js`, 필요 시 다른 `assets/reader/*.js`, `reader.html`
- Test: `tests/reader-keys.test.js`

**Interfaces:**
- Produces (`reader.js`): `keyAction(e) → string | null`(순수, `{key, ctrlKey, metaKey, shiftKey, targetIsInput, inSearchInput}`를 받아 `"search"|"search-next"|"search-prev"|"zoom-in"|"zoom-out"|"fit-width"|"page-next"|"page-prev"|"toggle-left"|"toggle-right"|"escape"|null`).

- [ ] **Step 1: 테스트.** 스펙 §3.4 표의 각 행. `targetIsInput`이 참이면 `[`, `]`, 화살표는 null, Esc와 Ctrl+F는 동작. 검색 입력에서 Enter → `search-next`, Shift+Enter → `search-prev`. Mac의 `metaKey`도 Ctrl과 같게.
- [ ] **Step 2: 구현.** `keydown`을 `keyAction`으로 분기. Ctrl+F·Ctrl+±·Ctrl+0은 `preventDefault`. Esc는 열린 것(카드 → 선택 도구 → 편집 창 → 서랍 → 검색 입력 초점) 순으로 닫고, 아무것도 없으면 리더를 닫는다.
- [ ] **Step 3: 좁은 화면.** 767px 이하: 도구 막대는 닫기·쪽 번호·검색·패널 버튼, 나머지는 `#rd-more` 메뉴. 터치 대상 최소 40px. 두 손가락 확대는 브라우저 기본을 막지 않는다. 서랍이 열리면 배경 스크롤 잠금.
- [ ] **Step 4: 접근성.** 모든 버튼에 `aria-label` 또는 글자. 카드·편집 창은 `role="dialog"` + 초점 이동·복귀. 초점 표시(`:focus-visible`). `prefers-reduced-motion`이면 반짝임·전환 끔. 색만으로 구분하지 않게 형광펜 색 버튼에 이름.
- [ ] **Step 5: 검증·커밋.** `npm test`. 375×812에서 PDF 열기 → 용어 카드 → 형광펜 → 메모 → 목차 이동 → 인용 카드 → 검색을 처음부터 끝까지 하고 단계별 화면 사진. 키보드만으로 같은 흐름. 커밋 `리더: 좁은 화면, 키보드, 접근성`

---

### Task 10: 교체 (사용자 확인 뒤에 진행)

**Files:**
- Modify: `viewer.html`(새 리더 마크업으로), `assets/viewer.js`(삭제 또는 글 붙여넣기 분석만 남김), `style.css`(옛 뷰어 전용 규칙 정리), `scripts/stamp-viewer-version.js`, `tests/*`(옛 화면 코드에 묶인 테스트 정리)
- Delete: `reader.html`(내용을 `viewer.html`로 옮긴 뒤), `tools/reader-*-eval.html`은 남긴다(noindex)

- [ ] **Step 1:** `reader.html`의 내용을 `viewer.html`로 옮긴다. `viewer.html`의 SEO 메타(제목, 설명, canonical, JSON-LD), 광고·분석 스크립트, 헤더 검색·로그인 스크립트는 유지한다. `noindex`는 넣지 않는다.
- [ ] **Step 2:** 글 붙여넣기 분석(첫 화면의 textarea → 용어 찾기 → 강조된 글 + 용어 패널)을 `assets/reader/paste.js`로 옮긴다. 옛 `viewer.js`의 해당 흐름(`renderRenderedPane`, `buildHighlightedHtml`, 자동 분석 디바운스, 저장된 글 복원)만 가져오고 PDF 관련 코드는 버린다.
- [ ] **Step 3:** `assets/viewer.js` 삭제, `viewer.html`의 스크립트 태그와 버전 스탬프 스크립트 갱신. 옛 뷰어 전용 CSS 삭제(다른 페이지가 쓰는 규칙은 남긴다 — `grep`으로 클래스 사용처 확인).
- [ ] **Step 4:** `npm test`, `node scripts/viewer-eval.js`. 옛 주소 `viewer.html`에서 최근 문서, 저장된 형광펜·메모, 붙여넣은 글 복원이 그대로 되는지 확인.
- [ ] **Step 5:** 커밋 `뷰어를 새 리더로 교체, 옛 화면 코드 제거`

---

## Self-Review 결과

- 스펙 §2의 넣는 항목은 작업 2~9에 하나씩 대응한다. "사전에서 찾기"는 작업 4(버튼)와 작업 5(처리)에 걸쳐 있다. "돌아가기"는 작업 6에서 만들고 작업 7이 쓴다.
- 스펙 §6의 예외: 스캔본(작업 2 Step 6), 일부 쪽 글자 없음(작업 3 `get`의 `text === ""`), 암호·손상(작업 2 Step 3), 긴 문서(작업 2 `planWindow`), 위치 못 찾음(작업 4), 옆 단 번짐(작업 4 Step 3), 목차 없음(작업 6), 대상 없음(작업 7), 조회 실패(작업 8), 저장 실패(작업 4 Step 4).
- 이름 일치: `ReaderDoc`, `ReaderPanels`, `ReaderGeometry`, `ReaderTextMap`, `ReaderOverlay`, `ReaderSearch`, `ReaderSelection`, `ReaderAnnotations`, `ReaderTerms`, `ReaderOutline`, `ReaderNav`, `ReaderRefs`, `ReaderPreview`, `ReaderBiblio`, `ReaderStore`.
