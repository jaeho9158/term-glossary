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


// 객관식 보기 구성: 정답 1개 + 풀에서 뽑은 중복 없는 오답으로 4개를 채운다.
// mode가 "definition"이면 보기는 용어명, 아니면 정의. rand는 테스트에서
// 결정론을 위해 주입 가능(기본 Math.random). 풀에 서로 다른 보기가 4개가 안
// 되면 무한 루프에 빠지지 않도록 시도 횟수를 제한하고 있는 만큼만 반환한다.
function buildChoiceOptions(answer, pool, mode, rand){

    rand = rand || Math.random;

    const options = [answer];

    let attempts = 0;

    const maxAttempts = pool.length * 10 + 40;

    while(options.length < 4 && attempts < maxAttempts){

        attempts++;

        const randomTerm =
        pool[Math.floor(rand() * pool.length)];

        const option =
        mode === "definition"
            ? randomTerm.title_ko
            : randomTerm.definition;

        if(option && !options.includes(option)){

            options.push(option);

        }

    }

    return options;

}


// ===== 퀴즈 리메이크: 문제 구성·헷갈리는 보기·오답 목록 규칙 (순수 함수) =====

function shuffleCopy(arr, rand){
    rand = rand || Math.random;
    const a = arr.slice();
    for(let i = a.length - 1; i > 0; i--){
        const j = Math.floor(rand() * (i + 1));
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
}

// 헷갈리는 오답 후보: 정답과 related로 이어진 용어(양방향) → 같은 소분야 → 나머지 순.
// 제목이 같은 보기는 한 번만 쓴다. 가까운 후보(앞의 두 단계)가 n개 미만이면
// 나머지(같은 분야 무작위)로 채우고 fallback=true를 돌려준다.
function pickConfusables(answer, pool, rand, n){
    rand = rand || Math.random;
    n = n || 3;
    const relSet = new Set(answer.related || []);
    const near = [], same = [], rest = [];
    for(const t of pool){
        if(!t || t.slug === answer.slug) continue;
        if(relSet.has(t.slug) || (t.related || []).includes(answer.slug)) near.push(t);
        else if(answer.subcategory && t.subcategory === answer.subcategory) same.push(t);
        else rest.push(t);
    }
    const used = new Set([answer.title_ko]);
    const picked = [];
    const take = list => {
        for(const t of shuffleCopy(list, rand)){
            if(picked.length >= n) return;
            if(!used.has(t.title_ko)){ used.add(t.title_ko); picked.push(t); }
        }
    };
    take(near);
    take(same);
    const confusable = picked.length;
    take(rest);
    return { terms: picked, fallback: confusable < n };
}

// kind: "def2term" | "term2def" | "confuse" | "subjective"
// 반환: { slug, kind, prompt, answer, options(섞임, 주관식은 []), fallback? }
function buildQuestion(term, kind, pool, rand){
    rand = rand || Math.random;
    const asDef = pool.map(t => ({ title_ko: t.title_ko, definition: t.meaning }));
    const q = { slug: term.slug, kind: kind, options: [] };
    if(kind === "term2def"){
        q.prompt = term.title_ko + (term.title_en ? " (" + term.title_en + ")" : "");
        q.answer = term.meaning;
        q.options = shuffleCopy(buildChoiceOptions(q.answer, asDef, "term", rand), rand);
    }
    else if(kind === "confuse"){
        const c = pickConfusables(term, pool, rand, 3);
        q.prompt = term.meaning;
        q.answer = term.title_ko;
        q.fallback = c.fallback;
        q.options = shuffleCopy([term.title_ko].concat(c.terms.map(t => t.title_ko)), rand);
    }
    else if(kind === "subjective"){
        q.prompt = term.meaning;
        q.answer = term.title_ko;
    }
    else {
        q.kind = "def2term";
        q.prompt = term.meaning;
        q.answer = term.title_ko;
        q.options = shuffleCopy(buildChoiceOptions(q.answer, asDef, "definition", rand), rand);
    }
    return q;
}

// 주관식은 긴 제목·괄호 표기 용어가 입력 부담이라 풀에서 거른다(4개 미만이면 그대로).
function typableTerms(list){
    const typable = list.filter(t => t.title_ko && t.title_ko.length <= 10 && !/[()（）]/.test(t.title_ko));
    return typable.length >= 4 ? typable : list;
}

// 오답 목록 갱신 규칙. list = [{slug, streak}]. 틀리면 목록에 넣고(이미 있으면 streak 0),
// 목록에 있는 용어를 맞히면 streak+1, 2에 도달하면(연속 두 번 정답) 목록에서 뺀다.
// 목록에 없는 용어를 맞히면 변화 없음. 원본은 바꾸지 않는다.
const WRONG_CLEAR_STREAK = 2;
function updateWrongList(list, slug, correct){
    const out = (list || []).map(e => ({ slug: e.slug, streak: e.streak || 0 }));
    const i = out.findIndex(e => e.slug === slug);
    if(!correct){
        if(i === -1) out.push({ slug: slug, streak: 0 });
        else out[i].streak = 0;
        return out;
    }
    if(i === -1) return out;
    out[i].streak++;
    if(out[i].streak >= WRONG_CLEAR_STREAK) out.splice(i, 1);
    return out;
}


if (typeof module !== "undefined" && module.exports) {
    module.exports = { normalizeAnswer, acceptedAnswers, toChoseong, CHOSEONG, buildChoiceOptions, shuffleCopy, pickConfusables, buildQuestion, typableTerms, updateWrongList, WRONG_CLEAR_STREAK };
}
