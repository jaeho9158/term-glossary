// 리더 조립: 첫 화면(파일 선택·끌어다 놓기·최근 문서), 전체 화면 전환, 도구 막대.
// 이후 작업이 이 파일에 기능을 이어 붙인다. 문서·쪽 로직은 ReaderDoc, 패널은 ReaderPanels 에 있다.
(function (root) {
  "use strict";
  if (typeof document === "undefined") return;

  var SCALE_KEY = "rd-scale";
  var ZOOM_STEP = 1.1;
  var store = root.ViewerStorage || null;
  var baseTitle = document.title;

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
    if (opening) return;
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
    document.title = d.title + " - 논문 리더";
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
    document.title = baseTitle;
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
    if (!readerEl.hidden) teardown();
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
    });
    document.addEventListener("click", function (e) {
      if (!bar.classList.contains("more-open")) return;
      if (e.target.closest("#rd-extra")) return;
      bar.classList.remove("more-open");
      more.setAttribute("aria-expanded", "false");
    });
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

  // ---------- 시작 ----------
  root.ReaderPanels.init();
  root.ReaderSearch.init();
  bindToolbar();
  bindHome();
  // 새로고침으로 #doc= 만 남은 주소는 첫 화면이다. 해시를 정리한다.
  if (/^#doc=/.test(root.location.hash)) {
    try { history.replaceState(null, "", root.location.pathname + root.location.search); } catch (e) { /* 무시 */ }
  }
  renderRecent();
  openDebugPdf();
})(typeof window !== "undefined" ? window : globalThis);
