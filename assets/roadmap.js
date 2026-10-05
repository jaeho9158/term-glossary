// assets/roadmap.js — 분야별 3단계 로드맵 (입문/중급/심화).
// 진도 저장: 로컬 roadmap_progress_v1 (slug 배열, 기존 키 그대로) + 로그인 시 Supabase tg_roadmap_progress.
// 진도는 분야가 아니라 slug 기준이라 예전에 체크한 용어는 새 목록에 남아 있으면 그대로 체크로 보인다.

const LOCAL_KEY = "roadmap_progress_v1";
const OPEN_KEY = "roadmap_open_v1"; // 편의용: { 분야: [열린 단계 level…] } — 없어도 동작

let sb = null;          // supabase 클라이언트 (불러온 경우에만)
let session = null;
let remoteDone = new Set();
let localDone = new Set();

let learnIndex = null;
let field = "";
let terms = [];
let stages = [];
let openLevels = new Set();
let scrollAfter = false; // 칩을 눌러 고른 경우에만 결과 위치로 스크롤

const $ = id => document.getElementById(id);
const content = $("roadmap-content");
const emptyState = document.querySelector(".learn-empty-state");

function readLocal(){
  try{
    const a = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return new Set(Array.isArray(a) ? a.filter(s => typeof s === "string") : []);
  }catch(e){
    return new Set();
  }
}

function writeLocal(set){
  try{ localStorage.setItem(LOCAL_KEY, JSON.stringify([...set])); }catch(e){ /* 저장 실패는 무시 */ }
}

function readOpen(code){
  try{
    const o = JSON.parse(localStorage.getItem(OPEN_KEY) || "{}");
    return Array.isArray(o[code]) ? o[code] : null;
  }catch(e){
    return null;
  }
}

function writeOpen(code, levels){
  try{
    const o = JSON.parse(localStorage.getItem(OPEN_KEY) || "{}");
    o[code] = levels;
    localStorage.setItem(OPEN_KEY, JSON.stringify(o));
  }catch(e){ /* 무시 */ }
}

function doneSet(){
  return session ? remoteDone : localDone;
}

async function setDone(slug, checked){
  if(checked) localDone.add(slug); else localDone.delete(slug);
  writeLocal(localDone);
  if(!session || !sb) return;
  try{
    if(checked){
      await sb.from("tg_roadmap_progress").insert({ user_id: session.user.id, term_slug: slug });
    }
    else {
      await sb.from("tg_roadmap_progress").delete().eq("user_id", session.user.id).eq("term_slug", slug);
    }
  }catch(e){ /* 서버 저장 실패: 화면은 그대로 둔다 */ }
  if(checked) remoteDone.add(slug); else remoteDone.delete(slug);
}

async function initAuth(){
  try{
    const auth = await import("./auth.js");
    sb = auth.supabase;
    session = await auth.getSession();
    if(!session) return;
    const { data } = await sb.from("tg_roadmap_progress").select("term_slug").eq("user_id", session.user.id);
    remoteDone = new Set((data || []).map(r => r.term_slug));
    // 로컬에만 있는 진도는 서버로 올린다. 로컬 값은 지우지 않는다.
    const toMigrate = [...localDone].filter(s => !remoteDone.has(s));
    if(toMigrate.length){
      const { error } = await sb.from("tg_roadmap_progress").insert(toMigrate.map(term_slug => ({ user_id: session.user.id, term_slug })));
      if(!error) toMigrate.forEach(s => remoteDone.add(s));
    }
  }catch(e){
    session = null;
  }
}

// ===============================
// 렌더
// ===============================

function el(tag, cls, text){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(text !== undefined) e.textContent = text;
  return e;
}

function bar(pct, label){
  const b = el("div", "lr-bar");
  b.setAttribute("role", "progressbar");
  b.setAttribute("aria-valuemin", "0");
  b.setAttribute("aria-valuemax", "100");
  b.setAttribute("aria-valuenow", String(pct));
  b.setAttribute("aria-label", label);
  const f = el("div", "lr-bar-fill");
  f.style.width = pct + "%";
  b.appendChild(f);
  return b;
}

function termHref(slug){
  return "terms/" + encodeURIComponent(slug) + ".html";
}

