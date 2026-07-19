import { supabase, getSession } from "./auth.js";

document.addEventListener("DOMContentLoaded", async () => {
  const session = await getSession();
  if (!session) return;

  const h1 = document.querySelector("main h1");
  const title = h1 ? h1.textContent.trim() : document.title;

  const path = window.location.pathname;
  const file = path.substring(path.lastIndexOf("/") + 1);
  const slug = file.replace(/\.html?$/i, "");
  if (!slug) return;

  await supabase.from("tg_reading_history").insert({
    user_id: session.user.id,
    item_type: "term",
    item_key: slug,
    item_title: title,
  });
});
