// assets/quiz.js — 학습 퀴즈 (분야 칩 → 방식 → 10/20문제 → 결과).
// 데이터: data/learn/<분야>.json (core 용어만). 순수 로직은 quiz-core.js / learn-core.js.

// ===============================
// 저장소 (모두 try/catch)
// ===============================

const RECORD_KEY = "term_quiz_record";   // 기존 키 그대로: {played, correct, bestScore, bestCombo}
const WRONG_KEY = "quiz_wrong_v1";       // 신규: { 분야코드: [{slug, streak}] }

function lsGet(key){
    try{ return localStorage.getItem(key); }catch(e){ return null; }
}

function lsSet(key, value){
    try{ localStorage.setItem(key, value); }catch(e){ /* 저장 실패는 무시 */ }
}

function getRecord(){
    const empty = { played:0, correct:0, bestScore:0, bestCombo:0 };
    const saved = lsGet(RECORD_KEY);
    if(!saved) return empty;
    try{
        const r = JSON.parse(saved);
        return Object.assign(empty, r && typeof r === "object" ? r : {});
    }catch(e){
        return empty;
    }
}

function saveRecord(data){
    lsSet(RECORD_KEY, JSON.stringify(data));
}

function readWrongStore(){
    try{
        const o = JSON.parse(lsGet(WRONG_KEY) || "{}");
        return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    }catch(e){
        return {};
    }
}

function getWrongList(field){
    const l = readWrongStore()[field];
    return Array.isArray(l) ? l.filter(e => e && typeof e.slug === "string") : [];
}

function recordWrongResult(field, slug, correct){
    const store = readWrongStore();
    const next = updateWrongList(getWrongList(field), slug, correct);
    if(next.length) store[field] = next;
    else delete store[field];
    lsSet(WRONG_KEY, JSON.stringify(store));
}

// ===============================
// 상태 / DOM
// ===============================

const $ = id => document.getElementById(id);

const MODE_LABEL = {
    def2term: "뜻 → 용어",
    term2def: "용어 → 뜻",
    confuse: "헷갈리는 용어 구분",
    subjective: "주관식"
};

let learnIndex = null;      // data/learn/index.json
let popularFields = [];
let slugIdx = null;         // data/learn/slug-index.json (필요할 때 로드)
const catCache = new Map(); // code -> terms[]

let field = "";             // "", "all", 분야 코드
let mode = "def2term";
let count = 10;
let customSlugs = null;     // ?slugs= 로 들어온 목록 (null이면 일반 모드)

let run = null;             // 진행 중인 퀴즈
let combo = 0;
let timer = null;
let timeLeft = 15;
let answered = false;
let scrollAfter = false;   // 칩을 눌러 고른 경우에만 방식 선택 위치로 스크롤

const startArea = $("start-area");
const quizArea = $("quiz-area");
const resultArea = $("result-area");
const questionEl = $("question");
const choicesEl = $("choices");
const resultEl = $("result");
const feedbackEl = $("lq-feedback");
const nextBtn = $("next-btn");
const quizCount = document.querySelector(".quiz-count");
const timerEl = $("quiz-timer");
const comboEl = $("quiz-combo");
const recordBox = $("quiz-record");
const startErrorEl = $("quiz-start-error");

function showStartError(message){
    if(!startErrorEl) return;
    startErrorEl.textContent = message;
    startErrorEl.hidden = !message;
}

function shuffle(arr){
    return shuffleCopy(arr);
}

// ===============================
// 기록 표시 (기존 통계 그대로)
// ===============================

function updateRecord(){
    if(!recordBox) return;
    const r = getRecord();
    const accuracy = r.played ? Math.round(r.correct / r.played * 100) : 0;
    recordBox.innerHTML = `
        <h3>📊 퀴즈 기록</h3>
        <p>총 풀이: ${r.played}</p>
        <p>정답률: ${accuracy}%</p>
        <p>최고 점수: ${r.bestScore}점</p>
        <p>최고 콤보: ${r.bestCombo}</p>
    `;
}

