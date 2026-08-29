// assets/quiz.js

let allTerms = [];

let currentTerms = [];

let currentQuestion = 0;

let score = 0;

let answer = "";

let totalQuestions = 10;

let wrongQuestions = [];

let retryMode = false;

// 로드맵 플래시카드에서 넘어온 경우, 해당 범위의 slug 목록 (없으면 null)
let roadmapScopeSlugs = null;


// ===============================
// 기록 저장
// ===============================

const RECORD_KEY = "term_quiz_record";


function getRecord(){

    const saved =
    localStorage.getItem(RECORD_KEY);


    if(!saved){

        return {
            played:0,
            correct:0,
            bestScore:0,
            bestCombo:0
        };

    }


    try{

        return JSON.parse(saved);

    }

    catch{

        return {
            played:0,
            correct:0,
            bestScore:0,
            bestCombo:0
        };

    }

}



function saveRecord(data){

    // 프라이빗 모드·쿼터 초과에서 setItem이 throw하면 퀴즈 진행 자체가
    // 중단되므로(checkAnswer 경로) 기록 저장 실패는 조용히 넘긴다.
    try{

        localStorage.setItem(
            RECORD_KEY,
            JSON.stringify(data)
        );

    }

    catch(e){ /* 저장 실패는 무시 */ }

}



// ===============================
// 상태
// ===============================

let combo = 0;

let timer = null;

let timeLeft = 15;


// ===============================
// DOM
// ===============================


const quizType =
document.getElementById("quiz-type");


const categorySelect =
document.getElementById("category-select");


const questionCount =
document.getElementById("question-count");




const question =
document.getElementById("question");


const choices =
document.getElementById("choices");


const result =
document.getElementById("result");


const quizArea =
document.getElementById("quiz-area");


const startArea =
document.getElementById("start-area");


const nextBtn =
document.getElementById("next-btn");


const quizCount =
document.querySelector(".quiz-count");


const timerEl =
document.getElementById("quiz-timer");


const comboEl =
document.getElementById("quiz-combo");


const recordBox =
document.getElementById("quiz-record");




// ===============================
// 기록 표시
// ===============================

function updateRecord(){


    if(!recordBox)
        return;


    const r =
    getRecord();



    const accuracy =
    r.played
    ?
    Math.round(
        r.correct /
        r.played *
        100
    )
    :
    0;



    recordBox.innerHTML = `

        <h3>
        📊 퀴즈 기록
        </h3>

        <p>
        총 풀이:
        ${r.played}
        </p>

        <p>
        정답률:
        ${accuracy}%
        </p>

        <p>
        최고 점수:
        ${r.bestScore}
        점
        </p>

        <p>
        최고 콤보:
        ${r.bestCombo}
        </p>

    `;

}




// ===============================
// 데이터 로딩
// ===============================

async function loadTerms(){


    try{


        const res =
        await fetch("terms.json");


        if(!res.ok)
            throw new Error();



        allTerms =
        await res.json();



        makeCategoryList();


        updateRecord();


        applyRoadmapScope();


    }


    catch(e){


        if(question){

            question.textContent =
            "용어 데이터를 불러오지 못했습니다.";

        }


    }


}





// ===============================
// 카테고리 생성
// ===============================

function makeCategoryList(){


    const set =
    new Set();



    allTerms.forEach(t=>{


        (t.categories || [])
        .forEach(c=>set.add(c));


    });



    // Was a hand-maintained list of only 12 categories, so any category added
    // to the glossary afterward (math, acct, agri, ...) fell through to `|| cat`
    // below and showed the raw internal code instead of a Korean label. Use
    // the same shared CATEGORY_LABELS every other page (site.js, viewer.js)
    // already draws from, so this list can't go stale again.
    const labels = typeof CATEGORY_LABELS !== "undefined" ? CATEGORY_LABELS : {};




    [...set].forEach(cat=>{


        const option =
        document.createElement("option");


        option.value =
        cat;


        option.textContent =
        labels[cat] || cat;


        categorySelect.appendChild(option);



    });


}


// ===============================
// 로드맵 플래시카드 범위 적용
// ===============================

