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
    warmIdleMs: 300,      // 현재 쪽이 이만큼 머물면 그 쪽 잉크를 미리 읽는다
    keepMs: 4000,         // 쪽 잉크 버퍼를 마지막 사용 뒤 이만큼 두었다가 풀어 준다
    keepCurMs: 30000,     // 지금 보는 쪽의 버퍼는 이만큼 둔다(그 쪽에 표시를 하면 바로 보정되도록)
    retryMs: 1500,        // 잉크를 읽지 못했을 때 한 번 다시 시도하기까지의 시간
    syncMs: 8,            // 요청 즉시(동기) 보정에 쓰는 시간 예산(50ms 창마다)
    syncMax: 200,         // 동기 보정할 최대 사각형 수
    trimDelta: 12,        // 줄 끝·처음을 줄이기 전에 다시 확인할 때 쓰는 낮은 밝기 차이
    trimMargin: 0.08,     // 그 확인에서 사각형 위아래로 더 보는 여백(높이 대비)
    punctWin: 0.5,        // 문장부호 옆 가장자리: 글자 상자 경계 둘레로 글자 폭의 이만큼 안에서 틈을 찾는다
    maxBufs: 3,           // 동시에 들고 있는 쪽 버퍼 수
    chunkMs: 6,           // 한가한 시간 한 번에 쓰는 최대 시간
    hiMin: 2,             // 화면 배율과 무관하게 잉크를 읽는 쪽 렌더 배율의 하한
    hiTarget: 20,         // 사각형 높이가 이만큼의 픽셀이 되도록 렌더 배율을 정한다(작은 글자도 보정 기준 16.7px 를 넘기려고)
    hiMaxScale: 4,        // 렌더 배율 상한
    hiMaxPixels: 9e6,     // 쪽 하나의 렌더 픽셀 상한(메모리 보호). 넘으면 배율을 낮춘다
    cellWin: 0.6,         // 글자 칸 나누기: 예상 경계 둘레로 칸 폭의 이만큼 안에서 골짜기를 찾는다
    cellDepth: 0.5,       // 고른 골짜기의 잉크 양이 낱말 안 열 잉크 양 중앙값의 이 비율을 넘으면 골짜기가 없는 것으로 보고 건드리지 않는다
    cellA: 2,             // 골짜기 고르기 비용: 잉크 양(중앙값 대비) 가중치
    cellB: 4,             // 골짜기 고르기 비용: 예상 위치에서 떨어진 거리(칸 폭 단위 제곱) 가중치
    cellMin: 0.1,           // 글자 칸 경계가 원래 자리에서 이보다(높이 대비) 가까우면 옮기지 않는다
    cellZero: 1,          // 1 이면 잉크가 전혀 없는 열이 있는 골짜기만 쓴다
    cellMove: 1,          // 글자 칸 경계로 옮길 수 있는 최대 거리(사각형 높이 대비)
    cellRatio: 0.25,      // 낱말 잉크 폭이 예상 폭과 이 비율 넘게 다르면 칸 나누기를 하지 않는다
    trimMin: 0.5,         // 줄 끝·처음에서 잉크 없는 여백이 이 길이(사각형 높이 대비)를 넘으면 마지막/첫 잉크까지 줄인다
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

  // columnInkLum 과 같은 방식으로 띠를 읽되, 열마다 잉크 픽셀 수를 센다(글자 칸 나누기의 골짜기 깊이).
  function columnCounts(src, x0, y0, w, h, delta) {
    var out = new Uint16Array(Math.max(0, w));
    var W = src.width, H = src.height, d = src.lum;
    var xa = Math.max(0, x0), xb = Math.min(W, x0 + w);
    var ya = Math.max(0, y0), yb = Math.min(H, y0 + h);
    if (xb <= xa || yb <= ya) return out;
    var thr = delta === undefined ? P.inkDelta : delta;
    var hist = new Uint32Array(16), sum = new Float64Array(16);
    var x, y, p, L;
    for (y = ya; y < yb; y++) {
      p = y * W + xa;
      for (x = xa; x < xb; x++, p++) { L = d[p]; hist[L >> 4]++; sum[L >> 4] += L; }
    }
    var best = 0;
    for (var i = 1; i < 16; i++) if (hist[i] > hist[best]) best = i;
    var bg = sum[best] / hist[best];
    for (y = ya; y < yb; y++) {
      p = y * W + xa;
      for (x = xa; x < xb; x++, p++) {
        L = d[p] - bg;
        if (L > thr || -L > thr) out[x - x0]++;
      }
    }
    return out;
  }

  // 글자 칸 나누기(순수): 낱말의 열 잉크 양 counts(L..R 가 낱말의 잉크 폭, 열 번호)를 n 칸으로 나누는 n-1 개 경계를 고른다.
  // 예상 경계 pred[1..n-1](열, 소수 가능) 둘레 ±win 안의 열 중, 잉크 양이 적고 예상에 가까운 것을 순서가 뒤바뀌지 않게 동적 계획으로 고른다.
  // 반환: [{c, a, b, ok}] (경계 j=1..n-1 → 인덱스 j-1). c = 고른 열, [a, b) = 그 열을 포함한 잉크 최소 구간(0 이면 잉크 없는 틈, 아니면 한 열),
  // ok = 골짜기가 뚜렷한가(잉크 양이 낱말 안 중앙값의 depth 배 이하).
  function cellBoundaries(counts, L, R, pred, win, depth, wa, wb) {
    var A = wa === undefined ? P.cellA : wa, B = wb === undefined ? P.cellB : wb;
    var n = pred.length + 1;
    if (n < 2 || !(R > L)) return null;
    var cw = (R - L) / n;
    var med = (function () {
      var a = [];
      for (var i = Math.max(0, Math.floor(L)); i < Math.min(counts.length, Math.ceil(R)); i++) if (counts[i] > 0) a.push(counts[i]);
      if (!a.length) return 0;
      a.sort(function (x, y) { return x - y; });
      return a[a.length >> 1];
    })();
    if (!(med > 0)) return null;
    var w = Math.max(1, Math.round(win * cw));
    var cand = [], cost = [], from = [];
    var j, i, k;
    for (j = 0; j < pred.length; j++) {
      var lo = Math.max(Math.ceil(L) + 1, Math.round(pred[j]) - w), hi = Math.min(Math.floor(R) - 1, Math.round(pred[j]) + w);
      var cs = [];
      for (i = lo; i <= hi; i++) cs.push(i);
      if (!cs.length) cs.push(Math.max(0, Math.min(counts.length - 1, Math.round(pred[j]))));
      cand.push(cs);
      var cj = new Array(cs.length), fj = new Array(cs.length);
      for (i = 0; i < cs.length; i++) {
        var dx = (cs[i] - pred[j]) / cw;
        var local = A * counts[cs[i]] / med + dx * dx * B;
        var bestc = j === 0 ? 0 : Infinity, bestk = -1;
        if (j > 0) {
          for (k = 0; k < cand[j - 1].length; k++) {
            if (cand[j - 1][k] < cs[i] && cost[j - 1][k] < bestc) { bestc = cost[j - 1][k]; bestk = k; }
          }
          if (bestk < 0) { bestc = Infinity; }
        }
        cj[i] = bestc + local; fj[i] = bestk;
      }
      cost.push(cj); from.push(fj);
    }
    var bi = -1, bc = Infinity;
    for (i = 0; i < cand[pred.length - 1].length; i++) if (cost[pred.length - 1][i] < bc) { bc = cost[pred.length - 1][i]; bi = i; }
    if (bi < 0 || bc === Infinity) return null;
    var res = new Array(pred.length);
    for (j = pred.length - 1; j >= 0; j--) {
      var c = cand[j][bi];
      var m = counts[c];
      var a = c, b = c + 1;
      while (a > 0 && counts[a - 1] <= m) a--;
      while (b < counts.length && counts[b] <= m) b++;
      res[j] = { c: c, a: a, b: b, ok: m <= depth * med };
      bi = from[j][bi];
    }
    return res;
  }

  // 검색 결과의 낱말 안쪽 가장자리용 글자 칸 정보(순수). text/boxes = 쪽 글·글자 상자, [start,end) = 검색 범위.
  // 낱말(공백 아닌 연속 구간) 전체가 한 줄에 놓이고 모든 글자에 상자가 있을 때만 {cellLeft / cellRight: {cells:[x0..xn], k}} 를 돌려준다.
  // cells = 낱말 글자들의 경계 예상 위치(쪽 좌표, n+1 개), k = 이 가장자리가 놓인 경계 번호(1..n-1). 해당 없으면 빈 객체.
  function cellEdges(text, boxes, start, end) {
    var res = {};
    var t = String(text == null ? "" : text);
    if (!boxes || !(end > start)) return res;
    var inside = function (i) { return i > 0 && i < t.length && !/\s/.test(t.charAt(i - 1)) && !/\s/.test(t.charAt(i)); };
    var one = function (pos) {
      var ws = pos, we = pos;
      while (ws > 0 && !/\s/.test(t.charAt(ws - 1))) ws--;
      while (we < t.length && !/\s/.test(t.charAt(we))) we++;
      var n = we - ws;
      if (n < 3 || n > 40) return null;
      var xs = [];
      var y0 = Infinity, y1 = -Infinity, i;
      for (i = ws; i < we; i++) {
        var b = boxes[i];
        if (!b || !(b.w > 0)) return null;
        xs.push(b.x);
        if (b.y < y0) y0 = b.y;
        if (b.y + b.h > y1) y1 = b.y + b.h;
      }
      xs.push(boxes[we - 1].x + boxes[we - 1].w);
      // 한 줄: 모든 글자 상자가 같은 높이띠에 있고 가로로 차례대로 놓여야 한다.
      var hh = y1 - y0;
      for (i = ws; i < we; i++) {
        if (boxes[i].h < 0.6 * hh || boxes[i].y - y0 > 0.4 * hh) return null;
        if (i > ws && boxes[i].x < boxes[i - 1].x - 0.2 * boxes[i].h) return null;
      }
      return { cells: xs, k: pos - ws };
    };
    if (inside(start)) { var l = one(start); if (l) res.cellLeft = l; }
    if (inside(end)) { var r = one(end); if (r) res.cellRight = r; }
    return res;
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
    var res = { refineLeft: !inside(start), refineRight: !inside(end) };
    // 범위 바로 뒤가 닫는 문장부호·괄호(또는 바로 앞이 여는 괄호·따옴표)면, 낱말 틈 대신 글자와 기호 사이의 잉크 틈에 맞춘다(snapLeft / snapRight).
    var ns = function (i) { return i >= 0 && i < t.length && !/\s/.test(t.charAt(i)); };
    if (!res.refineRight && ns(end - 1) && CLOSERS.indexOf(t.charAt(end)) >= 0) res.snapRight = true;
    if (!res.refineLeft && ns(start) && OPENERS.indexOf(t.charAt(start - 1)) >= 0) res.snapLeft = true;
    return res;
  }
  var CLOSERS = ")]}>.,;:!?’”»」』〉》】〕\"'";
  var OPENERS = "([{<‘“«「『〈《【〔\"'";

  // 항목(entry)의 가장자리별 보정 여부. 층 기본값 layerDefault(불리언), entry.refine, entry.refineLeft / refineRight.
  // 가장자리 플래그가 불리언으로 주어지면 그 가장자리는 refine 와 상관없이 그 값을 따른다. 주어지지 않은 쪽은
  // refine(있으면)·없으면 층 기본값을 따른다. 즉 refine: true 는 양쪽, false/없음은(층 기본값이 꺼져 있으면) 양쪽 끔.
  function edgeMode(layerDefault, en) {
    var base = en && en.refine !== undefined ? !!en.refine : !!layerDefault;
    var l = en && typeof en.refineLeft === "boolean" ? en.refineLeft : base;
    var r = en && typeof en.refineRight === "boolean" ? en.refineRight : base;
    if (en && !l && en.snapLeft && typeof en.snapLeft === "object") l = en.snapLeft;
    if (en && !r && en.snapRight && typeof en.snapRight === "object") r = en.snapRight;
    if (en && !l && en.cellLeft && typeof en.cellLeft === "object") l = en.cellLeft;
    if (en && !r && en.cellRight && typeof en.cellRight === "object") r = en.cellRight;
    return { left: l, right: r, any: !!(l || r) };
  }

  // ---------- 보정 한 건 ----------

  function D() { return root.ReaderDoc; }

  function paramsWith(opts) {
    var o = {};
    for (var k in P) o[k] = opts && opts[k] !== undefined ? opts[k] : P[k];
    return o;
  }

  // 낱말 안쪽 가장자리: 낱말(f.cells = 글자 경계 예상 x 들, f.k = 이 가장자리의 경계 번호)의 잉크 열 분포를 글자 수만큼의 칸으로 나눠
  // 경계 k 의 실제 위치를 쪽 좌표로 돌려준다. 골짜기가 뚜렷하지 않거나 어긋남이 크면 null(원래 자리).
  function cellEdgeX(src, sx, sy, r, o, f, side) {
    var cells = f.cells, n = cells.length - 1, k = f.k, h = r.h;
    if (n < 3 || !(k > 0 && k < n)) return null;
    var ox = src.ox, oy = src.oy;
    var bx0 = Math.max(ox, Math.floor((cells[0] - o.bandSide * h) * sx));
    var bx1 = Math.min(ox + src.width, Math.ceil((cells[n] + o.bandSide * h) * sx));
    var by0 = Math.max(oy, Math.round((r.y + o.bandTop * h) * sy));
    var by1 = Math.min(oy + src.height, Math.round((r.y + (1 - o.bandTop) * h) * sy));
    if (bx1 - bx0 < 4 || by1 - by0 < 1) return null;
    var counts = columnCounts(src, bx0 - ox, by0 - oy, bx1 - bx0, by1 - by0, o.inkDelta);
    var col = new Uint8Array(counts.length);
    for (var i = 0; i < counts.length; i++) col[i] = counts[i] > 0 ? 1 : 0;
    var mg = Math.max(1, Math.round(o.minGap * h * sx));
    var gl = gaps(col, mg);
    var maxMove = o.maxMove * h * sx, thinPx = o.thin * h * sx;
    var predL = cells[0] * sx - bx0, predR = cells[n] * sx - bx0;
    var L = snapEdge(predL, gl, maxMove, "left", thinPx, mg, col.length);
    var R = snapEdge(predR, gl, maxMove, "right", thinPx, mg, col.length);
    var pw = predR - predL;
    if (!(R > L) || Math.abs((R - L) - pw) > o.cellRatio * pw) { L = predL; R = predR; }
    var pred = [];
    for (var j = 1; j < n; j++) pred.push(L + (cells[j] - cells[0]) * sx * (R - L) / pw);
    var bd = cellBoundaries(counts, L, R, pred, o.cellWin, o.cellDepth, o.cellA, o.cellB);
    if (!bd || !bd[k - 1] || !bd[k - 1].ok) return null;
    var v = bd[k - 1];
    var x = side === "left" ? (v.b + bx0) / sx - o.pad * h : (v.a + bx0) / sx + o.pad * h;
    var raw = (side === "left" ? r.x : r.x + r.w);
    if (Math.abs(x - raw) > o.cellMove * h || Math.abs(x - raw) < o.cellMin * h) return null;
    if (o.cellZero && counts[v.c] > 0) return null;
    return x;
  }

  // 밝기 조각 src(캔버스 안 원점 ox,oy) 위에서 사각형 하나를 보정한다. fl/fr = 왼쪽/오른쪽 가장자리를 보정할지.
  // (낱말 안쪽 가장자리를 글자 사이 틈에 맞추는 시도는 측정에서 이득이 없어 뺐다. 보고서 참조.)
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
    var xl = r.x * sx - bx0, xr = (r.x + r.w) * sx - bx0;
    // 줄 처음·끝을 줄이기 전의 재확인: 사각형 전체 높이(+여백)에서 낮은 문턱으로 본 잉크 열. 가운데 띠에서 안 보이는 옅은 글자·밑줄·위아래 가장자리의 표시를 살린다.
    var full = {};
    var fullCols = function (delta) {
      var dk = delta === undefined ? o.trimDelta : delta;
      if (full[dk]) return full[dk];
      var m = o.trimMargin * h;
      var fy0 = Math.max(oy, Math.floor((r.y - m) * sy)), fy1 = Math.min(oy + src.height, Math.ceil((r.y + h + m) * sy));
      full[dk] = fy1 > fy0 ? columnInkLum(src, bx0 - ox, fy0 - oy, bx1 - bx0, fy1 - fy0, dk) : col;
      return full[dk];
    };
    // 문장부호·괄호 옆 가장자리: 글자 상자 경계(c) 둘레 반경 r 안에서 잉크 없는 틈을 찾는다. 없으면 null(원래 자리).
    var punctEdge = function (sn, side) {
      var fc = fullCols(o.inkDelta); // 글자와 기호 사이 틈은 번져서 옅다: 문턱을 낮추면 틈이 메워진다
      var c = sn.c * sx - bx0, rad = Math.max(1, sn.r * sx);
      var best = null, bd = Infinity, i = 0, n = fc.length;
      while (i < n) {
        if (fc[i]) { i++; continue; }
        var a = i;
        while (i < n && !fc[i]) i++;
        var d = c < a ? a - c : (c > i ? c - i : 0);
        if (d <= rad && d < bd) { bd = d; best = { a: a, b: i }; }
      }
      if (!best) return null;
      var inkBefore = best.a > 0, inkAfter = best.b < n;
      var pos;
      if (inkBefore && inkAfter) pos = (best.a + best.b) / 2;
      else if (side === "right") pos = best.a;
      else pos = best.b;
      return (pos + bx0) / sx;
    };
    if (fl) {
      if (typeof fl === "object" && fl.cells) {
        var cl = cellEdgeX(src, sx, sy, r, o, fl, "left");
        if (cl !== null) left = Math.min(r.x + r.w, cl);
      } else if (typeof fl === "object") {
        var pl = punctEdge(fl, "left");
        if (pl !== null) left = Math.min(r.x + r.w, pl);
      } else {
        left = (snapEdge(xl, gl, maxMove, "left", thinPx, mg, col.length) + bx0) / sx - o.pad * h;
        // 줄 처음 쪽에 잉크 없는 긴 여백이 있으면 첫 잉크까지 줄인다(글자 상자가 실제보다 앞서 시작한 경우).
        var il = Math.max(0, Math.ceil(xl));
        while (il < col.length && !col[il]) il++;
        if (il < col.length && il - xl > o.trimMin * h * sx && il < xr) {
          var fc1 = fullCols();
          il = Math.max(0, Math.ceil(xl));
          while (il < fc1.length && !fc1[il]) il++;
          if (il < fc1.length && il - xl > o.trimMin * h * sx && il < xr) left = Math.max(left, (il + bx0) / sx - o.pad * h);
        }
      }
    }
    if (fr) {
      if (typeof fr === "object" && fr.cells) {
        var cr = cellEdgeX(src, sx, sy, r, o, fr, "right");
        if (cr !== null) right = Math.max(r.x, cr);
      } else if (typeof fr === "object") {
        var pr = punctEdge(fr, "right");
        if (pr !== null) right = Math.max(r.x, pr);
      } else {
        right = (snapEdge(xr, gl, maxMove, "right", thinPx, mg, col.length) + bx0) / sx + o.pad * h;
        // 줄 끝 쪽: 마지막 잉크 뒤로 잉크 없는 긴 여백이 이어지면 마지막 잉크까지 줄인다(글자 상자가 실제보다 뒤까지 간 경우).
        var ir = Math.min(col.length - 1, Math.floor(xr) - 1);
        while (ir >= 0 && !col[ir]) ir--;
        if (ir >= 0 && xr - (ir + 1) > o.trimMin * h * sx && ir + 1 > xl) {
          var fc2 = fullCols();
          ir = Math.min(fc2.length - 1, Math.floor(xr) - 1);
          while (ir >= 0 && !fc2[ir]) ir--;
          if (ir >= 0 && xr - (ir + 1) > o.trimMin * h * sx && ir + 1 > xl) right = Math.min(right, (ir + 1 + bx0) / sx + o.pad * h);
        }
      }
    }
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
        // 낱말 안쪽 가장자리(글자 칸 나누기)는 낱말 전체의 잉크를 본다.
        [[0, opts.refineLeft], [last, opts.refineRight]].forEach(function (e) {
          var f = e[1];
          if (g.idx.indexOf(e[0]) < 0 || !f || typeof f !== "object" || !f.cells) return;
          var hh = rects[e[0]].h;
          gx0 = Math.max(0, Math.min(gx0, Math.floor((f.cells[0] - o.bandSide * hh) * sx) - 1));
          gx1 = Math.min(canvas.width, Math.max(gx1, Math.ceil((f.cells[f.cells.length - 1] + o.bandSide * hh) * sx) + 1));
        });
        var gy0 = Math.max(0, Math.floor(g.y0 * sy)), gy1 = Math.min(canvas.height, Math.ceil(g.y1 * sy));
        var src = null;
        if (gx1 > gx0 && gy1 > gy0) {
          try { src = toLum(ctx.getImageData(gx0, gy0, gx1 - gx0, gy1 - gy0), gx0, gy0); } catch (e) { src = null; }
        }
        g.idx.forEach(function (i) {
          out[i] = src ? refineOne(src, sx, sy, rects[i], o, i > 0 || edgeOpt(opts.refineLeft), i < last || edgeOpt(opts.refineRight)) : rects[i];
        });
      });
      return out;
    } catch (e) {
      return rects;
    }
  }

  // ---------- 브라우저: 쪽당 한 번 고해상도로 읽고, 한가할 때 계산 ----------
  // 잉크는 화면 캔버스가 아니라 쪽을 따로 오프스크린에 그려(배율 = 화면 배율과 무관, 작은 글자도 보정 기준을 넘도록) 읽는다.
  // 사각형은 쪽 좌표(배율 1)라 그 결과는 어느 확대 배율에서도 그대로 맞으므로, 계산한 결과(cache)는 확대·축소와 쪽 다시 그리기에도 버리지 않는다
  // (문서를 열고 닫을 때만 버린다). 밝기 버퍼는 마지막 사용 뒤 keepMs 가 지나거나 확대 배율이 바뀌면 풀어 준다.
  // state[page] = {cache: Map(key -> rects), queue: [job], queued: Set(key), buf, build, timer, used, token}
  //   buf = {lum, width, height, ox, oy, scale} 밝기 바이트 조각(쪽 전체, 배율 scale).
  //   build = 만드는 중: {scale, task, canvas, ctx, W, H, y, lum, t0}. 그리기가 끝나면 STRIP 줄씩 한가한 시간에 밝기로 바꾼다.
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
  function edgeOpt(v) { return v === false ? false : (v && typeof v === "object" ? v : true); }
  function edgeKey(f) {
    if (f && typeof f === "object") return f.cells ? "c" + f.k + ":" + f.cells.map(function (v) { return Math.round(v * 100); }).join(",") + ";" : "s" + f.c + ":" + f.r;
    return f ? "1" : "0";
  }
  var syncWin = 0, syncSpent = 0;
  function jobKey(rects, fl, fr) {
    var k = keyMemo.get(rects);
    if (k === undefined) {
      k = rects.map(function (r) { return r.x + "," + r.y + "," + r.w + "," + r.h; }).join(";");
      keyMemo.set(rects, k);
    }
    return edgeKey(fl) + edgeKey(fr) + "|" + k;
  }

  var cnt = { maxFlushMs: 0, maxStripMs: 0, maxJobMs: 0, builds: 0, buildMs: 0, convertMs: 0, refineMs: 0, refined: 0, peakBytes: 0 };

  function liveBytes() {
    var n = 0;
    state.forEach(function (st) {
      if (st.buf) n += st.buf.lum.length;
      if (st.build) { if (st.build.lum) n += st.build.lum.length; if (st.build.canvas) n += st.build.canvas.width * st.build.canvas.height * 4; }
    });
    return n;
  }
  function notePeak() { var n = liveBytes(); if (n > cnt.peakBytes) cnt.peakBytes = n; }

  function dropBuild(st) {
    var b = st.build;
    if (!b) return;
    st.build = null;
    st.token++;
    if (b.task) { try { b.task.cancel(); } catch (e) { /* 이미 끝남 */ } }
    if (b.canvas) { b.canvas.width = 0; b.canvas.height = 0; b.canvas = null; }
    b.lum = null;
  }
  function freeBuf(st) {
    dropBuild(st);
    st.buf = null;
    if (st.timer) { clearTimeout(st.timer); st.timer = 0; }
  }

  // page 생략: 모두. 계산 결과까지 버린다(문서를 열고 닫을 때).
  function invalidate(page) {
    if (page === undefined || page === null) {
      state.forEach(freeBuf);
      state.clear();
      running = false;
    } else {
      var st = state.get(page);
      if (st) { freeBuf(st); state.delete(page); }
    }
  }

  // 밝기 버퍼만 풀고 계산 결과는 둔다(확대 배율이 바뀔 때). 줄 서 있던 일은 버리며, 다시 그려지는 겹침층이 다시 request 한다.
  function release() {
    state.forEach(function (st) { freeBuf(st); st.queue = []; st.queued = new Set(); });
  }

  function stateFor(page) {
    var st = state.get(page);
    if (!st) {
      st = { cap: 0, fails: 0, retryAt: 0, cache: new Map(), queue: [], queued: new Set(), buf: null, build: null, timer: 0, used: 0, token: 0, warm: false, hint: 0 };
      state.set(page, st);
    }
    return st;
  }

  // 요청: 보정된 사각형이 준비돼 있으면 돌려주고, 없으면 null 을 돌려주며 한가할 때 계산하도록 줄 세운다.
  // 준비되면 onReady 구독자에게 쪽 번호를 알린다. 호출 쪽은 null 이면 원본을 그대로 그리면 된다.
  function request(page, rects, opts) {
    if (!rects || !rects.length) return rects || [];
    var fl = edgeOpt(opts && opts.refineLeft), fr = edgeOpt(opts && opts.refineRight);
    var st = stateFor(page);
    var key = jobKey(rects, fl, fr);
    var hit = st.cache.get(key);
    if (hit) return hit;
    // 쪽 버퍼가 이미 있으면 같은 프레임에 바로 보정한다(그렸다가 줄어드는 현상 방지). 예산을 넘거나 해상도가 모자라면 아래 비동기 경로로.
    if (st.buf && rects.length <= P.syncMax) {
      var t = now();
      if (t - syncWin > 50) { syncWin = t; syncSpent = 0; }
      if (syncSpent < P.syncMs && !needsRebuild(st, st.buf, rects)) {
        var res = refineJob(st.buf, rects, fl, fr);
        syncSpent += now() - t;
        st.cache.set(key, res);
        st.used = now();
        armTimer(st, page);
        return res;
      }
    }
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

  // 쪽 크기에서 낼 수 있는 렌더 배율 상한(1/8 단위로 내림). 픽셀 예산을 넘지 않는다.
  function capScale(pw, ph) {
    var c = Math.min(P.hiMaxScale, Math.sqrt(P.hiMaxPixels / Math.max(1, pw * ph)));
    return Math.floor(c * 8) / 8;
  }

  // 이 쪽 일에 알맞은 렌더 배율: 줄 선 사각형 중 가장 낮은 것도 보정 기준(minGapPx/minGap)을 넘도록(하한 hiMin), 상한 안에서.
  function wantScale(st, pw, ph) {
    var hmin = Infinity;
    st.queue.forEach(function (j) { j.rects.forEach(function (r) { if (r.h > 0 && r.h < hmin) hmin = r.h; }); });
    if (hmin === Infinity && st.hint > 0) hmin = st.hint; // 미리 읽기(warm): 쪽의 작은 글자 높이로 정한다
    var s = P.hiMin;
    if (hmin < Infinity) s = Math.max(s, Math.ceil(P.minGapPx / P.minGap / hmin * 8 + 1e-6) / 8);
    return Math.min(s, capScale(pw, ph));
  }

  // 버퍼 해상도가 모자라 보정 못 하는 사각형이 있고 더 높일 수 있으면 true(그 쪽은 더 높은 배율로 다시 읽는다).
  function needsRebuild(st, buf, rects) {
    if (!(st.cap > buf.scale + 1e-9)) return false;
    for (var i = 0; i < rects.length; i++) if (rects[i].h > 0 && !refinable(rects[i].h, buf.scale, P)) return true;
    return false;
  }

  function refineJob(buf, rects, fl, fr) {
    var tr = now(), last = rects.length - 1;
    var res = rects.map(function (r, i) {
      return refineOne(buf, buf.scale, buf.scale, r, P, i > 0 ? true : fl, i < last ? true : fr);
    });
    var dt = now() - tr;
    cnt.refineMs += dt; cnt.refined++;
    if (dt > cnt.maxJobMs) cnt.maxJobMs = dt;
    return res;
  }

  // 쪽 버퍼를 둘 시간: 지금 보는 쪽은 길게.
  function armTimer(st, page) {
    if (st.timer) clearTimeout(st.timer);
    var cur = D() && D().currentPage ? D().currentPage() : 0;
    var ms = page === cur ? P.keepCurMs : P.keepMs;
    st.timer = setTimeout(function () { st.timer = 0; freeBuf(st); }, ms);
  }

  function startBuild(st, page, pw, ph) {
    var others = [];
    state.forEach(function (o) { if ((o.buf || o.build) && o !== st) others.push(o); });
    others.sort(function (a, b) { return a.used - b.used; });
    while (others.length >= P.maxBufs) freeBuf(others.shift());
    st.cap = capScale(pw, ph);
    var s = wantScale(st, pw, ph);
    var token = ++st.token;
    var b = { scale: s, task: null, canvas: null, ctx: null, W: 0, H: 0, y: 0, lum: null, t0: now(), rendered: false, failed: false };
    st.build = b;
    var fail = function () { if (st.build === b) { b.failed = true; kick(); } };
    D().getPage(page).then(function (pg) {
      if (st.token !== token || st.build !== b) return null;
      var vp = pg.getViewport({ scale: s });
      b.W = Math.ceil(vp.width); b.H = Math.ceil(vp.height);
      var c = document.createElement("canvas");
      c.width = b.W; c.height = b.H;
      b.canvas = c;
      b.ctx = c.getContext("2d", { willReadFrequently: true });
      b.lum = new Uint8Array(b.W * b.H);
      notePeak();
      b.task = pg.render({ canvasContext: b.ctx, viewport: vp });
      return b.task.promise.then(function () { if (st.build === b) { b.rendered = true; b.task = null; kick(); } });
    }).catch(function () { fail(); });
  }

  // 만드는 중인 버퍼의 캔버스를 deadline 까지 밝기로 바꾼다. 끝나면 true.
  function convert(st, b, deadline) {
    var t0 = now();
    // 처음 읽을 때 캔버스에 쌓인 그리기가 한꺼번에 래스터화된다(15~60ms). 그 한 번만 따로 한 조각으로 치러 다른 일과 겹치지 않게 한다.
    if (!b.flushed) {
      b.flushed = true;
      try { b.ctx.getImageData(0, 0, 1, 1); } catch (e) { /* 아래 줄 읽기에서 다시 실패한다 */ }
      cnt.convertMs += now() - t0; if (now() - t0 > cnt.maxFlushMs) cnt.maxFlushMs = now() - t0;
      return false;
    }
    while (b.y < b.H) {
      if (now() > deadline) { cnt.convertMs += now() - t0; return false; }
      var hh = Math.min(STRIP, b.H - b.y);
      var ts = now();
      try {
        b.lum.set(toLum(b.ctx.getImageData(0, b.y, b.W, hh), 0, b.y).lum, b.y * b.W);
      } catch (e) { // 캔버스를 읽지 못했다: 이 만들기는 실패로 치고 step 이 처리한다
        b.failed = true;
        cnt.convertMs += now() - t0;
        return false;
      }
      b.y += hh;
      if (now() - ts > cnt.maxStripMs) cnt.maxStripMs = now() - ts;
    }
    cnt.convertMs += now() - t0;
    st.buf = { lum: b.lum, width: b.W, height: b.H, ox: 0, oy: 0, scale: b.scale };
    b.canvas.width = 0; b.canvas.height = 0; b.canvas = null; b.ctx = null;
    st.build = null;
    cnt.builds++; cnt.buildMs += now() - b.t0;
    return true;
  }

  var busyMs = 0, maxStepMs = 0, steps = 0; // 진단용: 한가한 시간 계산에 쓴 시간 합, 한 번 최대, 횟수
  function step() {
    var t0 = now();
    var out = null;
    try {
      out = stepBody(t0);
    } catch (e) {
      console.error("[reader] 잉크 보정 실패", e);
    } finally {
      running = false; // 예외가 나도 다음 요청이 다시 돌릴 수 있게
    }
    var dt = now() - t0;
    busyMs += dt; steps++; if (dt > maxStepMs) maxStepMs = dt;
    if (!out) return;
    if (out.more) kick();
    out.touched.forEach(function (p) {
      listeners.forEach(function (fn) { try { fn(p); } catch (e) { console.error("[reader] 보정 알림 실패", e); } });
    });
  }

  function stepBody(t0) {
    var deadline = t0 + P.chunkMs;
    var touched = new Set();
    var more = false;
    // 한 번에 한 쪽만 그린다. 지금 보는 쪽에 가까운 쪽부터.
    var cur = D() && D().currentPage ? D().currentPage() : 0;
    var pages = [];
    var building = false;
    state.forEach(function (st, page) {
      if (st.queue.length || st.build || st.warm) pages.push(page);
      if (st.build) building = true;
    });
    pages.sort(function (x, y) { return Math.abs(x - cur) - Math.abs(y - cur) || x - y; });
    pages.forEach(function (page) {
      var st = state.get(page);
      if (!st.queue.length && !st.build && !st.warm) return;
      if (st.retryAt && now() < st.retryAt) return; // 읽기에 실패해 잠시 쉬는 중: 때가 되면 타이머가 kick 한다
      if (now() > deadline) { more = true; return; }
      var pc = pageCanvas(page);
      var shown = !!(D() && D().getPage && pc.canvas && pc.canvas.width > 0 && pc.pw > 0 && pc.ph > 0);
      if (!shown) { // 쪽이 화면에서 사라졌다: 일을 접는다(다시 그려지면 겹침층이 다시 요청한다)
        st.queue = []; st.queued = new Set(); st.warm = false;
        if (st.build) dropBuild(st);
        return;
      }
      if (st.buf && st.warm) { st.warm = false; st.used = now(); armTimer(st, page); }
      if (!st.buf && !st.build && (st.queue.length || st.warm)) {
        if (building) return; // 다른 쪽을 그리는 중: 끝나면 kick 된다
        st.warm = false;
        st.used = now();
        startBuild(st, page, pc.pw, pc.ph);
        building = true;
      }
      st.used = now();
      if (st.build) {
        var b = st.build;
        if (b.failed) {
          // 고해상도로 읽지 못했다: 처음 한 번은 줄을 그대로 두고 잠시 뒤 다시 시도한다. 두 번째도 실패하면 원본 그대로 확정한다.
          dropBuild(st);
          st.fails++;
          if (st.fails <= 1) {
            st.retryAt = now() + P.retryMs;
            setTimeout(function () { st.retryAt = 0; if (state.get(page) === st) kick(); }, P.retryMs);
            return;
          }
        } else if (!b.rendered || !convert(st, b, deadline)) {
          if (b.rendered && !b.failed) more = true;
          else if (b.failed) more = true; // 다음 step 에서 실패를 처리한다
          return;
        }
      }
      var buf = st.buf, drained = false;
      while (st.queue.length && now() <= deadline) {
        var job = st.queue[0];
        // 버퍼 해상도가 모자라 보정 못 하는 사각형이 있고 더 높일 수 있으면: 일을 그대로 두고 더 높은 배율로 다시 읽는다.
        if (buf && needsRebuild(st, buf, job.rects)) { freeBuf(st); buf = null; more = true; break; }
        st.queue.shift();
        st.queued.delete(job.key);
        var res = buf ? refineJob(buf, job.rects, job.fl, job.fr) : job.rects;
        st.cache.set(job.key, res);
        drained = true;
      }
      // 겹침층 다시 그리기는 쪽의 일이 다 끝났을 때 한 번만 알린다(층을 통째로 다시 그리는 비용이 크다).
      if (drained && !st.queue.length) touched.add(page);
      if (st.queue.length) more = true;
      else if (st.buf) armTimer(st, page);
    });
    building = false;
    state.forEach(function (st) { if (st.build) building = true; });
    if (!building) state.forEach(function (st) { if ((st.queue.length || st.warm) && !(st.retryAt && now() < st.retryAt)) more = true; }); // 그리던 쪽이 끝났으면 기다리던 쪽을 이어서
    return { more: more, touched: touched };
  }

  // 쪽 잉크 버퍼를 미리 만든다(첫 표시가 거친 모양으로 그려졌다가 바뀌는 것을 줄인다). 이미 있거나 만드는 중이면 사용 시각만 갱신한다.
  // 쪽이 화면에 그려지지 않았으면 아무것도 하지 않는다. 호출은 값싸다(한가한 시간에 만든다).
  function warm(page) {
    var n = Number(page);
    if (!(n >= 1) || !D() || !D().getPage) return false;
    var st = stateFor(n);
    if (st.buf || st.build) { st.used = now(); if (st.buf) armTimer(st, n); return true; }
    if (st.warm) return true;
    var pc = pageCanvas(n);
    if (!(pc.canvas && pc.canvas.width > 0 && pc.pw > 0 && pc.ph > 0)) return false;
    st.warm = true;
    // 작은 글자도 보정 기준을 넘도록 렌더 배율을 정하려고, 글자 상자의 작은 높이(하위 10%)를 본다. 글 정보가 없으면 기본 배율.
    var TMm = root.ReaderTextMap;
    if (TMm && TMm.get && !st.hint) {
      TMm.get(n, { measure: false, quiet: true }).then(function (d) {
        if (!d || !d.charBoxes) return;
        var hs = [];
        for (var i = 0; i < d.charBoxes.length; i += Math.max(1, Math.floor(d.charBoxes.length / 400))) {
          var b = d.charBoxes[i];
          if (b && b.h > 0 && !/\s/.test(d.text.charAt(i))) hs.push(b.h);
        }
        hs.sort(function (a, b) { return a - b; });
        if (hs.length) st.hint = hs[Math.floor(hs.length * 0.1)];
      }, function () { /* 기본 배율 */ });
    }
    kick();
    return true;
  }

  function onReady(fn) { listeners.push(fn); }

  // 시험·진단용: 버퍼 상태
  function _stats() {
    var bytes = 0, pages = 0, jobs = 0, cached = 0, building = 0;
    state.forEach(function (st) {
      if (st.buf) { bytes += st.buf.lum.length; pages++; }
      if (st.build) building++;
      jobs += st.queue.length; cached += st.cache.size;
    });
    return {
      bufferPages: pages, bufferBytes: bytes, building: building, pendingJobs: jobs, cachedJobs: cached, running: running,
      busyMs: busyMs, maxStepMs: maxStepMs, steps: steps,
      builds: cnt.builds, buildMs: cnt.buildMs, convertMs: cnt.convertMs, refineMs: cnt.refineMs, refined: cnt.refined, peakBytes: cnt.peakBytes, maxStripMs: cnt.maxStripMs, maxFlushMs: cnt.maxFlushMs, maxJobMs: cnt.maxJobMs,
    };
  }

  var api = {
    columnInk: columnInk,
    columnInkLum: columnInkLum,
    toLum: toLum,
    gaps: gaps,
    snapEdge: snapEdge,
    refinable: refinable,
    edgeFlags: edgeFlags,
    cellEdges: cellEdges,
    cellBoundaries: cellBoundaries,
    columnCounts: columnCounts,
    edgeMode: edgeMode,
    refineRects: refineRects,
    request: request,
    warm: warm,
    onReady: onReady,
    invalidate: invalidate,
    release: release,
    _stats: _stats,
    params: P,
  };
  root.ReaderInk = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    var bind = function () {
      var el = document.getElementById("reader");
      if (!el) return;
      // 쪽 좌표의 보정 결과는 확대 배율·다시 그리기와 무관하다. 확대 배율이 바뀌면 밝기 버퍼만 푼다.
      el.addEventListener("reader:scalechange", function () { release(); });
      el.addEventListener("reader:docopen", function () { invalidate(); });
      el.addEventListener("reader:docclose", function () { invalidate(); });
      // 첫 표시 전에 쪽 잉크를 미리 읽는다: 글자 층에서 누른 순간(드래그해 선택하기 직전), 그리고 쪽이 머문 지 WARM_IDLE_MS 뒤(현재 쪽).
      el.addEventListener("pointerdown", function (e) {
        var t = e.target;
        var pe = t && t.closest ? t.closest(".textLayer") : null;
        pe = pe && pe.closest ? pe.closest(".rd-page") : null;
        if (pe && pe.dataset && Number(pe.dataset.page) >= 1) warm(Number(pe.dataset.page));
      }, true);
      var idleTimer = 0;
      var idleWarm = function () {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(function () {
          idleTimer = 0;
          var d = D();
          if (d && d.currentPage && d.currentPage() >= 1) warm(d.currentPage());
        }, P.warmIdleMs);
      };
      el.addEventListener("reader:pagerendered", idleWarm);
      el.addEventListener("reader:pagechange", idleWarm);
    };
    bind();
  }
})(typeof window !== "undefined" ? window : globalThis);
