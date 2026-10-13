// 본문 검색: 대소문자 무시, 연속 공백·줄바꿈은 공백 하나로 접어 비교한다(줄바꿈으로 끊긴 구절도 찾는다).
// 결과는 쪽 순서, 글자 위치 순서. 표시는 ReaderOverlay 의 "search" 층, 위치는 ReaderTextMap 의 글자 상자.
// 순수 부분(foldText, findAll)은 Node 테스트가 쓸 수 있게 module.exports 로도 내보낸다.
(function (root) {
  "use strict";

  var DEBOUNCE_MS = 250;

  function isSpace(code) {
    return code === 32 || code === 10 || code === 13 || code === 9 || code === 160 || code === 12;
  }

  // 소문자로 바꾸고 연속 공백류를 공백 하나로 접는다. map[i] = folded[i] 가 나온 원문 위치.
  function foldText(text) {
    var out = [];
    var map = [];
    var prevSpace = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (isSpace(text.charCodeAt(i))) {
        if (prevSpace) continue;
        out.push(" ");
        map.push(i);
        prevSpace = true;
        continue;
      }
      prevSpace = false;
      var low = ch.toLowerCase();
      for (var k = 0; k < low.length; k++) { out.push(low.charAt(k)); map.push(i); }
    }
    return { folded: out.join(""), map: map };
  }

  // 쪽 글에서 query 가 나오는 모든 [start, end) (원문 위치). 겹치는 결과는 앞의 것만.
  function findAll(text, query) {
    var q = foldText(String(query || "")).folded.trim();
    var res = [];
    if (!q) return res;
    var f = foldText(text);
    var from = 0;
    for (;;) {
      var at = f.folded.indexOf(q, from);
      if (at < 0) break;
      var start = f.map[at];
      var end = f.map[at + q.length - 1] + 1;
      res.push({ start: start, end: end });
      from = at + q.length;
    }
    return res;
  }

  var pure = { foldText: foldText, findAll: findAll };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof document === "undefined") return;

  var results = []; // {page, start, end}
  var cur = -1;
  var token = 0;
  var query = "";
  var timer = 0;
  var revealToken = 0;
  var bound = false;

  function $(id) { return document.getElementById(id); }
  function D() { return root.ReaderDoc; }
  function rootEl() { return $("reader"); }

  function setCountText(msg) {
    var el = $("rd-search-count");
    if (el) el.textContent = msg;
  }
  function updateCount() {
    if (!query) { setCountText(""); return; }
    if (!results.length) { setCountText("0건"); return; }
    setCountText((cur >= 0 ? cur + 1 : 0) + " / " + results.length);
  }

  function pagesWithHits() {
    var set = new Set();
    results.forEach(function (r) { set.add(r.page); });
    return Array.from(set);
  }

  // 한 쪽의 검색 표시를 (다시) 그린다. 글자 상자가 아직 없으면 준비되는 대로.
  function paintPage(page, myToken) {
    var hits = [];
    results.forEach(function (r, i) { if (r.page === page) hits.push({ r: r, i: i }); });
    if (!hits.length) { root.ReaderOverlay.clearPage(page, "search"); return Promise.resolve(); }
    return root.ReaderTextMap.get(page).then(function (data) {
      if (myToken !== token || !data) return;
      var entries = hits.map(function (h) {
        return {
          id: h.i,
          rects: root.ReaderGeometry.rangeRects(data.charBoxes, h.r.start, h.r.end),
          className: h.i === cur ? "rd-current" : "",
          data: { index: h.i },
        };
      });
      root.ReaderOverlay.setRects(page, "search", entries);
    }, function (err) { console.error("[reader] 검색 표시 실패", page, err); });
  }

  function paintAll() {
    var myToken = token;
    pagesWithHits().forEach(function (p) { paintPage(p, myToken); });
  }

  function clearMarks() {
    root.ReaderOverlay.clear("search");
  }

  function clear() {
    token++;
    clearTimeout(timer);
    results = [];
    cur = -1;
    query = "";
    clearMarks();
    updateCount();
    var input = $("rd-search-input");
    if (input && input.value) input.value = "";
  }

  // 새 검색. 반환: 결과 건수.
  async function run(q) {
    var myToken = ++token;
    clearTimeout(timer);
    query = String(q == null ? "" : q).trim();
    results = [];
    cur = -1;
    clearMarks();
    if (!query) { updateCount(); return 0; }
    var texts;
    try {
      texts = await root.ReaderTextMap.allPageTexts();
    } catch (err) {
      if (myToken !== token) return 0;
      console.error("[reader] 검색 글 읽기 실패", err);
      setCountText("검색하지 못했습니다");
      return 0;
    }
    if (myToken !== token) return 0;
    for (var p = 0; p < texts.length; p++) {
      findAll(texts[p] || "", query).forEach(function (h) { results.push({ page: p + 1, start: h.start, end: h.end }); });
    }
    if (results.length) {
      // 지금 보는 쪽 이후의 첫 결과부터 시작한다.
      var curPage = D().currentPage();
      var first = results.findIndex(function (r) { return r.page >= curPage; });
      cur = first < 0 ? 0 : first;
    }
    updateCount();
    paintAll();
    if (cur >= 0) reveal(cur);
    return results.length;
  }

  // 결과 i 가 화면에 보이도록 스크롤한다. 이미 보이면 그대로 둔다.
  async function reveal(i) {
    var r = results[i];
    if (!r) return;
    var myReveal = ++revealToken;
    var myToken = token;
    var d = D();
    if (d.visiblePages().indexOf(r.page) < 0) d.goToPage(r.page);
    var data;
    try { data = await root.ReaderTextMap.get(r.page); } catch (e) { return; }
    if (myReveal !== revealToken || myToken !== token || !data) return;
    var rects = root.ReaderGeometry.rangeRects(data.charBoxes, r.start, r.end);
    var box = root.ReaderGeometry.unionRect(rects);
    if (!box) return;
    var sc = d.scrollEl();
    var size = d.pageSize(r.page);
    var scale = d.getScale();
    var tl = d.pageToClient(r.page, { x: box.x, y: box.y });
    var br = d.pageToClient(r.page, { x: box.x + box.w, y: box.y + box.h });
    if (!tl || !br) return;
    var vr = sc.getBoundingClientRect();
    var margin = 24;
    var inView = tl.y >= vr.top + margin && br.y <= vr.bottom - margin && tl.x >= vr.left + margin && br.x <= vr.right - margin;
    if (inView) return;
    // 세로: 결과가 화면 위쪽 1/3 지점에 오게(goToPage 의 yRatio 는 48px 여백을 뺀다).
    var want = box.y * scale - sc.clientHeight / 3 + 48;
    d.goToPage(r.page, { yRatio: Math.max(0.0001, want / (size.h * scale)) });
    // 가로: 확대해서 쪽이 화면보다 넓을 때 결과가 보이도록 맞춘다.
    var tl2 = d.pageToClient(r.page, { x: box.x, y: box.y });
    var br2 = d.pageToClient(r.page, { x: box.x + box.w, y: box.y + box.h });
    if (tl2 && br2) {
      if (br2.x > vr.right - margin) sc.scrollLeft += br2.x - (vr.right - margin);
      else if (tl2.x < vr.left + margin) sc.scrollLeft -= vr.left + margin - tl2.x;
    }
  }

  function move(delta) {
    if (!results.length) return;
    var old = cur;
    cur = cur < 0 ? (delta > 0 ? 0 : results.length - 1) : (cur + delta + results.length) % results.length;
    updateCount();
    var myToken = token;
    var pages = new Set();
    if (old >= 0 && results[old]) pages.add(results[old].page);
    pages.add(results[cur].page);
    pages.forEach(function (p) { paintPage(p, myToken); });
    reveal(cur);
  }

  function setEnabled(on) {
    ["rd-search-input", "rd-search-prev", "rd-search-next"].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !on;
    });
  }

  function init() {
    if (bound) return;
    bound = true;
    var input = $("rd-search-input");
    var el = rootEl();
    if (!input || !el) return;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var v = input.value;
      if (!v.trim()) { clear(); return; }
      timer = setTimeout(function () { run(v); }, DEBOUNCE_MS);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (input.value.trim() !== query) { clearTimeout(timer); run(input.value); return; }
        move(e.shiftKey ? -1 : 1);
      } else if (e.key === "Escape" && input.value) {
        e.stopPropagation();
        clear();
      }
    });
    $("rd-search-next").addEventListener("click", function () { move(1); });
    $("rd-search-prev").addEventListener("click", function () { move(-1); });
    document.addEventListener("keydown", function (e) {
      if (el.hidden) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
    // 글자 상자가 준비되면(쪽이 그려진 뒤) 그 쪽의 검색 표시를 그린다.
    el.addEventListener("reader:pagetext", function (e) {
      if (results.some(function (r) { return r.page === e.detail.page; })) paintPage(e.detail.page, token);
    });
    el.addEventListener("reader:docopen", function () { clear(); setEnabled(true); });
    el.addEventListener("reader:docclose", function () { clear(); setEnabled(false); });
    setEnabled(!el.hidden && !!D().getPdf());
  }

  root.ReaderSearch = {
    init: init,
    run: run,
    next: function () { move(1); },
    prev: function () { move(-1); },
    clear: clear,
    count: function () { return results.length; },
    index: function () { return cur; },
    results: function () { return results.slice(); },
    _findAll: findAll,
  };
})(typeof window !== "undefined" ? window : globalThis);
