// 선택 도구: 브라우저의 글자 선택을 쪽 글 위치 범위로 바꾸고, 선택 위에 도구(형광펜 4색·메모·복사·사전)를 띄운다.
//
// 순수 부분(Node 테스트 대상): normalizeRanges.
// 브라우저 부분: window.ReaderSelection — current / onSelect / onAction / clear / copyText.
//
// 두 단 문서에서는 브라우저 선택이 DOM(조각) 순서로 번진다. 그래서 선택의 시작점·끝점에서만 쪽 글 위치를 읽고,
// 그 사이는 쪽 글(읽기 순서)의 연속 범위로 본다. 형광펜은 낱말 단위로 넓혀(snapToWords) 저장·표시한다 —
// 글자 상자의 가장자리는 낱말 단위까지만 믿을 수 있다. 선택 도구가 보여 주는 미리보기도 같은 범위다.
(function (root) {
  "use strict";

  // pieces: [{page, a, b}] (a, b 는 쪽 글 위치, 순서 무관). a === b 인 조각은 버리고,
  // 같은 쪽 조각은 합친 최소~최대 하나로. 쪽 오름차순으로 [{page, start, end}].
  function normalizeRanges(pieces) {
    var byPage = new Map();
    (Array.isArray(pieces) ? pieces : []).forEach(function (p) {
      if (!p) return;
      var page = Number(p.page);
      var a = Number(p.a);
      var b = Number(p.b);
      if (!(page >= 1) || !Number.isFinite(a) || !Number.isFinite(b) || a === b) return;
      var lo = Math.min(a, b);
      var hi = Math.max(a, b);
      var cur = byPage.get(page);
      if (!cur) byPage.set(page, { page: page, start: lo, end: hi });
      else {
        if (lo < cur.start) cur.start = lo;
        if (hi > cur.end) cur.end = hi;
      }
    });
    return Array.from(byPage.values()).sort(function (x, y) { return x.page - y.page; });
  }

  // 글자 층 밖에 놓인 선택 끝점을 어디로 당길지 정한다(예: 쪽의 마지막 줄을 세 번 눌렀을 때 끝점이 글자 층 바깥 요소에 놓인다).
  // 당기는 곳은 글자 층 안쪽 끝점이 있는 쪽(ctx.anchorPage) 하나뿐이다 — 그 쪽을 벗어나 여러 쪽에 걸친 미리보기가 되지 않게 한다.
  // layers: 그려진 글자 층들의 [{page, rel}] — rel 은 끝점 기준 위치: -1 층이 끝점보다 앞, +1 층이 끝점보다 뒤.
  // ctx.where: "page"  끝점이 같은 .rd-page 요소 안(ctx.pointPage 가 anchorPage 와 같을 때만),
  //            "gap"   쪽과 쪽 사이 빈 곳(ctx.nearPages 에 anchorPage 가 있을 때만, 곧 그 쪽에 바로 붙은 틈),
  //            "outside" 본문 스크롤 영역 밖(패널·도구 막대): 안쪽 끝점의 쪽 끝/처음으로.
  // 끝(isEnd)이면 그 쪽 글자 층의 끝으로, 시작이면 처음으로. 해당하지 않으면 null(그때만 선택 전체를 무시한다).
  function clampTarget(isEnd, layers, ctx) {
    if (!ctx || !(ctx.anchorPage >= 1)) return null;
    var A = ctx.anchorPage;
    var mine = (Array.isArray(layers) ? layers : []).filter(function (l) { return l && l.page === A && (l.rel === -1 || l.rel === 1 || l.rel === 0); })[0];
    if (!mine) return null;
    var needRel = isEnd ? -1 : 1; // 끝: 층이 끝점보다 앞, 시작: 층이 시작점보다 뒤
    if (ctx.where === "page") {
      if (ctx.pointPage !== A || mine.rel !== needRel) return null;
    } else if (ctx.where === "gap") {
      if ((Array.isArray(ctx.nearPages) ? ctx.nearPages : []).indexOf(A) < 0 || mine.rel !== needRel) return null;
    } else if (ctx.where !== "outside") {
      return null;
    }
    return { page: A, edge: isEnd ? "end" : "start" };
  }

  var PURE = { normalizeRanges: normalizeRanges, clampTarget: clampTarget };
  if (typeof module !== "undefined" && module.exports) module.exports = PURE;
  if (typeof document === "undefined") {
    root.ReaderSelection = PURE;
    return;
  }

  var G = root.ReaderGeometry;
  var DEBOUNCE_MS = 120;
  var BOXES_TIMEOUT_MS = 1500; // 안 그린 쪽의 측정을 기다리는 전체 제한
  var MAX_PAGES = 30; // 한 번에 다룰 수 있는 쪽 수(전체 선택 같은 경우를 막는다)
  var TOOL_GAP = 8;

  var cur = null; // 마지막으로 읽은 선택 {ranges, text, quote, clientRect, rects}
  var token = 0;
  var down = false;
  var timer = 0;
  var previewPages = [];
  var selectCbs = [];
  var actionCbs = [];
  var toolHiddenByScroll = false;
  var ready = false;

  function $(id) { return document.getElementById(id); }
  function D() { return root.ReaderDoc; }
  function TM() { return root.ReaderTextMap; }
  function tool() { return $("rd-seltool"); }
  function isCoarse() { return !!(root.matchMedia && root.matchMedia("(pointer: coarse)").matches); }
  function isWs(ch) { return /\s/.test(ch); }

  // ---------- 브라우저 선택 -> 쪽 글 위치 ----------
  function textLayerOf(node) {
    var el = node && (node.nodeType === 3 ? node.parentElement : node);
    return el && el.closest ? el.closest(".textLayer") : null;
  }
  function pageOfLayer(tl) {
    var pe = tl && tl.closest(".rd-page");
    var n = pe ? Number(pe.dataset.page) : 0;
    return n >= 1 ? n : 0;
  }
  function firstSpanIn(el) {
    if (el.nodeType === 1 && el.tagName === "SPAN" && !el.classList.contains("markedContent")) return el;
    return el.querySelector ? el.querySelector("span:not(.markedContent)") : null;
  }
  function lastSpanIn(el) {
    if (el.nodeType === 1 && el.tagName === "SPAN" && !el.classList.contains("markedContent") && !el.querySelector("span:not(.markedContent)")) return el;
    var all = el.querySelectorAll ? el.querySelectorAll("span:not(.markedContent)") : [];
    return all.length ? all[all.length - 1] : null;
  }
  // 요소 기준 경계 위치(텍스트 레이어 자신·endOfContent 등)를 글자 조각 span 기준으로 바꾼다.
  function normalizePoint(node, off, isEnd) {
    if (node.nodeType === 3) return { node: node, off: off };
    var kids = node.childNodes;
    if (isEnd) {
      if (off > 0) {
        var prev = kids[off - 1];
        var sp = prev && lastSpanIn(prev);
        if (sp) return { node: sp, off: 1 }; // 요소 기준 off > 0 은 조각 끝으로 읽힌다
        // 앞 자식에 조각이 없으면(예: endOfContent) 더 앞으로
        for (var i = off - 2; i >= 0; i--) { var s2 = lastSpanIn(kids[i]); if (s2) return { node: s2, off: 1 }; }
        return null;
      }
      var f0 = firstSpanIn(node);
      return f0 ? { node: f0, off: 0 } : null;
    }
    var nxt = kids[off];
    var sp2 = nxt && firstSpanIn(nxt);
    if (sp2) return { node: sp2, off: 0 };
    for (var j = off + 1; j < kids.length; j++) { var s3 = firstSpanIn(kids[j]); if (s3) return { node: s3, off: 0 }; }
    var l0 = lastSpanIn(node);
    return l0 ? { node: l0, off: 1 } : null;
  }
  function pointOf(node, off, isEnd) {
    if (!node) return null;
    var tl = textLayerOf(node);
    if (!tl) return null;
    var page = pageOfLayer(tl);
    if (!page) return null;
    var p = normalizePoint(node, off, isEnd);
    if (!p) return null;
    return { page: page, node: p.node, off: p.off };
  }

  // 글자 층 밖 끝점이 놓인 곳: 같은 쪽 요소 안 / 쪽 사이 틈 / 본문 스크롤 영역 밖.
  function clampContext(node, off, anchorPage) {
    var ctx = { anchorPage: anchorPage, where: "outside", pointPage: null, nearPages: [] };
    var el = node.nodeType === 3 ? node.parentElement : node;
    var pageEl = el && el.closest ? el.closest(".rd-page") : null;
    if (pageEl) {
      ctx.where = "page";
      ctx.pointPage = Number(pageEl.dataset.page) || 0;
      return ctx;
    }
    var sc = $("rd-scroll");
    if (sc && sc.contains(node)) {
      ctx.where = "gap";
      var prev = 0, next = 0;
      Array.prototype.forEach.call(sc.querySelectorAll(".rd-page"), function (pe) {
        try {
          var pr = document.createRange();
          pr.selectNode(pe);
          var c = pr.comparePoint(node, off); // 1: 지점이 쪽 뒤, -1: 지점이 쪽 앞
          var n = Number(pe.dataset.page) || 0;
          if (c > 0) prev = n; else if (c < 0 && !next) next = n;
        } catch (err) { /* 비교할 수 없는 쪽은 건너뛴다 */ }
      });
      ctx.nearPages = [prev, next].filter(function (n) { return n >= 1; });
    }
    return ctx;
  }

  // 글자 층 밖 끝점: 글자 층 안쪽 끝점이 있는 쪽의 끝(시작)으로만 당긴다.
  function clampedPoint(node, off, isEnd, anchorPage) {
    if (!node || !node.nodeType || !(anchorPage >= 1)) return null;
    var layers = Array.prototype.slice.call(document.querySelectorAll(".rd-page .textLayer")).map(function (tl) {
      // 끝점이 쪽 요소처럼 글자 층의 조상일 수도 있어 위치 비교는 (노드, 오프셋) 지점으로 한다.
      var rel = 0;
      try {
        var lr = document.createRange();
        lr.selectNodeContents(tl);
        var c = lr.comparePoint(node, off);
        rel = c > 0 ? -1 : c < 0 ? 1 : 0; // 지점이 층 뒤에 있으면 층이 지점보다 앞(-1)
      } catch (err) { rel = 0; }
      return { page: pageOfLayer(tl), rel: rel, el: tl };
    });
    var t = clampTarget(isEnd, layers, clampContext(node, off, anchorPage));
    if (!t) return null;
    var tl2 = layers.filter(function (l) { return l.page === t.page; })[0].el;
    var sp = t.edge === "end" ? lastSpanIn(tl2) : firstSpanIn(tl2);
    if (!sp) return null;
    return { page: t.page, node: sp, off: t.edge === "end" ? 1 : 0 };
  }

  async function pageText(p) {
    var res = await TM().get(p, { measure: false, quiet: true });
    return res ? res.text : null;
  }

  // 반환: null | {ranges:[{page,start,end}], text, quote, rects:{page:[Rect]}, clientRect}
  async function compute() {
    var sel = root.getSelection ? root.getSelection() : null;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    var raw = sel.toString();
    if (raw.replace(/\s+/g, "").length < 2) return null;
    var r = sel.getRangeAt(0);
    var s = pointOf(r.startContainer, r.startOffset, false);
    var e = pointOf(r.endContainer, r.endOffset, true);
    // 한쪽 끝점만 글자 층 밖이면 안쪽 끝점이 있는 쪽 안에서만 당긴다(두 끝점이 다 층 밖이면 무시).
    if (!s && e && !textLayerOf(r.startContainer)) s = clampedPoint(r.startContainer, r.startOffset, false, e.page);
    else if (!e && s && !textLayerOf(r.endContainer)) e = clampedPoint(r.endContainer, r.endOffset, true, s.page);
    if (!s || !e) return null;
    // 두 끝점의 쪽 글이 준비돼야 DOM 위치를 쪽 글 위치로 바꿀 수 있다.
    var ensured = await Promise.all([TM().get(s.page, { measure: false, quiet: true }), TM().get(e.page, { measure: false, quiet: true })]);
    if (!ensured[0] || !ensured[1]) return null;
    var os = TM().domPointToOffset(s.page, s.node, s.off);
    var oe = TM().domPointToOffset(e.page, e.node, e.off);
    if (os < 0 || oe < 0) return null;
    var ps = s.page;
    var pe = e.page;
    if (ps > pe || (ps === pe && os > oe)) { var tp = ps; ps = pe; pe = tp; var to = os; os = oe; oe = to; }
    if (pe - ps + 1 > MAX_PAGES) {
      D().notify("한 번에 " + MAX_PAGES + "쪽을 넘게 선택할 수 없습니다. 범위를 줄여 주세요.");
      return null;
    }
    var texts = {};
    for (var p = ps; p <= pe; p++) {
      var t = await pageText(p);
      if (t === null) return null;
      texts[p] = t;
    }
    var pieces = [];
    if (ps === pe) pieces.push({ page: ps, a: os, b: oe });
    else {
      pieces.push({ page: ps, a: os, b: texts[ps].length });
      for (var m = ps + 1; m < pe; m++) pieces.push({ page: m, a: 0, b: texts[m].length });
      pieces.push({ page: pe, a: 0, b: oe });
    }
    // 공백만 걸친 끝을 걷어 낸 뒤 낱말 경계로 넓힌다. 글자가 하나도 없는 조각(머리말 빈칸 등)은 버린다.
    var ranges = [];
    normalizeRanges(pieces).forEach(function (rg) {
      var text = texts[rg.page];
      var a = rg.start;
      var b = rg.end;
      while (a < b && isWs(text.charAt(a))) a++;
      while (b > a && isWs(text.charAt(b - 1))) b--;
      if (b <= a) return;
      var sn = G.snapToWords(text, a, b);
      ranges.push({ page: rg.page, start: sn.start, end: sn.end });
    });
    if (!ranges.length) return null;
    var quote = ranges.map(function (rg) { return texts[rg.page].slice(rg.start, rg.end); }).join("\n");
    if (quote.replace(/\s+/g, "").length < 2) return null;

    // 미리보기 사각형(쪽 좌표)과 도구를 놓을 화면 사각형
    var rects = {};
    var datas = await boxesForPages(ranges.map(function (rg) { return rg.page; }));
    for (var i = 0; i < ranges.length; i++) {
      var rr = ranges[i];
      var data = datas[rr.page];
      rects[rr.page] = data ? G.rangeRects(data.charBoxes, rr.start, rr.end) : [];
    }
    return { ranges: ranges, text: raw, quote: quote, rects: rects, clientRect: clientRectOf(rects) };
  }

  // 그려진 쪽이면 측정 상자, 아직 안 그린 쪽이면 가중치 상자(미리보기만 쓴다)
  // 쪽들을 한꺼번에 기다린다(제한 시간은 전체에 한 번). 시간 안에 측정이 끝난 쪽은 측정 상자, 나머지는 가중치 상자.
  async function boxesForPages(pages) {
    var out = {};
    var measured = pages.map(function (p) {
      return TM().get(p).then(function (d) { out[p] = d; }, function () { /* 아래에서 가중치 상자로 대신한다 */ });
    });
    var timer = 0;
    var timeout = new Promise(function (resolve) { timer = setTimeout(resolve, BOXES_TIMEOUT_MS); });
    await Promise.race([Promise.all(measured), timeout]);
    clearTimeout(timer);
    await Promise.all(pages.map(async function (p) {
      if (out[p]) return;
      try { out[p] = await TM().get(p, { measure: false, quiet: true }); } catch (err) { out[p] = null; }
    }));
    return out;
  }

  function clientRectOf(rects) {
    var l = Infinity, t = Infinity, rgt = -Infinity, b = -Infinity;
    Object.keys(rects).forEach(function (k) {
      var page = Number(k);
      (rects[k] || []).forEach(function (r) {
        var tl = D().pageToClient(page, { x: r.x, y: r.y });
        var br = D().pageToClient(page, { x: r.x + r.w, y: r.y + r.h });
        if (!tl || !br) return;
        l = Math.min(l, tl.x); t = Math.min(t, tl.y); rgt = Math.max(rgt, br.x); b = Math.max(b, br.y);
      });
    });
    if (l === Infinity) return null;
    return { left: l, top: t, right: rgt, bottom: b, width: rgt - l, height: b - t };
  }

  // ---------- 미리보기 ----------
  function clearPreview() {
    previewPages.forEach(function (p) { root.ReaderOverlay.clearPage(p, "flash"); });
    previewPages = [];
  }
  function drawPreview(res) {
    clearPreview();
    Object.keys(res.rects).forEach(function (k) {
      var page = Number(k);
      if (!res.rects[k].length) return;
      root.ReaderOverlay.setRects(page, "flash", [{ id: "selpreview", rects: res.rects[k], className: "rd-selpreview" }]);
      previewPages.push(page);
    });
  }

  // ---------- 도구 위치 ----------
  function showTool(res) {
    var el = tool();
    if (!el || !res.clientRect) return;
    toolHiddenByScroll = false;
    el.hidden = false;
    var r = res.clientRect;
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    var vw = root.innerWidth;
    var vh = root.innerHeight;
    var barBottom = $("rd-toolbar") ? $("rd-toolbar").getBoundingClientRect().bottom : 0;
    var left = Math.min(Math.max(8, (r.left + r.right) / 2 - w / 2), Math.max(8, vw - w - 8));
    var above = r.top - h - TOOL_GAP;
    var below = r.bottom + TOOL_GAP;
    var top;
    if (isCoarse()) top = below; // 터치 기기: OS 선택 메뉴(위)와 겹치지 않게 아래
    else top = above >= barBottom + 4 ? above : below;
    if (top + h > vh - 8) top = Math.max(barBottom + 4, Math.min(above, vh - h - 8));
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
  }
  // 창 크기·확대 배율이 바뀌면 도구를 선택 위치에 다시 맞춘다(선택이 화면 밖이면 닫는다).
  function reposition() {
    if (!cur) return;
    cur.clientRect = clientRectOf(cur.rects);
    var el = tool();
    if (!cur.clientRect || !el || el.hidden) { if (!cur.clientRect) hideTool(); return; }
    showTool(cur);
  }
  function repositionSoon() {
    if (!cur) return;
    hideTool();
    root.requestAnimationFrame(function () { root.requestAnimationFrame(function () {
      if (!cur) return;
      cur.clientRect = clientRectOf(cur.rects);
      if (cur.clientRect && !down) showTool(cur);
    }); });
  }
  function hideTool() {
    var el = tool();
    if (el) el.hidden = true;
  }

  // ---------- 갱신 ----------
  async function refresh() {
    var my = ++token;
    var res = null;
    try { res = await compute(); } catch (err) { console.error("[reader] 선택 읽기 실패", err); res = null; }
    if (my !== token) return;
    var had = !!cur;
    cur = res;
    if (res) {
      drawPreview(res);
      showTool(res);
    } else {
      clearPreview();
      hideTool();
    }
    if (res || had) selectCbs.forEach(function (cb) { try { cb(res); } catch (e) { console.error(e); } });
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { if (!down) refresh(); }, DEBOUNCE_MS);
  }

  function clear() {
    token++;
    clearTimeout(timer);
    var sel = root.getSelection ? root.getSelection() : null;
    if (sel && sel.rangeCount) sel.removeAllRanges();
    var had = !!cur;
    cur = null;
    clearPreview();
    hideTool();
    if (had) selectCbs.forEach(function (cb) { try { cb(null); } catch (e) { console.error(e); } });
  }

  // ---------- 복사 ----------
  function copyText(text) {
    var t = String(text == null ? "" : text);
    function fallback() {
      return new Promise(function (resolve, reject) {
        var ta = document.createElement("textarea");
        ta.value = t;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        ta.remove();
        if (ok) resolve(); else reject(new Error("copy-failed"));
      });
    }
    var p = root.navigator && navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(t).catch(fallback)
      : fallback();
    return p.catch(function (err) {
      D().notify("복사하지 못했습니다. 글을 직접 선택해 복사해 주세요.");
      throw err;
    });
  }

  // ---------- 이벤트 ----------
  function onToolClick(e) {
    var btn = e.target.closest("button[data-act]");
    if (!btn || !cur) return;
    var snap = cur;
    var act = btn.dataset.act;
    if (act === "copy") {
      copyText(snap.text).catch(function () { /* 안내는 copyText 가 이미 띄웠다 */ });
      clear();
    } else if (act === "lookup") {
      var ev = new CustomEvent("reader:lookup", { detail: { text: snap.text.replace(/\s+/g, " ").trim() } });
      $("reader").dispatchEvent(ev);
      clear();
    } else if (act === "hl" || act === "memo") {
      var color = btn.dataset.color || "";
      clear();
      actionCbs.forEach(function (cb) { try { cb(act, color, snap); } catch (err) { console.error(err); } });
    }
  }

  function init() {
    if (ready) return;
    ready = true;
    var el = tool();
    if (el) {
      // 버튼을 눌러도 글자 선택이 풀리지 않게 한다.
      el.addEventListener("mousedown", function (e) { e.preventDefault(); });
      el.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      el.addEventListener("click", onToolClick);
    }
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("pointerdown", function (e) {
      var t = e.target;
      if (t.closest && t.closest("#rd-seltool")) return;
      down = true;
      hideTool();
      // 본문 밖(패널·도구 막대 등)을 누르면 선택을 정리한다. 본문 안은 브라우저가 선택을 바꾼다.
      if (cur && !(t.closest && t.closest(".textLayer"))) clear();
    }, true);
    function release() {
      if (!down) return;
      down = false;
      setTimeout(refresh, 0);
    }
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
    var sc = $("rd-scroll");
    if (sc) sc.addEventListener("scroll", function () {
      if (cur && !toolHiddenByScroll) { toolHiddenByScroll = true; hideTool(); }
    }, { passive: true });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && (cur || (tool() && !tool().hidden))) clear();
    });
    root.addEventListener("resize", function () { if (cur) reposition(); });
    var rd = $("reader");
    if (rd) {
      rd.addEventListener("reader:scalechange", repositionSoon);
      rd.addEventListener("reader:docclose", clear);
      rd.addEventListener("reader:docopen", clear);
    }
  }

  root.ReaderSelection = {
    init: init,
    normalizeRanges: normalizeRanges,
    clampTarget: clampTarget,
    current: function () {
      if (!cur) return null;
      return { ranges: cur.ranges, text: cur.text, quote: cur.quote, clientRect: cur.clientRect };
    },
    onSelect: function (cb) { if (typeof cb === "function") selectCbs.push(cb); },
    onAction: function (cb) { if (typeof cb === "function") actionCbs.push(cb); },
    clear: clear,
    copyText: copyText,
  };
})(typeof window !== "undefined" ? window : globalThis);