// ===============================
// 데이터 로딩
// ===============================

async function loadCat(code){
    if(catCache.has(code)) return catCache.get(code);
    const data = await LearnPicker.fetchJson("data/learn/" + encodeURIComponent(code) + ".json");
    const list = Array.isArray(data) ? data : [];
    catCache.set(code, list);
    return list;
}

async function loadSlugIndex(){
    if(!slugIdx) slugIdx = (await LearnPicker.fetchJson("data/learn/slug-index.json")) || {};
    return slugIdx;
}

// slug 목록 → 용어 객체 (분야 파일을 필요한 만큼만 불러온다). 모르는 slug는 빠진다.
async function termsBySlugs(slugs){
    const idx = await loadSlugIndex();
    const cats = [...new Set(slugs.map(s => idx[s]).filter(Boolean))];
    await Promise.all(cats.map(loadCat));
    const out = [];
    for(const s of slugs){
        const c = idx[s];
        const t = c && (catCache.get(c) || []).find(x => x.slug === s);
        if(t) out.push(t);
    }
    return out;
}

// 문제 보기 풀: 분야 퀴즈는 그 분야 전체, "전체"·맞춤 퀴즈는 그 용어의 첫 분야.
function poolFor(term){
    if(field && field !== "all" && !customSlugs && catCache.get(field)) return catCache.get(field);
    return catCache.get(slugIdx && slugIdx[term.slug]) || [];
}

// ===============================
// 시작 화면
// ===============================

function currentFieldKey(){
    if(customSlugs){
        const f = LearnCore.parseFieldHash(location.hash, learnIndex || {});
        if(f) return f;
        return (slugIdx && slugIdx[customSlugs[0]]) || "all";
    }
    return field;
}

function roadmapCode(){
    const k = currentFieldKey();
    return k && k !== "all" && learnIndex && learnIndex[k] ? k : "";
}

function updateRetryEntry(){
    const btn = $("lq-retry-entry");
    const n = field || customSlugs ? getWrongList(currentFieldKey()).length : 0;
    btn.hidden = n === 0;
    btn.textContent = `틀린 문제 ${n}개 다시 풀기`;
}

function setPressed(container, attr, value){
    container.querySelectorAll("button[" + attr + "]").forEach(b => {
        b.setAttribute("aria-pressed", b.getAttribute(attr) === String(value) ? "true" : "false");
    });
}

function applyHash(){
    if(customSlugs) return;
    field = LearnCore.parseFieldHash(location.hash, learnIndex || {}, ["all"]);
    LearnPicker.setSelected($("field-picker"), field, field === "all" ? "전체 " + totalCore() : field && learnIndex[field] ? learnIndex[field].label + " " + learnIndex[field].core : "");
    $("lq-mode-step").hidden = !field;
    if(field && scrollAfter){
        scrollAfter = false;
        $("field-picker").previousElementSibling.scrollIntoView({ block: "start" });
    }
    showStartError("");
    updateRetryEntry();
}

function totalCore(){
    return slugIdx ? Object.keys(slugIdx).length : 0;
}

async function init(){
    updateRecord();

    const loaded = await LearnPicker.loadIndex();
    learnIndex = loaded.index;
    popularFields = loaded.popularFields;

    if(!learnIndex){
        $("field-picker").textContent = "";
        showStartError("학습 데이터를 불러오지 못했습니다. 네트워크 상태를 확인하고 새로고침해주세요.");
        return;
    }

    const params = new URLSearchParams(location.search);
    let raw = params.get("slugs");

    // 예전 로드맵 플래시카드가 sessionStorage로 넘기던 범위도 같은 경로로 처리한다.
    if(!raw && params.get("scope") === "roadmap"){
        try{
            const s = JSON.parse(sessionStorage.getItem("quiz_scope_slugs") || "[]");
            if(Array.isArray(s)) raw = s.join(",");
        }catch(e){ /* 무시 */ }
    }

    if(raw !== null && raw !== undefined && raw !== ""){
        await initCustom(raw);
        return;
    }

    await loadSlugIndex();

    LearnPicker.render($("field-picker"), {
        index: learnIndex,
        popularFields: popularFields,
        groups: typeof CATEGORY_GROUPS !== "undefined" ? CATEGORY_GROUPS : [],
        selected: "",
        allCount: totalCore(),
        onSelect: code => { scrollAfter = true; if(location.hash === "#" + code) applyHash(); else location.hash = code; }
    });

    window.addEventListener("hashchange", applyHash);
    applyHash();
}

