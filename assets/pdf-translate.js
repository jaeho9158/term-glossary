// assets/pdf-translate.js — PDF 뷰어 번역 UI. viewer.js와는 initTranslation(deps)의
// 함수 몇 개로만 만난다. viewer 내부 변수를 직접 읽지 않는다.
import { supabase, getSession } from "./auth.js";

const core = globalThis.TranslateCore;

// 함수 호출. 상태별로 분기하기 쉽게 {ok,status,body}로 정규화한다.
async function callTranslate(payload) {
  const { data, error } = await supabase.functions.invoke("translate", { body: payload });
  if (!error) return { ok: true, status: 200, body: data };
  const res = error.context; // FunctionsHttpError.context = Response
  let body = null;
  try { body = res ? await res.json() : null; } catch { /* 본문 없음 */ }
  return { ok: false, status: res ? res.status : 0, body };
}

export function initTranslation(deps) {
  const $ = (id) => document.getElementById(id);
  const tabBtn = $("tab-btn-translate");
  const startBtn = $("tr-start-btn");
  const stopBtn = $("tr-stop-btn");
  const progressEl = $("tr-progress");
  const usageEl = $("tr-usage");
  const statusEl = $("tr-status");
  const pagesEl = $("tr-pages");
  if (!startBtn || !pagesEl) return { onPdfLoaded() {}, onPdfCleared() {}, onVisiblePage() {} };

  let running = false;
  let stopRequested = false;
  let glossary = {};
  let exactIndex = null;

  function setStatus(html) {
    if (!html) { statusEl.hidden = true; statusEl.innerHTML = ""; return; }
    statusEl.hidden = false;
    statusEl.innerHTML = html;
  }
  function setUsage(u) {
    if (!u) { usageEl.hidden = true; return; }
    usageEl.hidden = false;
    usageEl.textContent = `오늘 ${u.pagesUsed} / ${u.pageLimit}페이지`;
  }
  function setProgress(done, total) {
    if (!total) { progressEl.hidden = true; return; }
    progressEl.hidden = false;
    progressEl.textContent = `${done} / ${total}페이지`;
  }

  async function ensureIndex() {
    if (exactIndex) return exactIndex;
    const terms = await deps.getTerms();
    exactIndex = buildExactIndex(terms);
    return exactIndex;
  }

  // 번역문 → 사전 용어 링크 HTML. 이스케이프는 linkTerms 안에서 전부 처리한다.
  async function toLinkedHtml(text) {
    const idx = await ensureIndex();
    return core.linkTerms(text, matchTermsWithIndex(text, idx), escapeHtml, "terms/");
  }

  function pageBlock(n) {
    let el = pagesEl.querySelector(`[data-page="${n}"]`);
    if (el) return el;
    el = document.createElement("section");
    el.className = "tr-page";
    el.dataset.page = String(n);
    el.innerHTML = `<div class="tr-page-head"><span>p.${n}</span></div><div class="tr-page-body"></div>`;
    pagesEl.appendChild(el);
    return el;
  }

  async function translatePage(n) {
    const text = deps.getPageText(n);
    const block = pageBlock(n);
    const body = block.querySelector(".tr-page-body");
    if (!text || !text.trim()) { body.textContent = "(이 페이지에는 추출된 텍스트가 없어요)"; return "empty"; }
    if (!core.isLikelyEnglish(text)) { body.textContent = "영어 논문만 지원해요."; return "skipped"; }
    body.textContent = "번역 중…";

    const r = await callTranslate({ mode: "page", docHash: deps.getDocHash(), page: n, text, glossary });
    if (r.ok && r.body.skipped) { body.textContent = "영어 논문만 지원해요."; return "skipped"; }
    if (r.ok) {
      glossary = core.mergeGlossary(glossary, r.body.glossary);
      body.innerHTML = await toLinkedHtml(r.body.translated);
      if (r.body.cached) block.querySelector(".tr-page-head").insertAdjacentHTML("beforeend", '<span class="tr-cached">캐시됨</span>');
      setUsage(r.body.usage);
      return "ok";
    }
    if (r.status === 401) { setStatus('로그인하면 하루 30페이지까지 번역할 수 있어요. <a href="login.html">로그인</a>'); return "auth"; }
    if (r.status === 429) {
      setUsage(r.body && r.body.usage);
      setStatus("오늘 한도를 다 썼어요. 내일 0시에 다시 열려요.");
      body.textContent = "오늘 한도 초과";
      return "quota";
    }
    body.innerHTML = `<span class="tr-page-error">번역에 실패했어요.<button type="button" class="tr-btn tr-retry">다시 시도</button></span>`;
    body.querySelector(".tr-retry").addEventListener("click", () => translatePage(n));
    return "error";
  }

  async function runAll() {
    if (running) return;
    const session = await getSession();
    if (!session) { setStatus('로그인하면 하루 30페이지까지 번역할 수 있어요. <a href="login.html">로그인</a>'); return; }
    const total = deps.getPageCount();
    if (!total) return;
    running = true; stopRequested = false;
    startBtn.hidden = true; stopBtn.hidden = false;
    setStatus("");
    let done = 0;
    for (let n = 1; n <= total; n++) {
      if (stopRequested) break;
      setProgress(done, total);
      const result = await translatePage(n);
      done++;
      if (result === "auth" || result === "quota") break;
    }
    setProgress(done, total);
    running = false;
    stopBtn.hidden = true;
    startBtn.hidden = false;
    startBtn.textContent = done >= total ? "다시 번역하기" : "이어서 번역하기";
  }

  startBtn.addEventListener("click", runAll);
  stopBtn.addEventListener("click", () => { stopRequested = true; });

  // ---- 선택 번역: 드래그 → 툴바 '번역' → 팝오버 ----
  const hlBtn = $("hl-translate-btn");
  const pop = $("tr-popover");
  const popSource = $("tr-popover-source");
  const popResult = $("tr-popover-result");
  const popClose = $("tr-popover-close");

  function hidePopover() { if (pop) pop.hidden = true; }
  function showPopoverAt(rect) {
    pop.hidden = false;
    const top = Math.min(rect.bottom + 8, window.innerHeight - pop.offsetHeight - 8);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - pop.offsetWidth - 8);
    pop.style.top = `${Math.max(8, top)}px`;
    pop.style.left = `${left}px`;
  }

  async function translateSelection() {
    const sel = deps.getPendingSelection();
    if (!sel || !sel.quoteText) return;
    const rect = sel.range.getBoundingClientRect();
    deps.hideHighlightToolbar();
    const text = core.truncateSelection(sel.quoteText, 2000);
    popSource.textContent = text.length > 160 ? text.slice(0, 160) + "…" : text;
    popResult.textContent = "번역 중…";
    showPopoverAt(rect);

    const session = await getSession();
    if (!session) { popResult.innerHTML = '로그인하면 선택 번역을 쓸 수 있어요. <a href="login.html">로그인</a>'; return; }
    if (!core.isLikelyEnglish(text)) { popResult.textContent = "영어 문장만 번역할 수 있어요."; return; }

    const r = await callTranslate({ mode: "selection", text });
    if (r.ok && r.body.skipped) { popResult.textContent = "영어 문장만 번역할 수 있어요."; return; }
    if (r.ok) { popResult.innerHTML = await toLinkedHtml(r.body.translated); return; }
    if (r.status === 401) { popResult.innerHTML = '로그인하면 선택 번역을 쓸 수 있어요. <a href="login.html">로그인</a>'; return; }
    if (r.status === 429) { popResult.textContent = "오늘 선택 번역 한도를 다 썼어요. 내일 0시에 다시 열려요."; return; }
    popResult.textContent = "번역에 실패했어요. 잠시 후 다시 시도해 주세요.";
  }

  if (hlBtn) hlBtn.addEventListener("mousedown", (e) => e.preventDefault()); // 선택 해제 방지
  if (hlBtn) hlBtn.addEventListener("click", translateSelection);
  if (popClose) popClose.addEventListener("click", hidePopover);
  document.addEventListener("mousedown", (e) => {
    if (pop && !pop.hidden && !pop.contains(e.target) && e.target !== hlBtn) hidePopover();
  });

  return {
    onPdfLoaded() {
      if (tabBtn) tabBtn.hidden = false;
      pagesEl.innerHTML = "";
      glossary = {};
      startBtn.textContent = "이 논문 번역하기";
      setProgress(0, 0); setUsage(null); setStatus("");
    },
    onPdfCleared() {
      if (tabBtn) tabBtn.hidden = true;
      pagesEl.innerHTML = "";
      stopRequested = true;
    },
    // PDF 스크롤에 맞춰 해당 페이지 블록으로 따라간다.
    onVisiblePage(n) {
      pagesEl.querySelectorAll(".tr-page.is-current").forEach((el) => el.classList.remove("is-current"));
      const el = pagesEl.querySelector(`[data-page="${n}"]`);
      if (el) { el.classList.add("is-current"); el.scrollIntoView({ block: "nearest" }); }
    },
  };
}
