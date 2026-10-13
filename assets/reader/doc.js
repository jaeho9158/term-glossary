// 리더의 문서 계층: PDF 열기, 쪽 자리 만들기, 보이는 쪽만 그리기, 배율, 쪽 이동.
// 브라우저에서는 window.ReaderDoc 으로 노출한다. planWindow 는 순수 함수라 node 테스트가 직접 쓴다.
//
// 쪽 요소: <div class="rd-page" data-page="n"><canvas class="rd-canvas"><div class="textLayer"><div class="rd-overlay">
// 쪽 좌표계(공용 약속): 배율 1의 pdf.js viewport, 원점 왼쪽 위.
(function (root) {
  "use strict";

  var MIN_SCALE = 0.5;
  var MAX_SCALE = 3;
  var WINDOW_RADIUS = 2;
  var PAGE_GAP = 12; // 쪽 사이 간격(CSS 와 같은 값)
  var FIT_PADDING = 32; // 너비 맞춤일 때 좌우 여백 합
  var FIT_PAGE_MARGIN = 24; // 쪽 맞춤일 때 위아래 여백 합
  var MAX_CANVAS_PIXELS = 16 * 1000 * 1000; // 캔버스 하나의 상한(모바일 메모리 보호)
  var SCAN_PROBE_PAGES = 3;

  // 그릴 쪽 목록: 현재 쪽 앞뒤 radius. total<=0 이면 빈 배열.
  function planWindow(current, total, radius) {
    var out = [];
    if (!(total > 0)) return out;
    var cur = Math.max(1, Math.min(total, Math.floor(current) || 1));
    var from = Math.max(1, cur - radius);
    var to = Math.min(total, cur + radius);
    for (var p = from; p <= to; p++) out.push(p);
    return out;
  }

  // 배율을 바꾼 뒤 읽던 자리를 되살릴 scrollTop. ratio = 쪽 높이 중 읽던 지점의 비율, viewportOffset = 그 지점이 보이는 칸 윗변에서 떨어진 거리.
  function anchorScrollTop(pageTop, pageHeight, ratio, viewportOffset) {
    return Math.max(0, pageTop + ratio * pageHeight - (viewportOffset || 0));
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { planWindow: planWindow, anchorScrollTop: anchorScrollTop };
  if (typeof document === "undefined") return;

  var pdfjs = function () { return root.pdfjsLib; };

  var pdf = null;
  var hash = null;
  var docTitle = "";
  var total = 0;
  var scale = 1;
  var fitMode = "fit-width"; // "fit-width" | "fit-page" | null(직접 지정)
  var sizes = []; // sizes[n] = {w,h} 배율 1. 모르는 쪽은 1쪽 크기를 쓴다
  var pageEls = [];
  var states = []; // states[n] = {scale, token, renderTask, textLayer, ready}
  var textCache = new Map(); // n -> Promise<TextContent>
  var pageCache = new Map(); // n -> Promise<PDFPageProxy>
  var current = 1;
  var openToken = 0;
  var pendingFrame = 0;
  var ro = null;
  var io = null;
  var noticeLines = [];

  function $(id) { return document.getElementById(id); }
  function rootEl() { return $("reader"); }
  function scrollEl() { return $("rd-scroll"); }
  function pagesEl() { return $("rd-pages"); }

  function emit(name, detail) {
    var el = rootEl();
    if (el) el.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  // ---------- 안내 문구 ----------
  function renderNotice() {
    var box = $("rd-notice");
    if (!box) return;
    box.textContent = "";
    noticeLines.forEach(function (line) {
      var p = document.createElement("p");
      p.textContent = line;
      box.appendChild(p);
    });
    box.hidden = noticeLines.length === 0;
  }
  function notify(msg) {
    if (noticeLines.indexOf(msg) < 0) noticeLines.push(msg);
    renderNotice();
  }
  function clearNotices() {
    noticeLines = [];
    renderNotice();
  }

  // ---------- 쪽 정보 ----------
  function getPage(n) {
    if (!pdf || n < 1 || n > total) return Promise.reject(new Error("범위를 벗어난 쪽입니다."));
    var p = pageCache.get(n);
    if (!p) {
      p = pdf.getPage(n);
      pageCache.set(n, p);
    }
    return p;
  }
  function getTextContent(n) {
    var p = textCache.get(n);
    if (!p) {
      p = getPage(n).then(function (page) { return page.getTextContent(); });
      textCache.set(n, p);
      p.catch(function () { textCache.delete(n); });
    }
    return p;
  }
  function pageSize(n) {
    return sizes[n] || sizes[1] || { w: 612, h: 792 };
  }
  function pageEl(n) { return pageEls[n] || null; }

  function sizePageEl(n) {
    var el = pageEls[n];
    if (!el) return;
    var s = pageSize(n);
    el.style.width = Math.floor(s.w * scale) + "px";
    el.style.height = Math.floor(s.h * scale) + "px";
  }
  function sizeAllPages() {
    for (var n = 1; n <= total; n++) sizePageEl(n);
  }

  // ---------- 그리기 ----------
  function pixelRatio(w, h) {
    var r = Math.min(3, Math.max(1, root.devicePixelRatio || 1));
    while (r > 1 && w * h * r * r > MAX_CANVAS_PIXELS) r -= 0.25;
    return Math.max(1, r);
  }

  function cancelState(st) {
    if (!st) return;
    st.token++;
    if (st.renderTask) { try { st.renderTask.cancel(); } catch (e) { /* 이미 끝남 */ } st.renderTask = null; }
    if (st.textLayer) { try { st.textLayer.cancel(); } catch (e2) { /* 이미 끝남 */ } st.textLayer = null; }
  }

  function releasePage(n) {
    var st = states[n];
    var el = pageEls[n];
    if (!el || !st || (!st.ready && !st.busy)) return;
    cancelState(st);
    st.ready = false;
    st.busy = false;
    st.failed = false;
    st.scale = null;
    var canvas = el.querySelector(".rd-canvas");
    if (canvas) { canvas.width = 0; canvas.height = 0; canvas.style.width = ""; canvas.style.height = ""; }
    var tl = el.querySelector(".textLayer");
    if (tl) tl.textContent = "";
  }

  async function renderPage(n) {
    var el = pageEls[n];
    if (!el || !pdf) return;
    var st = states[n];
    if (st.failed && st.scale === null && st.failedScale === scale) return;
    if (st.scale === scale && (st.ready || st.busy)) return;
    st.failed = false;
    cancelState(st);
    var token = st.token;
    var myScale = scale;
    st.busy = true;
    st.scale = myScale;
    try {
      var page = await getPage(n);
      if (token !== st.token) return;
      var base = page.getViewport({ scale: 1 });
      var prev = sizes[n];
      if (!prev || prev.w !== base.width || prev.h !== base.height) {
        sizes[n] = { w: base.width, h: base.height };
        sizePageEl(n);
      }
      var viewport = page.getViewport({ scale: myScale });
      var ratio = pixelRatio(viewport.width, viewport.height);
      var off = document.createElement("canvas");
      off.width = Math.floor(viewport.width * ratio);
      off.height = Math.floor(viewport.height * ratio);
      var task = page.render({
        canvasContext: off.getContext("2d"),
        viewport: viewport,
        transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
      });
      st.renderTask = task;
      await task.promise;
      if (token !== st.token) return;
      st.renderTask = null;

      var canvas = el.querySelector(".rd-canvas");
      canvas.width = off.width; // 같은 순간에 크기를 바꾸고 그려 깜박임을 없앤다
      canvas.height = off.height;
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";
      canvas.getContext("2d").drawImage(off, 0, 0);
      off.width = 0;
      off.height = 0;

      // 글자 레이어: 새 컨테이너에 그린 뒤 바꿔 끼운다.
      var textContent = await getTextContent(n);
      if (token !== st.token) return;
      var oldTl = el.querySelector(".textLayer");
      var tl = document.createElement("div");
      tl.className = "textLayer";
      tl.style.setProperty("--scale-factor", String(myScale));
      var layer = new (pdfjs().TextLayer)({ textContentSource: textContent, container: tl, viewport: viewport });
      st.textLayer = layer;
      await layer.render();
      if (token !== st.token) return;
      st.textLayer = null;
      oldTl.replaceWith(tl);

      st.ready = true;
      st.busy = false;
      emit("reader:pagerendered", { page: n });
    } catch (err) {
      if (token !== st.token) return; // 취소는 오류가 아니다
      st.busy = false;
      st.scale = null;
      st.failed = true;
      st.failedScale = myScale;
      st.renderTask = null;
      st.textLayer = null;
      console.error("[reader] 쪽 그리기 실패", n, err);
      notify(n + "쪽을 그리지 못했습니다. 다른 쪽은 그대로 볼 수 있습니다.");
    }
  }

  function refreshWindow() {
    if (!pdf) return;
    var sc = scrollEl();
    if (!sc || sc.clientWidth === 0) return; // 숨겨진 상태에서는 그리지 않는다
    var want = planWindow(current, total, WINDOW_RADIUS);
    var keep = new Set(want);
    for (var n = 1; n <= total; n++) {
      if (!keep.has(n)) releasePage(n);
    }
    want.forEach(function (p) { renderPage(p); });
  }

  // ---------- 현재 쪽 추적 ----------
  function computeVisible() {
    var sc = scrollEl();
    if (!sc || !total) return { pages: [], best: current };
    var r = sc.getBoundingClientRect();
    function rectOf(n) { return pageEls[n].getBoundingClientRect(); }
    // 쪽은 세로로 정렬되어 있다. 현재 쪽에서 화면에 걸친 쪽까지 이동한 뒤 위아래로 넓힌다.
    var start = current;
    var guard = 0;
    while (guard++ < total) {
      var rc = rectOf(start);
      if (rc.bottom <= r.top && start < total) start++;
      else if (rc.top >= r.bottom && start > 1) start--;
      else break;
    }
    var pages = [];
    var best = 0;
    var bestVis = -1;
    function consider(n) {
      var b = rectOf(n);
      var vis = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
      if (vis <= 0) return false;
      pages.push(n);
      if (vis > bestVis) { bestVis = vis; best = n; }
      return true;
    }
    consider(start);
    for (var n = start - 1; n >= 1 && consider(n); n--) { /* 위로 */ }
    for (var m = start + 1; m <= total && consider(m); m++) { /* 아래로 */ }
    pages.sort(function (x, y) { return x - y; });
    return { pages: pages, best: best || start };
  }

  var lastVisible = [];
  function updateFromScroll() {
    pendingFrame = 0;
    if (!pdf) return;
    var v = computeVisible();
    lastVisible = v.pages;
    var changed = v.best !== current;
    if (changed) current = v.best;
    refreshWindow();
    if (changed) emit("reader:pagechange", { page: current });
  }
  function scheduleUpdate() {
    if (pendingFrame) return;
    pendingFrame = root.requestAnimationFrame(updateFromScroll);
  }

  function visiblePages() { return lastVisible.slice(); }

  // ---------- 배율 ----------
  function clampScale(s) {
    var f = root.clampPdfScale;
    return f ? f(s, MIN_SCALE, MAX_SCALE) : Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
  }

  function anchorBefore() {
    var el = pageEls[current];
    var sc = scrollEl();
    if (!el || !sc) return null;
    var top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    var h = el.getBoundingClientRect().height || 1;
    return { page: current, ratio: -top / h, offset: 0 };
  }
  function anchorRestore(a) {
    if (!a) return;
    var el = pageEls[a.page];
    var sc = scrollEl();
    if (!el || !sc) return;
    var r = el.getBoundingClientRect();
    var pageTop = r.top - sc.getBoundingClientRect().top + sc.scrollTop;
    sc.scrollTop = anchorScrollTop(pageTop, r.height, a.ratio, a.offset);
  }

  function applyScale(next, mode) {
    if (!pdf) return;
    var s = clampScale(next);
    if (!(s > 0)) return;
    var a = anchorBefore();
    scale = s;
    fitMode = mode;
    sizeAllPages();
    anchorRestore(a);
    stretchOldCanvases();
    refreshWindow();
    scheduleUpdate();
    emit("reader:scalechange", { scale: scale, fit: fitMode });
  }

  // 새 배율 그림이 오기 전에 옛 캔버스를 CSS 로 늘려 빈 화면을 막는다.
  function stretchOldCanvases() {
    for (var n = 1; n <= total; n++) {
      var c = pageEls[n].querySelector(".rd-canvas");
      if (c && c.width > 0) {
        var s = pageSize(n);
        c.style.width = Math.floor(s.w * scale) + "px";
        c.style.height = Math.floor(s.h * scale) + "px";
      }
    }
  }

  function availableSize() {
    var sc = scrollEl();
    return { w: sc ? sc.clientWidth : 0, h: sc ? sc.clientHeight : 0 };
  }
  function fitWidthScale() {
    var a = availableSize();
    var s = pageSize(current);
    if (!(a.w > 0)) return scale;
    return clampScale((a.w - FIT_PADDING) / s.w);
  }
  function fitPageScale() {
    var a = availableSize();
    var s = pageSize(current);
    if (!(a.w > 0) || !(a.h > 0)) return scale;
    var f = root.computeFitPageScale;
    var avW = a.w - FIT_PADDING;
    var avH = a.h - FIT_PAGE_MARGIN;
    return f ? f(s.w, s.h, avW, avH, MIN_SCALE, MAX_SCALE, scale) : clampScale(Math.min(avW / s.w, avH / s.h));
  }

  function setScale(s) { applyScale(s, null); }
  function fitWidth() { applyScale(fitWidthScale(), "fit-width"); }
  function fitPage() { applyScale(fitPageScale(), "fit-page"); }
  function getScale() { return scale; }
  function getFitMode() { return fitMode; }

  var lastBox = "";
  function onResize() {
    if (!pdf) return;
    var sc = scrollEl();
    var box = sc.clientWidth + "x" + sc.clientHeight;
    if (box === lastBox) return;
    lastBox = box;
    if (fitMode === "fit-width") applyScale(fitWidthScale(), "fit-width");
    else if (fitMode === "fit-page") applyScale(fitPageScale(), "fit-page");
    else { refreshWindow(); scheduleUpdate(); }
  }

  // ---------- 쪽 이동 ----------
  function targetScrollTop(n, yRatio) {
    var el = pageEls[n];
    var sc = scrollEl();
    var top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    var y = (yRatio || 0) * el.getBoundingClientRect().height;
    return Math.max(0, top + y - (yRatio ? 48 : PAGE_GAP / 2));
  }
  function goToPageNoEvent(n, yRatio) {
    var sc = scrollEl();
    if (!sc || !pageEls[n]) return;
    sc.scrollTop = targetScrollTop(n, yRatio);
  }
  function goToPage(n, opts) {
    if (!pdf) return;
    var clamp = root.clampPdfPageNumber;
    var page = clamp ? clamp(n, total) : Math.max(1, Math.min(total, Math.floor(n) || 1));
    goToPageNoEvent(page, opts && opts.yRatio);
    var changed = page !== current;
    current = page;
    lastVisible = [page];
    refreshWindow();
    scheduleUpdate();
    if (changed) emit("reader:pagechange", { page: current });
  }
  function currentPage() { return current; }

  // ---------- 좌표 변환 ----------
  function pageToClient(n, pt) {
    var el = pageEls[n];
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { x: r.left + pt.x * scale, y: r.top + pt.y * scale };
  }
  function clientToPage(cx, cy) {
    var cand = lastVisible.length ? lastVisible : [current];
    for (var i = 0; i < cand.length; i++) {
      var n = cand[i];
      var r = pageEls[n].getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
        return { page: n, x: (cx - r.left) / scale, y: (cy - r.top) / scale };
      }
    }
    return null;
  }

  // ---------- 열기 / 닫기 ----------
  function baseName(name) {
    return String(name || "document.pdf").replace(/\.pdf$/i, "");
  }

  function buildPages() {
    var box = pagesEl();
    box.textContent = "";
    pageEls = [null];
    states = [null];
    var frag = document.createDocumentFragment();
    for (var n = 1; n <= total; n++) {
      var el = document.createElement("div");
      el.className = "rd-page";
      el.dataset.page = String(n);
      var canvas = document.createElement("canvas");
      canvas.className = "rd-canvas";
      canvas.width = 0; // 기본 300x150 이 메모리를 잡지 않게 처음엔 비워 둔다
      canvas.height = 0;
      var tl = document.createElement("div");
      tl.className = "textLayer";
      var ov = document.createElement("div");
      ov.className = "rd-overlay";
      el.appendChild(canvas);
      el.appendChild(tl);
      el.appendChild(ov);
      frag.appendChild(el);
      pageEls.push(el);
      states.push({ scale: null, token: 0, renderTask: null, textLayer: null, ready: false, busy: false });
    }
    box.appendChild(frag);
    sizeAllPages();
    if (io) io.disconnect();
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(scheduleUpdate, { root: scrollEl(), rootMargin: "200px 0px", threshold: [0, 0.25, 0.5, 0.75, 1] });
      pageEls.forEach(function (e) { if (e) io.observe(e); });
    }
  }

  function friendlyError(err) {
    var name = err && (err.name || (err.constructor && err.constructor.name));
    if (name === "PasswordException") return "암호가 걸린 PDF는 열 수 없습니다";
    return "PDF를 열 수 없습니다. 파일이 손상되었을 수 있습니다";
  }

  async function open(file, opts) {
    var token = ++openToken;
    close(true);
    var buf;
    var loaded;
    var h;
    try {
      buf = await file.arrayBuffer();
      h = await root.computeDocHash(file, buf);
      loaded = await pdfjs().getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    } catch (err) {
      console.error("[reader] 열기 실패", err);
      throw new Error(friendlyError(err));
    }
    if (token !== openToken) {
      try { loaded.destroy(); } catch (e) { /* 무시 */ }
      throw new Error("다른 문서를 여는 중입니다");
    }
    pdf = loaded;
    hash = h;
    total = loaded.numPages;
    docTitle = baseName(file.name);
    current = 1;
    lastVisible = [1];
    pageCache = new Map();
    textCache = new Map();
    sizes = [null];
    try {
      var p1 = await getPage(1);
      var v = p1.getViewport({ scale: 1 });
      sizes[1] = { w: v.width, h: v.height };
    } catch (err2) {
      pdf = null;
      hash = null;
      total = 0;
      try { loaded.destroy(); } catch (e3) { /* 무시 */ }
      console.error("[reader] 첫 쪽 읽기 실패", err2);
      throw new Error(friendlyError(err2));
    }
    scale = 1;
    fitMode = "fit-width";
    buildPages();
    clearNotices();

    if (!ro && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(function () { onResize(); });
      ro.observe(scrollEl());
    }
    scrollEl().onscroll = scheduleUpdate;

    var info = { docHash: hash, title: docTitle, numPages: total };
    emit("reader:docopen", info);
    // 이 이벤트를 받은 쪽(reader.js)이 리더를 보여 주고 배율을 정한다. 숨김 상태였다면 크기 관찰자가 그 뒤에 그린다.
    lastBox = "";
    onResize();

    if (!opts || !opts.skipRecent) saveRecent(file, token);
    probeScanned(token);
    return info;
  }

  function saveRecent(file, token) {
    var store = root.ViewerStorage;
    if (!store || !store.saveDocument) return;
    Promise.resolve(store.saveDocument(file, hash, total)).then(function (res) {
      if (token !== openToken) return;
      if (res && res.ok === false) {
        notify("이 문서를 최근 문서 목록에 저장하지 못했습니다. 브라우저 저장 공간이 부족하거나 막혀 있을 수 있습니다.");
      }
    }, function () {
      if (token !== openToken) return;
      notify("이 문서를 최근 문서 목록에 저장하지 못했습니다. 브라우저 저장 공간이 부족하거나 막혀 있을 수 있습니다.");
    });
  }

  // 앞 3쪽의 글자 항목이 모두 비면 스캔본으로 본다.
  async function probeScanned(token) {
    var n = Math.min(SCAN_PROBE_PAGES, total);
    var any = false;
    try {
      for (var p = 1; p <= n; p++) {
        var tc = await getTextContent(p);
        if (token !== openToken) return;
        var items = (tc && tc.items) || [];
        if (items.some(function (it) { return it.str && it.str.trim() !== ""; })) { any = true; break; }
      }
    } catch (err) {
      console.error("[reader] 글자 확인 실패", err);
      return;
    }
    if (!any && token === openToken) {
      notify("이 PDF는 글자를 인식할 수 없어 형광펜·용어 표시를 쓸 수 없습니다");
    }
  }

  function close(silent) {
    if (!pdf && !silent) return;
    if (!silent) openToken++;
    if (pendingFrame) { root.cancelAnimationFrame(pendingFrame); pendingFrame = 0; }
    for (var n = 1; n < states.length; n++) cancelState(states[n]);
    if (io) { io.disconnect(); io = null; }
    var old = pdf;
    var wasOpen = !!pdf;
    pdf = null;
    hash = null;
    total = 0;
    pageEls = [null];
    states = [null];
    sizes = [null];
    pageCache = new Map();
    textCache = new Map();
    lastVisible = [];
    if (pagesEl()) pagesEl().textContent = "";
    if (old) { try { old.destroy(); } catch (e) { /* 무시 */ } }
    if (wasOpen) emit("reader:docclose", {});
  }

  root.ReaderDoc = {
    open: open,
    close: function () { close(false); },
    getPdf: function () { return pdf; },
    getPage: getPage,
    getTextContent: getTextContent,
    numPages: function () { return total; },
    docHash: function () { return hash; },
    title: function () { return docTitle; },
    getScale: getScale,
    getFitMode: getFitMode,
    setScale: setScale,
    fitWidth: fitWidth,
    fitPage: fitPage,
    currentPage: currentPage,
    goToPage: goToPage,
    pageEl: pageEl,
    pageSize: pageSize,
    scrollEl: scrollEl,
    visiblePages: visiblePages,
    pageToClient: pageToClient,
    clientToPage: clientToPage,
    planWindow: planWindow,
    notify: notify,
    clearNotices: clearNotices,
  };
})(typeof window !== "undefined" ? window : globalThis);
