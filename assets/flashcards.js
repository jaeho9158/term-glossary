import { supabase, getSession } from "./auth.js";

const LOCAL_KEY = "flashcard_progress_v1";

// escapeHtml은 assets/escape.js(전역)를 사용한다 — 페이지가 먼저 로드함.
function getLocalProgress() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

function setLocalProgress(obj) {
  // 프라이빗 모드·쿼터 초과에서 setItem이 throw — 진행 저장 실패로 학습
  // 흐름 자체가 죽으면 안 되므로 조용히 넘긴다 (읽기 쪽과 동일한 방침).
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(obj));
  } catch (e) { /* 저장 실패는 무시 */ }
}

let overlayEl = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.className = "flashcard-overlay";
  overlayEl.id = "flashcard-overlay";
  overlayEl.hidden = true;
  overlayEl.innerHTML = `<div class="flashcard-panel" role="dialog" aria-modal="true">
    <button type="button" class="flashcard-close-btn" aria-label="닫기">×</button>
    <div id="flashcard-body"></div>
  </div>`;
  document.body.appendChild(overlayEl);
  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) closeOverlay();
  });
  overlayEl.querySelector(".flashcard-close-btn").addEventListener("click", closeOverlay);
  document.addEventListener("keydown", (e) => {
    if (!overlayEl.hidden && e.key === "Escape") closeOverlay();
  });
  return overlayEl;
}

function closeOverlay() {
  if (overlayEl) overlayEl.hidden = true;
}

/**
 * Opens the flashcard study session for a subcategory.
 * @param {string} subcatLabel - display name for the subcategory
 * @param {Array<{slug:string, title_ko?:string, title_en?:string, definition:string}>} deck
 */
