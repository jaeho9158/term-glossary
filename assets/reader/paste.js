// 첫 화면의 글 붙여넣기 분석: 글 → 용어 찾기 → 강조된 글 + 용어 목록. 옛 뷰어(viewer.js)의 같은 흐름을 옮겼다.
//
// 용어 데이터·매칭·뜻 청크는 ReaderTerms.analyze 가 맡고(PDF 와 같은 파일·같은 함수), 여기서는 화면만 그린다.
// 강조 HTML 은 term-match.js 의 buildHighlightedHtml / escapeHtml 만 거친다. 사용자가 붙여넣은 글은 innerHTML 에 날것으로 넣지 않는다.
// 초안은 ViewerStorage.saveText / loadText 로 저장·복원한다(옛 뷰어와 같은 키).
//
// 숨긴 용어: PDF 리더와 같은 목록(ViewerStorage 가 아니라 terms-layer.js 가 쓰는 localStorage "viewerHiddenTermSlugs")을
// ReaderTerms.hiddenSlugs / hide / restoreAll 로 함께 쓴다. 카드의 "숨기기"와 "숨긴 용어 다시 보기"가 이 화면에도 있다.
(function (root) {
  "use strict";
  if (typeof document === "undefined") return;

  var DEBOUNCE = typeof AUTO_ANALYSIS_DEBOUNCE_MS !== "undefined" ? AUTO_ANALYSIS_DEBOUNCE_MS : 800;
  var SAVE_DEBOUNCE = 500;
  var FLASH_MS = typeof MARK_FLASH_MS !== "undefined" ? MARK_FLASH_MS : 1200;
  var store = root.ViewerStorage || null;

  function $(id) { return document.getElementById(id); }
  var textarea = $("rd-paste-text");
  if (!textarea) return;
  var findBtn = $("rd-paste-find");
  var editBtn = $("rd-paste-edit");
  var statusEl = $("rd-paste-status");
  var resultBox = $("rd-paste-result");
  var rendered = $("rd-paste-rendered");
  var listEl = $("rd-paste-list");
  var moreBtn = $("rd-paste-more");
  var countEl = $("rd-paste-count");
  var filterInput = $("rd-paste-filter");
  var catSelect = $("rd-paste-category");
  var engCheck = $("rd-paste-english");
  var quizLink = $("rd-paste-quiz");
  var showHiddenBtn = $("rd-paste-show-hidden");

  var matches = [];
  var shown = 0;
  var token = 0;
  var timer = null;

  function pageSize() { return typeof TERM_CARD_PAGE_SIZE !== "undefined" ? TERM_CARD_PAGE_SIZE : 8; }

  // ---------- 안내 한 줄 ----------
  function hideStatus() { statusEl.hidden = true; statusEl.textContent = ""; }
  function showStatus(message, actions) {
    statusEl.textContent = "";
    statusEl.append(message);
    (actions || []).forEach(function (a) {
      statusEl.append(" · ");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "term-filter-link";
      b.textContent = a.label;
      b.addEventListener("click", a.onClick);
      statusEl.append(b);
    });
    statusEl.hidden = false;
  }

  // ---------- 화면 ----------
  function showText(on) {
    textarea.hidden = !on;
    rendered.hidden = on;
    editBtn.hidden = on;
  }

  function reset() {
    closePopover();
    matches = [];
    resultBox.hidden = true;
    rendered.textContent = "";
    listEl.textContent = "";
    countEl.textContent = "";
    moreBtn.hidden = true;
    quizLink.hidden = true;
    filterInput.value = "";
    filterInput.disabled = true;
    catSelect.innerHTML = '<option value="">전체 분야</option>';
    engCheck.checked = false;
    showText(true);
  }

  function hiddenSet() {
    return new Set(root.ReaderTerms && root.ReaderTerms.hiddenSlugs ? root.ReaderTerms.hiddenSlugs() : []);
  }
  function visibleMatches() { var h = hiddenSet(); return matches.filter(function (m) { return !h.has(m.slug); }); }

  function marked() { return visibleMatches().filter(function (m) { return !m.distant; }); }

  function renderText(text) {
    closePopover();
    var vis = marked();
    // 글자는 모두 escapeHtml 을 거친 HTML 로만 들어간다(강조 표시 말고는 사용자 글에서 온 마크업이 없다).
    rendered.innerHTML = vis.length ? buildHighlightedHtml(text, vis) : escapeHtml(text);
    showText(false);
  }

  function filtered() {
    var q = (filterInput.value || "").trim().toLowerCase();
    var cat = catSelect.value;
    var eng = engCheck.checked;
    return visibleMatches().filter(function (m) {
      if (q && !(m.title_ko.toLowerCase().indexOf(q) >= 0 || (m.title_en || "").toLowerCase().indexOf(q) >= 0)) return false;
      if (cat && (m.categories || []).indexOf(cat) < 0) return false;
      if (eng && /[가-힣]/.test(m.title_ko)) return false;
      return true;
    });
  }

  function unitHTML(u) { return termCardHTML(u.match, u.basics); }

  function renderCategories() {
    var codes = new Set();
    visibleMatches().forEach(function (m) { var c = (m.categories || [])[0]; if (c) codes.add(c); });
    var prev = catSelect.value;
    var labels = typeof CATEGORY_LABELS !== "undefined" ? CATEGORY_LABELS : {};
    catSelect.innerHTML = '<option value="">전체 분야</option>' + Array.from(codes)
      .sort(function (a, b) { return (labels[a] || a).localeCompare(labels[b] || b); })
      .map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(labels[c] || c) + "</option>"; })
      .join("");
    if (codes.has(prev)) catSelect.value = prev;
  }

  function renderList() {
    var list = filtered();
    if (!list.length) {
      listEl.innerHTML = '<li class="term-list-empty">조건에 맞는 용어가 없습니다.</li>';
      moreBtn.hidden = true;
      return;
    }
    var fields = estimateDocumentFields(list);
    var grouped = groupMatchesByField(list, fields);
    var primary = buildCardUnits(grouped.primary);
    var others = buildCardUnits(grouped.others);
    var n = Math.min(shown, primary.length);
    var othersHtml = "";
    if (others.length) {
      var cnt = others.reduce(function (s, u) { return s + 1 + u.basics.length; }, 0);
      othersHtml = '<li class="term-others"><details class="term-others-details"><summary>다른 분야 (' + cnt + ")</summary>" +
        '<ul class="term-others-list">' + others.map(unitHTML).join("") + "</ul></details></li>";
    }
    listEl.innerHTML = primary.slice(0, n).map(unitHTML).join("") + (n >= primary.length ? othersHtml : "");
    if (n < primary.length) {
      var rest = primary.length - n;
      moreBtn.hidden = false;
      moreBtn.textContent = Math.min(pageSize(), rest) + "개 더 보기 (남은 " + rest + "개)";
    } else {
      moreBtn.hidden = true;
    }
  }

  var quizIndex = null;
  function updateQuizLink() {
    var go = function (index) {
      var slugs = visibleMatches()
        .filter(function (m) { return !m.distant && index[m.slug]; })
        .sort(function (a, b) { return (b.count || 0) - (a.count || 0); })
        .slice(0, 50)
        .map(function (m) { return m.slug; });
      if (slugs.length < 4) { quizLink.hidden = true; return; }
      quizLink.href = "quiz.html?slugs=" + slugs.map(encodeURIComponent).join(",");
      quizLink.hidden = false;
    };
    if (quizIndex) { go(quizIndex); return; }
    fetch("data/learn/slug-index.json")
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (d) { quizIndex = d || {}; go(quizIndex); });
  }

  function renderPanel() {
    resultBox.hidden = false;
    var vis = visibleMatches();
    var hiddenCount = matches.length - vis.length;
    countEl.textContent = vis.length ? "이 글에 나온 용어 (" + vis.length + "개)" : (matches.length ? "표시할 용어가 없습니다. 모두 숨긴 상태입니다." : "이 글에서 사전에 등록된 용어를 찾지 못했습니다.");
    filterInput.disabled = !vis.length;
    showHiddenBtn.hidden = hiddenCount === 0;
    showHiddenBtn.textContent = hiddenCount ? "숨긴 용어 " + hiddenCount + "개 다시 보기" : "";
    shown = pageSize();
    renderCategories();
    renderList();
    if (vis.length) updateQuizLink(); else quizLink.hidden = true;
  }

  // 숨김·복원 뒤 본문 강조와 목록을 다시 그린다.
  function refreshAfterHiddenChange() {
    if (!matches.length) return;
    if (!rendered.hidden) renderText(textarea.value);
    renderPanel();
  }

  // ---------- 분석 ----------
  // trigger: "typing"(디바운스된 입력) 이면 입력 중인 칸을 가리지 않도록 용어 목록만 갱신한다.
  async function analyze(trigger) {
    var text = textarea.value;
    if (!text.trim()) { token++; reset(); return; }
    if (!root.ReaderTerms || !root.ReaderTerms.analyze) { showStatus("용어 찾기를 불러오지 못했습니다. 새로고침 해주세요."); return; }
    var mine = ++token;
    findBtn.disabled = true;
    // 용어 데이터를 처음 받는 중이면 그렇게 알린다.
    var loading = !(root.ReaderTerms.indexReady && root.ReaderTerms.indexReady());
    findBtn.textContent = loading ? "용어 데이터 불러오는 중…" : "찾는 중...";
    if (loading) {
      showStatus("용어 데이터 불러오는 중…");
    }
    try {
      var res = await root.ReaderTerms.analyze(text);
      if (loading && mine === token && statusEl.textContent === "용어 데이터 불러오는 중…") hideStatus();
      // 기다리는 사이 글이 바뀌었으면(더 최근 분석이 있거나 비웠으면) 이 결과는 옛 글 기준이다.
      if (mine !== token || text !== textarea.value) return;
      matches = res;
      if (trigger === "typing" && document.activeElement === textarea) resultBox.hidden = false;
      else renderText(text);
      renderPanel();
      // 읽은 기록은 "용어 찾기" 누름·붙여넣기로 시작한 분석만 남긴다(입력 중 자동 분석·초안 복원은 제외).
      if (root.ReaderLog) root.ReaderLog.pasteAnalyzed(text, matches.length, { log: trigger === "click" || trigger === "paste" });
    } catch (err) {
      console.error("[paste] 분석 실패", err);
      if (loading && mine === token && statusEl.textContent === "용어 데이터 불러오는 중…") hideStatus();
      if (mine !== token) return;
      countEl.textContent = "용어 데이터를 불러오지 못했습니다. 새로고침 해주세요.";
      resultBox.hidden = false;
      listEl.textContent = "";
    } finally {
      if (mine === token) {
        findBtn.disabled = textarea.value.trim().length === 0;
        findBtn.textContent = "용어 찾기";
      }
    }
  }

  function schedule(opts) {
    clearTimeout(timer);
    if (!textarea.value.trim()) { token++; reset(); hideStatus(); return; }
    if (opts && opts.immediate) { analyze(opts.trigger || "now"); return; }
    timer = setTimeout(function () { analyze("typing"); }, DEBOUNCE);
  }

  // ---------- 본문 표시를 눌렀을 때의 뜻 풀이 ----------
  var pop = null;
  var popAnchor = null;
  function byslug(slug) { return matches.find(function (m) { return m.slug === slug; }) || null; }

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.className = "dict-popover";
    pop.setAttribute("role", "dialog");
    pop.hidden = true;
    pop.addEventListener("click", function (e) {
      if (e.target.closest(".dict-popover-close")) { closePopover(); return; }
      e.stopPropagation();
    });
    document.body.appendChild(pop);
    return pop;
  }
  function closePopover() {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    pop.innerHTML = "";
    if (popAnchor) popAnchor.classList.remove("dict-mark-active");
    popAnchor = null;
  }
  function placePop(mark) {
    var sheet = root.matchMedia && root.matchMedia("(max-width: 480px)").matches;
    pop.classList.toggle("dict-popover-sheet", !!sheet);
    if (sheet) { pop.style.left = ""; pop.style.top = ""; return; }
    var r = mark.getBoundingClientRect();
    var p = pop.getBoundingClientRect();
    var margin = 8;
    var left = Math.max(margin, Math.min(r.left, root.innerWidth - p.width - margin));
    var top = r.bottom + 6;
    if (top + p.height > root.innerHeight - margin) {
      var above = r.top - p.height - 6;
      top = above >= margin ? above : Math.max(margin, root.innerHeight - p.height - margin);
    }
    pop.style.left = Math.round(left) + "px";
    pop.style.top = Math.round(top) + "px";
  }
  function openPopover(mark) {
    var m = byslug(mark.dataset.slug);
    if (!m) return;
    var covered = (mark.dataset.covers || "").split(/\s+/).filter(Boolean).map(byslug).filter(Boolean);
    closePopover();
    var el = ensurePop();
    var basics = (m.basics || []).map(byslug).filter(Boolean);
    el.setAttribute("aria-label", (m.title_ko || m.slug) + " 뜻 풀이");
    el.innerHTML = popoverHTML(m, covered, { count: m.count, basics: basics });
    el.hidden = false;
    popAnchor = mark;
    mark.classList.add("dict-mark-active");
    placePop(mark);
  }

  function flash(el) {
    el.classList.add("mark-flash");
    setTimeout(function () { el.classList.remove("mark-flash"); }, FLASH_MS);
  }
  function scrollToMark(slug) {
    var mark = rendered.querySelector('[data-slug="' + slug + '"]') || rendered.querySelector('[data-covers~="' + slug + '"]');
    if (!mark) return;
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
    flash(mark);
  }

  // ---------- 초안 저장·복원 ----------
  var saveTimer = null;
  var saveWarned = false;
  function bindDraft() {
    if (!store) return;
    textarea.addEventListener("input", function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        var res = store.saveText(textarea.value);
        if (res && !res.ok && res.reason !== "empty" && !saveWarned) {
          saveWarned = true;
          showStatus(res.reason === "too-large"
            ? "글이 너무 길어(200KB 초과) 자동 저장하지 않습니다. 새로고침하면 사라집니다."
            : "자동 저장을 하지 못했습니다. 새로고침하면 입력한 글이 사라질 수 있습니다.");
        }
      }, SAVE_DEBOUNCE);
    });
  }
  function restoreDraft() {
    if (!store) return;
    var rec = store.loadText();
    if (!rec || textarea.value.trim()) return;
    textarea.value = rec.text;
    findBtn.disabled = rec.text.trim().length === 0;
    schedule({ immediate: true, trigger: "restore" });
    showStatus("이전에 작성하던 텍스트를 복원했습니다", [{
      label: "지우기",
      onClick: function () {
        textarea.value = "";
        findBtn.disabled = true;
        store.clearText();
        hideStatus();
        schedule();
        textarea.focus();
      },
    }]);
  }

  // ---------- 연결 ----------
  textarea.addEventListener("input", function () {
    findBtn.disabled = textarea.value.trim().length === 0;
    schedule();
  });
  // paste 시점에는 value 가 아직 바뀌기 전이라 한 틱 미룬다.
  textarea.addEventListener("paste", function () { setTimeout(function () { schedule({ immediate: true, trigger: "paste" }); }, 0); });
  findBtn.addEventListener("click", function () {
    clearTimeout(timer);
    hideStatus();
    analyze("click");
  });
  editBtn.addEventListener("click", function () {
    closePopover();
    showText(true);
    textarea.focus();
  });

  rendered.addEventListener("click", function (e) {
    var mark = e.target.closest && e.target.closest(".dict-mark");
    if (!mark) return;
    e.preventDefault();
    e.stopPropagation();
    openPopover(mark);
  });
  document.addEventListener("click", function (e) {
    if (pop && !pop.hidden && !(e.target.closest && e.target.closest(".dict-popover"))) closePopover();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePopover(); });
  root.addEventListener("scroll", closePopover, true);
  root.addEventListener("resize", closePopover);

  listEl.addEventListener("click", function (e) {
    var hideBtn = e.target.closest(".term-card-hide-btn");
    if (hideBtn) {
      if (root.ReaderTerms && root.ReaderTerms.hide) {
        root.ReaderTerms.hide(hideBtn.dataset.hideSlug, true);
        refreshAfterHiddenChange();
      }
      return;
    }
    if (e.target.closest(".term-card-detail")) return;
    var card = e.target.closest(".term-card");
    if (!card) return;
    scrollToMark(card.dataset.slug);
  });
  showHiddenBtn.addEventListener("click", function () {
    if (root.ReaderTerms && root.ReaderTerms.restoreAll) root.ReaderTerms.restoreAll();
    refreshAfterHiddenChange();
  });
  moreBtn.addEventListener("click", function () { shown += pageSize(); renderList(); });
  filterInput.addEventListener("input", function () { shown = pageSize(); renderList(); });
  catSelect.addEventListener("change", function () { shown = pageSize(); renderList(); });
  engCheck.addEventListener("change", function () { shown = pageSize(); renderList(); });

  bindDraft();
  restoreDraft();

  root.ReaderPaste = { analyze: function () { return analyze("now"); }, matches: function () { return matches; } };
})(typeof window !== "undefined" ? window : globalThis);
