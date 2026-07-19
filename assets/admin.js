const FUNCTION_URL = "https://schdtmdpgexsacxzozso.supabase.co/functions/v1/tg-admin-messages";
const SESSION_KEY = "tg_admin_code";

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("admin-login-form");
  const loginStatus = document.getElementById("admin-login-status");
  const loginBtn = document.getElementById("admin-login-btn");
  const panel = document.getElementById("admin-panel");
  const list = document.getElementById("admin-message-list");
  const logoutBtn = document.getElementById("admin-logout-btn");

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString("ko-KR");
    } catch {
      return iso;
    }
  }

  function renderMessages(messages) {
    list.innerHTML = "";
    if (!messages.length) {
      list.innerHTML = "<li class=\"admin-message-empty\">아직 접수된 문의가 없습니다.</li>";
      return;
    }
    for (const msg of messages) {
      const li = document.createElement("li");
      li.className = "admin-message-item" + (msg.is_read ? " is-read" : " is-unread");
      li.dataset.id = msg.id;

      const meta = document.createElement("p");
      meta.className = "admin-message-meta";
      meta.textContent = `${msg.name || "이름 없음"} · ${msg.email || "이메일 없음"} · ${formatDate(msg.created_at)} · ${msg.is_read ? "읽음" : "안읽음"}`;

      const body = document.createElement("p");
      body.className = "admin-message-body";
      body.textContent = msg.message;

      li.appendChild(meta);
      li.appendChild(body);

      if (!msg.is_read) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "admin-mark-read-btn";
        btn.textContent = "읽음 처리";
        btn.addEventListener("click", () => markRead(msg.id, li, meta, msg));
        li.appendChild(btn);
      }

      list.appendChild(li);
    }
  }

  async function markRead(id, li, meta, msg) {
    const code = sessionStorage.getItem(SESSION_KEY);
    if (!code) return;
    try {
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action: "mark_read", id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error("mark_read failed");

      msg.is_read = true;
      li.classList.remove("is-unread");
      li.classList.add("is-read");
      meta.textContent = `${msg.name || "이름 없음"} · ${msg.email || "이메일 없음"} · ${formatDate(msg.created_at)} · 읽음`;
      const btn = li.querySelector(".admin-mark-read-btn");
      if (btn) btn.remove();
    } catch (err) {
      // leave state unchanged on failure
    }
  }

  async function loadMessages(code) {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || "unauthorized");
      err.status = res.status;
      throw err;
    }
    return data.messages || [];
  }

  async function showPanel(code) {
    try {
      const messages = await loadMessages(code);
      loginForm.hidden = true;
      panel.hidden = false;
      renderMessages(messages);
    } catch (err) {
      sessionStorage.removeItem(SESSION_KEY);
      loginForm.hidden = false;
      panel.hidden = true;
      loginStatus.textContent = "코드가 올바르지 않습니다";
      loginStatus.className = "contact-status-error";
    }
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("admin-code").value.trim();
    if (!code) return;

    loginBtn.disabled = true;
    loginStatus.textContent = "";
    loginStatus.className = "";

    try {
      const messages = await loadMessages(code);
      sessionStorage.setItem(SESSION_KEY, code);
      loginForm.hidden = true;
      panel.hidden = false;
      renderMessages(messages);
    } catch (err) {
      loginStatus.textContent = "코드가 올바르지 않습니다";
      loginStatus.className = "contact-status-error";
    } finally {
      loginBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    panel.hidden = true;
    loginForm.hidden = false;
    document.getElementById("admin-code").value = "";
    loginStatus.textContent = "";
    loginStatus.className = "";
  });

  const savedCode = sessionStorage.getItem(SESSION_KEY);
  if (savedCode) {
    showPanel(savedCode);
  }
});
