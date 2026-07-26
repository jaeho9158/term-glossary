const SITE_TITLE = "논문용어사전";

function renderHeader(basePath, { navCta = true, authNav = true } = {}) {
  const viewerLink = navCta
    ? `\n      <a href="${basePath}viewer.html" class="nav-cta">논문 뷰어</a>`
    : "";

  const authLinks = authNav
    ? `
      <a href="${basePath}login.html" id="nav-login">로그인</a>
      <a href="${basePath}signup.html" id="nav-signup">회원가입</a>
      <a href="${basePath}history.html" id="nav-history" hidden>내 기록</a>
      <a href="#" id="nav-logout" hidden>로그아웃</a>`
    : "";

  return `<header class="site-header">
  <div class="inner">
    <a class="logo" href="${basePath}index.html">${SITE_TITLE}</a>
    <div class="header-search">
      <input type="search" id="global-term-search" class="header-search-input" placeholder="용어 검색" aria-label="용어 검색" autocomplete="off">
      <ul id="global-term-search-results" class="header-search-results" hidden></ul>
    </div>
    <button
      id="theme-toggle"
      class="theme-toggle-btn"
      type="button"
      aria-label="다크모드 전환">
      <span class="theme-icon-light" aria-hidden="true">🌙</span>
      <span class="theme-icon-dark" aria-hidden="true">☀️</span>
    </button>
    <button
      id="menu-toggle"
      class="menu-toggle"
      aria-label="메뉴"
      aria-expanded="false">
      ☰
    </button>

    <nav id="site-nav" class="site-nav">
      <a href="${basePath}index.html">용어 목록</a>${viewerLink}
      <a href="${basePath}about.html">소개</a>
      <a href="${basePath}contact.html">문의</a>${authLinks}
    </nav>
  </div>
</header>`;
}

function renderThemeInit() {
  return `<!-- theme-init:start -->
<script>(function(){try{var t=localStorage.getItem("theme");if(!t){t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}document.addEventListener("click",function(e){var btn=e.target.closest("#theme-toggle");if(!btn)return;var next=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",next);try{localStorage.setItem("theme",next);}catch(e){}});})();</script>
<!-- theme-init:end -->`;
}

function renderFooter(basePath) {
  return `<footer class="site-footer">
  <p>&copy; 2026 ${SITE_TITLE}. All rights reserved.</p>
  <a href="${basePath}about.html">소개</a> · <a href="${basePath}privacy.html">개인정보처리방침</a> · <a href="${basePath}contact.html">문의</a>
</footer>`;
}

module.exports = { SITE_TITLE, renderHeader, renderFooter, renderThemeInit };
