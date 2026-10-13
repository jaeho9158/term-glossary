// 인용 카드의 "자세히" — Crossref 서지 조회. 사용자가 누를 때만, 참고문헌 한 건의 문구만 보낸다.
// 요청에는 사용자 지정 헤더·mailto·식별자를 넣지 않는다(사이트 규칙). 잘못된 논문을 "그 문헌"으로
// 보여 주는 것이 최악이므로 일치 판정은 보수적이다: 제목 낱말 80%·연도·첫 저자 성이 모두 맞아야 한다.
(function () {
  "use strict";

  var API = "https://api.crossref.org/works";
  var TIMEOUT_MS = 8000;
  var DOI_RE = /^10\.\d{4,9}\/\S+$/;

  var MSG_LOADING = "불러오는 중…";
  var MSG_NOMATCH = "일치하는 문헌을 찾지 못했습니다";
  var MSG_ERROR = "정보를 가져오지 못했습니다";
  var MSG_RETRY = "다시 시도";

  // ---------- 순수 함수 ----------

  function fold(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  // 소문자·발음 기호 접기·기호 제거 → 2글자 이상 낱말 배열
  function normalizeTitle(s) {
    var t = fold(s).normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!t) return [];
    return t.split(/\s+/).filter(function (w) { return w.length >= 2; });
  }

  function yearsIn(s) {
    var out = [];
    var re = /(?<!\d)(?:19|20)\d{2}(?!\d)/g;
    var m;
    var str = String(s == null ? "" : s);
    while ((m = re.exec(str))) out.push(m[0]);
    return out;
  }

  function hangulRatio(s) {
    var h = (String(s).match(/[가-힣]/g) || []).length;
    var l = (String(s).match(/[A-Za-zÀ-ɏ]/g) || []).length;
    return h + l === 0 ? 0 : h / (h + l);
  }

  function hasHangul(s) { return /[가-힣]/.test(String(s)); }

  // 앞쪽 목록 번호 "[12]" "12." 제거, 공백 정리, 300자 이내(낱말 경계)로 자름
  function trimRef(s) {
    var t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    t = t.replace(/^(?:\[\s*\d{1,3}\s*\]|\(\s*\d{1,3}\s*\)|\d{1,3}\s*[.)])\s*/, "");
    if (t.length > 300) {
      var cut = t.slice(0, 300);
      var sp = cut.lastIndexOf(" ");
      if (sp > 150 && t.charAt(300) !== " ") cut = cut.slice(0, sp);
      t = cut.trim();
    }
    return t;
  }

  function yearOf(item) {
    try {
      var dp = item && item.issued && item.issued["date-parts"];
      if (!Array.isArray(dp) || !Array.isArray(dp[0])) return "";
      var y = dp[0][0];
      if (typeof y !== "number" && typeof y !== "string") return "";
      y = String(y);
      return /^\d{4}$/.test(y) ? y : "";
    } catch (e) { return ""; }
  }

  function titleOf(item) {
    if (!item) return "";
    var t = item.title;
    if (Array.isArray(t)) t = t[0];
    return typeof t === "string" ? t : "";
  }

  function toCandidate(item) {
    return {
      title: titleOf(item),
      year: item && item.year ? String(item.year) : yearOf(item),
      author: item && Array.isArray(item.author) ? item.author : []
    };
  }

  function firstFamily(authors) {
    if (!Array.isArray(authors) || !authors.length) return "";
    var a = authors[0];
    return a && typeof a.family === "string" ? a.family.trim() : "";
  }

  // 한글 제목: 공백을 뺀 서지 문구에 제목 낱말(띄어쓰기 단위)이 통째로 들어 있는 비율이 80% 이상
  function hangulTitleMatch(refText, title) {
    var squash = function (x) { return fold(x).normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, ""); };
    var words = fold(title).normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
    if (words.length < 3) return false;
    var ref = squash(refText);
    var hit = 0;
    for (var i = 0; i < words.length; i++) if (ref.indexOf(words[i]) !== -1) hit++;
    return hit / words.length >= 0.8;
  }

  function isMatch(refText, candidate) {
    if (!candidate || typeof refText !== "string") return false;
    var title = candidate.title;
    if (typeof title !== "string" || !title) return false;
    var year = candidate.year == null ? "" : String(candidate.year);
    if (!year || yearsIn(refText).indexOf(year) === -1) return false;

    var okTitle;
    if (hasHangul(title)) {
      okTitle = hangulTitleMatch(refText, title);
    } else if (hangulRatio(refText) > 0.5) {
      okTitle = false; // 한글 서지에는 한글 규칙으로만 일치시킨다
    } else {
      var words = normalizeTitle(title);
      if (words.length < 3) return false;
      var set = {};
      normalizeTitle(refText).forEach(function (w) { set[w] = true; });
      var hit = 0;
      words.forEach(function (w) { if (set[w]) hit++; });
      okTitle = hit / words.length >= 0.8;
    }
    if (!okTitle) return false;

    var fam = firstFamily(candidate.author);
    if (fam) {
      var f = fold(fam).replace(/\s+/g, " ").trim();
      if (!f || fold(refText).indexOf(f) === -1) return false;
    }
    return true;
  }

  function pickMatch(refText, items) {
    if (!Array.isArray(items)) return null;
    for (var i = 0; i < items.length; i++) {
      if (isMatch(refText, toCandidate(items[i]))) return items[i];
    }
    return null;
  }

  function validDoi(doi) { return typeof doi === "string" && DOI_RE.test(doi); }

  function doiUrl(doi) {
    if (!validDoi(doi)) return "";
    return "https://doi.org/" + encodeURIComponent(doi).replace(/%2F/gi, "/");
  }

  var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

  // JATS/HTML 태그 제거. innerHTML·textarea를 쓰지 않고 흔한 엔티티만 직접 풀어 준다.
  function stripTags(s) {
    var t = String(s == null ? "" : s);
    t = t.replace(/<\/?jats:(?:p|title|sec)\b[^>]*>/gi, " ").replace(/<\/?(?:p|br|div)\b[^>]*>/gi, " ");
    t = t.replace(/<[^>]*>/g, "");
    t = t.replace(/&(#\d{1,6}|#x[0-9a-f]{1,5}|[a-z]{2,6});/gi, function (m, e) {
      if (e.charAt(0) === "#") {
        var n = e.charAt(1).toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        if (n > 31 && n < 0x10ffff && !(n >= 0xd800 && n < 0xe000)) return String.fromCodePoint(n);
        return " ";
      }
      var k = e.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : m;
    });
    t = t.replace(/\s+/g, " ").trim();
    return t.replace(/^abstract\b[\s:.\-]*/i, "");
  }

  function cutAbstract(s) {
    var a = Array.from(stripTags(s));
    return a.length > 600 ? a.slice(0, 600).join("").trim() + "…" : a.join("");
  }

  function authorLine(authors) {
    if (!Array.isArray(authors) || !authors.length) return "";
    var names = [];
    for (var i = 0; i < authors.length && names.length < 3; i++) {
      var a = authors[i] || {};
      var n = [a.given, a.family].filter(function (x) { return typeof x === "string" && x; }).join(" ") ||
        (typeof a.name === "string" ? a.name : "");
      if (n) names.push(n);
    }
    return names.join(", ") + (authors.length > 3 ? " 외" : "");
  }

  function toData(item) {
    var ct = Array.isArray(item["container-title"]) ? item["container-title"][0] : "";
    return {
      title: titleOf(item),
      authors: authorLine(item.author),
      year: yearOf(item),
      journal: typeof ct === "string" ? ct : "",
      abstract: typeof item.abstract === "string" ? cutAbstract(item.abstract) : "",
      doi: validDoi(item.DOI) ? item.DOI : ""
    };
  }

  // ---------- 조회 ----------

  var cache = Object.create(null);
  var inflight = [];
  var generation = 0;

  function apiBase() {
    try {
      var h = location.hostname;
      if (h === "localhost" || h === "127.0.0.1") {
        var v = new URLSearchParams(location.search).get("biblio_host");
        if (v && /^[a-z0-9.\-]+(:\d+)?$/i.test(v)) return "https://" + v + "/works";
      }
    } catch (e) { /* 시험용 훅이 없으면 기본 주소 */ }
    return API;
  }

  function lookup(refText) {
    var q = trimRef(refText);
    if (!q) return Promise.resolve({ status: "nomatch" });
    if (cache[q]) return cache[q];
    var gen = generation;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    inflight.push(ctrl);
    var url = apiBase() + "?rows=3&select=" + encodeURIComponent("title,author,issued,container-title,DOI,abstract") +
      "&query.bibliographic=" + encodeURIComponent(q);

    var p = fetch(url, { signal: ctrl.signal, referrerPolicy: "no-referrer", credentials: "omit" })
      .then(function (res) {
        if (!res.ok) throw new Error("http " + res.status); // 429 포함
        return res.json();
      })
      .then(function (json) {
        var items = json && json.message && json.message.items;
        if (!Array.isArray(items)) throw new Error("shape");
        var hit = pickMatch(q, items);
        return hit ? { status: "ok", data: toData(hit) } : { status: "nomatch" };
      })
      .catch(function () { return { status: "error" }; })
      .then(function (r) {
        clearTimeout(timer);
        var i = inflight.indexOf(ctrl);
        if (i !== -1) inflight.splice(i, 1);
        if (r.status === "error" || gen !== generation) {
          if (cache[q] === p) delete cache[q];
        }
        return r;
      });
    cache[q] = p;
    return p;
  }

  function reset() {
    generation++;
    cache = Object.create(null);
    inflight.splice(0).forEach(function (c) { try { c.abort(); } catch (e) { /* 이미 끝남 */ } });
  }

  // ---------- 화면 ----------

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function line(label, value) {
    var d = el("div", "biblio-line");
    d.appendChild(el("span", "biblio-label", label));
    d.appendChild(el("span", "biblio-value", value));
    return d;
  }

  function render(container, text) {
    if (!container) return;
    var token = {};
    container._biblioToken = token;
    var live = function () { return container._biblioToken === token; };
    container.textContent = "";
    container.classList.add("biblio");
    container.setAttribute("aria-live", "polite");
    container.appendChild(el("p", "biblio-status", MSG_LOADING));

    lookup(text).then(function (r) {
      if (!live()) return; // 카드가 닫혔거나 다시 조회 중
      container.textContent = "";
      if (r.status === "ok") {
        var d = r.data;
        container.appendChild(el("p", "biblio-title", d.title));
        if (d.authors) container.appendChild(line("저자", d.authors));
        if (d.year) container.appendChild(line("연도", d.year));
        if (d.journal) container.appendChild(line("학술지", d.journal));
        if (d.abstract) container.appendChild(el("p", "biblio-abstract", d.abstract));
        var href = doiUrl(d.doi);
        if (href) {
          var a = el("a", "biblio-link", "원문 보기 (DOI)");
          a.href = href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          container.appendChild(a);
        }
        container.appendChild(el("p", "biblio-source", "서지 정보: Crossref"));
      } else if (r.status === "nomatch") {
        container.appendChild(el("p", "biblio-status", MSG_NOMATCH));
      } else {
        container.appendChild(el("p", "biblio-status biblio-error", MSG_ERROR));
        var b = el("button", "biblio-retry", MSG_RETRY);
        b.type = "button";
        b.addEventListener("click", function () { render(container, text); });
        container.appendChild(b);
      }
    });
  }

  function wire() {
    var reader = document.getElementById("reader");
    if (reader) {
      reader.addEventListener("reader:refdetail", function (e) {
        var d = (e && e.detail) || {};
        if (d.container && typeof d.text === "string") render(d.container, d.text);
      });
    }
    window.addEventListener("reader:docclose", reset, true);
  }

  var api = {
    normalizeTitle: normalizeTitle, yearsIn: yearsIn, isMatch: isMatch, pickMatch: pickMatch,
    lookup: lookup, trimRef: trimRef, yearOf: yearOf, validDoi: validDoi, doiUrl: doiUrl,
    stripTags: stripTags, cutAbstract: cutAbstract, render: render, reset: reset
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.ReaderBiblio = api;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
    else wire();
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
