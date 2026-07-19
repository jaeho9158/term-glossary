# 개발자 A 작업지시서 — SEO / 인프라 / 자동화

담당 영역: sitemap, 관련 용어 자동화, 애널리틱스, 템플릿 시스템, 성능, RSS, 다국어.
피드백 주기가 길 수 있으니, 각 작업은 아래 **완료 기준**을 스스로 체크하고 다음 작업으로 넘어가면 됩니다. 헷갈리면 커밋 메시지에 판단 근거를 남겨주세요.

---

## 1. sitemap.xml 자동 생성 (최우선)

**현재 문제**: [sitemap.xml](../sitemap.xml)에 210개 용어 URL이 수작업으로 들어가 있어서, 용어 추가할 때마다 빠뜨릴 위험이 있음.

**할 일**
- `scripts/generate-sitemap.js` 작성 (Node, `require("fs")`만 사용, 외부 의존성 없이)
- [scripts/extract-definitions.js](../scripts/extract-definitions.js)의 "terms.json 순회 → 결과 재작성" 패턴을 참고
- `terms.json`의 모든 slug + 최상위 페이지(index, viewer, about, privacy, contact) 목록으로 `<url><loc>...</loc><lastmod>...</lastmod></url>` XML 생성해서 `sitemap.xml` 덮어쓰기
- `<lastmod>`은 각 파일의 git 마지막 커밋 날짜 사용 (`git log -1 --format=%cs -- <path>` 실행 결과 활용)
- `package.json` 생성하고 `npm run build:sitemap` 스크립트로 등록

**완료 기준**
- `npm run build:sitemap` 실행 후 sitemap.xml의 `<url>` 개수가 terms.json 항목 수 + 최상위 페이지 수와 정확히 일치
- 용어를 하나 추가하고 다시 실행했을 때 자동으로 반영됨

**선택 (여유 있으면)**: GitHub Actions workflow 추가해서 push 시 자동 실행 + 커밋

---

## 2. 관련 용어 자동 생성 + 일관성 검증

**현재 문제**: [terms/anova.html](../stat/anova.html)의 "관련 용어" 링크는 전부 손으로 넣은 것이고, terms.json에는 관련 정보가 없음.

**할 일**
- `terms.json`에 `related: string[]` 필드(slug 배열) 정식 추가
- `scripts/suggest-related.js`: 같은 `categories`를 공유하는 용어 중 이름/정의 유사도로 3~5개 추천해서 `related` 필드 자동 채움 (사람이 이미 넣어둔 관계는 보존, 빈 항목만 채우기)
- `scripts/check-related-consistency.js`: A의 related에 B가 있는데 B의 related에 A가 없는 경우, 또는 related에 존재하지 않는 slug가 들어간 경우를 리포트

**완료 기준**
- 210개 용어 전부 `related`에 최소 1개 이상 값이 채워짐
- consistency 스크립트 실행 시 에러 0건
- 기존 페이지의 "관련 용어" HTML 블록이 `related` 필드값과 일치하도록 재생성하는 스크립트도 함께 (기존 마크업 패턴 유지: `<div class="related-terms"><a href="slug.html">제목</a></div>`)

---

## 3. 애널리틱스 + 검색 로그

**할 일**
- GA4 또는 Plausible 계정 생성 후 추적 스니펫을 전체 페이지 `<head>`에 삽입 (일단 수작업 또는 스크립트로 일괄 삽입, 3번 작업과 맞물림)
- Supabase에 `tg_search_log` 테이블 추가 (columns: query, result_count, created_at) — 기존 [assets/contact.js](../assets/contact.js)의 Supabase insert 패턴 참고
- 검색했는데 결과가 0건인 검색어를 로깅 → 나중에 "요청 많은데 없는 용어" 파악용

**완료 기준**
- GA4 실시간 리포트에서 페이지뷰 확인됨
- 검색창에 존재하지 않는 용어 검색 시 Supabase 테이블에 로그 1건 생성 확인

---

## 4. 공통 헤더/푸터 템플릿화 (중규모 리팩터링, 별도 브랜치)

**현재 문제**: 헤더/네비/푸터가 index.html, terms/*.html 등 모든 파일에 복붙되어 있어서 (템플릿 엔진 없음), 위 애널리틱스 스니펫 하나 넣으려면 210개+ 파일을 다 고쳐야 함.

**할 일**
- 가벼운 정적 사이트 생성기(예: Eleventy) 도입 검토, 또는 자체 Node 빌드 스크립트로 "템플릿 + terms.json 데이터 → HTML 생성" 방식 구축
- **주의**: 기존 URL 구조(`/terms/<slug>.html`)는 절대 바뀌면 안 됨 — sitemap/외부 링크/SEO 다 깨짐
- 별도 브랜치에서 진행하고, 기존 페이지 몇 개(anova, index, viewer)를 새 방식으로 마이그레이션한 뒤 결과물이 기존 HTML과 시각적으로 동일한지 diff 확인

**완료 기준**
- 새 빌드 결과물을 브라우저에서 열었을 때 기존 페이지와 레이아웃/텍스트 100% 동일
- 헤더에 텍스트 하나 바꿔서 재빌드 시 전체 페이지에 반영되는지 확인

---

## 5. 성능 점검

**할 일**
- Lighthouse로 index.html, 임의 용어 페이지, viewer.html 점검
- 이미지 lazy-loading, PDF.js 번들 크기, 폰트 로딩 방식 확인 및 개선
- terms.json 전체를 매번 fetch하는 구조인지 확인 ([assets/site.js](../assets/site.js)) → 용어 늘어날수록 무거워지므로 청크 로딩/페이지네이션 고려

**완료 기준**
- Lighthouse Performance 점수 before/after 기록해서 리포트

---

## 6. RSS/Atom 피드

**할 일**
- `scripts/generate-feed.js` (sitemap 스크립트와 같은 패턴으로 terms.json 순회)
- 최근 추가된 용어 순으로 `feed.xml` 생성

**완료 기준**
- feed.xml이 표준 RSS 리더에서 파싱됨 (예: https://validator.w3.org/feed/ 검증 통과)

---

## 7. 다국어(영어) 페이지 설계

**할 일**
- terms.json에 이미 `title_en` 필드 존재 → `/en/terms/<slug>.html` 생성 파이프라인 설계
- 정의 텍스트 번역은 범위 밖 (구조만 먼저 잡기), 번역 안 된 곳은 한국어 원문 placeholder로 두고 명확히 표시

**완료 기준**
- `/en/` 하위에 최소 5개 용어 페이지 샘플 생성, 구조/네비게이션 정상 동작