async function initCustom(raw){
    const idx = await loadSlugIndex();
    const slugs = LearnCore.parseSlugsParam(raw, idx, 50);
    $("lq-field-step").hidden = true;

    if(!slugs.length){
        showStartError("이 링크의 용어를 찾을 수 없습니다. 분야를 직접 골라 시작해주세요.");
        $("lq-mode-step").hidden = true;
        const back = document.createElement("a");
        back.href = "quiz.html";
        back.textContent = "퀴즈 처음으로";
        startErrorEl.appendChild(document.createTextNode(" "));
        startErrorEl.appendChild(back);
        return;
    }

    customSlugs = slugs;
    const banner = $("quiz-scope-banner");
    banner.hidden = false;
    banner.textContent = `선택한 용어 ${slugs.length}개로 퀴즈를 풉니다.`;
    $("lq-mode-step").hidden = false;
    updateRetryEntry();
}

// 방식·문제 수 버튼
$("lq-modes").addEventListener("click", e => {
    const b = e.target.closest(".lq-mode");
    if(!b) return;
    mode = b.dataset.mode;
    setPressed($("lq-modes"), "data-mode", mode);
});

document.querySelector(".lq-count").addEventListener("click", e => {
    const b = e.target.closest(".lq-seg");
    if(!b) return;
    count = Number(b.dataset.count);
    setPressed(document.querySelector(".lq-count"), "data-count", count);
});

$("start-btn").onclick = startNew;
$("lq-retry-entry").onclick = () => startRetry();

// ===============================
// 퀴즈 시작
// ===============================

async function startNew(){
    showStartError("");
    let terms = [];

    try{
        if(customSlugs){
            terms = await termsBySlugs(customSlugs);
        }
        else if(field === "all"){
            const idx = await loadSlugIndex();
            // 주관식은 입력 가능한 용어만 남기므로 넉넉히 뽑는다.
            const take = mode === "subjective" ? count * 3 : count;
            terms = await termsBySlugs(shuffle(Object.keys(idx)).slice(0, take));
        }
        else if(field){
            await loadSlugIndex();
            terms = await loadCat(field);
        }
    }catch(e){
        terms = [];
    }

    if(mode === "subjective") terms = typableTerms(terms);

    if(!terms.length){
        showStartError("이 분야에는 출제할 용어가 없습니다. 다른 분야를 선택해주세요.");
        return;
    }

    terms = shuffle(terms);

    launch(terms.slice(0, count), mode, false);
}

async function startRetry(){
    showStartError("");
    const key = currentFieldKey();
    const slugs = getWrongList(key).map(e => e.slug).slice(0, 20);
    const idx = await loadSlugIndex();
    if(field && field !== "all" && !customSlugs) await loadCat(field);
    const terms = await termsBySlugs(slugs.filter(s => idx[s]));
    if(!terms.length){
        showStartError("다시 풀 문제를 찾지 못했습니다.");
        return;
    }
    launch(shuffle(terms), mode, true);
}

function launch(terms, runMode, isRetry){
    run = {
        terms: terms,
        mode: runMode,
        retry: isRetry,
        idx: 0,
        score: 0,
        missed: [],
        key: currentFieldKey()
    };
    combo = 0;
    updateCombo();
    startArea.hidden = true;
    resultArea.hidden = true;
    quizArea.hidden = false;
    nextQuestion();
}

// ===============================
// 문제 출제
// ===============================

