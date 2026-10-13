// 인용 카드의 "자세히" — Crossref 서지 조회. 사용자가 누를 때만, 참고문헌 한 건의 문구만 보낸다.
// 요청에는 사용자 지정 헤더·mailto·식별자를 넣지 않는다(사이트 규칙). 잘못된 논문을 "그 문헌"으로
// 보여 주는 것이 최악이므로 일치 판정은 보수적이다: 제목 낱말 순서 일치·연도·첫 저자가 모두 맞아야 한다.
// 한글(국문) 문헌은 조회하지 않는다(Crossref의 국문 제목 수록이 빈약하고 판정 근거가 약함).
(function () {
  "use strict";

  var API = "https://api.crossref.org/works";
  var TIMEOUT_MS = 8000;
  var DOI_RE = /^10\.\d{4,9}\/\S+$/;

  var MSG_LOADING = "불러오는 중…";
  var MSG_NOMATCH = "일치하는 문헌을 찾지 못했습니다";
  var MSG_ERROR = "정보를 가져오지 못했습니다";
  var MSG_RETRY = "다시 시도";

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // ---------- 순수 함수 ----------

  var SPECIAL = { "ø": "o", "ł": "l", "đ": "d", "æ": "ae", "œ": "oe", "ß": "ss", "ð": "d", "þ": "th" };

  // NFKD(합자·호환 문자 풀기) → 결합 기호 제거 → 소문자 → 특수 문자 접기 → NFC
  function fold(s) {
    return String(s == null ? "" : s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[øłđæœßðþ]/g, function (c) { return SPECIAL[c]; }).normalize("NFC");
  }

  var ROMAN = { i: 1, ii: 1, iii: 1, iv: 1, v: 1, vi: 1, vii: 1, viii: 1, ix: 1, x: 1 };
  function isNumOrRoman(w) { return /^\d+$/.test(w) || ROMAN[w] === 1; }
  var NUMWORD = { one: 1, two: 1, three: 1, four: 1, five: 1, six: 1, seven: 1, eight: 1, nine: 1, ten: 1, first: 1, second: 1, third: 1 };
  function isNumber(w) { return isNumOrRoman(w) || NUMWORD[w] === 1; }

  // 문자열의 낱말 보기. joined가 true면 낱말 안의 하이픈을 붙인다("2-D" → "2d").
  // words: 2글자 이상 낱말(숫자·로마 숫자는 길이와 무관하게 유지), raw: 모든 낱말(위치 포함)
  function view(text, joined) {
    var s = fold(text).replace(/([\p{L}\p{N}])['’ʼ](?=\p{L})/gu, "$1");
    if (joined) s = s.replace(/([\p{L}\p{N}])[\-‐‑](?=[\p{L}\p{N}])/gu, "$1");
    var re = /[\p{L}\p{N}]+/gu;
    var raw = [];
    var m;
    while ((m = re.exec(s))) raw.push({ t: m[0], s: m.index, e: m.index + m[0].length });
    var words = raw.map(function (x) { return x.t; }).filter(function (w) { return w.length >= 2 || isNumOrRoman(w); });
    return { str: s, raw: raw, words: words };
  }

  function normalizeTitle(s) { return view(s, false).words; }

  function yearsIn(s) {
    var out = [];
    var re = /(?<!\d)(?:19|20)\d{2}(?!\d)/g;
    var m;
    var str = String(s == null ? "" : s);
    while ((m = re.exec(str))) out.push(m[0]);
    return out;
  }

  // 글자 중 한글이 절반을 넘는가
  function mostlyHangul(s) {
    var str = String(s == null ? "" : s);
    var l = (str.match(/\p{L}/gu) || []).length;
    if (!l) return false;
    return (str.match(/\p{Script=Hangul}/gu) || []).length / l > 0.5;
  }

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

  function firstString(v) {
    if (Array.isArray(v)) v = v[0];
    return typeof v === "string" ? stripMarkup(v) : "";
  }

  function titleOf(item) { return item ? firstString(item.title) : ""; }

  function toCandidate(item) {
    return {
      title: titleOf(item),
      subtitle: item ? firstString(item.subtitle) : "",
      type: item && typeof item.type === "string" ? item.type : "",
      year: item && item.year ? String(item.year) : yearOf(item),
      author: item && Array.isArray(item.author) ? item.author : []
    };
  }

  // ----- 저자 -----

  var ORG_STOP = { the: 1, of: 1, for: 1, and: 1, a: 1, an: 1, de: 1, la: 1, le: 1, der: 1, die: 1, das: 1 };

  // 글자 낱말 배열. dropApos면 아포스트로피를 없애고(O'Brien → obrien), 아니면 낱말을 가른다.
  function letterToks(s, dropApos) {
    var t = fold(s);
    if (dropApos) t = t.replace(/['’ʼ`´]/g, "");
    return t.match(/\p{L}+/gu) || [];
  }

  // 독일식 전사 ue/oe/ae ↔ ü/ö/ä (성 비교 전용)
  function famCanon(w) { return w.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u"); }

  function orgSig(name) {
    return letterToks(name, true).filter(function (w) { return !ORG_STOP[w] && w.length > 1; });
  }

  // 첫 저자: 성(family) → 없으면 단체명(name)의 의미 낱말 → 없으면 저자 정보 없음
  function authorKey(authors) {
    if (!Array.isArray(authors) || !authors.length) return null;
    var a = authors[0];
    if (!a || typeof a !== "object") return null;
    if (typeof a.family === "string" && letterToks(a.family, true).length) return { family: a.family };
    if (typeof a.name === "string" && orgSig(a.name).length) return { org: a.name };
    return null;
  }

  function hasRun(hay, needle) {
    if (!needle.length) return false;
    for (var i = 0; i + needle.length <= hay.length; i++) {
      var ok = true;
      for (var j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }

  // 성은 서지 문구의 낱말(문자 연속)과 같아야 한다(부분 문자열 금지). 여러 낱말 성은 연속 낱말.
  // 아포스트로피·하이픈·공백 차이와 ue/oe/ae 전사 차이는 같은 성으로 본다.
  function familyMatch(refText, fam) {
    var noApos = letterToks(fam, true).map(famCanon);
    var split = letterToks(fam, false).map(famCanon);
    var joined = noApos.join("");
    if (!noApos.length || joined.length < 2) return false;
    var variants = [noApos, split, [joined]];
    var views = [letterToks(refText, true).map(famCanon), letterToks(refText, false).map(famCanon)];
    for (var v = 0; v < views.length; v++) {
      for (var k = 0; k < variants.length; k++) if (hasRun(views[v], variants[k])) return true;
    }
    return false;
  }

  // 단체 저자: 의미 낱말 전부가 순서대로 이어서 나오거나(불용어는 건너뜀),
  // 첫 글자를 모은 약어(3글자 이상)가 대문자 낱말로 나와야 한다.
  function orgMatch(refText, name) {
    var sig = orgSig(name);
    if (!sig.length) return false;
    var rt = letterToks(refText, true).filter(function (w) { return !ORG_STOP[w]; });
    if (hasRun(rt, sig)) return true;
    if (sig.length >= 3) {
      var acr = sig.map(function (w) { return Array.from(w)[0]; }).join("").toUpperCase();
      var re = new RegExp("(?<![\\p{L}\\p{N}])" + acr + "(?![\\p{L}\\p{N}])", "u");
      if (re.test(String(refText).normalize("NFKC"))) return true;
    }
    return false;
  }

  // ----- 제목 -----

  // 정렬 표(접미·접두 LCS)
  function lcsTables(a, b) {
    var n = a.length, m = b.length, S = [], P = [], i, j;
    for (i = 0; i <= n + 1; i++) { S.push(new Array(m + 2).fill(0)); P.push(new Array(m + 2).fill(0)); }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) S[i][j] = a[i] === b[j] ? S[i + 1][j + 1] + 1 : Math.max(S[i + 1][j], S[i][j + 1]);
    }
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) P[i][j] = a[i - 1] === b[j - 1] ? P[i - 1][j - 1] + 1 : Math.max(P[i - 1][j], P[i][j - 1]);
    }
    return { S: S, P: P };
  }

  // 가장 이른 위치끼리 맞춘 정렬 [[제목 인덱스, 문구 인덱스], …]
  function alignForward(a, b, S) {
    var out = [], i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j] && S[i][j] === S[i + 1][j + 1] + 1) { out.push([i, j]); i++; j++; }
      else if (S[i + 1][j] === S[i][j]) i++;
      else j++;
    }
    return out;
  }

  // 가장 늦은 위치끼리 맞춘 정렬
  function alignBackward(a, b, P) {
    var out = [], i = a.length, j = b.length;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1] && P[i][j] === P[i - 1][j - 1] + 1) { out.push([i - 1, j - 1]); i--; j--; }
      else if (P[i - 1][j] === P[i][j]) i--;
      else j--;
    }
    return out.reverse();
  }

  // 제목의 숫자·로마 숫자 낱말은 전부 정렬되어야 하고,
  // 정렬된 문구 구간(첫~끝) 안의 숫자·로마 숫자 낱말은 모두 제목과 짝이 있어야 한다.
  function numbersOk(words, refWords, al) {
    if (!al.length) return false;
    var cand = {}, ref = {}, k;
    for (k = 0; k < al.length; k++) { cand[al[k][0]] = true; ref[al[k][1]] = true; }
    for (k = 0; k < words.length; k++) if (isNumber(words[k]) && !cand[k]) return false;
    var lo = al[0][1], hi = al[al.length - 1][1];
    for (k = lo; k <= hi; k++) if (isNumber(refWords[k]) && !ref[k]) return false;
    return true;
  }

  // 후보 제목이 인용된 제목의 앞부분일 뿐인가(제목 바로 뒤에 낱말이 이어지거나 ':' '-' 부제가 붙음)
  function titleContinues(refV, titleV) {
    var tt = titleV.raw.map(function (x) { return x.t; });
    if (!tt.length) return false;
    var r = refV;
    var found = false;
    for (var i = 0; i + tt.length <= r.raw.length; i++) {
      var ok = true;
      for (var j = 0; j < tt.length; j++) if (r.raw[i + j].t !== tt[j]) { ok = false; break; }
      if (!ok) continue;
      found = true;
      var next = r.raw[i + tt.length];
      if (!next) return false;
      var gap = r.str.slice(r.raw[i + tt.length - 1].e, next.s).replace(/\s+/g, "");
      if (!(gap === "" || /^[:\-–—]+$/.test(gap))) return false; // 제목이 끝나는 곳이 있음
    }
    return found;
  }

  // 제목 하나(보기 하나씩)의 판정: 통과하면 { n, full }, 아니면 null
  function evalTitle(refV, titleV) {
    var w = titleV.words, r = refV.words, n = w.length;
    if (n < 3) return null;
    var T = lcsTables(w, r);
    var lcs = T.S[0][0];
    if (n <= 6 ? lcs !== n : lcs / n < 0.8) return null; // 짧은 제목은 전부, 긴 제목은 순서 일치 80%
    if (!(numbersOk(w, r, alignForward(w, r, T.S)) || numbersOk(w, r, alignBackward(w, r, T.P)))) return null;
    if (titleContinues(refV, titleV)) return null;
    return { n: n, full: lcs === n };
  }

  // 정정·철회·답변·논평·심사류 표제(앞 세 낱말 안): 서지 문구에도 같은 낱말이 있을 때만
  var NOTICE_WORDS = ["correction", "corrigendum", "erratum", "errata", "retraction", "retracted", "withdrawal",
    "addendum", "reply", "response", "comment", "commentary", "editorial", "discussion"];
  var NOTICE_PHRASES = [["book", "review"], ["decision", "letter"], ["author", "response"], ["peer", "review"],
    ["review", "for"], ["expression", "of", "concern"]];

  function noticeOk(refText, title) {
    var head = view(title, false).raw.slice(0, 3).map(function (x) { return x.t; });
    var ref = view(refText, false).raw.map(function (x) { return x.t; });
    var k;
    for (k = 0; k < head.length; k++) {
      if (NOTICE_WORDS.indexOf(head[k]) !== -1 && ref.indexOf(head[k]) === -1) return false;
    }
    for (k = 0; k < NOTICE_PHRASES.length; k++) {
      if (hasRun(head, NOTICE_PHRASES[k]) && !hasRun(ref, NOTICE_PHRASES[k])) return false;
    }
    return true;
  }

  var BAD_TYPES = { "peer-review": 1, "journal-issue": 1, "journal": 1, "book-series": 1, "component": 1 };

  // 비교할 제목 문자열들: 제목, 제목+부제(별도 필드), 부제를 뺀 앞부분(낱말 5개 이상일 때만)
  function titleVariants(title, subtitle) {
    var out = [title];
    if (subtitle) out.push(title + ": " + subtitle);
    var m = /^(.*?)(?::\s| [–—-] )/.exec(title);
    if (m && m[1] && normalizeTitle(m[1]).length >= 5) out.push(m[1]);
    return out;
  }

  function authorOk(refText, authors, r) {
    var ak = authorKey(authors);
    if (ak) return ak.org ? orgMatch(refText, ak.org) : familyMatch(refText, ak.family);
    return r.n >= 8 && r.full; // 저자 정보가 없으면 긴 제목이 전부 일치할 때만
  }

  function isMatch(refText, candidate) {
    if (!candidate || typeof refText !== "string") return false;
    var title = candidate.title;
    if (typeof title !== "string" || !title) return false;
    if (typeof candidate.type === "string" && own(BAD_TYPES, candidate.type)) return false;
    if (mostlyHangul(title) || mostlyHangul(refText)) return false;
    var year = candidate.year == null ? "" : String(candidate.year);
    if (!year || yearsIn(refText).indexOf(year) === -1) return false;
    if (!noticeOk(refText, title)) return false;

    var sub = typeof candidate.subtitle === "string" ? candidate.subtitle : "";
    var vars = titleVariants(title, sub);
    for (var a = 0; a < vars.length; a++) {
      for (var jr = 0; jr < 2; jr++) {
        var rv = view(refText, jr === 1);
        for (var jt = 0; jt < 2; jt++) {
          var r = evalTitle(rv, view(vars[a], jt === 1));
          if (r && authorOk(refText, candidate.author, r)) return true;
        }
      }
    }
    return false;
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
      return own(ENTITIES, k) ? ENTITIES[k] : m;
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
    "journal-article": "",
    "book-chapter": "책의 장", "book-section": "책의 장", "book-part": "책의 장", "reference-entry": "책의 장",
    "book": "책", "monograph": "책", "edited-book": "책", "reference-book": "책",
    "dissertation": "학위논문", "proceedings-article": "학술대회 논문", "posted-content": "프리프린트",
    "report": "보고서", "report-component": "보고서", "dataset": "데이터세트", "standard": "표준"
  };

  function typeLabelOf(type) {
    if (typeof type !== "string" || !type) return "";
    return own(TYPE_LABELS, type) ? TYPE_LABELS[type] : "기타 자료";
  }

  function toData(item) {
    var ct = Array.isArray(item["container-title"]) ? item["container-title"][0] : "";
    return {
      title: titleOf(item),
      authors: authorLine(item.author),
      year: yearOf(item),
      journal: typeof ct === "string" ? stripMarkup(ct) : "",
      typeLabel: typeLabelOf(item.type),
      abstract: typeof item.abstract === "string" ? cutAbstract(item.abstract) : "",
      doi: validDoi(item.DOI) ? item.DOI : ""
    };
  }

  // 화면에 그릴 내용(DOM 없음): 제목, 줄들, 초록, DOI 주소(유효하지 않으면 "")
  function viewModel(d) {
    var lines = [];
    if (d.authors) lines.push({ label: "저자", value: d.authors });
    if (d.year) lines.push({ label: "연도", value: d.year });
    if (d.journal) lines.push({ label: "학술지", value: d.journal, typeLabel: d.typeLabel || "" });
    else if (d.typeLabel) lines.push({ label: "유형", value: d.typeLabel });
    return { title: d.title, lines: lines, abstract: d.abstract || "", href: doiUrl(d.doi), source: "서지 정보: Crossref" };
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
    if (mostlyHangul(q)) return Promise.resolve({ status: "nomatch" }); // 국문 문헌은 조회하지 않음
    if (cache[q]) return cache[q];
    var url;
    try {
      url = apiBase() + "?rows=3&select=" + encodeURIComponent("title,subtitle,author,issued,container-title,DOI,abstract,type") +
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

  function line(l) {
    var d = el("div", "biblio-line");
    d.appendChild(el("span", "biblio-label", l.label));
    d.appendChild(el("span", "biblio-value", l.value));
    if (l.typeLabel) d.appendChild(el("span", "biblio-type", l.typeLabel));
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
        var vm = viewModel(r.data);
        container.appendChild(el("p", "biblio-title", vm.title));
        vm.lines.forEach(function (l) { container.appendChild(line(l)); });
        if (vm.abstract) container.appendChild(el("p", "biblio-abstract", vm.abstract));
        if (vm.href) {
          var a = el("a", "biblio-link", "원문 보기 (DOI)");
          a.href = vm.href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          container.appendChild(a);
        }
        container.appendChild(el("p", "biblio-source", vm.source));
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
    stripTags: stripTags, apiBaseFor: apiBaseFor, toData: toData, cutAbstract: cutAbstract, render: render, reset: reset,
    viewModel: viewModel, mostlyHangul: mostlyHangul
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.ReaderBiblio = api;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
    else wire();
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
