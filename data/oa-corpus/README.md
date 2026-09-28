# 실제 논문 말뭉치 (OA 파이프라인)

뷰어 용어 매칭을 실제 논문 통계로 보정하기 위한 말뭉치. **원문 PDF·추출 텍스트는 커밋하지 않는다**
(이 폴더는 README만 빼고 .gitignore). 커밋되는 결과물은 집계 통계 `data/oa-stats.json` 하나다.

| 단계 | 스크립트 | 출력 |
|---|---|---|
| 1. 수집 | `node scripts/oa/collect-koreamed.js [--dry]` | `koreamed/<KMSID>.pdf`, `index.jsonl` |
| 2. 추출 | `node scripts/oa/extract-text.js` | `text/<id>.txt` (한글 < 500자면 index에 `skipped`) |
| 3. 통계 | `node scripts/oa/build-stats.js` | `../oa-stats.json` |
| 4. 연동 | `npm run build:viewer-index` | oa-stats.json이 있으면 등급·동음이의 플래그·뜻 키워드에 반영 |

- 출처: KoreaMed Synapse(synapse.koreamed.org) — robots.txt 없음, 논문에 Open-Access 명시. 국문 논문만.
- 예의: 요청 간 2초, 실패 시 재시도 1회, 총 150편 이내, 이미 받은 파일은 건너뜀.
- KoreaScience는 robots.txt가 PDF를 금지하므로 쓰지 않는다.
- index.jsonl 한 줄: `{id, source, journal, field, title, year, url, license}` — `field`는 우리 카테고리 코드.
  나중에 KCI Open API 초록도 같은 형식(source만 다름)으로 합류한다.

## KCI Open API 초록 (2차)

- `node scripts/oa/collect-kci.js [--max-requests N]` → `text/kci-<id>.txt`(국문 제목+초록), index.jsonl에 `source:"kci"`, `citations`.
- 키는 `.env.local`의 `KCI_API_KEY`(gitignore, IP 제한)를 실행 때만 읽는다. 로그·파일에 남기지 않는다.
- 카테고리마다 그 분야 전용 표제어로 제목 검색 → 한글 초록이 있는 논문을 피인용수 순으로. 대분류당 약 60편.
  `field`는 질의한 카테고리(근사). 검색 응답에 키워드가 없어 키워드는 받지 않는다.
- 예의: 요청 간 1.1초, 재시도 1회, 실행당 요청 상한 5,000.
- 일부 통계는 KCI(한국학술지인용색인) 데이터를 활용했습니다.
