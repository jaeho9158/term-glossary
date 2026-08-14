import { supabase, getSession } from "./auth.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return iso;
  }
}

let termsCache = null;
async function loadTermsMap() {
  if (termsCache) return termsCache;
  const res = await fetch("terms.json");
  const list = await res.json();
  termsCache = new Map(list.map((t) => [t.slug, t]));
  return termsCache;
}

function rowHTML(row) {
  const badge = row.item_type === "term" ? "용어" : "논문";
  const title = row.item_type === "term"
    ? `<a href="terms/${encodeURIComponent(row.item_key)}.html">${escapeHtml(row.item_title)}</a>`
    : escapeHtml(row.item_title);

  return `<li class="history-item" data-id="${row.id}">
    <span class="history-badge history-badge-${row.item_type}">${badge}</span>
    <span class="history-title">${title}</span>
    <span class="history-time">${formatDate(row.viewed_at)}</span>
    <button type="button" class="history-delete-btn" data-id="${row.id}">삭제</button>
  </li>`;
}

async function loadHistory(userId) {
  const listEl = document.getElementById("history-list");
  const emptyEl = document.getElementById("history-empty");

  const { data, error } = await supabase
    .from("tg_reading_history")
    .select("*")
    .eq("user_id", userId)
    .order("viewed_at", { ascending: false });

  if (error || !data || data.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  listEl.innerHTML = data.map(rowHTML).join("");
}

function bookmarkRowHTML(row, tags) {
  const tagChips = (tags || [])
    .map(
      (t) =>
        `<span class="bookmark-tag-chip" data-tag-id="${t.id}">${escapeHtml(t.tag)}<button type="button" class="bookmark-tag-remove" data-tag-id="${t.id}" aria-label="태그 삭제">×</button></span>`
    )
    .join("");

  return `<li class="history-item bookmark-item" data-id="${row.id}" data-slug="${escapeHtml(row.term_slug)}">
    <span class="history-badge history-badge-term">용어</span>
    <span class="history-title"><a href="terms/${encodeURIComponent(row.term_slug)}.html">${escapeHtml(row.term_title)}</a></span>
    <span class="history-time">${formatDate(row.created_at)}</span>
    <div class="bookmark-tags" data-bookmark-id="${row.id}">
      ${tagChips}
      <button type="button" class="bookmark-tag-add-btn" data-bookmark-id="${row.id}">+ 태그</button>
      <input type="text" class="bookmark-tag-input" data-bookmark-id="${row.id}" placeholder="태그 입력 후 Enter" hidden maxlength="30">
    </div>
    <button type="button" class="history-delete-btn" data-id="${row.id}">삭제</button>
  </li>`;
}

let allBookmarks = [];
let allTagsByBookmark = new Map();
let activeCategory = "";
let activeTags = new Set();

function renderBookmarkList(termsMap) {
  const listEl = document.getElementById("bookmark-list");
  const emptyEl = document.getElementById("bookmark-empty");

  const filtered = allBookmarks.filter((row) => {
    if (activeCategory) {
      const term = termsMap.get(row.term_slug);
      if (!term || !(term.categories || []).includes(activeCategory)) return false;
    }
    if (activeTags.size > 0) {
      const tags = (allTagsByBookmark.get(row.id) || []).map((t) => t.tag);
      const hasAll = [...activeTags].every((t) => tags.includes(t));
      if (!hasAll) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    emptyEl.textContent =
      activeCategory || activeTags.size > 0
        ? "조건에 맞는 즐겨찾기가 없습니다."
        : "아직 즐겨찾기한 용어가 없습니다.";
    return;
  }
  emptyEl.hidden = true;
  listEl.innerHTML = filtered
    .map((row) => bookmarkRowHTML(row, allTagsByBookmark.get(row.id)))
    .join("");
}

async function loadBookmarks(userId) {
  const listEl = document.getElementById("bookmark-list");
  const emptyEl = document.getElementById("bookmark-empty");
  const filtersEl = document.getElementById("bookmark-filters");

  const { data, error } = await supabase
    .from("tg_bookmarks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    if (filtersEl) filtersEl.hidden = true;
    return;
  }

  allBookmarks = data;

  const { data: tagRows } = await supabase
    .from("tg_bookmark_tags")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  allTagsByBookmark = new Map();
  (tagRows || []).forEach((t) => {
    if (!allTagsByBookmark.has(t.bookmark_id)) allTagsByBookmark.set(t.bookmark_id, []);
    allTagsByBookmark.get(t.bookmark_id).push(t);
  });

  const termsMap = await loadTermsMap();

  const categorySelect = document.getElementById("bookmark-category-filter");
  if (categorySelect) {
    const labels = window.CATEGORY_LABELS || {};
    const seenCategories = new Set();
    data.forEach((row) => {
      const term = termsMap.get(row.term_slug);
      (term?.categories || []).forEach((c) => seenCategories.add(c));
    });
    categorySelect.innerHTML =
      '<option value="">전체 카테고리</option>' +
      [...seenCategories]
        .map((c) => `<option value="${c}">${escapeHtml(labels[c] || c)}</option>`)
        .join("");
  }

  const tagFilterEl = document.getElementById("bookmark-tag-filter");
  if (tagFilterEl) {
    const seenTags = new Set();
    (tagRows || []).forEach((t) => seenTags.add(t.tag));
    tagFilterEl.innerHTML = [...seenTags]
      .map(
        (tag) =>
          `<button type="button" class="bookmark-tag-filter-chip" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
      )
      .join("");
  }

  if (filtersEl) filtersEl.hidden = false;
  renderBookmarkList(termsMap);
}

document.addEventListener("DOMContentLoaded", async () => {
  const loggedOutEl = document.getElementById("history-logged-out");
  const loggedInEl = document.getElementById("history-logged-in");
  if (!loggedOutEl || !loggedInEl) return;

  const session = await getSession();
  if (!session) {
    loggedOutEl.hidden = false;
    loggedInEl.hidden = true;
    return;
  }

  loggedOutEl.hidden = true;
  loggedInEl.hidden = false;

  const userId = session.user.id;
  await loadHistory(userId);
  await loadBookmarks(userId);

  document.getElementById("history-list").addEventListener("click", async (e) => {
    const btn = e.target.closest(".history-delete-btn");
    if (!btn) return;
    const id = btn.dataset.id;
    btn.disabled = true;
    const { error } = await supabase.from("tg_reading_history").delete().eq("id", id);
    if (!error) {
      btn.closest(".history-item").remove();
      const listEl = document.getElementById("history-list");
      if (listEl.children.length === 0) {
        document.getElementById("history-empty").hidden = false;
      }
    } else {
      btn.disabled = false;
    }
  });

  const categoryFilterEl = document.getElementById("bookmark-category-filter");
  if (categoryFilterEl) {
    categoryFilterEl.addEventListener("change", async (e) => {
      activeCategory = e.target.value;
      renderBookmarkList(await loadTermsMap());
    });
  }

  const tagFilterEl = document.getElementById("bookmark-tag-filter");
  if (tagFilterEl) {
    tagFilterEl.addEventListener("click", async (e) => {
      const chip = e.target.closest(".bookmark-tag-filter-chip");
      if (!chip) return;
      const tag = chip.dataset.tag;
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
        chip.classList.remove("is-active");
      } else {
        activeTags.add(tag);
        chip.classList.add("is-active");
      }
      renderBookmarkList(await loadTermsMap());
    });
  }

  document.getElementById("bookmark-list").addEventListener("click", async (e) => {
    const delBtn = e.target.closest(".history-delete-btn");
    if (delBtn) {
      const id = delBtn.dataset.id;
      delBtn.disabled = true;
      const { error } = await supabase.from("tg_bookmarks").delete().eq("id", id);
      if (!error) {
        allBookmarks = allBookmarks.filter((b) => b.id !== id);
        renderBookmarkList(await loadTermsMap());
      } else {
        delBtn.disabled = false;
      }
      return;
    }

    const addBtn = e.target.closest(".bookmark-tag-add-btn");
    if (addBtn) {
      const input = document.querySelector(
        `.bookmark-tag-input[data-bookmark-id="${addBtn.dataset.bookmarkId}"]`
      );
      addBtn.hidden = true;
      input.hidden = false;
      input.focus();
      return;
    }

    const removeTagBtn = e.target.closest(".bookmark-tag-remove");
    if (removeTagBtn) {
      const tagId = removeTagBtn.dataset.tagId;
      removeTagBtn.disabled = true;
      const { error } = await supabase.from("tg_bookmark_tags").delete().eq("id", tagId);
      if (!error) {
        for (const [bmId, tags] of allTagsByBookmark) {
          allTagsByBookmark.set(bmId, tags.filter((t) => t.id !== tagId));
        }
        renderBookmarkList(await loadTermsMap());
      }
      return;
    }
  });

  document.getElementById("bookmark-list").addEventListener("keydown", async (e) => {
    const input = e.target.closest(".bookmark-tag-input");
    if (!input || e.key !== "Enter") return;
    const tag = input.value.trim();
    if (!tag) return;
    input.disabled = true;
    const { data, error } = await supabase
      .from("tg_bookmark_tags")
      .insert({ bookmark_id: input.dataset.bookmarkId, user_id: userId, tag })
      .select()
      .single();
    if (!error && data) {
      const bmId = input.dataset.bookmarkId;
      if (!allTagsByBookmark.has(bmId)) allTagsByBookmark.set(bmId, []);
      allTagsByBookmark.get(bmId).push(data);
      renderBookmarkList(await loadTermsMap());
    }
    input.disabled = false;
    input.value = "";
  });
});
