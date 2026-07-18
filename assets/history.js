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
});