function nextQuestion(){
    clearTimer();
    answered = false;
    resultEl.textContent = "";
    feedbackEl.hidden = true;
    feedbackEl.textContent = "";
    nextBtn.hidden = true;

    if(run.idx >= run.terms.length){
        finishQuiz();
        return;
    }

    const term = run.terms[run.idx];
    const q = buildQuestion(term, run.mode, poolFor(term));
    run.q = q;
    run.term = term;

    quizCount.textContent = `${run.idx + 1} / ${run.terms.length}`;
    questionEl.textContent = q.prompt;
    choicesEl.innerHTML = "";

    if(q.kind === "subjective"){
        renderSubjective(term);
    }
    else {
        q.options.forEach((op, i) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "choice";
            btn.textContent = op;
            btn.dataset.key = String(i + 1);
            btn.onclick = () => checkAnswer(btn, op);
            choicesEl.appendChild(btn);
        });
    }

    nextBtn.firstChild.textContent = run.idx === run.terms.length - 1 ? "\n결과 보기\n" : "\n다음 문제\n";
    updateProgress();
    startTimer();
}

// ===============================
// 주관식 (기존 채점·초성 힌트 로직 유지)
// ===============================

let subjectiveHintTerm = null;
let subjectiveHintShown = false;

function revealChoseongHint(){
    if(subjectiveHintShown || !subjectiveHintTerm) return;
    const patternEl = document.querySelector(".subjective-pattern");
    if(!patternEl) return;
    patternEl.firstChild.textContent = toChoseong(subjectiveHintTerm.title_ko) + " ";
    const lenEl = patternEl.querySelector(".subjective-len");
    if(lenEl) lenEl.textContent = "(초성)";
    subjectiveHintShown = true;
}

function renderSubjective(term){
    const pattern = "○".repeat(term.title_ko.length);
    const wrap = document.createElement("div");
    wrap.className = "subjective-wrap";
    wrap.innerHTML = `
        <p class="subjective-pattern" aria-label="글자 수 힌트">${pattern} <span class="subjective-len">(${term.title_ko.length}글자)</span></p>
        <div class="subjective-row">
            <input type="text" id="subjective-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="용어를 입력하세요" aria-label="정답 입력">
            <button type="button" id="subjective-submit">제출</button>
        </div>
        <p class="subjective-hint-note">시간이 절반 지나면 초성이 공개됩니다</p>
    `;
    choicesEl.appendChild(wrap);

    const input = $("subjective-input");
    subjectiveHintTerm = term;
    subjectiveHintShown = false;

    $("subjective-submit").onclick = () => checkSubjective(term, input.value);
    input.addEventListener("keydown", e => {
        if(e.key === "Enter"){
            e.preventDefault();
            checkSubjective(term, input.value);
        }
    });
    input.focus();
}

function lockSubjectiveInput(){
    const input = $("subjective-input");
    const submit = $("subjective-submit");
    if(input) input.disabled = true;
    if(submit) submit.disabled = true;
}

function checkSubjective(term, value){
    if(answered) return;
    if(!String(value || "").trim()) return; // 빈 제출은 무시
    const ok = acceptedAnswers(term).has(normalizeAnswer(value));
    lockSubjectiveInput();
    const input = $("subjective-input");
    if(input) input.classList.add(ok ? "correct" : "wrong");
    settle(ok, ok ? null : "오답!");
}

// ===============================
// 타이머
// ===============================

function startTimer(){
    const subj = run.mode === "subjective";
    timeLeft = subj ? 30 : 15;
    updateTimer();
    timer = setInterval(() => {
        timeLeft--;
        updateTimer();
        if(subj && timeLeft === 15) revealChoseongHint();
        if(timeLeft <= 0){
            clearTimer();
            timeoutAnswer();
        }
    }, 1000);
}

function updateTimer(){
    if(timerEl) timerEl.textContent = `⏱ ${timeLeft}초`;
}

function clearTimer(){
    if(timer){
        clearInterval(timer);
        timer = null;
    }
}

