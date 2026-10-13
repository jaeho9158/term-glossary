// 형광펜·메모: 저장 계층(window.ReaderStore) <-> 원문 위 겹침층 <-> 오른쪽 "메모" 패널.
//
// 순수 부분(Node 테스트 대상): sanitizeRecords, placeRecords.
// 브라우저 부분: window.ReaderAnnotations — load / add / setColor / setNote / remove / list / goTo.
//
// 저장 기록의 필드(page, startOffset, endOffset, quoteText, color, note, createdAt, id)는 옛 뷰어와 같다.
// 옛 뷰어가 글자 단위로 저장한 기록도 그대로 읽는다: 위치가 맞으면 그 자리, 어긋났으면 글귀로 다시 찾고
// (shouldPersistReanchor 가 참일 때만 새 위치를 저장), 글귀도 없으면 "위치를 찾지 못함"으로 목록에만 남긴다.
// 표시는 낱말 단위로 넓혀(ReaderGeometry.snapToWords) 그린다 — 글자 상자 가장자리는 낱말 단위까지만 믿을 수 있다.
// 새 형광펜은 넓힌 범위를 저장하지만, 옛 기록은 낱말로 넓혀 그릴 뿐 저장된 위치·글귀는 고치지 않는다.
(function (root) {
  "use strict";

  var TM = root;
  var G = root.ReaderGeometry;
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    TM = require("../term-match.js");
    G = require("./geometry.js");
  }

  var COLORS = ["yellow", "green", "pink", "blue"];
  var COLOR_NAMES = { yellow: "노랑", green: "초록", pink: "분홍", blue: "파랑" };
  var QUOTE_PREVIEW = 80;

  // ---------- 순수 ----------

  // 저장소에서 읽은 값에서 쓸 수 있는 기록만 남긴다(배열이 아니면 [], 객체가 아니거나 page 가 양의 정수가 아니면 버림).
  // id 가 없거나 문자열·숫자가 아닌 기록도 버린다(전부 "undefined" 키로 겹쳐 서로를 가리게 된다).
  // 메모가 문자열이 아니면 고친다(noteText).
  function usableId(id) {
    return (typeof id === "string" && id !== "") || (typeof id === "number" && Number.isFinite(id));
  }
  function noteText(v) { return typeof v === "string" ? v : ""; }
  function sanitizeRecords(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (r) {
      return r !== null && typeof r === "object" && !Array.isArray(r) && Number.isInteger(r.page) && r.page > 0 && usableId(r.id);
    }).map(function (r) {
      if (typeof r.note !== "string") r.note = noteText(r.note);
      return r;
    });
  }

  // 새 범위를 최종 범위(낱말 단위)로. 합친 뒤의 범위에도 낱말 맞춤을 다시 적용한다 —
  // 글자 단위로 저장된 옛 기록과 합치면 낱말 중간에서 끊긴 범위가 나오기 때문이다.
  function finalizeRange(text, start, end) {
    var sn = G.snapToWords(text, start, end);
    return { start: sn.start, end: sn.end };
  }

  // existing: [{start, end, createdAt, id, item?, note?}] (같은 쪽의 이미 놓인 기록들)
  // 반환 {start, end, olds: existing 중 합쳐지는 것들, note}. 낱말 맞춤으로 범위가 넓어져 새로 겹치는 기록이 생기면 다시 합친다.
  function planMerge(existing, text, start, end, note) {
    var cand = { startOffset: start, endOffset: end, createdAt: "", id: "__new__" };
    var rg = finalizeRange(text, start, end);
    var olds = [];
    for (var round = 0; round < 4; round++) {
      cand.startOffset = rg.start;
      cand.endOffset = rg.end;
      var recs = (existing || []).map(function (x) {
        return { startOffset: x.start, endOffset: x.end, createdAt: x.createdAt, id: x.id, src: x };
      });
      var groups = TM.mergeOverlappingRanges(recs.concat([cand]));
      var g = groups.filter(function (gr) { return gr.records.indexOf(cand) >= 0; })[0];
      olds = g ? g.records.filter(function (x) { return x !== cand; }).map(function (x) { return x.src; }) : [];
      var next = finalizeRange(text, g ? g.startOffset : rg.start, g ? g.endOffset : rg.end);
      if (next.start === rg.start && next.end === rg.end) break;
      rg = next;
    }
    // 저장에 실패해 화면에만 남은 합친 기록(replaces)이 이미 옛 메모를 품고 있다 — 그 원본들의 메모는 다시 붙이지 않는다.
    // 합친 뒤 원본 메모가 고쳐졌으면(snap 과 다르면) 현재 메모를 다시 접어 넣는다 — 고친 글을 잃지 않게.
    var covered = {};
    olds.forEach(function (o) {
      var snaps = Array.isArray(o.snap) ? o.snap : null;
      (Array.isArray(o.replaces) ? o.replaces : []).forEach(function (id, idx) {
        covered[String(id)] = { has: snaps !== null, snap: snaps ? noteText(snaps[idx]) : "" };
      });
    });
    var list = olds.filter(function (o) {
      var c = covered[String(o.id)];
      return !c || (c.has && noteText(o.note) !== c.snap);
    }).map(function (o) { return noteText(o.note); });
    list.push(noteText(note));
    return { start: rg.start, end: rg.end, olds: olds, note: mergeNotes(list) };
  }

  // 메모들을 줄바꿈으로 잇는다. 줄 단위로 나눠 빈 줄은 버리고, 같은 줄은 처음 것만 남긴다(순서 유지).
  function mergeNotes(list) {
    var seen = {};
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (n) {
      noteText(n).split("\n").forEach(function (line) {
        if (line.trim() === "" || seen["k" + line]) return;
        seen["k" + line] = true;
        out.push(line);
      });
    });
    return out.join("\n");
  }

  // "다시 저장" 때: 합쳐질 옛 기록의 메모가 실패~재시도 사이에 바뀌었으면 그 현재 메모를 다시 저장하는 기록에 접어 넣는다.
  // originals: [{note, snap}] — snap 은 합칠 때 가져간 메모. 바뀐 것만 접는다. base 는 지금 화면 기록의 메모.
  function foldNotes(base, originals) {
    var changed = (Array.isArray(originals) ? originals : []).filter(function (o) { return noteText(o.note) !== noteText(o.snap); }).map(function (o) { return o.note; });
    return mergeNotes([base].concat(changed));
  }

  // 시간 제한: promise 가 ms 안에 끝나지 않으면 fallback 으로 끝낸다(거부는 그대로 전달). 제한 뒤에 늦게 끝나면 onLate(값).
  // opts.timers = {setTimeout, clearTimeout} 로 시계를 바꿀 수 있다(테스트용).
  function withTimeout(promise, ms, fallback, opts) {
    var o = opts || {};
    var timers = o.timers || { setTimeout: function (f, d) { return setTimeout(f, d); }, clearTimeout: function (t) { clearTimeout(t); } };
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = timers.setTimeout(function () { if (done) return; done = true; resolve(fallback); }, ms);
      Promise.resolve(promise).then(function (v) {
        if (done) { if (o.onLate) { try { o.onLate(v); } catch (e) { /* 늦은 결과 정리 실패는 무시 */ } } return; }
        done = true; timers.clearTimeout(t); resolve(v);
      }, function (e) {
        if (done) return;
        done = true; timers.clearTimeout(t); reject(e);
      });
    });
  }

  // 저장 계층 호출기: 시간 초과·오류는 fallback(실패 결과)이 된다. 한 번 시간 초과가 나면 failFastMs 동안은
  // 호출하지 않고 바로 fallback 을 돌려준다(또 10 초씩 기다리지 않게). opts: {timeoutMs, failFastMs, now, timers}
  function makeStoreCaller(opts) {
    var o = opts || {};
    var timeoutMs = o.timeoutMs || 10000;
    var failFastMs = o.failFastMs === undefined ? 30000 : o.failFastMs;
    var now = o.now || function () { return Date.now(); };
    var failUntil = 0;
    var TIMED_OUT = {};
    return function callStore(fn, fallback, onLate) {
      if (now() < failUntil) return Promise.resolve(fallback);
      var p;
      try { p = Promise.resolve(fn()); } catch (err) { console.error("[reader] 저장 호출 실패", err); return Promise.resolve(fallback); }
      return withTimeout(p, timeoutMs, TIMED_OUT, { onLate: onLate, timers: o.timers }).then(function (v) {
        if (v === TIMED_OUT) { failUntil = now() + failFastMs; return fallback; }
        return v;
      }, function (err) {
        console.error("[reader] 저장 호출 실패", err);
        return fallback;
      });
    };
  }

  // 합친 새 기록이 실제로 저장된 뒤에만 옛 기록을 지운다. 저장에 실패했으면 옛 기록(과 그 메모)을 그대로 둔다.
  function shouldDeleteOld(savedRecord) {
    return !!savedRecord && !savedRecord.unsaved && usableId(savedRecord.id);
  }

  // 겹치는 기록은 그릴 때 한 범위로 묶는다(저장은 그대로). entries: [{id, start, end, createdAt}]
  // 반환 [{start, end, primaryId, ids}] — primaryId 는 가장 나중에 만든 기록(눌렀을 때 열리는 기록).
  function drawGroups(entries) {
    var recs = (entries || []).map(function (e) {
      return { startOffset: e.start, endOffset: e.end, createdAt: e.createdAt, id: e.id };
    });
    return TM.mergeOverlappingRanges(recs).map(function (g) {
      return { start: g.startOffset, end: g.endOffset, primaryId: g.primary.id, ids: g.records.map(function (r) { return r.id; }) };
    });
  }

  // 한 쪽의 기록들을 그 쪽 글에 앉힌다. status: "offset" | "quote" | "lost" (lost 는 start/end 가 null)
  function placeRecords(records, pageText) {
    return (Array.isArray(records) ? records : []).map(function (record) {
      var res = TM.resolveAnnotationAnchor(pageText, record);
      if (!res || res.status === "lost") return { record: record, start: null, end: null, status: "lost" };
      return { record: record, start: res.startOffset, end: res.endOffset, status: res.status };
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      sanitizeRecords: sanitizeRecords, placeRecords: placeRecords, planMerge: planMerge, shouldDeleteOld: shouldDeleteOld,
      finalizeRange: finalizeRange, drawGroups: drawGroups, noteText: noteText,
      mergeNotes: mergeNotes, foldNotes: foldNotes, withTimeout: withTimeout, makeStoreCaller: makeStoreCaller,
    };
  }
  if (typeof document === "undefined") {
    root.ReaderAnnotations = {
      sanitizeRecords: sanitizeRecords, placeRecords: placeRecords, planMerge: planMerge, shouldDeleteOld: shouldDeleteOld,
      finalizeRange: finalizeRange, drawGroups: drawGroups, noteText: noteText,
      mergeNotes: mergeNotes, foldNotes: foldNotes, withTimeout: withTimeout, makeStoreCaller: makeStoreCaller,
    };
    return;
  }

  var MSG_SAVE_FAIL = "형광펜을 저장하지 못했습니다. 이 화면을 닫으면 사라집니다.";
  var MSG_CHANGE_FAIL = "변경 내용을 저장하지 못했습니다.";
  var STORE_TIMEOUT_MS = 10000; // 저장 계층 호출 하나를 기다리는 한도

  // 저장 계층 호출은 모두 이것을 거친다: 오류·시간 초과는 fallback(실패 결과)이 된다. 늦게 성공한 결과는 onLate 로 정리한다.
  // 한 번 시간 초과가 나면 30 초 동안은 바로 실패 결과를 돌려준다.
  var callStore = makeStoreCaller({ timeoutMs: STORE_TIMEOUT_MS, failFastMs: 30000 });
  // 시간 제한 뒤에 늦게 만들어진 기록은 지운다(안 그러면 화면에 없는 복사본이 저장소에 남는다).
  function lateCreateCleanup(store, docHash) {
    return function (late) {
      if (late && usableId(late.id)) callStore(function () { return store.deleteAnnotation(docHash, late.id); }, false);
    };
  }

  // ---------- 상태 ----------
  var S = {
    token: 0,
    docHash: null,
    title: "",
    texts: [], // 쪽 글(0부터)
    items: [], // [{record, start, end, status}] — 이 문서의 모든 기록
    unsavedSeq: 0,
    goToken: 0, // goTo 취소용
    renamed: {}, // 색을 바꾸며 id 가 바뀐 기록: 옛 키 -> 새 키
    pending: {}, // 저장 중인 새 형광펜의 "쪽:시작:끝"
  };
  var editing = null; // {id, base}
  var prevFocus = null; // 편집 창을 열기 전에 포커스가 있던 요소
  var pendingColor = null; // 진행 중인 색 바꾸기 {promise}
  var pendingGoTo = null; // {token, top}
  var ready = false;

  function $(id) { return document.getElementById(id); }
  function D() { return root.ReaderDoc; }
  function TXM() { return root.ReaderTextMap; }
  function key(record) { return String(record.id); }
  function colorOf(record) { return COLORS.indexOf(record.color) >= 0 ? record.color : "yellow"; }
  function notify(msg) { if (D() && D().notify) D().notify(msg); }

  async function getStore() {
    if (root.ReaderStore) return root.ReaderStore;
    if (root.ReaderStoreReady) return callStore(function () { return root.ReaderStoreReady; }, null);
    return null;
  }

  function findItem(id) {
    var k = String(id);
    for (var hop = 0; hop < 20 && S.renamed[k] !== undefined; hop++) k = S.renamed[k];
    for (var i = 0; i < S.items.length; i++) if (key(S.items[i].record) === k) return S.items[i];
    return null;
  }
  function dropItem(item) {
    var i = S.items.indexOf(item);
    if (i >= 0) S.items.splice(i, 1);
  }
  function textOfPage(page) { return S.texts[page - 1] || ""; }

  // 표시 범위: 낱말로 넓힌 위치. 저장된 위치는 건드리지 않는다.
  function drawRange(item) {
    return G.snapToWords(textOfPage(item.record.page), item.start, item.end);
  }

  // 문장부호·괄호 옆 가장자리의 잉크 틈 탐색 중심: 범위 끝(또는 처음) 글자 상자와 이웃 글자 상자의 경계. 반경은 글자 폭의 절반.
  function snapAt(boxes, idx, side) {
    var a = side === "right" ? boxes[idx - 1] : boxes[idx];       // 범위 안쪽 글자
    var n = side === "right" ? boxes[idx] : boxes[idx - 1];       // 범위 밖 기호
    if (!a) return undefined;
    var edge = side === "right" ? a.x + a.w : a.x;
    var c = edge;
    if (n && Math.abs((n.y + n.h / 2) - (a.y + a.h / 2)) < a.h * 0.5) {
      var other = side === "right" ? n.x : n.x + n.w;
      c = (edge + other) / 2;
    }
    return { c: c, r: Math.max(0.5, a.w * 0.5) };
  }

  // ---------- 그리기 ----------
  function drawPage(page, data) {
    if (!data) return;
    var entries = [];
    var onPage = S.items.filter(function (item) { return item.record.page === page && item.status !== "lost"; });
    var byId = new Map();
    var ranges = onPage.map(function (item) {
      byId.set(key(item.record), item);
      var sn = drawRange(item);
      return { id: item.record.id, start: sn.start, end: sn.end, createdAt: item.record.createdAt };
    });
    // 같은 색끼리 겹치는 기록은 한 범위로 한 번만 그린다(눌렀을 때는 가장 나중 기록이 열린다). 저장은 건드리지 않는다.
    // 다른 색은 따로 그린다: 나중에 만든 것이 위에 놓이도록 만든 순서대로 늘어놓는다.
    var groups = [];
    COLORS.forEach(function (c) {
      var same = ranges.filter(function (rg) { return colorOf(byId.get(String(rg.id)).record) === c; });
      drawGroups(same).forEach(function (g) { groups.push(g); });
    });
    groups.sort(function (a, b) {
      var ca = String(byId.get(String(a.primaryId)).record.createdAt || "");
      var cb = String(byId.get(String(b.primaryId)).record.createdAt || "");
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    });
    groups.forEach(function (g) {
      var prim = byId.get(String(g.primaryId));
      var rects = G.rangeRects(data.charBoxes, g.start, g.end, data.text);
      if (!prim || !rects.length) return;
      var color = colorOf(prim.record);
      // 낱말로 넓힌 뒤 끝의 쉼표·마침표나 앞의 괄호는 범위 밖이다: 그 쪽 가장자리는 낱말 틈에 맞추면 기호까지 덮으므로 보정하지 않는다.
      var fl = root.ReaderInk && root.ReaderInk.edgeFlags ? root.ReaderInk.edgeFlags(data.text, g.start, g.end) : null;
      entries.push({
        id: prim.record.id, rects: rects, refine: fl ? undefined : true,
        refineLeft: fl ? fl.refineLeft : undefined, refineRight: fl ? fl.refineRight : undefined,
        snapLeft: fl && fl.snapLeft ? snapAt(data.charBoxes, g.start, "left") : undefined,
        snapRight: fl && fl.snapRight ? snapAt(data.charBoxes, g.end, "right") : undefined,
        data: { color: color, ids: g.ids }, className: "rd-hl-" + color,
      });
    });
    onPage.forEach(function (item) {
      var sn = drawRange(item);
      var rects = G.rangeRects(data.charBoxes, sn.start, sn.end, data.text);
      if (!rects.length) return;
      var color = colorOf(item.record);
      if (noteText(item.record.note)) {
        var last = rects[rects.length - 1];
        var size = Math.max(5, Math.min(10, last.h * 0.6));
        entries.push({
          id: item.record.id,
          rects: [{ x: last.x + last.w - size * 0.5, y: last.y - size * 0.3, w: size, h: size }],
          className: "rd-memo-mark rd-hl-" + color,
        });
      }
    });
    root.ReaderOverlay.setRects(page, "highlight", entries);
  }

  function redrawPage(page) {
    var tok = S.token;
    if (!(page >= 1 && page <= S.texts.length)) return; // 문서보다 뒤 쪽의 기록은 "위치를 찾지 못함"으로만 남긴다
    TXM().get(page).then(function (data) { if (tok === S.token) drawPage(page, data); }).catch(function (err) {
      console.error("[reader] 형광펜 그리기 실패", page, err);
    });
  }

  // ---------- 메모 패널 ----------
  function sortedItems() {
    return S.items.slice().sort(function (a, b) {
      if (a.record.page !== b.record.page) return a.record.page - b.record.page;
      var as = a.start === null ? Infinity : a.start;
      var bs = b.start === null ? Infinity : b.start;
      if (as !== bs) return as - bs;
      return String(a.record.createdAt || "").localeCompare(String(b.record.createdAt || ""));
    });
  }

  function noteButton(item) {
    var rec = item.record;
    var li = document.createElement("li");
    li.className = "rd-note-item";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rd-note" + (item.status === "lost" ? " is-lost" : "");
    btn.dataset.id = key(rec);
    var dot = document.createElement("span");
    dot.className = "rd-note-dot rd-hl-" + colorOf(rec);
    var body = document.createElement("span");
    body.className = "rd-note-body";
    var page = document.createElement("span");
    page.className = "rd-note-page";
    page.textContent = "p." + rec.page;
    if (rec.saving) {
      var sbadge = document.createElement("span");
      sbadge.className = "rd-note-saving";
      sbadge.textContent = "저장 중…";
      page.appendChild(sbadge);
    }
    if (rec.unsaved) {
      var badge = document.createElement("span");
      badge.className = "rd-note-unsaved";
      badge.textContent = "저장되지 않음";
      page.appendChild(badge);
    }
    var quote = document.createElement("span");
    quote.className = "rd-note-quote";
    var q = String(rec.quoteText || "").replace(/\s+/g, " ").trim();
    quote.textContent = q.length > QUOTE_PREVIEW ? q.slice(0, QUOTE_PREVIEW) + "…" : q;
    body.appendChild(page);
    body.appendChild(quote);
    if (noteText(rec.note)) {
      var memo = document.createElement("span");
      memo.className = "rd-note-memo";
      memo.textContent = noteText(rec.note);
      body.appendChild(memo);
    }
    btn.appendChild(dot);
    btn.appendChild(body);
    li.appendChild(btn);
    if (rec.unsaved) {
      var retry = document.createElement("button");
      retry.type = "button";
      retry.className = "rd-note-retry";
      retry.dataset.id = key(rec);
      retry.textContent = "다시 저장";
      li.appendChild(retry);
    }
    return li;
  }

  function renderPanel() {
    var pane = root.ReaderPanels && root.ReaderPanels.tabPanel("right", "notes");
    var items = sortedItems();
    var tab = $("rd-tab-notes");
    if (tab) {
      tab.textContent = "메모";
      if (items.length) {
        var c = document.createElement("span");
        c.className = "rd-tab-count";
        c.textContent = String(items.length);
        tab.appendChild(c);
      }
      tab.setAttribute("aria-label", items.length ? "메모 " + items.length + "건" : "메모");
    }
    if (!pane) return;
    pane.textContent = "";
    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "rd-pane-empty";
      empty.textContent = "아직 형광펜이나 메모가 없습니다. 본문에서 글을 드래그해 표시해 보세요.";
      pane.appendChild(empty);
      return;
    }
    var found = items.filter(function (i) { return i.status !== "lost"; });
    var lost = items.filter(function (i) { return i.status === "lost"; });
    if (found.length) {
      var ul = document.createElement("ul");
      ul.className = "rd-note-list";
      found.forEach(function (i) { ul.appendChild(noteButton(i)); });
      pane.appendChild(ul);
    }
    if (lost.length) {
      var h = document.createElement("h3");
      h.className = "rd-note-losthead";
      h.textContent = "위치를 찾지 못함";
      pane.appendChild(h);
      var hint = document.createElement("p");
      hint.className = "rd-note-losthint";
      hint.textContent = "본문에서 이 글귀를 찾지 못했습니다. 기록은 지우지 않고 남겨 둡니다.";
      pane.appendChild(hint);
      var ul2 = document.createElement("ul");
      ul2.className = "rd-note-list";
      lost.forEach(function (i) { ul2.appendChild(noteButton(i)); });
      pane.appendChild(ul2);
    }
  }

  // 문서를 닫을 때(되돌아가기 포함) 편집 창에 쓰던 메모가 있으면 저장한다. 닫는 순간 토큰·문서 해시가 바뀌므로 여기서 먼저 보낸다.
  function flushEditorNote() {
    if (!editing || !dirty()) return;
    var item = findItem(editing.id);
    if (!item || item.record.saving || item.record.unsaved || !S.docHash) return;
    var dh = S.docHash;
    var nid = item.record.id;
    var val = $("rd-annopop-note").value.trim();
    getStore().then(function (store) {
      if (store) return callStore(function () { return store.updateAnnotationNote(dh, nid, val); }, false);
    });
  }

  // ---------- 불러오기 ----------
  function reset() {
    flushEditorNote();
    hideUndo();
    S.token++;
    S.docHash = null;
    S.title = "";
    S.texts = [];
    S.items = [];
    S.renamed = {};
    S.pending = {};
    S.goToken++;
    pendingGoTo = null;
    pendingColor = null; // 이전 문서의 색 바꾸기가 멈춰 있어도 새 문서로 넘기지 않는다(늦게 오는 결과는 토큰 검사로 버려진다)
    closeEditor({ save: false });
    busyColors(false);
    renderPanel();
  }

  async function load(docHash, title) {
    reset();
    var tok = S.token;
    S.docHash = docHash;
    S.title = title || "";
    var store = await getStore();
    if (tok !== S.token) return;
    if (!store) {
      notify("저장 기능을 불러오지 못해 형광펜·메모를 쓸 수 없습니다. 페이지를 새로 고쳐 주세요.");
      return;
    }
    var raw = await callStore(function () { return store.loadAnnotations(docHash); }, null);
    if (tok !== S.token) return;
    if (raw === null) {
      notify("저장해 둔 하이라이트·메모를 불러오지 못했습니다.");
      return;
    }
    var records = sanitizeRecords(raw);
    if (!records.length) { renderPanel(); return; }

    var texts;
    try {
      texts = await TXM().allPageTexts();
    } catch (err2) {
      if (tok !== S.token) return;
      console.error("[reader] 쪽 글 읽기 실패", err2);
      notify("본문을 읽지 못해 형광펜 위치를 표시하지 못했습니다. 메모 탭에서는 볼 수 있습니다.");
      records.forEach(function (r) { S.items.push({ record: r, start: null, end: null, status: "lost" }); });
      renderPanel();
      return;
    }
    if (tok !== S.token) return;
    S.texts = texts;

    var byPage = new Map();
    records.forEach(function (r) {
      if (!byPage.has(r.page)) byPage.set(r.page, []);
      byPage.get(r.page).push(r);
    });
    var toPersist = [];
    byPage.forEach(function (recs, page) {
      var pt = textOfPage(page);
      placeRecords(recs, pt).forEach(function (pl) {
        S.items.push(pl);
        if (pl.status === "quote") {
          // 옛 뷰어와 같다: 새 위치로 맞추고, 너무 짧은 글귀가 아니면 저장해 다음에는 위치만으로 끝나게 한다.
          pl.record.startOffset = pl.start;
          pl.record.endOffset = pl.end;
          pl.record.quoteText = TM.normalizeQuoteText(pt.slice(pl.start, pl.end));
          if (TM.shouldPersistReanchor(pl.record.quoteText)) toPersist.push(pl.record);
        }
      });
    });
    renderPanel();
    byPage.forEach(function (recs, page) { redrawPage(page); });

    for (var i = 0; i < toPersist.length; i++) {
      var rec = toPersist[i];
      if (tok !== S.token) return;
      // 실패해도 이번 화면에는 제대로 그려진다. 다음에 열 때 같은 재탐색을 한 번 더 할 뿐이라 문구는 띄우지 않는다.
      await callStore(function () {
        return store.updateAnnotationAnchor(docHash, rec.id, {
          page: rec.page, startOffset: rec.startOffset, endOffset: rec.endOffset, quoteText: rec.quoteText,
        });
      }, false);
    }
  }

  // ---------- 추가 ----------
  async function pageTextFor(page) {
    if (S.texts[page - 1] !== undefined) return S.texts[page - 1];
    var res = await TXM().get(page, { measure: false, quiet: true });
    var t = res ? res.text : "";
    S.texts[page - 1] = t;
    return t;
  }

  async function waitColor() {
    if (!pendingColor) return;
    try { await pendingColor.promise; } catch (e) { /* 색 바꾸기 쪽에서 이미 안내했다 */ }
  }

  // 쪽마다 한 건씩 만든다. 같은 쪽에서 겹치는 기존 형광펜은 한 범위로 합친다.
  // 합친 것을 먼저 저장하고, 저장에 성공했을 때만 옛 것을 지운다(planMerge / shouldDeleteOld).
  // 저장에 실패하면 옛 기록은 그대로 두고 새 것은 "저장되지 않음"으로 화면에만 남긴다("다시 저장"으로 재시도).
  // 합쳐지는 옛 메모는 잃지 않도록 새 메모 앞에 이어 붙인다. 최종 범위는 낱말 단위로 맞춘다.
  async function add(ranges, text, color, note) {
    var tok = S.token;
    var docHash = S.docHash;
    var out = [];
    if (!docHash || !Array.isArray(ranges) || !ranges.length) return out;
    var col = COLORS.indexOf(color) >= 0 ? color : "yellow";
    var store = await getStore();
    if (tok !== S.token) return out;
    var failedSaves = 0;
    var failedDeletes = 0;
    var list = ranges.slice().sort(function (a, b) { return a.page - b.page; });
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var pt;
      try { pt = await pageTextFor(r.page); } catch (errPt) {
        console.error("[reader] 쪽 글 읽기 실패", errPt);
        if (tok === S.token) notify(MSG_SAVE_FAIL);
        return out;
      }
      if (tok !== S.token) return out;
      var start = Math.max(0, Math.min(pt.length, r.start));
      var end = Math.max(start, Math.min(pt.length, r.end));
      if (end <= start) continue;

      // 같은 쪽·같은 범위의 저장이 아직 끝나지 않았으면 같은 요청은 무시한다(복사본이 둘 생기지 않게).
      var pkey = r.page + ":" + start + ":" + end;
      if (S.pending[pkey]) continue;
      var existing = S.items
        .filter(function (it) { return it.record.page === r.page && it.status !== "lost" && !it.record.saving && colorOf(it.record) === col; })
        .map(function (it) { return { start: it.start, end: it.end, createdAt: it.record.createdAt, id: it.record.id, note: it.record.note, replaces: (it.replaces || []).map(function (o) { return o.record.id; }), snap: it.snap, item: it }; });
      var plan = planMerge(existing, pt, start, end, note);
      var olds = plan.olds.map(function (o) { return o.item; });
      start = plan.start;
      end = plan.end;
      var createdAt = new Date().toISOString();
      var quote = TM.normalizeQuoteText(pt.slice(start, end)); // 공백·줄바꿈·제어 문자의 연속은 공백 하나로(글자 범위는 그대로)
      var payload = { page: r.page, startOffset: start, endOffset: end, quoteText: quote, color: col, note: plan.note };

      // 저장이 끝나기 전에도 바로 보여 준다("저장 중…"). 끝나면 이 항목의 기록을 바꿔 끼운다.
      S.unsavedSeq++;
      var item = { record: { id: "saving-" + S.unsavedSeq, page: r.page, startOffset: start, endOffset: end, quoteText: quote, color: col, note: plan.note, createdAt: createdAt, saving: true }, start: start, end: end, status: "offset", replaces: [], snap: [] };
      var savingKey = key(item.record);
      S.pending[pkey] = true;
      S.items.push(item);
      renderPanel();
      redrawPage(r.page);

      var rec = null;
      try {
        if (store) {
          rec = await callStore(function () { return store.createAnnotation(docHash, S.title, payload); }, null, lateCreateCleanup(store, docHash));
        }
      } finally {
        if (tok === S.token) delete S.pending[pkey];
      }
      if (tok !== S.token) return out;
      if (!rec) {
        failedSaves++;
        S.unsavedSeq++;
        rec = { id: "unsaved-" + S.unsavedSeq, page: r.page, startOffset: start, endOffset: end, quoteText: quote, color: col, note: plan.note, createdAt: createdAt, unsaved: true };
      }
      var keep = [];
      if (shouldDeleteOld(rec)) {
        for (var j = 0; j < olds.length; j++) {
          var old = olds[j];
          var ok = true;
          if (!old.record.unsaved && store) {
            ok = (await callStore(function () { return store.deleteAnnotation(docHash, old.record.id); }, false)) !== false;
            if (tok !== S.token) return out;
          }
          if (!ok) { failedDeletes++; continue; }
          dropItem(old);
        }
      } else {
        keep = olds; // 저장하지 못했으니 옛 기록은 건드리지 않는다. 다시 저장에 성공하면 그때 정리한다.
      }
      item.record = rec;
      item.replaces = keep;
      item.snap = keep.map(function (o) { return noteText(o.record.note); });
      S.renamed[savingKey] = key(rec);
      out.push(rec);
      renderPanel();
      redrawPage(r.page);
    }
    if (failedSaves) notify(MSG_SAVE_FAIL);
    if (failedDeletes) notify(MSG_CHANGE_FAIL);
    return out;
  }

  // 저장되지 않은 형광펜을 다시 저장한다. 성공하면 합쳐지기로 했던 옛 기록을 정리한다(첫 저장과 같은 shouldDeleteOld 를 거친다).
  // 실패~재시도 사이에 옛 기록의 메모가 바뀌었으면 그 메모를 다시 저장하는 기록에 접어 넣은 뒤에 지운다.
  // 재시도 도중 화면 기록에 한 고침(메모·색)은 되돌리지 않는다.
  async function retrySave(id) {
    var item = findItem(id);
    if (!item || !item.record.unsaved || item.retrying) return false;
    var tok = S.token;
    var docHash = S.docHash;
    var old = item.record;
    var sentNote = noteText(old.note);
    var sentColor = colorOf(old);
    item.retrying = true;
    var store = await getStore();
    var rec = null;
    if (store) {
      rec = await callStore(function () {
        return store.createAnnotation(docHash, S.title, {
          page: old.page, startOffset: old.startOffset, endOffset: old.endOffset, quoteText: old.quoteText, color: sentColor, note: sentNote,
        });
      }, null, lateCreateCleanup(store, docHash));
    }
    item.retrying = false;
    if (!rec) {
      if (tok === S.token) notify(MSG_SAVE_FAIL);
      return false;
    }
    if (tok !== S.token || S.items.indexOf(item) < 0) {
      // 그 사이 문서가 바뀌었거나 사용자가 지웠다: 방금 저장한 것을 되돌린다.
      await callStore(function () { return store.deleteAnnotation(docHash, rec.id); }, false);
      return false;
    }
    S.renamed[key(old)] = key(rec);
    item.record = rec;
    var olds = (item.replaces || []).slice();
    var snaps = (item.snap || []).slice();
    item.replaces = [];
    item.snap = [];
    var failed = 0;
    var go = shouldDeleteOld(rec);
    var present = [];
    olds.forEach(function (o, idx) { if (S.items.indexOf(o) >= 0) present.push({ item: o, snap: snaps[idx] }); });
    // 메모 접기: 바뀐 원본 메모 + 재시도 도중 고친 화면 메모
    var target = foldNotes(noteText(old.note), present.map(function (x) { return { note: noteText(x.item.record.note), snap: x.snap }; }));
    var noteOk = true;
    if (go && target !== noteText(rec.note)) {
      var upd = await callStore(function () { return store.updateAnnotationNote(docHash, rec.id, target); }, false);
      if (tok !== S.token) return true;
      noteOk = upd !== false;
      if (noteOk) rec.note = target;
    }
    for (var j = 0; j < present.length; j++) {
      var o = present[j].item;
      if (!go || S.items.indexOf(o) < 0) continue;
      var changed = noteText(o.record.note) !== noteText(present[j].snap);
      if (changed && !noteOk) { failed++; continue; } // 접어 넣지 못한 바뀐 메모는 원본과 함께 남긴다
      var ok = true;
      if (!o.record.unsaved) {
        ok = (await callStore(function () { return store.deleteAnnotation(docHash, o.record.id); }, false)) !== false;
        if (tok !== S.token) return true;
      }
      if (ok) dropItem(o); else failed++;
    }
    if (failed || !noteOk) notify(MSG_CHANGE_FAIL);
    renderPanel();
    redrawPage(rec.page);
    // 저장되지 않은 형광펜이 하나도 남지 않았다: 저장 실패 안내를 거둘 수 있게 알린다(doc.js 에 문구별 삭제가 없다).
    if (!unsavedCount()) {
      var rdEl = $("reader");
      if (rdEl) rdEl.dispatchEvent(new CustomEvent("reader:unsavedclear", { detail: {} }));
      if (D() && D().unnotify) D().unnotify(MSG_SAVE_FAIL);
    }
    // 재시도 도중 색을 바꿨으면 새 기록에 이어서 적용한다.
    var wantColor = colorOf(old);
    if (wantColor !== colorOf(rec) && S.items.indexOf(item) >= 0) await setColor(rec.id, wantColor);
    return true;
  }

  // ---------- 고치기 ----------
  function busyColors(on) {
    var el = pop();
    if (!el) return;
    el.querySelectorAll(".rd-annopop-color").forEach(function (b) { b.disabled = !!on; });
  }

  // 저장 계층에 색만 바꾸는 함수가 없다(공개 함수는 그대로 쓴다는 약속). 같은 내용을 새 색으로 만든 뒤 옛 것을 지운다.
  // 그래서 색을 바꾸면 id 가 바뀐다(S.renamed 에 옛 id -> 새 id 를 남겨 늦게 오는 메모 저장이 새 기록을 찾게 한다). 새 기록을 돌려준다.
  // 진행 중에는 색 단추를 막고, 다른 색 바꾸기 요청은 진행 중인 것의 결과를 그대로 돌려준다.
  function setColor(id, color) {
    if (pendingColor) return pendingColor.promise;
    var mine = {};
    var tok = S.token;
    var p = (async function () {
      try { return await doSetColor(id, color); }
      finally {
        // 문서가 바뀌어 reset 이 이미 비웠거나 새 문서의 색 바꾸기가 시작됐다면 건드리지 않는다.
        if (pendingColor === mine) { pendingColor = null; if (tok === S.token) busyColors(false); }
      }
    })();
    mine.promise = p;
    pendingColor = mine;
    busyColors(true);
    return p;
  }

  async function doSetColor(id, color) {
    var item = findItem(id);
    var col = COLORS.indexOf(color) >= 0 ? color : null;
    if (!item || !col || colorOf(item.record) === col || item.record.saving) return item ? item.record : null;
    var tok = S.token;
    var docHash = S.docHash;
    var old = item.record;
    if (old.unsaved) {
      old.color = col;
      renderPanel();
      redrawPage(old.page);
      return old;
    }
    var store = await getStore();
    var rec = null;
    if (store) {
      rec = await callStore(function () {
        return store.createAnnotation(docHash, S.title, {
          page: old.page, startOffset: old.startOffset, endOffset: old.endOffset, quoteText: old.quoteText, color: col, note: noteText(old.note),
        });
      }, null, lateCreateCleanup(store, docHash));
    }
    if (!rec) {
      if (tok === S.token) notify(MSG_CHANGE_FAIL);
      return tok === S.token ? old : null;
    }
    // 문서가 그 사이 바뀌었어도 이 문서(docHash)의 옛 기록은 지운다 — 저장된 복사본이 남지 않게.
    var ok = (await callStore(function () { return store.deleteAnnotation(docHash, old.id); }, false)) !== false;
    if (tok !== S.token) return null;
    if (!ok) notify(MSG_CHANGE_FAIL);
    else { dropItem(item); S.renamed[key(old)] = key(rec); }
    S.items.push({ record: rec, start: item.start, end: item.end, status: item.status, replaces: [] });
    renderPanel();
    redrawPage(rec.page);
    return rec;
  }

  async function setNote(id, note) {
    await waitColor();
    var item = findItem(id);
    if (!item || item.record.saving) return false; // 저장 중인 기록은 끝난 뒤에 고친다
    var tok = S.token;
    var text = String(note == null ? "" : note).trim();
    var ok = true;
    if (!item.record.unsaved) {
      var store = await getStore();
      ok = false;
      if (store) {
        var nid = item.record.id;
        var dh = S.docHash;
        ok = (await callStore(function () { return store.updateAnnotationNote(dh, nid, text); }, false)) !== false;
      }
      if (tok !== S.token) return false;
    }
    if (!ok) notify(MSG_CHANGE_FAIL);
    item.record.note = text;
    renderPanel();
    redrawPage(item.record.page);
    return ok;
  }

  async function remove(id) {
    await waitColor();
    var item = findItem(id);
    if (!item || item.record.saving) return false; // 저장 중인 기록은 끝난 뒤에 고친다
    var tok = S.token;
    var ok = true;
    if (!item.record.unsaved) {
      var store = await getStore();
      ok = false;
      if (store) {
        var did = item.record.id;
        var dh2 = S.docHash;
        ok = (await callStore(function () { return store.deleteAnnotation(dh2, did); }, false)) !== false;
      }
      if (tok !== S.token) return false;
    }
    if (!ok) {
      // 저장소에서 지우지 못했으면 화면에서도 지우지 않는다(다시 열면 되살아나는 일이 없게).
      notify(MSG_CHANGE_FAIL);
      return false;
    }
    var snap = { record: Object.assign({}, item.record), start: item.start, end: item.end, status: item.status };
    dropItem(item);
    renderPanel();
    redrawPage(item.record.page);
    showUndo(snap);
    return ok;
  }

  // ---------- 삭제 되돌리기 ----------
  var UNDO_MS = 5000;
  var undoState = null; // {snap, timer, docHash, token}

  function hideUndo() {
    if (undoState) { clearTimeout(undoState.timer); undoState = null; }
    var el = $("rd-undo");
    if (el) el.hidden = true;
  }

  function showUndo(snap) {
    if (undoState) clearTimeout(undoState.timer);
    var el = $("rd-undo");
    if (!el) {
      var host = $("reader");
      if (!host) return;
      el = document.createElement("div");
      el.id = "rd-undo";
      el.className = "rd-undo";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      var msg = document.createElement("span");
      msg.className = "rd-undo-msg";
      msg.textContent = "삭제했습니다";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rd-undo-btn";
      btn.textContent = "되돌리기";
      btn.addEventListener("click", function () { undoDelete(); });
      el.appendChild(msg);
      el.appendChild(btn);
      host.appendChild(el);
    }
    el.hidden = false;
    undoState = { snap: snap, token: S.token, docHash: S.docHash, timer: setTimeout(hideUndo, UNDO_MS) };
  }

  // 방금 지운 형광펜(메모 포함)을 같은 자리에 다시 만든다.
  async function undoDelete() {
    var u = undoState;
    if (!u) return false;
    hideUndo();
    if (u.token !== S.token) return false;
    var old = u.snap.record;
    var payload = { page: old.page, startOffset: old.startOffset, endOffset: old.endOffset, quoteText: old.quoteText, color: colorOf(old), note: noteText(old.note) };
    var store = await getStore();
    var rec = null;
    if (store && !old.unsaved) rec = await callStore(function () { return store.createAnnotation(u.docHash, S.title, payload); }, null, lateCreateCleanup(store, u.docHash));
    if (u.token !== S.token) return false;
    if (!rec) {
      S.unsavedSeq++;
      rec = Object.assign({}, old, { id: "unsaved-" + S.unsavedSeq, unsaved: true });
      notify(MSG_SAVE_FAIL);
    }
    S.items.push({ record: rec, start: u.snap.start, end: u.snap.end, status: u.snap.status, replaces: [], snap: [] });
    renderPanel();
    redrawPage(rec.page);
    return true;
  }

  function unsavedCount() {
    return S.items.filter(function (i) { return i.record && i.record.unsaved; }).length;
  }

  function list() {
    return sortedItems().map(function (i) { return { record: i.record, status: i.status }; });
  }

  // ---------- 이동 ----------
  function itemRects(item) {
    return TXM().get(item.record.page).then(function (d) {
      if (!d || item.status === "lost") return [];
      var sn = drawRange(item);
      return G.rangeRects(d.charBoxes, sn.start, sn.end, d.text);
    });
  }

  function cancelGoTo() {
    if (!pendingGoTo) return;
    S.goToken++;
    pendingGoTo = null;
  }

  // 먼저 그 쪽으로 가고(아직 그려지지 않은 쪽이면 그려지기 시작한다), 위치가 측정되면 줄 높이로 다듬고 깜빡인다.
  // 다른 goTo·문서 닫기·사용자가 멀리 스크롤한 경우에는 뒤늦은 이동을 하지 않는다.
  async function goTo(id) {
    var item = findItem(id);
    if (!item) return;
    var page = item.record.page;
    var tok = S.token;
    var my = ++S.goToken;
    D().goToPage(page);
    var sc = $("rd-scroll");
    pendingGoTo = { token: my, top: sc ? sc.scrollTop : 0 };
    if (item.status === "lost") { pendingGoTo = null; return { page: page, rects: [] }; }
    var rects = [];
    try { rects = await itemRects(item); } catch (err) { console.error("[reader] goTo", err); }
    if (tok !== S.token || my !== S.goToken) return null;
    pendingGoTo = null;
    var size = D().pageSize(page);
    var y = rects.length ? rects[0].y / (size.h || 1) : 0;
    D().goToPage(page, { yRatio: Math.max(0, Math.min(1, y)) });
    if (rects.length) root.ReaderOverlay.flash(page, rects);
    return { page: page, rects: rects };
  }

  // 메모 패널에서 항목을 눌렀을 때: 그 기록으로 이동한 뒤 그 기록의 편집 창을 연다(겹쳐 가려진 기록도 여기서 열린다).
  async function goToAndEdit(id) {
    var tok = S.token;
    var r = await goTo(id);
    if (!r || tok !== S.token) return;
    // 이동 때문에 생기는 scroll 이벤트가 편집 창을 닫지 않도록 화면이 안정된 뒤에 연다.
    await new Promise(function (resolve) { root.requestAnimationFrame(function () { root.requestAnimationFrame(resolve); }); });
    if (tok !== S.token || !findItem(id)) return;
    var a = null;
    if (r.rects.length) {
      var first = r.rects[0];
      var last = r.rects[r.rects.length - 1];
      var tl = D().pageToClient(r.page, { x: first.x, y: first.y });
      var br = D().pageToClient(r.page, { x: last.x + last.w, y: last.y + last.h });
      if (tl && br) a = { left: tl.x, right: br.x, top: tl.y, bottom: br.y };
    }
    openEditor(id, a);
  }


  // ---------- 편집 창 ----------
  function pop() { return $("rd-annopop"); }

  function placePop(anchor) {
    var el = pop();
    if (!el) return;
    var vw = root.innerWidth;
    var vh = root.innerHeight;
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    var a = anchor || { left: vw / 2, right: vw / 2, top: vh / 3, bottom: vh / 3 };
    var left = Math.min(Math.max(8, a.left), Math.max(8, vw - w - 8));
    var top = a.bottom + 8;
    if (top + h > vh - 8) top = Math.max(8, a.top - h - 8);
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
  }

  function syncPopColors(record) {
    var el = pop();
    if (!el) return;
    el.querySelectorAll(".rd-annopop-color").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.color === colorOf(record) ? "true" : "false");
    });
  }

  // 겹친 기록(한 덩어리로 그려진 것) 사이를 옮기는 작은 "1 / 2" 바. 기록이 하나뿐이면 숨긴다.
  function ensureSwitcher() {
    var el = pop();
    if (!el) return null;
    var sw = $("rd-annopop-switch");
    if (!sw) {
      sw = document.createElement("div");
      sw.id = "rd-annopop-switch";
      sw.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px";
      [["-1", "‹", "이전 기록"], ["1", "›", "다음 기록"]].forEach(function (d, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.dataset.switch = d[0];
        b.textContent = d[1];
        b.setAttribute("aria-label", d[2]);
        b.style.cssText = "padding:0 8px;cursor:pointer";
        if (i === 1) { var lab = document.createElement("span"); lab.className = "rd-annopop-switchlabel"; lab.setAttribute("aria-live", "polite"); sw.appendChild(lab); }
        sw.appendChild(b);
      });
      el.insertBefore(sw, el.firstChild);
    }
    return sw;
  }
  function renderSwitcher() {
    var sw = ensureSwitcher();
    if (!sw) return;
    var multi = !!(editing && editing.group && editing.group.length > 1);
    sw.hidden = !multi;
    var lab = sw.querySelector(".rd-annopop-switchlabel");
    if (lab) lab.textContent = multi ? (editing.index + 1) + " / " + editing.group.length : "";
  }
  // 형광펜 밑에 용어 표시가 겹쳐 있으면(터치에서는 형광펜이 눌림을 먼저 받는다) 용어로 가는 길을 편집 창에 둔다.
  function renderTermButton() {
    var b = pop() && pop().querySelector('[data-act="term"]');
    if (!b) return;
    var t = editing && editing.term;
    b.hidden = !t;
    b.textContent = t && t.title ? "용어 보기: " + (t.title.length > 12 ? t.title.slice(0, 12) + "…" : t.title) : "용어 보기";
  }
  function switchRecord(delta) {
    if (!editing || !editing.group || editing.group.length < 2) return;
    var g = editing.group;
    var idx = (editing.index + delta + g.length) % g.length;
    if (dirty()) setNote(editing.id, $("rd-annopop-note").value); // 쓰던 메모는 저장하고 넘어간다
    openEditor(g[idx], editing.anchor, g, idx, true, editing.term); // 누른 이전·다음 단추에 포커스를 둔다
  }

  // group: 한 덩어리로 그려진 기록들의 id(클릭한 덩어리), index: 그중 열 기록의 자리
  function openEditor(id, anchor, group, index, keepFocus, term) {
    var item = findItem(id);
    var el = pop();
    if (!item || !el || item.record.saving) return;
    if (el.hidden) prevFocus = document.activeElement;
    var grp = null;
    if (Array.isArray(group)) {
      var seen = {};
      grp = group.map(function (gid) { var it = findItem(gid); return it ? it.record.id : null; }).filter(function (gid) {
        if (gid === null || seen[String(gid)]) return false;
        seen[String(gid)] = true;
        return true;
      });
      var pos = grp.indexOf(item.record.id);
      if (pos < 0) { grp.push(item.record.id); pos = grp.length - 1; }
      index = pos;
    }
    editing = { id: item.record.id, base: noteText(item.record.note), group: grp, index: index || 0, anchor: anchor || null, term: term || null };
    renderSwitcher();
    renderTermButton();
    $("rd-annopop-note").value = noteText(item.record.note);
    syncPopColors(item.record);
    busyColors(!!pendingColor);
    el.hidden = false;
    placePop(anchor);
    if (!keepFocus) $("rd-annopop-note").focus({ preventScroll: true });
  }

  function dirty() {
    var ta = $("rd-annopop-note");
    return !!(editing && ta && ta.value.trim() !== String(editing.base || "").trim());
  }

  // save: true 면 고친 메모를 저장하고 닫는다. 바깥 클릭·스크롤로 닫을 때 쓴 글이 사라지지 않게 한다.
  function closeEditor(opts) {
    var el = pop();
    if (!el || el.hidden) { editing = null; return; }
    var e = editing;
    var save = !!(opts && opts.save) && dirty();
    var val = $("rd-annopop-note").value;
    el.hidden = true;
    editing = null;
    // 포커스가 편집 창 안에 있었거나 갈 곳을 잃었으면 열기 전에 있던 요소로 돌려준다(다른 곳을 눌렀다면 그대로 둔다).
    var back = prevFocus;
    prevFocus = null;
    var ae = document.activeElement;
    if (back && document.contains(back) && typeof back.focus === "function" && (!ae || ae === document.body || el.contains(ae))) {
      try { back.focus({ preventScroll: true }); } catch (err) { /* 포커스를 못 옮겨도 닫기는 끝났다 */ }
    }
    // 색 바꾸기가 진행 중이면 setNote 가 끝나기를 기다렸다가 새 기록(id 가 바뀜)에 메모를 적용한다.
    if (save && e) setNote(e.id, val);
  }

  // Esc: 편집 창이 열려 있으면 (고친 메모는 저장하고) 닫고 true. 어느 것을 닫을지는 reader.js 의 Esc 처리가 정한다.
  function dismissEditor() {
    var p = pop();
    if (!p || p.hidden) return false;
    closeEditor({ save: true });
    return true;
  }

  // 한 덩어리의 기록들을 읽는 순서로(시작 위치, 같으면 만든 순서, 그다음 id 순) 늘어놓는다.
  function sortGroup(ids) {
    return ids.slice().sort(function (a, b) {
      var ia = findItem(a);
      var ib = findItem(b);
      var sa = ia && ia.start !== null ? ia.start : Infinity;
      var sb = ib && ib.start !== null ? ib.start : Infinity;
      if (sa !== sb) return sa < sb ? -1 : 1;
      var ca = ia ? String(ia.record.createdAt || "") : "";
      var cb = ib ? String(ib.record.createdAt || "") : "";
      return ca.localeCompare(cb) || String(a).localeCompare(String(b));
    });
  }

  function bindEditor() {
    var el = pop();
    if (!el) return;
    el.addEventListener("click", async function (ev) {
      var swBtn = ev.target.closest("button[data-switch]");
      if (swBtn) { switchRecord(Number(swBtn.dataset.switch)); return; }
      var colorBtn = ev.target.closest(".rd-annopop-color");
      if (colorBtn && editing) {
        // 기다리는 사이 다른 기록의 편집 창이 열렸을 수 있다: 같은 편집 세션일 때만 새 id 를 이어받는다.
        var sess = editing;
        var rec = await setColor(sess.id, colorBtn.dataset.color);
        if (rec && editing === sess) {
          if (sess.group && sess.group[sess.index] === sess.id) sess.group[sess.index] = rec.id;
          sess.id = rec.id;
          syncPopColors(rec);
        }
        return;
      }
      var act = ev.target.closest("button[data-act]");
      if (!act || !editing) return;
      if (act.dataset.act === "term") {
        var tm = editing.term;
        closeEditor({ save: true }); // 쓰던 메모는 저장하고 간다
        if (tm && root.ReaderTerms && root.ReaderTerms.showTerm) root.ReaderTerms.showTerm(tm.slug);
        return;
      }
      var item = findItem(editing.id);
      if (!item) { closeEditor({ save: false }); return; }
      if (act.dataset.act === "save") {
        var id = editing.id;
        var val = $("rd-annopop-note").value;
        closeEditor({ save: false });
        setNote(id, val);
      } else if (act.dataset.act === "delete") {
        var rid = editing.id;
        var rem = (editing.group || []).filter(function (g) { var it = findItem(g); return it && String(it.record.id) !== String(rid); });
        if (!rem.length) {
          closeEditor({ save: false });
          remove(rid);
        } else {
          // 겹친 기록 중 하나를 지우면 편집 창은 남은 기록으로 열어 둔다.
          var sess2 = editing;
          var ni = Math.min(sess2.index, rem.length - 1);
          remove(rid).then(function () {
            if (editing === sess2) openEditor(rem[ni], sess2.anchor, rem, ni);
          });
        }
      } else if (act.dataset.act === "copy") {
        // 형광펜 복사는 화면에 칠한 범위(낱말로 넓힌) 글을 복사한다.
        var sn = drawRange(item);
        var quote = textOfPage(item.record.page).slice(sn.start, sn.end);
        root.ReaderSelection.copyText(quote || item.record.quoteText || "").then(function () {
          act.textContent = "복사됨";
          setTimeout(function () { act.textContent = "복사"; }, 1200);
        }).catch(function () { /* 안내는 copyText 가 띄웠다 */ });
      }
    });
    el.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); var b = el.querySelector('[data-act="save"]'); if (b) b.click(); }
    });
    document.addEventListener("pointerdown", function (ev) {
      var p = pop();
      if (!p || p.hidden) return;
      if (p.contains(ev.target)) return;
      closeEditor({ save: true });
    }, true);
    var sc = $("rd-scroll");
    if (sc) sc.addEventListener("scroll", function () { closeEditor({ save: true }); }, { passive: true });
  }

  function bindGoToCancel() {
    var sc = $("rd-scroll");
    if (!sc) return;
    // 사용자가 직접 멀리 스크롤하면 아직 끝나지 않은 "메모로 이동"은 취소한다.
    sc.addEventListener("scroll", function () {
      if (pendingGoTo && Math.abs(sc.scrollTop - pendingGoTo.top) > sc.clientHeight * 1.5) cancelGoTo();
    }, { passive: true });
    ["wheel", "touchstart"].forEach(function (t) { sc.addEventListener(t, cancelGoTo, { passive: true }); });
  }

  // ---------- 연결 ----------
  function init() {
    if (ready) return;
    ready = true;
    bindEditor();
    bindGoToCancel();

    var sc = $("rd-scroll");
    if (sc) {
      // 형광펜을 누르면 편집 창. 글자를 고르는 중이면(선택이 남아 있으면) 건드리지 않는다.
      sc.addEventListener("click", function (ev) {
        if (!S.docHash || ev.button !== 0) return;
        var sel = root.getSelection ? root.getSelection() : null;
        if (sel && !sel.isCollapsed) return;
        var hit = root.ReaderOverlay.entryAt(ev.clientX, ev.clientY, ["highlight"]);
        if (!hit || hit.id === undefined) return;
        var ids = hit.data && Array.isArray(hit.data.ids) && hit.data.ids.length > 1 ? sortGroup(hit.data.ids) : null;
        var th = root.ReaderOverlay.entryAt(ev.clientX, ev.clientY, ["term"]);
        var term = null;
        if (th && th.id !== undefined) {
          var tms = root.ReaderTerms && root.ReaderTerms._state ? root.ReaderTerms._state() : null;
          var tmatch = tms && tms.matchBySlug ? tms.matchBySlug.get(th.id) : null;
          term = { slug: String(th.id), title: tmatch ? (tmatch.title_ko || "") : "" };
        }
        openEditor(ids ? ids[0] : hit.id, { left: ev.clientX, right: ev.clientX, top: ev.clientY, bottom: ev.clientY }, ids, undefined, false, term);
      });
    }

    var pane = root.ReaderPanels && root.ReaderPanels.tabPanel("right", "notes");
    if (pane) {
      pane.addEventListener("click", function (ev) {
        var rt = ev.target.closest(".rd-note-retry");
        if (rt) { retrySave(rt.dataset.id); return; }
        var btn = ev.target.closest(".rd-note");
        if (!btn) return;
        goToAndEdit(btn.dataset.id);
        // 좁은 화면에서는 서랍이 본문을 가린다.
        if (root.matchMedia && root.matchMedia("(max-width: 767px)").matches) root.ReaderPanels.close("right");
      });
    }

    // Ctrl/Cmd+Z: 방금 지운 형광펜을 되돌린다(5초 안에만). 글을 쓰는 칸에서는 그 칸의 되돌리기를 방해하지 않는다.
    document.addEventListener("keydown", function (ev) {
      if (!undoState || ev.defaultPrevented) return;
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey || String(ev.key).toLowerCase() !== "z") return;
      var t = ev.target;
      if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
      ev.preventDefault();
      undoDelete();
    });

    var rd = $("reader");
    if (rd) {
      // 쪽 글과 글자 상자가 준비되면(또는 다시 준비되면) 그 쪽의 표시를 그린다.
      rd.addEventListener("reader:pagetext", function (e) {
        var page = e.detail && e.detail.page;
        if (!page || !S.docHash) return;
        if (S.items.some(function (i) { return i.record.page === page; })) redrawPage(page);
      });
      rd.addEventListener("reader:docclose", reset);
    }
    renderPanel();
  }

  root.ReaderAnnotations = {
    init: init,
    load: load,
    add: add,
    setColor: setColor,
    setNote: setNote,
    remove: remove,
    list: list,
    goTo: goTo,
    retrySave: retrySave,
    unsavedCount: unsavedCount,
    undoDelete: undoDelete,
    edit: openEditor,
    dismissEditor: dismissEditor,
    sanitizeRecords: sanitizeRecords,
    placeRecords: placeRecords,
    colors: COLORS,
    colorName: function (c) { return COLOR_NAMES[c] || c; },
  };
})(typeof window !== "undefined" ? window : globalThis);
