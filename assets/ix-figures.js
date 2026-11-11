// 값을 바꿔 보는 그림. 페이지의 <div class="ix-fig" data-ix="이름"></div> 자리에 SVG와 슬라이더를 그린다.
// 색은 사이트 변수(--accent, --muted, --border, --text)를 쓰므로 다크 모드에서 자동으로 바뀐다.
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var W = 480, H = 220, PAD = { l: 34, r: 12, t: 12, b: 28 };

  // 표준정규 누적분포(Abramowitz–Stegun 7.1.26 근사, 오차 < 1.5e-7)
  function phi(z) {
    var t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  var pdf = function (x, m, s) { return Math.exp(-0.5 * Math.pow((x - m) / s, 2)) / (s * Math.sqrt(2 * Math.PI)); };

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function slider(box, label, min, max, step, value, fmt, on) {
    var row = document.createElement("label");
    row.className = "ix-row";
    var name = document.createElement("span"); name.textContent = label;
    var input = document.createElement("input");
    input.type = "range"; input.min = min; input.max = max; input.step = step; input.value = value;
    var out = document.createElement("output"); out.textContent = fmt(+value);
    input.addEventListener("input", function () { out.textContent = fmt(+input.value); on(); });
    row.appendChild(name); row.appendChild(input); row.appendChild(out);
    box.appendChild(row);
    return input;
  }
  function frame(host, aria) {
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": aria, class: "ix-svg" });
    host.appendChild(svg);
    var ctl = document.createElement("div"); ctl.className = "ix-ctl"; host.appendChild(ctl);
    var note = document.createElement("p"); note.className = "ix-note"; note.setAttribute("aria-live", "polite"); host.appendChild(note);
    return { svg: svg, ctl: ctl, note: note };
  }
  function axes(svg, xmin, xmax, ticks) {
    var g = el("g", { class: "ix-axis" }, svg);
    var X = function (x) { return PAD.l + (x - xmin) / (xmax - xmin) * (W - PAD.l - PAD.r); };
    el("line", { x1: PAD.l, x2: W - PAD.r, y1: H - PAD.b, y2: H - PAD.b }, g);
    ticks.forEach(function (t) {
      el("line", { x1: X(t), x2: X(t), y1: H - PAD.b, y2: H - PAD.b + 4 }, g);
      var tx = el("text", { x: X(t), y: H - PAD.b + 17, "text-anchor": "middle" }, g); tx.textContent = t;
    });
    return X;
  }

  // 정규분포: 평균·표준편차를 바꾸면 곡선과 평균±1·2표준편차 구간이 따라 움직인다.
  function normal(host) {
    var f = frame(host, "평균과 표준편차를 바꿀 수 있는 정규분포 곡선");
    var draw = function () {
      var m = +mu.value, s = +sd.value, k = +band.value;
      while (f.svg.firstChild) f.svg.removeChild(f.svg.firstChild);
      var X = axes(f.svg, -10, 10, [-10, -5, 0, 5, 10]);
      var top = pdf(0, 0, 0.8);
      var Y = function (y) { return H - PAD.b - y / top * (H - PAD.t - PAD.b); };
      var area = "M" + X(m - k * s) + "," + Y(0), line = "";
      for (var i = 0; i <= 240; i++) {
        var x = -10 + i / 12, y = pdf(x, m, s);
        line += (i ? "L" : "M") + X(x).toFixed(1) + "," + Y(y).toFixed(1);
        if (x >= m - k * s && x <= m + k * s) area += "L" + X(x).toFixed(1) + "," + Y(y).toFixed(1);
      }
      area += "L" + X(m + k * s) + "," + Y(0) + "Z";
      el("path", { d: area, class: "ix-area" }, f.svg);
      el("path", { d: line, class: "ix-line" }, f.svg);
      el("line", { x1: X(m), x2: X(m), y1: Y(0), y2: Y(pdf(m, m, s)), class: "ix-mark" }, f.svg);
      var p = (phi(k) - phi(-k)) * 100;
      f.note.textContent = "평균 ±" + k + "표준편차(" + (m - k * s).toFixed(1) + " ~ " + (m + k * s).toFixed(1) + ") 안에 전체의 약 " + p.toFixed(1) + "%가 들어간다. 이 비율은 평균과 표준편차를 바꿔도 같다.";
    };
    var mu = slider(f.ctl, "평균", -5, 5, 0.5, 0, function (v) { return v.toFixed(1); }, function () { draw(); });
    var sd = slider(f.ctl, "표준편차", 0.8, 4, 0.1, 2, function (v) { return v.toFixed(1); }, function () { draw(); });
    var band = slider(f.ctl, "구간(±표준편차)", 1, 3, 1, 1, function (v) { return "±" + v; }, function () { draw(); });
    draw();
  }

  // 신뢰구간: 표본 크기를 늘리면 95% 신뢰구간이 1/√n 비율로 좁아진다(모표준편차 10 가정).
  function ci(host) {
    var f = frame(host, "표본 크기와 신뢰수준을 바꿀 수 있는 신뢰구간 그림");
    var Z = { 90: 1.645, 95: 1.96, 99: 2.576 };
    var draw = function () {
      var n = Math.round(Math.pow(10, +lg.value)), lv = [90, 95, 99][+lvl.value], z = Z[lv];
      var half = z * 10 / Math.sqrt(n);
      while (f.svg.firstChild) f.svg.removeChild(f.svg.firstChild);
      var X = axes(f.svg, 30, 70, [30, 40, 50, 60, 70]);
      var y = (H - PAD.b) / 2 + 4;
      el("line", { x1: X(Math.max(30, 50 - half)), x2: X(Math.min(70, 50 + half)), y1: y, y2: y, class: "ix-ci" }, f.svg);
      [50 - half, 50 + half].forEach(function (v) {
        if (v > 30 && v < 70) el("line", { x1: X(v), x2: X(v), y1: y - 10, y2: y + 10, class: "ix-ci" }, f.svg);
      });
      el("circle", { cx: X(50), cy: y, r: 5, class: "ix-dot" }, f.svg);
      var t = el("text", { x: X(50), y: y - 18, "text-anchor": "middle", class: "ix-label" }, f.svg); t.textContent = "표본평균 50";
      f.note.textContent = "표본 " + n.toLocaleString() + "명, " + lv + "% 신뢰구간은 50 ± " + half.toFixed(2) + "이다. 표본을 4배로 늘리면 구간 폭은 절반이 된다(모표준편차 10으로 가정).";
    };
    var lg = slider(f.ctl, "표본 크기", 1, 3.3, 0.05, 1.6, function (v) { return Math.round(Math.pow(10, v)).toLocaleString() + "명"; }, function () { draw(); });
    var lvl = slider(f.ctl, "신뢰수준", 0, 2, 1, 1, function (v) { return [90, 95, 99][v] + "%"; }, function () { draw(); });
    draw();
  }

  var KINDS = { normal: normal, ci: ci };
  var hosts = document.querySelectorAll(".ix-fig[data-ix]");
  for (var i = 0; i < hosts.length; i++) {
    var fn = KINDS[hosts[i].getAttribute("data-ix")];
    if (fn) fn(hosts[i]);
  }
})();
