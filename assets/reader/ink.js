// 잉크 보정: 예측한 사각형의 좌우 가장자리를 쪽 캔버스에 실제로 그려진 글자(잉크)에 맞춘다.
// 순수 함수(columnInkLum, gaps, snapEdge, refinable, edgeFlags)는 node 에서 시험하고, 브라우저에서는 쪽 캔버스를 한 번 읽어
// 밝기 바이트 버퍼로 만든 뒤 한가한 시간에 조금씩 계산한다(request/onReady). 동기 refineRects 는 측정 도구·시험용이다.
// 쪽 좌표(배율 1)의 사각형 {x,y,w,h} 를 받아 같은 모양으로 돌려준다. 캔버스를 못 읽으면 입력을 그대로 돌려준다.
(function (root) {
  "use strict";

  // 조정값. 근거는 .superpowers/sdd/.../task-3-report.md 의 "Fix round 2", "Fix round 3".
  var P = {
    bandTop: 0.12,        // 사각형 높이의 위 12% 를 뺀 가운데 76% 띠만 본다(이웃 줄의 윗첨자·아랫꼬리를 피함)
    bandSide: 0.6,        // 띠는 사각형 좌우로 높이의 0.6배 더 뻗는다
    minGap: 0.15,         // 낱말 사이로 인정하는 잉크 없는 틈의 최소 폭(사각형 높이 대비). 한글 음절 사이 틈은 이보다 좁다.
    maxMove: 0.5,         // 가장자리를 옮길 수 있는 최대 거리(사각형 높이 대비)
    pad: 0.04,            // 보정 뒤 좌우로 더하는 여유(높이 대비)
    minKeep: 0.3,         // 보정 결과 폭이 원래의 30% 미만이면 원래 것을 쓴다
    inkDelta: 40,         // 바탕과의 밝기 차이가 이 이상이면 잉크(0~255)
    minGapPx: 2.5,        // 낱말 사이 틈 기준(minGap·높이·배율)이 이 픽셀 수보다 작으면(저해상도) 보정하지 않는다
    thin: 0.3,            // 이 폭(높이 대비)보다 좁게 떨어진 잉크 덩어리는 "(" "「" 같은 얇은 글자로 보고 잘라내지 않는다
    keepMs: 4000,         // 쪽 잉크 버퍼를 마지막 사용 뒤 이만큼 두었다가 풀어 준다
    maxBufs: 3,           // 동시에 들고 있는 쪽 버퍼 수
    chunkMs: 6,           // 한가한 시간 한 번에 쓰는 최대 시간
  };

  // ---------- 순수 함수 ----------

  // 이 높이(쪽 좌표)·배율에서 보정할 만한가. 낱말 사이 틈 기준이 minGapPx 픽셀 미만이면 글자 사이 틈과 구별되지 않아 보정하지 않는다.
  function refinable(h, sx, o) {
    var q = o || P;
    return q.minGap * h * sx >= q.minGapPx;
  }

  // RGBA imageData -> 밝기 바이트 조각 {lum, width, height, ox, oy}. (ox,oy) = 캔버스 안에서 이 조각의 원점.
  function toLum(imageData, ox, oy) {
    var n = imageData.width * imageData.height, d = imageData.data;
    var lum = new Uint8Array(n);
    for (var k = 0, p = 0; k < n; k++, p += 4) lum[k] = (77 * d[p] + 150 * d[p + 1] + 29 * d[p + 2]) >> 8;
    return { lum: lum, width: imageData.width, height: imageData.height, ox: ox || 0, oy: oy || 0 };
  }

  // 밝기 조각 src 의 (x0,y0,w,h)(조각 안 좌표) 띠에서 세로 열마다 잉크가 있으면 1.
  // 바탕 = 띠 픽셀 밝기의 최빈 구간(16단계)의 평균. 어두운 바탕 위 밝은 글자도 같은 방식으로 잡힌다.
  function columnInkLum(src, x0, y0, w, h, delta) {
    var out = new Uint8Array(Math.max(0, w));
    var W = src.width, H = src.height, d = src.lum;
    var xa = Math.max(0, x0), xb = Math.min(W, x0 + w);
    var ya = Math.max(0, y0), yb = Math.min(H, y0 + h);
    if (xb <= xa || yb <= ya) return out;
    var thr = delta === undefined ? P.inkDelta : delta;
    var hist = new Uint32Array(16), sum = new Float64Array(16);
    var x, y, p, L;
    for (y = ya; y < yb; y++) {
      p = y * W + xa;
      for (x = xa; x < xb; x++, p++) {
        L = d[p];
        hist[L >> 4]++; sum[L >> 4] += L;
      }
    }
    var best = 0;
    for (var i = 1; i < 16; i++) if (hist[i] > hist[best]) best = i;
    var bg = sum[best] / hist[best];
    for (y = ya; y < yb; y++) {
      p = y * W + xa;
      for (x = xa; x < xb; x++, p++) {
        L = d[p] - bg;
        if (L > thr || -L > thr) out[x - x0] = 1;
      }
    }
    return out;
  }

  // RGBA imageData 용 호환 함수.
  function columnInk(imageData, x0, y0, w, h, delta) {
    return columnInkLum(toLum(imageData, 0, 0), x0, y0, w, h, delta);
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

  // 가장자리 x 를 잉크 덩어리의 바깥 경계로 옮긴다.
  //   side "left": 틈의 end(= 틈 뒤 첫 잉크 열). side "right": 틈의 start(= 잉크가 끝나는 곳).
  // 안쪽으로(사각형이 줄어드는 쪽) 옮기는 것은 잉크 없는 열 위에서만 한다: x 가 틈 안일 때 그 틈의 경계로.
  //   잉크 덩어리를 넘어 안쪽으로는 가지 않는다. x 가 잉크 위면 그 덩어리의 바깥 경계로(넓어지는 쪽, 덩어리를 넘어도 됨).
  // 예외: x 가 틈 안인데 그 바깥쪽 옆 잉크 덩어리가 thinPx 보다 좁고(괄호·따옴표·가는 1) maxMovePx 안이면
  //   x 를 그대로 둔다(안쪽 몸통으로 조이면 그 글자가 잘리고, 바깥으로 끌어들이면 이웃 낱말의 기호를 넣게 될 수 있다).
  //   그 덩어리 위에 x 가 있으면 위 규칙대로 덩어리의 바깥 경계로 간다. 옮길 수 있는 거리는 maxMovePx.
  function snapEdge(x, gapsList, maxMovePx, side, thinPx, minGapPx, bandLen) {
    var thin = thinPx || 0;
    var n = gapsList.length, i, g;
    var left = side === "left";
    var k = -1;
    for (i = 0; i < n; i++) {
      g = gapsList[i];
      if (g.start <= x && x <= g.end) { k = i; break; }
    }
    if (k >= 0) {
      g = gapsList[k];
      var nb = left ? gapsList[k - 1] : gapsList[k + 1];
      // 얇은 덩어리 바깥쪽 이웃 틈은 띠 가장자리까지 닿는 틈이어도 된다(어떤 잉크 덩어리도 안쪽으로 넘어 건너지 않는다).
      // 폭은 낱말 사이 틈 폭(minGapPx) 이상이어야 한다.
      if (nb && nb.end - nb.start >= (minGapPx || 0)) {
        var runW = left ? g.start - nb.end : nb.start - g.end;
        var edge = left ? nb.end : nb.start;
        if (runW < thin && Math.abs(x - edge) <= maxMovePx) return x; // 얇은 글자가 범위에 속하는지 알 수 없으므로 안쪽으로 조이지도, 끌어들이지도 않는다
      }
      var b = left ? g.end : g.start;
      return Math.abs(b - x) <= maxMovePx ? b : x;
    }
    var best = null;
    for (i = 0; i < n; i++) {
      g = gapsList[i];
      if (left) { if (g.end <= x && (best === null || g.end > best)) best = g.end; }
      else if (g.start >= x && (best === null || g.start < best)) best = g.start;
    }
    return best !== null && Math.abs(best - x) <= maxMovePx ? best : x;
  }

  // 낱말 안쪽에서 끝난 검색 결과(예: "contro" 가 "control" 안)의 가장자리는 보정하지 않는다.
  // 쪽 글 text 의 [start, end) 에서 앞쪽 가장자리는 start 앞뒤 글자가 모두 공백이 아니면, 뒤쪽은 end 앞뒤 글자가 모두 공백이 아니면 낱말 안쪽.
  function edgeFlags(text, start, end) {
    var t = String(text == null ? "" : text);
    var inside = function (i) { return i > 0 && i < t.length && !/\s/.test(t.charAt(i - 1)) && !/\s/.test(t.charAt(i)); };
    return { refineLeft: !inside(start), refineRight: !inside(end) };
  }

  // 항목(entry)의 가장자리별 보정 여부. 층 기본값 layerDefault(불리언), entry.refine, entry.refineLeft / refineRight.
  // 가장자리 플래그가 불리언으로 주어지면 그 가장자리는 refine 와 상관없이 그 값을 따른다. 주어지지 않은 쪽은
  // refine(있으면)·없으면 층 기본값을 따른다. 즉 refine: true 는 양쪽, false/없음은(층 기본값이 꺼져 있으면) 양쪽 끔.
  function edgeMode(layerDefault, en) {
    var base = en && en.refine !== undefined ? !!en.refine : !!layerDefault;
    var l = en && typeof en.refineLeft === "boolean" ? en.refineLeft : base;
    var r = en && typeof en.refineRight === "boolean" ? en.refineRight : base;
    return { left: l, right: r, any: l || r };
  }

  // ---------- 보정 한 건 ----------

  function D() { return root.ReaderDoc; }

  function paramsWith(opts) {
    var o = {};
    for (var k in P) o[k] = opts && opts[k] !== undefined ? opts[k] : P[k];
    return o;
  }

  // 밝기 조각 src(캔버스 안 원점 ox,oy) 위에서 사각형 하나를 보정한다. fl/fr = 왼쪽/오른쪽 가장자리를 보정할지.
  function refineOne(src, sx, sy, r, o, fl, fr) {
    var h = r.h;
    if (!refinable(h, sx, o) || (!fl && !fr)) return r;
    var ox = src.ox, oy = src.oy;
    var bx0 = Math.floor((r.x - o.bandSide * h) * sx);
    var bx1 = Math.ceil((r.x + r.w + o.bandSide * h) * sx);
    var by0 = Math.round((r.y + o.bandTop * h) * sy);
    var by1 = Math.round((r.y + (1 - o.bandTop) * h) * sy);
    bx0 = Math.max(bx0, ox); bx1 = Math.min(bx1, ox + src.width);
    by0 = Math.max(by0, oy); by1 = Math.min(by1, oy + src.height);
    if (bx1 - bx0 < 2 || by1 - by0 < 1) return r;
    var col = columnInkLum(src, bx0 - ox, by0 - oy, bx1 - bx0, by1 - by0, o.inkDelta);
    var mg = Math.max(1, Math.round(o.minGap * h * sx));
    var gl = gaps(col, mg);
    var maxMove = o.maxMove * h * sx, thinPx = o.thin * h * sx;
    var left = r.x, right = r.x + r.w;
    if (fl) left = (snapEdge(r.x * sx - bx0, gl, maxMove, "left", thinPx, mg, col.length) + bx0) / sx - o.pad * h;
    if (fr) right = (snapEdge((r.x + r.w) * sx - bx0, gl, maxMove, "right", thinPx, mg, col.length) + bx0) / sx + o.pad * h;
    if (!(right > left) || right - left < o.minKeep * r.w) return r;
    return { x: left, y: r.y, w: right - left, h: r.h };
  }

  // 동기 보정(측정 도구·시험용): 같은 줄끼리 묶어 영역을 읽는다. rects: 쪽 좌표(배율 1).
  // opts: {canvas, pageW, pageH} 또는 생략하면 ReaderDoc 의 쪽 캔버스. 조정값도 opts 로 덮어쓸 수 있다.
  //   opts.refineLeft / opts.refineRight (기본 true): 첫 사각형의 왼쪽 / 마지막 사각형의 오른쪽 가장자리를 보정할지.
  function refineRects(page, rects, opts) {
    opts = opts || {};
    if (!rects || !rects.length) return rects || [];
    var canvas = opts.canvas, pw = opts.pageW, ph = opts.pageH;
    try {
      if (!canvas) {
        var pc = pageCanvas(page);
        canvas = pc.canvas; pw = pc.pw; ph = pc.ph;
      }
      if (!canvas || !canvas.width || !canvas.height || !(pw > 0) || !(ph > 0)) return rects;
      var ctx = canvas.getContext("2d");
      if (!ctx) return rects;
      var sx = canvas.width / pw, sy = canvas.height / ph;
      var o = paramsWith(opts);
      var last = rects.length - 1;
      var out = new Array(rects.length);
      var todo = [];
      rects.forEach(function (r, i) { if (refinable(r.h, sx, o)) todo.push(i); else out[i] = r; });
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
        var src = null;
        if (gx1 > gx0 && gy1 > gy0) {
          try { src = toLum(ctx.getImageData(gx0, gy0, gx1 - gx0, gy1 - gy0), gx0, gy0); } catch (e) { src = null; }
        }
        g.idx.forEach(function (i) {
          out[i] = src ? refineOne(src, sx, sy, rects[i], o, i > 0 || opts.refineLeft !== false, i < last || opts.refineRight !== false) : rects[i];
        });
      });
      return out;
    } catch (e) {
      return rects;
    }
  }

  // ---------- 브라우저: 쪽당 한 번 읽고, 한가할 때 계산 ----------
  // state[page] = {sig, buf, rows, cache: Map(key -> rects), queue: [job], queued: Set(key), timer, used}
  //   buf = 밝기 바이트 조각(쪽 캔버스 전체 크기). 필요한 가로 줄만 캔버스에서 읽어 채우고 rows[줄]=1 로 표시한다
  //   (히트가 적은 쪽은 몇 줄만 읽는다). 쪽이 다시 그려지거나 배율이 바뀌면 통째로 버리고, 마지막 사용 뒤 keepMs 가 지나도 푼다.
  var state = new Map();
  var listeners = [];
  var running = false;
  var STRIP = 96; // 한 번에 읽는 캔버스 줄 수 상한

  function pageCanvas(page) {
    var el = D() && D().pageEl(page);
    var canvas = el && el.querySelector(".rd-canvas");
    var sz = D() && D().pageSize(page);
    return { canvas: canvas, pw: sz && sz.w, ph: sz && sz.h };
  }

  var keyMemo = new WeakMap(); // rects 배열 -> 키(마우스를 움직일 때마다 entryAt 이 부르므로 배열마다 한 번만 만든다)
  function jobKey(rects, fl, fr) {
    var k = keyMemo.get(rects);
    if (k === undefined) {
      k = rects.map(function (r) { return r.x + "," + r.y + "," + r.w + "," + r.h; }).join(";");
      keyMemo.set(rects, k);
    }
    return (fl ? 1 : 0) + "" + (fr ? 1 : 0) + "|" + k;
  }

  function freeBuf(st) {
    st.buf = null; st.rows = null;
    if (st.timer) { clearTimeout(st.timer); st.timer = 0; }
  }

  function invalidate(page) {
    if (page === undefined || page === null) {
      state.forEach(freeBuf);
      state.clear();
    } else {
      var st = state.get(page);
      if (st) { freeBuf(st); state.delete(page); }
    }
  }

  function stateFor(page) {
    var pc = pageCanvas(page);
    var sig = pc.canvas ? pc.canvas.width + "x" + pc.canvas.height : "none";
    var st = state.get(page);
    if (st && st.sig !== sig) { freeBuf(st); st = null; state.delete(page); }
    if (!st) {
      st = { sig: sig, buf: null, rows: null, cache: new Map(), queue: [], queued: new Set(), timer: 0, used: 0 };
      state.set(page, st);
    }
    return st;
  }

  // 요청: 보정된 사각형이 준비돼 있으면 돌려주고, 없으면 null 을 돌려주며 한가할 때 계산하도록 줄 세운다.
  // 준비되면 onReady 구독자에게 쪽 번호를 알린다. 호출 쪽은 null 이면 원본을 그대로 그리면 된다.
  function request(page, rects, opts) {
    if (!rects || !rects.length) return rects || [];
    var fl = !(opts && opts.refineLeft === false), fr = !(opts && opts.refineRight === false);
    var st = stateFor(page);
    var key = jobKey(rects, fl, fr);
    var hit = st.cache.get(key);
    if (hit) return hit;
    if (!st.queued.has(key)) {
      st.queued.add(key);
      st.queue.push({ key: key, rects: rects, fl: fl, fr: fr });
      kick();
    }
    return null;
  }

  var idle = typeof requestIdleCallback === "function"
    ? function (fn) { requestIdleCallback(fn, { timeout: 250 }); }
    : function (fn) { setTimeout(fn, 16); };
  var now = typeof performance !== "undefined" ? function () { return performance.now(); } : Date.now;

  function kick() {
    if (running) return;
    running = true;
    idle(step);
  }

  // 캔버스 줄 [y0, y1) 이 버퍼에 채워지게 한다. 아직 안 읽은 줄 묶음만 읽는다. 다 됐으면 true, 시간이 다 되면 false(다음 한가한 때 이어서).
  function ensureRows(st, canvas, y0, y1, deadline) {
    var W = canvas.width, H = canvas.height;
    if (!st.buf) {
      var others = [];
      state.forEach(function (o) { if (o.buf && o !== st) others.push(o); });
      others.sort(function (a, b) { return a.used - b.used; });
      while (others.length >= P.maxBufs) freeBuf(others.shift());
      st.buf = { lum: new Uint8Array(W * H), width: W, height: H, ox: 0, oy: 0 };
      st.rows = new Uint8Array(H);
    }
    y0 = Math.max(0, y0); y1 = Math.min(H, y1);
    if (y1 <= y0) return true;
    var ctx = canvas.getContext("2d");
    var rows = st.rows, y = y0;
    while (y < y1) {
      if (rows[y]) { y++; continue; }
      var ya = y;
      while (y < y1 && !rows[y]) y++;
      for (var ys = ya; ys < y; ys += STRIP) { // 안 읽은 연속 줄만 STRIP 줄씩 읽는다
        if (now() > deadline) return false;
        var hh = Math.min(STRIP, y - ys);
        st.buf.lum.set(toLum(ctx.getImageData(0, ys, W, hh), 0, ys).lum, ys * W);
        rows.fill(1, ys, ys + hh);
      }
    }
    return true;
  }

  // 한 일(rects)이 읽을 캔버스 줄 범위. 보정할 사각형이 없으면(저해상도) null.
  function jobRows(job, sx, sy) {
    var y0 = Infinity, y1 = -Infinity;
    job.rects.forEach(function (r) {
      if (!refinable(r.h, sx, P)) return;
      y0 = Math.min(y0, Math.round((r.y + P.bandTop * r.h) * sy));
      y1 = Math.max(y1, Math.round((r.y + (1 - P.bandTop) * r.h) * sy));
    });
    return y1 > y0 ? [y0, y1] : null;
  }

  var busyMs = 0, maxStepMs = 0, steps = 0; // 진단용: 한가한 시간 계산에 쓴 시간 합, 한 번 최대, 횟수
  function step() {
    var t0 = now();
    var deadline = t0 + P.chunkMs;
    var touched = new Set();
    var more = false;
    state.forEach(function (st, page) {
      if (!st.queue.length) return;
      if (now() > deadline) { more = true; return; }
      var pc = pageCanvas(page);
      var ok = !!(pc.canvas && pc.canvas.width > 0 && pc.canvas.height > 0 && pc.pw > 0 && pc.ph > 0
        && pc.canvas.width + "x" + pc.canvas.height === st.sig);
      var sx = ok ? pc.canvas.width / pc.pw : 1, sy = ok ? pc.canvas.height / pc.ph : 1;
      st.used = now();
      while (st.queue.length && now() <= deadline) {
        var job = st.queue[0];
        if (ok) {
          try {
            var rows = jobRows(job, sx, sy);
            if (rows && !ensureRows(st, pc.canvas, rows[0], rows[1], deadline)) { more = true; break; }
          } catch (e) { ok = false; }
        }
        st.queue.shift();
        st.queued.delete(job.key);
        var res = job.rects;
        if (ok && st.buf) {
          var last = job.rects.length - 1;
          res = job.rects.map(function (r, i) {
            return refineOne(st.buf, sx, sy, r, P, i > 0 || job.fl, i < last || job.fr);
          });
        }
        st.cache.set(job.key, res);
        touched.add(page);
      }
      if (st.queue.length) more = true;
      else if (st.buf) {
        if (st.timer) clearTimeout(st.timer);
        st.timer = setTimeout(function () { st.timer = 0; freeBuf(st); }, P.keepMs);
      }
    });
    running = false;
    var dt = now() - t0;
    busyMs += dt; steps++; if (dt > maxStepMs) maxStepMs = dt;
    if (more) kick();
    touched.forEach(function (p) {
      listeners.forEach(function (fn) { try { fn(p); } catch (e) { console.error("[reader] 보정 알림 실패", e); } });
    });
  }

  function onReady(fn) { listeners.push(fn); }

  // 시험·진단용: 버퍼 상태
  function _stats() {
    var bytes = 0, pages = 0, jobs = 0, cached = 0;
    state.forEach(function (st) {
      if (st.buf) { bytes += st.buf.lum.length; pages++; }
      jobs += st.queue.length; cached += st.cache.size;
    });
    return { bufferPages: pages, bufferBytes: bytes, pendingJobs: jobs, cachedJobs: cached, running: running, busyMs: busyMs, maxStepMs: maxStepMs, steps: steps };
  }

  var api = {
    columnInk: columnInk,
    columnInkLum: columnInkLum,
    toLum: toLum,
    gaps: gaps,
    snapEdge: snapEdge,
    refinable: refinable,
    edgeFlags: edgeFlags,
    edgeMode: edgeMode,
    refineRects: refineRects,
    request: request,
    onReady: onReady,
    invalidate: invalidate,
    _stats: _stats,
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
      el.addEventListener("reader:docclose", function () { invalidate(); });
    };
    bind();
  }
})(typeof window !== "undefined" ? window : globalThis);
