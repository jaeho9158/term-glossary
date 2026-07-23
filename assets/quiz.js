let allTerms = [];

let currentTerms = [];

let currentQuestion = 0;

let score = 0;

let answer = "";

let totalQuestions = 10;

let wrongQuestions = [];
let retryMode = false;

const quizType =
document.getElementById("quiz-type");

const categorySelect =
document.getElementById("category-select");

const question =
document.getElementById("question");

const choices =
document.getElementById("choices");

const result =
document.getElementById("result");

const quizArea =
document.getElementById("quiz-area");

const startArea = document.getElementById("start-area");


const nextBtn =
document.getElementById("next-btn");

const quizCount =
document.querySelector(".quiz-count");

const CATEGORY_LABELS = {
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

async function loadTerms(){

    const res =
    await fetch("terms.json");

    allTerms =
    await res.json();

    makeCategoryList();

}

function makeCategoryList(){

    const set =
    new Set();

    allTerms.forEach(t=>{

        (t.categories||[]).forEach(c=>set.add(c));

    });

    [...set].forEach(cat=>{

        const op =
        document.createElement("option");

        op.value=cat;

        op.textContent = CATEGORY_LABELS[cat] || cat;

        categorySelect.appendChild(op);

    });

}

document.getElementById("start-btn")
.onclick=function(){

    const cat=
    categorySelect.value;

    if(cat==="all"){

        currentTerms=[...allTerms];

    }else{

        currentTerms=
        allTerms.filter(t=>
            t.categories.includes(cat)
        );

    }

    shuffle(currentTerms);

    currentQuestion=0;

    score=0;

    totalQuestions = Math.min(10, currentTerms.length);

    wrongQuestions = [];
    retryMode = false;

    startArea.hidden=true;
    quizArea.hidden=false;

    nextQuestion();

};

function nextQuestion(){

    result.textContent="";

    nextBtn.hidden=true;

    totalQuestions =
    retryMode
    ? currentTerms.length
    : Math.min(10, currentTerms.length);

    if(currentQuestion >= totalQuestions){
        finishQuiz();
        return;
    }

    const term=
    currentTerms[currentQuestion];

    let mode = quizType.value;

    if(mode==="random"){
        mode = Math.random()>0.5
            ? "definition"
            : "term";
    }

    if(mode==="definition"){

        answer = term.title_ko;

        question.textContent =
            term.definition;

    }else{

        answer = term.definition;

        question.textContent =
            term.title_ko;

    }

    quizCount.textContent=
    `${currentQuestion + 1} / ${totalQuestions}`;

    const options=[answer];

    while(options.length<4){

        const randomTerm =
        allTerms[
        Math.floor(Math.random()*allTerms.length)
        ];

        const random =
        mode==="definition"
        ? randomTerm.title_ko
        : randomTerm.definition;

        if(!options.includes(random))
            options.push(random);

    }

    shuffle(options);

    choices.innerHTML="";

    options.forEach(op=>{

        const div=
        document.createElement("div");

        div.className="choice";

        div.textContent=op;

        div.onclick=()=>check(div,op);

        choices.appendChild(div);

    });

    document.getElementById("progress-bar").style.width =
(currentQuestion / totalQuestions * 100) + "%";

}

function check(div,value){

    [...choices.children]
    .forEach(c=>c.onclick=null);

    if(value === answer){

        score++;

        div.classList.add("correct");

        result.textContent="정답!";

    }else{
        wrongQuestions.push(currentTerms[currentQuestion]);
        div.classList.add("wrong");

        [...choices.children].forEach(c=>{

            if(c.textContent===answer)

                c.classList.add("correct");

        });

        result.textContent=
        `정답은 ${answer}`;

    }

    currentQuestion++;

    document.getElementById("progress-bar").style.width =
        (currentQuestion / totalQuestions * 100) + "%";

    nextBtn.hidden=false;

}

nextBtn.onclick=nextQuestion;

function finishQuiz() {

    question.textContent = "퀴즈 종료!";

    choices.innerHTML = "";

    result.innerHTML = `
        <h2>결과</h2>
        <p>${score}/${totalQuestions}점</p>

        ${
            wrongQuestions.length > 0
            ? `<button id="retry-btn" class="retry-btn">
                틀린 문제 다시 풀기 (${wrongQuestions.length}개)
               </button>`
            : `<p>모든 문제를 맞혔어요! 🎉</p>`
        }
    `;

    nextBtn.hidden = true;
    startArea.hidden = false;

    const retryBtn = document.getElementById("retry-btn");

    if (retryBtn) {
        retryBtn.onclick = startRetryQuiz;
    }
}

function shuffle(arr){

    arr.sort(()=>Math.random()-0.5);

}

loadTerms();

function startRetryQuiz(){

    startArea.hidden = true;

    currentTerms=[...wrongQuestions];

    wrongQuestions=[];

    retryMode=true;

    currentQuestion=0;

    score=0;

    nextQuestion();

}

function retryWrongQuestions(){
    startRetryQuiz();
}