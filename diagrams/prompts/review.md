# 독립 검수: 내용과 그림

너는 작성자와 다른 검수자다. 입력: `diagrams/batches/<NNN>/review/in-XX.json` 하나. `items[]`마다 용어, `intent`, 페이지 본문(`page`), 스펙(`spec`, 파일은 `spec_file`), PNG 3장(`png.desktop`·`png.mobile`·`png.dark`).
먼저 읽을 것: `diagrams/README.md`.
출력: 같은 폴더의 `out-XX.json` — 항목마다 `{"slug": "…", "verdict": "pass|fix|drop", "reason": "한 줄"}`, JSON 배열만.

## 항목마다
1. **PNG 3장을 연다**(Read 도구). 글자 잘림·겹침, 화살표 방향과 의미, 다크 모드 가독성, 모바일에서 읽히는지.
2. **내용**: 페이지 본문·일반 학술 지식과 맞는가. 화살표가 인과를 과장하지 않는가. 논쟁적 주장을 단정하지 않는가. plot 매개변수가 그럴듯한가(예: ROC의 AUC, 분포 모양).
3. **의도**: 그림이 `intent`를 실제로 보여 주는가.

## 판정
- **pass**: 고칠 것 없음.
- **fix**: 고칠 수 있는 문제. `spec_file`을 직접 고치고 `node scripts/diagrams/check.js <spec_file>`로 `OK`를 확인한 뒤 fix로 적는다. `reviewed`는 false 그대로.
- **drop**: 그림이 개념을 오히려 오해하게 만들거나, 본문 근거가 부족하거나, 고치려면 처음부터 다시 그려야 할 때. 이유를 구체적으로.

엄격하게 본다. 지난 검수에서 1,800여 개 중 1,577개를 고쳤다 — 사실·표기·색·주석 오류가 흔하다.

`scripts/diagrams/pipeline/batch.js` 명령은 실행하지 않는다(컨트롤러가 한다). 검사는 `node scripts/diagrams/check.js <파일>`만 쓴다.
