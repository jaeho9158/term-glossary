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

const { data, error: loadError } = await supabase
  .from("tg_bookmarks")
  .select("id")
  .eq("user_id", userId)
  .eq("term_slug", slug)
  .maybeSingle();

if (loadError) {
  console.error("북마크 조회 실패:", loadError);
  return;
}

bookmarked = !!data;
btn.hidden = false;
render();

btn.addEventListener("click", async () => {
  btn.disabled = true;

  try {
    if (bookmarked) {
      const { error: deleteError } = await supabase
        .from("tg_bookmarks")
        .delete()
        .eq("user_id", userId)
        .eq("term_slug", slug);

      if (deleteError) throw deleteError;

      bookmarked = false;
    } else {
      const { error: insertError } = await supabase
        .from("tg_bookmarks")
        .insert({
          user_id: userId,
          term_slug: slug,
          term_title: title,
        });

      if (insertError) throw insertError;

      bookmarked = true;
    }

    render();
  } catch (error) {
    console.error("북마크 변경 실패:", error);
    alert("즐겨찾기 처리 중 오류가 발생했습니다.");
  } finally {
    btn.disabled = false;
  }
  });
});
