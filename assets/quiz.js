// assets/quiz.js

let allTerms = [];

let currentTerms = [];

let currentQuestion = 0;

let score = 0;

let answer = "";

let totalQuestions = 10;

let wrongQuestions = [];

let retryMode = false;


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

    localStorage.setItem(
        RECORD_KEY,
        JSON.stringify(data)
    );

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


const difficultySelect =
document.getElementById("difficulty-select");


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



    const labels = {

        stat:"통계",

        method:"연구방법론",

        tool:"측정·도구",

        ethics:"윤리·출판",

        physchem:"물리학·화학",

        bioearth:"생물학·지구과학",

        neuro:"뇌과학",

        medhealth:"의학·보건",

        psych:"심리학",

        socialecon:"사회과학·경제학",

        eng:"공학",

        cs:"컴퓨터과학·AI"

    };




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
// 난이도 적용
// ===============================

function filterDifficulty(list){


    const level =
    difficultySelect.value;



    if(level==="all")
        return list;



    if(level==="easy"){


        return list.filter(t=>

            t.definition.length < 120

        );


    }



    if(level==="hard"){


        return list.filter(t=>

            t.definition.length >= 120

        );


    }



    return list;

}




// ===============================
// 시작
// ===============================

document
.getElementById("start-btn")
.onclick=function(){



    let list =
    [...allTerms];



    const category =
    categorySelect.value;



    if(category !== "all"){


        list =
        list.filter(t=>

            (t.categories || [])
            .includes(category)

        );


    }



    list =
    filterDifficulty(list);



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

