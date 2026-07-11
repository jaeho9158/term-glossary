# 논문 뷰어 개선 (가시성 · 인라인 풀이 · PDF 업로드) 설계

## 배경

[viewer.html 최초 설계](2026-07-11-paper-viewer-design.md)와 그 구현이 배포되었다. 사용해보니 다음 세 가지 개선이 필요하다:

1. 논문 뷰어 기능이 nav의 평범한 텍스트 링크 하나뿐이라 존재감이 떨어진다.
2. 매칭된 용어 카드가 이름만 보여줘서, 무슨 뜻인지 알려면 매번 상세 페이지로 이동해야 한다.
3. 텍스트를 직접 복사해 붙여넣어야만 해서, PDF로 논문을 읽는 사용자에게는 진입장벽이 있다.

## 목표

- 사이트 전반(nav)과 홈페이지 양쪽에서 논문 뷰어로의 유도를 강화한다.
- 매칭된 용어 카드에서 한 줄 정의를 바로 읽을 수 있게 하되, 전체 설명은 여전히 상세 페이지에서 보게 한다.
- PDF 파일을 업로드하면 텍스트를 자동 추출해 즉시 용어 매칭까지 실행한다.

## 1. 가시성 개선

- **nav 버튼화**: `index.html`, `about.html`, `contact.html`, `privacy.html`, `viewer.html` 5개 페이지의 nav에서 "논문 뷰어" 링크에 `class="nav-cta"`를 부여하고, `--accent` 배경색의 알약(pill) 버튼으로 스타일링한다. 나머지 nav 링크(용어 목록/소개/문의)는 기존 텍스트 링크 스타일 그대로 유지한다.
- **홈페이지 CTA 배너**: `index.html`의 `<p class="subtitle">`과 검색창(`#term-search`) 사이에 `<a class="viewer-promo" href="viewer.html">` 배너를 추가한다. 문구: "📄 논문 텍스트를 붙여넣으면 나온 용어를 바로 찾아드려요 — 논문 뷰어 사용하기". 카드 전체가 클릭 가능한 링크이며, 호버 시 살짝 강조되는 정도의 간단한 트랜지션만 적용한다(사이트 전반에 이미 적용된 호버 애니메이션 컨벤션을 따름).

## 2. 매칭 카드 인라인 풀이

### 데이터: `terms.json`에 `definition` 필드 추가

`terms/{slug}.html` 180개 전부가 다음과 같은 동일한 마크업 패턴을 갖고 있음을 확인했다:

```html
<strong>한 줄 정의:</strong> {정의 문장}
```

구현 시 1회성 Node 스크립트(`scripts/extract-definitions.js`)를 작성해 각 `terms/{slug}.html`을 읽고 이 문장을 정규식으로 추출한 뒤, `terms.json`의 각 항목에 `definition` 필드로 추가한다. 이 스크립트는 사이트 배포 파이프라인의 일부가 아니라 이번 작업에서 1회 실행하고 결과(`terms.json`)만 커밋하는 마이그레이션 스크립트다. 향후 새 용어를 추가할 때는 `terms.json`에 `definition` 필드를 직접 함께 추가하는 것이 원칙이며, 이 스크립트는 재실행을 전제하지 않는다.

패턴에서 정의 문장을 못 찾은 항목이 있으면(정규식 매치 실패), 스크립트가 해당 slug 목록을 stderr로 출력한다 — 구현 시 이 목록이 비어 있는지 확인한다.

### 카드 렌더링

`assets/viewer.js`의 `termCardHTML`이 `definition` 필드를 이름 아래 회색 보조 텍스트로 추가 렌더링한다. `definition`이 없는 항목(추출 실패)은 그 줄을 생략한다(빈 문자열이나 "정의 없음" 같은 플레이스홀더를 넣지 않는다). "자세히 보기" 링크는 기존과 동일하게 유지된다.

## 3. PDF 업로드

### 라이브러리: PDF.js 자체 호스팅

