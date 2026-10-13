// 겹침층: 쪽 위에 사각형(형광펜·용어·검색·참조·반짝임)을 그린다.
// 사각형은 쪽 좌표(배율 1)로 배치하고, 층 컨테이너 전체를 transform: scale(var(--rd-scale)) 로 키운다.
// 그래서 배율이 바뀌어도 사각형을 다시 계산하지 않는다. 컨테이너가 transform 을 가지므로
// 형광펜 층의 mix-blend-mode: multiply 는 컨테이너 자신에게 건다(자손에게 걸면 캔버스와 섞이지 않는다).
// 겹침층은 pointer-events: none 이라 클릭 대상은 entryAt(좌표)로 직접 찾는다.
//
// 가장자리별 보정: entry.refineLeft / refineRight(첫 사각형의 왼쪽 / 마지막 사각형의 오른쪽)가 불리언으로 주어지면 refine 와 상관없이
// 그 가장자리는 그 값을 따른다(한쪽만 낱말 경계인 용어도 그쪽은 보정된다). 주어지지 않으면 refine: true 는 양쪽, false/없음은 층 기본값(search 만 켜짐).
// flash 도 같다. 판단은 ReaderInk.edgeMode(순수, 시험함).
// 잉크 보정: entry 에 refine: true 를 주면(search 층은 기본 켜짐, refine: false 로 끌 수 있다) 쪽 캔버스가 그려진 뒤
// ReaderInk.request 로 좌우 가장자리를 실제 글자에 맞춘 사각형을 구해 그린다(계산 전에는 원본을 먼저 그린다). entry.rects(보정 전)가 원본이고
// 보정 결과는 쪽을 다시 그릴 때마다 새로 계산한다. 화면에 보이는 것(보정 후)을 entryAt 이 그대로 판정한다.
window.ReaderOverlay = (function (root) {
  "use strict";

  // 아래에서 위로 쌓는 순서: search > highlight > ref > term (flash 는 맨 위)
  var LAYER_ORDER = ["term", "ref", "highlight", "search", "flash"];
  var FLASH_MS = 1200;
  var REFINE_LAYERS = { search: true }; // 층별 기본값. entry.refine 이 있으면 그것이 우선
  var HIT_SLOP = 1; // entryAt 에서 사각형 경계 여유(쪽 좌표)

  var store = {}; // store[layer] = Map(page -> entries[])
  var rendered = new Set();
  var flashTimers = new Map();

  LAYER_ORDER.forEach(function (l) { store[l] = new Map(); });

  function rootEl() { return document.getElementById("reader"); }
  function D() { return root.ReaderDoc; }
  function validLayer(layer) { return LAYER_ORDER.indexOf(layer) >= 0; }

  // 화면에 보일 사각형. 보정 대상이고 쪽이 그려졌으면, 보정이 끝난 것은 보정한 것을 쓰고 아직이면 원본을 쓴다.
  // 보정은 ReaderInk.request 가 한가할 때 계산하고, 끝나면 onReady 로 알려 그 쪽 층을 다시 그린다(원본 -> 보정, 한 번만 바뀐다).
  
  function wantsRefine(layer, en) {
    return root.ReaderInk && root.ReaderInk.edgeMode ? root.ReaderInk.edgeMode(!!REFINE_LAYERS[layer], en).any : (en.refine !== undefined ? !!en.refine : !!REFINE_LAYERS[layer]);
  }
  function displayRects(page, layer, en) {
    var raw = en.rects || [];
    if (!raw.length || !rendered.has(page) || !root.ReaderInk || !root.ReaderInk.request) return raw;
    var m = root.ReaderInk.edgeMode(!!REFINE_LAYERS[layer], en);
    if (!m.any) return raw;
    return root.ReaderInk.request(page, raw, { refineLeft: m.left, refineRight: m.right }) || raw;
  }

  function layerBox(overlay, layer) {
    var sel = ":scope > .rd-layer-" + layer;
    var box = overlay.querySelector(sel);
    if (box) return box;
    box = document.createElement("div");
    box.className = "rd-layer rd-layer-" + layer;
    // 층 순서는 DOM 순서로 고정한다(z-index 를 쓰면 텍스트 레이어(z-index 2)와 섞인다).
    var rank = LAYER_ORDER.indexOf(layer);
    var before = null;
    for (var i = 0; i < overlay.children.length && !before; i++) {
      var other = overlay.children[i];
      var m = /rd-layer-(\w+)/.exec(other.className);
      if (m && LAYER_ORDER.indexOf(m[1]) > rank) before = other;
    }
    overlay.insertBefore(box, before);
    return box;
  }

  function drawLayer(page, layer) {
    var el = D().pageEl(page);
    if (!el) return;
    var overlay = el.querySelector(".rd-overlay");
    if (!overlay) return;
    var entries = store[layer].get(page);
    if (!entries || !entries.length) {
      var old = overlay.querySelector(":scope > .rd-layer-" + layer);
      if (old) old.remove();
      return;
    }
    var box = layerBox(overlay, layer);
    var size = D().pageSize(page);
    box.style.width = size.w + "px";
    box.style.height = size.h + "px";
    var frag = document.createDocumentFragment();
    entries.forEach(function (en) {
      displayRects(page, layer, en).forEach(function (r) {
        var d = document.createElement("div");
        d.className = "rd-rect rd-" + layer + (en.className ? " " + en.className : "");
        d.style.left = r.x + "px";
        d.style.top = r.y + "px";
        d.style.width = r.w + "px";
        d.style.height = r.h + "px";
        if (en.id !== undefined && en.id !== null) d.dataset.id = String(en.id);
        frag.appendChild(d);
      });
    });
    box.textContent = "";
    box.appendChild(frag);
  }

  function drawPage(page) {
    LAYER_ORDER.forEach(function (layer) {
      if (store[layer].has(page)) drawLayer(page, layer);
    });
  }

  // 그 쪽의 그 층을 통째로 바꾼다. 쪽이 아직 안 그려졌으면 보관했다가 reader:pagerendered 때 그린다.
  function setRects(page, layer, entries) {
    if (!validLayer(layer)) throw new Error("알 수 없는 겹침층: " + layer);
    if (!entries || !entries.length) store[layer].delete(page);
    else store[layer].set(page, entries.slice());
    if (rendered.has(page)) drawLayer(page, layer);
  }

  function clearPage(page, layer) {
    var layers = layer ? [layer] : LAYER_ORDER;
    layers.forEach(function (l) {
      if (!validLayer(l)) return;
      store[l].delete(page);
      if (rendered.has(page)) drawLayer(page, l);
    });
  }

  function clear(layer) {
    var layers = layer ? [layer] : LAYER_ORDER;
    layers.forEach(function (l) {
      if (!validLayer(l)) return;
      var pages = Array.from(store[l].keys());
      store[l].clear();
      pages.forEach(function (p) { if (rendered.has(p)) drawLayer(p, l); });
    });
  }

  // 겹침층은 클릭을 받지 않으므로, 좌표가 어느 사각형 안인지 직접 찾는다.
  // layers 는 우선순위 순서(앞이 우선). 생략하면 위에 쌓인 층부터.
  function entryAt(clientX, clientY, layers) {
    var hit = D().clientToPage(clientX, clientY);
    if (!hit) return null;
    var order = layers && layers.length ? layers : LAYER_ORDER.slice().reverse();
    for (var li = 0; li < order.length; li++) {
      var layer = order[li];
      if (!validLayer(layer)) continue;
      var entries = store[layer].get(hit.page);
      if (!entries) continue;
      for (var ei = entries.length - 1; ei >= 0; ei--) {
        var en = entries[ei];
        var rects = displayRects(hit.page, layer, en);
        for (var ri = 0; ri < rects.length; ri++) {
          var r = rects[ri];
          if (hit.x >= r.x - HIT_SLOP && hit.x <= r.x + r.w + HIT_SLOP && hit.y >= r.y - HIT_SLOP && hit.y <= r.y + r.h + HIT_SLOP) {
            return { page: hit.page, layer: layer, id: en.id, data: en.data };
          }
        }
      }
    }
    return null;
  }

  // 1.2초 반짝임. 같은 쪽에서 다시 부르면 앞의 것을 바꿔 끼운다.
  // 반짝이는 사각형도 표시되는 표시와 같은 보정을 받는다(opts.refine 기본 true, opts.refineLeft / refineRight).
  function flash(page, rects, opts) {
    if (!rects || !rects.length) return;
    var prev = flashTimers.get(page);
    if (prev) clearTimeout(prev);
    setRects(page, "flash", [{
      id: "flash", rects: rects, className: "rd-flash-rect",
      refine: !(opts && opts.refine === false),
      refineLeft: opts && opts.refineLeft, refineRight: opts && opts.refineRight,
    }]);
    flashTimers.set(page, setTimeout(function () {
      flashTimers.delete(page);
      clearPage(page, "flash");
    }, FLASH_MS));
  }

  function setScaleVar(scale) {
    var el = rootEl();
    if (el && scale > 0) el.style.setProperty("--rd-scale", String(scale));
  }

  function reset() {
    LAYER_ORDER.forEach(function (l) { store[l].clear(); });
    rendered = new Set();
    flashTimers.forEach(function (t) { clearTimeout(t); });
    flashTimers.clear();
  }

  function bind() {
    var el = rootEl();
    if (!el) return;
    el.addEventListener("reader:pagerendered", function (e) {
      rendered.add(e.detail.page);
      if (root.ReaderInk) root.ReaderInk.invalidate(e.detail.page);
      drawPage(e.detail.page);
    });
    // 보정이 끝나면 그 쪽의 보정 대상 층만 다시 그린다.
    if (root.ReaderInk && root.ReaderInk.onReady) {
      root.ReaderInk.onReady(function (page) {
        if (!rendered.has(page)) return;
        LAYER_ORDER.forEach(function (layer) {
          var list = store[layer].get(page);
          if (list && list.some(function (en) { return wantsRefine(layer, en); })) drawLayer(page, layer);
        });
      });
    }
    el.addEventListener("reader:scalechange", function (e) { setScaleVar(e.detail.scale); });
    el.addEventListener("reader:docopen", function () { reset(); setScaleVar(D().getScale()); });
    el.addEventListener("reader:docclose", reset);
    setScaleVar(1);
  }
  bind();

  return {
    setRects: setRects,
    clear: clear,
    clearPage: clearPage,
    entryAt: entryAt,
    flash: flash,
    // 시험·진단용
    _layers: LAYER_ORDER,
  };
})(window);
