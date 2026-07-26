import { supabase, getSession } from "./auth.js";

document.addEventListener("DOMContentLoaded", async () => {
  const btn = document.getElementById("bookmark-btn");
  if (!btn) return;

  const session = await getSession();
  if (!session) return;

  const h1 = document.querySelector("main h1");
  const title = h1 ? h1.textContent.trim() : document.title;

  const path = window.location.pathname;
  const file = path.substring(path.lastIndexOf("/") + 1);
  const slug = file.replace(/\.html?$/i, "");
  if (!slug) return;

  const userId = session.user.id;
  const iconEl = btn.querySelector(".bookmark-icon");
  const labelEl = btn.querySelector(".bookmark-label");
  let bookmarked = false;

  function render() {
    btn.classList.toggle("is-bookmarked", bookmarked);
    iconEl.textContent = bookmarked ? "★" : "☆";
    labelEl.textContent = bookmarked ? "즐겨찾기됨" : "즐겨찾기";
  }

  const { data } = await supabase
    .from("tg_bookmarks")
    .select("id")
    .eq("user_id", userId)
    .eq("term_slug", slug)
    .maybeSingle();

  bookmarked = !!data;
  btn.hidden = false;
  render();

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    if (bookmarked) {
      await supabase
        .from("tg_bookmarks")
        .delete()
        .eq("user_id", userId)
        .eq("term_slug", slug);
      bookmarked = false;
    } else {
      await supabase
        .from("tg_bookmarks")
        .insert({ user_id: userId, term_slug: slug, term_title: title });
      bookmarked = true;
    }
    render();
    btn.disabled = false;
  });
});
