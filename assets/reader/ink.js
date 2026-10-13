// 잉크 보정: 예측한 사각형의 좌우 가장자리를 쪽 캔버스에 실제로 그려진 글자(잉크)에 맞춘다.
// 순수 함수(columnInk, gaps, snapEdge)는 node 에서 시험하고, refineRects 는 브라우저에서 캔버스를 읽는다.
// 쪽 좌표(배율 1)의 사각형 {x,y,w,h} 를 받아 같은 모양으로 돌려준다. 캔버스를 못 읽으면 입력을 그대로 돌려준다.
(function (root) {
  "use strict";

  // 조정값. 근거는 .superpowers/sdd/.../task-3-report.md 의 "Fix round 2".
  var P = {
    bandTop: 0.12,        // 사각형 높이의 위 12% 를 뺀 가운데 76% 띠만 본다(이웃 줄의 윗첨자·아랫꼬리를 피함)
    bandSide: 0.6,        // 띠는 사각형 좌우로 높이의 0.6배 더 뻗는다
    minGap: 0.15,         // 낱말 사이로 인정하는 잉크 없는 틈의 최소 폭(사각형 높이 대비). 한글 음절 사이 틈은 이보다 좁다.
    maxMove: 0.5,         // 가장자리를 옮길 수 있는 최대 거리(사각형 높이 대비)
    pad: 0.04,            // 보정 뒤 좌우로 더하는 여유(높이 대비)
    minKeep: 0.3,         // 보정 결과 폭이 원래의 30% 미만이면 원래 것을 쓴다
    inkDelta: 40,         // 바탕과의 밝기 차이가 이 이상이면 잉크(0~255)
  };

  // ---------- 순수 함수 ----------

  // imageData(RGBA, .data/.width/.height) 의 (x0,y0,w,h) 띠에서 세로 열마다 잉크가 있으면 1.
  // 바탕 = 띠 픽셀 밝기의 최빈 구간(16단계)의 평균. 어두운 바탕 위 밝은 글자도 같은 방식으로 잡힌다.
  function columnInk(imageData, x0, y0, w, h, delta) {
    var out = new Uint8Array(Math.max(0, w));
    var W = imageData.width, H = imageData.height, d = imageData.data;
    var xa = Math.max(0, x0), xb = Math.min(W, x0 + w);
    var ya = Math.max(0, y0), yb = Math.min(H, y0 + h);
    if (xb <= xa || yb <= ya) return out;
    var thr = delta === undefined ? P.inkDelta : delta;
    var bw = xb - xa, bh = yb - ya;
    var lum = new Float32Array(bw * bh);
    var hist = new Uint32Array(16), sum = new Float64Array(16);
    var k = 0, x, y, p, L;
    for (y = ya; y < yb; y++) {
      p = (y * W + xa) * 4;
      for (x = xa; x < xb; x++, p += 4, k++) {
        L = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        lum[k] = L;
        var b = L >= 255 ? 15 : (L >> 4);
        hist[b]++; sum[b] += L;
      }
    }
    var best = 0;
    for (var i = 1; i < 16; i++) if (hist[i] > hist[best]) best = i;
    var bg = sum[best] / hist[best];
    for (y = 0; y < bh; y++) {
      for (x = 0; x < bw; x++) {
        if (Math.abs(lum[y * bw + x] - bg) > thr) out[xa - x0 + x] = 1;
      }
    }
    return out;
  }

  // 잉크 없는 연속 구간 중 minGapPx 이상인 것: [{start, end}] (start 포함, end 미포함 = end 는 오른쪽 잉크의 첫 열).
  // 띠의 바깥은 잉크가 없다고 보므로, 띠 처음·끝의 빈 구간은 길이와 상관없이(비어 있지 않으면) 틈이다.
  function gaps(col, minGapPx) {
    var res = [];
    var n = col.length;
    var i = 0;
    while (i < n) {
      if (col[i]) { i++; continue; }
      var s = i;
      while (i < n && !col[i]) i++;
      if (i - s >= minGapPx || s === 0 || i === n) res.push({ start: s, end: i });
    }
    return res;
  }

  // 가장자리 x 를 가장 가까운 틈의 잉크 쪽 경계로 옮긴다.
  //   side "left": 틈의 end(= 틈 뒤 첫 잉크 열). side "right": 틈의 start(= 잉크가 끝나는 곳).
  // x 가 틈 안에 있으면 그 틈의 경계로(안쪽으로 조임). 거리는 x 에서 경계까지. maxMovePx 를 넘으면 그대로.
  function snapEdge(x, gapsList, maxMovePx, side) {
    var best = x, bestD = Infinity;
    for (var i = 0; i < gapsList.length; i++) {
      var g = gapsList[i];
      var b = side === "left" ? g.end : g.start;
      var dist = Math.abs(b - x);
      if (dist < bestD) { bestD = dist; best = b; }
    }
    return bestD <= maxMovePx ? best : x;
  }

  // ---------- 브라우저: 캔버스에서 읽어 사각형 보정 ----------
  var cache = new Map(); // page -> {sig, map: Map(key -> rect)}

  function D() { return root.ReaderDoc; }

  function invalidate(page) {
    if (page === undefined || page === null) cache.clear();
    else cache.delete(page);
  }

  function rectKey(r) { return r.x + "," + r.y + "," + r.w + "," + r.h; }

  // 한 사각형을 (이미 읽어 둔) 이미지 조각 위에서 보정한다. ox,oy = 이미지 조각의 캔버스 픽셀 원점.
  function refineOne(img, ox, oy, sx, sy, r, o) {
    var h = r.h;
    var bx0 = Math.floor((r.x - o.bandSide * h) * sx);
    var bx1 = Math.ceil((r.x + r.w + o.bandSide * h) * sx);
    var by0 = Math.round((r.y + o.bandTop * h) * sy);
    var by1 = Math.round((r.y + (1 - o.bandTop) * h) * sy);
    bx0 = Math.max(bx0, ox); bx1 = Math.min(bx1, ox + img.width);
    by0 = Math.max(by0, oy); by1 = Math.min(by1, oy + img.height);
    if (bx1 - bx0 < 2 || by1 - by0 < 1) return r;
    var col = columnInk(img, bx0 - ox, by0 - oy, bx1 - bx0, by1 - by0, o.inkDelta);
    var gl = gaps(col, Math.max(1, Math.round(o.minGap * h * sx)));
    var maxMove = o.maxMove * h * sx;
    var L = snapEdge(r.x * sx - bx0, gl, maxMove, "left");
    var R = snapEdge((r.x + r.w) * sx - bx0, gl, maxMove, "right");
    var left = (L + bx0) / sx - o.pad * h;
    var right = (R + bx0) / sx + o.pad * h;
    if (!(right > left) || right - left < o.minKeep * r.w) return r;
    return { x: left, y: r.y, w: right - left, h: r.h };
  }

  // rects: 쪽 좌표(배율 1). opts: {canvas, pageW, pageH}(시험·측정 도구용 직접 지정) 또는 아무것도 없이 ReaderDoc 의 쪽 캔버스.
  //   조정값(minGap, maxMove, pad, ...)도 opts 로 덮어쓸 수 있다.
  function refineRects(page, rects, opts) {
    opts = opts || {};
    if (!rects || !rects.length) return rects || [];
    var canvas = opts.canvas, pw = opts.pageW, ph = opts.pageH, el = null;
    var useCache = !opts.canvas;
    try {
      if (!canvas) {
        el = D() && D().pageEl(page);
        canvas = el && el.querySelector(".rd-canvas");
        var sz = D() && D().pageSize(page);
        pw = sz && sz.w; ph = sz && sz.h;
      }
      if (!canvas || !canvas.width || !canvas.height || !(pw > 0) || !(ph > 0)) return rects;
      var ctx = canvas.getContext("2d");
      if (!ctx) return rects;
      var sx = canvas.width / pw, sy = canvas.height / ph;
      var o = {};
      for (var k in P) o[k] = opts[k] !== undefined ? opts[k] : P[k];
      var sig = canvas.width + "x" + canvas.height;
      var ent = useCache ? cache.get(page) : null;
      if (ent && ent.sig !== sig) ent = null;
      if (!ent) { ent = { sig: sig, map: new Map() }; if (useCache) cache.set(page, ent); }
      var out = new Array(rects.length);
      var todo = [];
      rects.forEach(function (r, i) {
        var hit = useCache ? ent.map.get(rectKey(r)) : null;
        if (hit) out[i] = hit; else todo.push(i);
      });
      // 같은 줄(세로로 절반 넘게 겹침)끼리 묶어 getImageData 를 한 번에.
      todo.sort(function (a, b) { return rects[a].y - rects[b].y || rects[a].x - rects[b].x; });
      var groups = [];
      todo.forEach(function (i) {
        var r = rects[i];
        var g = groups[groups.length - 1];
        if (g) {
          var inter = Math.min(g.y1, r.y + r.h) - Math.max(g.y0, r.y);
          if (inter > 0.5 * Math.min(g.y1 - g.y0, r.h)) {
            g.idx.push(i); g.y0 = Math.min(g.y0, r.y); g.y1 = Math.max(g.y1, r.y + r.h);
            g.x0 = Math.min(g.x0, r.x - o.bandSide * r.h); g.x1 = Math.max(g.x1, r.x + r.w + o.bandSide * r.h);
            return;
          }
        }
        groups.push({ idx: [i], y0: r.y, y1: r.y + r.h, x0: r.x - o.bandSide * r.h, x1: r.x + r.w + o.bandSide * r.h });
      });
      groups.forEach(function (g) {
        var gx0 = Math.max(0, Math.floor(g.x0 * sx) - 1), gx1 = Math.min(canvas.width, Math.ceil(g.x1 * sx) + 1);
        var gy0 = Math.max(0, Math.floor(g.y0 * sy)), gy1 = Math.min(canvas.height, Math.ceil(g.y1 * sy));
        var img = null;
        if (gx1 > gx0 && gy1 > gy0) {
          try { img = ctx.getImageData(gx0, gy0, gx1 - gx0, gy1 - gy0); } catch (e) { img = null; }
        }
        g.idx.forEach(function (i) {
          var res = img ? refineOne(img, gx0, gy0, sx, sy, rects[i], o) : rects[i];
          out[i] = res;
          if (useCache) ent.map.set(rectKey(rects[i]), res);
        });
      });
      return out;
    } catch (e) {
      return rects;
    }
  }

  var api = {
    columnInk: columnInk,
    gaps: gaps,
    snapEdge: snapEdge,
    refineRects: refineRects,
    invalidate: invalidate,
    params: P,
  };
  root.ReaderInk = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    var bind = function () {
      var el = document.getElementById("reader");
      if (!el) return;
      el.addEventListener("reader:pagerendered", function (e) { invalidate(e.detail && e.detail.page); });
      el.addEventListener("reader:scalechange", function () { invalidate(); });
      el.addEventListener("reader:docopen", function () { invalidate(); });
    };
    bind();
  }
})(typeof window !== "undefined" ? window : globalThis);