function timeoutAnswer(){
    if(answered) return;
    lockSubjectiveInput();
    settle(false, "시간 초과!");
}

// ===============================
// 정답 확인
// ===============================

function checkAnswer(btn, value){
    if(answered) return;
    const ok = value === run.q.answer;
    btn.classList.add(ok ? "correct" : "wrong");
    settle(ok, ok ? null : "오답!");
}

// 한 문제의 결과를 한 곳에서 처리: 기록·오답 목록·콤보·해설·다음 버튼.
function settle(ok, failLabel){
    answered = true;
    clearTimer();

    [...choicesEl.children].forEach(c => {
        if(c.classList.contains("choice")){
            c.onclick = null;
            if(c.textContent === run.q.answer) c.classList.add("correct");
        }
    });

    const record = getRecord();
    record.played++;

    if(ok){
        run.score++;
        combo++;
        record.correct++;
        if(combo > record.bestCombo) record.bestCombo = combo;
        resultEl.textContent = `정답! 🔥 ${combo}연속 정답`;
    }
    else {
        combo = 0;
        run.missed.push(run.term);
        resultEl.textContent = `${failLabel} 정답 : ${run.q.answer}`;
    }

    saveRecord(record);
    recordWrongResult(run.key, run.term.slug, ok);
    updateCombo();
    showFeedback(run.term);

    run.idx++;
    nextBtn.hidden = false;
    nextBtn.focus();
}

function showFeedback(term){
    feedbackEl.textContent = "";
    const head = document.createElement("strong");
    head.textContent = term.title_ko + (term.title_en ? ` (${term.title_en})` : "");
    const p = document.createElement("p");
    p.textContent = term.meaning;
    const a = document.createElement("a");
    a.href = "terms/" + encodeURIComponent(term.slug) + ".html";
    a.textContent = "용어 페이지 보기 →";
    feedbackEl.appendChild(head);
    feedbackEl.appendChild(p);
    feedbackEl.appendChild(a);
    feedbackEl.hidden = false;
}

function updateCombo(){
    if(comboEl) comboEl.textContent = `🔥 ${combo} 콤보`;
}

function updateProgress(){
    const bar = $("progress-bar");
    if(!bar) return;
    bar.style.width = (run && run.terms.length ? run.idx / run.terms.length * 100 : 0) + "%";
}

nextBtn.onclick = nextQuestion;

// 숫자키 1~4로 보기 선택 (입력창에 포커스가 있을 때는 무시)
document.addEventListener("keydown", e => {
    if(quizArea.hidden || answered || !run) return;
    if(e.target && /^(input|textarea)$/i.test(e.target.tagName)) return;
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    const btn = choicesEl.querySelector('.choice[data-key="' + e.key + '"]');
    if(btn) btn.click();
});

// ===============================
// 종료 / 결과 화면
// ===============================

