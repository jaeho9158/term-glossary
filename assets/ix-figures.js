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

  // ---- 공용 도우미 ----
  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
  function curve(svg, X, Y, xs, fn, cls) {
    var d = "";
    for (var i = 0; i < xs.length; i++) d += (i ? "L" : "M") + X(xs[i]).toFixed(1) + "," + Y(fn(xs[i])).toFixed(1);
    return el("path", { d: d, class: cls }, svg);
  }
  function fill(svg, X, Y, a, b, fn, cls) {
    var d = "M" + X(a).toFixed(1) + "," + Y(0).toFixed(1);
    for (var i = 0; i <= 80; i++) { var x = a + (b - a) * i / 80; d += "L" + X(x).toFixed(1) + "," + Y(fn(x)).toFixed(1); }
    d += "L" + X(b).toFixed(1) + "," + Y(0).toFixed(1) + "Z";
    return el("path", { d: d, class: cls }, svg);
  }
  function range(a, b, n) { var r = []; for (var i = 0; i <= n; i++) r.push(a + (b - a) * i / n); return r; }
  // 정규 분위수(이분법). 0<p<1
  function zq(p) { var lo = -9, hi = 9; for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (phi(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
  // 시드 고정 난수(같은 그림이 매번 같게 보이도록)
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return (seed + 0.5) / 4294967296; }; }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r()); }
  function lgamma(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); var s = 1.000000000190015;
    for (var j = 0; j < 6; j++) s += c[j] / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
  }
  function tpdf(x, v) { return Math.exp(lgamma((v + 1) / 2) - lgamma(v / 2) - 0.5 * Math.log(v * Math.PI) - (v + 1) / 2 * Math.log(1 + x * x / v)); }
  function tcdf(x, v) { // 0부터 x까지 심프슨 적분
    var n = 400, h = x / n, s = tpdf(0, v) + tpdf(x, v);
    for (var i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * tpdf(i * h, v);
    return 0.5 + s * h / 3;
  }
  function tq(p, v) { var lo = 0, hi = 200; for (var i = 0; i < 60; i++) { var m = (lo + hi) / 2; if (tcdf(m, v) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
  var fmt1 = function (v) { return v.toFixed(1); }, fmt2 = function (v) { return v.toFixed(2); };

  // 검정력: 효과 크기 d, 집단당 표본 n, 유의수준 α(양측). 정규 근사.
  function power(host) {
    var f = frame(host, "효과 크기·표본 크기·유의수준에 따른 검정력 그림");
    var draw = function () {
      var d = +es.value, n = Math.round(Math.pow(10, +lg.value)), a = [0.01, 0.05, 0.10][+al.value];
      var ncp = d * Math.sqrt(n / 2), zc = zq(1 - a / 2);
      var pw = phi(ncp - zc) + phi(-ncp - zc);
      clear(f.svg);
      var lo = -4, hi = Math.max(4, ncp + 4);
      var X = axes(f.svg, lo, hi, [0, Math.round(ncp * 10) / 10].filter(function (v, i, s) { return s.indexOf(v) === i; }));
      var top = pdf(0, 0, 1), Y = function (y) { return H - PAD.b - y / top * (H - PAD.t - PAD.b) * 0.92; };
      var h0 = function (x) { return pdf(x, 0, 1); }, h1 = function (x) { return pdf(x, ncp, 1); };
      fill(f.svg, X, Y, zc, hi, h1, "ix-area");
      curve(f.svg, X, Y, range(lo, hi, 200), h0, "ix-line2");
      curve(f.svg, X, Y, range(lo, hi, 200), h1, "ix-line");
      el("line", { x1: X(zc), x2: X(zc), y1: Y(0), y2: PAD.t, class: "ix-mark" }, f.svg);
      var t0 = el("text", { x: X(0), y: PAD.t + 10, "text-anchor": "middle", class: "ix-label" }, f.svg); t0.textContent = "효과 없음";
      var t1 = el("text", { x: X(ncp), y: PAD.t + 26, "text-anchor": "middle", class: "ix-label" }, f.svg); t1.textContent = "실제 효과";
      f.note.textContent = "집단당 " + n + "명, d = " + d.toFixed(2) + ", α = " + a + "일 때 검정력은 약 " + (pw * 100).toFixed(0) + "%이다. 칠한 넓이가 실제 효과를 찾아낼 확률이다(정규 근사).";
    };
    var es = slider(f.ctl, "효과 크기 d", 0.1, 1.5, 0.05, 0.5, fmt2, function () { draw(); });
    var lg = slider(f.ctl, "집단당 표본", 0.7, 2.5, 0.02, 1.8, function (v) { return Math.round(Math.pow(10, v)) + "명"; }, function () { draw(); });
    var al = slider(f.ctl, "유의수준 α", 0, 2, 1, 1, function (v) { return ["0.01", "0.05", "0.10"][v]; }, function () { draw(); });
    draw();
  }

  // p값: 검정통계량 z를 움직이면 양쪽 꼬리 넓이(p값)가 바뀐다.
  function pval(host) {
    var f = frame(host, "검정통계량에 따른 양측 p값 그림");
    var draw = function () {
      var z = +zs.value, p = 2 * (1 - phi(Math.abs(z)));
      clear(f.svg);
      var X = axes(f.svg, -4, 4, [-4, -2, 0, 2, 4]);
      var top = pdf(0, 0, 1), Y = function (y) { return H - PAD.b - y / top * (H - PAD.t - PAD.b); };
      var g = function (x) { return pdf(x, 0, 1); }, az = Math.abs(z);
      if (az < 4) { fill(f.svg, X, Y, az, 4, g, "ix-area"); fill(f.svg, X, Y, -4, -az, g, "ix-area"); }
      curve(f.svg, X, Y, range(-4, 4, 200), g, "ix-line");
      el("line", { x1: X(z), x2: X(z), y1: Y(0), y2: PAD.t, class: "ix-mark" }, f.svg);
      f.note.textContent = "z = " + z.toFixed(2) + "이면 양측 p값은 " + (p < 0.001 ? "0.001보다 작다" : p.toFixed(3) + "이다") + ". 효과가 없다는 가정 아래에서 이만큼 극단적인 값이 나올 확률이며, " + (p < 0.05 ? "0.05보다 작아 유의수준 5%에서 유의하다." : "0.05 이상이라 유의수준 5%에서 유의하지 않다.");
    };
    var zs = slider(f.ctl, "검정통계량 z", -4, 4, 0.05, 1.5, fmt2, function () { draw(); });
    draw();
  }

  // 상관: 상관계수 r을 바꾸면 같은 80개 점이 그만큼 한 직선 쪽으로 모인다.
  function corr(host) {
    var f = frame(host, "상관계수에 따라 바뀌는 산점도");
    var r = rng(7), base = [];
    for (var i = 0; i < 80; i++) base.push([gauss(r), gauss(r)]);
    var draw = function () {
      var rho = +rs.value, k = Math.sqrt(1 - rho * rho);
      clear(f.svg);
      var X = axes(f.svg, -3, 3, [-3, 0, 3]), Y = function (y) { return (H - PAD.b + PAD.t) / 2 - y / 3 * (H - PAD.b - PAD.t) / 2; };
      var pts = base.map(function (p) { return [p[0], rho * p[0] + k * p[1]]; });
      pts.forEach(function (p) { if (Math.abs(p[1]) < 3.2) el("circle", { cx: X(p[0]), cy: Y(p[1]), r: 3.2, class: "ix-dot" }, f.svg); });
      var mx = 0, my = 0; pts.forEach(function (p) { mx += p[0]; my += p[1]; }); mx /= 80; my /= 80;
      var sxy = 0, sxx = 0, syy = 0; pts.forEach(function (p) { sxy += (p[0] - mx) * (p[1] - my); sxx += Math.pow(p[0] - mx, 2); syy += Math.pow(p[1] - my, 2); });
      var rr = sxy / Math.sqrt(sxx * syy);
      f.note.textContent = "모집단 상관계수가 " + rho.toFixed(2) + "일 때 80개를 뽑으니 표본 상관계수는 " + rr.toFixed(2) + "이다. 0에 가까우면 점이 둥글게 퍼지고, ±1에 가까우면 한 직선 위로 모인다. 한 변수가 다른 변수의 변동을 설명하는 비율인 r²는 " + (rr * rr).toFixed(2) + "이다.";
    };
    var rs = slider(f.ctl, "상관계수", -1, 1, 0.05, 0.6, fmt2, function () { draw(); });
    draw();
  }

  // 단순회귀: 기울기와 잡음 크기를 바꾸면 최소제곱 직선과 R²가 따라 바뀐다.
  function regr(host) {
    var f = frame(host, "기울기와 잡음에 따른 회귀선과 결정계수 그림");
    var r = rng(11), xs = [], es = [];
    for (var i = 0; i < 40; i++) { xs.push(r() * 10); es.push(gauss(r)); }
    var draw = function () {
      var b = +bs.value, s = +ss.value;
      var ys = xs.map(function (x, i) { return 2 + b * x + s * es[i]; });
      var mx = xs.reduce(function (a, c) { return a + c; }, 0) / 40, my = ys.reduce(function (a, c) { return a + c; }, 0) / 40;
      var sxy = 0, sxx = 0, sst = 0; xs.forEach(function (x, i) { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) * (x - mx); sst += (ys[i] - my) * (ys[i] - my); });
      var bh = sxy / sxx, ah = my - bh * mx, sse = 0; xs.forEach(function (x, i) { sse += Math.pow(ys[i] - ah - bh * x, 2); });
      var r2 = 1 - sse / sst;
      clear(f.svg);
      var X = axes(f.svg, 0, 10, [0, 5, 10]);
      var ymin = -10, ymax = 30, Y = function (y) { return H - PAD.b - (y - ymin) / (ymax - ymin) * (H - PAD.b - PAD.t); };
      xs.forEach(function (x, i) { if (ys[i] > ymin && ys[i] < ymax) el("circle", { cx: X(x), cy: Y(ys[i]), r: 3.2, class: "ix-dot" }, f.svg); });
      el("line", { x1: X(0), y1: Y(ah), x2: X(10), y2: Y(ah + bh * 10), class: "ix-line" }, f.svg);
      f.note.textContent = "추정한 회귀식은 ŷ = " + ah.toFixed(2) + " + " + bh.toFixed(2) + "x이고 결정계수 R² = " + r2.toFixed(2) + "이다. 잡음이 커지면 기울기는 비슷해도 R²가 떨어진다.";
    };
    var bs = slider(f.ctl, "실제 기울기", 0, 2.5, 0.1, 1.5, fmt1, function () { draw(); });
    var ss = slider(f.ctl, "잡음 크기", 0.5, 8, 0.25, 3, fmt2, function () { draw(); });
    draw();
  }

  // t분포: 자유도를 바꾸며 표준정규분포와 비교한다.
  function tdist(host) {
    var f = frame(host, "자유도에 따른 t분포와 표준정규분포 비교");
    var draw = function () {
      var v = +dfs.value, tc = tq(0.975, v);
      clear(f.svg);
      var X = axes(f.svg, -5, 5, [-4, -2, 0, 2, 4]);
      var top = pdf(0, 0, 1), Y = function (y) { return H - PAD.b - y / top * (H - PAD.t - PAD.b); };
      var g = function (x) { return tpdf(x, v); };
      fill(f.svg, X, Y, tc, 5, g, "ix-area"); fill(f.svg, X, Y, -5, -tc, g, "ix-area");
      curve(f.svg, X, Y, range(-5, 5, 200), function (x) { return pdf(x, 0, 1); }, "ix-line2");
      curve(f.svg, X, Y, range(-5, 5, 200), g, "ix-line");
      f.note.textContent = "자유도 " + v + "일 때 양측 5% 기준값은 ±" + tc.toFixed(3) + "이다(표준정규는 ±1.960). 자유도가 작을수록 꼬리가 두꺼워 기준값이 커지고, 자유도가 커지면 점선의 표준정규분포에 가까워진다.";
    };
    var dfs = slider(f.ctl, "자유도", 1, 60, 1, 5, function (v) { return String(v); }, function () { draw(); });
    draw();
  }

  // 중심극한정리: 치우친 지수분포(평균 1)에서 n개씩 뽑은 평균 2,000개의 히스토그램.
  function clt(host) {
    var f = frame(host, "표본 크기에 따라 정규분포에 가까워지는 표본평균의 분포");
    var r = rng(3), pool = [];
    for (var i = 0; i < 2000 * 50; i++) pool.push(-Math.log(r()));
    var draw = function () {
      var n = +ns.value, bins = new Array(30).fill(0), lo = 0, hi = 3, w = (hi - lo) / 30;
      for (var k = 0; k < 2000; k++) {
        var s = 0; for (var j = 0; j < n; j++) s += pool[k * 50 + j];
        var m = s / n, b = Math.floor((m - lo) / w); if (b >= 0 && b < 30) bins[b]++;
      }
      clear(f.svg);
      var X = axes(f.svg, lo, hi, [0, 1, 2, 3]);
      var dens = bins.map(function (c) { return c / 2000 / w; }), sd = 1 / Math.sqrt(n);
      var top = Math.max(Math.max.apply(null, dens), pdf(1, 1, sd)) * 1.05;
      var Y = function (y) { return H - PAD.b - y / top * (H - PAD.t - PAD.b); };
      dens.forEach(function (d, i) { el("rect", { x: X(lo + i * w) + 0.5, y: Y(d), width: Math.max(0, X(w) - X(0) - 1), height: Y(0) - Y(d), class: "ix-bar" }, f.svg); });
      curve(f.svg, X, Y, range(lo, hi, 150), function (x) { return pdf(x, 1, sd); }, "ix-line");
      f.note.textContent = "오른쪽으로 치우친 분포(평균 1)에서 " + n + "개씩 뽑아 평균을 2,000번 냈다. n이 커질수록 막대가 곡선(평균 1, 표준오차 1/√n = " + sd.toFixed(2) + "인 정규분포)에 가까워진다.";
    };
    var ns = slider(f.ctl, "표본 크기 n", 1, 50, 1, 2, function (v) { return v + "개"; }, function () { draw(); });
    draw();
  }

  var KINDS = { normal: normal, ci: ci, power: power, pval: pval, corr: corr, regr: regr, tdist: tdist, clt: clt };
  var hosts = document.querySelectorAll(".ix-fig[data-ix]");
  for (var i = 0; i < hosts.length; i++) {
    var fn = KINDS[hosts[i].getAttribute("data-ix")];
    if (fn) fn(hosts[i]);
  }
})();
