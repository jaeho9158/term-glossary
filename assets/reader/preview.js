// 인용 카드와 그림·표·절·식 미리보기.
// 스스로 연결한다: DOMContentLoaded 에 #reader 를 찾아 reader:docopen / docclose / pagetext / scalechange 를 듣는다.
// 찾기·연결 판단은 refs.js(순수)가 하고, 여기서는 겹침층 "ref" 에 등록하고 카드·미리보기를 띄운다.
//  - 인용([12], (Kim et al., 2020)): 마우스를 300ms 올리면 참고문헌 목록의 해당 문구 카드. 누르면 그 항목으로 이동.
//  - 참조(Fig. 3, Table 2, Eq. (5), Section 2.1): 대상 영역을 page.render 로 작은 캔버스에 그려 미리보기. 누르면 이동.
//  - 터치: 누르면 카드, 카드의 "이동" 으로 이동.
// 연결 못 한 것은 등록하지 않는다(카드 없음). 용어 밑줄과 겹치면 인용·참조가 이긴다(아래 onMove).
// "자세히" 버튼(.rd-ref-more)은 #reader 에 reader:refdetail {index, text, container} 만 낸다(조회는 biblio.js 가 한다).
(function (root) {
  "use strict";

  // 형식별 스위치. 정밀도 측정에서 98% 에 못 미친 형식은 여기서 끈다(근거는 작업 7 보고서).
  var ENABLED = {
    numeric: true,
    authorYear: true,
    fig: true,
    table: true,
    eq: true,
    sec: true,
  };

  var OPEN_DELAY = 300;
  var CLOSE_DELAY = 220;
  var PREVIEW_W = 360;
  var DPR_CAP = 2;
  var CACHE_MAX = 8;
  var MAX_LIST = 5;
  var NARROW = "(max-width: 767px)";
  var KIND_LABEL = { fig: "그림", table: "표", eq: "식", sec: "절" };

  function R() { return root.ReaderRefs; }
  function D() { return root.ReaderDoc; }
  function OV() { return root.ReaderOverlay; }
  function TMAP() { return root.ReaderTextMap; }
  function rd() { return document.getElementById("reader"); }
  function scrollEl() { return document.getElementById("rd-scroll"); }
  function isNarrow() { return !!(root.matchMedia && root.matchMedia(NARROW).matches); }

  // ---------- 문서 상태 ----------
  var gen = 0;
  var S = fresh();
  function fresh() {
    return {
      gen: ++gen,
      analysis: null, // R.analyzeDocument 결과
      display: [], // refs[i] 의 한 줄 문구
      secTargets: new Map(), // "sec:2.1" -> {page, y}
      pagesReady: new Set(), // reader:pagetext 를 받은 쪽
      entries: new Map(), // page -> overlay entry[]
      hover: null, // {page, id}
    };
  }

  function notify(msg) { if (D() && D().notify) D().notify(msg); }

  // ---------- 문서 분석 ----------
  function startAnalysis() {
    var st = S;
    var run = function () {
      if (st !== S) return;
      var TM = TMAP();
      if (!TM || !TM.allPageTexts || !R()) return;
      TM.allPageTexts().then(function (texts) {
        if (st !== S) return;
        var a = R().analyzeDocument(texts);
        st.analysis = a;
        st.display = a.display;
        registerReady();
        loadOutline(st);
      }).catch(function (err) {
        if (st !== S) return;
        if (err && /문서가 바뀌었습니다/.test(String(err.message))) return;
        console.error("[refs] 분석 실패", err);
        notify("인용·참조 미리보기를 쓸 수 없습니다.");
      });
    };
    if (root.requestIdleCallback) root.requestIdleCallback(run, { timeout: 1500 });
    else root.setTimeout(run, 50);
  }

  // 절 참조는 목차가 있어야 한다. 목차가 없거나 번호를 읽을 수 없으면 등록하지 않는다.
  function loadOutline(st) {
    if (!ENABLED.sec || !root.ReaderOutline || !root.ReaderOutline.load) return;
    Promise.resolve(root.ReaderOutline.load()).then(function (res) {
      if (st !== S || !res || !res.entries || !res.entries.length) return;
      var map = new Map();
      var dup = new Set();
      (function walk(list) {
        list.forEach(function (en) {
          var m = /^\s*(?:제\s*)?(\d{1,2}(?:\.\d{1,2}){0,3})(?!\d)\s*[.)]?\s*(?:절|장)?(?=\s|$)/.exec(String(en.title || ""));
          if (m && en.page >= 1) {
            var key = "sec:" + m[1];
            if (!map.has(key)) map.set(key, { page: en.page, y: Number(en.y) || 0 });
            else dup.add(key);
          }
          if (en.children && en.children.length) walk(en.children);
        });
      })(res.entries);
      dup.forEach(function (k) { map.delete(k); }); // 같은 번호가 목차에 둘이면 어느 쪽인지 모른다
      st.secTargets = map;
      registerReady();
    }).catch(function (err) { console.error("[refs] 목차를 읽지 못했습니다", err); });
  }

  // ---------- 쪽별 등록 ----------
  function registerReady() {
    S.pagesReady.forEach(function (p) { registerPage(p); });
  }

  function registerPage(page) {
    var st = S;
    if (!st.analysis) return;
    var TM = TMAP();
    TM.get(page).then(function (tm) {
      if (st !== S || !tm || !tm.text) return;
      var entries = buildEntries(page, tm, st);
      if (entries.length) st.entries.set(page, entries);
      else st.entries.delete(page);
      OV().setRects(page, "ref", entries);
    }).catch(function (err) { console.error("[refs] 쪽 등록 실패", page, err); });
  }

  function displayable(st, idx) {
    return idx >= 0 && R().referenceUsable(st.display[idx]);
  }

  function buildEntries(page, tm, st) {
    var a = st.analysis;
    var text = tm.text;
    var span = R().sectionSpanOnPage(a.section, page, text.length);
    var inSection = function (s) { return !!span && s >= span.from && s < span.to; };
    var G = root.ReaderGeometry;
    var list = [];

    if (ENABLED.numeric && a.numericOk) {
      R().findNumericCitations(text, a.refCount).forEach(function (c) {
        if (inSection(c.start)) return;
        var idxs = [];
        for (var i = 0; i < c.numbers.length; i++) {
          var at = -1;
          for (var k = 0; k < a.refs.length; k++) if (a.refs[k].n === c.numbers[i]) { at = k; break; }
          if (!displayable(st, at)) return; // 하나라도 못 찾으면 이 인용은 연결하지 않는다
          idxs.push(at);
        }
        list.push({ start: c.start, end: c.end, data: { type: "cite", style: "numeric", refs: idxs } });
      });
    }
    if (ENABLED.authorYear && a.refs.length) {
      R().findAuthorYearCitations(text).forEach(function (c) {
        if (inSection(c.start)) return;
        var idx = R().matchAuthorYear(c, a.refs);
        if (!displayable(st, idx)) return;
        list.push({ start: c.start, end: c.end, data: { type: "cite", style: "authorYear", refs: [idx] } });
      });
    }
    R().findCrossRefs(text).forEach(function (x) {
      if (inSection(x.start) || !ENABLED[x.kind]) return;
      var target = x.kind === "sec" ? st.secTargets.get(x.key) : a.targets.get(x.key);
      if (!target) return;
      if (target.page === page && target.offset !== undefined && x.start >= target.offset && x.start < lineEndOf(text, target.offset)) return; // 캡션 자신
      list.push({ start: x.start, end: x.end, data: { type: "xref", kind: x.kind, key: x.key, label: x.label, target: target } });
    });

    list.sort(function (p, q) { return p.start - q.start || q.end - p.end; });
    var out = [];
    var lastEnd = -1;
    list.forEach(function (it) {
      if (it.start < lastEnd) return;
      var rects = G.rangeRects(tm.charBoxes, it.start, it.end);
      if (!rects.length) return;
      lastEnd = it.end;
      out.push({ id: "ref:" + it.start, rects: rects, refine: false, className: "rd-ref-mark", data: it.data });
    });
    return out;
  }

  function lineEndOf(text, offset) {
    var nl = text.indexOf("\n", offset);
    return nl < 0 ? text.length : nl;
  }

  // ---------- 쪽 기하(이동 위치·미리보기 영역) ----------
  var pageInfoCache = new Map();

  function pageInfo(n) {
    var hit = pageInfoCache.get(n);
    if (hit && hit.gen === S.gen) return hit.p;
    var p = Promise.all([D().getPage(n), D().getTextContent(n)]).then(function (r) {
      var vp = r[0].getViewport({ scale: 1 });
      var items = (r[1] && r[1].items) || [];
      var pt = TMAP().buildPageText(items, vp.width);
      var Util = root.pdfjsLib && root.pdfjsLib.Util;
      var lines = [];
      var pos = 0;
      pt.text.split("\n").forEach(function (ln) {
        var s = pos;
        var e = pos + ln.length;
        pos = e + 1;
        var box = null;
        var seen = {};
        for (var k = s; k < e; k++) {
          var ii = pt.charItem[k];
          if (ii < 0 || ii === undefined || seen[ii]) continue;
          seen[ii] = true;
          var b = itemBox(items[ii], vp, Util);
          if (!b) continue;
          if (!box) box = { x0: b.x0, x1: b.x1, top: b.top, bottom: b.bottom };
          else { box.x0 = Math.min(box.x0, b.x0); box.x1 = Math.max(box.x1, b.x1); box.top = Math.min(box.top, b.top); box.bottom = Math.max(box.bottom, b.bottom); }
        }
        lines.push({ s: s, e: e, len: ln.length, box: box });
      });
      var long = lines.filter(function (l) { return l.len >= 25 && l.box; });
      var wide = long.filter(function (l) { return l.box.x0 < vp.width * 0.45 && l.box.x1 > vp.width * 0.55; });
      return { W: vp.width, H: vp.height, lines: lines, singleColumn: !long.length || wide.length / long.length >= 0.25 };
    });
    pageInfoCache.set(n, { gen: S.gen, p: p });
    p.catch(function () { pageInfoCache.delete(n); });
    return p;
  }

  function itemBox(item, vp, Util) {
    if (!item || !item.transform || !Util) return null;
    var m = Util.transform(vp.transform, item.transform);
    var w = Number(item.width) || 0;
    var len = Math.hypot(m[0], m[1]) || 1;
    var ax = (m[0] / len) * w * vp.scale;
    var ay = (m[1] / len) * w * vp.scale;
    var xs = [m[4], m[4] + ax, m[4] + m[2], m[4] + m[2] + ax, m[4] - 0.25 * m[2]];
    var ys = [m[5], m[5] + ay, m[5] + m[3], m[5] + m[3] + ay, m[5] - 0.25 * m[3]];
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), top: Math.min.apply(null, ys), bottom: Math.max.apply(null, ys) };
  }

  function lineAt(info, offset) {
    for (var i = 0; i < info.lines.length; i++) {
      var l = info.lines[i];
      if (offset >= l.s && offset <= l.e && l.box) return l;
    }
    return null;
  }

  // 대상 -> 이동할 쪽 안 비율. 실패하면 0.
  function targetYRatio(target) {
    if (target.y !== undefined && !(target.offset >= 0)) {
      var h = D().pageSize(target.page).h || 792;
      return Promise.resolve(Math.max(0, Math.min(1, (target.y - 4) / h)));
    }
    return pageInfo(target.page).then(function (info) {
      var l = lineAt(info, target.offset);
      return l ? Math.max(0, Math.min(1, (l.box.top - 4) / info.H)) : 0;
    }, function () { return 0; });
  }

  function jumpTo(target) {
    var st = S;
    return targetYRatio(target).then(function (ratio) {
      if (st !== S) return;
      var nav = root.ReaderNav;
      if (nav && typeof nav.jump === "function") nav.jump(target.page, ratio);
      else D().goToPage(target.page, { yRatio: ratio });
    });
  }

  // ---------- 미리보기 그리기 ----------
  var cache = []; // [{key, canvas}] 가장 최근 것이 끝
  var cardTask = null; // 진행 중인 렌더 {cancel()}

  function cacheGet(key) {
    for (var i = 0; i < cache.length; i++) {
      if (cache[i].key === key && cache[i].gen === S.gen) {
        var it = cache.splice(i, 1)[0];
        cache.push(it);
        return it.canvas;
      }
    }
    return null;
  }
  function cachePut(key, canvas) {
    cache.push({ key: key, canvas: canvas, gen: S.gen });
    while (cache.length > CACHE_MAX) cache.shift();
  }

  // 미리보기 영역(쪽 좌표). 그림은 캡션 위쪽, 표는 캡션 아래쪽으로 쪽 높이의 40%, 식·절은 대상 줄 위아래 15%.
  function previewRegion(kind, target, info) {
    var W = info.W;
    var H = info.H;
    var line = target.offset >= 0 ? lineAt(info, target.offset) : null;
    var top;
    var bottom;
    var x0 = 0;
    var x1 = W;
    if (line) {
      top = line.box.top;
      bottom = line.box.bottom;
    } else if (target.y !== undefined) {
      top = target.y;
      bottom = target.y + 14;
    } else {
      return null;
    }
    if (kind !== "sec" && line && !info.singleColumn) {
      var spansMiddle = line.box.x0 < W * 0.45 && line.box.x1 > W * 0.55;
      if (!spansMiddle) {
        if (line.box.x1 <= W * 0.55) { x0 = 0; x1 = W * 0.5 + 4; } else { x0 = W * 0.5 - 4; x1 = W; }
      }
    }
    var y0;
    var y1;
    var lh = Math.max(8, bottom - top);
    if (kind === "fig") {
      y1 = Math.min(H, bottom + lh * 2);
      y0 = Math.max(0, y1 - H * 0.4);
    } else if (kind === "table") {
      y0 = Math.max(0, top - 4);
      y1 = Math.min(H, y0 + H * 0.4);
    } else {
      var mid = (top + bottom) / 2;
      y0 = Math.max(0, mid - H * 0.15);
      y1 = Math.min(H, mid + H * 0.15);
      if (y1 - y0 < H * 0.3) { if (y0 === 0) y1 = Math.min(H, H * 0.3); else y0 = Math.max(0, H - H * 0.3); }
    }
    if (!(x1 - x0 > 10) || !(y1 - y0 > 10)) return null;
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  // 반환: Promise<canvas>. 취소하면 reject(name === "cancelled").
  function renderPreview(kind, target) {
    var token = { cancelled: false, task: null, cancel: function () { this.cancelled = true; if (this.task) { try { this.task.cancel(); } catch (e) { /* 이미 끝남 */ } } } };
    var dpr = Math.min(root.devicePixelRatio || 1, DPR_CAP);
    var p = pageInfo(target.page).then(function (info) {
      var reg = previewRegion(kind, target, info);
      if (!reg) throw new Error("미리보기 영역을 계산하지 못했습니다.");
      var key = [target.page, Math.round(reg.x0), Math.round(reg.y0), Math.round(reg.x1), Math.round(reg.y1), dpr].join(":");
      var cached = cacheGet(key);
      if (cached) return cached;
      return D().getPage(target.page).then(function (page) {
        if (token.cancelled) throw cancelledError();
        var s = PREVIEW_W / (reg.x1 - reg.x0);
        var cssH = (reg.y1 - reg.y0) * s;
        var canvas = document.createElement("canvas");
        canvas.width = Math.ceil(PREVIEW_W * dpr);
        canvas.height = Math.max(1, Math.ceil(cssH * dpr));
        canvas.style.width = PREVIEW_W + "px";
        canvas.style.height = Math.round(cssH) + "px";
        var vp = page.getViewport({ scale: s * dpr });
        var ctx = canvas.getContext("2d");
        token.task = page.render({
          canvasContext: ctx,
          viewport: vp,
          transform: [1, 0, 0, 1, -reg.x0 * s * dpr, -reg.y0 * s * dpr],
          background: "#ffffff",
        });
        return token.task.promise.then(function () {
          if (token.cancelled) throw cancelledError();
          cachePut(key, canvas);
          return canvas;
        });
      });
    });
    p.token = token;
    return p;
  }
  function cancelledError() { var e = new Error("cancelled"); e.name = "cancelled"; return e; }
  function isCancel(err) { return !!err && (err.name === "cancelled" || err.name === "RenderingCancelledException"); }

  // ---------- 카드 ----------
  var card = null;
  var cardState = null; // {page, id, type}
  var openTimer = 0;
  var closeTimer = 0;
  var pointerDown = false;
  var downPos = null;
  var lastType = "mouse";
  var last = { x: 0, y: 0 };
  var synthLeave = false;

  function ensureCard() {
    if (card) return card;
    card = document.createElement("div");
    card.className = "dict-popover rd-ref-pop";
    card.setAttribute("role", "dialog");
    card.hidden = true;
    card.addEventListener("pointerenter", function () { clearTimeout(closeTimer); });
    card.addEventListener("pointerleave", function () { scheduleClose(); });
    card.addEventListener("click", onCardClick);
    rd().appendChild(card);
    return card;
  }
  function cardOpen() { return !!card && !card.hidden; }

  function closeCard() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    if (cardTask) { cardTask.cancel(); cardTask = null; }
    if (!card || card.hidden) return;
    card.hidden = true;
    card.textContent = "";
    card.classList.remove("is-preview", "is-touch", "is-sheet");
    cardState = null;
  }
  function scheduleClose() {
    clearTimeout(closeTimer);
    if (!cardOpen()) return;
    closeTimer = setTimeout(closeCard, CLOSE_DELAY);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function refBlock(idx) {
    var a = S.analysis;
    var ref = a.refs[idx];
    var li = el("li", "rd-ref-item");
    li.dataset.refIndex = String(idx);
    var label = ref.n != null ? "[" + ref.n + "] " : "";
    li.appendChild(el("p", "rd-ref-text", label + S.display[idx]));
    var actions = el("div", "rd-ref-actions");
    var go = el("button", "rd-ref-go", "이동");
    go.type = "button";
    var more = el("button", "rd-ref-more", "자세히");
    more.type = "button";
    actions.appendChild(go);
    actions.appendChild(more);
    li.appendChild(actions);
    li.appendChild(el("div", "rd-ref-detail")); // 자세히 결과가 들어갈 빈 칸(reader:refdetail 처리기가 채운다)
    return li;
  }

  function nearestRectClient(hit, cx, cy) {
    var list = S.entries.get(hit.page) || [];
    var en = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === hit.id) en = list[i];
    var pt = D().clientToPage(cx, cy);
    var best = null;
    var bestD = Infinity;
    ((en && en.rects) || []).forEach(function (r) {
      var dx = pt ? Math.max(r.x - pt.x, 0, pt.x - (r.x + r.w)) : 0;
      var dy = pt ? Math.max(r.y - pt.y, 0, pt.y - (r.y + r.h)) : 0;
      var dd = dx * dx + dy * dy;
      if (dd < bestD) { bestD = dd; best = r; }
    });
    if (!best) return { left: cx, right: cx, top: cy, bottom: cy };
    var a = D().pageToClient(hit.page, { x: best.x, y: best.y });
    var b = D().pageToClient(hit.page, { x: best.x + best.w, y: best.y + best.h });
    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
  }

  // 표시한 줄을 가리지 않게 위나 아래에 놓고, 화면 밖으로 나가지 않게 한다.
  function position(rect) {
    var sheet = isNarrow();
    card.classList.toggle("is-sheet", sheet);
    if (sheet) { card.style.left = ""; card.style.top = ""; card.style.maxHeight = ""; return; }
    var margin = 8;
    var gap = 6;
    var vw = root.innerWidth;
    var vh = root.innerHeight;
    card.style.maxHeight = "";
    var pop = card.getBoundingClientRect();
    var left = Math.min(Math.max(rect.left, margin), Math.max(margin, vw - pop.width - margin));
    var below = vh - rect.bottom - gap - margin;
    var above = rect.top - gap - margin;
    var top;
    if (pop.height <= below) top = rect.bottom + gap;
    else if (pop.height <= above) top = rect.top - gap - pop.height;
    else if (below >= above) { top = rect.bottom + gap; card.style.maxHeight = Math.max(80, below) + "px"; }
    else { var h = Math.max(80, above); card.style.maxHeight = h + "px"; top = rect.top - gap - h; }
    card.style.left = Math.round(left) + "px";
    card.style.top = Math.round(top) + "px";
  }

  function openCard(hit, cx, cy) {
    var data = hit.data;
    if (!data || !S.analysis) return;
    var touch = lastType === "touch";
    var c = ensureCard();
    clearTimeout(closeTimer);
    if (cardTask) { cardTask.cancel(); cardTask = null; }
    c.textContent = "";
    c.classList.toggle("is-touch", touch);
    cardState = { page: hit.page, id: hit.id, type: data.type };
    var anchor = nearestRectClient(hit, cx, cy);
    if (data.type === "cite") openCitationCard(c, data, hit, anchor);
    else openPreviewCard(c, data, hit, anchor, touch);
  }

  function openCitationCard(c, data, hit, anchor) {
    c.classList.remove("is-preview");
    c.setAttribute("aria-label", "참고문헌");
    var shown = data.refs.slice(0, MAX_LIST);
    c.dataset.refIndex = String(data.refs[0]);
    var ul = el("ul", "rd-ref-list");
    shown.forEach(function (idx) { ul.appendChild(refBlock(idx)); });
    c.appendChild(ul);
    if (data.refs.length > MAX_LIST) c.appendChild(el("p", "rd-ref-more-count", "외 " + (data.refs.length - MAX_LIST) + "건"));
    c.hidden = false;
    position(anchor);
  }

  function openPreviewCard(c, data, hit, anchor, touch) {
    c.classList.add("is-preview");
    c.setAttribute("aria-label", data.label + " 미리보기");
    c.removeAttribute("data-ref-index");
    var head = el("div", "rd-ref-prev-head", data.label + " · " + data.target.page + "쪽");
    c.appendChild(head);
    var body = el("div", "rd-ref-prev-body", "불러오는 중…");
    c.appendChild(body);
    if (touch) {
      var go = el("button", "rd-ref-prev-go", "이동");
      go.type = "button";
      c.appendChild(go);
    }
    c.hidden = false;
    position(anchor);
    var st = S;
    var mine = cardState;
    var pr = renderPreview(data.kind, data.target);
    cardTask = pr.token;
    pr.then(function (canvas) {
      if (st !== S || cardState !== mine || !cardOpen()) return;
      body.textContent = "";
      body.appendChild(canvas);
      position(anchor);
    }, function (err) {
      if (isCancel(err) || st !== S || cardState !== mine) return;
      console.error("[refs] 미리보기 실패", err);
      body.textContent = "미리보기를 그리지 못했습니다.";
      position(anchor);
    });
  }

  function onCardClick(e) {
    var t = e.target;
    if (t.closest(".rd-ref-more")) {
      var li = t.closest(".rd-ref-item");
      if (!li) return;
      var idx = parseInt(li.dataset.refIndex, 10);
      var container = li.querySelector(".rd-ref-detail");
      if (!(idx >= 0) || !container || !S.analysis) return;
      rd().dispatchEvent(new CustomEvent("reader:refdetail", { detail: { index: idx, text: S.display[idx], container: container } }));
      return;
    }
    if (t.closest(".rd-ref-go")) {
      var li2 = t.closest(".rd-ref-item");
      var i2 = li2 ? parseInt(li2.dataset.refIndex, 10) : -1;
      if (i2 >= 0 && S.analysis) { var r = S.analysis.refs[i2]; closeCard(); jumpTo({ page: r.page, offset: r.offset }); }
      return;
    }
    if (t.closest(".rd-ref-prev-go")) {
      var cur = currentEntry();
      closeCard();
      if (cur && cur.data.type === "xref") jumpTo(cur.data.target);
    }
  }

  function currentEntry() {
    if (!cardState) return null;
    var list = S.entries.get(cardState.page) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === cardState.id) return list[i];
    return null;
  }

  // ---------- 마우스 올리기·누르기 ----------
  function selectionActive() {
    var sel = root.getSelection ? root.getSelection() : null;
    return !!(sel && !sel.isCollapsed && String(sel).trim());
  }

  function pushHover(page) {
    var list = S.entries.get(page);
    if (!list) return;
    var h = S.hover;
    OV().setRects(page, "ref", list.map(function (en) {
      return h && h.page === page && h.id === en.id ? Object.assign({}, en, { className: "rd-ref-mark is-hover" }) : en;
    }));
  }
  function setHover(hit) {
    var next = hit ? { page: hit.page, id: hit.id } : null;
    var prev = S.hover;
    if ((!prev && !next) || (prev && next && prev.page === next.page && prev.id === next.id)) return;
    S.hover = next;
    if (prev) pushHover(prev.page);
    if (next) pushHover(next.page);
    var sc = scrollEl();
    if (sc) sc.classList.toggle("is-ref-hover", !!next);
  }

  // 용어 층이 같은 위치의 pointermove 를 못 보게 하고, 이미 시작한 용어 카드 타이머는 pointerleave 로 거둔다.
  function silenceTerms() {
    var sc = scrollEl();
    if (!sc) return;
    synthLeave = true;
    try { sc.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" })); } catch (e) { /* 지원하지 않는 환경 */ }
    synthLeave = false;
  }

  function onMove(e) {
    if (e.pointerType === "touch") return;
    lastType = e.pointerType || "mouse";
    last.x = e.clientX;
    last.y = e.clientY;
    if (!S.analysis || e.target.closest && e.target.closest(".rd-ref-pop")) return;
    var hit = (pointerDown || selectionActive()) ? null : OV().entryAt(e.clientX, e.clientY, ["ref"]);
    if (hit && hit.data) {
      e.stopPropagation(); // 같은 자리의 용어 밑줄보다 인용·참조가 먼저
      var same = S.hover && S.hover.page === hit.page && S.hover.id === hit.id;
      clearTimeout(closeTimer);
      if (same) return;
      silenceTerms();
      setHover(hit);
      clearTimeout(openTimer);
      if (cardOpen() && cardState && cardState.page === hit.page && cardState.id === hit.id) return;
      var key = hit.page + ":" + hit.id;
      openTimer = setTimeout(function () {
        if (pointerDown || selectionActive()) return;
        var again = OV().entryAt(last.x, last.y, ["ref"]);
        if (!again || again.page + ":" + again.id !== key) return;
        openCard(again, last.x, last.y);
      }, OPEN_DELAY);
    } else if (S.hover) {
      setHover(null);
      clearTimeout(openTimer);
      if (cardOpen()) scheduleClose();
    }
  }

  function onClick(e) {
    if (e.button !== 0 || !S.analysis) return;
    if (e.target.closest && e.target.closest(".rd-ref-pop")) return;
    if (selectionActive()) return;
    if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return;
    var hit = OV().entryAt(e.clientX, e.clientY, ["ref"]);
    if (!hit || !hit.data) return;
    e.stopPropagation(); // 용어 층의 클릭 처리보다 먼저
    if (lastType === "touch") {
      if (cardOpen() && cardState && cardState.page === hit.page && cardState.id === hit.id) { closeCard(); return; }
      openCard(hit, e.clientX, e.clientY);
      return;
    }
    closeCard();
    if (hit.data.type === "cite") {
      var r = S.analysis.refs[hit.data.refs[0]];
      jumpTo({ page: r.page, offset: r.offset });
    } else {
      jumpTo(hit.data.target);
    }
  }

  function bindScroll() {
    var sc = scrollEl();
    if (!sc) return;
    sc.addEventListener("pointermove", onMove, true);
    sc.addEventListener("pointerleave", function () {
      if (synthLeave) return;
      clearTimeout(openTimer);
      setHover(null);
      if (cardOpen()) scheduleClose();
    });
    sc.addEventListener("pointerdown", function (e) {
      pointerDown = true;
      lastType = e.pointerType || "mouse";
      downPos = { x: e.clientX, y: e.clientY };
      clearTimeout(openTimer);
      setHover(null);
      if (cardOpen() && !(card && card.contains(e.target))) closeCard();
    }, true);
    sc.addEventListener("click", onClick, true);
    sc.addEventListener("scroll", function () {
      clearTimeout(openTimer);
      setHover(null);
      closeCard();
    }, { passive: true });
    document.addEventListener("pointerup", function () { pointerDown = false; }, true);
    document.addEventListener("pointercancel", function () { pointerDown = false; }, true);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && cardOpen()) closeCard(); });
  }

  // ---------- 연결 ----------
  var ready = false;
  function init() {
    if (ready) return;
    var el0 = rd();
    if (!el0) return;
    ready = true;
    bindScroll();
    el0.addEventListener("reader:docopen", function () {
      closeCard();
      pageInfoCache.clear();
      cache = [];
      S = fresh();
      startAnalysis();
    });
    el0.addEventListener("reader:docclose", function () {
      closeCard();
      pageInfoCache.clear();
      cache = [];
      S = fresh();
    });
    el0.addEventListener("reader:pagetext", function (e) {
      var p = e.detail && e.detail.page;
      if (!(p >= 1)) return;
      S.pagesReady.add(p);
      if (S.analysis) registerPage(p);
    });
    el0.addEventListener("reader:scalechange", function () { closeCard(); });
    if (D() && D().numPages && D().numPages() > 0 && D().getPdf && D().getPdf()) { S = fresh(); startAnalysis(); } // 이미 열린 문서
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  root.ReaderPreview = {
    init: init,
    // 시험·진단용
    _state: function () { return S; },
    _enabled: ENABLED,
    _renderPreview: renderPreview,
  };
})(typeof window !== "undefined" ? window : globalThis);
