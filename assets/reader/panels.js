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
  var tabCbs = [];
  var opener = null; // 서랍을 연 단추: 닫을 때 초점을 돌려준다

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
    var drawer = isNarrow() && (state.left || state.right);
    b.classList.toggle("rd-drawer-open", drawer);
    if (drawer) {
      var bar = document.getElementById("rd-toolbar");
      var mo = document.getElementById("rd-more");
      if (bar) bar.classList.remove("more-open");
      if (mo) mo.setAttribute("aria-expanded", "false");
    }
    // 서랍이 열려 있는 동안: 서랍은 대화 상자, 뒤의 본문·도구 막대는 초점과 보조기기에서 뺀다.
    ["left", "right"].forEach(function (side) {
      var p = panel(side);
      if (!p) return;
      if (drawer && state[side]) { p.setAttribute("role", "dialog"); p.setAttribute("aria-modal", "true"); }
      else { p.removeAttribute("role"); p.removeAttribute("aria-modal"); }
    });
    ["rd-toolbar", "rd-scroll", "rd-notice", "rd-back"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (drawer) el.setAttribute("inert", ""); else el.removeAttribute("inert");
    });
  }

  function focusInto(side) {
    var p = panel(side);
    if (!p) return;
    var t = p.querySelector('[role="tab"][aria-selected="true"]') || p.querySelector(".rd-panel-close");
    if (t) { try { t.focus({ preventScroll: true }); } catch (e) { /* 초점을 못 옮겨도 서랍은 열렸다 */ } }
  }
  function restoreFocus(side) {
    var p = panel(side);
    var ae = document.activeElement;
    var back = opener;
    opener = null;
    if (back === document.body || !back || !document.contains(back) || typeof back.focus !== "function") back = null;
    if (!(!ae || ae === document.body || (p && p.contains(ae)))) return;
    if (back) {
      try { back.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
      if (document.activeElement === back) return;
    }
    // 연 단추가 없거나(본문에서 열었음) 사라졌거나 숨겨졌으면(예: 닫힌 편집 창의 단추) 이 서랍의 여닫이 단추로 돌려준다.
    var tg = document.getElementById("rd-" + side + "-toggle");
    if (tg) { try { tg.focus({ preventScroll: true }); } catch (e2) { /* 무시 */ } }
  }

  function setOpen(side, open) {
    if (side !== "left" && side !== "right") return;
    var narrow = isNarrow();
    var was = !!state[side];
    if (narrow && open && !was && !(state.left || state.right)) opener = document.activeElement;
    state[side] = !!open;
    // 좁은 화면에서는 서랍이 한 번에 하나만 열린다.
    if (open && narrow) state[side === "left" ? "right" : "left"] = false;
    apply();
    save();
    if (narrow && open && !was) focusInto(side);
    else if (narrow && !open && was && !(state.left || state.right)) restoreFocus(side);
  }

  // 좁은 화면에서 열린 서랍을 닫는다. 닫은 게 있으면 true (Esc 가 한 번에 하나만 닫도록 reader.js 가 쓴다).
  function closeDrawer() {
    if (!isNarrow()) return false;
    var side = state.left ? "left" : (state.right ? "right" : "");
    if (!side) return false;
    setOpen(side, false);
    return true;
  }

  function selectTab(side, tabId, opts) {
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
    // 사용자가 직접 고른 경우에만 알린다(문서를 열 때 등 프로그램이 고르는 것은 알리지 않는다).
    if (opts && opts.user) tabCbs.slice().forEach(function (cb) { try { cb({ side: side, tab: tabId, user: true }); } catch (e) { console.error(e); } });
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
        t.addEventListener("click", function () { selectTab(side, t.dataset.tab, { user: true }); });
        t.addEventListener("keydown", function (e) {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          var list = Array.prototype.slice.call(tabs);
          var i = list.indexOf(t) + (e.key === "ArrowRight" ? 1 : -1);
          var next = list[(i + list.length) % list.length];
          e.preventDefault();
          selectTab(side, next.dataset.tab, { user: true });
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
        var ae0 = document.activeElement;
        var lostSide = "";
        ["left", "right"].forEach(function (sd) { var pp = panel(sd); if (pp && ae0 && pp.contains(ae0)) lostSide = sd; });
        if (isNarrow()) { state.left = false; state.right = false; } else { state.left = false; state.right = true; load(); }
        apply();
        // 넓은 화면 -> 좁은 화면으로 바뀌어 초점이 있던 패널이 닫히면 그 여닫이 단추로 옮긴다.
        if (lostSide && isNarrow()) {
          var tg2 = document.getElementById("rd-" + lostSide + "-toggle");
          if (tg2) { try { tg2.focus({ preventScroll: true }); } catch (e3) { /* 무시 */ } }
        }
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
    onTabChange: function (cb) { if (typeof cb === "function") tabCbs.push(cb); },
    closeDrawer: closeDrawer,
    drawerOpen: function () { return isNarrow() && (state.left || state.right); },
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
