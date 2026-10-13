// 이동 후 "돌아가기". 목차·인용·참조로 이동하기 직전의 읽던 자리를 기억하고, 8초 동안 #rd-back 버튼을 보인다.
// 브라우저에서는 window.ReaderNav = {jump, back, canGoBack, position}. 스스로 연결한다(DOMContentLoaded 에 #reader 를 찾는다).
// 계산·상태는 createNav(env) 로 떼어 두어 Node 테스트에서 가짜 환경으로 검증한다.
(function (root) {
  "use strict";

  var BACK_MS = 8000;
  var TOP_OFFSET = 48; // doc.js goToPage 가 yRatio>0 일 때 위에 남기는 여백(px)과 같아야 왕복이 정확하다

  // env: { position():{page,yRatio}|null, go(page,yRatio), scrollTop():number, viewportH():number,
  //        show(), hide(), setTimer(fn,ms):id, clearTimer(id) }
  function createNav(env) {
    var origin = null;      // 처음 읽던 자리 {page, yRatio}
    var visible = false;
    var timer = null;
    var targetTop = 0;      // 이동 직후의 스크롤 위치
    var settleUntil = 0;

    function stopTimer() {
      if (timer !== null) { env.clearTimer(timer); timer = null; }
    }
    function hide() {
      stopTimer();
      origin = null;
      if (visible) { visible = false; env.hide(); }
    }
    function startTimer() {
      stopTimer();
      timer = env.setTimer(function () { timer = null; hide(); }, BACK_MS);
    }

    function jump(page, yRatio) {
      var n = Math.floor(Number(page));
      if (!(n >= 1)) return;
      var r = Number(yRatio);
      if (!(r > 0)) r = 0;
      if (r > 1) r = 1;
      // 버튼이 떠 있는 동안 이어지는 이동은 처음 자리를 지킨다.
      if (!(visible && origin)) {
        var here = env.position();
        origin = here ? { page: here.page, yRatio: here.yRatio } : null;
      }
      env.go(n, r);
      targetTop = env.scrollTop();
      settleUntil = env.now() + 400; // 이동 직후의 스크롤 이벤트는 사용자 스크롤로 세지 않는다
      if (!origin) return;
      visible = true;
      env.show();
      startTimer();
    }

    function back() {
      if (!origin) { hide(); return; }
      var o = origin;
      hide();
      env.go(o.page, o.yRatio);
    }

    // 스크롤 이벤트마다 부른다. 이동 지점에서 한 화면 넘게 벗어나면 버튼을 거둔다.
    function onScroll() {
      if (!visible) return;
      if (env.now() < settleUntil) { targetTop = env.scrollTop(); return; }
      var h = env.viewportH();
      if (Math.abs(env.scrollTop() - targetTop) > h) hide();
    }

    return {
      jump: jump,
      back: back,
      canGoBack: function () { return visible && !!origin; },
      onScroll: onScroll,
      reset: hide,
    };
  }

  // ---------- 브라우저 연결 ----------
  function rd() { return root.ReaderDoc || null; }

  // 스크롤 영역 맨 위에서 offsetPx 아래 지점이 놓인 쪽과 쪽 안 비율.
  function readingPoint(offsetPx) {
    var D = rd();
    if (!D || !D.getPdf || !D.getPdf()) return null;
    var sc = D.scrollEl();
    if (!sc) return null;
    var py = sc.getBoundingClientRect().top + (offsetPx || 0);
    var total = D.numPages();
    var n = Math.min(total, Math.max(1, D.currentPage()));
    var guard = 0;
    while (guard++ < total + 2) {
      var el = D.pageEl(n);
      if (!el) return null;
      var r = el.getBoundingClientRect();
      if (py < r.top && n > 1) n--;
      else if (py >= r.bottom && n < total) n++;
      else break;
    }
    var pe = D.pageEl(n);
    if (!pe) return null;
    var pr = pe.getBoundingClientRect();
    var ratio = pr.height > 0 ? (py - pr.top) / pr.height : 0;
    return { page: n, yRatio: Math.max(0, Math.min(1, ratio)) };
  }

  var api = {
    jump: function () {},
    back: function () {},
    canGoBack: function () { return false; },
    position: readingPoint,
  };

  // 돌아가기 단추가 초점을 가진 채 숨겨지면 초점이 사라지므로 읽는 영역으로 옮긴다.
  function hideButton(btn, doc, getScroll) {
    var focused = doc && doc.activeElement === btn;
    btn.hidden = true;
    if (focused) {
      var sc = getScroll();
      if (sc && typeof sc.focus === "function") sc.focus({ preventScroll: true });
    }
  }

  function wire() {
    var el = document.getElementById("reader");
    var btn = document.getElementById("rd-back");
    if (!el || !btn) return;
    var nav = createNav({
      position: function () { return readingPoint(TOP_OFFSET); },
      go: function (page, yRatio) {
        var D = rd();
        if (D && D.goToPage) D.goToPage(page, { yRatio: yRatio });
      },
      scrollTop: function () { var D = rd(); var sc = D && D.scrollEl(); return sc ? sc.scrollTop : 0; },
      viewportH: function () { var D = rd(); var sc = D && D.scrollEl(); return sc ? sc.clientHeight : 800; },
      show: function () { btn.hidden = false; },
      hide: function () {
        hideButton(btn, document, function () {
          var sc = document.getElementById("rd-scroll");
          if (sc && !sc.hasAttribute("tabindex")) sc.setAttribute("tabindex", "-1"); // 프로그램으로만 초점을 받는다
          return sc;
        });
      },
      setTimer: function (fn, ms) { return root.setTimeout(fn, ms); },
      clearTimer: function (id) { root.clearTimeout(id); },
      now: function () { return Date.now(); },
    });
    api.jump = nav.jump;
    api.back = nav.back;
    api.canGoBack = nav.canGoBack;
    btn.addEventListener("click", function () { nav.back(); });
    el.addEventListener("reader:docopen", function () { nav.reset(); });
    el.addEventListener("reader:docclose", function () { nav.reset(); });
    var D = rd();
    var sc = D && D.scrollEl && D.scrollEl();
    if (sc) sc.addEventListener("scroll", function () { nav.onScroll(); }, { passive: true });
  }

  if (typeof document !== "undefined") {
    root.ReaderNav = api;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
    else wire();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { createNav: createNav, BACK_MS: BACK_MS, hideButton: hideButton };
})(typeof window !== "undefined" ? window : globalThis);
