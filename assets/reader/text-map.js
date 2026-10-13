// 쪽 글 + 글자 상자.
//
// 순수 부분(Node 테스트 대상): buildPageText, buildCharBoxes.
// 브라우저 부분: makeMeasure, get, allPageTexts, domPointToOffset. window.ReaderTextMap 으로 노출한다.
//
// 표시는 pdf.js 텍스트 레이어 span 의 기하를 쓰지 않는다. getTextContent() 의 글자 조각마다
// 변환 행렬·폭·글꼴 이름을 읽어, 조각 안의 글자별 가로 위치를 PDF 에 든 실제 글꼴로 측정해 구한다.
//
// 글꼴 이름 대응(2026-10 브라우저에서 확인): pdf.js 는 쪽을 캔버스에 그릴 때 내장 글꼴을
// FontFace(loadedName, ...) 로 document.fonts 에 등록하고, 그 loadedName 이 getTextContent 항목의
// item.fontName 과 똑같다(예: "g_d0_f5"). textContent.styles[fontName].fontFamily 는 대체 글꼴 계열
// ("serif" 등)이라 측정에 쓰지 않는다. 주의: document.fonts.check() 는 "등록되지 않은 이름"에도 true 를
// 돌려주므로(필요한 글꼴이 없으면 참) 등록 여부 판단에 쓸 수 없다. 대신 document.fonts 를 훑어
// family 가 일치하고 status 가 "loaded" 인 항목이 있는지 직접 본다.
(function (root) {
  "use strict";

  var TM = root;
  var G = root.ReaderGeometry;
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    TM = require("../term-match.js");
    G = require("./geometry.js");
  }

  var BOX_ASCENT = 0.85; // 기준선 위로 글자 높이의 85%
  var BOX_TOTAL = 1.15; // 상자 높이는 글자 높이의 115% (기준선 아래로 30%)
  var NEWLINE = "\n";

  // ---------- 쪽 글 ----------

  // collapseLetterSpacedHangul 이 지운 공백을 원래 str 위치로 되돌리는 대응표.
  // 반환 배열 m 에 대해 collapse(raw)[k] === raw[m[k]].
  function collapsedOffsets(raw, collapsed) {
    var m = [];
    if (collapsed === raw) {
      for (var i = 0; i < raw.length; i++) m.push(i);
      return m;
    }
    var isHangul = function (ch) { return ch >= "가" && ch <= "힣"; };
    for (var k = 0; k < raw.length; k++) {
      var ch = raw.charAt(k);
      if (ch === " " && k > 0 && k + 1 < raw.length && isHangul(raw.charAt(k - 1)) && isHangul(raw.charAt(k + 1))) continue;
      m.push(k);
    }
    if (m.length !== collapsed.length) {
      // 접기 규칙이 바뀌어 대응을 못 만들면 조용히 틀어지는 대신 즉시 알린다.
      throw new Error("buildPageText: 자간 접기 대응 실패 (" + JSON.stringify(raw) + ")");
    }
    return m;
  }

  // joinTextItems 의 반복문을 그대로 옮겨 글자마다 출처(조각 번호, 조각 안 위치)를 함께 기록한다.
  // text 는 joinTextItems(items, pageWidth) 와 글자 하나까지 같아야 한다(테스트가 모든 사례에서 확인).
  function buildPageText(items, pageWidth) {
    var ordered = TM.orderTextItemsByColumn(items, pageWidth);
    var origIndex = null;
    if (ordered !== items) {
      origIndex = new Map();
      for (var q = 0; q < items.length; q++) origIndex.set(items[q], q);
    }
    var text = "";
    var charItem = [];
    var charOffset = [];
    var prevItem = null;
    var prevEndX = 0;
    var prevY = 0;
    function pushSep(s) {
      for (var a = 0; a < s.length; a++) { charItem.push(-1); charOffset.push(-1); }
      text += s;
    }
    for (var oi = 0; oi < ordered.length; oi++) {
      var item = ordered[oi];
      var idx = origIndex ? origIndex.get(item) : oi;
      var raw = item.str || "";
      var str = TM.collapseLetterSpacedHangul(raw);
      if (!str) {
        if (item.hasEOL) pushSep(NEWLINE);
        continue;
      }
      var x = item.transform ? item.transform[4] : 0;
      var y = item.transform ? item.transform[5] : 0;
      var height = item.transform ? Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10 : 10;
      var startsWithSpace = str.charCodeAt(0) === 32;
      var textEndsWithSpace = text.length > 0 && (text.charCodeAt(text.length - 1) === 32 || text.charCodeAt(text.length - 1) === 10);
      if (prevItem && !startsWithSpace && !textEndsWithSpace) {
        var sameLine = Math.abs(y - prevY) < height * 0.5;
        if (!sameLine) pushSep(NEWLINE);
        else if (x - prevEndX > height * 0.18) pushSep(" ");
      }
      var offs = collapsedOffsets(raw, str);
      for (var c = 0; c < str.length; c++) { charItem.push(idx); charOffset.push(offs[c]); }
      text += str;
      if (item.hasEOL) pushSep(NEWLINE);
      prevItem = item;
      prevEndX = x + (item.width || 0);
      prevY = y;
    }
    return { text: text, charItem: Int32Array.from(charItem), charOffset: Int32Array.from(charOffset) };
  }

  // ---------- 글자 상자 ----------

  function mul(m, n) {
    return [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  }
  function near0(v) { return Math.abs(v) < 1e-6; }

  var SPACE_RE = /\s/;
  var CJK_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ぀-ヿ㐀-鿿豈-﫿]/;
  var CJK_SPACE_RATIO = 0.5; // 전각(1em) 글자 글꼴의 공백은 반각이 보통이다: 같은 글꼴 전각 글자 폭의 절반

  // 글자 중 한글·한자·가나가 절반 이상이면(공백 제외) 그 개수와 측정/가중치 합을 돌려준다. 아니면 null.
  function cjkMajority(raw, w) {
    var cj = 0;
    var sum = 0;
    var other = 0;
    for (var i = 0; i < raw.length; i++) {
      var ch = raw.charAt(i);
      if (SPACE_RE.test(ch)) continue;
      if (CJK_RE.test(ch)) { cj++; sum += w ? w[i] : 1; } else other++;
    }
    return cj > 0 && cj >= other ? { n: cj, mean: sum / cj } : null;
  }

  // 가중치 분할(측정 없음)의 글자 비율. 한글 위주 조각은 공백도 전각 글자(1)의 절반(0.5)으로 본다(기본 0.3).
  function charWeightsWithSpace(raw) {
    var w = G.charWeights(raw);
    if (cjkMajority(raw, null)) for (var i = 0; i < w.length; i++) if (SPACE_RE.test(raw.charAt(i))) w[i] = CJK_SPACE_RATIO;
    return w;
  }

  // 한 조각의 원래 str 글자마다 상자를 만든다(길이 raw.length). 바로 쓸 수 없으면 null.
  // measured: measure() 가 이 조각에 준 글자별 폭(없으면 null).
  function itemCharBoxes(item, vt, measured, pieceId) {
    var raw = item.str || "";
    var n = raw.length;
    var t = item.transform;
    if (!n || !t) return null;
    var tx = mul(vt, t);
    var width = Number(item.width);
    var fontSize = Math.abs(t[3]) || Math.hypot(t[0], t[1]) || 0;
    if (!(fontSize > 0)) return null;

    var widths = measured && measured.length === n ? measured : null;
    var cj = null;
    if (widths && widths.spaceFallback) {
      // 내장 글꼴에 공백이 없어 흔한 폭(0.3em)으로 때운 자리: 한글 위주 조각은 전각 글자 폭의 절반으로 바꾼다.
      cj = cjkMajority(raw, widths);
      if (cj) {
        widths = widths.slice();
        for (var q = 0; q < n; q++) if (SPACE_RE.test(raw.charAt(q))) widths[q] = CJK_SPACE_RATIO * cj.mean;
      }
    }
    var weights = widths || charWeightsWithSpace(raw);
    var wsum = 0;
    for (var i = 0; i < n; i++) wsum += weights[i] > 0 ? weights[i] : 0;
    if (!(wsum > 0) && widths) {
      // 측정값이 전부 0 이면 측정이 안 된 것과 같다(글꼴이 글자를 모름). 가중치로 돌아간다.
      widths = null;
      weights = charWeightsWithSpace(raw);
      for (i = 0, wsum = 0; i < n; i++) wsum += weights[i];
    }
    if (!(wsum > 0)) return null;
    // 측정값이 있으면 그 합을 조각 폭에 맞춰 비율 보정, 폭 정보가 없으면 측정값 그대로.
    var total = width > 0 ? width : (widths ? wsum : 0);
    if (!(total > 0)) return null;
    var bounds = G.splitWidth(total, weights);

    // 화면에서 곧게 선 글인지는 조각 변환과 쪽 변환을 합친 tx 로 본다(/Rotate 90 쪽의 가로 표 등은 조각이
    // 기울어 있어도 합치면 곧게 선다). 배율은 합친 변환의 크기를 조각 변환의 크기로 나눠 구한다.
    var unrotated = near0(tx[1]) && near0(tx[2]) && tx[0] > 0;
    var out = new Array(n);
    var k;
    if (unrotated) {
      var lx0 = Math.hypot(t[0], t[1]);
      var sx = lx0 > 1e-9 ? Math.abs(tx[0]) / lx0 : Math.abs(vt[0]) || 1;
      var h = Math.abs(tx[3]); // 화면에서의 글자 높이(em)
      var base = tx[5];
      var top = base - h * BOX_ASCENT;
      var bh = h * BOX_TOTAL;
      for (k = 0; k < n; k++) {
        var x0 = tx[4] + bounds[k] * sx;
        var x1 = tx[4] + bounds[k + 1] * sx;
        out[k] = { x: x0, y: top, w: x1 - x0, h: bh, p: pieceId };
      }
      return out;
    }

    // 회전·기울어진 조각, 또는 회전된 쪽: 조각 전체 상자를 글자 수로 균등 분할한다.
    var lx = Math.hypot(t[0], t[1]) || 1;
    var ly = Math.hypot(t[2], t[3]) || lx;
    // 사용자 공간의 방향 벡터를 쪽 좌표 방향으로 옮긴다(선형 부분만).
    var dx = (vt[0] * t[0] + vt[2] * t[1]) / lx;
    var dy = (vt[1] * t[0] + vt[3] * t[1]) / lx;
    var ux = (vt[0] * t[2] + vt[2] * t[3]) / ly;
    var uy = (vt[1] * t[2] + vt[3] * t[3]) / ly;
    var dl = Math.hypot(dx, dy) || 1;
    var ul = Math.hypot(ux, uy) || 1;
    dx /= dl; dy /= dl; ux /= ul; uy /= ul;
    var W = total * dl;
    var hh = ly * ul;
    var ox = tx[4];
    var oy = tx[5];
    for (k = 0; k < n; k++) {
      var a = (W * k) / n;
      var b = (W * (k + 1)) / n;
      var xs = [];
      var ys = [];
      var ends = [a, b];
      var ups = [-hh * (BOX_TOTAL - BOX_ASCENT), hh * BOX_ASCENT];
      for (var ei = 0; ei < 2; ei++) {
        for (var ui = 0; ui < 2; ui++) {
          xs.push(ox + dx * ends[ei] + ux * ups[ui]);
          ys.push(oy + dy * ends[ei] + uy * ups[ui]);
        }
      }
      var minX = Math.min.apply(null, xs);
      var minY = Math.min.apply(null, ys);
      out[k] = { x: minX, y: minY, w: Math.max.apply(null, xs) - minX, h: Math.max.apply(null, ys) - minY, p: pieceId };
    }
    return out;
  }

  // 쪽 글의 글자마다 상자를 만든다. 쪽 글에 없는 글자(삽입된 공백·줄바꿈)와 계산이 안 되는 글자는 null.
  // measure(fontName, fontSizePx, str) -> 글자별 폭 배열 | null.
  function buildCharBoxes(items, viewportTransform, pageText, measure) {
    var vt = viewportTransform || [1, 0, 0, 1, 0, 0];
    var n = pageText.text.length;
    var boxes = new Array(n);
    for (var z = 0; z < n; z++) boxes[z] = null;
    // 쪽 글에 나오는 조각마다 글자별 폭을 한 번만 잰다.
    var measuredAt = new Map();
    for (var j = 0; j < n; j++) {
      var ix = pageText.charItem[j];
      if (ix < 0 || measuredAt.has(ix)) continue;
      var it = items[ix];
      var raw = it.str || "";
      var fs = it.transform ? Math.abs(it.transform[3]) || Math.hypot(it.transform[0], it.transform[1]) : 0;
      var m = null;
      if (typeof measure === "function" && raw && fs > 0) {
        try { m = measure(it.fontName, fs, raw); } catch (e) { m = null; }
        if (m && m.length !== raw.length) m = null;
      }
      measuredAt.set(ix, m);
    }
    var perItem = new Map();
    for (var i = 0; i < n; i++) {
      var idx = pageText.charItem[i];
      if (idx < 0) continue;
      var rawBoxes = perItem.get(idx);
      if (rawBoxes === undefined) {
        rawBoxes = itemCharBoxes(items[idx], vt, measuredAt.get(idx), idx);
        perItem.set(idx, rawBoxes);
      }
      if (!rawBoxes) continue;
      var b = rawBoxes[pageText.charOffset[i]];
      boxes[i] = b ? { x: b.x, y: b.y, w: b.w, h: b.h, p: b.p } : null;
    }
    return boxes;
  }

  // 쪽 글 위치 -> 그 글자가 속한 조각 안의 위치 역조회용 색인.
  function indexItems(pageText, itemCount) {
    var first = new Int32Array(itemCount).fill(-1);
    var last = new Int32Array(itemCount).fill(-1);
    for (var i = 0; i < pageText.charItem.length; i++) {
      var idx = pageText.charItem[i];
      if (idx < 0) continue;
      if (first[idx] < 0) first[idx] = i;
      last[idx] = i;
    }
    return { first: first, last: last };
  }

  var api = {
    buildPageText: buildPageText,
    buildCharBoxes: buildCharBoxes,
    indexItems: indexItems,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined") return;

  // ============ 브라우저 부분 ============

  var PAGE_BATCH = 4;
  var SPACE_EM = 0.3; // 글꼴에 공백이 없을 때 쓰는 공백 폭(글자 크기 비율, 라틴 위주 조각). charWeights 의 공백 0.3 과 같다
  var MEASURE_REF = 100; // 큰 크기로 재서 글꼴 힌팅의 반올림 영향을 줄이고 비율로 줄인다.
  var measureEnabled = true;
  var gen = 0;
  var entries = new Map(); // page -> Promise<{text,charBoxes,items,...}|null>
  var plainEntries = new Map(); // page -> Promise<{pageText,items}|null>  (측정 없는 쪽 글)
  var rendered = new Set();
  var allTextsPromise = null;
  var cacheSync = new Map(); // page -> domPointToOffset 이 동기로 쓰는 준비된 결과
  var ctx = null;
  var widthCache = new Map();
  var familyOk = new Map();

  function rootEl() { return document.getElementById("reader"); }
  function emit(name, detail) {
    var el = rootEl();
    if (el) el.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function fontRegistered(name) {
    var hit = familyOk.get(name);
    if (hit) return true;
    var found = false;
    if (document.fonts && document.fonts.forEach) {
      document.fonts.forEach(function (f) {
        if (f.status === "loaded" && String(f.family).replace(/^["']|["']$/g, "") === name) found = true;
      });
    }
    if (found) familyOk.set(name, true); // 등록은 사라지지 않으므로 긍정 결과만 캐시
    return found;
  }

  // 글자별 폭 측정기. 등록되지 않은 글꼴이거나 측정이 안 되면 null.
  function makeMeasure() {
    return function measure(fontName, fontSizePx, str) {
      if (!fontName || !(fontSizePx > 0)) return null;
      if (!fontRegistered(fontName)) return null;
      if (!ctx) {
        var cv = document.createElement("canvas");
        cv.width = 1;
        cv.height = 1;
        ctx = cv.getContext("2d");
      }
      var out = new Array(str.length);
      var k = fontSizePx / MEASURE_REF;
      for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i);
        var key = fontName + "\u0000" + ch;
        var w = widthCache.get(key);
        if (w === undefined) {
          w = glyphAdvance(fontName, ch);
          widthCache.set(key, w);
        }
        if (w === null) {
          // 공백은 글자가 아니라 위치 이동으로 표현되는 일이 많아 내장 글꼴에 없어도 이상하지 않다. 흔한 공백 폭으로 대신한다.
          if (/\s/.test(ch)) { out[i] = SPACE_EM * fontSizePx; out.spaceFallback = true; continue; }
          return null; // 글꼴이 이 글자를 모른다 -> 이 조각은 측정 불가(가중치 분할로)
        }
        out[i] = w * k;
      }
      return out;
    };
  }

  // 글자 하나의 가로 이동 폭(MEASURE_REF px 기준). 그 글꼴이 그 글자를 실제로 가지고 있지 않으면 null.
  // 확인법: pdf.js 내장 글꼴은 글자를 유니코드가 아니라 글리프 번호로 연결하는 경우가 많아, 이름만 지정하면
  // 브라우저가 조용히 다른 글꼴로 대신 그리고(폭도 그 글꼴의 것), 어떤 글꼴은 폭 0 을 돌려준다.
  // 내장 글꼴 뒤에 대체 계열을 서로 다른 셋(serif / monospace / cursive)으로 바꿔 재서 셋이 모두 같아야 받아들인다.
  // 하나라도 다르면 대체 글꼴이 섞인 것(그 글자를 내장 글꼴이 모름)이다. 둘(serif/monospace)만 쓸 때는 두 계열이
  // 같은 시스템 글꼴로 풀리는 글자가 새어 들 수 있어 하나를 더했다.
  //
  // 관찰(2026-10-14, 한국어 Windows Chrome 에서 없는 글꼴 이름 뒤에 각 계열만 붙여 100px 로 잰 값):
  // - 한글('가' 등): serif 96.6, monospace 100, cursive 100 -> 서로 달라 "글꼴이 모름"으로 걸러진다. 즉 이 컴퓨터에서는
  //   한글 글리프 누락이 serif / monospace 두 계열만으로도 잡힌다. serif·monospace 가 같은 시스템 글꼴로 풀리는 환경이면 세 번째
  //   계열이 필요하고, 셋이 모두 같은 환경이라면 누락된 한글이 시스템 글꼴 폭(1em)으로 받아들여지지만 한글 폭은 가중치(1)와 같은
  //   값이라 상자 위치는 변하지 않는다. 위험은 폭이 1em 이 아닌 글꼴뿐이다.
  //   (한글 위주 조각의 공백 폭은 별도로 전각 글자 폭의 절반을 쓴다: cjkMajority, CJK_SPACE_RATIO)
  // - 라틴·숫자·공백·구두점('a' 55.7/50/61.3, '5' 55.8/50/58.3, ' ' 31/50/33.3): 세 계열이 모두 달라 내장 글꼴에 글자가 없으면
  //   걸러진다(nanoparticle 등 글리프 번호 글꼴은 이 경로로 전부 가중치 분할이 된다).
  // - "대체 계열만으로 잰 폭과 같으면 거부" 규칙도 시험했다: 숫자처럼 내장 글꼴과 시스템 serif 가 우연히 같은 폭인 글자를
  //   잘못 거부해 글꼴 측정 조각이 줄고 위치가 나빠져(led-plant 엄격 맞음 79.3% -> 70.7%) 채택하지 않았다.
  var FALLBACK_FAMILIES = ["serif", "monospace", "cursive"];
  function glyphAdvance(fontName, ch) {
    var first = -1;
    for (var f = 0; f < FALLBACK_FAMILIES.length; f++) {
      ctx.font = MEASURE_REF + 'px "' + fontName + '", ' + FALLBACK_FAMILIES[f];
      var w = ctx.measureText(ch).width;
      if (!(w > 0)) return null;
      if (first < 0) first = w;
      else if (Math.abs(w - first) > 0.01) return null;
    }
    return first;
  }
  var measureFn = makeMeasure();

  function resetCaches() {
    gen++;
    entries = new Map();
    plainEntries = new Map();
    cacheSync = new Map();
    rendered = new Set();
    allTextsPromise = null;
  }

  function bindEvents() {
    var el = rootEl();
    if (!el) return;
    el.addEventListener("reader:docopen", resetCaches);
    el.addEventListener("reader:docclose", resetCaches);
    el.addEventListener("reader:pagerendered", function (e) { rendered.add(e.detail.page); });
  }
  bindEvents();

  function pageTextOnly(n) {
    var p = plainEntries.get(n);
    if (p) return p;
    var D = root.ReaderDoc;
    var myGen = gen;
    p = Promise.all([D.getPage(n), D.getTextContent(n)]).then(function (r) {
      var vp = r[0].getViewport({ scale: 1 });
      var items = (r[1] && r[1].items) || [];
      return { pageText: buildPageText(items, vp.width), items: items, viewport: vp, gen: myGen };
    });
    plainEntries.set(n, p);
    p.catch(function () { if (plainEntries.get(n) === p) plainEntries.delete(n); });
    return p;
  }

  // 쪽 n 이 그려질 때까지 기다린다. 그려지면 true, 문서가 닫히거나 바뀌면 null, 그리기가 실패하면 reject.
  function waitRendered(n) {
    if (rendered.has(n)) return Promise.resolve(true);
    return new Promise(function (resolve, reject) {
      var el = rootEl();
      if (!el) { resolve(true); return; }
      function off() {
        el.removeEventListener("reader:pagerendered", onOk);
        el.removeEventListener("reader:pageerror", onErr);
        el.removeEventListener("reader:docopen", onGone);
        el.removeEventListener("reader:docclose", onGone);
      }
      function onOk(e) { if (e.detail.page === n) { off(); resolve(true); } }
      function onErr(e) { if (e.detail.page === n) { off(); reject(new Error(n + "쪽 그리기 실패")); } }
      function onGone() { off(); resolve(null); }
      el.addEventListener("reader:pagerendered", onOk);
      el.addEventListener("reader:pageerror", onErr);
      el.addEventListener("reader:docopen", onGone);
      el.addEventListener("reader:docclose", onGone);
    });
  }

  // 한 쪽의 글자 상자까지. page 는 1부터. 글이 없는 쪽은 text === "".
  // 쪽 캔버스가 그려진 뒤에야 글꼴이 document.fonts 에 등록되므로, 그 쪽이 그려질 때까지 기다린다
  // (화면 밖 쪽이면 사용자가 그 쪽에 갈 때까지 대기 상태로 남는다).
  function get(n, opts) {
    var useMeasure = measureEnabled && !(opts && opts.measure === false);
    var key = useMeasure ? n : -n;
    var p = entries.get(key);
    if (p) return p;
    var myGen = gen;
    p = pageTextOnly(n).then(function (base) {
      if (!base.pageText.text) return { text: "", charBoxes: [], items: base.items, charItem: base.pageText.charItem, charOffset: base.pageText.charOffset, itemIndex: indexItems(base.pageText, base.items.length), measured: false, stats: { measured: 0, weighted: 0 } };
      return (useMeasure ? waitRendered(n) : Promise.resolve(true)).then(function (ok) {
        if (!ok) return null; // 문서가 닫히거나 바뀜
        var vp = base.viewport;
        var stats = { measured: 0, weighted: 0 }; // 조각 단위: 실제 글꼴로 잰 조각 / 가중치로 나눈 조각
        var counting = useMeasure ? function (f, sz, str) {
          var w = measureFn(f, sz, str);
          if (w) stats.measured++; else stats.weighted++;
          return w;
        } : null;
        var boxes = buildCharBoxes(base.items, vp.transform, base.pageText, counting);
        return {
          text: base.pageText.text,
          charBoxes: boxes,
          items: base.items,
          charItem: base.pageText.charItem,
          charOffset: base.pageText.charOffset,
          itemIndex: indexItems(base.pageText, base.items.length),
          measured: useMeasure,
          stats: stats,
        };
      });
    }).then(function (res) {
      if (!res || myGen !== gen) return null;
      cacheSync.set(n, { gen: gen, items: res.items, itemIndex: res.itemIndex, charItem: res.charItem, charOffset: res.charOffset, spanMap: spanItemIndex(res.items) });
      if (!(opts && opts.quiet)) emit("reader:pagetext", { page: n });
      return res;
    });
    entries.set(key, p);
    p.catch(function () { if (entries.get(key) === p) entries.delete(key); });
    return p;
  }

  // 문서 전체 쪽 글(목차·참고문헌용). 측정 없이 buildPageText 만 쓰며 4쪽씩 묶어 순차 처리한다.
  function allPageTexts() {
    if (allTextsPromise) return allTextsPromise;
    var D = root.ReaderDoc;
    var total = D.numPages();
    var myGen = gen;
    var out = new Array(total);
    allTextsPromise = (async function () {
      for (var s = 1; s <= total; s += PAGE_BATCH) {
        var batch = [];
        for (var n = s; n < s + PAGE_BATCH && n <= total; n++) batch.push(n);
        var res = await Promise.all(batch.map(function (m) { return pageTextOnly(m); }));
        if (myGen !== gen) throw new Error("문서가 바뀌었습니다");
        res.forEach(function (r, i) { out[batch[i] - 1] = r.pageText.text; });
      }
      return out;
    })();
    allTextsPromise.catch(function () { allTextsPromise = null; });
    return allTextsPromise;
  }

  // 텍스트 레이어 span 의 순서 = items 중 str 이 있는(빈 문자열이 아닌) 것의 순서.
  // pdf.js TextLayer 는 str 이 "" 인 항목에는 span 을 만들지 않는다(줄 끝 표시만 <br> 로 남는다). 4.x 에서 확인.
  function spanItemIndex(items) {
    var map = [];
    for (var i = 0; i < items.length; i++) if (typeof items[i].str === "string" && items[i].str !== "") map.push(i);
    return map;
  }

  // DOM 위치(텍스트 레이어 span 안의 글자 위치) -> 쪽 글 위치. 준비되지 않았거나 못 찾으면 -1.
  function domPointToOffset(page, node, offsetInNode) {
    var D = root.ReaderDoc;
    var pageEl = D.pageEl(page);
    if (!pageEl || !node) return -1;
    var cached = cacheSync.get(page);
    if (!cached || cached.gen !== gen) return -1;
    var tl = pageEl.querySelector(".textLayer");
    if (!tl) return -1;
    var el = node.nodeType === 3 ? node.parentElement : node;
    while (el && el !== tl && !(el.tagName === "SPAN" && !el.classList.contains("markedContent"))) el = el.parentElement;
    if (!el || el === tl) return -1;
    var spans = tl.querySelectorAll("span:not(.markedContent)");
    var si = Array.prototype.indexOf.call(spans, el);
    if (si < 0) return -1;
    var itemIdx = cached.spanMap[si];
    if (itemIdx === undefined) return -1;
    var str = cached.items[itemIdx].str || "";
    var off = offsetInNode;
    if (node.nodeType !== 3) off = offsetInNode > 0 ? str.length : 0; // 요소 기준 위치는 앞/뒤로만 구분
    var first = cached.itemIndex.first[itemIdx];
    var last = cached.itemIndex.last[itemIdx];
    if (first < 0) {
      // 이 조각은 쪽 글에 글자를 내지 않았다(공백뿐 등). 가장 가까운 앞 글자 뒤를 돌려준다.
      for (var q = itemIdx - 1; q >= 0; q--) if (cached.itemIndex.last[q] >= 0) return cached.itemIndex.last[q] + 1;
      return 0;
    }
    for (var i = first; i <= last; i++) {
      if (cached.charItem[i] === itemIdx && cached.charOffset[i] >= off) return i;
    }
    return last + 1;
  }

  root.ReaderTextMap = {
    buildPageText: buildPageText,
    buildCharBoxes: buildCharBoxes,
    makeMeasure: makeMeasure,
    get: function (n, opts) { return get(n, opts); },
    allPageTexts: allPageTexts,
    domPointToOffset: domPointToOffset,
    setMeasureEnabled: function (on) { measureEnabled = !!on; entries = new Map(); },
    isMeasureEnabled: function () { return measureEnabled; },
  };
})(typeof window !== "undefined" ? window : globalThis);
