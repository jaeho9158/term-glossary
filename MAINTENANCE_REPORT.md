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
