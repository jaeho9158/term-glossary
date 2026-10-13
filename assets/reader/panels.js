// 리더의 좌우 패널과 탭. 넓은 화면에서는 3열 그리드, 좁은 화면(767px 이하)에서는 아래 서랍.
// 열림 상태는 localStorage "rd-panels" 에 {left,right} 로 기억한다(좁은 화면의 서랍 상태는 기억하지 않는다).
(function (root) {
  "use strict";
  if (typeof document === "undefined") return;

  var KEY = "rd-panels";
  var NARROW = "(max-width: 767px)";
  var state = { left: false, right: true };
  var mq = null;
  var ready = false;

  function body() { return document.getElementById("rd-body"); }
  function panel(side) { return document.getElementById("rd-" + side); }
  function isNarrow() { return !!(mq && mq.matches); }

  function load() {
    try {
      var raw = root.localStorage.getItem(KEY);
      if (!raw) return;
      var v = JSON.parse(raw);
      if (v && typeof v.left === "boolean") state.left = v.left;
      if (v && typeof v.right === "boolean") state.right = v.right;
    } catch (e) { /* 저장소를 못 읽으면 기본값 */ }
  }
  function save() {
    if (isNarrow()) return;
    try { root.localStorage.setItem(KEY, JSON.stringify({ left: state.left, right: state.right })); } catch (e) { /* 저장 실패는 기능에 영향 없음 */ }
  }

  function apply() {
    var b = body();
    if (!b) return;
    ["left", "right"].forEach(function (side) {
      var open = !!state[side];
      b.classList.toggle("rd-" + side + "-open", open);
      var p = panel(side);
      if (p) p.setAttribute("aria-hidden", open ? "false" : "true");
      var btn = document.getElementById("rd-" + side + "-toggle");
      if (btn) {
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.classList.toggle("is-on", open);
      }
    });
    b.classList.toggle("rd-drawer-open", isNarrow() && (state.left || state.right));
  }

  function setOpen(side, open) {
    if (side !== "left" && side !== "right") return;
    state[side] = !!open;
    // 좁은 화면에서는 서랍이 한 번에 하나만 열린다.
    if (open && isNarrow()) state[side === "left" ? "right" : "left"] = false;
    apply();
    save();
  }

  function selectTab(side, tabId) {
    var p = panel(side);
    if (!p) return;
    var tabs = p.querySelectorAll('[role="tab"]');
    var found = false;
    tabs.forEach(function (t) { if (t.dataset.tab === tabId) found = true; });
    if (!found) return;
    tabs.forEach(function (t) {
      var on = t.dataset.tab === tabId;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    p.querySelectorAll('[role="tabpanel"]').forEach(function (pane) {
      pane.hidden = pane.dataset.tab !== tabId;
    });
  }

  function init() {
    if (ready) return;
    ready = true;
    mq = root.matchMedia ? root.matchMedia(NARROW) : null;
    load();
    if (isNarrow()) { state.left = false; state.right = false; }

    ["left", "right"].forEach(function (side) {
      var btn = document.getElementById("rd-" + side + "-toggle");
      if (btn) btn.addEventListener("click", function () { toggle(side); });
      var p = panel(side);
      if (!p) return;
      var tabs = p.querySelectorAll('[role="tab"]');
      tabs.forEach(function (t) {
        t.addEventListener("click", function () { selectTab(side, t.dataset.tab); });
        t.addEventListener("keydown", function (e) {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          var list = Array.prototype.slice.call(tabs);
          var i = list.indexOf(t) + (e.key === "ArrowRight" ? 1 : -1);
          var next = list[(i + list.length) % list.length];
          selectTab(side, next.dataset.tab);
          next.focus();
        });
      });
      var close = p.querySelector(".rd-panel-close");
      if (close) close.addEventListener("click", function () { setOpen(side, false); });
      var first = tabs[0];
      if (first) selectTab(side, first.dataset.tab);
    });

    var scrim = document.getElementById("rd-scrim");
    if (scrim) scrim.addEventListener("click", function () { setOpen("left", false); setOpen("right", false); });

    if (mq) {
      var onChange = function () {
        if (isNarrow()) { state.left = false; state.right = false; } else { state.left = false; state.right = true; load(); }
        apply();
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
    apply();
  }

  function toggle(side) { setOpen(side, !state[side]); }

  root.ReaderPanels = {
    init: init,
    toggle: toggle,
    open: function (side) { setOpen(side, true); },
    close: function (side) { setOpen(side, false); },
    selectTab: selectTab,
    tabPanel: function (side, tabId) {
      var p = panel(side);
      if (!p) return null;
      var found = null;
      p.querySelectorAll('[role="tabpanel"]').forEach(function (pane) { if (pane.dataset.tab === tabId) found = pane; });
      return found;
    },
    isOpen: function (side) { return !!state[side]; },
  };
})(typeof window !== "undefined" ? window : globalThis);