function render(){
  const focusSlug = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.slug : null;
  const done = doneSet();
  const all = stages.flatMap(s => s.terms);
  const overall = LearnCore.progressOf(all, done);
  const info = learnIndex[field];

  content.textContent = "";

  const head = el("div", "lr-head");
  head.appendChild(el("h2", "lr-field", info.label + " 로드맵"));
  head.appendChild(el("p", "lr-meta", `핵심 용어 ${info.core}개 중 ${all.length}개 · 전체 ${overall.done}/${overall.total} (${overall.pct}%)`));
  head.appendChild(bar(overall.pct, "전체 진행률"));
  content.appendChild(head);

  if(info.core < 6){
    content.appendChild(el("p", "lr-note", `이 분야는 아직 핵심 용어가 ${info.core}개뿐이라 있는 용어만 보여드려요.`));
  }

  // 다음에 볼 용어
  const next = LearnCore.nextTerm(stages, done);
  const card = el("section", "lr-next");
  card.setAttribute("aria-label", "다음에 볼 용어");
  if(next){
    card.appendChild(el("span", "lr-next-label", `다음에 볼 용어 · ${next.stage.name}`));
    const a = el("a", "lr-next-title", next.term.title_ko);
    a.href = termHref(next.term.slug);
    card.appendChild(a);
    card.appendChild(el("p", "lr-next-meaning", next.term.meaning));
  }
  else {
    card.appendChild(el("span", "lr-next-label", "모든 단계를 마쳤어요"));
    const a = el("a", "lr-next-title", "이 분야 퀴즈로 복습하기");
    a.href = "quiz.html#" + field;
    card.appendChild(a);
  }
  content.appendChild(card);

  // 단계
  for(const stage of stages){
    const p = LearnCore.progressOf(stage.terms, done);
    const d = el("details", "lr-stage");
    d.dataset.level = String(stage.level);
    if(openLevels.has(stage.level)) d.open = true;

    const sum = el("summary", "lr-stage-sum");
    sum.appendChild(el("span", "lr-stage-name", `${stage.level}단계 ${stage.name}`));
    sum.appendChild(el("span", "lr-stage-count", `${p.done}/${p.total}`));
    d.appendChild(sum);
    d.appendChild(bar(p.pct, `${stage.name} 진행률`));

    if(stage.available > stage.terms.length){
      d.appendChild(el("p", "lr-stage-note", `${stage.name} 용어 ${stage.available}개 중 많이 찾는 순서로 ${stage.terms.length}개를 담았어요.`));
    }

    const ul = el("ul", "lr-list");
    for(const t of stage.terms){
      const li = el("li", "lr-item");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "lr-check";
      cb.dataset.slug = t.slug;
      cb.checked = done.has(t.slug);
      cb.setAttribute("aria-label", `${t.title_ko} 학습 완료`);
      li.appendChild(cb);
      const body = el("div", "lr-item-body");
      const a = el("a", "lr-term", t.title_ko);
      a.href = termHref(t.slug);
      body.appendChild(a);
      if(t.title_en) body.appendChild(el("span", "lr-term-en", t.title_en));
      body.appendChild(el("p", "lr-meaning", t.meaning));
      li.appendChild(body);
      ul.appendChild(li);
    }
    d.appendChild(ul);

    if(p.total && p.done === p.total){
      const q = el("a", "lr-quiz", "이 단계 퀴즈 풀기");
      q.href = "quiz.html?slugs=" + stage.terms.map(t => encodeURIComponent(t.slug)).join(",") + "#" + field;
      d.appendChild(q);
    }

    d.addEventListener("toggle", () => {
      if(d.open) openLevels.add(stage.level); else openLevels.delete(stage.level);
      writeOpen(field, [...openLevels]);
    });
    content.appendChild(d);
  }

  const foot = el("p", "lr-foot");
  const fa = el("a", "lr-foot-link", "이 분야 퀴즈 풀기");
  fa.href = "quiz.html#" + field;
  foot.appendChild(fa);
  content.appendChild(foot);

  if(focusSlug){
    const f = content.querySelector('.lr-check[data-slug="' + CSS.escape(focusSlug) + '"]');
    if(f) f.focus();
  }
}

content.addEventListener("change", async e => {
  const cb = e.target.closest(".lr-check");
  if(!cb) return;
  await setDone(cb.dataset.slug, cb.checked);
  render();
});

// ===============================
// 분야 선택
// ===============================

async function showField(code){
  field = code;
  LearnPicker.setSelected($("field-picker"), code);
  if(!code){
    content.textContent = "";
    if(emptyState) emptyState.hidden = false;
    return;
  }
  if(emptyState) emptyState.hidden = true;
  content.textContent = "";
  content.appendChild(el("p", "lq-muted", "불러오는 중..."));

  const data = await LearnPicker.fetchJson("data/learn/" + encodeURIComponent(code) + ".json");
  if(code !== field) return; // 그 사이 다른 분야로 바뀜
  if(!Array.isArray(data)){
    content.textContent = "";
    content.appendChild(el("p", "load-error", "로드맵 데이터를 불러오지 못했습니다. 네트워크 상태를 확인하고 새로고침해주세요."));
    return;
  }
  terms = data;
  stages = LearnCore.selectRoadmap(terms);
  localDone = readLocal();
  const saved = readOpen(code);
  openLevels = new Set(saved || [LearnCore.firstOpenLevel(stages, doneSet())].filter(Boolean));
  render();
  if(scrollAfter){
    scrollAfter = false;
    content.scrollIntoView({ block: "start" });
  }
}

function applyHash(){
  showField(LearnCore.parseFieldHash(location.hash, learnIndex));
}

async function init(){
  localDone = readLocal();
  const loaded = await LearnPicker.loadIndex();
  learnIndex = loaded.index;
  if(!learnIndex){
    $("field-picker").textContent = "";
    content.appendChild(el("p", "load-error", "학습 데이터를 불러오지 못했습니다. 네트워크 상태를 확인하고 새로고침해주세요."));
    return;
  }
  LearnPicker.render($("field-picker"), {
    index: learnIndex,
    popularFields: loaded.popularFields,
    groups: typeof CATEGORY_GROUPS !== "undefined" ? CATEGORY_GROUPS : [],
    selected: "",
    onSelect: code => { scrollAfter = true; location.hash = code; }
  });
  window.addEventListener("hashchange", applyHash);
  applyHash();
  // 로그인 확인은 화면을 막지 않게 뒤에서 하고, 끝나면 서버 진도로 다시 그린다.
  await initAuth();
  if(session && field) render();
}

init();