Mozilla PDF.js의 빌드 산출물(`pdf.min.mjs`, `pdf.worker.min.mjs`)을 `assets/vendor/pdfjs/`에 커밋해 자체 호스팅한다. 외부 CDN 요청 없이 완전히 로컬에서 동작하며, 이는 "서버/AI API 없이 클라이언트에서만 동작"이라는 기존 설계 원칙과 일치한다.

### UI

`viewer.html`의 좌측 입력 영역에 기존 textarea와 나란히 `<input type="file" accept="application/pdf" id="pdf-upload">` 버튼을 추가한다. 텍스트 붙여넣기와 PDF 업로드 두 입력 경로가 공존하며, 사용자는 둘 중 하나를 선택해 사용한다.

### 동작 흐름

1. 사용자가 PDF 파일을 선택한다.
2. `assets/viewer.js`가 PDF.js로 파일을 열고, 모든 페이지의 텍스트 레이어를 순서대로 추출해 하나의 문자열로 이어붙인다. 추출 중에는 "PDF 분석 중..." 로딩 상태를 표시한다(기존 "찾는 중..." 버튼 상태 표시와 동일한 패턴).
3. **추출 성공** → 추출된 텍스트를 textarea에 채워 넣고, 별도 버튼 클릭 없이 기존 매칭 실행 로직(`matchTerms` → `buildHighlightedHtml` → 카드 렌더링)을 즉시 호출한다. 이를 위해 기존 "용어 찾기" 버튼 클릭 핸들러 내부 로직을 `runAnalysis(text)` 같은 공유 함수로 추출해, 버튼 클릭 경로와 PDF 업로드 경로가 동일한 함수를 호출하도록 리팩터링한다.
4. **추출 실패**(텍스트 레이어가 없는 스캔 이미지 PDF, 암호화된 PDF 등) → "이 PDF에서 텍스트를 추출하지 못했습니다. 텍스트를 직접 복사해 붙여넣어 주세요." 안내를 표시하고, textarea는 비운 채로 되돌려 사용자가 직접 붙여넣을 수 있게 한다.
5. 파일 크기 제한은 두지 않는다. 큰 파일 처리 중에도 위 2번의 로딩 상태 표시로 충분하다고 본다.

## 파일 구조 변경 요약

- 신규: `assets/vendor/pdfjs/pdf.min.mjs`, `assets/vendor/pdfjs/pdf.worker.min.mjs`
- 신규(1회성): `scripts/extract-definitions.js`
- 수정: `terms.json` (모든 항목에 `definition` 필드 추가)
- 수정: `assets/viewer.js` (termCardHTML에 정의 표시, PDF 업로드 핸들러 추가, 매칭 실행 로직을 공유 함수로 리팩터링)
- 수정: `viewer.html` (PDF 업로드 input 추가, nav 버튼 클래스 추가, PDF.js 모듈 스크립트 로드)
- 수정: `index.html` (nav 버튼 클래스, CTA 배너 추가)
- 수정: `about.html`, `contact.html`, `privacy.html` (nav 버튼 클래스만)
- 수정: `style.css` (nav-cta 버튼, viewer-promo 배너, 카드 정의 텍스트, PDF 업로드 버튼/로딩 상태 스타일 추가)

## 테스트 관점

- `extract-definitions.js` 실행 후 180개 전부 `definition` 필드가 채워졌는지, 누락 목록이 비어 있는지 확인.
- 매칭 카드에 정의 한 줄이 올바르게 표시되는지, `definition` 누락 항목에서 빈 줄이 남지 않는지 브라우저에서 확인.
- 텍스트가 있는 PDF 업로드 시 자동으로 textarea가 채워지고 매칭까지 실행되는지 확인.
- 텍스트 레이어가 없는 PDF(또는 암호화 PDF) 업로드 시 안내 메시지와 빈 textarea 폴백을 확인.
- nav 버튼 스타일과 홈페이지 CTA 배너가 데스크톱/모바일에서 모두 잘 보이는지 확인.
- 기존 텍스트 붙여넣기 흐름(1차 구현분)이 이번 변경으로 깨지지 않았는지 회귀 확인.