function applyRoadmapScope(){

    const params =
    new URLSearchParams(location.search);

    if(params.get("scope") !== "roadmap")
        return;

    let slugs = [];

    try{
        slugs =
        JSON.parse(sessionStorage.getItem("quiz_scope_slugs") || "[]");
    }
    catch(e){
        slugs = [];
    }

    const label =
    sessionStorage.getItem("quiz_scope_label") || "선택한 범위";

    if(!Array.isArray(slugs) || slugs.length === 0)
        return;

    roadmapScopeSlugs = slugs;

    const categoryField =
    document.getElementById("quiz-category-field");


    const banner =
    document.getElementById("quiz-scope-banner");

    if(categoryField) categoryField.hidden = true;

    if(banner){
        banner.hidden = false;
        banner.textContent =
        `"${label}" 범위(${slugs.length}개 용어)로 퀴즈를 풉니다.`;
    }

}



// ===============================
// 시작
// ===============================

document
.getElementById("start-btn")
.onclick=function(){



    let list =
    [...allTerms];



    if(roadmapScopeSlugs){


        const scopeSet =
        new Set(roadmapScopeSlugs);


        list =
        list.filter(t=>scopeSet.has(t.slug));


        if(list.length === 0){

            if(question){
                question.textContent =
                "이 범위의 용어를 찾을 수 없습니다. 로드맵으로 돌아가 다시 시도해주세요.";
            }

            return;

        }


    }

    else{


    const category =
    categorySelect.value;



    if(category !== "all"){


        list =
        list.filter(t=>

            (t.categories || [])
            .includes(category)

        );


    }





    }



    // 주관식은 답을 직접 타이핑해야 하므로, 제목이 길거나 괄호 표기가
    // 붙은 용어("로(옵션 그릭스)" 등)는 출제 풀에서 제외해 입력 부담을
    // 줄인다. 객관식 모드는 기존 풀 그대로.
    if(quizType.value === "subjective"){

        const typable =
        list.filter(t =>
            t.title_ko &&
            t.title_ko.length <= 10 &&
            !/[()（）]/.test(t.title_ko)
        );

        if(typable.length >= 4)
            list = typable;

    }



    shuffle(list);



    currentTerms =
    list;



    currentQuestion=0;


    score=0;


    combo=0;



    totalQuestions =
    Math.min(

        Number(questionCount.value),

        currentTerms.length

    );



    wrongQuestions=[];


    retryMode=false;



    startArea.hidden=true;


    quizArea.hidden=false;



    updateCombo();



    nextQuestion();



};



// ===============================
// 문제 출제
// ===============================

function nextQuestion(){


    clearTimer();


    result.textContent = "";


    nextBtn.hidden = true;



    if(currentQuestion >= totalQuestions){


        finishQuiz();


        return;


    }




    const term =
    currentTerms[currentQuestion];



    let mode =
    quizType.value;



    if(mode==="random"){


        mode =
        Math.random() > 0.5
        ?
        "definition"
        :
        "term";


    }





    if(mode==="subjective"){


        renderSubjectiveQuestion(term);


        return;


    }



    if(mode==="definition"){


        answer =
        term.title_ko;


        question.textContent =
        term.definition;



    }

    else{


        answer =
        term.definition;


        question.textContent =
        term.title_ko;


    }





    quizCount.textContent =
    `${currentQuestion + 1} / ${totalQuestions}`;





    // 보기 4개 구성은 quiz-core.js의 순수 함수로 분리 (테스트 대상)
    const options =
    buildChoiceOptions(answer, allTerms, mode);



    shuffle(options);



    choices.innerHTML = "";




    options.forEach(op=>{


        const btn =
        document.createElement("button");


        btn.className =
        "choice";


        btn.textContent =
        op;



        btn.onclick =
        ()=>checkAnswer(btn,op);



        choices.appendChild(btn);



    });




    updateProgress();


    startTimer();


}





// ===============================
// 주관식 (정의 → 용어 직접 입력)
// ===============================

// 자동 초성 힌트: 주관식 문제에서 남은 시간이 절반이 되면 ○○○ 패턴을
// 초성(ㄷㅈㅌ…)으로 바꿔 보여준다. 별도 버튼 없이 시간 경과로만 열린다.
let subjectiveHintTerm = null;

let subjectiveHintShown = false;

