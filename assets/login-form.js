import { signIn, getSession } from "./auth.js";

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("login-form");
  if (!form) return;

  const session = await getSession();
  if (session) {
    window.location.href = "index.html";
    return;
  }

  const statusEl = document.getElementById("login-status");
  const submitBtn = document.getElementById("login-submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    if (!email || !password) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "로그인 중...";
    statusEl.textContent = "";
    statusEl.className = "";

    try {
      const { error } = await signIn(email, password);
      if (error) throw error;

      statusEl.textContent = "로그인되었습니다. 이동 중...";
      statusEl.className = "contact-status-success";
      window.location.href = "index.html";
    } catch (err) {
      statusEl.textContent = "로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.";
      statusEl.className = "contact-status-error";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "로그인";
    }
  });
});
