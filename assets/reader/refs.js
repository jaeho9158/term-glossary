// 참고문헌·인용·그림/표/절/식 참조 찾기(순수 함수). 브라우저에서는 window.ReaderRefs, Node 테스트에서는 require.
//
// 원칙: 틀린 카드는 카드 없음보다 나쁘다. 확실하지 않으면 연결하지 않는다.
//  - 번호식 인용: 대괄호 안의 숫자만, 번호가 참고문헌 수 범위 안일 때만. 소괄호 숫자 "(5)", 연도 "[2020]" 는 인용이 아니다.
//  - 저자-연도식 인용: 첫 저자 성(한글은 이름 전체)과 연도가 같은 항목이 정확히 하나이고 저자 수가 서로 어긋나지 않을 때만.
//  - 참조 대상: 줄 머리에서 시작하는 캡션만(식은 줄 오른쪽 끝의 번호).
// 쪽 글은 ReaderTextMap 의 쪽 글(줄은 "\n", 자간 한글은 이미 접힘)이다. 모든 위치는 쪽 글 글자 번호이고, 내부에서 글자 수를 바꾸지 않는다.
// 쪽 글에는 PDF 가 낸 NUL(\u0000)이 공백 대신 들어 있는 경우가 있어 norm() 이 같은 길이의 공백으로 바꿔 쓴다.
(function (root) {
  "use strict";

  // ---------- 공통 ----------
  var SAME_LEN_SPACE = /[\u0000  -  　]/g;
  function norm(t) { return String(t == null ? "" : t).replace(SAME_LEN_SPACE, " "); }

  function splitLines(t) {
    var out = [];
    var pos = 0;
    while (pos <= t.length) {
      var nl = t.indexOf("\n", pos);
      if (nl < 0) nl = t.length;
      out.push({ s: pos, e: nl, text: t.slice(pos, nl) });
      pos = nl + 1;
    }
    return out;
  }

  var PARTICLE = "(?:van|von|de|der|den|del|della|di|da|dos|das|du|la|le|bin|ibn|al|el|ter|ten)";
  var NAME_LAT = "(?:" + PARTICLE + "\\s+)*\\p{Lu}[\\p{L}'’\\-]+";
  var NAME_LAT_FULL = new RegExp("^" + NAME_LAT + "$", "u");
  var NAME_HAN_FULL = /^[가-힣]{2,8}$/;
  var YEAR = "(?:19|20)\\d\\d[a-z]?";

  var NOT_AUTHOR = {};
  ("figure fig figs table tab tables eq eqs equation equations section sec sect chapter appendix page pages panel scheme supplementary " +
    "in see since from during version release vol no step study case group type stage phase model test level week day year " +
    "january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec " +
    "spring summer fall autumn winter the this that these those cf eg ie " +
    "그림 표 식 절 장 부록 쪽 년 월 제 참고 예 이후 이전 현재 이상 이하").split(" ").forEach(function (w) { NOT_AUTHOR[w] = true; });

  function stripDiacritics(s) { return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s; }
  // 첫 저자 비교 키: 소문자, 발음 부호 제거, 앞의 관사류(van, de …) 제거, 문자만.
  function surnameKey(name) {
    var s = stripDiacritics(String(name || "")).toLowerCase().replace(/[’']s$/, "");
    s = s.replace(new RegExp("^(?:" + PARTICLE + "\\s+)+", "i"), "");
    return s.replace(/[^a-z가-힣]/g, "");
  }

  // ---------- 참고문헌 구역 ----------
  var HEADING_RE = new RegExp(
    "^[ \\t]*(?:(?:\\d{1,2}|[IVX]{1,4}|[Ⅰ-Ⅻ])[.)]?[ \\t]*)?" +
    "(?:references?|bibliography|참\\s?고\\s?문\\s?헌|인\\s?용\\s?문\\s?헌)[ \\t]*[:：]?[ \\t]*$", "gim");
  var END_RE = /^[ \t]*(?:(?:appendix|appendices)\b[^\n]{0,40}|부\s?록(?![가-힣A-Za-z0-9])[^\n]{0,30}|supplementary\s+(?:material|information)s?\b[^\n]{0,30}|[<\[]?abstract[>\]]?(?:\b[^\n]{0,80})?|(?:국문|영문|한글)\s?초록)[ \t]*$/gim;

  // 쪽 글 배열(0번이 1쪽) -> {page, offset, endPage, endOffset} | null. page 는 1부터, offset 은 제목 줄 바로 다음 글자.
  function findReferenceSection(pageTexts) {
    var pages = pageTexts || [];
    var hits = [];
    for (var i = 0; i < pages.length; i++) {
      var t = norm(pages[i]);
      HEADING_RE.lastIndex = 0;
      var m;
      while ((m = HEADING_RE.exec(t))) {
        var after = m.index + m[0].length;
        if (t.charAt(after) === "\n") after++;
        hits.push({ page: i + 1, offset: after });
        if (m[0].length === 0) HEADING_RE.lastIndex++;
      }
    }
    if (!hits.length) return null;
    // 쪽마다 반복되는 머리말("References")이면 연속한 쪽의 묶음에서 첫 번째를 쓴다. 여러 묶음이면 마지막 묶음.
    var runStart = hits.length - 1;
    while (runStart > 0 && hits[runStart - 1].page >= hits[runStart].page - 1 && hits[runStart - 1].page !== hits[runStart].page) runStart--;
    for (var c = runStart; c >= 0; c--) {
      var h = hits[c];
      var rest = norm(pages[h.page - 1]).slice(h.offset).trim().length;
      for (var q = h.page; q < pages.length; q++) rest += String(pages[q] || "").trim().length;
      if (rest < 20) continue;
      var end = findSectionEnd(pages, h);
      return { page: h.page, offset: h.offset, endPage: end.page, endOffset: end.offset };
    }
    return null;
  }

  function findSectionEnd(pages, h) {
    for (var p = h.page; p <= pages.length; p++) {
      var t = norm(pages[p - 1]);
      END_RE.lastIndex = p === h.page ? h.offset : 0;
      var m = END_RE.exec(t);
      if (m && m.index >= (p === h.page ? h.offset : 0)) return { page: p, offset: m.index };
    }
    return { page: pages.length, offset: String(pages[pages.length - 1] || "").length };
  }

  // 쪽 p 의 쪽 글에서 참고문헌 구역이 덮는 글자 범위 [from, to). 겹치지 않으면 null.
  function sectionSpanOnPage(section, page, textLength) {
    if (!section || page < section.page || page > section.endPage) return null;
    var from = page === section.page ? section.offset : 0;
    var to = page === section.endPage ? section.endOffset : textLength;
    return to > from ? { from: from, to: to } : null;
  }

  // ---------- 참고문헌 나누기 ----------
  var LABEL_BRACKET = /^[ \t]*(?:\[\s*(\d{1,3})\s*\]|[(（]\s*(\d{1,3})\s*[)）])/;
  var LABEL_DOT = /^[ \t]*(\d{1,3})[.)](?=[ \t]|$)/;
  var LAT_START = new RegExp("^" + NAME_LAT + "(?:\\s+\\p{Lu}[\\p{L}'’\\-]+)?\\s*,\\s*\\p{Lu}\\.", "u");
  var HAN_START_PAREN = new RegExp("^[가-힣]{2,10}[ㆍ･·,&\\s.A-Za-z'’\\-가-힣]{0,70}?[(（]\\s*" + YEAR);
  var HAN_START_DOT = new RegExp("^[가-힣]{2,10}[ㆍ･·,&\\s.A-Za-z'’\\-가-힣]{0,70}?[.,]\\s*" + YEAR + "[.,]");
  var DASH_START = new RegExp("^(?:[_＿─\\-–—]{2,}|\\.)\\s*[.,]?\\s*[(（]?\\s*" + YEAR);
  var LAT_ORG_START = new RegExp("^\\p{Lu}[\\p{L}'’&\\-]*(?:\\s+\\p{Lu}[\\p{L}'’&\\-]*){0,3}\\.\\s*[(（]\\s*" + YEAR, "u");
  var YEAR_NEAR = new RegExp("[(（]\\s*" + YEAR + "(?:[,\\s][^)）]{0,14})?\\s*[)）]|[.,]\\s*" + YEAR + "\\s*[.,;)]");
  var SUBHEAD_RE = /^[ \t]*(?:\d+[.)]\s*)?(?:국내|국외|외국|해외|한국|영문|국문|동양|서양|웹|인터넷|기타|단행본|학술지)?[ \t]*(?:문헌|논문|자료|서적|논저|저서|사이트|웹사이트|참고자료|보고서|서양서|동양서)[ \t]*[:：]?[ \t]*$/;

  function isAyStart(lines, i, win) {
    var line = lines[i].text;
    if (!line.trim()) return false;
    if (i > 0) {
      var prev = lines[i - 1].text.replace(/\s+$/, "");
      if (/[,&ㆍ･·]$/.test(prev) || /\band$/i.test(prev)) return false;
    }
    var s = line.replace(/^\s+/, "");
    var w = win;
    if (DASH_START.test(s) || LAT_ORG_START.test(w)) return true;
    if (LAT_START.test(s)) {
      var rest = w.slice(0, 260);
      return YEAR_NEAR.test(rest);
    }
    if (HAN_START_PAREN.test(w) || HAN_START_DOT.test(w)) {
      // 저자 자리의 낱말이 너무 길거나 많으면 본문 이어짐으로 본다
      var head = w.split(/[(（]/)[0];
      var toks = head.split(/[ㆍ･·,&\s.]+/).filter(Boolean);
      if (toks.length > 9) return false;
      for (var k = 0; k < toks.length; k++) if (toks[k].length > 10) return false;
      return true;
    }
    return false;
  }

  // 참고문헌 구역 글 -> [{n, text, start, end}]. text 는 입력의 start..end 조각 그대로(번호 표시 포함).
  function splitReferences(text) {
    var t = norm(text);
    var lines = splitLines(t);
    var i;

    // 번호식 후보: 순서대로 1, 2, 3 … 으로 이어지는 줄 머리 번호만 인정(중간의 "2.5 mg" 같은 줄은 건너뛴다)
    var numStarts = [];
    var last = 0;
    for (i = 0; i < lines.length; i++) {
      var mb = LABEL_BRACKET.exec(lines[i].text);
      var md = mb ? null : LABEL_DOT.exec(lines[i].text);
      if (!mb && !md) continue;
      var n = parseInt(mb ? (mb[1] || mb[2]) : md[1], 10);
      var ok;
      if (last === 0) ok = n === 1 || (!!mb && n <= 2);
      else ok = n === last + 1 || (!!mb && n > last + 1 && n <= last + 3);
      if (ok) { numStarts.push({ i: i, n: n }); last = n; }
    }
    var ayStarts = [];
    for (i = 0; i < lines.length; i++) {
      var win = (lines[i].text + " " + (lines[i + 1] ? lines[i + 1].text : "") + " " + (lines[i + 2] ? lines[i + 2].text : "")).replace(/\s+/g, " ").replace(/^\s+/, "");
      if (isAyStart(lines, i, win)) ayStarts.push({ i: i, n: null });
    }

    var numbered = numStarts.length >= 3 ? ayStarts.length < numStarts.length : (numStarts.length === 2 && ayStarts.length === 0);
    var starts = numbered ? numStarts : ayStarts;
    var out = [];
    for (var k = 0; k < starts.length; k++) {
      var s = lines[starts[k].i].s;
      var e = k + 1 < starts.length ? lines[starts[k + 1].i].s : t.length;
      // 하위 제목("2. 국외문헌") 줄은 앞 항목 끝에서 뗀다
      var sub = e;
      var lastLine = starts[k + 1] ? starts[k + 1].i - 1 : lines.length - 1;
      while (lastLine > starts[k].i && SUBHEAD_RE.test(lines[lastLine].text)) { sub = lines[lastLine].s; lastLine--; }
      e = sub;
      var seg = t.slice(s, e);
      var trimmedEnd = seg.replace(/\s+$/, "").length;
      e = s + trimmedEnd;
      if (e <= s) continue;
      out.push({ n: starts[k].n, text: String(text).slice(s, e), start: s, end: e });
    }
    return out;
  }

  // ---------- 참고문헌 항목 요약(저자·연도) ----------
  var REF_YEAR_PAREN = new RegExp("[(（]\\s*(" + YEAR + ")\\s*[,)）]");
  var REF_YEAR_BARE = new RegExp("[.,]\\s*(" + YEAR + ")\\s*[.,;]");
  var REF_LABEL = /^\s*(?:\[\s*\d{1,3}\s*\]|[(（]\s*\d{1,3}\s*[)）]|\d{1,3}[.)])\s*/;

  function metaFor(entry, prev) {
    var raw = norm(entry.text).replace(REF_LABEL, "").replace(/\s+/g, " ").trim();
    var meta = { key: null, year: null, authors: "", multi: false, inherited: false };
    var ym = REF_YEAR_PAREN.exec(raw);
    if (!ym || ym.index > 220) ym = REF_YEAR_BARE.exec(raw);
    if (ym && ym.index <= 220) { meta.year = ym[1]; meta.authors = raw.slice(0, ym.index); }
    else return meta;
    var seg = meta.authors;
    // 앞 저자와 같다는 표시("____.", ".")
    if (/^(?:[_＿─\-–—]{2,}|\.)?\s*[.,]?\s*$/.test(seg) && prev && prev.key) {
      meta.key = prev.key; meta.authors = prev.authors; meta.multi = prev.multi; meta.inherited = true;
      return meta;
    }
    var m = /^([가-힣]{2,10})(?=\s*(?:[.,ㆍ･·&]|\(|（|\s+(?:외|등|역|편|저)\b|(?:외|등|역|편|저)(?:[\s.,(（]|$))|\s*$)/.exec(seg);
    if (m) {
      meta.key = m[1];
      var restH = seg.slice(m[1].length).replace(/^\s*(?:역|편|저|엮음)?[.\s]*/, "");
      meta.multi = /[,ㆍ･·&]|(?:^|\s)(?:외|등)(?:\s|\.|$)|et\s+al|[가-힣]{2,}\s+[가-힣]{2,}/.test(restH) || /(?:^|\s)(?:외|등)(?:\s|\.|$)/.test(seg);
      return meta;
    }
    var ml = new RegExp("^(" + NAME_LAT + ")(?=\\s*,\\s*\\p{Lu}\\.|\\s*,\\s*\\p{Lu}\\b|\\s*&|\\s+and\\b|\\s+et\\s+al|\\s*\\.?\\s*$)", "u").exec(seg);
    if (ml) {
      meta.key = surnameKey(ml[1]);
      meta.multi = /&|\band\b|\bet\s+al/i.test(seg) || (seg.match(/,/g) || []).length >= 2;
    }
    return meta;
  }

  var metaCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function metaList(refs) {
    var cached = metaCache && metaCache.get(refs);
    if (cached && cached.len === refs.length) return cached.list;
    var list = [];
    for (var i = 0; i < refs.length; i++) list.push(metaFor(refs[i], list[i - 1] || null));
    if (metaCache) metaCache.set(refs, { len: refs.length, list: list });
    return list;
  }

  // ---------- 번호식 인용 ----------
  var NUM_CITE_RE = /\[\s*(\d{1,4}(?:\s*[-‐-―~]\s*\d{1,4})?(?:\s*[,，;]\s*\d{1,4}(?:\s*[-‐-―~]\s*\d{1,4})?)*)\s*\]/g;

  function findNumericCitations(pageText, refCount) {
    var out = [];
    var max = Math.floor(Number(refCount)) || 0;
    if (max <= 0) return out;
    var t = norm(pageText);
    NUM_CITE_RE.lastIndex = 0;
    var m;
    while ((m = NUM_CITE_RE.exec(t))) {
      var start = m.index;
      // 수식·배열 첨자 "x[1]": 한 글자(또는 숫자) 바로 뒤에 붙은 대괄호는 인용이 아니다
      var before = start > 0 ? t.charAt(start - 1) : "";
      var before2 = start > 1 ? t.charAt(start - 2) : "";
      if (/[0-9)]/.test(before) || (/[A-Za-z]/.test(before) && !/[A-Za-z가-힣]/.test(before2))) continue;
      var nums = [];
      var good = true;
      var parts = m[1].split(/[,，;]/);
      for (var i = 0; i < parts.length && good; i++) {
        var rg = parts[i].split(/[-‐-―~]/);
        var a = parseInt(rg[0], 10);
        var b = rg.length > 1 ? parseInt(rg[1], 10) : a;
        if (!(a >= 1) || !(b >= a) || b > max || b - a > 60) { good = false; break; }
        for (var v = a; v <= b; v++) if (nums.indexOf(v) < 0) nums.push(v);
      }
      if (good && nums.length) out.push({ start: start, end: start + m[0].length, numbers: nums });
    }
    return out;
  }

  // ---------- 저자-연도식 인용 ----------
  var LEAD_RE = /^(?:see\s+also|see|e\.g\.,?|cf\.?|i\.e\.,?|also|compare|참조|예컨대|예를\s*들어)\s*[,:]?\s*/i;
  var SPLIT_NAMES = /\s*,\s*|\s*&\s*|\s+and\s+|\s*[ㆍ･·]\s*|(?<=[가-힣]{2})[와과]\s+|\s+및\s+/;
  var ET_AL_END = /\s*,?\s*(?:et\s+al\.?|외|등|and\s+others)\s*$/i;
  var REST_OK = /^(?:[,:]?\s*(?:pp?\.|쪽)?\s*\d[\d\s,\-–]*|[,;]?\s*(?:19|20)\d\d[a-z]?(?:\s*[,;]\s*(?:19|20)\d\d[a-z]?)*)?$/;

  function validNames(list) {
    if (!list.length || list.length > 6) return false;
    for (var i = 0; i < list.length; i++) {
      var nm = list[i];
      if (!(NAME_LAT_FULL.test(nm) || NAME_HAN_FULL.test(nm))) return false;
    }
    var first = list[0].toLowerCase();
    if (NOT_AUTHOR[first] || NOT_AUTHOR[first.replace(/\.$/, "")]) return false;
    return true;
  }

  function parseNames(str) {
    var s = str.trim().replace(/[,\s]+$/, "");
    var etAl = false;
    var em = ET_AL_END.exec(s);
    if (em) { etAl = true; s = s.slice(0, em.index); }
    s = s.replace(/[’']s$/, "");
    var names = s.split(SPLIT_NAMES).map(function (x) { return x.trim(); }).filter(Boolean);
    return validNames(names) ? { authors: names, etAl: etAl } : null;
  }

  function parseParenSegment(seg, base) {
    var lead = /^\s*/.exec(seg)[0].length;
    var s = seg.slice(lead);
    var off = base + lead;
    var lm = LEAD_RE.exec(s);
    if (lm) { s = s.slice(lm[0].length); off += lm[0].length; }
    var ym = new RegExp("^(.+?)[,\\s]\\s*(" + YEAR + ")(?!\\d)(.*)$", "s").exec(s);
    if (!ym) return null;
    var rest = ym[3].trim();
    if (!REST_OK.test(rest)) return null;
    var names = parseNames(ym[1]);
    if (!names) return null;
    var end = off + ym[1].length + (ym[0].length - ym[1].length - ym[3].length);
    return { start: off, end: end, authors: names.authors, year: ym[2], etAl: names.etAl };
  }

  var NARR_LAT = new RegExp(
    "(?<![\\p{L}\\d'’\\-])(" + NAME_LAT + "(?:(?:\\s*,\\s*" + NAME_LAT + ")*\\s*,?\\s+(?:and|&)\\s+" + NAME_LAT + ")?)(\\s+et\\s+al\\.?)?\\s*[(（]\\s*(" + YEAR + ")\\s*[)）]", "gu");
  var NARR_HAN = new RegExp(
    "(?<![가-힣])([가-힣]{2,8}(?:(?:[ㆍ･·]|\\s*,\\s*|와\\s*|과\\s*|\\s+및\\s+)[가-힣]{2,8})*)(\\s*(?:외|등))?\\s*[(（]\\s*(" + YEAR + ")\\s*[)）]", "gu");

  function findAuthorYearCitations(pageText) {
    var t = norm(pageText);
    var all = [];
    var m;
    var paren = /[(（]([^()（）]{3,260})[)）]/g;
    while ((m = paren.exec(t))) {
      var inner = m[1];
      var base = m.index + 1;
      var pos = 0;
      var parts = inner.split(/[;；]/);
      for (var i = 0; i < parts.length; i++) {
        var c = parseParenSegment(parts[i], base + pos);
        if (c) all.push(c);
        pos += parts[i].length + 1;
      }
    }
    NARR_LAT.lastIndex = 0;
    while ((m = NARR_LAT.exec(t))) {
      var nm = parseNames(m[1] + (m[2] ? " et al." : ""));
      if (nm) all.push({ start: m.index, end: m.index + m[0].length, authors: nm.authors, year: m[3], etAl: nm.etAl });
    }
    NARR_HAN.lastIndex = 0;
    while ((m = NARR_HAN.exec(t))) {
      var nh = parseNames(m[1] + (m[2] ? " " + m[2].trim() : ""));
      if (nh) all.push({ start: m.index, end: m.index + m[0].length, authors: nh.authors, year: m[3], etAl: nh.etAl });
    }
    all.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    var out = [];
    var lastEnd = -1;
    for (var k = 0; k < all.length; k++) {
      if (all[k].start < lastEnd) continue;
      out.push(all[k]);
      lastEnd = all[k].end;
    }
    return out;
  }

  // 인용 -> refs 의 번호(0부터). 첫 저자와 연도가 같은 항목이 정확히 하나이고 저자 수가 어긋나지 않을 때만.
  function matchAuthorYear(citation, refs) {
    if (!citation || !refs || !refs.length || !citation.authors || !citation.authors.length || !citation.year) return -1;
    var metas = metaList(refs);
    var firstName = citation.authors[0];
    var key = NAME_HAN_FULL.test(firstName) ? firstName : surnameKey(firstName);
    if (!key) return -1;
    var cy = String(citation.year);
    var hasLetter = /[a-z]$/.test(cy);
    var hit = -1;
    var count = 0;
    for (var i = 0; i < metas.length; i++) {
      var mt = metas[i];
      if (!mt.key || mt.key !== key || !mt.year) continue;
      var yearOk = hasLetter ? mt.year === cy : mt.year.replace(/[a-z]$/, "") === cy;
      if (!yearOk) continue;
      if (!authorCountsAgree(citation, mt)) continue; // 저자 수가 어긋나는 항목은 후보에서 뺀다
      count++;
      hit = i;
    }
    return count === 1 ? hit : -1;
  }

  function authorCountsAgree(cite, mt) {
    var named = cite.authors.length;
    if (cite.etAl) return mt.multi || /et\s+al/i.test(mt.authors);
    if (named === 1) return !mt.multi;
    if (!mt.multi) return false;
    var seg = stripDiacritics(norm(mt.authors)).toLowerCase();
    for (var i = 1; i < named; i++) {
      var k = NAME_HAN_FULL.test(cite.authors[i]) ? cite.authors[i] : surnameKey(cite.authors[i]);
      if (!k || seg.indexOf(k) < 0) return false;
    }
    return true;
  }

  // ---------- 그림·표·절·식 참조 ----------
  var ROMAN = { I: 1, V: 5, X: 10 };
  function romanToInt(s) {
    if (!/^[IVX]{1,5}$/.test(s)) return 0;
    var total = 0;
    for (var i = 0; i < s.length; i++) {
      var v = ROMAN[s.charAt(i)];
      var nx = i + 1 < s.length ? ROMAN[s.charAt(i + 1)] : 0;
      total += v < nx ? -v : v;
    }
    return total > 0 && total < 40 ? total : 0;
  }
  function numOf(str) {
    if (/^\d+$/.test(str)) return String(parseInt(str, 10));
    var r = romanToInt(str);
    return r ? String(r) : "";
  }

  var XREF_DEFS = [
    { kind: "fig", re: /(?<![\p{L}\d])(?:Figures?|FIGURES?|Figs?|FIGS?)\.?[ \t]*(\d{1,3})(?:[a-z]\b)?/gu, num: 1 },
    { kind: "fig", re: /(?<![가-힣])그림[ \t]*(\d{1,3})/gu, num: 1 },
    { kind: "table", re: /(?<![\p{L}\d])(?:Tables?|TABLES?|Tab)\.?[ \t]*(\d{1,3}|[IVX]{1,5}(?![A-Za-z]))/gu, num: 1 },
    { kind: "table", re: /(?<![가-힣])표[ \t]*(\d{1,3})/gu, num: 1 },
    { kind: "eq", re: /(?<![\p{L}\d])(?:Eqs?|EQs?|Equations?)\.?[ \t]*[(（]?[ \t]*(\d{1,3})[ \t]*[)）]?/gu, num: 1 },
    { kind: "eq", re: /(?<![가-힣])식[ \t]*[(（][ \t]*(\d{1,3})[ \t]*[)）]/gu, num: 1 },
    { kind: "sec", re: /(?<![\p{L}\d])(?:Sections?|Sect?\.)[ \t]*(\d{1,2}(?:\.\d{1,2}){0,3})(?![\d])/gu, num: 1 },
    { kind: "sec", re: /§[ \t]*(\d{1,2}(?:\.\d{1,2}){0,3})(?![\d])/gu, num: 1 },
    { kind: "sec", re: /(?<![\d.])(\d{1,2}(?:\.\d{1,2}){0,3})[ \t]*절(?![가-힣]{0}\d)/gu, num: 1 },
  ];

  var SUPPL_BEFORE = /(?:supplement(?:ary|al)?|suppl?\.?|appendix|online|extended|additional|부록|보충|추가|별첨)[\s\u0000-]*(?:figure|fig\.?|table|tab\.?|표|그림)?[\s(]*$/i;

  function findCrossRefs(pageText) {
    var t = norm(pageText);
    var all = [];
    for (var d = 0; d < XREF_DEFS.length; d++) {
      var def = XREF_DEFS[d];
      def.re.lastIndex = 0;
      var m;
      while ((m = def.re.exec(t))) {
        var num = def.kind === "sec" ? m[def.num] : numOf(m[def.num]);
        if (!num) continue;
        if (SUPPL_BEFORE.test(t.slice(Math.max(0, m.index - 28), m.index))) continue; // "Supplementary Table 1" 은 본문의 표 1 이 아니다
        all.push({
          start: m.index,
          end: m.index + m[0].length,
          kind: def.kind,
          label: m[0].replace(/\s+/g, " ").trim(),
          num: num,
          key: def.kind + ":" + num,
        });
      }
    }
    all.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    var out = [];
    var lastEnd = -1;
    for (var k = 0; k < all.length; k++) {
      if (all[k].start < lastEnd) continue;
      out.push(all[k]);
      lastEnd = all[k].end;
    }
    return out;
  }

  // ---------- 참조 대상(캡션·식 번호) ----------
  var CAP_RE = /^[ \t]*([<〈\[【]?)[ \t]*(Figure|FIGURE|Fig|FIG|Table|TABLE|Tab|그림|표)(\.?)[ \t]*(\d{1,3}|[IVX]{1,5}(?![A-Za-z]))[ \t]*([>〉\]】]?)(.*)$/u;
  var CONTINUED_RE = /^(?:\(?(?:continued|cont\.?)\)?|\(?계속\)?|이어서)/i;
  var DOT_LEADER = /(?:\.{4,}|·{3,}|…+|[.•]\s?[.•]\s?[.•]\s?[.•])\s*\d+\s*$/;
  var EQ_END = /^(.*?)[ \t]*[(（]\s*(\d{1,3})\s*[)）][ \t]*$/;
  var MATH_SIGN = /[=≈≠≤≥∑∫∂√±×÷∈∝]/;

  // 줄 하나가 캡션 머리인지. {kind, num} | null.
  function captionOfLine(line, prevLine) {
    var m = CAP_RE.exec(line);
    if (!m) return null;
    var word = m[2];
    var kind = /^(?:Fig|FIG|Figure|FIGURE|그림)$/.test(word) ? "fig" : "table";
    var hangul = word === "그림" || word === "표";
    var num = numOf(m[4]);
    if (!num) return null;
    if (/^[IVX]/.test(m[4]) && kind === "fig") return null; // 로마 숫자 그림 번호는 받지 않는다
    var open = m[1];
    var close = m[5];
    var rest = m[6];
    var restTrim = rest.replace(/^[ \t]+/, "");
    var ok;
    if (open && close) ok = rest === "" || (/^[ \t]/.test(rest) && !/^[a-z]/.test(restTrim)); // <표 1>, [그림 2] — "<표 1>과" 처럼 조사가 붙은 본문은 아니다
    else if (open || close) ok = false;
    else if (/^[.:：|·\-–—](?:[ \t]|$)/.test(rest)) ok = true; // "Fig. 3." 뒤에 공백이 있어야 한다("Fig. 1.에서" 는 본문)
    else if (restTrim === "") ok = true;
    else if (!hangul && /^[ \t]/.test(rest) && /^\p{Lu}/u.test(restTrim)) ok = true; // "Table 2 Results of …"
    else ok = false;
    if (!ok) return null;
    if (CONTINUED_RE.test(restTrim.replace(/^[.:：]\s*/, ""))) return null; // "Table 5. Continued" 는 이어진 쪽이지 캡션이 아니다
    if (DOT_LEADER.test(line)) return null; // 그림·표 목차 줄
    if (prevLine != null) {
      var p = prevLine.replace(/\s+$/, "");
      // 앞 줄이 문장 중간에서 끊긴 긴 본문 줄이면, 이 줄은 본문이 줄바꿈된 것이다
      if (p.length >= 40 && !/[.!?。)\]”"'|:]$/.test(p)) return null;
    }
    return { kind: kind, num: num };
  }

  function equationOfLine(line, prevLine) {
    var m = EQ_END.exec(line);
    if (!m) return null;
    var body = m[1];
    var num = String(parseInt(m[2], 10));
    if (line.length > 160) return null;
    var words = (body.match(/[A-Za-z]{3,}/g) || []).length;
    if (words >= 6) return null; // 문장
    if (body.trim().length === 0) {
      if (prevLine && MATH_SIGN.test(prevLine) && (prevLine.match(/[A-Za-z]{3,}/g) || []).length < 6) return { num: num };
      return null;
    }
    if (!MATH_SIGN.test(body)) return null;
    return { num: num };
  }

  // 쪽 글 배열 -> Map("fig:3" | "table:2" | "eq:5" -> {page, offset}). 참고문헌 구역 안은 제외. 같은 번호는 첫 번째.
  function findTargets(pageTexts) {
    var out = new Map();
    var pages = pageTexts || [];
    var section = findReferenceSection(pages);
    for (var p = 1; p <= pages.length; p++) {
      var t = norm(pages[p - 1]);
      var span = sectionSpanOnPage(section, p, t.length);
      var lines = splitLines(t);
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (span && ln.s >= span.from && ln.s < span.to) continue;
        var prevLine = i > 0 ? lines[i - 1].text : null;
        var cap = captionOfLine(ln.text, prevLine);
        if (cap) {
          var k = cap.kind + ":" + cap.num;
          if (!out.has(k)) out.set(k, { page: p, offset: ln.s + (ln.text.length - ln.text.replace(/^[ \t]+/, "").length) });
          continue;
        }
        var eq = equationOfLine(ln.text, prevLine);
        if (eq) {
          var ek = "eq:" + eq.num;
          if (!out.has(ek)) out.set(ek, { page: p, offset: ln.s });
        }
      }
    }
    return out;
  }

  // ---------- 문서 분석(미리보기·측정 페이지가 함께 쓴다) ----------
  // 머리말·꼬리말(여러 쪽에 같은 모양으로 반복되는 첫/끝 두 줄)과 쪽 번호 줄을 참고문헌 글에서 뗀다.
  function headerKeys(pages) {
    var count = {};
    pages.forEach(function (pt) {
      var ls = norm(pt).split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
      var seen = {};
      ls.slice(0, 2).concat(ls.slice(-2)).forEach(function (x) {
        var k = x.replace(/\d+/g, "#").replace(/\s+/g, " ").toLowerCase();
        if (k.length >= 4 && !seen[k]) { seen[k] = true; count[k] = (count[k] || 0) + 1; }
      });
    });
    var need = Math.max(3, Math.ceil(pages.length * 0.25));
    var keys = {};
    Object.keys(count).forEach(function (k) { if (count[k] >= need) keys[k] = true; });
    return keys;
  }

  // 구역의 글(머리말 제거)과 글자 -> {page, offset} 대응. 반환 {text, locate(textOffset)}.
  function collectReferenceText(pageTexts, section) {
    var keys = headerKeys(pageTexts);
    var parts = [];
    var map = []; // {textStart, page, pageOffset}
    var len = 0;
    for (var p = section.page; p <= section.endPage; p++) {
      var t = norm(pageTexts[p - 1] || "");
      var from = p === section.page ? section.offset : 0;
      var to = p === section.endPage ? section.endOffset : t.length;
      var lines = splitLines(t);
      var idxs = [];
      for (var i = 0; i < lines.length; i++) if (lines[i].text.trim()) idxs.push(i);
      var edge = {};
      idxs.slice(0, 2).concat(idxs.slice(-2)).forEach(function (x) { edge[x] = true; });
      for (var j = 0; j < lines.length; j++) {
        var ln = lines[j];
        if (ln.e <= from || ln.s >= to) continue;
        var s = Math.max(ln.s, from);
        var e = Math.min(ln.e, to);
        var piece = t.slice(s, e);
        var trimmed = piece.trim();
        if (!trimmed) continue;
        if (/^\d{1,4}$/.test(trimmed) && edge[j]) continue;
        if (edge[j]) {
          var key = trimmed.replace(/\d+/g, "#").replace(/\s+/g, " ").toLowerCase();
          if (keys[key]) continue;
        }
        if (SUBHEAD_RE.test(piece)) continue;
        map.push({ textStart: len, page: p, pageOffset: s });
        parts.push(piece);
        len += piece.length + 1;
      }
    }
    return {
      text: parts.join("\n"),
      locate: function (off) {
        var lo = 0, hi = map.length - 1, best = 0;
        while (lo <= hi) {
          var mid = (lo + hi) >> 1;
          if (map[mid].textStart <= off) { best = mid; lo = mid + 1; } else hi = mid - 1;
        }
        var e = map[best];
        return e ? { page: e.page, offset: e.pageOffset + (off - e.textStart) } : null;
      },
    };
  }

  // 카드에 보일 한 줄 문구. 앞 저자와 같다는 표시("____.", ".")로 시작하는 항목은 앞 항목의 저자를 채워 넣는다.
  function displayTexts(refs) {
    var metas = metaList(refs);
    return refs.map(function (r, i) {
      var base = referenceDisplayText(r);
      if (metas[i] && metas[i].inherited) {
        var who = String(metas[i].authors || "").trim().replace(/[.,\s]+$/, "");
        base = base.replace(/^(?:[_＿─\-–—]{2,}|\.)?\s*[.,]?\s*/, "");
        if (who) base = who + ". " + base;
      }
      return base;
    });
  }

  // 카드에 쓸 만한 항목 문구인지(깨진 항목, 연도 없는 토막은 연결하지 않는다)
  function referenceUsable(display) {
    var t = String(display || "");
    return t.length >= 25 && /(?:19|20)\d\d/.test(t);
  }

  // 쪽 글 배열 -> {section, refs, numbered, refCount, targets}. refs 의 항목: {n, text, start, end, page, offset}.
  function analyzeDocument(pageTexts) {
    var res = { section: null, refs: [], numbered: false, refCount: 0, targets: new Map() };
    res.section = findReferenceSection(pageTexts);
    res.targets = findTargets(pageTexts);
    if (!res.section) return res;
    var col = collectReferenceText(pageTexts, res.section);
    var refs = splitReferences(col.text);
    refs.forEach(function (r) {
      var loc = col.locate(r.start);
      r.page = loc ? loc.page : res.section.page;
      r.offset = loc ? loc.offset : res.section.offset;
    });
    res.refs = refs;
    res.numbered = refs.length > 0 && refs.every(function (r) { return r.n != null; });
    res.refCount = res.numbered ? refs.reduce(function (a, r) { return Math.max(a, r.n); }, 0) : 0;
    // 번호가 5% 넘게 빠졌으면(쪽 순서가 뒤섞여 항목이 깨진 목록) 번호식 인용은 연결하지 않는다
    res.numericOk = res.numbered && refs.length >= 3 && refs.length >= res.refCount * 0.95;
    res.display = displayTexts(refs);
    return res;
  }

  // 항목 앞의 번호 표시("[3]", "3.")를 뗀 한 줄 문구(카드에 쓴다).
  function referenceDisplayText(ref) {
    return norm(ref && ref.text).replace(REF_LABEL, "").replace(/-\n(?=[a-z])/g, "").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  }

  var api = {
    findReferenceSection: findReferenceSection,
    splitReferences: splitReferences,
    findNumericCitations: findNumericCitations,
    findAuthorYearCitations: findAuthorYearCitations,
    matchAuthorYear: matchAuthorYear,
    findCrossRefs: findCrossRefs,
    findTargets: findTargets,
    // 아래는 미리보기·측정 페이지용
    analyzeDocument: analyzeDocument,
    collectReferenceText: collectReferenceText,
    sectionSpanOnPage: sectionSpanOnPage,
    referenceDisplayText: referenceDisplayText,
    displayTexts: displayTexts,
    referenceUsable: referenceUsable,
    captionOfLine: captionOfLine,
    norm: norm,
  };
  root.ReaderRefs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
