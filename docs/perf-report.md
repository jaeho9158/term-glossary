# 성능 점검 리포트 (작업지시서 A - 5번)

## 방법 및 제약사항

이 환경(Windows + 샌드박스)에서 Lighthouse CLI가 Chrome을 실행하지 못했습니다
(`chrome-launcher`가 임시 프로필 삭제 시 `EPERM` 오류 발생). 대신 로컬 정적 서버
(`npx http-server`)를 띄우고 브라우저 네트워크 패널로 실제 요청/응답 크기를
측정하는 방식으로 점검했습니다. Chrome이 정상 동작하는 환경에서는
`npx lighthouse http://localhost:8181/index.html --view` 로 정식 점수를 재측정할 수 있습니다.

## 측정 결과 (2026-07-24 기준, gzip 미적용 raw 크기)

| 리소스 | 크기 | 비고 |
|---|---|---|
| `terms.json` | 325KB | **매 페이지 전체를 fetch** — 용어 623→643개로 이미 증가, 계속 커짐 |
| `assets/site.js` | 10.9KB | index.html 전용 |
| `assets/vendor/fuse.min.js` | 26.4KB | 로컬 vendor 버전 |
| `style.css` | 25.1KB | |
| `assets/vendor/pdfjs/pdf.min.mjs` | 305.7KB | viewer.html에서만 로드, 지연 로딩(사용 시점) 확인됨 |
| `assets/vendor/pdfjs/pdf.worker.min.mjs` | 1.0MB | 워커 스레드, PDF 업로드 전에는 요청되지 않음(정상) |
| `terms/p-value.html` (개별 용어 페이지) | 4.2KB | |
| `viewer.html` | 4.1KB | |

## 발견 및 조치

### 1. (수정 완료) `viewer.html`에서 Fuse.js 중복 로드
기존에 `viewer.html`이 CDN(`cdn.jsdelivr.net/npm/fuse.js@7.1.0`)과 로컬
`assets/vendor/fuse.min.js`를 **동시에** 로드하고 있었습니다. 불필요한 외부
네트워크 요청 + 동일 라이브러리 이중 파싱 비용이 있어 CDN `<script>` 태그를
제거하고, 로컬 vendor 스크립트가 `viewer.js`보다 먼저 로드되도록 순서를
맞췄습니다 ([viewer.html](../viewer.html)).

- Before: viewer.html 요청 수 8개 (CDN fuse.js 포함)
- After: viewer.html 요청 수 7개 — 확인: `read_network_requests`로 재검증, 중복 요청 사라짐

### 2. 이미지 lazy-loading
사이트 전체에 `<img>` 태그가 없습니다 (텍스트 위주 용어 사전). 현재는 해당 없음 — 향후 이미지가 추가되면 `loading="lazy"` 적용 필요.

### 3. 폰트 로딩
`style.css`가 시스템 폰트 스택만 사용합니다(`-apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`). 웹폰트 다운로드가 전혀 없어 폰트 관련 성능 이슈 없음.

### 4. (구조적 이슈, 별도 작업 필요) `terms.json` 전체 fetch
`assets/site.js`(index.html)와 `assets/header-search.js`(전 페이지 헤더 검색)가
모두 `terms.json` 전체를 fetch합니다. 용어 수가 210개 기준 설계였는데 현재
643개까지 늘어 325KB가 되었고, 계속 증가하는 구조입니다.

**권장 조치 (4번 템플릿 리팩터링과 함께 진행 권장)**
- `terms.json`을 `categories` 필드 기준으로 카테고리별 청크 파일로 분리
  (예: `data/terms.stat.json`, `data/terms.cs.json` ...)
- 헤더 검색(Fuse.js)은 검색어 입력 시점에 필요한 청크만 지연 로드하거나,
  경량 인덱스(제목/별칭만 담은 별도 작은 JSON)로 먼저 매칭 후 상세 정의는
  개별 용어 페이지에서만 로드하는 방식 고려
- index.html의 카테고리 아코디언도 상응하는 청크만 필요 시 로드하도록 조정

이 부분은 검색 UX와 카테고리 렌더링 로직을 함께 바꿔야 해서 이번 점검 범위에서는
구현하지 않고 이슈로만 남깁니다.
