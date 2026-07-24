# 공통 헤더/푸터 템플릿화 (작업지시서 A - 4번)

브랜치: `feature/header-footer-template`

## 접근 방식

무거운 정적 사이트 생성기(Eleventy 등) 도입 대신, 기존 HTML은 그대로 두고
`<header class="site-header">...</header>` / `<footer class="site-footer">...</footer>`
블록만 정규식으로 찾아 공유 템플릿 함수의 출력으로 치환하는 최소 침습 빌드
스크립트를 만들었습니다.

- [scripts/templates/site-chrome.js](../scripts/templates/site-chrome.js) — `renderHeader(basePath, { navCta })`, `renderFooter(basePath)`
- [scripts/build-pages.js](../scripts/build-pages.js) — `PAGE_MANIFEST`에 등록된 파일만 대상으로 헤더/푸터 블록 재생성
- 실행: `npm run build:pages`

기존 URL 구조(`/terms/<slug>.html` 등)는 전혀 건드리지 않습니다 — 파일 경로/이름
변경 없이 파일 내용의 header/footer 블록만 재생성합니다.

## 파일럿 대상 (3개)

- `index.html` (basePath: `""`, navCta: true)
- `viewer.html` (basePath: `""`, navCta: true)
- `terms/anova.html` (basePath: `"../"`, navCta: false — 용어 페이지는 nav에 "논문 뷰어" CTA가 없는 기존 패턴을 그대로 유지)

## 검증 결과

1. **시각적 동일성**: `npm run build:pages` 실행 후 `git diff`로 확인 —
   `index.html`은 완전히 동일(diff 0줄), `viewer.html`/`terms/anova.html`은
   이번 작업과 무관한 기존 pending 변경분만 남고 header/footer 영역은 diff 없음.
2. **전파 확인**: `site-chrome.js`의 `SITE_TITLE`을 `"논문용어사전 TEST"`로 바꾸고
   재빌드 → 3개 파일 모두 로고/푸터 텍스트가 즉시 반영됨을 확인(`grep -c` 2회 매치
   = 로고 1곳 + 푸터 저작권 표기 1곳). 이후 원래 값으로 되돌리고 재빌드하여 복구.

## 전체 롤아웃 시 참고

- `PAGE_MANIFEST`에 나머지 페이지(약 640개 용어 페이지 + about/contact/login 등)를
  추가하면 동일한 방식으로 확장 가능. 용어 페이지는 전부 `basePath: "../"`,
  `navCta: false` 패턴이 동일하므로 `terms.json`의 slug 목록으로 자동 생성 가능.
- 5번 성능 점검 리포트([perf-report.md](perf-report.md))에서 지적한 `terms.json`
  청크 로딩 이슈도 이 빌드 스크립트 확장 시점에 함께 다루는 것을 권장.