// CHOSEONG / toChoseong 은 assets/quiz-core.js(전역)로 이동 — 페이지가 먼저 로드함.
function revealChoseongHint(){

    if(subjectiveHintShown || !subjectiveHintTerm)
        return;

    const patternEl =
    document.querySelector(".subjective-pattern");

    if(!patternEl)
        return;

    patternEl.firstChild.textContent =
    toChoseong(subjectiveHintTerm.title_ko);

    const lenEl =
    patternEl.querySelector(".subjective-len");

    if(lenEl) lenEl.textContent = "(초성)";

    subjectiveHintShown = true;

}


// normalizeAnswer / acceptedAnswers 는 assets/quiz-core.js(전역)로 이동.


function renderSubjectiveQuestion(term){


    answer =
    term.title_ko;


    question.textContent =
    term.definition;


    quizCount.textContent =
    `${currentQuestion + 1} / ${totalQuestions}`;



    // 지하철 이름 맞히기처럼 글자 수를 ○ 로 보여준다.
    const pattern =
    "○".repeat(term.title_ko.length);



    choices.innerHTML = "";


    const wrap =
    document.createElement("div");

    wrap.className =
    "subjective-wrap";


    wrap.innerHTML = `
        <p class="subjective-pattern" aria-label="글자 수 힌트">${pattern} <span class="subjective-len">(${term.title_ko.length}글자)</span></p>
        <div class="subjective-row">
            <input type="text" id="subjective-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="용어를 입력하세요">
            <button type="button" id="subjective-submit">제출</button>
        </div>
        <p class="subjective-hint-note">시간이 절반 지나면 초성이 공개됩니다</p>
    `;


    choices.appendChild(wrap);



    const input =
    document.getElementById("subjective-input");

    const submit =
    document.getElementById("subjective-submit");


    // 타이머가 절반까지 줄면 startTimer의 tick이 이 용어의 초성을
    // 자동으로 공개한다 (버튼 없이).
    subjectiveHintTerm = term;

    subjectiveHintShown = false;



    submit.onclick = function(){

        checkSubjectiveAnswer(term, input.value);

    };


    input.addEventListener("keydown", function(e){

        if(e.key === "Enter"){

            e.preventDefault();

            checkSubjectiveAnswer(term, input.value);

        }

    });


    input.focus();



    updateProgress();


    startTimer();


}


function lockSubjectiveInput(){

    const input =
    document.getElementById("subjective-input");

    const submit =
    document.getElementById("subjective-submit");

    if(input) input.disabled = true;

    if(submit) submit.disabled = true;

}


function checkSubjectiveAnswer(term, value){


    if(!String(value || "").trim())
        return; // 빈 제출은 무시


    clearTimer();


    lockSubjectiveInput();



    const record =
    getRecord();


    record.played++;



    const ok =
    acceptedAnswers(term).has(normalizeAnswer(value));



    if(ok){


        score++;

        combo++;

        record.correct++;


        if(combo > record.bestCombo){

            record.bestCombo = combo;

        }


        result.textContent =
        `정답! 🔥 ${combo}연속 정답`;


        const input =
        document.getElementById("subjective-input");

        if(input) input.classList.add("correct");


    }

    else{


        combo = 0;


        wrongQuestions.push(
            currentTerms[currentQuestion]
        );


        result.textContent =
        `오답! 정답 : ${term.title_ko}` +
        (term.title_en ? ` (${term.title_en})` : "");


        const input =
        document.getElementById("subjective-input");

        if(input) input.classList.add("wrong");


    }



    saveRecord(record);


    updateCombo();


    currentQuestion++;


    nextBtn.hidden = false;


    nextBtn.focus();


}




// ===============================
// 타이머
// ===============================


function startTimer(){


    // 주관식은 답을 직접 타이핑해야 하므로 객관식(15초)보다 길게 준다.
    timeLeft =
    quizType.value === "subjective" ? 30 : 15;


    updateTimer();



    timer =
    setInterval(()=>{


        timeLeft--;


        updateTimer();


        // 주관식: 남은 시간이 절반이 되는 순간 초성을 자동 공개
        if(quizType.value === "subjective" && timeLeft === 15){

            revealChoseongHint();

        }


        if(timeLeft <= 0){


            clearTimer();


            timeoutAnswer();


        }



    },1000);



}




function updateTimer(){


    if(timerEl){


        timerEl.textContent =
        `⏱ ${timeLeft}초`;

    }


}



