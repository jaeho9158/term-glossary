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

  var ROMAN = { i: 1, ii: 1, iii: 1, iv: 1, v: 1, vi: 1, vii: 1, viii: 1, ix: 1, x: 1 };
  function isNumOrRoman(w) { return /^\d+$/.test(w) || ROMAN[w] === 1; }

  // 소문자·발음 기호 접기·기호 제거 → 2글자 이상 낱말 배열(숫자·로마 숫자 낱말은 길이와 무관하게 유지)
  function normalizeTitle(s) {
    var t = fold(s).normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!t) return [];
    return t.split(/\s+/).filter(function (w) { return w.length >= 2 || isNumOrRoman(w); });
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

  // 앞쪽 목록 번호 "[12]" "12." 제거, 공백 정리, 300자(코드 포인트) 이내 낱말 경계로 자름
  function trimRef(s) {
    var t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    t = t.replace(/^(?:\[\s*\d{1,3}\s*\]|\(\s*\d{1,3}\s*\)|\d{1,3}\s*[.)])\s*/, "");
    var cp = Array.from(t);
    if (cp.length > 300) {
      var cut = cp.slice(0, 300).join("");
      var sp = cut.lastIndexOf(" ");
      if (sp > 150 && cp[300] !== " ") cut = cut.slice(0, sp);
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
    return typeof t === "string" ? stripMarkup(t) : "";
  }

  function toCandidate(item) {
    return {
      title: titleOf(item),
      year: item && item.year ? String(item.year) : yearOf(item),
      author: item && Array.isArray(item.author) ? item.author : []
    };
  }

  function lettersOf(s) {
    return fold(s).normalize("NFC").match(/\p{L}+/gu) || [];
  }

  var ORG_STOP = { the: 1, of: 1, for: 1, and: 1, a: 1, an: 1, de: 1, la: 1, le: 1, der: 1, die: 1, das: 1 };

  // 첫 저자: 성(family) → 없으면 단체명(name)의 첫 의미 낱말 → 없으면 저자 정보 없음
  function authorKey(authors) {
    if (!Array.isArray(authors) || !authors.length) return null;
    var a = authors[0];
    if (!a || typeof a !== "object") return null;
    if (typeof a.family === "string" && lettersOf(a.family).length) return { value: a.family, org: false };
    if (typeof a.name === "string") {
      var ws = lettersOf(a.name).filter(function (w) { return !ORG_STOP[w]; });
      if (ws.length) return { value: ws[0], org: true };
    }
    return null;
  }

  // 성은 서지 문구의 낱말(문자 연속)과 같아야 한다(부분 문자열 금지). 여러 낱말 성은 연속 낱말.
  // 한글 성은 성으로 시작하는 2~4음절 낱말(김철수)이어야 한다.
  function familyMatch(refText, fam, isOrg) {
    var ft = lettersOf(fam);
    if (!ft.length) return false;
    var rt = lettersOf(refText);
    if (hasHangul(fam)) {
      var f = ft.join("");
      var fl = Array.from(f).length;
      for (var k = 0; k < rt.length; k++) {
        if (rt[k].indexOf(f) !== 0) continue;
        if (isOrg) return true;
        var len = Array.from(rt[k]).length;
        if (len >= fl + 1 && len <= fl + 2 && len >= 2 && len <= 4) return true;
      }
      return false;
    }
    for (var i = 0; i + ft.length <= rt.length; i++) {
      var ok = true;
      for (var j = 0; j < ft.length; j++) if (rt[i + j] !== ft[j]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }

  // 한글 제목: 공백을 뺀 서지 문구에 제목 낱말(띄어쓰기 단위)이 통째로 들어 있는 비율이 80% 이상
  function hangulTitleScore(refText, title) {
    var squash = function (x) { return fold(x).normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, ""); };
    var words = fold(title).normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
    var ref = squash(refText);
    var hit = 0;
    for (var i = 0; i < words.length; i++) if (ref.indexOf(words[i]) !== -1) hit++;
    return { n: words.length, hit: hit };
  }

  // 최장 공통 부분 수열 길이(제목 낱말이 서지 문구에서 같은 순서로 나오는 개수)
  function lcsLen(a, b) {
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev.push(0);
    for (i = 1; i <= a.length; i++) {
      cur = [0];
      for (j = 1; j <= b.length; j++) {
        cur.push(a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function rawTokens(s) {
    var str = fold(s).normalize("NFC");
    var re = /[\p{L}\p{N}]+/gu;
    var out = [];
    var m;
    while ((m = re.exec(str))) out.push({ t: m[0], s: m.index, e: m.index + m[0].length });
    return { str: str, toks: out };
  }

  // 후보 제목이 인용된 제목의 앞부분일 뿐인가(제목 바로 뒤에 낱말이 이어지거나 ':' '-' 부제가 붙음)
  function titleContinues(refText, title) {
    var r = rawTokens(refText);
    var tt = rawTokens(title).toks.map(function (x) { return x.t; });
    if (!tt.length) return false;
    var found = false;
    for (var i = 0; i + tt.length <= r.toks.length; i++) {
      var ok = true;
      for (var j = 0; j < tt.length; j++) if (r.toks[i + j].t !== tt[j]) { ok = false; break; }
      if (!ok) continue;
      found = true;
      var next = r.toks[i + tt.length];
      if (!next) return false;
      var gap = r.str.slice(r.toks[i + tt.length - 1].e, next.s).replace(/\s+/g, "");
      if (!(gap === "" || /^[:\-–—]+$/.test(gap))) return false; // 제목이 끝나는 곳이 있음
    }
    return found;
  }

  var NOTICE_RE = /^\s*(correction|corrigendum|erratum|errata|retraction|retracted|reply|response|comment|commentary|editorial)\b/i;

  function isMatch(refText, candidate) {
    if (!candidate || typeof refText !== "string") return false;
    var title = candidate.title;
    if (typeof title !== "string" || !title) return false;
    var year = candidate.year == null ? "" : String(candidate.year);
    if (!year || yearsIn(refText).indexOf(year) === -1) return false;

    var refToks = normalizeTitle(refText);
    var refSet = {};
    refToks.forEach(function (w) { refSet[w] = true; });

    // 정정·철회·답변·논평류 표제는 서지 문구에도 같은 낱말이 있을 때만
    var nm = NOTICE_RE.exec(title);
    if (nm && !refSet[nm[1].toLowerCase()]) return false;

    var n, hit;
    if (hasHangul(title)) {
      var sc = hangulTitleScore(refText, title);
      n = sc.n; hit = sc.hit;
      if (n < 3 || hit / n < 0.8) return false;
    } else if (hangulRatio(refText) > 0.5) {
      return false; // 한글 서지에는 한글 규칙으로만 일치시킨다
    } else {
      var words = normalizeTitle(title);
      n = words.length;
      if (n < 3) return false;
      hit = 0;
      for (var i = 0; i < n; i++) {
        if (refSet[words[i]]) hit++;
        else if (isNumOrRoman(words[i])) return false; // 권·부 번호가 다르면 다른 글
      }
      if (n <= 6 ? hit !== n : hit / n < 0.8) return false;
      if (lcsLen(words, refToks) / n < 0.8) return false; // 낱말이 흩어져 있기만 한 경우
      if (titleContinues(refText, title)) return false;
    }

    var ak = authorKey(candidate.author);
    if (ak) return familyMatch(refText, ak.value, ak.org);
    return n >= 8 && hit === n; // 저자 정보가 없으면 긴 제목이 전부 일치할 때만
  }

  function titleKey(item) { return normalizeTitle(titleOf(item)).join(" "); }

  function pickMatch(refText, items) {
    if (!Array.isArray(items)) return null;
    var first = null;
    var key = null;
    for (var i = 0; i < items.length; i++) {
      if (!isMatch(refText, toCandidate(items[i]))) continue;
      var k = titleKey(items[i]);
      if (first === null) { first = items[i]; key = k; }
      else if (k !== key) return null; // 서로 다른 제목이 둘 이상 통과하면 모호
    }
    return first;
  }

  function validDoi(doi) { return typeof doi === "string" && DOI_RE.test(doi); }

  function doiUrl(doi) {
    if (!validDoi(doi)) return "";
    try {
      return "https://doi.org/" + encodeURIComponent(doi).replace(/%2F/gi, "/");
    } catch (e) { return ""; } // 짝 없는 서로게이트
  }

  var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

  // JATS/HTML 태그 제거. innerHTML·textarea를 쓰지 않고 흔한 엔티티만 직접 풀어 준다.
  // 태그처럼 생긴 것(<이름 속성=값 …>, </이름>)만 지우고, 그 밖의 "<"는 그대로 둔다.
  var TAG_RE = /<\/?[A-Za-z][\w:.\-]*(?:\s+[\w:.\-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>]+))*\s*\/?>/g;

  function stripTags(s) {
    return stripMarkup(s).replace(/^abstract\b[\s:.\-]*/i, "");
  }

  function stripMarkup(s) {
    var t = String(s == null ? "" : s);
    t = t.replace(/<\/?(?:jats:(?:p|title|sec)|p|br|div)(?![\w:.\-])(?:\s[^<>]*)?\/?>/gi, " ");
    t = t.replace(TAG_RE, "");
    t = t.replace(/&(#\d{1,6}|#x[0-9a-f]{1,5}|[a-z]{2,6});/gi, function (m, e) {
      if (e.charAt(0) === "#") {
        var n = e.charAt(1).toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        if (n > 31 && n < 0x10ffff && !(n >= 0xd800 && n < 0xe000)) return String.fromCodePoint(n);
        return " ";
      }
      var k = e.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : m;
    });
    return t.replace(/\s+/g, " ").trim();
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

  var TYPE_LABELS = {
    "book-chapter": "책의 장", "book": "책", "monograph": "책", "dissertation": "학위논문",
    "proceedings-article": "학술대회 논문", "posted-content": "프리프린트"
  };

  function toData(item) {
    var ct = Array.isArray(item["container-title"]) ? item["container-title"][0] : "";
    return {
      title: titleOf(item),
      authors: authorLine(item.author),
      year: yearOf(item),
      journal: typeof ct === "string" ? stripMarkup(ct) : "",
      typeLabel: typeof item.type === "string" && Object.prototype.hasOwnProperty.call(TYPE_LABELS, item.type) ? TYPE_LABELS[item.type] : "",
      abstract: typeof item.abstract === "string" ? cutAbstract(item.abstract) : "",
      doi: validDoi(item.DOI) ? item.DOI : ""
    };
  }

  // ---------- 조회 ----------

  var cache = Object.create(null);
  var inflight = [];
  var generation = 0;

  // 시험용 훅은 localhost/127.0.0.1에서만. loc은 주입 가능(시험).
  function apiBaseFor(loc) {
    try {
      var h = loc.hostname;
      if (h === "localhost" || h === "127.0.0.1") {
        var v = new URLSearchParams(loc.search).get("biblio_host");
        if (v && /^[a-z0-9.\-]+(:\d+)?$/i.test(v)) return "https://" + v + "/works";
      }
    } catch (e) { /* 시험용 훅이 없으면 기본 주소 */ }
    return API;
  }

  function apiBase() {
    return apiBaseFor(typeof location !== "undefined" ? location : null);
  }

  function lookup(refText) {
    var q = trimRef(refText);
    if (!q) return Promise.resolve({ status: "nomatch" });
    if (cache[q]) return cache[q];
    var url;
    try {
      url = apiBase() + "?rows=3&select=" + encodeURIComponent("title,author,issued,container-title,DOI,abstract,type") +
        "&query.bibliographic=" + encodeURIComponent(q);
    } catch (e) { return Promise.resolve({ status: "error" }); } // 짝 없는 서로게이트
    var gen = generation;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    inflight.push(ctrl);

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
        if (d.journal) {
          var jl = line("학술지", d.journal);
          if (d.typeLabel) jl.appendChild(el("span", "biblio-type", d.typeLabel));
          container.appendChild(jl);
        } else if (d.typeLabel) {
          container.appendChild(line("유형", d.typeLabel));
        }
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
    stripTags: stripTags, apiBaseFor: apiBaseFor, toData: toData, cutAbstract: cutAbstract, render: render, reset: reset
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.ReaderBiblio = api;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
    else wire();
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
