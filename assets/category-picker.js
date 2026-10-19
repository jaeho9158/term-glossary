// 분야 선택 부품 — 브라우저 기본 <select>를 검색·묶음이 있는 패널로 점진 향상한다.
//
// 원래 select는 숨긴 채 값 저장소로 남긴다. 사용자가 고르면 select.value를 바꾸고 change 이벤트를 쏘므로,
// select를 채우고 읽는 기존 코드(paste.js·terms-layer.js·history.js)는 손대지 않아도 된다.
// 기존 코드가 option을 다시 채우면(MutationObserver) 목록과 버튼 글자를 다시 맞춘다.
// 묶음은 category-data.js의 CATEGORY_GROUPS를 그대로 쓰고, 어느 묶음에도 없는 코드만 '그 밖의 분야'로 모은다.
// 사용: <select data-category-picker> — 스크립트가 불리면 자동으로 붙는다. 수동: CategoryPicker.enhance(select).
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CategoryPicker = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  var RECENT_KEY = "category-picker-recent";
  var RECENT_MAX = 3;
  var uid = 0;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function readOptions(select) {
    var all = Array.prototype.map.call(select.options, function (o) { return { value: o.value, label: o.textContent.trim() }; });
    return { allLabel: (all.filter(function (o) { return o.value === ""; })[0] || { label: "전체 분야" }).label,
      items: all.filter(function (o) { return o.value !== ""; }) };
  }

  function loadRecent() {
    try { var v = JSON.parse(root.localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function saveRecent(value) {
    if (!value) return;
    var list = [value].concat(loadRecent().filter(function (v) { return v !== value; })).slice(0, RECENT_MAX);
    try { root.localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* 저장 못 해도 동작은 그대로 */ }
  }

  // 화면에 그릴 구획을 만든다. 검색어가 있으면 이름(또는 코드)에 들어간 항목만 남기고, 빈 묶음은 뺀다.
  function buildSections(items, groups, query, recent, allLabel) {
    var q = (query || "").trim().toLowerCase();
    var match = function (it) { return !q || it.label.toLowerCase().indexOf(q) >= 0 || it.value.toLowerCase().indexOf(q) >= 0; };
    var byValue = {};
    items.forEach(function (it) { byValue[it.value] = it; });
    var sections = [];
    var top = [];
    if (!q || allLabel.toLowerCase().indexOf(q) >= 0) top.push({ value: "", label: allLabel });
    if (!q) (recent || []).forEach(function (v) { if (byValue[v]) top.push({ value: v, label: byValue[v].label, recent: true }); });
    if (top.length) sections.push({ label: "", items: top });
    var used = {};
    (groups || []).forEach(function (g) {
      var all = g.codes.filter(function (c) { return byValue[c]; }).map(function (c) { used[c] = true; return byValue[c]; });
      // 검색어가 묶음 이름과 맞으면 그 묶음 전체를 보여 준다(예: '생명' → '의학·생명').
      var list = q && g.label.toLowerCase().indexOf(q) >= 0 ? all : all.filter(match);
      if (list.length) sections.push({ label: g.label, items: list });
    });
    var rest = items.filter(function (it) { return !used[it.value] && match(it); });
    if (rest.length) sections.push({ label: "그 밖의 분야", items: rest });
    return sections;
  }

  function sectionsHTML(sections, idPrefix, selected) {
    var n = 0;
    if (!sections.length) return '<p class="cat-picker-empty">맞는 분야가 없어요</p>';
    return sections.map(function (s) {
      var head = s.label ? '<div class="cat-picker-group" role="presentation">' + esc(s.label) + "</div>" : "";
      return '<div role="group"' + (s.label ? ' aria-label="' + esc(s.label) + '"' : "") + ">" + head + s.items.map(function (it) {
        var id = idPrefix + "-o" + n++;
        return '<div class="cat-picker-option' + (it.recent ? " is-recent" : "") + '" role="option" id="' + id +
          '" data-value="' + esc(it.value) + '" aria-selected="' + (it.value === selected) + '">' + esc(it.label) +
          (it.recent ? '<span class="cat-picker-tag">최근</span>' : "") + "</div>";
      }).join("") + "</div>";
    }).join("");
  }

  // select 값을 바꾸고 change를 쏜다(값이 그대로면 쏘지 않는다).
  function commit(select, value) {
    if (select.value === value) return false;
    select.value = value;
    var ev;
    if (typeof root.Event === "function") ev = new root.Event("change", { bubbles: true });
    else { ev = root.document.createEvent("Event"); ev.initEvent("change", true, false); }
    select.dispatchEvent(ev);
    return true;
  }

  function enhance(select) {
    if (!select || select.dataset.catPickerReady) return null;
    select.dataset.catPickerReady = "1";
    var doc = select.ownerDocument;
    var id = "cat-picker-" + ++uid;
    var wrap = doc.createElement("div");
    wrap.className = "cat-picker";
    wrap.innerHTML =
      '<button type="button" class="cat-picker-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + id + '-panel">' +
      '<span class="cat-picker-value"></span><span class="cat-picker-caret" aria-hidden="true"></span></button>' +
      '<div class="cat-picker-scrim" hidden></div>' +
      '<div class="cat-picker-panel" id="' + id + '-panel" hidden>' +
      '<input type="search" class="cat-picker-search" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="' + id +
      '-list" placeholder="분야를 검색해요" aria-label="분야를 검색해요" autocomplete="off">' +
      '<div class="cat-picker-list" id="' + id + '-list" role="listbox" aria-label="' + esc(select.getAttribute("aria-label") || "분야") + '"></div></div>';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.hidden = true;
    select.tabIndex = -1;

    var trigger = wrap.querySelector(".cat-picker-trigger");
    var valueEl = wrap.querySelector(".cat-picker-value");
    var panel = wrap.querySelector(".cat-picker-panel");
    var scrim = wrap.querySelector(".cat-picker-scrim");
    var search = wrap.querySelector(".cat-picker-search");
    var list = wrap.querySelector(".cat-picker-list");
    var active = -1;
    var groups = root.CATEGORY_GROUPS || [];

    function syncLabel() {
      var o = select.options[select.selectedIndex];
      valueEl.textContent = o ? o.textContent.trim() : "";
      trigger.setAttribute("aria-label", (select.getAttribute("aria-label") || "분야") + ": " + valueEl.textContent);
    }
    function options() { return list.querySelectorAll(".cat-picker-option"); }
    function setActive(i) {
      var opts = options();
      if (active >= 0 && opts[active]) opts[active].classList.remove("is-active");
      active = opts.length ? Math.max(0, Math.min(i, opts.length - 1)) : -1;
      if (active < 0) { search.removeAttribute("aria-activedescendant"); return; }
      opts[active].classList.add("is-active");
      search.setAttribute("aria-activedescendant", opts[active].id);
      if (opts[active].scrollIntoView) opts[active].scrollIntoView({ block: "nearest" });
    }
    function render() {
      var o = readOptions(select);
      list.innerHTML = sectionsHTML(buildSections(o.items, groups, search.value, loadRecent(), o.allLabel), id, select.value);
      var opts = options();
      var sel = Array.prototype.findIndex.call(opts, function (el) { return el.getAttribute("aria-selected") === "true"; });
      active = -1;
      setActive(search.value.trim() ? 0 : Math.max(sel, 0));
    }
    function isOpen() { return !panel.hidden; }
    function open() {
      if (isOpen()) return;
      search.value = "";
      render();
      panel.hidden = false;
      scrim.hidden = false;
      wrap.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      search.setAttribute("aria-expanded", "true");
      search.focus();
      doc.addEventListener("mousedown", onOutside, true);
      doc.addEventListener("touchstart", onOutside, true);
    }
    function close(refocus) {
      if (!isOpen()) return;
      panel.hidden = true;
      scrim.hidden = true;
      wrap.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      search.setAttribute("aria-expanded", "false");
      search.removeAttribute("aria-activedescendant");
      doc.removeEventListener("mousedown", onOutside, true);
      doc.removeEventListener("touchstart", onOutside, true);
      if (refocus) trigger.focus();
    }
    function choose(value) {
      saveRecent(value);
      commit(select, value);
      syncLabel();
      close(true);
    }
    function onOutside(e) {
      if (e.target === scrim || !wrap.contains(e.target)) close(false);
    }

    trigger.addEventListener("click", function () { if (isOpen()) close(true); else open(); });
    trigger.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
    });
    search.addEventListener("input", render);
    search.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
      else if (e.key === "Home" && !search.value) { e.preventDefault(); setActive(0); }
      else if (e.key === "End" && !search.value) { e.preventDefault(); setActive(options().length - 1); }
      else if (e.key === "Enter") { e.preventDefault(); var o = options()[active]; if (o) choose(o.getAttribute("data-value")); }
      else if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "Tab") close(false);
    });
    list.addEventListener("click", function (e) {
      var o = e.target.closest(".cat-picker-option");
      if (o) choose(o.getAttribute("data-value"));
    });
    list.addEventListener("mousemove", function (e) {
      var o = e.target.closest(".cat-picker-option");
      if (!o) return;
      var i = Array.prototype.indexOf.call(options(), o);
      if (i !== active) setActive(i);
    });
    select.addEventListener("change", syncLabel);
    if (typeof root.MutationObserver === "function") {
      new root.MutationObserver(function () { syncLabel(); if (isOpen()) render(); })
        .observe(select, { childList: true, subtree: true, characterData: true });
    }
    syncLabel();
    return { open: open, close: close, render: render, sync: syncLabel, element: wrap };
  }

  function enhanceAll(doc) {
    Array.prototype.forEach.call((doc || root.document).querySelectorAll("select[data-category-picker]"), enhance);
  }

  if (root.document && typeof module === "undefined") {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", function () { enhanceAll(); });
    else enhanceAll();
  }

  return { enhance: enhance, enhanceAll: enhanceAll, buildSections: buildSections, sectionsHTML: sectionsHTML, commit: commit,
    loadRecent: loadRecent, saveRecent: saveRecent, RECENT_KEY: RECENT_KEY };
});
