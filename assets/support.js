// 후원 안내: 용어 페이지의 "관련 용어" 바로 위에 작은 상자를 하나 넣는다.
// SUPPORT_URL 이 비어 있으면 아무것도 그리지 않는다(링크를 받기 전까지 꺼 둔다).
(function () {
  var SUPPORT_URL = "https://open.kakao.com/o/szeMAGWi";
  if (!SUPPORT_URL) return;
  var main = document.querySelector("main");
  if (!main) return;
  var box = document.createElement("aside");
  box.className = "support-box";
  box.innerHTML =
    '<p>논문용어사전은 한 사람이 출처를 확인하며 만들고 고치고 있어요. 설명이 도움이 됐다면 후원으로 응원해 주세요. 틀린 내용 제보도 같은 곳으로 받아요.</p>' +
    '<a class="support-btn" target="_blank" rel="noopener">카카오톡으로 후원·제보하기</a>';
  var a = box.querySelector("a");
  a.href = SUPPORT_URL;
  a.addEventListener("click", function () {
    try { if (window.gtag) gtag("event", "support_click", { page: location.pathname }); } catch (e) {}
  });
  var h2s = main.querySelectorAll("h2");
  var rel = null;
  for (var i = 0; i < h2s.length; i++) if (h2s[i].textContent.trim() === "관련 용어") rel = h2s[i];
  main.insertBefore(box, rel || null);
})();
