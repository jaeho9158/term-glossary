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
  function sanitizeRecords(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (r) {
      return r !== null && typeof r === "object" && !Array.isArray(r) && Number.isInteger(r.page) && r.page > 0;
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
    module.exports = { sanitizeRecords: sanitizeRecords, placeRecords: placeRecords };
  }
  if (typeof document === "undefined") {
    root.ReaderAnnotations = { sanitizeRecords: sanitizeRecords, placeRecords: placeRecords };
    return;
  }

  // ---------- 상태 ----------
  var S = {
    token: 0,
    docHash: null,
    title: "",
    texts: [], // 쪽 글(0부터)
    items: [], // [{record, start, end, status}] — 이 문서의 모든 기록
    unsavedSeq: 0,
  };
  var editing = null; // {id, dirtyBase}
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
    S.items.forEach(function (item) {
      if (item.record.page !== page || item.status === "lost") return;
      var sn = drawRange(item);
      var rects = G.rangeRects(data.charBoxes, sn.start, sn.end);
      if (!rects.length) return;
      var color = colorOf(item.record);
      entries.push({ id: item.record.id, rects: rects, refine: true, data: { color: color }, className: "rd-hl-" + color });
      if (item.record.note) {
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
    page.textContent = "p." + rec.page + (rec.unsaved ? " · 저장되지 않음" : "");
    var quote = document.createElement("span");
    quote.className = "rd-note-quote";
    var q = String(rec.quoteText || "").replace(/\s+/g, " ").trim();
    quote.textContent = q.length > QUOTE_PREVIEW ? q.slice(0, QUOTE_PREVIEW) + "…" : q;
    body.appendChild(page);
    body.appendChild(quote);
    if (rec.note) {
      var memo = document.createElement("span");
      memo.className = "rd-note-memo";
      memo.textContent = rec.note;
      body.appendChild(memo);
    }
    btn.appendChild(dot);
    btn.appendChild(body);
    li.appendChild(btn);
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

  // 쪽마다 한 건씩 만든다. 같은 쪽에서 겹치는 기존 형광펜은 한 범위로 합친다(합친 것을 먼저 저장하고, 성공하면 옛 것을 지운다).
  // 합쳐지는 옛 메모는 잃지 않도록 새 메모 앞에 이어 붙인다.
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

      var cand = { startOffset: start, endOffset: end, createdAt: new Date().toISOString(), id: "__new__" };
      var existing = S.items
        .filter(function (it) { return it.record.page === r.page && it.status !== "lost"; })
        .map(function (it) { return { startOffset: it.start, endOffset: it.end, createdAt: it.record.createdAt, id: it.record.id, item: it }; });
      var group = TM.mergeOverlappingRanges(existing.concat([cand])).filter(function (g) { return g.records.indexOf(cand) >= 0; })[0];
      var olds = group ? group.records.filter(function (x) { return x !== cand; }).map(function (x) { return x.item; }) : [];
      if (group) { start = group.startOffset; end = group.endOffset; }
      var quote = pt.slice(start, end);
      var mergedNote = olds.map(function (o) { return o.record.note || ""; }).concat([note || ""]).filter(Boolean).join("\n");
      var payload = { page: r.page, startOffset: start, endOffset: end, quoteText: quote, color: col, note: mergedNote };

      var rec = null;
      if (store) {
        try { rec = await store.createAnnotation(docHash, S.title, payload); } catch (err) { console.error("[reader] createAnnotation", err); rec = null; }
      }
      if (tok !== S.token) return out;
      if (!rec) {
        // 저장에 실패해도 화면의 표시는 문서를 닫을 때까지 유지한다.
        failedSaves++;
        S.unsavedSeq++;
        rec = { id: "unsaved-" + S.unsavedSeq, page: r.page, startOffset: start, endOffset: end, quoteText: quote, color: col, note: mergedNote, createdAt: cand.createdAt, unsaved: true };
      }
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
      var item = { record: rec, start: start, end: end, status: "offset" };
      S.items.push(item);
      out.push(rec);
      renderPanel();
      redrawPage(r.page);
    }
    if (failedSaves) notify("저장 공간이 가득 찼거나 차단되어 하이라이트를 저장하지 못했습니다. 이 화면에는 표시되지만 문서를 닫으면 사라집니다.");
    if (failedDeletes) notify("겹친 하이라이트 " + failedDeletes + "개를 정리하지 못했습니다. 다시 열면 합쳐서 보입니다.");
    return out;
  }

  // ---------- 고치기 ----------
  // 저장 계층에 색만 바꾸는 함수가 없다(공개 함수는 그대로 쓴다는 약속). 같은 내용을 새 색으로 만든 뒤 옛 것을 지운다.
  // 그래서 색을 바꾸면 id 가 바뀐다. 새 기록을 돌려준다.
  async function setColor(id, color) {
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
          page: old.page, startOffset: old.startOffset, endOffset: old.endOffset, quoteText: old.quoteText, color: col, note: old.note || "",
        });
      } catch (err) { console.error("[reader] setColor/create", err); }
    }
    if (tok !== S.token) return null;
    if (!rec) { notify("색을 바꾸지 못했습니다. 저장 공간이 가득 찼거나 차단된 상태일 수 있습니다."); return old; }
    var ok = false;
    try { ok = (await store.deleteAnnotation(docHash, old.id)) !== false; } catch (err2) { console.error("[reader] setColor/delete", err2); }
    if (tok !== S.token) return null;
    if (!ok) notify("이전 색의 하이라이트를 정리하지 못했습니다. 다시 열면 겹쳐 보일 수 있습니다.");
    else dropItem(item);
    S.items.push({ record: rec, start: item.start, end: item.end, status: item.status });
    renderPanel();
    redrawPage(rec.page);
    return rec;
  }

  async function setNote(id, note) {
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
    if (!ok) notify("메모를 저장하지 못했습니다. 화면에는 반영했지만 다음에 열면 사라질 수 있습니다.");
    item.record.note = text;
    renderPanel();
    redrawPage(item.record.page);
    return ok;
  }

  async function remove(id) {
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
    if (!ok) notify("하이라이트를 지우지 못했습니다. 다음에 열면 다시 나타날 수 있습니다.");
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

  async function goTo(id) {
    var item = findItem(id);
    if (!item) return;
    var page = item.record.page;
    if (item.status === "lost") { D().goToPage(page); return; }
    var tok = S.token;
    var rects = [];
    try { rects = await itemRects(item); } catch (err) { console.error("[reader] goTo", err); }
    if (tok !== S.token) return;
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
    editing = { id: item.record.id, base: item.record.note || "" };
    $("rd-annopop-note").value = item.record.note || "";
    syncPopColors(item.record);
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
    if (save && e) setNote(e.id, val);
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
    document.addEventListener("pointerdown", function (ev) {
      var p = pop();
      if (!p || p.hidden) return;
      if (p.contains(ev.target)) return;
      closeEditor({ save: true });
    }, true);
    var sc = $("rd-scroll");
    if (sc) sc.addEventListener("scroll", function () { closeEditor({ save: true }); }, { passive: true });
  }

  // ---------- 연결 ----------
  function init() {
    if (ready) return;
    ready = true;
    bindEditor();

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
    edit: openEditor,
    sanitizeRecords: sanitizeRecords,
    placeRecords: placeRecords,
    colors: COLORS,
    colorName: function (c) { return COLOR_NAMES[c] || c; },
  };
})(typeof window !== "undefined" ? window : globalThis);