export async function openFlashcards(subcatLabel, deck) {
  ensureOverlay();
  overlayEl.hidden = false;

  const session = await getSession();
  let remoteStatus = new Map();
  if (session) {
    const { data } = await supabase
      .from("tg_flashcard_progress")
      .select("term_slug, status")
      .eq("user_id", session.user.id);
    remoteStatus = new Map((data || []).map((r) => [r.term_slug, r.status]));
  }

  async function saveStatus(slug, status) {
    if (session) {
      await supabase
        .from("tg_flashcard_progress")
        .upsert(
          { user_id: session.user.id, term_slug: slug, status, updated_at: new Date().toISOString() },
          { onConflict: "user_id,term_slug" }
        );
      remoteStatus.set(slug, status);
    } else {
      const local = getLocalProgress();
      local[slug] = status;
      setLocalProgress(local);
    }
  }

  let fullDeck = deck;
  let cards = deck;
  let index = 0;
  let flipped = false;
  const judged = new Map(); // slug -> 'known'|'unknown' for this session
  let showingUnknownOnly = false;

  const bodyEl = overlayEl.querySelector("#flashcard-body");

  function renderCard() {
    const card = cards[index];
    const face = flipped
      ? `<span class="flashcard-face-label">정의</span>${escapeHtml(card.definition || "정의 없음")}`
      : `<span class="flashcard-face-label">용어</span>${escapeHtml(card.title_ko || card.slug)}${
          card.title_en ? ` <span style="opacity:.6">(${escapeHtml(card.title_en)})</span>` : ""
        }`;

    bodyEl.innerHTML = `
      <div class="flashcard-topbar">
        <span class="flashcard-progress-text">${subcatLabel} · ${index + 1} / ${cards.length}</span>
        <button type="button" class="flashcard-unknown-toggle${showingUnknownOnly ? " is-active" : ""}" id="fc-unknown-toggle">
          모르는 것만 보기
        </button>
      </div>
      <div class="flashcard-card" id="fc-card">${face}</div>
      <div class="flashcard-judge">
        <button type="button" class="flashcard-judge-known" id="fc-known" ${flipped ? "" : "disabled"}>✅ 안다</button>
        <button type="button" class="flashcard-judge-unknown" id="fc-unknown" ${flipped ? "" : "disabled"}>❌ 모른다</button>
      </div>
      <div class="flashcard-nav">
        <button type="button" id="fc-prev" ${index === 0 ? "disabled" : ""}>← 이전</button>
        <button type="button" id="fc-next">${index === cards.length - 1 ? "결과 보기 →" : "다음 →"}</button>
      </div>
    `;

    bodyEl.querySelector("#fc-card").addEventListener("click", () => {
      flipped = !flipped;
      renderCard();
    });
    bodyEl.querySelector("#fc-prev").addEventListener("click", () => {
      if (index === 0) return;
      index -= 1;
      flipped = false;
      renderCard();
    });
    bodyEl.querySelector("#fc-next").addEventListener("click", () => {
      if (index === cards.length - 1) {
        renderSummary();
        return;
      }
      index += 1;
      flipped = false;
      renderCard();
    });
    bodyEl.querySelector("#fc-known").addEventListener("click", async () => {
      judged.set(card.slug, "known");
      await saveStatus(card.slug, "known");
      advanceAfterJudge();
    });
    bodyEl.querySelector("#fc-unknown").addEventListener("click", async () => {
      judged.set(card.slug, "unknown");
      await saveStatus(card.slug, "unknown");
      advanceAfterJudge();
    });
    bodyEl.querySelector("#fc-unknown-toggle").addEventListener("click", () => {
      showingUnknownOnly = !showingUnknownOnly;
      if (showingUnknownOnly) {
        const unknownSlugs = new Set(
          [...judged.entries()].filter(([, s]) => s === "unknown").map(([slug]) => slug)
        );
        cards = fullDeck.filter((c) => unknownSlugs.has(c.slug));
        if (cards.length === 0) {
          showingUnknownOnly = false;
          cards = fullDeck;
        }
      } else {
        cards = fullDeck;
      }
      index = 0;
      flipped = false;
      renderCard();
    });
  }

  function advanceAfterJudge() {
    if (index === cards.length - 1) {
      renderSummary();
      return;
    }
    index += 1;
    flipped = false;
    renderCard();
  }

  function renderSummary() {
    const knownCount = [...judged.values()].filter((s) => s === "known").length;
    const unknownCount = [...judged.values()].filter((s) => s === "unknown").length;
    const unknownSlugs = [...judged.entries()].filter(([, s]) => s === "unknown").map(([slug]) => slug);

    bodyEl.innerHTML = `
      <div class="flashcard-summary">
        <h3>${escapeHtml(subcatLabel)} 학습 완료</h3>
        <p class="flashcard-summary-score">✅ ${knownCount} · ❌ ${unknownCount}</p>
        <div class="flashcard-summary-actions">
          ${unknownCount > 0 ? `<button type="button" id="fc-retry-unknown">🃏 모르는 것만 다시 보기</button>` : ""}
          <button type="button" class="flashcard-quiz-btn" id="fc-go-quiz">📝 이 범위로 퀴즈 풀기</button>
          <button type="button" id="fc-close-summary">닫기</button>
        </div>
      </div>
    `;

    const retryBtn = bodyEl.querySelector("#fc-retry-unknown");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        cards = fullDeck.filter((c) => unknownSlugs.includes(c.slug));
        index = 0;
        flipped = false;
        judged.clear();
        renderCard();
      });
    }

    bodyEl.querySelector("#fc-go-quiz").addEventListener("click", () => {
      const slugs = fullDeck.map((c) => c.slug);
      sessionStorage.setItem("quiz_scope_slugs", JSON.stringify(slugs));
      sessionStorage.setItem("quiz_scope_label", subcatLabel);
      location.href = "quiz.html?scope=roadmap";
    });

    bodyEl.querySelector("#fc-close-summary").addEventListener("click", closeOverlay);
  }

  renderCard();
}