function finishQuiz(){
    clearTimer();
    const record = getRecord();
    if(run.score > record.bestScore){
        record.bestScore = run.score;
        saveRecord(record);
    }

    const total = run.terms.length;
    if(window.trackEvent){
        window.trackEvent("quiz_complete", {
            score: run.score,
            total: total,
            mode: run.mode,
            field: run.key || "all"
        });
    }

    const accuracy = total ? Math.round(run.score / total * 100) : 0;
    const wrongN = getWrongList(run.key).length;
    const rm = roadmapCode();

    quizArea.hidden = true;
    resultArea.hidden = false;
    resultArea.textContent = "";

    const box = document.createElement("div");
    box.className = "quiz-result";
    box.innerHTML = `
        <h2>🎉 결과</h2>
        <p>점수 : <strong>${run.score}/${total}</strong></p>
        <p>정답률 : ${accuracy}%</p>
        <p>최고 점수 : ${record.bestScore}</p>
        <p>최고 콤보 : ${record.bestCombo}</p>
    `;
    resultArea.appendChild(box);

    if(run.missed.length){
        const h = document.createElement("h3");
        h.className = "lq-missed-title";
        h.textContent = `틀린 용어 ${run.missed.length}개`;
        const ul = document.createElement("ul");
        ul.className = "lq-missed";
        run.missed.forEach(t => {
            const li = document.createElement("li");
            const a = document.createElement("a");
            a.href = "terms/" + encodeURIComponent(t.slug) + ".html";
            a.textContent = t.title_ko;
            const s = document.createElement("span");
            s.textContent = t.meaning;
            li.appendChild(a);
            li.appendChild(s);
            ul.appendChild(li);
        });
        resultArea.appendChild(h);
        resultArea.appendChild(ul);
    }
    else {
        const p = document.createElement("p");
        p.className = "lq-allright";
        p.textContent = "모든 문제 정답 🎉";
        resultArea.appendChild(p);
    }

    const actions = document.createElement("div");
    actions.className = "lq-actions";

    if(wrongN){
        actions.appendChild(actionButton(`틀린 문제 다시 (${wrongN})`, () => startRetryFromResult(), "lq-btn-primary"));
    }
    if(rm){
        const a = document.createElement("a");
        a.className = "lq-btn";
        a.href = "roadmap.html#" + rm;
        a.textContent = "이 분야 로드맵 보기";
        actions.appendChild(a);
    }
    const bm = actionButton("즐겨찾기에 담기", null, "lq-btn");
    bm.hidden = true;
    bm.id = "lq-bookmark-btn";
    actions.appendChild(bm);
    actions.appendChild(actionButton("처음으로", backToStart, "lq-btn"));
    resultArea.appendChild(actions);

    const note = document.createElement("p");
    note.className = "lq-muted";
    note.id = "lq-bookmark-note";
    note.setAttribute("role", "status");
    resultArea.appendChild(note);

    updateRecord();
    if(run.missed.length) setupBookmark(bm, note, run.missed);
    resultArea.querySelector(".lq-actions button, .lq-actions a").focus();
}

function actionButton(label, onClick, cls){
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = label;
    if(onClick) b.onclick = onClick;
    return b;
}

async function startRetryFromResult(){
    const key = run.key;
    const slugs = getWrongList(key).map(e => e.slug).slice(0, 20);
    const idx = await loadSlugIndex();
    const terms = await termsBySlugs(slugs.filter(s => idx[s]));
    if(!terms.length) return backToStart();
    launch(shuffle(terms), run.mode, true);
}

function backToStart(){
    resultArea.hidden = true;
    quizArea.hidden = true;
    startArea.hidden = false;
    $("progress-bar").style.width = "0%";
    updateRetryEntry();
    window.scrollTo(0, 0);
}

// 즐겨찾기: 로그인한 사용자만 (term-bookmark.js와 같은 tg_bookmarks 테이블). 비로그인이면 버튼을 숨긴다.
async function setupBookmark(btn, note, missed){
    let sb, session;
    try{
        const auth = await import("./assets/auth.js");
        session = await auth.getSession();
        sb = auth.supabase;
    }catch(e){
        return;
    }
    if(!session) return;
    btn.hidden = false;
    btn.onclick = async () => {
        btn.disabled = true;
        try{
            const uid = session.user.id;
            const slugs = missed.map(t => t.slug);
            const { data } = await sb.from("tg_bookmarks").select("term_slug").eq("user_id", uid).in("term_slug", slugs);
            const have = new Set((data || []).map(r => r.term_slug));
            const rows = missed.filter(t => !have.has(t.slug)).map(t => ({ user_id: uid, term_slug: t.slug, term_title: t.title_ko }));
            if(rows.length){
                const { error } = await sb.from("tg_bookmarks").insert(rows);
                if(error) throw error;
            }
            note.textContent = `즐겨찾기에 ${rows.length}개를 담았습니다.` + (have.size ? ` (이미 담긴 ${have.size}개 제외)` : "");
        }catch(e){
            note.textContent = "즐겨찾기에 담지 못했습니다. 잠시 후 다시 시도해주세요.";
            btn.disabled = false;
        }
    };
}

// 실행
init();
