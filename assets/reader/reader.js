// 리더 조립: 첫 화면(파일 선택·끌어다 놓기·최근 문서), 전체 화면 전환, 도구 막대.
// 이후 작업이 이 파일에 기능을 이어 붙인다. 문서·쪽 로직은 ReaderDoc, 패널은 ReaderPanels 에 있다.
(function (root) {
  "use strict";

  // 키 입력 하나가 리더에서 무엇을 뜻하는지(순수 함수: 시험이 직접 부른다). 스펙 §3.4 의 표.
  //   e = {key, ctrlKey, metaKey, shiftKey, altKey?, targetIsInput}  (검색 입력의 Enter 는 search.js 가 처리한다)
  //   반환: "search" | "zoom-in" | "zoom-out" | "fit-width" | "page-next" | "page-prev"
  //         | "toggle-left" | "toggle-right" | "escape" | null
  // 입력란에 초점이 있으면 글자 키([ ]), 화살표, PageUp/PageDown 은 null. Esc 와 Ctrl+F 는 입력란에서도 동작한다.
  function keyAction(e) {
    if (!e) return null;
    var key = e.key;
    var mod = !!(e.ctrlKey || e.metaKey);
    if (key === "Escape") return "escape";
    if (mod && !e.shiftKey && !e.altKey && (key === "f" || key === "F")) return "search";
    if (mod && !e.altKey) {
      if (key === "+" || key === "=") return "zoom-in";
      if (key === "-" || key === "_") return "zoom-out";
      if (key === "0") return "fit-width";
      return null;
    }
    if (e.altKey || e.targetIsInput) return null;
    if (key === "[") return "toggle-left";
    if (key === "]") return "toggle-right";
    if (e.shiftKey) return null;
    if (key === "ArrowRight" || key === "PageDown") return "page-next";
    if (key === "ArrowLeft" || key === "PageUp") return "page-prev";
    return null;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { keyAction: keyAction };
  if (typeof document === "undefined") return;
  root.ReaderKeys = { keyAction: keyAction };

  var SCALE_KEY = "rd-scale";
  var ZOOM_STEP = 1.1;
  var store = root.ViewerStorage || null;

  function $(id) { return document.getElementById(id); }
  var readerEl = $("reader");
  var homeEl = $("home");
  var opening = false;

  // ---------- 저장된 배율 ----------
  function readScalePref() {
    try {
      var v = root.localStorage.getItem(SCALE_KEY);
      if (v === "fit-width" || v === "fit-page") return v;
      var n = Number(v);
      if (v !== null && Number.isFinite(n) && n > 0) return n;
    } catch (e) { /* 저장소를 못 읽으면 기본값 */ }
    return "fit-width";
  }
  function writeScalePref(v) {
    try { root.localStorage.setItem(SCALE_KEY, String(v)); } catch (e) { /* 기억만 못 할 뿐 */ }
  }
  function applyScalePref() {
    var pref = readScalePref();
    if (pref === "fit-width") root.ReaderDoc.fitWidth();
    else if (pref === "fit-page") root.ReaderDoc.fitPage();
    else root.ReaderDoc.setScale(pref);
  }

  // ---------- 첫 화면 ----------
  function showHomeError(msg) {
    var el = $("rd-home-error");
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  async function renderRecent() {
    var box = $("rd-recent");
    var list = $("rd-recent-list");
    if (!store || !store.listDocuments) { box.hidden = true; return; }
    var docs = await store.listDocuments();
    list.textContent = "";
    if (!docs.length) { box.hidden = true; return; }
    var now = Date.now();
    docs.forEach(function (d) {
      var li = document.createElement("li");
      li.className = "rd-recent-item";
      li.dataset.id = String(d.id);
      var open = document.createElement("button");
      open.type = "button";
      open.className = "rd-recent-open";
      var name = document.createElement("span");
      name.textContent = store.formatRecentLabel(d, now);
      var size = document.createElement("span");
      size.className = "rd-recent-size";
      size.textContent = store.formatSize ? store.formatSize(d.size) : "";
      open.appendChild(name);
      open.appendChild(size);
      var del = document.createElement("button");
      del.type = "button";
      del.className = "rd-recent-delete";
      del.textContent = "삭제";
      del.setAttribute("aria-label", "목록에서 삭제");
      li.appendChild(open);
      li.appendChild(del);
      list.appendChild(li);
    });
    box.hidden = false;
  }

  function isPdf(file) {
    return !!file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""));
  }

  async function openFile(file, opts) {
    if (opening) { showHomeError("다른 문서를 여는 중입니다. 잠시 뒤 다시 시도해 주세요."); return; }
    if (!isPdf(file)) { showHomeError("PDF 파일만 열 수 있습니다."); return; }
    opening = true;
    showHomeError("");
    var zone = $("rd-dropzone");
    zone.setAttribute("aria-busy", "true");
    zone.classList.add("is-busy");
    try {
      await root.ReaderDoc.open(file, opts);
    } catch (err) {
      showHomeError(err && err.message ? err.message : "PDF를 열 수 없습니다. 파일이 손상되었을 수 있습니다");
    } finally {
      opening = false;
      zone.removeAttribute("aria-busy");
      zone.classList.remove("is-busy");
    }
  }

  // ---------- 전체 화면 전환 ----------
  var pushed = false;

  readerEl.addEventListener("reader:docopen", function (e) {
    var d = e.detail;
    homeEl.hidden = true;
    readerEl.hidden = false;
    document.body.classList.add("rd-open");
    $("rd-title").textContent = d.title;
    $("rd-title").title = d.title;
    $("rd-page-total").textContent = "/ " + d.numPages;
    var input = $("rd-page-input");
    input.max = String(d.numPages);
    input.value = "1";
    applyScalePref();
    $("rd-scroll").scrollTop = 0;
    try {
      history.pushState({ rd: 1 }, "", "#doc=" + String(d.docHash || "").slice(0, 12));
      pushed = true;
    } catch (err) { pushed = false; }
    $("rd-scroll").focus({ preventScroll: true });
  });

  function teardown() {
    root.ReaderDoc.close();
    readerEl.hidden = true;
    homeEl.hidden = false;
    document.body.classList.remove("rd-open");
    $("rd-back").hidden = true;
    $("rd-toolbar").classList.remove("more-open");
    $("rd-more").setAttribute("aria-expanded", "false");
    root.ReaderDoc.clearNotices();
    pushed = false;
    renderRecent();
  }

  function closeReader() {
    if (readerEl.hidden) return;
    if (pushed && history.state && history.state.rd) history.back(); // popstate 가 teardown 한다
    else teardown();
  }

  root.addEventListener("popstate", function () {
    if (!readerEl.hidden) { teardown(); return; }
    // 닫은 뒤 앞으로 가기로 돌아온 {rd:1} 항목: 열린 문서가 없으니 해시를 정리한다.
    if (history.state && history.state.rd) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* 무시 */ }
    }
  });

  // ---------- 도구 막대 ----------
  readerEl.addEventListener("reader:pagechange", function (e) {
    var input = $("rd-page-input");
    if (document.activeElement !== input) input.value = String(e.detail.page);
  });
  readerEl.addEventListener("reader:scalechange", function (e) {
    var s = e.detail.scale;
    $("rd-zoom-label").textContent = Math.round(s * 100) + "%";
    writeScalePref(e.detail.fit || (Math.round(s * 1000) / 1000));
    $("rd-fit-width").setAttribute("aria-pressed", e.detail.fit === "fit-width" ? "true" : "false");
    $("rd-fit-page").setAttribute("aria-pressed", e.detail.fit === "fit-page" ? "true" : "false");
  });

  function jumpFromInput() {
    var input = $("rd-page-input");
    var n = Number(input.value);
    if (!Number.isFinite(n) || input.value === "") { input.value = String(root.ReaderDoc.currentPage()); return; }
    root.ReaderDoc.goToPage(n);
    input.value = String(root.ReaderDoc.currentPage());
  }

  function bindToolbar() {
    $("rd-close").addEventListener("click", closeReader);
    var input = $("rd-page-input");
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); jumpFromInput(); $("rd-scroll").focus({ preventScroll: true }); }
    });
    input.addEventListener("blur", function () { input.value = String(root.ReaderDoc.currentPage()); });
    input.addEventListener("focus", function () { input.select(); });
    $("rd-zoom-in").addEventListener("click", function () { root.ReaderDoc.setScale(root.ReaderDoc.getScale() * ZOOM_STEP); });
    $("rd-zoom-out").addEventListener("click", function () { root.ReaderDoc.setScale(root.ReaderDoc.getScale() / ZOOM_STEP); });
    $("rd-fit-width").addEventListener("click", function () { root.ReaderDoc.fitWidth(); });
    $("rd-fit-page").addEventListener("click", function () { root.ReaderDoc.fitPage(); });

    var more = $("rd-more");
    var bar = $("rd-toolbar");
    more.addEventListener("click", function (e) {
      e.stopPropagation();
      var on = !bar.classList.contains("more-open");
      bar.classList.toggle("more-open", on);
      more.setAttribute("aria-expanded", on ? "true" : "false");
      if (on) { var first = $("rd-extra").querySelector("button"); if (first) first.focus(); }
    });
    document.addEventListener("click", function (e) {
      if (!bar.classList.contains("more-open")) return;
      if (e.target.closest("#rd-extra")) return;
      bar.classList.remove("more-open");
      more.setAttribute("aria-expanded", "false");
    });

    // 좁은 화면: 검색 칸에 초점이 있거나 검색어가 있으면 도구 막대를 검색에 내준다(CSS 의 .rd-searching).
    var sIn = $("rd-search-input");
    var sBox = sIn.closest(".rd-search");
    function syncSearching() {
      var active = !!sIn.value || sBox.contains(document.activeElement);
      bar.classList.toggle("rd-searching", active);
    }
    sIn.addEventListener("input", syncSearching);
    sBox.addEventListener("focusin", syncSearching);
    sBox.addEventListener("focusout", function () { setTimeout(syncSearching, 0); });
    readerEl.addEventListener("reader:docclose", function () { bar.classList.remove("rd-searching"); });
    // 더보기 메뉴는 좁은 화면에서만 있다: 넓어지면 열린 상태를 걷고, 서랍이 열리면(panels.js 가) 메뉴를 닫는다.
    var wideMq = root.matchMedia ? root.matchMedia("(min-width: 768px)") : null;
    function resetMore() { bar.classList.remove("more-open"); more.setAttribute("aria-expanded", "false"); }
    if (wideMq) {
      var onWide = function () { if (wideMq.matches) resetMore(); };
      if (wideMq.addEventListener) wideMq.addEventListener("change", onWide);
      else if (wideMq.addListener) wideMq.addListener(onWide);
    }
    $("rd-search-close").addEventListener("click", function () {
      root.ReaderSearch.clear();
      syncSearching();
      $("rd-scroll").focus({ preventScroll: true });
      syncSearching();
    });
  }

  // 도구 막대의 더보기 메뉴가 열려 있으면 닫고 true
  function closeMore() {
    var bar = $("rd-toolbar");
    if (!bar.classList.contains("more-open")) return false;
    var had = $("rd-extra").contains(document.activeElement);
    bar.classList.remove("more-open");
    var more = $("rd-more");
    more.setAttribute("aria-expanded", "false");
    if (had) more.focus();
    return true;
  }

  // ---------- 키보드 ----------
  function isTextEntry(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName;
    if (t === "TEXTAREA" || t === "SELECT") return true;
    if (t === "INPUT") return !/^(button|checkbox|radio|submit|reset|image|file)$/i.test(el.type || "");
    return !!el.isContentEditable;
  }

  // 입력란에 초점이 있으면 놓는다(검색 입력이면 검색어도 지운다). 놓은 게 있으면 true.
  function leaveInput() {
    var ae = document.activeElement;
    if (!isTextEntry(ae) || !readerEl.contains(ae)) return false;
    if (ae.id === "rd-search-input") root.ReaderSearch.clear();
    ae.blur();
    $("rd-scroll").focus({ preventScroll: true });
    return true;
  }

  // Esc 한 번에 하나만 닫는다. 순서: 카드 → 선택 도구 → 편집 창 → 더보기 → 서랍 → 입력란 초점. 닫은 게 있으면 true.
  function closeTopmost() {
    var chain = [
      function () { return !!(root.ReaderTerms && root.ReaderTerms.closeCard && root.ReaderTerms.closeCard()); },
      function () { return root.ReaderPreview && root.ReaderPreview.closeCard ? root.ReaderPreview.closeCard() : false; },
      function () { return !!(root.ReaderSelection && root.ReaderSelection.dismiss && root.ReaderSelection.dismiss()); },
      function () { return !!(root.ReaderAnnotations && root.ReaderAnnotations.dismissEditor && root.ReaderAnnotations.dismissEditor()); },
      closeMore,
      function () { return !!(root.ReaderPanels && root.ReaderPanels.closeDrawer && root.ReaderPanels.closeDrawer()); },
      leaveInput,
    ];
    for (var i = 0; i < chain.length; i++) {
      if (chain[i]()) return true;
    }
    return false;
  }

  // 좌우 화살표·PageUp/Down 이 쪽 넘김이 아니라 다른 용도일 때: 가로로 스크롤되는 확대 상태이거나, 옆 패널의 단추·목록에 초점이 있을 때.
  function arrowBelongsElsewhere(e, ae) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return false;
    var sc = $("rd-scroll");
    if (sc && sc.scrollWidth > sc.clientWidth + 1) return true;
    return !!(ae && ae.closest && ae.closest(".rd-panel") && ae !== sc);
  }

  function onKeydown(e) {
    if (readerEl.hidden || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    var ae = document.activeElement;
    var act = keyAction({
      key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
      targetIsInput: isTextEntry(e.target) || isTextEntry(ae),
    });
    if (!act) return;
    var D = root.ReaderDoc;
    var drawer = root.ReaderPanels.drawerOpen();
    switch (act) {
      case "escape":
        e.preventDefault();
        if (closeTopmost()) return;
        // 검색어가 남아 있으면(초점이 다른 곳이어도) 닫기 전에 먼저 지운다.
        if (root.ReaderSearch && root.ReaderSearch.query && root.ReaderSearch.query()) { root.ReaderSearch.clear(); return; }
        closeReader();
        return;
      case "search":
        e.preventDefault();
        root.ReaderSearch.focusInput();
        return;
      case "zoom-in": e.preventDefault(); D.setScale(D.getScale() * ZOOM_STEP); return;
      case "zoom-out": e.preventDefault(); D.setScale(D.getScale() / ZOOM_STEP); return;
      case "fit-width": e.preventDefault(); D.fitWidth(); return;
      case "page-next": if (drawer || arrowBelongsElsewhere(e, ae)) return; e.preventDefault(); D.goToPage(D.currentPage() + 1); return;
      case "page-prev": if (drawer || arrowBelongsElsewhere(e, ae)) return; e.preventDefault(); D.goToPage(D.currentPage() - 1); return;
      case "toggle-left": e.preventDefault(); root.ReaderPanels.toggle("left"); return;
      case "toggle-right": e.preventDefault(); root.ReaderPanels.toggle("right"); return;
    }
  }

  // ---------- 첫 화면 입력 ----------
  function bindHome() {
    var fileInput = $("rd-file");
    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (f) openFile(f);
    });

    var zone = $("rd-dropzone");
    ["dragenter", "dragover"].forEach(function (t) {
      zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.add("dragover"); });
    });
    ["dragleave", "drop"].forEach(function (t) {
      zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.remove("dragover"); });
    });
    zone.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) openFile(f);
    });
    // 영역 밖에 떨어뜨려 브라우저가 파일을 직접 열어 버리는 일을 막는다.
    ["dragover", "drop"].forEach(function (t) {
      document.addEventListener(t, function (e) {
        if (e.target.closest && e.target.closest("#rd-dropzone")) return;
        e.preventDefault();
      });
    });

    $("rd-recent-list").addEventListener("click", async function (e) {
      var item = e.target.closest(".rd-recent-item");
      if (!item || !store) return;
      var id = item.dataset.id;
      if (e.target.closest(".rd-recent-delete")) {
        await store.deleteDocument(id);
        await renderRecent();
        return;
      }
      if (!e.target.closest(".rd-recent-open")) return;
      var rec = await store.loadDocument(id);
      var file = rec ? store.toFile(rec) : null;
      if (!file) {
        showHomeError("이 문서를 다시 열지 못했습니다. 목록에서 지우고 다시 올려 주세요.");
        return;
      }
      if (store.touchDocument) store.touchDocument(id);
      openFile(file);
    });
  }

  // ---------- 개발·평가용: ?debugpdf=<같은 출처의 상대 주소> ----------
  function waitForPdfjs() {
    return new Promise(function (resolve, reject) {
      var tries = 0;
      (function check() {
        if (root.pdfjsLib) return resolve();
        if (++tries > 200) return reject(new Error("pdf.js를 불러오지 못했습니다."));
        setTimeout(check, 50);
      })();
    });
  }

  async function openDebugPdf() {
    var raw;
    // 개발용이라 로컬 주소에서만 받는다(운영 주소에서는 ?debugpdf= 를 무시한다).
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(root.location.hostname)) return;
    try { raw = new URLSearchParams(root.location.search).get("debugpdf"); } catch (e) { return; }
    if (!raw) return;
    var url;
    // 상대 주소만 받는다: "//" 로 시작하거나 스킴(예: https:)이 들어 있으면 거절.
    if (/^\s*\/\//.test(raw) || /^\s*[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) || raw.indexOf("\\") >= 0) { showHomeError("debugpdf 는 같은 출처의 상대 주소만 받습니다."); return; }
    try { url = new URL(raw, root.location.href); } catch (e2) { return; }
    if (url.origin !== root.location.origin) { showHomeError("debugpdf 는 같은 출처의 상대 주소만 받습니다."); return; }
    try {
      await waitForPdfjs();
      var res = await fetch(url.href, { redirect: "error" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var blob = await res.blob();
      var name = decodeURIComponent(url.pathname.split("/").pop() || "debug.pdf");
      await openFile(new File([blob], name, { type: "application/pdf" }), { skipRecent: true });
    } catch (err) {
      console.error("[reader] debugpdf 실패", err);
      showHomeError("debugpdf 를 열지 못했습니다: " + (err && err.message ? err.message : err));
    }
  }

  // ---------- 형광펜·메모 ----------
  var lastColor = "yellow";
  readerEl.addEventListener("reader:docopen", function (e) {
    if (root.ReaderAnnotations && root.ReaderAnnotations.load) root.ReaderAnnotations.load(e.detail.docHash, e.detail.title);
  });
  function bindSelectionActions() {
    root.ReaderSelection.onAction(async function (act, color, sel) {
      if (color) lastColor = color;
      var recs = await root.ReaderAnnotations.add(sel.ranges, sel.quote, lastColor, "");
      // 메모: 칠한 뒤 바로 메모 입력 창을 연다(여러 쪽에 걸쳐도 첫 쪽 기록 하나만).
      if (act === "memo" && recs.length) root.ReaderAnnotations.edit(recs[0].id, sel.clientRect);
    });
  }

  // ---------- 시작 ----------
  // 첫 화면 입력부터 묶는다: 핵심 스크립트 하나가 빠져도 첫 화면은 살아 있고 안내가 보인다.
  var initFailed = false;
  var LOAD_FAIL_MSG = "리더 일부를 불러오지 못했습니다. 새로고침 해주세요.";
  bindHome();
  renderRecent();
  [
    ["ReaderPanels", function () { root.ReaderPanels.init(); }],
    ["ReaderSearch", function () { root.ReaderSearch.init(); }],
    ["ReaderSelection", function () { root.ReaderSelection.init(); bindSelectionActions(); }],
    ["ReaderAnnotations", function () { root.ReaderAnnotations.init(); }],
    ["ReaderTerms", function () { root.ReaderTerms.init(); }],
    ["toolbar", bindToolbar],
  ].forEach(function (s) {
    try { s[1](); } catch (err) { initFailed = true; console.error("[reader] 초기화 실패:", s[0], err); }
  });
  document.addEventListener("keydown", onKeydown);
  // 입력 방식: Tab·방향·쪽 이동 키면 rd-kbd(읽기 영역 초점 테두리 허용), 포인터를 누르면 해제.
  document.addEventListener("keydown", function (e) {
    if (/^(Tab|Arrow(Up|Down|Left|Right)|Page(Up|Down)|Home|End)$/.test(e.key)) root.document.getElementById("reader").classList.add("rd-kbd");
  }, true);
  document.addEventListener("pointerdown", function () {
    root.document.getElementById("reader").classList.remove("rd-kbd");
  }, true);
  if (initFailed) {
    showHomeError(LOAD_FAIL_MSG);
    readerEl.addEventListener("reader:docopen", function () {
      if (root.ReaderDoc && root.ReaderDoc.notify) root.ReaderDoc.notify(LOAD_FAIL_MSG);
    });
  }
  // 새로고침으로 #doc= 만 남은 주소는 첫 화면이다. 해시를 정리한다.
  if (/^#doc=/.test(root.location.hash)) {
    try { history.replaceState(null, "", root.location.pathname + root.location.search); } catch (e) { /* 무시 */ }
  }
  openDebugPdf();
})(typeof window !== "undefined" ? window : globalThis);
