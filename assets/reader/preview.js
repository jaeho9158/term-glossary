// 인용 카드와 그림·표·절·식 미리보기.
// 스스로 연결한다: DOMContentLoaded 에 #reader 를 찾아 reader:docopen / docclose / pagetext / scalechange 를 듣는다.
// 찾기·연결 판단은 refs.js(순수)가 하고, 여기서는 겹침층 "ref" 에 등록하고 카드·미리보기를 띄운다.
//  - 인용([12], (Kim et al., 2020)): 마우스를 300ms 올리면 참고문헌 목록의 해당 문구 카드. 누르면 그 항목으로 이동.
//  - 참조(Fig. 3, Table 2, Eq. (5), Section 2.1): 대상 영역을 page.render 로 작은 캔버스에 그려 미리보기. 누르면 이동.
//  - 터치: 누르면 카드, 카드의 "이동" 으로 이동.
// 연결 못 한 것은 등록하지 않는다(카드 없음). 겹침 우선순위는 검색 > 형광펜 > 인용·참조 > 용어.
//  - 형광펜 위의 클릭은 형광펜 편집기가 맡는다(여기서는 아무것도 안 하고 이벤트를 그대로 통과시킨다). 호버 카드는 형광펜 위에서도 뜬다.
//  - 용어 카드는 ReaderTerms.setSuppressed() 로 막는다: 이 층의 카드가 실제로 열려 있는 동안만. 표시 위를 스쳐 지나가기만 하면(카드가 뜨기 전) 열려 있는 용어 카드를 닫지 않는다.
// "자세히" 버튼(.rd-ref-more)은 #reader 에 reader:refdetail {index, text, container} 만 낸다(조회는 biblio.js 가 한다).
(function (root) {
  "use strict";

  // 형식별 스위치. 정밀도 측정에서 98% 에 못 미친 형식은 여기서 끈다(근거는 작업 7 보고서).
  var ENABLED = {
    numeric: true,
    superscript: true, // 위첨자 번호 인용: 글자 크기·기준선 기하가 필요하고 번호식 참고문헌이 있을 때만
    authorYear: true,
    fig: true,
    table: true,
    // eq·sec 은 꺼 둔다: 정밀도를 입증하지 못했다(측정 표본이 식 2건, 절 0건). 코드는 남겨 두고 근거가 모이면 다시 켠다.
    eq: false,
    sec: false,
  };
  var META_MAX_PAGES = 120; // 줄 폭·글자 크기를 읽을 캡션 후보 쪽의 상한

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
      checked: new Set(), // 인용·참조 찾기를 마친 쪽(표시가 없어도 마친 것)
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
        return buildLineMeta(texts, st).then(function (meta) {
          if (st !== S) return;
          var a = R().analyzeDocument(texts, meta);
          st.analysis = a;
          st.display = a.display;
          registerReady();
          loadOutline(st);
        });
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

  // 캡션 후보가 있는 쪽의 줄별 {x0, w, fs, y}(줄 폭·글자 크기·세로 위치). 본문 줄바꿈과 캡션을 가르는 데 쓴다. 못 읽으면 그 쪽은 글만으로 판정한다.
  function buildLineMeta(texts, st) {
    var meta = [];
    var TM = TMAP();
    if (!R().captionPages || !R().lineMetaFromItems || !D() || !D().getPage || !D().getTextContent) return Promise.resolve(meta);
    var list = R().captionPages(texts).slice(0, META_MAX_PAGES);
    var i = 0;
    return new Promise(function (resolve) {
      (function next() {
        if (st !== S || i >= list.length) { resolve(meta); return; }
        var n = list[i++];
        Promise.all([D().getPage(n), D().getTextContent(n)]).then(function (res) {
          var vp = res[0].getViewport({ scale: 1 });
          var items = (res[1] && res[1].items) || [];
          var pt = TM.buildPageText(items, vp.width);
          if (pt.text === texts[n - 1]) meta[n - 1] = R().lineMetaFromItems(pt, items);
        }).catch(function () { /* 이 쪽은 글만으로 판정 */ }).then(function () { setTimeout(next, 0); });
      })();
    });
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
    if (!st.analysis) return Promise.resolve();
    var TM = TMAP();
    return TM.get(page).then(function (tm) {
      if (st !== S) return;
      if (!tm || !tm.text) { st.checked.add(page); return; }
      var entries = buildEntries(page, tm, st);
      if (entries.length) st.entries.set(page, entries);
      else st.entries.delete(page);
      st.checked.add(page);
      OV().setRects(page, "ref", entries);
      if ((st.hover && st.hover.page === page) || (kbCur && kbCur.page === page)) pushHover(page); // 호버·키보드 초점 표시를 다시 입힌다
    }).catch(function (err) { st.checked.add(page); console.error("[refs] 쪽 등록 실패", page, err); });
  }

  function displayable(st, idx) {
    return idx >= 0 && !(st.analysis.refs[idx] && st.analysis.refs[idx].unreliable) && R().referenceUsable(st.display[idx]);
  }

  function buildEntries(page, tm, st) {
    var a = st.analysis;
    var text = tm.text;
    var span = R().sectionSpanOnPage(a.section, page, text.length);
    var inSection = function (s) { return !!span && s >= span.from && s < span.to; };
    var G = root.ReaderGeometry;
    var list = [];

    var addNumeric = function (c, style) {
      if (inSection(c.start)) return;
      var idxs = [];
      for (var i = 0; i < c.numbers.length; i++) {
        var at = -1;
        for (var k = 0; k < a.refs.length; k++) if (a.refs[k].n === c.numbers[i]) { at = k; break; }
        if (!displayable(st, at)) return; // 하나라도 못 찾으면 이 인용은 연결하지 않는다
        idxs.push(at);
      }
      list.push({ start: c.start, end: c.end, data: { type: "cite", style: style, refs: idxs, label: text.slice(c.start, c.end).replace(/\s+/g, " ").trim() } });
    };
    if (ENABLED.numeric && a.numericOk) {
      R().findNumericCitations(text, a.refCount).forEach(function (c) { addNumeric(c, "numeric"); });
    }
    // 위첨자 번호("…한다.7)", "word7,8)"): 글자 크기·기준선을 알아야 하므로 글자 조각(tm.items)이 있을 때만. 번호식 참고문헌이 있어야 한다.
    if (ENABLED.superscript && a.numericOk && tm.items && tm.charItem && R().findSuperscriptCitations && R().charGeometry) {
      var geom = R().charGeometry({ text: text, charItem: tm.charItem }, tm.items);
      R().findSuperscriptCitations(text, a.refCount, geom).forEach(function (c) { addNumeric(c, "superscript"); });
    }
    if (ENABLED.authorYear && a.refs.length) {
      R().findAuthorYearCitations(text).forEach(function (c) {
        if (inSection(c.start)) return;
        var idx = R().matchAuthorYear(c, a.refs);
        if (!displayable(st, idx)) return;
        list.push({ start: c.start, end: c.end, data: { type: "cite", style: "authorYear", refs: [idx], label: text.slice(c.start, c.end).replace(/\s+/g, " ").trim() } });
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
  var ignoreScrollUntil = 0; // 카드를 피하려고 스스로 스크롤한 직후에는 scroll 이벤트로 카드를 닫지 않는다

  function ensureCard() {
    if (card) return card;
    card = document.createElement("div");
    card.className = "dict-popover rd-ref-pop";
    card.setAttribute("role", "dialog");
    card.hidden = true;
    card.addEventListener("pointerenter", function () { clearTimeout(closeTimer); });
    card.addEventListener("pointerleave", function () { scheduleClose(); });
    card.addEventListener("click", onCardClick);
    card.addEventListener("keydown", onCardKeydown);
    rd().appendChild(card);
    return card;
  }
  function cardOpen() { return !!card && !card.hidden; }

  // 키보드로 연 카드 안에서 Tab 이 카드 밖으로 새지 않게 한다(Esc 는 reader.js 의 closeTopmost 가 닫는다).
  function onCardKeydown(e) {
    if (e.key !== "Tab" || !card) return;
    var btns = Array.prototype.slice.call(card.querySelectorAll("button"));
    if (!btns.length) { e.preventDefault(); return; }
    var first = btns[0];
    var lastBtn = btns[btns.length - 1];
    var ae = document.activeElement;
    if (e.shiftKey && (ae === first || ae === card)) { e.preventDefault(); lastBtn.focus(); }
    else if (!e.shiftKey && ae === lastBtn) { e.preventDefault(); first.focus(); }
  }

  var cardPrevFocus = null; // 터치로 카드를 열기 전의 초점 자리(닫을 때 돌려준다)
  function closeCard() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    if (cardTask) { cardTask.cancel(); cardTask = null; }
    if (!card || card.hidden) { syncSuppress(); return; }
    var back = cardPrevFocus;
    cardPrevFocus = null;
    var hadFocus = card.contains(document.activeElement);
    card.hidden = true;
    card.textContent = "";
    card.classList.remove("is-preview", "is-touch", "is-sheet", "is-kbd");
    cardState = null;
    syncSuppress();
    if (hadFocus && back && document.contains(back) && typeof back.focus === "function") {
      try { back.focus({ preventScroll: true }); } catch (err) { /* 무시 */ }
    }
  }

  // 용어 층에 알린다: 이 층의 카드가 열려 있을 때만 용어 카드를 막는다(마우스가 표시 위를 지나가는 것만으로는 막지 않는다).
  function syncSuppress() {
    var T = root.ReaderTerms;
    if (T && typeof T.setSuppressed === "function") T.setSuppressed(cardOpen());
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

  // 좁은 화면의 아래 시트가 누른 줄을 가리면, 그 줄이 시트 바로 위에 오도록 쪽을 스크롤한다. rect(화면 좌표)도 같이 옮겨 둔다.
  function revealAboveSheet(rect) {
    var sc = scrollEl();
    if (!rect || !sc || !cardOpen() || !card.classList.contains("is-sheet")) return;
    var sheetTop = card.getBoundingClientRect().top;
    var gap = 12;
    if (!(rect.bottom > sheetTop - gap)) return;
    var delta = rect.bottom - (sheetTop - gap);
    delta = Math.min(delta, Math.max(0, rect.top - sc.getBoundingClientRect().top - 4)); // 줄이 화면 위로 밀려 나가지는 않게
    if (!(delta > 0)) return;
    ignoreScrollUntil = Date.now() + 400;
    var before = sc.scrollTop;
    sc.scrollTop = before + delta;
    var moved = sc.scrollTop - before;
    rect.top -= moved;
    rect.bottom -= moved;
  }

  // 표시한 줄을 가리지 않게 위나 아래에 놓고, 화면 밖으로 나가지 않게 한다.
  function position(rect) {
    var sheet = isNarrow();
    card.classList.toggle("is-sheet", sheet);
    if (sheet) { card.style.left = ""; card.style.top = ""; card.style.maxHeight = ""; revealAboveSheet(rect); return; }
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

  // opts.keyboard: 키보드로 연다. 초점이 카드 안으로 들어가고, 미리보기에도 "이동" 단추가 붙고 클릭을 받는다.
  function openCard(hit, cx, cy, opts) {
    var data = hit.data;
    if (!data || !S.analysis) return;
    var kbd = !!(opts && opts.keyboard);
    var touch = lastType === "touch" && !kbd;
    var c = ensureCard();
    clearTimeout(closeTimer);
    if (cardTask) { cardTask.cancel(); cardTask = null; }
    c.textContent = "";
    c.classList.toggle("is-touch", touch);
    c.classList.toggle("is-kbd", kbd);
    cardState = { page: hit.page, id: hit.id, type: data.type };
    var anchor = nearestRectClient(hit, cx, cy);
    if (data.type === "cite") openCitationCard(c, data, hit, anchor);
    else openPreviewCard(c, data, hit, anchor, touch || kbd);
    syncSuppress();
    if (touch || kbd) { // 터치·키보드로 연 카드로 초점을 옮긴다(닫으면 원래 자리로 돌려준다)
      if (!cardPrevFocus) cardPrevFocus = document.activeElement;
      c.tabIndex = -1;
      try { c.focus({ preventScroll: true }); } catch (err) { /* 무시 */ }
    }
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

  // 마우스 올림(is-hover)과 키보드 초점(is-focus)을 그 쪽 표시에 입힌다.
  function pushHover(page) {
    var list = S.entries.get(page);
    if (!list) return;
    var h = S.hover;
    var k = kbCur;
    OV().setRects(page, "ref", list.map(function (en) {
      var cls = "rd-ref-mark";
      if (h && h.page === page && h.id === en.id) cls += " is-hover";
      if (k && k.page === page && k.id === en.id) cls += " is-focus";
      return cls === "rd-ref-mark" ? en : Object.assign({}, en, { className: cls });
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
    syncSuppress();
  }

  function onMove(e) {
    if (e.pointerType === "touch") return;
    lastType = e.pointerType || "mouse";
    last.x = e.clientX;
    last.y = e.clientY;
    if (!S.analysis || e.target.closest && e.target.closest(".rd-ref-pop")) return;
    var hit = (pointerDown || selectionActive()) ? null : OV().entryAt(e.clientX, e.clientY, ["ref"]);
    if (hit && hit.data) {
      var same = S.hover && S.hover.page === hit.page && S.hover.id === hit.id;
      clearTimeout(closeTimer);
      if (same) return;
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
    if (OV().entryAt(e.clientX, e.clientY, ["highlight"])) return; // 형광펜 > 인용·참조: 형광펜 편집기가 맡는다
    var hit = OV().entryAt(e.clientX, e.clientY, ["ref"]);
    if (!hit || !hit.data) return;
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
      if (cardOpen() && !(card && card.contains(e.target))) {
        // 터치로 같은 표시를 다시 누르면 카드를 닫는 쪽으로 간다: 여기서 닫으면 이어지는 click 이 다시 열어 버린다
        var again = lastType === "touch" && S.analysis ? OV().entryAt(e.clientX, e.clientY, ["ref"]) : null;
        var sameMark = !!(again && again.data && cardState && cardState.page === again.page && cardState.id === again.id);
        if (!sameMark) closeCard();
      }
    }, true);
    sc.addEventListener("click", onClick);
    sc.addEventListener("scroll", function () {
      if (Date.now() < ignoreScrollUntil) return;
      clearTimeout(openTimer);
      setHover(null);
      closeCard();
    }, { passive: true });
    document.addEventListener("pointerup", function () { pointerDown = false; }, true);
    document.addEventListener("pointercancel", function () { pointerDown = false; }, true);
  }

  // ---------- 키보드 이동 ----------
  // reader.js 가 키를 묶는다(이 파일은 함수만 내놓는다). 초점 표시는 겹침층의 is-focus 표시와 aria-live 안내문이고, 실제 DOM 초점은 건드리지 않는다.
  //  focusNext() / focusPrev(): 읽는 순서(현재 쪽 -> 뒤 쪽, 한 쪽 안에서는 글 순서)로 다음·이전 인용·그림·표 표시로 초점을 옮기고 화면에 보이게 스크롤한다.
  //    아직 찾지 않은 쪽이 사이에 있으면 그 쪽부터 찾은 뒤 옮긴다. 옮겼거나 옮기는 중이면 true, 더 없으면 false(끝이라고 안내한다).
  //  activateFocused(): 초점 표시의 카드를 연다. 초점이 카드 안으로 들어가고(role="dialog"), 닫으면 원래 자리로 돌아온다. 카드의 "이동" 단추에서 Enter 면 그 대상으로 이동한다.
  var kbCur = null; // {page, id, start}
  var kbToken = 0;
  var live = null;

  function ensureLive() {
    if (live && live.parentNode) return live;
    live = document.createElement("div");
    live.className = "rd-ref-live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    rd().appendChild(live);
    return live;
  }
  function announce(msg) {
    if (!rd()) return;
    var n = ensureLive();
    n.textContent = ""; // 같은 문구도 다시 읽히도록 비웠다가 채운다
    n.textContent = msg;
  }

  function startOf(en) { var m = /^ref:(\d+)$/.exec(String(en.id)); return m ? parseInt(m[1], 10) : 0; }
  function entryByStart(page, start) {
    var list = S.entries.get(page) || [];
    for (var i = 0; i < list.length; i++) if (startOf(list[i]) === start) return list[i];
    return null;
  }

  // 모든 표시를 읽는 순서로: [{page, start, en}]
  function orderedMarks() {
    var pages = Array.from(S.entries.keys()).sort(function (a, b) { return a - b; });
    var out = [];
    pages.forEach(function (p) {
      S.entries.get(p).forEach(function (en) { out.push({ page: p, start: startOf(en), en: en }); });
    });
    out.sort(function (a, b) { return a.page - b.page || a.start - b.start; });
    return out;
  }

  // 기준(초점 표시, 없으면 현재 쪽) 뒤/앞의 첫 표시. 없으면 null.
  function adjacentMark(dir) {
    var list = orderedMarks();
    var base = kbCur ? { page: kbCur.page, start: kbCur.start } : null;
    if (!base) {
      var cur = D() && D().currentPage ? D().currentPage() : 1;
      base = dir > 0 ? { page: cur, start: -1 } : { page: cur, start: Infinity };
    }
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var after = m.page > base.page || (m.page === base.page && m.start > base.start);
      var before = m.page < base.page || (m.page === base.page && m.start < base.start);
      if (dir > 0 && after) { best = m; break; }
      if (dir < 0 && before) best = m;
    }
    return best;
  }

  // 기준과 후보 사이(후보가 없으면 문서 끝까지)에서 아직 찾지 않은 쪽. 가까운 쪽부터.
  function pendingPages(dir, cand) {
    var n = D() && D().numPages ? D().numPages() : 0;
    var basePage = kbCur ? kbCur.page : (D() && D().currentPage ? D().currentPage() : 1);
    var out = [];
    if (dir > 0) {
      var hi = cand ? cand.page - 1 : n;
      for (var p = basePage; p <= hi; p++) if (!S.checked.has(p)) out.push(p);
    } else {
      var lo = cand ? cand.page + 1 : 1;
      for (var q = basePage; q >= lo; q--) if (!S.checked.has(q)) out.push(q);
    }
    return out;
  }

  function markText(en) {
    var d = en.data;
    if (d.type === "cite") {
      var ref = S.display[d.refs[0]] || "";
      if (ref.length > 110) ref = ref.slice(0, 110) + "…";
      return "인용 " + (d.label || "") + (ref ? ": " + ref : "") + (d.refs.length > 1 ? " 외 " + (d.refs.length - 1) + "건" : "");
    }
    return (d.label || KIND_LABEL[d.kind] || "참조") + ", " + d.target.page + "쪽의 " + (KIND_LABEL[d.kind] || "대상");
  }

  // 표시가 화면 안(위아래 여유 포함)에 오도록 스크롤한다.
  function revealMark(page, en) {
    var sc = scrollEl();
    var r0 = en.rects && en.rects[0];
    if (!sc || !r0 || !D().pageToClient) return;
    var a = D().pageToClient(page, { x: r0.x, y: r0.y });
    var b = D().pageToClient(page, { x: r0.x + r0.w, y: r0.y + r0.h });
    if (!a || !b) { if (D().goToPage) D().goToPage(page); return; }
    var box = sc.getBoundingClientRect();
    var margin = Math.min(80, box.height * 0.2);
    var dy = 0;
    if (a.y < box.top + margin || b.y > box.bottom - margin) dy = a.y - (box.top + box.height * 0.35);
    var dx = 0;
    if (a.x < box.left + 16) dx = a.x - box.left - 40;
    else if (b.x > box.right - 16) dx = b.x - box.right + 40;
    if (dy || dx) {
      ignoreScrollUntil = Date.now() + 400;
      if (dy) sc.scrollTop += dy;
      if (dx) sc.scrollLeft += dx;
    }
  }

  function setFocusMark(m) {
    var prev = kbCur;
    if (cardOpen()) closeCard();
    kbCur = { page: m.page, id: m.en.id, start: m.start };
    if (prev && prev.page !== m.page) pushHover(prev.page);
    pushHover(m.page);
    revealMark(m.page, m.en);
    announce(markText(m.en));
  }

  function stepFocus(dir) {
    if (!S.analysis) return false;
    var token = ++kbToken;
    var st = S;
    var cand = adjacentMark(dir);
    var pend = pendingPages(dir, cand);
    if (!pend.length) {
      if (cand) { setFocusMark(cand); return true; }
      announce(dir > 0 ? "마지막 인용·참조입니다" : "첫 인용·참조입니다");
      return false;
    }
    (function more() {
      var batch = pend.slice(0, 6);
      Promise.all(batch.map(function (p) { return registerPage(p); })).then(function () {
        if (st !== S || token !== kbToken) return;
        var c2 = adjacentMark(dir);
        pend = pendingPages(dir, c2);
        if (!pend.length) {
          if (c2) setFocusMark(c2);
          else announce(dir > 0 ? "마지막 인용·참조입니다" : "첫 인용·참조입니다");
          return;
        }
        more();
      });
    })();
    return true;
  }

  function activateFocused() {
    if (!S.analysis || !kbCur) return false;
    var en = entryByStart(kbCur.page, kbCur.start);
    if (!en || !en.rects || !en.rects.length) return false;
    var r0 = en.rects[0];
    var pt = D().pageToClient ? D().pageToClient(kbCur.page, { x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 }) : null;
    var cx = pt ? pt.x : 0;
    var cy = pt ? pt.y : 0;
    openCard({ page: kbCur.page, id: en.id, data: en.data }, cx, cy, { keyboard: true });
    return cardOpen();
  }

  // ---------- 연결 ----------
  var ready = false;
  function init() {
    if (ready) return;
    var el0 = rd();
    if (!el0) return;
    ready = true;
    bindScroll();
    // 문서를 열거나 닫을 때 표시·카드·막기 상태를 전부 거둔다
    var resetUi = function () {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      closeCard();
      pageInfoCache.clear();
      cache = [];
      kbCur = null;
      kbToken++;
      if (live) live.textContent = "";
      S = fresh();
      var sc = scrollEl();
      if (sc) sc.classList.remove("is-ref-hover");
      syncSuppress();
    };
    el0.addEventListener("reader:docopen", function () {
      resetUi();
      startAnalysis();
    });
    el0.addEventListener("reader:docclose", resetUi);
    el0.addEventListener("reader:pagetext", function (e) {
      var p = e.detail && e.detail.page;
      if (!(p >= 1)) return;
      S.pagesReady.add(p);
      if (S.analysis) registerPage(p);
    });
    // 글자 상자를 아무도 요청하지 않은 쪽(용어·강조·검색 결과가 없는 쪽)도 인용·그림 표시를 받도록 쪽이 그려질 때도 등록한다.
    el0.addEventListener("reader:pagerendered", function (e) {
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
    closeCard: function () { if (!cardOpen()) return false; closeCard(); return true; }, // Esc 가 한 번에 하나만 닫도록 reader.js 가 부른다
    focusNext: function () { return stepFocus(1); },
    focusPrev: function () { return stepFocus(-1); },
    activateFocused: activateFocused,
    _focused: function () { return kbCur; },
    // 시험·진단용
    _state: function () { return S; },
    _enabled: ENABLED,
    _renderPreview: renderPreview,
  };
})(typeof window !== "undefined" ? window : globalThis);
