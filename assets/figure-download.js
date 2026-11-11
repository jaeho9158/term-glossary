// 용어 페이지의 코드 그림(figure.si-figure 안의 SVG)에 "SVG로 받기 / PNG로 받기" 버튼을 단다.
// 그림은 사이트 CSS 변수로 색을 칠하므로, 내려받을 때는 지금 보이는 색을 속성으로 굳혀서 따로 열어도 같게 보이게 한다.
(function () {
  var PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity",
    "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "color"];
  var slug = (location.pathname.split("/").pop() || "figure").replace(/\.html$/, "");

  function visibleSvg(fig) {
    var svgs = fig.querySelectorAll(".si-frame svg");
    for (var i = 0; i < svgs.length; i++) if (svgs[i].getBoundingClientRect().width > 0) return svgs[i];
    return svgs[0] || null;
  }

  function freeze(svg) {
    var clone = svg.cloneNode(true);
    var src = [svg].concat([].slice.call(svg.querySelectorAll("*")));
    var dst = [clone].concat([].slice.call(clone.querySelectorAll("*")));
    for (var i = 0; i < src.length; i++) {
      var cs = getComputedStyle(src[i]);
      for (var j = 0; j < PROPS.length; j++) {
        var v = cs.getPropertyValue(PROPS[j]);
        if (v) dst[i].setAttribute(PROPS[j], v);
      }
    }
    var box = svg.viewBox && svg.viewBox.baseVal;
    var w = box && box.width ? box.width : svg.getBoundingClientRect().width;
    var h = box && box.height ? box.height : svg.getBoundingClientRect().height;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", w);
    clone.setAttribute("height", h);
    clone.removeAttribute("style");
    // 배경을 깔아 둔다(투명 배경은 어두운 슬라이드에서 글자가 안 보인다).
    var bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    var x = box ? box.x : 0, y = box ? box.y : 0;
    bg.setAttribute("x", x); bg.setAttribute("y", y); bg.setAttribute("width", w); bg.setAttribute("height", h);
    bg.setAttribute("fill", getComputedStyle(document.body).backgroundColor || "#fff");
    clone.insertBefore(bg, clone.firstChild);
    return { text: new XMLSerializer().serializeToString(clone), w: w, h: h };
  }

  function save(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function track(kind) { try { if (window.gtag) gtag("event", "figure_download", { format: kind, term: slug }); } catch (e) {} }

  function add(fig, n) {
    if (!visibleSvg(fig)) return;
    var name = slug + (n ? "-" + (n + 1) : "");
    var bar = document.createElement("div");
    bar.className = "fig-dl";
    bar.innerHTML = '<button type="button" data-k="svg">SVG로 받기</button><button type="button" data-k="png">PNG로 받기</button>';
    bar.addEventListener("click", function (e) {
      var k = e.target && e.target.getAttribute("data-k");
      if (!k) return;
      // 발표 자료는 대개 흰 바탕이라, 다크 모드에서도 밝은 색으로 굳혀 받는다.
      var root = document.documentElement, prev = root.getAttribute("data-theme");
      root.setAttribute("data-theme", "light");
      var svg = visibleSvg(fig), f = freeze(svg);
      if (prev === null) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", prev);
      track(k);
      if (k === "svg") return save(new Blob([f.text], { type: "image/svg+xml" }), name + ".svg");
      var img = new Image(), scale = 3;
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = Math.round(f.w * scale); c.height = Math.round(f.h * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { if (b) save(b, name + ".png"); }, "image/png");
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(f.text);
    });
    var cap = fig.querySelector("figcaption");
    fig.insertBefore(bar, cap || null);
  }

  var figs = document.querySelectorAll("main figure.si-figure");
  for (var i = 0; i < figs.length; i++) add(figs[i], figs.length > 1 ? i : 0);
})();
