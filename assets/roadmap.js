import { supabase, getSession } from "./auth.js";
import { openFlashcards } from "./flashcards.js";

const LOCAL_KEY = "roadmap_progress_v1";
const deckMap = new Map();

// escapeHtml은 assets/escape.js(전역)를 사용한다 — 페이지가 먼저 로드함.
function getLocalProgress() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"));
  } catch (e) {
    return new Set();
  }
}

function setLocalProgress(set) {
  // 프라이빗 모드·쿼터 초과에서 setItem이 throw — 조용히 넘긴다.
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify([...set]));
  } catch (e) { /* 저장 실패는 무시 */ }
}

function topoSort(terms) {
  const bySlug = new Map(terms.map((t) => [t.slug, t]));
  const visited = new Set();
  const result = [];

  function visit(slug, stack) {
    if (visited.has(slug) || !bySlug.has(slug) || stack.has(slug)) return;
    stack.add(slug);
    const t = bySlug.get(slug);
    for (const p of t.prerequisites || []) {
      visit(p, stack);
    }
    stack.delete(slug);
    if (!visited.has(slug)) {
      visited.add(slug);
      result.push(t);
    }
  }

  const ordered = [...terms].sort((a, b) => (a.difficulty || 3) - (b.difficulty || 3));
  for (const t of ordered) visit(t.slug, new Set());
  return result;
}

document.addEventListener("DOMContentLoaded", async () => {
  const select = document.getElementById("roadmap-category-select");
  const content = document.getElementById("roadmap-content");
  if (!select || !content) return;

  let terms;
  try {
    const res = await fetch("terms.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    terms = await res.json();
  } catch (err) {
    console.error("terms.json 로드 실패:", err);
    content.innerHTML =
      '<p class="load-error">용어 데이터를 불러오지 못했습니다. 네트워크 상태를 확인하고 새로고침해주세요.</p>';
    return;
  }
  const labels = window.CATEGORY_LABELS || {};

  const catSet = new Set();
  terms.forEach((t) => (t.categories || []).forEach((c) => catSet.add(c)));
  select.innerHTML +=
    [...catSet]
      .sort()
      .map((c) => `<option value="${c}">${escapeHtml(labels[c] || c)}</option>`)
      .join("");

  const session = await getSession();
  let remoteProgress = new Set();
  if (session) {
    const { data } = await supabase
      .from("tg_roadmap_progress")
      .select("term_slug")
      .eq("user_id", session.user.id);
    remoteProgress = new Set((data || []).map((r) => r.term_slug));

    const local = getLocalProgress();
    const toMigrate = [...local].filter((slug) => !remoteProgress.has(slug));
    if (toMigrate.length > 0) {
      await supabase
        .from("tg_roadmap_progress")
        .insert(toMigrate.map((term_slug) => ({ user_id: session.user.id, term_slug })));
      toMigrate.forEach((slug) => remoteProgress.add(slug));
      localStorage.removeItem(LOCAL_KEY);
    }
  }

  function isDone(slug) {
    return session ? remoteProgress.has(slug) : getLocalProgress().has(slug);
  }

  async function toggleDone(slug, checked) {
    if (session) {
      if (checked) {
        await supabase
          .from("tg_roadmap_progress")
          .insert({ user_id: session.user.id, term_slug: slug });
        remoteProgress.add(slug);
      } else {
        await supabase
          .from("tg_roadmap_progress")
          .delete()
          .eq("user_id", session.user.id)
          .eq("term_slug", slug);
        remoteProgress.delete(slug);
      }
    } else {
      const local = getLocalProgress();
      if (checked) local.add(slug);
      else local.delete(slug);
      setLocalProgress(local);
    }
  }

  function render(category) {
    if (!category) {
      content.innerHTML = "";
      return;
    }
    const inCategory = terms.filter((t) => (t.categories || []).includes(category));
    const bySubcat = new Map();
    inCategory.forEach((t) => {
      const sub = t.subcategory || "미분류";
      if (!bySubcat.has(sub)) bySubcat.set(sub, []);
      bySubcat.get(sub).push(t);
    });

    deckMap.clear();
    content.innerHTML = [...bySubcat.entries()]
      .map(([sub, list]) => {
        const sorted = topoSort(list);
        deckMap.set(sub, sorted);
        const doneCount = sorted.filter((t) => isDone(t.slug)).length;
        const pct = Math.round((doneCount / sorted.length) * 100);
        const items = sorted
          .map(
            (t) => `<li class="roadmap-item">
              <label>
                <input type="checkbox" class="roadmap-checkbox" data-slug="${t.slug}" ${isDone(t.slug) ? "checked" : ""}>
                <span class="roadmap-difficulty roadmap-difficulty-${t.difficulty || 3}">Lv${t.difficulty || 3}</span>
                <a href="terms/${encodeURIComponent(t.slug)}.html">${escapeHtml(t.title_ko || t.slug)}</a>
              </label>
            </li>`
          )
          .join("");
        return `<section class="roadmap-subcat">
          <h2>${escapeHtml(sub)} <span class="roadmap-progress-label">${doneCount}/${sorted.length} (${pct}%)</span>
            <button type="button" class="flashcard-start-btn" data-subcat="${escapeHtml(sub)}">🃏 플래시카드로 암기</button>
          </h2>
          <div class="roadmap-progress-bar"><div class="roadmap-progress-fill" style="width:${pct}%"></div></div>
          <ul class="roadmap-list">${items}</ul>
        </section>`;
      })
      .join("");
  }

  select.addEventListener("change", () => render(select.value));

  content.addEventListener("change", async (e) => {
    const cb = e.target.closest(".roadmap-checkbox");
    if (!cb) return;
    await toggleDone(cb.dataset.slug, cb.checked);
    render(select.value);
  });

  content.addEventListener("click", (e) => {
    const btn = e.target.closest(".flashcard-start-btn");
    if (!btn) return;
    const deck = deckMap.get(btn.dataset.subcat);
    if (!deck || deck.length === 0) return;
    openFlashcards(btn.dataset.subcat, deck);
  });
});
