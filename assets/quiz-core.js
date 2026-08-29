// assets/quiz-core.js — 퀴즈의 순수 로직(채점·초성 변환).
//
// quiz.js는 최상위에서 DOM에 바로 접근해 Node에서 require가 불가능하다.
// 사용자 입력을 직접 채점하는 함수들은 테스트가 필수라, DOM 없는 이 파일로
// 분리했다. quiz.html이 quiz.js보다 먼저 로드해 전역으로 제공한다.


// 정답 판정용 정규화: 대소문자·공백·하이픈·가운뎃점 차이는 무시한다.
// "표본 크기"와 "표본크기", "p-value"와 "P Value"를 다른 답으로
// 처리하면 타이핑 퀴즈는 채점 불복만 쌓인다.
function normalizeAnswer(s){

    return String(s || "")
        .toLowerCase()
        .replace(/[\s\-–—_·.()（）]/g, "");

}


// 한글명·영문명·등록된 별칭 전부를 정답으로 인정한다.
function acceptedAnswers(term){

    const pool = [
        term.title_ko,
        term.title_en,
        ...(term.aliases || [])
    ];

    return new Set(
        pool.map(normalizeAnswer).filter(Boolean)
    );

}


// 자동 초성 힌트용: 한글 음절 → 초성. 한글이 아닌 글자(영문·숫자 등)는
// 그대로 통과시킨다 — 초성이 없는 글자를 계속 가리면 힌트 구실을 못 한다.
const CHOSEONG =
["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

function toChoseong(str){

    return [...str].map(ch => {

        const code = ch.charCodeAt(0) - 0xAC00;

        if(code >= 0 && code < 11172){

            return CHOSEONG[Math.floor(code / 588)];

        }

        return ch;

    }).join("");

}


if (typeof module !== "undefined" && module.exports) {
    module.exports = { normalizeAnswer, acceptedAnswers, toChoseong, CHOSEONG };
}
