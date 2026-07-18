import { getSession, onAuthChange, signOut } from "./auth.js";

function applySessionState(session) {
  const loginEl = document.getElementById("nav-login");
  const signupEl = document.getElementById("nav-signup");
  const historyEl = document.getElementById("nav-history");
  const logoutEl = document.getElementById("nav-logout");

  const loggedIn = !!session;

  if (loginEl) loginEl.hidden = loggedIn;
  if (signupEl) signupEl.hidden = loggedIn;
  if (historyEl) historyEl.hidden = !loggedIn;
  if (logoutEl) logoutEl.hidden = !loggedIn;
}

document.addEventListener("DOMContentLoaded", async () => {
  const logoutEl = document.getElementById("nav-logout");
  if (logoutEl) {
    logoutEl.addEventListener("click", async (e) => {
      e.preventDefault();
      await signOut();
      window.location.href = document.body.getAttribute("data-base") + "index.html";
    });
  }

  applySessionState(await getSession());
  onAuthChange((session) => applySessionState(session));
});
