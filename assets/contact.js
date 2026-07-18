import { supabase } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  if (!form) return;

  const statusEl = document.getElementById("contact-status");
  const submitBtn = document.getElementById("contact-submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("contact-name").value.trim();
    const email = document.getElementById("contact-email").value.trim();
    const message = document.getElementById("contact-message").value.trim();
    if (!message) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "보내는 중...";
    statusEl.textContent = "";
    statusEl.className = "";

    try {
      const { error } = await supabase.from("tg_contact_messages").insert({
        name: name || null,
        email: email || null,
        message,
      });

      if (error) throw error;

      form.reset();
      statusEl.textContent = "문의가 접수되었습니다. 감사합니다!";
      statusEl.className = "contact-status-success";
    } catch (err) {
      statusEl.textContent = "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      statusEl.className = "contact-status-error";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "보내기";
    }
  });
});
