/*
========================================
 논문용어사전 보안 모듈
 Security Utility Module

 기능:
 - XSS 방어
 - 입력값 정리
 - 위험 문자열 감지
 - 비정상 입력 차단
========================================
*/


/*
----------------------------------------
 HTML 문자 변환
 <script> 같은 코드 실행 방지
----------------------------------------
*/

export function escapeHTML(value) {


    if(value === null || value === undefined){

        return "";

    }


    return String(value)

        .replaceAll("&", "&amp;")

        .replaceAll("<", "&lt;")

        .replaceAll(">", "&gt;")

        .replaceAll('"', "&quot;")

        .replaceAll("'", "&#039;");


}





/*
----------------------------------------
 기본 입력 정리
 공백 제거 + 위험 문자 처리
----------------------------------------
*/

export function sanitizeInput(value){


    if(!value){

        return "";

    }



    return String(value)

        .trim()

        .replace(/\u0000/g,"")

        .replace(/javascript:/gi,"")

        .replace(/vbscript:/gi,"")

        .replace(/data:text\/html/gi,"");


}





/*
----------------------------------------
 XSS 의심 코드 탐지
----------------------------------------
*/

export function detectXSS(value){


    if(!value){

        return false;

    }



    const pattern = [

        /<script/i,

        /<\/script>/i,

        /javascript:/i,

        /onerror=/i,

        /onclick=/i,

        /onload=/i,

        /iframe/i,

        /document\.cookie/i,

        /window\.location/i

    ];



    return pattern.some(
        rule => rule.test(value)
    );


}







/*
----------------------------------------
 입력 길이 제한
 너무 긴 입력 방지
----------------------------------------
*/

export function limitLength(
    value,
    maxLength = 10000
){


    if(!value){

        return "";

    }



    const text = String(value);



    if(text.length > maxLength){


        console.warn(
            "[SECURITY] 입력 길이 초과"
        );


        return text.substring(
            0,
            maxLength
        );


    }



    return text;


}








/*
----------------------------------------
 이메일 형식 검사
----------------------------------------
*/

export function validateEmail(email){


    if(!email){

        return false;

    }



    const regex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;



    return regex.test(email);


}








/*
----------------------------------------
 반복 문자열 검사
 도배 방지
----------------------------------------
*/

export function detectSpam(value){


    if(!value){

        return false;

    }



    const text =
    String(value);



    // 같은 문자 10번 이상 반복

    if(
        /(.)\1{9,}/.test(text)
    ){

        return true;

    }



    // 같은 단어 반복


    const words =
    text.split(" ");



    if(words.length > 5){


        const unique =
        new Set(words);



        if(
            unique.size < words.length / 2
        ){

            return true;

        }


    }



    return false;


}








/*
----------------------------------------
 안전한 사용자 입력 검사
 여러 기능에서 호출
----------------------------------------
*/

export function validateUserInput(value){



    const clean =
    sanitizeInput(value);



    if(detectXSS(clean)){


        console.warn(
            "[SECURITY] XSS 입력 감지",
            clean
        );


        return {

            safe:false,

            reason:"위험한 코드가 포함되어 있습니다."

        };


    }





    if(detectSpam(clean)){


        return {


            safe:false,

            reason:"비정상적인 반복 입력입니다."


        };


    }






    return {


        safe:true,

        value:escapeHTML(clean)


    };


}







/*
----------------------------------------
 보안 이벤트 기록
 개발자 확인용
----------------------------------------
*/

export function securityLog(
    type,
    data
){


    console.warn(
        `[SECURITY] ${type}`,
        {

            time:
            new Date()
            .toISOString(),

            data:data

        }

    );


}















/*
----------------------------------------
 안전한 텍스트 출력
----------------------------------------
*/

export function safeText(
    element,
    value
){


    if(!element){

        return;

    }



    element.textContent =
    escapeHTML(value);


}
