// 사각형 계산(순수). 글자 상자 배열에서 범위 -> 사각형, 좌표 -> 글자 번호.
// 브라우저에서는 window.ReaderGeometry, Node 테스트에서는 require 로 쓴다.
// 좌표는 쪽 좌표계(배율 1, 원점 왼쪽 위): Rect = {x, y, w, h}.
// 글자 상자는 선택적으로 조각 번호 p(같은 글자 조각이면 같은 값)를 가진다.
(function (root) {
  "use strict";

  var HANGUL_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
  var HAN_KANA_RE = /[぀-ヿ㐀-鿿豈-﫿]/;
  var UPPER_RE = /[A-Z]/;
  var LOWER_DIGIT_RE = /[a-z0-9]/;

  var MERGE_GAP_RATIO = 0.6; // 서로 다른 조각이라도 가로 간격이 글자 높이의 이 비율 미만이면 한 사각형
  var SAME_LINE_OVERLAP = 0.5; // 같은 줄로 보는 세로 겹침 비율

  // 글자 종류별 가로 폭 가중치. 글꼴 측정이 없을 때 조각 폭을 나누는 데 쓴다.
  function charWeights(str) {
    var out = [];
    var s = String(str == null ? "" : str);
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      var w;
      if (HANGUL_RE.test(ch) || HAN_KANA_RE.test(ch)) w = 1;
      else if (UPPER_RE.test(ch)) w = 0.7;
      else if (LOWER_DIGIT_RE.test(ch)) w = 0.55;
      else if (ch === " " || ch === " ") w = 0.3;
      else w = 0.5;
      out.push(w);
    }
    return out;
  }

  // 전체 폭을 가중치 비율로 나눈 누적 경계. 길이 weights.length+1, 첫 값 0, 끝 값 totalWidth.
  function splitWidth(totalWidth, weights) {
    var n = weights ? weights.length : 0;
    var out = [0];
    if (!n) return out;
    var sum = 0;
    for (var i = 0; i < n; i++) sum += weights[i] > 0 ? weights[i] : 0;
    var acc = 0;
    for (var j = 0; j < n; j++) {
      acc += weights[j] > 0 ? weights[j] : 0;
      out.push(sum > 0 ? (totalWidth * acc) / sum : (totalWidth * (j + 1)) / n);
    }
    out[n] = totalWidth;
    return out;
  }

  function verticalOverlapRatio(a, b) {
    var top = Math.max(a.y, b.y);
    var bottom = Math.min(a.y + a.h, b.y + b.h);
    var inter = bottom - top;
    var minH = Math.min(a.h, b.h);
    return minH > 0 ? inter / minH : 0;
  }

  function unionRect(rects) {
    if (!rects || !rects.length) return null;
    var x0 = Infinity;
    var y0 = Infinity;
    var x1 = -Infinity;
    var y1 = -Infinity;
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (!r) continue;
      if (r.x < x0) x0 = r.x;
      if (r.y < y0) y0 = r.y;
      if (r.x + r.w > x1) x1 = r.x + r.w;
      if (r.y + r.h > y1) y1 = r.y + r.h;
    }
    if (x0 === Infinity) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // [start, end) 범위의 글자 상자를 줄·조각 단위로 병합한 사각형들.
  // - 같은 조각(p 가 같음) 안의 글자는 항상 하나로.
  // - 다른 조각이라도 같은 줄(세로 겹침 50% 이상)이고 가로 간격이 글자 높이의 0.6 미만이면 하나로.
  // - 그보다 벌어지면(단 사이 여백) 끊는다. null 상자는 건너뛴다. 범위는 배열 안으로 잘라 처리한다.
  function rangeRects(charBoxes, start, end) {
    var out = [];
    if (!charBoxes || !charBoxes.length) return out;
    var s = Math.max(0, Math.floor(Number(start) || 0));
    var e = Math.min(charBoxes.length, Math.floor(Number(end) || 0));
    var cur = null;
    var curP;
    for (var i = s; i < e; i++) {
      var b = charBoxes[i];
      if (!b) continue;
      if (cur) {
        var sameP = b.p !== undefined && curP !== undefined && b.p === curP;
        var merge = sameP;
        if (!merge && verticalOverlapRatio(cur, b) >= SAME_LINE_OVERLAP) {
          var gap = b.x - (cur.x + cur.w);
          var ref = Math.max(cur.h, b.h);
          // 왼쪽으로 크게 되돌아가는 경우(gap 이 음수로 큼)는 다른 단·다른 덩어리다.
          if (gap < ref * MERGE_GAP_RATIO && gap > -ref) merge = true;
        }
        if (merge) {
          var nx0 = Math.min(cur.x, b.x);
          var ny0 = Math.min(cur.y, b.y);
          var nx1 = Math.max(cur.x + cur.w, b.x + b.w);
          var ny1 = Math.max(cur.y + cur.h, b.y + b.h);
          cur = { x: nx0, y: ny0, w: nx1 - nx0, h: ny1 - ny0 };
          curP = b.p !== undefined ? b.p : curP;
          continue;
        }
        out.push(cur);
      }
      cur = { x: b.x, y: b.y, w: b.w, h: b.h };
      curP = b.p;
    }
    if (cur) out.push(cur);
    return out;
  }

  // 좌표(x, y)가 들어 있는 글자 번호. 없으면 -1. 겹치면 중심이 가까운 글자.
  function hitTest(charBoxes, x, y) {
    if (!charBoxes) return -1;
    var best = -1;
    var bestD = Infinity;
    for (var i = 0; i < charBoxes.length; i++) {
      var b = charBoxes[i];
      if (!b) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        var d = Math.abs(x - (b.x + b.w / 2));
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }

  function isWs(ch) { return /\s/.test(ch); }

  // 범위 [start, end) 를 가장 가까운 낱말 경계로 넓힌다(순수). 낱말 = 공백·줄바꿈으로 끊긴 덩어리(한글은 어절).
  // 범위의 시작이나 끝이 낱말 안쪽이면 그 낱말 끝까지 넓히고, 이미 경계(공백 옆)면 그대로 둔다.
  // 글자 상자가 글자 하나 정도 어긋나도 형광펜이 낱말 단위로는 맞게 하려는 용도다.
  // - 결과의 앞뒤 공백은 뺀다(" 감염" 0~2 -> 1~2). 빈 범위나 공백뿐인 범위는 쪽 글 안으로 잘라 그대로 돌려준다.
  // - 줄 끝에서 끊긴 어절(한글·한자·가나 두 글자 사이의 줄바꿈 하나, 하이픈·빈 줄 없음)은 한 낱말로 본다.
  //   단, 낱말 안쪽에서 넓혀 온 가장자리만 줄바꿈을 건넌다. 범위가 줄 끝에서 정확히 끝나거나 줄 처음에서 시작하면 그대로 둔다
  //   (그렇지 않으면 한 줄의 마지막 낱말을 고를 때마다 다음 줄 첫 낱말까지 끌려 들어간다).
  function snapToWords(text, start, end) {
    var t = String(text == null ? "" : text);
    var s = Math.max(0, Math.min(t.length, Math.floor(Number(start) || 0)));
    var e = Math.max(0, Math.min(t.length, Math.floor(Number(end) || 0)));
    if (e <= s) return { start: s, end: Math.max(s, e) };
    var a = s, b = e;
    while (a < b && isWs(t.charAt(a))) a++;
    while (b > a && isWs(t.charAt(b - 1))) b--;
    if (a >= b) return { start: s, end: e }; // 공백뿐
    while (a > 0 && !isWs(t.charAt(a - 1))) a--;
    while (b < t.length && !isWs(t.charAt(b))) b++;
    return { start: a, end: b };
  }

  var api = {
    snapToWords: snapToWords,
    charWeights: charWeights,
    splitWidth: splitWidth,
    rangeRects: rangeRects,
    hitTest: hitTest,
    unionRect: unionRect,
  };
  root.ReaderGeometry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
