// 용어 페이지 <head> 공통 초기화 (theme-init + GA4 초기화).
// 41,000여 용어 페이지에 똑같이 인라인되어 있던 두 스크립트를 한 파일로 옮긴 것이다.
// 반드시 <head> 안에서 동기(sync)로 로드한다 — 다크모드 깜빡임(FOUC)을 막기 위해서다.
// 동작은 기존 인라인 스크립트와 같다:
//   1) theme: localStorage 의 theme, 없으면 prefers-color-scheme 으로 data-theme 설정 + #theme-toggle 위임 클릭
//   2) GA4  : 같은 페이지의 gtag/js?id=… 태그에서 측정 ID 를 읽어 dataLayer/gtag 초기화 + config
//             (gtag/js 태그 자체는 HTML 에 그대로 둔다 — Google 태그 감지·AdSense 심사 대비)
//             이미 인라인 스니펫(scripts/insert-analytics.js)이 gtag 를 정의해 뒀다면 건너뛴다(config 이중 호출 방지).
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (!t) {
      t = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("#theme-toggle");
    if (!btn) return;
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  });

  try {
    if (typeof window.gtag === "function") return;
    var tag = document.querySelector('script[src*="googletagmanager.com/gtag/js?id="]');
    var m = tag && /[?&]id=([^&]+)/.exec(tag.getAttribute("src"));
    if (!m) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", m[1]);
  } catch (e) {}
})();
