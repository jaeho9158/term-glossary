import { signUp, getSession } from "./auth.js";

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("signup-form");
  if (!form) return;

  const session = await getSession();
  if (session) {
    window.location.href = "index.html";
    return;
  }

  const statusEl = document.getElementById("signup-status");
  const submitBtn = document.getElementById("signup-submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    if (!email || !password) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "가입 중...";
    statusEl.textContent = "";
    statusEl.className = "";

    try {
      const { data, error } = await signUp(email, password);
      if (error) throw error;

      form.reset();
      if (data?.session) {
        statusEl.textContent = "회원가입이 완료되었습니다. 이동 중...";
        statusEl.className = "contact-status-success";
        window.location.href = "index.html";
      } else {
        statusEl.textContent = "회원가입이 접수되었습니다. 이메일을 확인해 인증을 완료해 주세요.";
        statusEl.className = "contact-status-success";
      }
    } catch (err) {
      statusEl.textContent = "회원가입에 실패했습니다. " + (err?.message || "잠시 후 다시 시도해 주세요.");
      statusEl.className = "contact-status-error";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "회원가입";
    }
  });
});
