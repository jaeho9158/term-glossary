# 뷰어 채점용 말뭉치

`scripts/viewer-eval.js`가 이 폴더를 읽어 뷰어 용어 매칭을 채점한다. 논문 PDF는 저작권 때문에
커밋하지 않는다(`.gitignore`에서 README만 예외). 각자 로컬에 둔다.

## 넣을 것 (10편 목표)

| 종류 | 편수 | 이유 |
|---|---|---|
| 단일단 조판 | 5 | 기본 |
| 2단 조판 | 3 | 열 순서 복원 검증 |
| 목차·점선(…) 행 포함 | 1 | 텍스트 레이어 폭 왜곡 사례 |
| 스캔본(텍스트 없음) | 1 | 안내 문구 검증 |
| 복합어 안에 기초 용어(예: 전단응력 ⊃ 응력) | 1 이상 | 포함 관계 정렬 검증 |

## 파일 규칙

한 편당 두 파일. 이름은 같게.

- `NAME.pdf` — 논문 원본. PDF 대신 `NAME.txt`(추출 텍스트)도 된다.
- `NAME.expected.json` — 정답지:

```json
{
  "note": "2단 조판, 재료역학",
  "expected": ["shear-stress", "strain", "youngs-modulus"],
  "not_expected": ["stress"],
  "nested": [["shear-stress", "stress"]]
}
```

- `expected`: 이 문서에서 **반드시 잡혀야** 하는 용어 slug. 놓치면 미탐.
- `not_expected`: 잡히면 안 되는 slug(일상어 오탐 등). 잡히면 오탐.
- `nested`: `[긴 용어, 짧은 용어]` 쌍. 짧은 용어가 긴 용어보다 패널에서 위에 오면 "정렬 오류".
- 분야 거리 규칙으로 강등된 용어(`distant`: 밑줄 없음, 패널 "다른 분야" 맨 아래)는 "잡힘"에서 빼고 `강등 N`으로 따로 센다. 그중 `expected`에 있는 것은 미탐이 아니라 "강등 미탐"으로 집계한다.
- 목록에 없는 slug가 잡히면 "미분류"로만 표시하고 점수에는 안 넣는다. 확인 후 둘 중 하나로 옮긴다.

slug는 `terms.json`의 `slug` 값이다. 모르면 `node scripts/viewer-eval.js --find 전단응력`로 찾는다.

## 실행

```bash
node scripts/viewer-eval.js            # 전체 채점
node scripts/viewer-eval.js NAME       # 한 편만, 잡힌 용어 전체 출력
node scripts/viewer-eval.js --find 응력 # slug 찾기
```

목표(계획 G2): 오탐 ≤ 5%, 미탐 ≤ 10%, 정렬 오류 0.