function clearTimer(){


    if(timer){


        clearInterval(timer);


        timer=null;


    }


}




// ===============================
// 시간 초과
// ===============================


function timeoutAnswer(){



    wrongQuestions.push(
        currentTerms[currentQuestion]
    );



    combo=0;


    updateCombo();



    result.textContent =
    `시간 초과! 정답 : ${answer}`;


    lockSubjectiveInput();



    [...choices.children]
    .forEach(c=>{


        c.onclick=null;


        if(c.textContent===answer){


            c.classList.add(
                "correct"
            );


        }


    });



    currentQuestion++;


    nextBtn.hidden=false;


}





// ===============================
// 정답 확인
// ===============================


function checkAnswer(btn,value){



    clearTimer();



    [...choices.children]
    .forEach(c=>{


        c.onclick=null;


    });



    const record =
    getRecord();



    record.played++;




    if(value === answer){



        score++;


        combo++;


        record.correct++;



        if(combo > record.bestCombo){


            record.bestCombo =
            combo;


        }




        btn.classList.add(
            "correct"
        );



        result.textContent =
        `정답! 🔥 ${combo}연속 정답`;



    }

    else{



        combo=0;



        wrongQuestions.push(
            currentTerms[currentQuestion]
        );



        btn.classList.add(
            "wrong"
        );




        [...choices.children]
        .forEach(c=>{


            if(c.textContent===answer){


                c.classList.add(
                    "correct"
                );


            }


        });



        result.textContent =
        `오답! 정답 : ${answer}`;


    }



    saveRecord(record);



    updateCombo();



    currentQuestion++;



    nextBtn.hidden=false;



}






// ===============================
// 콤보 표시
// ===============================

function updateCombo(){



    if(comboEl){


        comboEl.textContent =
        `🔥 ${combo} 콤보`;


    }


}





// ===============================
// 진행률
// ===============================

function updateProgress(){


    const bar =
    document.getElementById(
        "progress-bar"
    );


    if(!bar)
        return;



    bar.style.width =

    (

        currentQuestion
        /
        totalQuestions
        *
        100

    )

    + "%";


}






// ===============================
// 종료
// ===============================


function finishQuiz(){



    clearTimer();



    const record =
    getRecord();



    if(score > record.bestScore){


        record.bestScore =
        score;


        saveRecord(record);


    }





    question.textContent =
    "퀴즈 종료!";



    choices.innerHTML="";




    const accuracy =
    Math.round(

        score
        /
        totalQuestions
        *
        100

    );




    result.innerHTML = `

    <div class="quiz-result">

    <h2>
    🎉 결과
    </h2>


    <p>
    점수 :
    <strong>
    ${score}/${totalQuestions}
    </strong>
    </p>


    <p>
    정답률 :
    ${accuracy}%
    </p>


    <p>
    최고 점수 :
    ${record.bestScore}
    </p>


    <p>
    최고 콤보 :
    ${record.bestCombo}
    </p>


    ${
        wrongQuestions.length

        ?

        `
        <button id="retry-btn">
        틀린 문제 다시 풀기
        (${wrongQuestions.length})
        </button>
        `

        :

        `
        <p>
        모든 문제 정답 🎉
        </p>
        `

    }


    </div>

    `;



    nextBtn.hidden=true;


    startArea.hidden=false;



    updateRecord();



    const retry =
    document.getElementById(
        "retry-btn"
    );



    if(retry){


        retry.onclick =
        startRetryQuiz;


    }



}




// ===============================
// 오답 다시 풀기
// ===============================


function startRetryQuiz(){



    currentTerms =
    [...wrongQuestions];



    wrongQuestions=[];



    currentQuestion=0;



    score=0;



    combo=0;



    totalQuestions =
    currentTerms.length;



    startArea.hidden=true;


    quizArea.hidden=false;



    nextQuestion();


}







// ===============================
// 배열 섞기
// ===============================


function shuffle(arr){



    for(
        let i=arr.length-1;
        i>0;
        i--
    ){


        const j =
        Math.floor(
            Math.random()*(i+1)
        );


        [
            arr[i],
            arr[j]
        ]
        =
        [
            arr[j],
            arr[i]
        ];


    }


}




// ===============================
// 다음 문제 버튼
// ===============================

nextBtn.onclick =
nextQuestion;



// 실행

loadTerms();
