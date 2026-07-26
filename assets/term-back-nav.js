(function () {
  const breadcrumb = document.querySelector("main .breadcrumb");
  if (!breadcrumb) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "term-back-btn";
  btn.textContent = "← 뒤로가기";
  btn.addEventListener("click", () => {
    if (history.length > 1) {
      history.back();
    } else {
      window.close();
    }
  });

  breadcrumb.parentNode.insertBefore(btn, breadcrumb);
})();
