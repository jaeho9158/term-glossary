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
    var notes = olds.map(function (o) { return noteText(o.note); }).concat([noteText(note)]).filter(Boolean).join("\n");
    return { start: rg.start, end: rg.end, olds: olds, note: notes };
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
    };
  }
  if (typeof document === "undefined") {
    root.ReaderAnnotations = {
      sanitizeRecords: sanitizeRecords, placeRecords: placeRecords, planMerge: planMerge, shouldDeleteOld: shouldDeleteOld,
      finalizeRange: finalizeRange, drawGroups: drawGroups, noteText: noteText,
    };
    return;
  }

  var MSG_SAVE_FAIL = "형광펜을 저장하지 못했습니다. 이 화면을 닫으면 사라집니다.";
  var MSG_CHANGE_FAIL = "변경 내용을 저장하지 못했습니다.";

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
    if (root.ReaderStoreReady) { try { return await root.ReaderStoreReady; } catch (e) { return null; } }
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
    // 겹치는 기록은 한 범위로 한 번만 그린다(눌렀을 때는 가장 나중 기록이 열린다). 저장은 건드리지 않는다.
    drawGroups(ranges).forEach(function (g) {
      var prim = byId.get(String(g.primaryId));
      var rects = G.rangeRects(data.charBoxes, g.start, g.end);
      if (!prim || !rects.length) return;
      var color = colorOf(prim.record);
      entries.push({ id: prim.record.id, rects: rects, refine: true, data: { color: color }, className: "rd-hl-" + color });
    });
    onPage.forEach(function (item) {
      var sn = drawRange(item);
      var rects = G.rangeRects(data.charBoxes, sn.start, sn.end);
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
    if (rec.unsaved) {
      var badge = document.createElement("span");
      badge.className = "rd-note-unsaved";
      badge.textContent = "저장되지 않음";
      badge.style.cssText = "margin-left:.5em;color:#b3261e;font-weight:600";
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
      retry.style.cssText = "margin:2px 0 6px 28px;padding:2px 10px;font-size:12px;cursor:pointer";
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

  // ---------- 불러오기 ----------
  function reset() {
    S.token++;
    S.docHash = null;
    S.title = "";
    S.texts = [];
    S.items = [];
    S.renamed = {};
    S.goToken++;
    pendingGoTo = null;
    closeEditor({ save: false });
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
    var raw = [];
    try {
      raw = await store.loadAnnotations(docHash);
    } catch (err) {
      console.error("[reader] 형광펜 불러오기 실패", err);
      if (tok !== S.token) return;
      notify("저장해 둔 하이라이트·메모를 불러오지 못했습니다.");
      return;
    }
    if (tok !== S.token) return;
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
          pl.record.quoteText = pt.slice(pl.start, pl.end);
          if (TM.shouldPersistReanchor(pl.record.quoteText)) toPersist.push(pl.record);
        }
      });
    });
    renderPanel();
    byPage.forEach(function (recs, page) { redrawPage(page); });

    for (var i = 0; i < toPersist.length; i++) {
      var rec = toPersist[i];
      if (tok !== S.token) return;
      try {
        await store.updateAnnotationAnchor(docHash, rec.id, {
          page: rec.page, startOffset: rec.startOffset, endOffset: rec.endOffset, quoteText: rec.quoteText,
        });
      } catch (err3) {
        // 이번 화면에는 제대로 그려진다. 다음에 열 때 같은 재탐색을 한 번 더 할 뿐이라 문구는 띄우지 않는다.
        console.error("[reader] 형광펜 위치 다시 저장 실패", err3);
      }
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
      var pt = await pageTextFor(r.page);
      if (tok !== S.token) return out;
      var start = Math.max(0, Math.min(pt.length, r.start));
      var end = Math.max(start, Math.min(pt.length, r.end));
      if (end <= start) continue;

      var existing = S.items
        .filter(function (it) { return it.record.page === r.page && it.status !== "lost"; })
        .map(function (it) { return { start: it.start, end: it.end, createdAt: it.record.createdAt, id: it.record.id, note: it.record.note, item: it }; });
      var plan = planMerge(existing, pt, start, end, note);
      var olds = plan.olds.map(function (o) { return o.item; });
      start = plan.start;
      end = plan.end;
      var createdAt = new Date().toISOString();
      var quote = pt.slice(start, end);
      var payload = { page: r.page, startOffset: start, endOffset: end, quoteText: quote, color: col, note: plan.note };

      var rec = null;
      if (store) {
        try { rec = await store.createAnnotation(docHash, S.title, payload); } catch (err) { console.error("[reader] createAnnotation", err); rec = null; }
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
            ok = false;
            try { ok = (await store.deleteAnnotation(docHash, old.record.id)) !== false; } catch (err2) { console.error("[reader] deleteAnnotation/merge", err2); }
            if (tok !== S.token) return out;
          }
          if (!ok) { failedDeletes++; continue; }
          dropItem(old);
        }
      } else {
        keep = olds; // 저장하지 못했으니 옛 기록은 건드리지 않는다. 다시 저장에 성공하면 그때 정리한다.
      }
      var item = { record: rec, start: start, end: end, status: "offset", replaces: keep };
      S.items.push(item);
      out.push(rec);
      renderPanel();
      redrawPage(r.page);
    }
    if (failedSaves) notify(MSG_SAVE_FAIL);
    if (failedDeletes) notify(MSG_CHANGE_FAIL);
    return out;
  }

  // 저장되지 않은 형광펜을 다시 저장한다. 성공하면 합쳐지기로 했던 옛 기록을 정리한다.
  async function retrySave(id) {
    var item = findItem(id);
    if (!item || !item.record.unsaved || item.retrying) return false;
    var tok = S.token;
    var docHash = S.docHash;
    var old = item.record;
    item.retrying = true;
    var store = await getStore();
    var rec = null;
    if (store) {
      try {
        rec = await store.createAnnotation(docHash, S.title, {
          page: old.page, startOffset: old.startOffset, endOffset: old.endOffset, quoteText: old.quoteText, color: colorOf(old), note: noteText(old.note),
        });
      } catch (err) { console.error("[reader] retrySave", err); }
    }
    item.retrying = false;
    if (!rec) {
      if (tok === S.token) notify(MSG_SAVE_FAIL);
      return false;
    }
    if (tok !== S.token || S.items.indexOf(item) < 0) {
      // 그 사이 문서가 바뀌었거나 사용자가 지웠다: 방금 저장한 것을 되돌린다.
      try { if (store) await store.deleteAnnotation(docHash, rec.id); } catch (err3) { console.error("[reader] retrySave/undo", err3); }
      return false;
    }
    S.renamed[key(old)] = key(rec);
    item.record = rec;
    var failed = 0;
    var olds = item.replaces || [];
    item.replaces = [];
    for (var j = 0; j < olds.length; j++) {
      var o = olds[j];
      if (S.items.indexOf(o) < 0) continue;
      var ok = true;
      if (!o.record.unsaved) {
        ok = false;
        try { ok = (await store.deleteAnnotation(docHash, o.record.id)) !== false; } catch (err2) { console.error("[reader] retrySave/delete", err2); }
        if (tok !== S.token) return true;
      }
      if (ok) dropItem(o); else failed++;
    }
    if (failed) notify(MSG_CHANGE_FAIL);
    renderPanel();
    redrawPage(rec.page);
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
    var p = (async function () {
      try { return await doSetColor(id, color); }
      finally { pendingColor = null; busyColors(false); }
    })();
    pendingColor = { promise: p };
    busyColors(true);
    return p;
  }

  async function doSetColor(id, color) {
    var item = findItem(id);
    var col = COLORS.indexOf(color) >= 0 ? color : null;
    if (!item || !col || colorOf(item.record) === col) return item ? item.record : null;
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
      try {
        rec = await store.createAnnotation(docHash, S.title, {
          page: old.page, startOffset: old.startOffset, endOffset: old.endOffset, quoteText: old.quoteText, color: col, note: noteText(old.note),
        });
      } catch (err) { console.error("[reader] setColor/create", err); }
    }
    if (!rec) {
      if (tok === S.token) notify(MSG_CHANGE_FAIL);
      return tok === S.token ? old : null;
    }
    // 문서가 그 사이 바뀌었어도 이 문서(docHash)의 옛 기록은 지운다 — 저장된 복사본이 남지 않게.
    var ok = false;
    try { ok = (await store.deleteAnnotation(docHash, old.id)) !== false; } catch (err2) { console.error("[reader] setColor/delete", err2); }
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
    if (!item) return false;
    var tok = S.token;
    var text = String(note == null ? "" : note).trim();
    var ok = true;
    if (!item.record.unsaved) {
      var store = await getStore();
      ok = false;
      if (store) {
        try { ok = (await store.updateAnnotationNote(S.docHash, item.record.id, text)) !== false; } catch (err) { console.error("[reader] updateAnnotationNote", err); }
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
    if (!item) return false;
    var tok = S.token;
    var ok = true;
    if (!item.record.unsaved) {
      var store = await getStore();
      ok = false;
      if (store) {
        try { ok = (await store.deleteAnnotation(S.docHash, item.record.id)) !== false; } catch (err) { console.error("[reader] deleteAnnotation", err); }
      }
      if (tok !== S.token) return false;
    }
    if (!ok) notify(MSG_CHANGE_FAIL);
    dropItem(item);
    renderPanel();
    redrawPage(item.record.page);
    return ok;
  }

  function list() {
    return sortedItems().map(function (i) { return { record: i.record, status: i.status }; });
  }

  // ---------- 이동 ----------
  function itemRects(item) {
    return TXM().get(item.record.page).then(function (d) {
      if (!d || item.status === "lost") return [];
      var sn = drawRange(item);
      return G.rangeRects(d.charBoxes, sn.start, sn.end);
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
    if (item.status === "lost") { pendingGoTo = null; return; }
    var rects = [];
    try { rects = await itemRects(item); } catch (err) { console.error("[reader] goTo", err); }
    if (tok !== S.token || my !== S.goToken) return;
    pendingGoTo = null;
    var size = D().pageSize(page);
    var y = rects.length ? rects[0].y / (size.h || 1) : 0;
    D().goToPage(page, { yRatio: Math.max(0, Math.min(1, y)) });
    if (rects.length) root.ReaderOverlay.flash(page, rects);
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

  function openEditor(id, anchor) {
    var item = findItem(id);
    var el = pop();
    if (!item || !el) return;
    if (el.hidden) prevFocus = document.activeElement;
    editing = { id: item.record.id, base: noteText(item.record.note) };
    $("rd-annopop-note").value = noteText(item.record.note);
    syncPopColors(item.record);
    busyColors(!!pendingColor);
    el.hidden = false;
    placePop(anchor);
    $("rd-annopop-note").focus({ preventScroll: true });
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

  // 다른 대화 상자가 위에 열려 있으면 Esc 는 그쪽 몫이다.
  function otherDialogOpen() {
    return !!document.querySelector('dialog[open], [role="dialog"]:not([hidden]):not(#rd-annopop), [aria-modal="true"]:not([hidden])');
  }

  function bindEditor() {
    var el = pop();
    if (!el) return;
    el.addEventListener("click", async function (ev) {
      var colorBtn = ev.target.closest(".rd-annopop-color");
      if (colorBtn && editing) {
        var rec = await setColor(editing.id, colorBtn.dataset.color);
        if (rec && editing) { editing.id = rec.id; syncPopColors(rec); }
        return;
      }
      var act = ev.target.closest("button[data-act]");
      if (!act || !editing) return;
      var item = findItem(editing.id);
      if (!item) { closeEditor({ save: false }); return; }
      if (act.dataset.act === "save") {
        var id = editing.id;
        var val = $("rd-annopop-note").value;
        closeEditor({ save: false });
        setNote(id, val);
      } else if (act.dataset.act === "delete") {
        var rid = editing.id;
        closeEditor({ save: false });
        remove(rid);
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
      if (ev.key === "Escape") { ev.stopPropagation(); closeEditor({ save: false }); }
      else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); var b = el.querySelector('[data-act="save"]'); if (b) b.click(); }
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape" || ev.defaultPrevented) return;
      var p = pop();
      if (!p || p.hidden || otherDialogOpen()) return;
      closeEditor({ save: false });
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
        openEditor(hit.id, { left: ev.clientX, right: ev.clientX, top: ev.clientY, bottom: ev.clientY });
      });
    }

    var pane = root.ReaderPanels && root.ReaderPanels.tabPanel("right", "notes");
    if (pane) {
      pane.addEventListener("click", function (ev) {
        var rt = ev.target.closest(".rd-note-retry");
        if (rt) { retrySave(rt.dataset.id); return; }
        var btn = ev.target.closest(".rd-note");
        if (!btn) return;
        goTo(btn.dataset.id);
        // 좁은 화면에서는 서랍이 본문을 가린다.
        if (root.matchMedia && root.matchMedia("(max-width: 767px)").matches) root.ReaderPanels.close("right");
      });
    }

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
    edit: openEditor,
    sanitizeRecords: sanitizeRecords,
    placeRecords: placeRecords,
    colors: COLORS,
    colorName: function (c) { return COLOR_NAMES[c] || c; },
  };
})(typeof window !== "undefined" ? window : globalThis);
