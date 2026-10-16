// 용어 밑줄·카드·용어 패널.
//
// 문서를 열면 쪽 글 전체를 옛 뷰어와 똑같이 이어 붙여 한 번만 용어 매칭을 돌리고(분야 추정·동음이의어 판정이
// 문서 단위이기 때문), splitMatchesByPage 로 쪽마다 나눈다. 쪽 글과 글자 상자가 준비되면 그 쪽의 밑줄 사각형만 계산해
// ReaderOverlay 의 "term" 층에 넘긴다. 데이터 파일·저장 키·매칭 함수는 옛 뷰어와 같다
// (viewer-index.json, viewer-defs/<버킷>.json, localStorage "viewerHiddenTermSlugs", data/learn/slug-index.json).
//
// 순수 부분(Node 테스트 대상): firstPerPage, planPageSpans, wordEdges, refineFlags, resolveAssetVersion.
// 브라우저 부분: window.ReaderTerms { init, setVisible, isVisible, hide, restoreAll, lookup, stats }.
(function (root) {
  "use strict";

  var TM = root;
  var G = root.ReaderGeometry;
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    TM = require("../term-match.js");
  }

  // ---------- 순수 ----------

  // 쪽 하나의 [{slug, start, end}] 에서 용어(slug)마다 가장 앞의 등장 하나만. 결과는 시작 위치 순.
  function firstPerPage(matches) {
    var best = new Map();
    (matches || []).forEach(function (m) {
      if (!m || m.slug === undefined || !(m.end > m.start)) return;
      var cur = best.get(m.slug);
      if (!cur || m.start < cur.start) best.set(m.slug, m);
    });
    return Array.from(best.values()).sort(function (a, b) { return a.start - b.start || a.end - b.end; });
  }

  // 한 쪽의 매치(splitMatchesByPage 의 쪽 기준 사본)를 겹침 정리(긴 것 우선, computeKeptSpans) 후 용어마다 처음 한 곳만.
  // 반환 항목은 {slug, start, end, covered}. covered 는 같은 자리에서 밀려난 용어들의 slug(자기 자신 포함).
  function planPageSpans(pageText, matches) {
    var kept = TM.computeKeptSpans(pageText, matches || []);
    return firstPerPage(kept.map(function (k) {
      return { slug: k.slug, start: k.firstStart, end: k.firstStart + k.firstLength, covered: k.covered };
    }));
  }

  var WORD_CH = /[0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ぀-ヿ㐀-鿿]/;
  // [start, end) 의 양 끝이 낱말 경계(앞뒤가 글자·숫자가 아님)인지. 경계가 아닌 쪽은 잉크 보정을 하지 않는다.
  function wordEdges(text, start, end) {
    var t = String(text || "");
    return {
      left: start <= 0 || !WORD_CH.test(t.charAt(start - 1)),
      right: end >= t.length || !WORD_CH.test(t.charAt(end)),
    };
  }

  // 겹침층 entry 의 보정 표지. 낱말 경계인 가장자리만 보정한다.
  // refine(불리언)은 두 가장자리가 모두 경계일 때만 참이다(불리언만 아는 겹침층이 한쪽 경계 용어의 반대쪽까지 보정하지 않도록).
  // 가장자리별 표지를 아는 겹침층은 refineLeft / refineRight 로 정확히 그 가장자리만 보정한다.
  function refineFlags(text, start, end) {
    var e = wordEdges(text, start, end);
    return { refine: e.left && e.right, refineLeft: e.left, refineRight: e.right };
  }

  // 틀린 뜻으로 보이기 쉬운 두 경우를 걸러 낸다(쪽 번호 없는 전체 글 기준 위치).
  //  (a) 주소(https://…, www.…, doi.org/…) 안에서 잡힌 용어
  //  (b) 같은 자리의 더 긴 다른 용어 안에 통째로 들어간 용어("fine needle aspiration" 속 "aspiration")
  // 등장 위치(occurrences)를 걸러 내고, 남은 등장이 없는 용어는 목록에서 뺀다. 입력은 바꾸지 않는다.
  var URL_TOKEN = /(?:https?:\/\/|www\.|doi\.org\/)\S*/gi;
  function occurrencesOf(m) {
    if (m.occurrences && m.occurrences.length) return m.occurrences;
    return m.firstStart >= 0 ? [{ start: m.firstStart, length: m.firstLength }] : [];
  }
  // "fac- tor"처럼 줄이 바뀌며 생긴 하이픈+공백을 지운 글과, 그 글의 각 글자가 원문 어디인지(map)를 돌려준다.
  // 영문 글자 사이의 "-" + 공백 뒤가 소문자일 때만 지운다("COVID- 19", "Ca- ions" 같은 건 그대로 둔다).
  var WRAP_HYPHEN = /([A-Za-z])-(?:[ \t]+|[ \t]*\n[ \t]*)(?=[a-z])/g;
  function fuseWrapHyphens(str) {
    var out = [];
    var map = [];
    var last = 0;
    var m;
    WRAP_HYPHEN.lastIndex = 0;
    while ((m = WRAP_HYPHEN.exec(str)) !== null) {
      var keepEnd = m.index + 1; // 영문자까지는 남긴다
      for (var i = last; i < keepEnd; i++) { out.push(str.charAt(i)); map.push(i); }
      last = m.index + m[0].length;
    }
    for (var j = last; j < str.length; j++) { out.push(str.charAt(j)); map.push(j); }
    return { text: out.join(""), map: map };
  }
  function pruneMatches(matches, text) {
    var list = Array.isArray(matches) ? matches : [];
    var urls = [];
    var str = String(text || "");
    var um;
    URL_TOKEN.lastIndex = 0;
    while ((um = URL_TOKEN.exec(str)) !== null) urls.push([um.index, um.index + um[0].length]);

    // (b) 시작 순(같으면 긴 것 먼저)으로 훑으며, 아직 끝나지 않은 다른 용어의 등장이 통째로 감싸면 버린다.
    var all = [];
    list.forEach(function (m, mi) {
      occurrencesOf(m).forEach(function (o) { all.push({ mi: mi, slug: m.slug, start: o.start, end: o.start + o.length, len: o.length }); });
    });
    // 영문 표제가 본문에 그대로 있으면 그 구간은 덮개로만 쓴다(표시는 만들지 않음): 안에 든 다른 용어의 등장은 뺀다.
    // 줄바꿈 하이픈("fac- tor", "sin- gle")은 이어 붙인 글에서 찾고, 찾은 자리는 원문 위치로 되돌린다.
    var fused = fuseWrapHyphens(str);
    var lower = fused.text.toLowerCase();
    var covers = [];
    list.forEach(function (m) {
      var en = String(m.title_en || "").replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
      if (!en || (en.split(/\s+/).length < 2 && en.length < 8)) return;
      for (var at = lower.indexOf(en); at >= 0; at = lower.indexOf(en, at + en.length)) {
        covers.push({ slug: m.slug, start: fused.map[at], end: fused.map[at + en.length - 1] + 1 });
      }
    });
    all.sort(function (a, b) { return a.start - b.start || b.len - a.len; });
    var drop = new Set();
    var active = [];
    all.forEach(function (o) {
      active = active.filter(function (c) { return c.end > o.start; });
      var inUrl = urls.some(function (u) { return o.start >= u[0] && o.end <= u[1]; });
      var inLonger = active.some(function (c) { return c.slug !== o.slug && c.end >= o.end && c.len > o.len; });
      // 덮개는 등장보다 긴 것만 인정한다: 같은 자리를 서로 다른 두 용어가 영문 표제로 차지하면(Presence ×2)
      // 서로를 덮어 둘 다 사라지던 문제 — 그 경우의 선택은 TM.applySameSpanRule 이 한다.
      var inCover = covers.some(function (c) { return c.slug !== o.slug && o.start >= c.start && o.end <= c.end && c.end - c.start > o.len; });
      if (inUrl || inLonger || inCover) drop.add(o.mi + ":" + o.start);
      active.push(o);
    });
    var out = [];
    list.forEach(function (m, mi) {
      var occ = occurrencesOf(m);
      var keep = occ.filter(function (o) { return !drop.has(mi + ":" + o.start); });
      if (keep.length === occ.length) { out.push(m); return; }
      if (!keep.length) return;
      var copy = Object.assign({}, m, { occurrences: keep, firstStart: keep[0].start, firstLength: keep[0].length });
      if (typeof m.count === "number") copy.count = keep.length;
      out.push(copy);
    });
    return out;
  }

  // 자산 버전(?v=). 이 스크립트의 src 에 v 가 있으면 그것, 없으면 term-match.js 태그의 src, 없으면 "".
  // srcs 는 우선순위 순서의 src 문자열 목록.
  function resolveAssetVersion(srcs) {
    var list = srcs || [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      var m = /[?&]v=([^&#]+)/.exec(String(list[i]));
      if (m) return m[1];
    }
    return "";
  }

  if (typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = {
        firstPerPage: firstPerPage, planPageSpans: planPageSpans, wordEdges: wordEdges,
        refineFlags: refineFlags, resolveAssetVersion: resolveAssetVersion, pruneMatches: pruneMatches,
      };
    }
    return;
  }

  // ---------- 브라우저 ----------

  var HIDDEN_KEY = "viewerHiddenTermSlugs";
  var VISIBLE_KEY = "rd-terms-visible";
  var OPEN_DELAY = 300;
  var CLOSE_DELAY = 200;
  var NARROW = "(max-width: 767px)";
  var LOOKUP_MAX = 10;
  var ASSET_VERSION = (function () {
    var own = document.currentScript && document.currentScript.src;
    var tm = document.querySelector('script[src*="term-match.js"]');
    return resolveAssetVersion([own, tm && tm.src]);
  })();

  function $(id) { return document.getElementById(id); }
  function rd() { return $("reader"); }
  function D() { return root.ReaderDoc; }
  function TXM() { return root.ReaderTextMap; }
  function OV() { return root.ReaderOverlay; }
  function now() { return (root.performance && performance.now) ? performance.now() : Date.now(); }
  function notify(msg) { if (D() && D().notify) D().notify(msg); }
  function isNarrow() { return !!(root.matchMedia && root.matchMedia(NARROW).matches); }
  function joiner() { return typeof PDF_PAGE_JOINER !== "undefined" ? PDF_PAGE_JOINER : "\n"; }
  function pageSize() { return typeof TERM_CARD_PAGE_SIZE !== "undefined" ? TERM_CARD_PAGE_SIZE : 8; }

  // ---------- 저장(옛 뷰어와 같은 키) ----------
  function loadHidden() {
    try {
      var v = JSON.parse(root.localStorage.getItem(HIDDEN_KEY) || "[]");
      return new Set(Array.isArray(v) ? v : []);
    } catch (e) { return new Set(); }
  }
  function saveHidden(set) {
    try { root.localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(set))); } catch (e) { /* 이번 세션에서만 숨김 */ }
  }
  function loadVisible() {
    try { return root.localStorage.getItem(VISIBLE_KEY) !== "0"; } catch (e) { return true; }
  }
  function saveVisible(on) {
    try { root.localStorage.setItem(VISIBLE_KEY, on ? "1" : "0"); } catch (e) { /* 기억만 못 할 뿐 */ }
  }

  var hidden = loadHidden();
  var visible = true;

  // 문서마다 새로 만드는 상태
  var S = null;
  var gen = 0;
  function freshState() {
    return {
      gen: ++gen,
      ready: false,
      failed: false,
      pageTexts: null,
      offsets: null,
      joined: "",
      matches: [],
      matchBySlug: new Map(),
      byPage: new Map(), // 표시 대상(분야 거리 아님) 쪽 기준 매치
      termsByPage: new Map(), // 패널의 "이 쪽의 용어"
      entries: new Map(), // page -> 겹침층 entry[] (hover 표시 전 원본)
      rendered: new Set(),
      computing: new Map(),
      curPage: 1,
      epoch: 0, // 다시 그리기(숨김·복원)마다 올린다. 진행 중이던 계산 결과를 버리는 데 쓴다
      skipped: new Set(), // 쪽 글 불일치로 밑줄을 건너뛴 쪽
      warned: false,
      pumpErrLogged: false,
      shown: pageSize(),
      focusSlug: null,
      stats: { indexMs: 0, textMs: 0, matchMs: 0, defsMs: 0, pages: 0, matches: 0, rectMs: [], pagesSkipped: 0 },
    };
  }

  // ---------- 용어 데이터(옛 뷰어 loadTerms / loadDefinitions 와 같은 파일·순서) ----------
  var cachedTerms = null;
  var exactIndex = null;
  var termsPromise = null;
  function ensureIndex() {
    if (cachedTerms) return Promise.resolve(cachedTerms);
    if (!termsPromise) {
      termsPromise = fetch(TM.withAssetVersion("viewer-index.json", ASSET_VERSION)).then(function (res) {
        if (!res.ok) throw new Error("용어 데이터 로드 실패 (HTTP " + res.status + ")");
        return res.json();
      }).then(function (json) {
        cachedTerms = TM.decodeViewerIndex(json);
        exactIndex = TM.buildExactIndex(cachedTerms);
        return cachedTerms;
      }).catch(function (err) { termsPromise = null; throw err; });
    }
    return termsPromise;
  }

  var definitionCache = new Map();
  var senseCache = new Map();
  var outsideSlugs = new Set();
  var fieldGroupCache = new Map(); // 분야 관문용: 말뭉치에서 실제 쓰인 분야군 코드
  var loadedBuckets = new Set();
  var failedBuckets = new Set(); // 받아 오지 못한 정의 청크(다시 시도 대상)
  var defWarned = false;
  function fetchBucket(bucket) {
    return fetch(TM.withAssetVersion("viewer-defs/" + String(bucket).padStart(3, "0") + ".json", ASSET_VERSION)).then(function (res) {
      if (!res.ok) throw new Error("정의 청크 " + bucket + " HTTP " + res.status);
      return res.json();
    }).then(function (json) {
      TM.decodeDefChunk(json).forEach(function (entry, slug) {
        definitionCache.set(slug, entry.definition);
        if (entry.sense.length) senseCache.set(slug, entry.sense);
        if (entry.outside) outsideSlugs.add(slug);
        if (typeof entry.fieldGroups === "string") fieldGroupCache.set(slug, entry.fieldGroups);
      });
      failedBuckets.delete(bucket);
    }).catch(function (err) {
      failedBuckets.add(bucket);
      console.error("[terms] 정의 청크", err);
      if (!defWarned) { defWarned = true; notify("용어 뜻을 일부 불러오지 못했습니다. 카드의 '다시 시도'를 눌러 보세요."); }
    });
  }
  function loadDefinitions(slugs) {
    var needed = new Set();
    slugs.forEach(function (slug) {
      var b = TM.defBucket(slug);
      if (!loadedBuckets.has(b)) needed.add(b);
    });
    return Promise.all(Array.from(needed).map(function (bucket) {
      loadedBuckets.add(bucket); // 실패해도 같은 404를 저절로 되풀이하지 않는다(다시 시도는 사용자가)
      return fetchBucket(bucket);
    }));
  }
  function defFailed(slug) { return failedBuckets.has(TM.defBucket(slug)) && !definitionCache.has(slug); }
  // 뜻을 받지 못한 카드에 안내와 '다시 시도' 링크를 붙인다.
  function decorateFailed(container) {
    if (!container || !failedBuckets.size) return;
    container.querySelectorAll(".term-card").forEach(function (li) {
      var slug = li.dataset.slug;
      if (!slug || !defFailed(slug) || li.querySelector(":scope > .rd-def-failed")) return;
      var p = document.createElement("p");
      p.className = "rd-def-failed";
      p.appendChild(document.createTextNode("뜻을 불러오지 못했습니다 "));
      var a = document.createElement("a");
      a.href = "#";
      a.className = "rd-def-retry";
      a.dataset.slug = slug;
      a.textContent = "다시 시도";
      p.appendChild(a);
      li.insertBefore(p, li.querySelector(":scope > .term-card-detail"));
    });
  }
  // 카드 이름을 초점이 가는 단추로 만든다(키보드·보조기기로도 카드를 누를 수 있게). 단추를 누르면 li 의 누름 처리기가 그대로 받는다.
  // 이 문서에 없는 용어(사전 찾기 결과)는 뜻을 펼치고 접는 단추라 aria-expanded 를 여기에 둔다.
  function decorateCards(container) {
    if (!container) return;
    container.querySelectorAll(".term-card").forEach(function (li) {
      var name = li.querySelector(":scope > .term-card-name");
      if (!name || name.querySelector(":scope > .rd-card-go")) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rd-card-go";
      while (name.firstChild) btn.appendChild(name.firstChild);
      var slug = li.dataset.slug;
      var inLookup = !!li.closest("#rd-lookup");
      if (inLookup && !(S && S.matchBySlug.get(slug))) {
        btn.setAttribute("aria-expanded", li.classList.contains("is-expanded") ? "true" : "false");
        btn.title = "뜻 전체 펼치기·접기";
      } else if (inLookup) {
        btn.title = "이 문서의 용어 카드 보기";
      } else {
        btn.title = "본문에서 이 용어가 나온 곳으로 이동";
      }
      name.appendChild(btn);
    });
  }
  var retrying = new Map();
  function retryDefs(slug) {
    var bucket = TM.defBucket(slug);
    if (retrying.has(bucket)) return retrying.get(bucket);
    var pr = fetchBucket(bucket).then(function () {
      var fill = function (m) {
        if (TM.defBucket(m.slug) !== bucket) return;
        m.definition = definitionCache.get(m.slug) || m.definition || "";
        if (senseCache.has(m.slug)) m.sense = senseCache.get(m.slug);
        if (outsideSlugs.has(m.slug)) m.oaOutside = true;
        if (fieldGroupCache.has(m.slug)) m.fieldGroups = fieldGroupCache.get(m.slug);
      };
      if (S) S.matches.forEach(fill);
      if (lookupView) lookupView.res.forEach(fill);
      if (S && S.ready) renderAll();
      refillLookup();
      if (card && !card.hidden) closeCard(true);
    }).then(function () { retrying.delete(bucket); }, function () { retrying.delete(bucket); });
    retrying.set(bucket, pr);
    return pr;
  }
  function attachDefinitions(matches) {
    if (!matches.length) return Promise.resolve();
    return loadDefinitions(matches.map(function (m) { return m.slug; })).then(function () {
      matches.forEach(function (m) {
        m.definition = definitionCache.get(m.slug) || "";
        m.sense = senseCache.get(m.slug) || m.sense || [];
        if (outsideSlugs.has(m.slug)) m.oaOutside = true;
        if (fieldGroupCache.has(m.slug)) m.fieldGroups = fieldGroupCache.get(m.slug);
      });
    });
  }

  function idle(timeout) {
    return new Promise(function (resolve) {
      if (root.requestIdleCallback) root.requestIdleCallback(function () { resolve(); }, { timeout: timeout || 1500 });
      else setTimeout(resolve, 30);
    });
  }

  // ---------- 문서 전체 매칭(문서당 한 번) ----------
  // 확신 등급: 애매한 짧은 낱말은 기본으로 밑줄을 긋지 않는다(demotedBy "confidence"). "애매한 용어도 표시해요"를 켜면 긋는다.
  var showUncertain = false;
  function markable(m) { return (!m.distant || (showUncertain && m.demotedBy === "confidence")) && !hidden.has(m.slug); }

  function rebuildPageTables() {
    var vis = S.matches.filter(markable);
    S.byPage = TM.splitMatchesByPage(vis, S.offsets);
    S.termsByPage = TM.termsOnPage(vis, S.offsets);
  }

  async function runMatching(st) {
    var t0 = now();
    var terms = await ensureIndex();
    st.stats.indexMs = now() - t0;
    if (st.gen !== S.gen) return;
    t0 = now();
    var texts = await TXM().allPageTexts();
    st.stats.textMs = now() - t0;
    if (st.gen !== S.gen) return;
    await idle();
    if (st.gen !== S.gen) return;

    var joined = texts.join(joiner());
    st.pageTexts = texts;
    st.offsets = TM.buildPageOffsets(texts);
    st.joined = joined;
    t0 = now();
    var exact = TM.matchTermsWithIndex(joined, exactIndex);
    st.stats.matchMs = now() - t0;
    t0 = now();
    await attachDefinitions(exact);
    st.stats.defsMs = now() - t0;
    if (st.gen !== S.gen) return;
    // 규칙 1(문맥 뜻 판별)이 강등을 바꾸므로 정의 청크를 받은 뒤에 돌린다(옛 뷰어와 같은 순서).
    var sensed = TM.applySenseToMatches(exact, joined);
    st.topFieldGroups = (sensed && sensed.topFieldGroups) || [];
    st.matches = pruneMatches(sensed, joined);
    st.matchBySlug = new Map(st.matches.map(function (m) { return [m.slug, m]; }));
    st.stats.pages = texts.length;
    st.stats.matches = st.matches.length;
    rebuildPageTables();
    st.ready = true;
    renderAll();
    st.rendered.forEach(function (p) { queueDraw(p); });
    // 용어 찾기가 끝났다는 알림(분석 이벤트용). 개수만 싣는다.
    if (rd()) rd().dispatchEvent(new CustomEvent("reader:termsready", { detail: { count: st.matches.length } }));
  }

  // ---------- 쪽 밑줄 ----------
  // 쪽 글자 상자 계산(글꼴 측정)은 한 쪽에 수십 ms 걸릴 수 있어 스크롤 중에 몰아서 하지 않는다.
  // 한가할 때 한 쪽씩, 지금 보는 쪽에 가까운 것부터 처리한다.
  var drawQueue = new Set();
  var pumping = false;
  function queueDraw(page) {
    if (!S || !S.ready) return;
    drawQueue.add(page);
    pump();
  }
  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (drawQueue.size) {
        await idle(500);
        if (!S || !S.ready) { drawQueue.clear(); break; }
        var cur = D().currentPage();
        var best = null;
        drawQueue.forEach(function (p) { if (best === null || Math.abs(p - cur) < Math.abs(best - cur)) best = p; });
        drawQueue.delete(best);
        if (S.entries.has(best)) continue;
        try {
          await drawPage(best);
        } catch (err) {
          // 한 쪽이 실패해도 다음 쪽으로 넘어간다. 로그는 문서당 한 번만.
          if (S && !S.pumpErrLogged) { S.pumpErrLogged = true; console.error("[terms] 밑줄 계산 실패", err); }
        }
      }
    } finally { pumping = false; }
  }
  function pageEntries(page) {
    var pm = S.byPage.get(page);
    var text = S.pageTexts && S.pageTexts[page - 1];
    if (!pm || !pm.length || !text) return [];
    return planPageSpans(text, pm);
  }

  async function drawPage(page) {
    var st = S;
    if (!st || !st.ready) return;
    if (st.computing.has(page)) return st.computing.get(page);
    var epoch = st.epoch;
    var p = (async function () {
      if (!pageEntries(page).length) { st.entries.set(page, []); return; }
      var d = await TXM().get(page);
      if (st !== S) return;
      // 기다리는 사이 숨김·복원으로 다시 그리기가 시작됐으면 이 결과는 낡았다: 버리고 다시 줄 세운다.
      if (epoch !== st.epoch) { drawQueue.add(page); return; }
      if (!d) return;
      var t0 = now();
      if (d.text !== st.pageTexts[page - 1]) {
        // 이 쪽의 밑줄은 조용히 건너뛴다. 진단용으로 세기만 하고 경고는 문서당 한 번.
        st.skipped.add(page);
        st.stats.pagesSkipped = st.skipped.size;
        st.entries.set(page, []);
        if (!st.warned) { st.warned = true; console.warn("[terms] 글자 상자의 쪽 글이 문서 전체 글과 달라 일부 쪽의 밑줄을 그리지 않습니다(ReaderTerms.stats().pagesSkipped)."); }
        return;
      }
      var spans = pageEntries(page); // 현재 숨김 상태 기준으로 다시 계산
      var list = [];
      spans.forEach(function (sp) {
        var rects = G.rangeRects(d.charBoxes, sp.start, sp.end);
        if (!rects.length) return;
        var f = refineFlags(d.text, sp.start, sp.end);
        list.push({
          id: sp.slug, rects: rects, data: { slug: sp.slug, covered: sp.covered },
          refine: f.refine, refineLeft: f.refineLeft, refineRight: f.refineRight,
        });
      });
      st.entries.set(page, list);
      st.stats.rectMs.push(now() - t0);
      pushEntries(page);
    })();
    st.computing.set(page, p);
    var done = function () { if (st.computing.get(page) === p) st.computing.delete(page); };
    p.then(done, done);
    return p;
  }

  var hoverRef = null; // {page, slug}
  function pushEntries(page) {
    if (!S || !visible) return;
    var list = S.entries.get(page) || [];
    if (hoverRef && hoverRef.page === page) {
      list = list.map(function (en) {
        return en.id === hoverRef.slug ? Object.assign({}, en, { className: "is-hover" }) : en;
      });
    }
    OV().setRects(page, "term", list);
  }
  function redrawAllMarks() {
    if (!S) return;
    S.epoch++;
    OV().clear("term");
    S.entries.clear();
    S.computing.clear();
    S.rendered.forEach(function (p) { queueDraw(p); });
  }

  // ---------- 설정: 켜기/끄기 ----------
  function syncToggle() {
    var b = $("rd-terms-toggle");
    if (!b) return;
    b.disabled = false;
    b.setAttribute("aria-pressed", visible ? "true" : "false");
    b.classList.toggle("is-on", visible);
  }
  function setVisible(on) {
    on = !!on;
    if (on === visible) { syncToggle(); return; }
    visible = on;
    saveVisible(on);
    syncToggle();
    closeCard(true);
    if (!S) return;
    if (!on) OV().clear("term");
    else S.rendered.forEach(function (p) { if (S.entries.has(p)) pushEntries(p); else queueDraw(p); });
  }

  // ---------- 숨기기 ----------
  function hide(slug, force) {
    if (!slug) return;
    // 이 문서에 없는 용어는 숨기지 않는다(복원 단추가 보이지 않아 되돌릴 길이 없다). 붙여넣기 화면(force)은 자기 복원 링크가 있다.
    if (!force && S && S.ready && !S.matchBySlug.has(slug)) return;
    hidden.add(slug);
    saveHidden(hidden);
    closeCard(true);
    if (S && S.focusSlug === slug) S.focusSlug = null;
    if (S && S.ready) {
      rebuildPageTables();
      redrawAllMarks();
      renderAll();
    }
  }
  function restoreAll() {
    hidden.clear();
    saveHidden(hidden);
    if (S && S.ready) {
      rebuildPageTables();
      redrawAllMarks();
      renderAll();
    }
  }

  // 첫 화면(paste.js)이 같은 숨김 목록을 쓰도록 읽기만 열어 둔다.
  function hiddenSlugs() { return Array.from(hidden); }
  // 선택한 용어 카드를 닫는다(Esc 순서의 한 단계). 닫은 게 있으면 true.
  function clearFocus() {
    if (!S || !S.focusSlug) return false;
    S.focusSlug = null;
    renderFocus();
    return true;
  }
  function indexReady() { return !!cachedTerms; }

  // ---------- 사전에서 찾기 ----------
  async function lookup(text) {
    var q = String(text || "").replace(/\s+/g, " ").trim();
    if (!q) return [];
    await ensureIndex();
    var exact = TM.matchTermsWithIndex(q, exactIndex);
    await attachDefinitions(exact);
    return TM.applySenseToMatches(exact, q);
  }

  // 첫 화면 붙여넣기 분석(paste.js)용: 원문 그대로의 글에서 용어를 찾는다. 위치는 원문 기준이다.
  async function analyze(text) {
    var t = String(text || "");
    if (!t.trim()) return [];
    await ensureIndex();
    var exact = TM.matchTermsWithIndex(t, exactIndex);
    await attachDefinitions(exact);
    return pruneMatches(TM.applySenseToMatches(exact, t), t);
  }

  // ---------- 패널 ----------
  var quizIndex = null;
  var quizPromise = null;
  function loadQuizIndex() {
    if (!quizPromise) {
      quizPromise = fetch("data/learn/slug-index.json")
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (d) { quizIndex = d || {}; return quizIndex; })
        .catch(function () { quizIndex = {}; return quizIndex; });
    }
    return quizPromise;
  }
  async function updateQuizLink() {
    var link = $("rd-term-quiz");
    if (!link) return;
    var st = S;
    if (!st || !st.matches.length) { link.hidden = true; return; }
    var index = quizIndex || (await loadQuizIndex());
    if (st !== S) return;
    var slugs = st.matches
      .filter(function (m) { return !m.distant && !hidden.has(m.slug) && index[m.slug]; })
      .sort(function (a, b) { return (b.count || 0) - (a.count || 0); })
      .slice(0, 50)
      .map(function (m) { return m.slug; });
    if (slugs.length < 4) { link.hidden = true; return; }
    link.href = "quiz.html?slugs=" + slugs.map(encodeURIComponent).join(",");
    link.hidden = false;
  }

  function setStatus(msg) {
    var el = $("rd-term-status");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  function populateCategories(matches) {
    var sel = $("rd-term-category");
    if (!sel) return;
    var codes = new Set();
    // 대표 분야(categories[0])만 선택지로 올린다(옛 뷰어와 같은 이유: 덤 태그까지 모으면 분야가 수십 개가 된다).
    matches.forEach(function (m) { var c = (m.categories || [])[0]; if (c) codes.add(c); });
    var prev = sel.value;
    var labels = typeof CATEGORY_LABELS !== "undefined" ? CATEGORY_LABELS : {};
    sel.innerHTML = '<option value="">전체 분야</option>' + Array.from(codes)
      .sort(function (a, b) { return (labels[a] || a).localeCompare(labels[b] || b); })
      .map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(labels[c] || c) + "</option>"; })
      .join("");
    if (codes.has(prev)) sel.value = prev;
  }

  function unitHTML(u) { return TM.termCardHTML(u.match, u.basics); }
  function othersHTML(units) {
    if (!units.length) return "";
    var count = units.reduce(function (n, u) { return n + 1 + u.basics.length; }, 0);
    return '<li class="term-others"><details class="term-others-details"><summary>다른 분야 (' + count + ")</summary>" +
      '<ul class="term-others-list">' + units.map(unitHTML).join("") + "</ul></details></li>";
  }

  function filteredMatches() {
    var q = ($("rd-term-filter").value || "").trim().toLowerCase();
    var cat = $("rd-term-category").value;
    var english = $("rd-term-english").checked;
    return S.matches.filter(function (m) {
      if (hidden.has(m.slug)) return false;
      if (q && !(m.title_ko.toLowerCase().indexOf(q) >= 0 || (m.title_en || "").toLowerCase().indexOf(q) >= 0)) return false;
      if (cat && (m.categories || []).indexOf(cat) < 0) return false;
      if (english && /[가-힣]/.test(m.title_ko)) return false;
      return true;
    });
  }

  function renderFullList() {
    var list = $("rd-term-list");
    var more = $("rd-term-more");
    var filtered = filteredMatches();
    if (!filtered.length) {
      list.innerHTML = '<li class="term-list-empty">조건에 맞는 용어가 없습니다.</li>';
      more.hidden = true;
      return;
    }
    var fields = TM.estimateDocumentFields(filtered);
    var grouped = TM.groupMatchesByField(filtered, fields);
    var primary = TM.buildCardUnits(grouped.primary);
    var others = othersHTML(TM.buildCardUnits(grouped.others));
    var n = Math.min(S.shown, primary.length);
    list.innerHTML = primary.slice(0, n).map(unitHTML).join("") + (n >= primary.length ? others : "");
    decorateFailed(list);
    decorateCards(list);
    if (n < primary.length) {
      more.hidden = false;
      var rest = primary.length - n;
      more.textContent = Math.min(pageSize(), rest) + "개 더 보기 (남은 " + rest + "개)";
    } else {
      more.hidden = true;
    }
  }

  function renderCurrentPage(page) {
    var box = $("rd-term-page");
    if (!box) return;
    if (S) S.curPage = page || S.curPage;
    var p = S ? S.curPage : 0;
    var items = S && S.ready ? (S.termsByPage.get(p) || []).filter(function (m) { return !hidden.has(m.slug); }) : [];
    if (!items.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.dataset.page = String(p);
    box.innerHTML = '<h3 class="current-page-terms-title">' + p + "쪽의 용어 (" + items.length + ")</h3>" +
      '<ul class="term-list current-page-cards">' +
      items.map(function (m) { return TM.termCardHTML(S.matchBySlug.get(m.slug) || m); }).join("") + "</ul>";
    decorateFailed(box);
    decorateCards(box);
  }

  function renderFocus() {
    var box = $("rd-term-focus");
    if (!box) return;
    var m = S && S.focusSlug ? S.matchBySlug.get(S.focusSlug) : null;
    if (!m) { box.hidden = true; box.innerHTML = ""; return; }
    var basics = (m.basics || []).map(function (s) { return S.matchBySlug.get(s); }).filter(function (b) { return b && !hidden.has(b.slug); });
    box.hidden = false;
    box.innerHTML = '<div class="rd-term-sectionhead"><h3 class="current-page-terms-title">선택한 용어</h3>' +
      '<button type="button" class="term-filter-link rd-focus-close">닫기</button></div>' +
      '<ul class="term-list rd-focus-card">' + TM.termCardHTML(m, basics) + "</ul>";
    decorateFailed(box);
    decorateCards(box);
    var fc = box.querySelector(".term-card");
    if (fc) fc.classList.add("term-card-flash");
  }

  function renderTabCount() {
    var tab = $("rd-tab-terms");
    if (!tab) return;
    var n = S && S.ready ? S.matches.filter(function (m) { return !hidden.has(m.slug); }).length : 0;
    tab.textContent = "용어";
    if (n) {
      var c = document.createElement("span");
      c.className = "rd-tab-count";
      c.textContent = String(n);
      tab.appendChild(c);
    }
    tab.setAttribute("aria-label", n ? "용어 " + n + "개" : "용어");
  }

  function renderAll() {
    if (!S) return;
    var filterInput = $("rd-term-filter");
    var count = $("rd-term-count");
    var showHidden = $("rd-term-showhidden");
    renderTabCount();
    if (!S.ready) {
      filterInput.disabled = true;
      count.textContent = "";
      $("rd-term-list").innerHTML = "";
      $("rd-term-more").hidden = true;
      $("rd-term-quiz").hidden = true;
      showHidden.hidden = true;
      renderCurrentPage(0);
      renderFocus();
      return;
    }
    if (!S.matches.length) {
      setStatus("본문에서 사전 등록된 용어를 찾지 못했습니다.");
      count.textContent = "";
      $("rd-term-list").innerHTML = "";
      $("rd-term-more").hidden = true;
      $("rd-term-quiz").hidden = true;
      filterInput.disabled = true;
      showHidden.hidden = true;
      renderCurrentPage(S.curPage);
      renderFocus();
      return;
    }
    setStatus("");
    filterInput.disabled = false;
    populateCategories(S.matches);
    var hiddenCount = S.matches.filter(function (m) { return hidden.has(m.slug); }).length;
    count.textContent = "이 논문에 나온 용어 (" + S.matches.length + "개)";
    renderFullList();
    renderCurrentPage(S.curPage);
    renderFocus();
    var uncertainCount = S.matches.filter(function (m) { return m.demotedBy === "confidence"; }).length;
    var uncertainBox = $("rd-term-uncertain");
    if (uncertainBox) {
      uncertainBox.hidden = uncertainCount === 0;
      uncertainBox.querySelector("input").checked = showUncertain;
      uncertainBox.querySelector("span").textContent = "모든 용어 보기 (" + uncertainCount + ")";
    }
    showHidden.hidden = hiddenCount === 0;
    showHidden.textContent = hiddenCount ? "숨긴 용어 " + hiddenCount + "개 다시 보기" : "";
    updateQuizLink();
  }

  function resetPanelUi() {
    var ids = ["rd-term-list", "rd-term-page", "rd-term-focus", "rd-lookup"];
    ids.forEach(function (id) { var el = $(id); if (el) { el.innerHTML = ""; if (el.tagName === "SECTION") el.hidden = true; } });
    $("rd-term-filter").value = "";
    $("rd-term-category").innerHTML = '<option value="">전체 분야</option>';
    $("rd-term-english").checked = false;
    $("rd-term-quiz").hidden = true;
    $("rd-term-more").hidden = true;
    $("rd-term-showhidden").hidden = true;
    if ($("rd-term-uncertain")) $("rd-term-uncertain").hidden = true;
    $("rd-term-count").textContent = "";
    setStatus("");
  }

  function openPanel() {
    if (!root.ReaderPanels) return;
    root.ReaderPanels.open("right");
    root.ReaderPanels.selectTab("right", "terms");
  }

  // 용어를 눌렀을 때: 오른쪽 패널 "용어" 탭을 열고 그 용어 카드를 맨 위에 펼친다.
  function showInPanel(slug) {
    if (!S || !S.matchBySlug.get(slug)) return;
    S.focusSlug = slug;
    renderFocus();
    openPanel();
    var pane = root.ReaderPanels && root.ReaderPanels.tabPanel("right", "terms");
    if (pane) pane.scrollTop = 0;
  }

  async function showLookup(text) {
    var box = $("rd-lookup");
    var q = String(text || "").replace(/\s+/g, " ").trim();
    if (!q || !box) return;
    openPanel();
    var pane = root.ReaderPanels && root.ReaderPanels.tabPanel("right", "terms");
    if (pane) pane.scrollTop = 0;
    box.hidden = false;
    box.innerHTML = "";
    var head = document.createElement("div");
    head.className = "rd-term-sectionhead";
    var h = document.createElement("h3");
    h.className = "current-page-terms-title";
    h.textContent = "사전에서 찾기: “" + (q.length > 40 ? q.slice(0, 40) + "…" : q) + "”";
    var close = document.createElement("button");
    close.type = "button";
    close.className = "term-filter-link rd-lookup-close";
    close.textContent = "닫기";
    head.appendChild(h);
    head.appendChild(close);
    box.appendChild(head);
    var body = document.createElement("div");
    body.textContent = "찾는 중…";
    box.appendChild(body);
    var token = ++lookupToken;
    lookupView = null;
    var res;
    try {
      res = await lookup(q);
    } catch (err) {
      if (token !== lookupToken) return;
      console.error("[terms] lookup", err);
      body.textContent = "용어 데이터를 불러오지 못했습니다. 새로고침 해주세요.";
      return;
    }
    if (token !== lookupToken) return;
    body.textContent = "";
    if (!res.length) {
      var p = document.createElement("p");
      p.className = "rd-lookup-none";
      p.textContent = "사전에 없는 말입니다.";
      var a = document.createElement("a");
      a.href = "index.html?q=" + encodeURIComponent(q.slice(0, 60));
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "사이트에서 검색해 보기";
      body.appendChild(p);
      body.appendChild(a);
      return;
    }
    lookupView = { body: body, res: res };
    fillLookup();
  }
  // 사전 찾기 결과 목록. 숨기기 단추는 두지 않는다(이 문서의 용어가 아니면 되돌릴 길이 없다).
  var lookupView = null;
  function fillLookup() {
    if (!lookupView) return;
    var body = lookupView.body;
    var res = lookupView.res;
    body.textContent = "";
    var units = TM.buildCardUnits(res.slice(0, LOOKUP_MAX));
    var ul = document.createElement("ul");
    ul.className = "term-list rd-lookup-list";
    ul.innerHTML = units.map(unitHTML).join("");
    ul.querySelectorAll(".term-card-hide-btn").forEach(function (b) { b.remove(); });
    decorateFailed(ul);
    body.appendChild(ul);
    decorateCards(ul); // 문서에 붙은 뒤에 한다(#rd-lookup 안인지 보고 단추 종류를 정한다)
    if (res.length > LOOKUP_MAX) {
      var more = document.createElement("p");
      more.className = "rd-term-hint";
      more.textContent = "그 밖에 " + (res.length - LOOKUP_MAX) + "개가 더 있습니다. 더 짧게 골라 보세요.";
      body.appendChild(more);
    }
  }
  function refillLookup() {
    var box = $("rd-lookup");
    if (lookupView && box && !box.hidden && box.contains(lookupView.body)) fillLookup();
  }
  var lookupToken = 0;

  // ---------- 이동 ----------
  function occurrenceOf(m, page) {
    var occ = m.occurrences && m.occurrences.length ? m.occurrences
      : (m.firstStart >= 0 ? [{ start: m.firstStart, length: m.firstLength }] : []);
    var best = null;
    occ.forEach(function (o) {
      if (o.start < 0) return;
      var loc = TM.offsetToPageOffset(S.offsets, o.start);
      if (!loc) return;
      if (page && loc.page !== page) return;
      var entry = S.offsets[loc.page - 1];
      if (o.start + o.length > entry.end) return;
      var cand = { page: loc.page, start: loc.offset, end: loc.offset + o.length, g: o.start };
      if (!best || cand.g < best.g) best = cand;
    });
    return best;
  }

  async function jumpTo(slug, page) {
    var st = S;
    if (!st || !st.ready) return;
    var m = st.matchBySlug.get(slug);
    if (!m) return;
    var o = occurrenceOf(m, page) || (page ? occurrenceOf(m, 0) : null);
    if (!o) { notify("이 용어가 나온 위치를 찾지 못했습니다."); return; }
    D().goToPage(o.page);
    if (isNarrow()) root.ReaderPanels.close("right");
    var d;
    try { d = await TXM().get(o.page); } catch (err) { console.error("[terms] 이동", err); return; }
    if (!d || st !== S) return;
    var rects = G.rangeRects(d.charBoxes, o.start, o.end);
    if (!rects.length) return;
    var size = D().pageSize(o.page);
    D().goToPage(o.page, { yRatio: Math.max(0, Math.min(1, rects[0].y / (size.h || 1))) });
    var e = wordEdges(d.text, o.start, o.end);
    OV().flash(o.page, rects, { refineLeft: e.left, refineRight: e.right });
  }

  // ---------- 카드(마우스를 올리거나 터치로 누르면) ----------
  var card = null;
  var cardState = { slug: null, page: 0 };
  var openTimer = 0;
  var closeTimer = 0;
  var pointerDown = false;
  var lastType = "mouse";
  var downPos = null;
  var moveRaf = 0;
  var last = { x: 0, y: 0 };
  // 다른 층(인용·참조 카드)이 같은 자리를 쓰는 동안 용어 카드를 막는 스위치. setSuppressed() 로만 바꾼다.
  var suppressed = false;

  function ensureCard() {
    if (card) return card;
    card = document.createElement("div");
    card.className = "dict-popover rd-term-card";
    card.setAttribute("role", "dialog");
    card.hidden = true;
    card.addEventListener("pointerenter", function () { clearTimeout(closeTimer); });
    card.addEventListener("pointerleave", function () { scheduleClose(); });
    card.addEventListener("click", function (e) {
      if (e.target.closest(".dict-popover-close")) { closeCard(true); return; }
      var hideBtn = e.target.closest(".rd-term-hide");
      if (hideBtn) { hide(cardState.slug); return; }
      var rpt = e.target.closest(".rd-term-report");
      if (rpt) { reportTerm(rpt); return; }
      var rt = e.target.closest(".rd-def-retry");
      if (rt) { e.preventDefault(); retryDefs(rt.dataset.slug); return; }
      if (e.target.closest("a")) return;
      var slug = cardState.slug;
      closeCard(true);
      if (slug) showInPanel(slug);
    });
    rd().appendChild(card);
    return card;
  }
  function cardOpen() { return !!card && !card.hidden; }

  // "뜻이 틀려요": 이 카드의 용어·쪽 한 번만. 문서 글에서 앞뒤 약 100자를 잘라 함께 보낸다.
  async function reportTerm(btn) {
    var slug = cardState.slug, page = cardState.page;
    var m = S && S.matchBySlug.get(slug);
    if (!m || !root.ReaderReport || btn.disabled) return;
    btn.disabled = true;
    var info = { slug: slug, surface: m.title_ko || "", docField: (S.topFieldGroups || []).join(","), pageUrl: root.location.origin + root.location.pathname };
    try {
      var o = occurrenceOf(m, page);
      if (o) {
        var d = await TXM().get(o.page);
        if (d && d.text) { info.text = d.text; info.start = o.start; info.end = o.end; }
      }
    } catch (err) { /* 글을 못 얻어도 신고는 보낸다 */ }
    var ok = await root.ReaderReport.submit(info, page);
    if (!btn.isConnected) return;
    if (ok) {
      var done = document.createElement("span");
      done.className = "rd-term-report is-done";
      done.textContent = "알려 주셔서 고마워요";
      btn.replaceWith(done);
    } else {
      btn.disabled = false;
      btn.textContent = "보내지 못했어요";
    }
  }

  var cardPrevFocus = null; // 터치로 카드를 열기 전의 초점 자리
  function closeCard() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    if (!card || card.hidden) return;
    var back = cardPrevFocus;
    cardPrevFocus = null;
    var hadFocus = card.contains(document.activeElement);
    card.hidden = true;
    card.innerHTML = "";
    cardState = { slug: null, page: 0 };
    if (hadFocus && back && document.contains(back) && typeof back.focus === "function") {
      try { back.focus({ preventScroll: true }); } catch (err) { /* 무시 */ }
    }
  }
  function scheduleClose() {
    clearTimeout(closeTimer);
    if (!cardOpen()) return;
    closeTimer = setTimeout(function () { closeCard(true); }, CLOSE_DELAY);
  }

  function selectionActive() {
    var sel = root.getSelection ? root.getSelection() : null;
    if (!sel || sel.isCollapsed || !String(sel).trim()) return false;
    // 쪽 글 위의 선택만 센다(옆 패널 안에서 고른 글은 밑줄 동작을 막지 않는다).
    var sc = $("rd-scroll");
    if (!sc) return true;
    return sc.contains(sel.anchorNode) || sc.contains(sel.focusNode);
  }

  function anchorClientRect(hit, cx, cy) {
    var list = (S && S.entries.get(hit.page)) || [];
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

  function positionCard(rect) {
    var el = card;
    var sheet = isNarrow();
    el.classList.toggle("is-sheet", sheet);
    if (sheet) { el.style.left = ""; el.style.top = ""; return; }
    var pop = el.getBoundingClientRect();
    var margin = 8;
    var left = rect.left;
    if (left + pop.width > root.innerWidth - margin) left = root.innerWidth - pop.width - margin;
    if (left < margin) left = margin;
    var top = rect.bottom + 4; // 카드가 밑줄에 맞닿아야 마우스가 카드로 건너갈 수 있다
    if (top + pop.height > root.innerHeight - margin) {
      var above = rect.top - pop.height - 4;
      top = above >= margin ? above : Math.max(margin, root.innerHeight - pop.height - margin);
    }
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
  }

  function openCard(hit, cx, cy) {
    if (!S || !S.ready || suppressed) return;
    var m = S.matchBySlug.get(hit.id);
    if (!m) return;
    var covered = ((hit.data && hit.data.covered) || [])
      .map(function (s) { return S.matchBySlug.get(s); })
      .filter(function (c) { return c && !hidden.has(c.slug); });
    var basics = (m.basics || []).map(function (s) { return S.matchBySlug.get(s); }).filter(function (b) { return b && !hidden.has(b.slug); });
    var el = ensureCard();
    clearTimeout(closeTimer);
    el.setAttribute("aria-label", (m.title_ko || m.slug) + " 뜻 풀이");
    el.innerHTML = TM.popoverHTML(m, covered, { count: m.count, basics: basics }) +
      (defFailed(m.slug) ? '<p class="rd-def-failed">뜻을 불러오지 못했습니다 <a href="#" class="rd-def-retry" data-slug="' + String(m.slug).replace(/"/g, "&quot;") + '">다시 시도</a></p>' : "") +
      '<button type="button" class="rd-term-hide">이 용어 숨기기</button>' +
      (root.ReaderReport && root.ReaderReport.isSent(m.slug, hit.page)
        ? '<span class="rd-term-report is-done">알려 주셔서 고마워요</span>'
        : '<button type="button" class="rd-term-report">뜻이 틀려요</button>');
    el.hidden = false;
    cardState = { slug: hit.id, page: hit.page };
    positionCard(anchorClientRect(hit, cx, cy));
    // 터치로 연 카드는 초점을 카드로 옮긴다(마우스를 올려서 연 카드는 읽던 자리의 초점을 건드리지 않는다).
    if (lastType === "touch") {
      if (!cardPrevFocus) cardPrevFocus = document.activeElement;
      el.tabIndex = -1;
      try { el.focus({ preventScroll: true }); } catch (err) { /* 무시 */ }
    }
  }

  function setHover(hit) {
    var next = hit ? { page: hit.page, slug: hit.id } : null;
    if ((next && hoverRef && next.page === hoverRef.page && next.slug === hoverRef.slug) || (!next && !hoverRef)) return;
    var prev = hoverRef;
    hoverRef = next;
    if (prev) pushEntries(prev.page);
    if (next) pushEntries(next.page);
    var sc = $("rd-scroll");
    if (sc) sc.classList.toggle("is-term-hover", !!next);
  }

  function evalHover() {
    moveRaf = 0;
    if (!S || !S.ready || !visible || lastType === "touch") { setHover(null); return; }
    if (suppressed) { clearTimeout(openTimer); setHover(null); return; }
    var blocked = pointerDown || selectionActive();
    var hit = blocked ? null : OV().entryAt(last.x, last.y, ["term"]);
    setHover(hit);
    if (hit) {
      clearTimeout(closeTimer);
      if (cardOpen() && cardState.slug === hit.id && cardState.page === hit.page) { clearTimeout(openTimer); return; }
      clearTimeout(openTimer);
      var key = hit.page + ":" + hit.id;
      openTimer = setTimeout(function () {
        if (pointerDown || selectionActive() || !visible || suppressed) return;
        var again = OV().entryAt(last.x, last.y, ["term"]);
        if (!again || again.page + ":" + again.id !== key) return;
        openCard(again, last.x, last.y);
      }, OPEN_DELAY);
    } else {
      clearTimeout(openTimer);
      if (cardOpen()) scheduleClose();
    }
  }

  function onMove(e) {
    if (e.pointerType === "touch") return;
    lastType = e.pointerType || "mouse";
    last.x = e.clientX;
    last.y = e.clientY;
    if (suppressed) return;
    if (!moveRaf) moveRaf = requestAnimationFrame(evalHover);
  }

  // 용어 카드를 막거나 푼다. 막는 동안: 호버 카드가 열리지 않고, 열린 카드는 닫히고, 기다리던 타이머·rAF 는 취소되며, 용어 클릭은 무시된다.
  // 풀면 마지막 포인터 위치로 호버를 다시 계산한다. 우선순위(형광펜 > 인용·참조 > 용어)는 호출하는 쪽이 entryAt 으로 판정해 넘긴다.
  function setSuppressed(flag) {
    var next = !!flag;
    if (next === suppressed) return;
    suppressed = next;
    if (suppressed) {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; }
      setHover(null);
      closeCard(true);
    } else if (!moveRaf && lastType !== "touch" && S && S.ready) {
      moveRaf = requestAnimationFrame(evalHover);
    }
  }

  function onClick(e) {
    if (e.button !== 0 || !S || !S.ready || !visible || suppressed) return;
    if (selectionActive()) return;
    if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return;
    // 형광펜 위의 클릭은 형광펜 편집기가 맡는다(용어 카드는 마우스를 올릴 때만 뜬다).
    if (OV().entryAt(e.clientX, e.clientY, ["highlight"])) return;
    if (OV().entryAt(e.clientX, e.clientY, ["ref"])) return; // 인용·참조 표시가 있는 자리는 인용 층이 맡는다(형광펜 > 인용·참조 > 용어)
    var hit = OV().entryAt(e.clientX, e.clientY, ["term"]);
    if (!hit) return;
    if (lastType === "touch") { openCard(hit, e.clientX, e.clientY); return; }
    closeCard(true);
    showInPanel(hit.id);
  }

  function bindScroll() {
    var sc = $("rd-scroll");
    if (!sc) return;
    sc.addEventListener("pointermove", onMove, { passive: true });
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
      if (cardOpen() && !card.contains(e.target)) closeCard(true);
    }, true);
    sc.addEventListener("click", onClick);
    sc.addEventListener("scroll", function () {
      clearTimeout(openTimer);
      setHover(null);
      closeCard(true);
    }, { passive: true });
    document.addEventListener("pointerup", function () { pointerDown = false; }, true);
    document.addEventListener("pointercancel", function () { pointerDown = false; }, true);
  }

  // ---------- 패널 입력 ----------
  function bindPanel() {
    var pane = root.ReaderPanels && root.ReaderPanels.tabPanel("right", "terms");
    if (!pane) return;
    pane.addEventListener("click", function (e) {
      var rt = e.target.closest(".rd-def-retry");
      if (rt) { e.preventDefault(); retryDefs(rt.dataset.slug); return; }
      var hideBtn = e.target.closest(".term-card-hide-btn");
      if (hideBtn) { hide(hideBtn.dataset.hideSlug); return; }
      if (e.target.closest(".rd-focus-close")) { if (S) S.focusSlug = null; renderFocus(); return; }
      if (e.target.closest(".rd-lookup-close")) { lookupToken++; var lk = $("rd-lookup"); lk.hidden = true; lk.innerHTML = ""; return; }
      if (e.target.closest("a, summary, details")) return;
      var c = e.target.closest(".term-card");
      if (!c || !S) return;
      var inPage = c.closest("#rd-term-page");
      var inLookup = c.closest("#rd-lookup");
      if (inLookup) {
        if (S.matchBySlug.get(c.dataset.slug)) { S.focusSlug = c.dataset.slug; renderFocus(); return; }
        // 이 문서에 없는 용어: 그 자리에서 뜻 전체를 펼친다.
        var open = c.classList.toggle("is-expanded");
        var goBtn = c.querySelector(":scope > .term-card-name > .rd-card-go");
        if (goBtn) goBtn.setAttribute("aria-expanded", open ? "true" : "false");
        return;
      }
      jumpTo(c.dataset.slug, inPage ? S.curPage : 0);
    });
    $("rd-term-filter").addEventListener("input", function () { if (S && S.ready) { S.shown = pageSize(); renderFullList(); } });
    $("rd-term-category").addEventListener("change", function () { if (S && S.ready) { S.shown = pageSize(); renderFullList(); } });
    $("rd-term-english").addEventListener("change", function () { if (S && S.ready) { S.shown = pageSize(); renderFullList(); } });
    $("rd-term-more").addEventListener("click", function () { if (S && S.ready) { S.shown += pageSize(); renderFullList(); } });
    $("rd-term-showhidden").addEventListener("click", restoreAll);
    var uncertain = $("rd-term-uncertain");
    if (uncertain) uncertain.querySelector("input").addEventListener("change", function (e) {
      showUncertain = !!e.target.checked;
      if (S && S.ready) { rebuildPageTables(); redrawAllMarks(); renderAll(); }
    });
  }

  // ---------- 연결 ----------
  var ready = false;
  function init() {
    if (ready) return;
    ready = true;
    visible = loadVisible();
    syncToggle();
    var tg = $("rd-terms-toggle");
    if (tg) tg.addEventListener("click", function () { setVisible(!visible); });
    bindScroll();
    bindPanel();

    var el = rd();
    if (!el) return;
    S = freshState();
    el.addEventListener("reader:docopen", function () {
      S = freshState();
      drawQueue.clear();
      hoverRef = null;
      closeCard(true);
      resetPanelUi();
      renderAll();
      setStatus("용어를 찾는 중…");
      var st = S;
      runMatching(st).catch(function (err) {
        if (st !== S) return;
        console.error("[terms] 매칭 실패", err);
        st.failed = true;
        setStatus("용어 데이터를 불러오지 못했습니다. 새로고침 해주세요.");
        notify("용어 데이터를 불러오지 못했습니다. 밑줄과 용어 목록을 쓸 수 없습니다.");
      });
    });
    el.addEventListener("reader:docclose", function () {
      S = freshState();
      drawQueue.clear();
      hoverRef = null;
      closeCard(true);
      resetPanelUi();
      renderAll();
    });
    el.addEventListener("reader:pagerendered", function (e) {
      var p = e.detail.page;
      S.rendered.add(p);
      if (!S.ready) return;
      if (S.entries.has(p)) pushEntries(p); // 쪽을 다시 그려도 계산은 다시 하지 않는다
      else queueDraw(p);
    });
    el.addEventListener("reader:pagechange", function (e) {
      if (S.curPage === e.detail.page) return;
      S.curPage = e.detail.page;
      if (S.ready) renderCurrentPage(e.detail.page);
    });
    el.addEventListener("reader:lookup", function (e) { showLookup(e.detail && e.detail.text); });
  }

  root.ReaderTerms = {
    init: init,
    setVisible: setVisible,
    isVisible: function () { return visible; },
    setSuppressed: setSuppressed,
    closeCard: function () { if (!cardOpen()) return false; closeCard(true); return true; }, // Esc 가 한 번에 하나만 닫도록 reader.js 가 부른다
    showTerm: function (slug) { showInPanel(slug); },
    isSuppressed: function () { return suppressed; },
    hide: hide,
    restoreAll: restoreAll,
    hiddenSlugs: hiddenSlugs,
    clearFocus: clearFocus,
    indexReady: indexReady,
    analyze: analyze, // Promise<matches>: 붙여넣은 글 분석(원문 위치 그대로)
    lookup: lookup, // Promise<matches>: 정의 청크를 받아 와야 해서 비동기다
    firstPerPage: firstPerPage,
    // 시험·진단용
    _state: function () { return S; },
    stats: function () { return S ? S.stats : null; }, // pagesSkipped: 쪽 글 불일치로 밑줄을 건너뛴 쪽 수
    _stats: function () { return S ? S.stats : null; },
  };
})(typeof window !== "undefined" ? window : globalThis);
