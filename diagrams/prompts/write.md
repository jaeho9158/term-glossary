# 작성: 도식 스펙 JSON

입력: `diagrams/batches/<NNN>/write/in-XX.json` 하나. `items[]`마다 용어, 판정의 `type`·`intent`, 페이지 본문(`page`), 참고 예시 스펙 3개(`exemplars`), 분야군 스타일 가이드 경로(`style`).
먼저 읽을 것: `diagrams/README.md`(스펙 형식 전체), 각 항목의 `style` 파일.
출력: 항목마다 `diagrams/specs/<slug>.json` 한 파일. 스펙 파일과 (필요할 때) `diagrams/batches/<NNN>/uncertain.md` 외에는 쓰지 않는다.

## 순서 (항목마다)
1. **계획**: `intent`를 이루려면 어떤 노드·관계가 필요한지 2~3줄로 머릿속에 정한다. 본문(`page`)에 근거가 있는 것만 쓴다.
2. **참고**: `exemplars`의 구조·라벨 길이·색 쓰는 법을 따라 하되 내용은 베끼지 않는다.
3. **작성**: README 형식대로. 필수: `slug`, `type`, `source`(근거 — 페이지 본문이면 `"용어 페이지 본문"`, 문헌이면 서지), `"reviewed": false`.
4. **검사**: `node scripts/diagrams/check.js diagrams/specs/<slug>.json` → `OK`가 나올 때까지 고친다(최대 3번). 그래도 경고가 남으면 그대로 두고 다음 항목으로.
5. **렌더는 하지 않음**: 한 묶음을 다 쓴 뒤 `node scripts/diagrams/pipeline/batch.js render <NNN>`은 컨트롤러가 돌린다 — 너는 하지 않는다.

## 규칙
- 라벨은 한글 10자, sub는 14자 안팎. 영문 약어는 본문에 있을 때만 괄호로.
- 색은 역할 기준(README 색 표). 같은 역할에는 같은 색.
- 본문에 없는 수치·고유명·연결을 지어내지 않는다. 확신이 낮은 연결은 넣지 말고 `diagrams/batches/<NNN>/uncertain.md`에 `- <slug> — <뺀 연결>: <이유>` 한 줄을 덧붙인다.
- 논쟁 중인 내용은 `notes`에 `"tone": "limit"`로 "논쟁 중" 등을 밝힌다. 단정하지 않는다.
- plot은 좌표를 쓰지 않는다. 함수와 매개변수만. 눈금(`ticks`)은 숫자 자체가 의미 있을 때만(ROC 등).
- venn 영역 라벨·cycle 가운데 글자는 짧게(8자 안팎) — 길면 자리가 없어 경고가 난다.
- 그림 하나에 노드 3~8개가 적당하다. 많으면 핵심만 남긴다.

`scripts/diagrams/pipeline/batch.js` 명령은 실행하지 않는다(컨트롤러가 한다). 검사는 `node scripts/diagrams/check.js <파일>`만 쓴다.

## plot 함수의 곡선 방향 (반드시 확인)
| 함수 | 모양 | 쓰면 안 되는 곳 |
|---|---|---|
| `normal` `t` | 좌우 대칭 종 모양(t는 꼬리가 두꺼움) | 치우친 분포 |
| `chi2` | 0에서 시작, 오른쪽 꼬리 긴 분포 | |
| `exponential(rate)` | **지수분포의 확률밀도 — 내려가는 곡선** | 지수적으로 **증가**하는 양(증기압, 인구 증가 등) |
| `decay(rate)` | 1에서 시작해 **내려감** | 증가하는 양 |
| `logistic` | S자로 **올라감**(k<0이면 내려감) | |
| `hill` | 0에서 시작해 **올라가며 포화** | |
| `inverted_u` | 가운데가 솟은 대칭 곡선 | 비대칭 정점 곡선, U자(아래로 오목) |
| `linear` | 직선 | 곡선 |
| `roc` | (0,0)→(1,1) 위로 볼록. 대각선 점선은 렌더러가 자동으로 그림 — 따로 그리지 말 것 | |
이 표에 맞는 함수가 없으면 plot을 쓰지 말고 다른 type으로 그리거나, 항목을 건너뛰고 보고한다. 다른 함수로 모양을 흉내 내지 않는다.
