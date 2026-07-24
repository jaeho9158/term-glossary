const SITE_TITLE = "논문용어사전";

function renderHeader(basePath, { navCta = true } = {}) {
  const viewerLink = navCta
    ? `\n      <a href="${basePath}viewer.html" class="nav-cta">논문 뷰어</a>`
    : "";

  return `<header class="site-header">
  <div class="inner">
    <a class="logo" href="${basePath}index.html">${SITE_TITLE}</a>
    <div class="header-search">
      <input type="search" id="global-term-search" class="header-search-input" placeholder="용어 검색" aria-label="용어 검색" autocomplete="off">
      <ul id="global-term-search-results" class="header-search-results" hidden></ul>
    </div>
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
      <a href="${basePath}contact.html">문의</a>
      <a href="${basePath}login.html" id="nav-login">로그인</a>
      <a href="${basePath}signup.html" id="nav-signup">회원가입</a>
      <a href="${basePath}history.html" id="nav-history" hidden>내 기록</a>
      <a href="#" id="nav-logout" hidden>로그아웃</a>
    </nav>
  </div>
</header>`;
}

function renderFooter(basePath) {
  return `<footer class="site-footer">
  <p>&copy; 2026 ${SITE_TITLE}. All rights reserved.</p>
  <a href="${basePath}about.html">소개</a> · <a href="${basePath}privacy.html">개인정보처리방침</a> · <a href="${basePath}contact.html">문의</a>
</footer>`;
}

module.exports = { SITE_TITLE, renderHeader, renderFooter };
