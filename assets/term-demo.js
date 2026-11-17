// 용어 페이지의 움직이는 시범 그림: 사이트 테마에 맞는 쪽(-light)을 띄우고 높이를 내용에 맞춘다
(function () {
  var dark = function () {
    var t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  };
  document.querySelectorAll("iframe.term-demo-frame").forEach(function (f) {
    var set = function () {
      var src = "../assets/demos/" + f.dataset.demo + (dark() ? "" : "-light") + ".html";
      if (f.getAttribute("src") !== src) f.setAttribute("src", src);
    };
    var fit = function () {
      try { var d = f.contentDocument; if (d && d.body) { var b = 0; for (var c of d.body.children) b = Math.max(b, c.getBoundingClientRect().bottom + (d.defaultView.scrollY || 0)); f.style.height = Math.ceil(b + 16) + "px"; } } catch (e) {}
    };
    f.addEventListener("load", function () {
      fit();
      try { new ResizeObserver(fit).observe(f.contentDocument.body); } catch (e) {}
    });
    set();
    new MutationObserver(set).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  });
})();
