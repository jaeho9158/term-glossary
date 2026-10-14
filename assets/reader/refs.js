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

  // 문장 머리 부사: "However, Park (2020)" 에서 앞의 부사는 저자 목록이 아니다
  var SENT_ADVERB = {};
  ("however moreover furthermore recently similarly therefore thus also additionally specifically notably importantly previously finally " +
    "first second third then here there overall conversely likewise meanwhile consequently subsequently").split(" ").forEach(function (w) { SENT_ADVERB[w] = true; });

  // NFD 로 풀면 한글도 자모로 갈라지므로, 발음 부호를 뗀 뒤 NFC 로 다시 묶는다.
  function stripDiacritics(s) { return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC") : s; }
  // 첫 저자 비교 키: 소문자, 발음 부호 제거, 앞의 관사류(van, de …) 제거, 문자만.
  function surnameKey(name) {
    var s = stripDiacritics(String(name || "")).toLowerCase().replace(/[’']s$/, "");
    s = s.replace(new RegExp("^(?:" + PARTICLE + "\\s+)+", "i"), "");
    return s.replace(/[^a-z가-힣]/g, "");
  }

  // ---------- 참고문헌 구역 ----------
  var HEADING_RE = new RegExp(
    "^[ \\t]*(?:(?:\\d{1,2}|[IVX]{1,4}|[Ⅰ-Ⅻ])[.)]?[ \\t]*)?" +
    "[<〈《【\\[(]?[ \\t]*(?:references?|bibliography|참\\s?고\\s?문\\s?헌|인\\s?용\\s?문\\s?헌)[ \\t]*[>〉》】\\])]?[ \\t]*[:：]?[ \\t]*$", "gim");
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
  // "Kim, Min-Soo (2020)", "Kim, Byung Ho. (2020)": 이름을 다 쓴 서양식
  var LAT_START_FULL = new RegExp("^" + NAME_LAT + "(?:\\s+\\p{Lu}[\\p{L}'’\\-]+)?\\s*,\\s*\\p{Lu}[\\p{L}'’\\-]+(?:[\\s\\-]+\\p{Lu}[\\p{L}'’.\\-]*){0,3}\\.?\\s*(?:[(（,&.]|and\\b)", "u");
  // "Kim B. Title.", "Kim B, Lee C. Title." (밴쿠버식: 쉼표 없는 머리글자)
  var LAT_START_VANC = new RegExp("^" + NAME_LAT + "\\s+\\p{Lu}{1,3}(?=\\s*[,.]|\\s+\\p{Lu}\\.)", "u");
  var HAN_START_PAREN =new RegExp("^[가-힣]{2,10}[ㆍ･·,&\\s.A-Za-z'’\\-가-힣]{0,70}?[(（]\\s*" + YEAR);
  var HAN_START_DOT = new RegExp("^[가-힣]{2,10}[ㆍ･·,&\\s.A-Za-z'’\\-가-힣]{0,70}?[.,]\\s*" + YEAR + "[.,]");
  // "공태명, 최응렬, “제목”, 학술지, 2012, 9-40.": 저자 목록 뒤에 따옴표 제목이 오는 국내 학술 항목
  var HAN_START_QUOTE = /^[가-힣]{2,10}(?:\s*[,ㆍ･·&]\s*[가-힣A-Za-z.'’\- ]{1,24}){0,5}\s*,\s*[“"「『｢‘]/;
  var YEAR_BARE_NEAR = ",\\s*" + YEAR + "\\s*[,.;)]";
  var DASH_START = new RegExp("^(?:[_＿─\\-–—]{2,}|\\.)\\s*[.,]?\\s*[(（]?\\s*" + YEAR);
  var LAT_ORG_START = new RegExp("^\\p{Lu}[\\p{L}'’&\\-]*(?:\\s+\\p{Lu}[\\p{L}'’&\\-]*){0,3}\\.\\s*[(（]\\s*" + YEAR, "u");
  var YEAR_NEAR = new RegExp("[(（]\\s*" + YEAR + "(?:[,\\s][^)）]{0,14})?\\s*[)）]|[.,]\\s*" + YEAR + "\\s*[.,;)]|\\.\\s*" + YEAR + "\\s+[A-Z][a-z]{2}\\b[^;]{0,8};");
  var SUBHEAD_RE = /^[ \t]*(?:\d+[.)]\s*)?(?:국내|국외|외국|해외|한국|영문|국문|동양|서양|웹|인터넷|기타|단행본|학술지)?[ \t]*(?:문헌|논문|자료|서적|논저|저서|사이트|웹사이트|참고자료|보고서|서양서|동양서)[ \t]*[:：]?[ \t]*$/;

  // 저자 목록이 여러 줄이라 연도가 260자 밖에 있는 항목 머리: 그 사이에 따옴표·콜론·숫자가 없고 쉼표로 이은 이름뿐일 때만
  function longYearOk(wl) {
    if (!wl) return false;
    var m = YEAR_NEAR.exec(wl.slice(0, 700));
    if (!m || m.index <= 260) return false;
    var before = wl.slice(0, m.index);
    return !/[“"”「」『』｢｣:;?\d]/.test(before) && before.split(",").length >= 4;
  }

  function isAyStart(lines, i, win, winLong) {
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
      return YEAR_NEAR.test(rest) || longYearOk(winLong);
    }
    if (LAT_START_FULL.test(s) || LAT_START_VANC.test(s)) {
      // 이름을 다 쓴 형식·밴쿠버식은 본문 이어짐과 헷갈리기 쉬워, 앞 줄이 항목을 끝냈을 때만 시작으로 본다
      var pv = i > 0 ? lines[i - 1].text.replace(/\s+$/, "") : "";
      if (pv && !/[.;)\]\d]$/.test(pv)) return false;
      return YEAR_NEAR.test(w.slice(0, 260)) || longYearOk(winLong);
    }
    var dotM = HAN_START_DOT.exec(w);
    var quoteOk = !dotM && !HAN_START_PAREN.test(w) && HAN_START_QUOTE.test(s) && new RegExp(YEAR_BARE_NEAR).test(w.slice(0, 260));
    if (HAN_START_PAREN.test(w) || dotM || quoteOk) {
      // 저자 자리의 낱말이 너무 길거나 많으면 본문 이어짐으로 본다. "저자, 제목, 연도." 꼴은 연도까지, 따옴표 제목은 따옴표 앞까지가 저자 자리다.
      var head = dotM ? dotM[0] : quoteOk ? s.split(/[“"「『｢‘]/)[0] : w.split(/[(（]/)[0];
      var toks = head.split(/[ㆍ･·,&\s.]+/).filter(Boolean);
      if (toks.length > 9) return false;
      for (var k = 0; k < toks.length; k++) if (toks[k].length > 10) return false;
      return true;
    }
    return false;
  }

  // 참고문헌 뒤에 붙는 것(감사의 글·저자 소개·접수일 등)을 알아보는 줄
  var BACK_HEAD = /^[ \t]*(?:appendix|appendices|acknowledge?ments?|acknowledgments?|funding(?:\s+information)?|conflicts?\s+of\s+interests?|declarations?(?:\s+of\s+[a-z ]+)?|author(?:'?s)?\s+(?:contributions?|biograph(?:y|ies)|information|notes?)|about\s+the\s+authors?|biograph(?:y|ies)|supplementary\s+(?:material|information)s?|supporting\s+information|data\s+availability(?:\s+statement)?|abbreviations|notes?|부\s?록|감사\s?의?\s?(?:글|말)|사\s?사|저자\s?소개|필자\s?소개|저자\s?약력|약력|국문\s?초록|영문\s?초록|한글\s?초록|[【\[<]?\s*(?:abstract|초록|요약|key\s?words?|주제어|핵심어)\s*[】\]>]?)[ \t]*[:：]?[^\n]{0,30}$/i;
  var BACK_DATES = /^[ \t]*(?:received|accepted|revised|submitted|published(?:\s+online)?|접수|투고|수정|게재\s?확정|심사)\b[^\n]*(?:19|20)\d\d/i;
  var BACK_BIO = /\b(?:received|earned)\s+(?:his|her|their)\s+(?:b\.?\s?s|b\.?\s?a|m\.?\s?s|m\.?\s?a|ph\.?\s?d|bachelor|master|doctor)|\bis\s+(?:an?\s+)?(?:(?:associate|assistant|senior|full|emeritus|visiting|adjunct)\s+)?(?:professor|lecturer|researcher)\b|(?:대학교|대학원)[^\n]{0,24}(?:교수|박사|졸업)/i;
  var ENTRY_MAX = 700;

  // 번호식 항목 안에서 다른 번호로 시작하는 줄(이어진 줄이 번호처럼 보이거나, 두 단 목록이 섞인 것)
  // prevText: 바로 앞 줄. 쪽 범위가 줄바꿈된 "28-\n35." 의 "35." 는 번호가 아니다(번호 뒤에 글이 이어지고, 앞 줄이 붙임표·쉼표로 끝나지 않을 때만 번호로 본다).
  function innerLabel(text, prevText) {
    var mb = LABEL_BRACKET.exec(text);
    var prev = String(prevText || "").replace(/\s+$/, "");
    if (mb) return /[-–,:;]$/.test(prev) ? null : parseInt(mb[1] || mb[2], 10);
    var md = LABEL_DOT.exec(text);
    if (!md) return null;
    var after = text.slice(md[0].length).replace(/^\s+/, "");
    if (!after || !/^[\p{L}\[(「『“"]/u.test(after) || /[-–,:;]$/.test(prev)) return null;
    return parseInt(md[1], 10);
  }

  // lines[from..to) 에서 뒤쪽 비참고문헌 구역이 시작하는 줄 번호. 없으면 -1. 빈 줄 기준 판정은 마지막 항목 안에서만(softFrom 뒤).
  function backMatterAt(lines, from, to, softFrom) {
    for (var j = from; j < to; j++) {
      var tx = lines[j].text;
      if (!tx.trim()) continue;
      var afterBlank = j > 0 && !lines[j - 1].text.trim();
      var short = tx.trim().length <= 60;
      if (short && BACK_HEAD.test(tx)) return j;
      if (BACK_DATES.test(tx) || BACK_BIO.test(tx)) return j;
      if (afterBlank && j > softFrom) {
        var blk = (tx + " " + (lines[j + 1] ? lines[j + 1].text : "") + " " + (lines[j + 2] ? lines[j + 2].text : "")).trim();
        if (tx.trim().length <= 50 && !/\d/.test(tx) && !/[.,;]$/.test(tx.trim()) && !/^[a-z]/.test(tx.trim())) return j; // 제목처럼 짧은 줄
        if (blk.length >= 40 && !/\d/.test(blk)) return j; // 숫자 하나 없는 문단은 문헌이 아니다
      }
    }
    return -1;
  }

  // 참고문헌 구역 글 -> [{n, text, start, end, unreliable?}]. text 는 입력의 start..end 조각 그대로(번호 표시 포함).
  // unreliable: 항목이 다른 항목과 섞였거나(번호가 겹치고 어긋남) 너무 길다. 카드를 만들지 않는다.
  function splitReferences(text) {
    var t = norm(text);
    var lines = splitLines(t);
    var i;

    // 번호식 후보: 순서대로 1, 2, 3 … 으로 이어지는 줄 머리 번호만 인정(중간의 "2.5 mg" 같은 줄은 건너뛴다)
    var numStarts = [];
    var dupN = {};
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
      else if (n === last && last > 0) dupN[n] = true; // 같은 번호가 또 나옴: 앞의 것이 이어진 줄일 수 있다
    }
    var ayStarts = [];
    for (i = 0; i < lines.length; i++) {
      var win = (lines[i].text + " " + (lines[i + 1] ? lines[i + 1].text : "") + " " + (lines[i + 2] ? lines[i + 2].text : "")).replace(/\s+/g, " ").replace(/^\s+/, "");
      var longParts = [lines[i].text];
      for (var lk = i + 1; lk < lines.length && lk < i + 8; lk++) {
        var lt = lines[lk].text;
        var lpv = lines[lk - 1].text.replace(/\s+$/, "");
        if (/[.;)\]\d]$/.test(lpv) && (LAT_START.test(lt.replace(/^\s+/, "")) || LAT_START_FULL.test(lt.replace(/^\s+/, "")))) break; // 다음 항목
        longParts.push(lt);
      }
      var winLong = longParts.join(" ").replace(/\s+/g, " ").replace(/^\s+/, "");
      if (isAyStart(lines, i, win, winLong)) ayStarts.push({ i: i, n: null });
    }

    var numbered = numStarts.length >= 3 ? ayStarts.length < numStarts.length : (numStarts.length === 2 && ayStarts.length === 0);
    // 저자-연도 항목이 3개 넘게 먼저 나오고 그 뒤에 번호 목록이 붙으면, 번호 목록은 부록의 설문 항목 따위다
    var limit = lines.length;
    if (numbered && ayStarts.length >= 3 && numStarts.length && ayStarts[2].i < numStarts[0].i) { numbered = false; limit = numStarts[0].i; }
    var starts = numbered ? numStarts : ayStarts.filter(function (x) { return x.i < limit; });

    // 첫 항목 뒤에 감사의 글·저자 소개 같은 것이 시작하면 거기서 잘라 낸다
    var cutLine = lines.length;
    if (starts.length) {
      var bm = backMatterAt(lines, starts[0].i + 1, limit, starts[starts.length - 1].i);
      if (bm >= 0) cutLine = bm;
      else cutLine = limit;
      starts = starts.filter(function (x) { return x.i < cutLine; });
    }

    var out = [];
    for (var k = 0; k < starts.length; k++) {
      var s = lines[starts[k].i].s;
      var endLine = k + 1 < starts.length ? starts[k + 1].i : cutLine; // 이 항목의 마지막 줄 다음 줄 번호
      var e = endLine < lines.length ? lines[endLine].s : t.length;
      // 하위 제목("2. 국외문헌") 줄은 앞 항목 끝에서 뗀다
      var sub = e;
      var lastLine = endLine - 1;
      while (lastLine > starts[k].i && SUBHEAD_RE.test(lines[lastLine].text)) { sub = lines[lastLine].s; lastLine--; }
      e = sub;
      var seg = t.slice(s, e);
      var trimmedEnd = seg.replace(/\s+$/, "").length;
      e = s + trimmedEnd;
      if (e <= s) continue;
      var item = { n: starts[k].n, text: String(text).slice(s, e), start: s, end: e };
      if (seg.replace(/\s+/g, " ").length > ENTRY_MAX) item.unreliable = true; // 공백이 겹쳐 늘어난 글자 수는 세지 않는다
      if (numbered) {
        // 항목 안에 다른 번호로 시작하는 줄이 있으면 두 항목이 섞인 것이다
        for (var q = starts[k].i + 1; q < endLine && q < lines.length; q++) {
          var inner = innerLabel(lines[q].text, lines[q - 1].text);
          if (inner !== null && inner !== starts[k].n) { item.unreliable = true; break; }
        }
      }
      out.push(item);
    }
    if (numbered) {
      out.forEach(function (it, idx) {
        if (dupN[it.n] || (out[idx + 1] && dupN[out[idx + 1].n])) it.unreliable = true;
      });
    }
    return numbered ? out : splitEmbedded(out);
  }

  // 앞 항목 끝에 이어 붙은 한글 항목("…301-338. 김준호 외 5인. (2003). 책 제목"): 문장이 끝난 뒤 "저자 (연도)" 가 나오면 나눈다.
  var EMBED_RE = new RegExp("(?<=[.)」』”\\]]\\s+)(?=[가-힣]{2,4}(?:[ㆍ･·][가-힣]{2,4}){0,3}(?:[ \\t]*외[ \\t]*\\d*[ \\t]*인)?[ \\t]*[.]?[ \\t]*[(（][ \\t]*" + YEAR + "[ \\t]*[)）])", "g");
  function splitEmbedded(items) {
    var res = [];
    items.forEach(function (it) {
      var cuts = [];
      var m;
      EMBED_RE.lastIndex = 0;
      while ((m = EMBED_RE.exec(it.text))) {
        if (m.index > 0) cuts.push(m.index);
        if (m[0].length === 0) EMBED_RE.lastIndex++;
      }
      if (!cuts.length) { res.push(it); return; }
      cuts.unshift(0);
      cuts.push(it.text.length);
      for (var k = 0; k + 1 < cuts.length; k++) {
        var piece = it.text.slice(cuts[k], cuts[k + 1]).replace(/\s+$/, "");
        if (!piece) continue;
        var o = { n: it.n, text: piece, start: it.start + cuts[k], end: it.start + cuts[k] + piece.length };
        if (piece.replace(/\s+/g, " ").length > ENTRY_MAX) o.unreliable = true;
        res.push(o);
      }
    });
    return res;
  }

  // ---------- 참고문헌 항목 요약(저자·연도) ----------
  var REF_YEAR_PAREN = new RegExp("[(（]\\s*(" + YEAR + ")(?:\\s*\\.\\s*\\d{1,2}(?:\\s*\\.\\s*\\d{1,2})?\\s*\\.?)?\\s*[,)）]"); // "(2020)", "(2020, May)", "(2022. 11. 10.)"
  var REF_YEAR_BARE = new RegExp("[.,]\\s*(" + YEAR + ")\\s*[.,;]");
  var REF_LABEL = /^\s*(?:\[\s*\d{1,3}\s*\]|[(（]\s*\d{1,3}\s*[)）]|\d{1,3}[.)])\s*/;

  var VANC_AUTH = new RegExp("^((?:" + NAME_LAT + ")\\s+\\p{Lu}{1,3}(?:\\s*,\\s*(?:" + NAME_LAT + ")\\s+\\p{Lu}{1,3})*)(?:\\s*,\\s*(et\\s+al))?\\s*\\.\\s+\\p{Lu}", "u");

  function metaFor(entry, prev) {
    var raw = norm(entry.text).replace(REF_LABEL, "").replace(/\s+/g, " ").trim();
    var meta = { key: null, year: null, authors: "", multi: false, inherited: false, count: 0 };
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
    var m = /^([가-힣]{2,10})(?=\s*(?:[.,ㆍ･·&]|\(|（|\s+(?:외|등|역|편|저)\b|(?:외|등|역|편|저)(?:[\s.,(（]|$))|\s*$|\s+(?:보도자료|보도참고자료|보고서|통계|백서|연보)\s*[.,(（])/.exec(seg);
    if (m) {
      meta.key = m[1];
      var qi = seg.search(/[“"「『｢‘]/); // "김학신, “제목”, 학술지, 2012": 따옴표 제목부터는 저자 자리가 아니다
      var segA = qi > m[1].length ? seg.slice(0, qi) : seg;
      var restH = segA.slice(m[1].length).replace(/^\s*(?:역|편|저|엮음)?[.\s]*/, "");
      if (qi > m[1].length) meta.multi = /[가-힣]/.test(restH.replace(/^[\s,.]+|[\s,.]+$/g, ""));
      else meta.multi = /[,ㆍ･·&]|(?:^|\s)(?:외|등)(?:\s|\.|$)|et\s+al|[가-힣]{2,}\s+[가-힣]{2,}/.test(restH) || /(?:^|\s)(?:외|등)(?:\s|\.|$)/.test(seg);
      // 저자 수: "김철수, 이영희, 박민수" 처럼 구분 기호로 이은 이름만 센다. "외"·"등"이나 띄어쓰기로만 이은 이름은 알 수 없다(0).
      var toks = segA.replace(/[\s.]*(?:역|편|저|엮음)[\s.]*$/, "").split(/\s*[,ㆍ･·&]\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (toks.length >= 2 && toks.every(function (x) { return /^[가-힣]{2,10}$/.test(x); })) meta.count = toks.length;
      return meta;
    }
    // 밴쿠버식 "Kim B, Lee C. Title. J. 2020;" : 저자 줄은 첫 마침표까지, 저자 수는 쉼표 개수
    var vm = VANC_AUTH.exec(seg);
    if (vm) {
      var vnames = vm[1].split(/\s*,\s*/);
      meta.authors = vm[1] + (vm[2] ? " et al" : "");
      meta.key = surnameKey(vnames[0].replace(/\s+\p{Lu}{1,3}$/u, ""));
      meta.multi = vnames.length >= 2 || !!vm[2];
      meta.count = vm[2] ? 0 : vnames.length;
      return meta;
    }
    var ml = new RegExp("^(" + NAME_LAT + ")(?=\\s*,\\s*\\p{Lu}\\.|\\s*,\\s*\\p{Lu}\\b|\\s*,\\s*\\p{Lu}[\\p{L}'’\\-]+|\\s*&|\\s+and\\b|\\s+et\\s+al|\\s*\\.?\\s*$)", "u").exec(seg);
    if (ml) {
      meta.key = surnameKey(ml[1]);
      meta.multi = /&|\band\b|\bet\s+al/i.test(seg) || (seg.match(/,/g) || []).length >= 2;
      meta.count = countAuthors(seg);
      var lead = leadAuthors(seg);
      if (lead.count) {
        var contName = CONT_NAME.test(lead.rest);
        if (lead.count >= 2 && !contName) { meta.count = lead.count; meta.multi = true; }
        else if (!contName && TITLE_LIKE.test(lead.rest)) { meta.count = lead.count; meta.multi = lead.count >= 2; } // 저자 뒤에 제목이 바로 온다
      }
    }
    return meta;
  }

  // 저자 줄 앞머리에서 "성, 머리글자" 꼴 저자를 이어서 센다. 제목 낱말("Behavior, Vol")을 저자로 세지 않는다.
  var LEAD_ONE = new RegExp("^(?:" + NAME_LAT + "(?:\\s+\\p{Lu}[\\p{L}'’\\-]+)?)\\s*,\\s*\\p{Lu}\\.?(?![\\p{L}])(?:[\\s\\-]*\\p{Lu}\\.?(?![\\p{L}])){0,3}", "u");
  var LEAD_SEP = /^\s*(?:,\s*(?:&|and)\s+|,\s*|&\s*|and\s+)/;
  function leadAuthors(seg) {
    var s = String(seg || "").trim();
    var pos = 0;
    var count = 0;
    for (;;) {
      var m = LEAD_ONE.exec(s.slice(pos));
      if (!m) break;
      count++;
      pos += m[0].length;
      var sp = LEAD_SEP.exec(s.slice(pos));
      if (!sp) break;
      pos += sp[0].length;
    }
    return { count: count, rest: s.slice(pos) };
  }
  var CONT_NAME = /^(?:\p{Lu}[\p{L}'’.\-]*\s+){1,3}\p{Lu}[\p{L}'’.\-]*\s*(?:,|&|\band\b|\(|（|$)/u;
  var TITLE_LIKE = /^(?:[“"‘'「『｢]|\p{Lu}[\p{L}'’\-]*(?:\s+[\p{L}'’\-]+){0,3}?\s+\p{Ll}{3,})/u;

  // 서양식 저자 줄의 저자 수(알 수 없으면 0). "Kim, A., Lee, B., & Park, C." / "Kim BH, Lee C."
  function countAuthors(seg) {
    var a = (seg.match(/(?<![\p{L}'’\-])\p{Lu}[\p{L}'’\-]+(?:\s+\p{Lu}[\p{L}'’\-]+)?\s*,\s*\p{Lu}/gu) || []).length;
    var b = (seg.match(/(?<![\p{L}'’\-])\p{Lu}[\p{L}'’\-]+\s+\p{Lu}{1,3}(?=\s*[,.]|\s*$)/gu) || []).length;
    return Math.max(a, b);
  }

  // 한 항목 안에 두 항목이 섞여 있는 것처럼 보이는지: 첫 줄 뒤에 같은 성으로 시작하는 줄이 있거나, 저자 자리의 "(연도)" 가 또 있다.
  function looksMerged(entryText, key) {
    var ls = norm(entryText).replace(REF_LABEL, "").split("\n");
    for (var i = 1; i < ls.length; i++) {
      var l = ls[i].replace(/^\s+/, "");
      if (!l) continue;
      var prev = ls[i - 1].replace(/\s+$/, "");
      // 저자 목록이 줄바꿈된 것. 단 앞 줄까지 이미 연도가 나왔으면 저자 목록이 아니라 제목·출처가 줄바꿈된 뒤 다음 항목이 붙은 것이다
      if ((/[,&ㆍ･·]$/.test(prev) || /\band$/i.test(prev)) && !/(?:19|20)\d\d/.test(ls.slice(0, i).join(" "))) continue;
      var mm = new RegExp("^(" + NAME_LAT + "|[가-힣]{2,10})", "u").exec(l);
      if (mm) {
        var k = NAME_HAN_FULL.test(mm[1]) ? mm[1] : surnameKey(mm[1]);
        if (k && k === key && /^\s*(?:,|[(（]|\s\p{Lu}[\s.,])/u.test(l.slice(mm[1].length) || " ")) return true;
      }
      if ((LAT_START.test(l) || LAT_START_FULL.test(l)) && YEAR_NEAR.test(l.slice(0, 120))) return true;
    }
    return false;
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
  // "[12]", "[3,5]", "[3-5]", "[12, p. 34]". 쪽 표시는 번호에 보태지 않는다.
  var NUM_CITE_RE = /\[\s*(\d{1,4}(?:\s*[-‐-―~]\s*\d{1,4})?(?:\s*[,，;]\s*\d{1,4}(?:\s*[-‐-―~]\s*\d{1,4})?)*)(?:\s*[,，;]\s*(?:pp?\.|쪽)\s*\d[\d\s,\-–]*)?\s*\]/g;
  var MATH_PREV_WORD = /(?:^|[^A-Za-z])(?:range|interval|scale|from|between)(?:\s+of)?\s*[:=]?\s*$/i;
  var MATH_PREV_HAN = /(?:범위|구간|척도)(?:\s*[는은의:])?\s*$/;
  var MATH_VAR_IN = /(?:^|[\s(,;])[A-Za-z0-9)]\s+in\s*$/;
  var MATH_PREV_STAT = /(?:^|[^A-Za-z])(?:CI|IQR|Likert|indices|values\s+in|the\s+set|(?:set|scaled|normali[sz]ed|mapped|clipped|limited)\s+to)\s*[:=]?\s*$|(?:^|[^A-Za-z])(?:OR|RR|HR|AOR)\s+\d+(?:\.\d+)?\s*$/i;

  // 영어 낱말에 붙은 숫자 인용 "FlowScan[10]", "ISO[3]", "Kim[3]" 만 되살린다. 배열 첨자("arr[3]", "Arr[3] = 5", "Arr[3][4]")는 그대로 버린다.
  function attachedOk(t, start, end, parenHan) {
    var before = t.slice(Math.max(0, start - 40), start);
    var after = t.charAt(end);
    if (parenHan) {
      // 한글 낱말 바로 뒤 괄호: "머신(SVM)[3]", "연구(2020)[3]"
      var op = before.lastIndexOf("(", before.length - 2);
      if (op < 1 || /[()\n]/.test(before.slice(op + 1, -1)) || !/[가-힣]/.test(before.charAt(op - 1))) return false;
    } else {
      var mm = /(^|[^A-Za-z0-9_.)\]])([A-Za-z]+)$/.exec(before);
      if (!mm) return false;
      if (mm[2].length < 3 || !/^[A-Z]/.test(mm[2])) return false;
    }
    if (after && !/[\s,.;:)가-힣]/.test(after)) return false;
    if (after === "." && /[A-Za-z]/.test(t.charAt(end + 1))) return false;
    var line = t.slice(t.lastIndexOf("\n", start) + 1, (t.indexOf("\n", end) + 1 || t.length + 1) - 1);
    if (/[=<>{}]|\[[^\]\d]/.test(line.replace(/\[\s*\d[\d\s,;\-–~]*\]/g, ""))) return false;
    return true;
  }

  // 대괄호 묶음이 수식·구간·배열 첨자로 보이는지(참이면 인용이 아니다)
  function mathBracket(t, start, end, multi) {
    var before = start > 0 ? t.charAt(start - 1) : "";
    // 글자·숫자·닫는 괄호 바로 뒤에 붙은 대괄호는 배열 첨자("arr[3]", "f(x)[2]"). 한글 낱말·닫는 따옴표 뒤는 "연구[12]" 식 인용이다.
    // 바로 앞이 "]" 이어도 그것이 숫자 인용 "[3]" 이면 "[3][4]" 로 이어진 인용이다.
    if (before && /[\p{L}\d)\]]/u.test(before) && !/[가-힣]/.test(before) && !(before === "]" && /\[\s*\d[\d\s,;\-–~]*\]$/.test(t.slice(Math.max(0, start - 24), start)))) {
      if (multi || !/[A-Za-z)]/.test(before) || !attachedOk(t, start, end, before === ")")) return true;
    }
    if (before === "]") {
      // "Arr[3][4]": 앞 대괄호가 낱말에 붙은 배열 첨자면 이어진 대괄호도 첨자다
      var ps = t.lastIndexOf("[", start - 2);
      if (ps >= 1 && /[\p{L}\d)]/u.test(t.charAt(ps - 1)) && !/[가-힣]/.test(t.charAt(ps - 1))) return true;
    }
    var ctx = t.slice(Math.max(0, start - 12), start);
    var eq = ctx.lastIndexOf("=");
    if (eq >= 0 && !/[).;]/.test(ctx.slice(eq + 1))) return true; // "y = ax + b [5]", "v = [1, 2, 3]"
    if (ctx.indexOf("∈") >= 0) return true;
    if (MATH_VAR_IN.test(ctx)) return true; // "x in [1, 2]"
    var ctxLong = t.slice(Math.max(0, start - 28), start);
    if (multi && (MATH_PREV_WORD.test(ctxLong) || MATH_PREV_HAN.test(ctxLong) || MATH_PREV_STAT.test(ctxLong))) return true; // "range [1, 10]", "scale [1–5]", "95% CI [2, 4]", "values in [1, 5]"
    return false;
  }

  function findNumericCitations(pageText, refCount) {
    var out = [];
    var max = Math.floor(Number(refCount)) || 0;
    if (max <= 0) return out;
    var t = norm(pageText);
    NUM_CITE_RE.lastIndex = 0;
    var m;
    while ((m = NUM_CITE_RE.exec(t))) {
      var start = m.index;
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
      if (!good || !nums.length) continue;
      if (/;/.test(m[1]) && m[1].split(";").every(function (q) { return q.split(/[,，]/).length >= 2; })) continue; // "[1, 2; 3, 4]" 행렬
      if (mathBracket(t, start, start + m[0].length, parts.length > 1 || /[-‐-―~]/.test(m[1]))) continue;
      out.push({ start: start, end: start + m[0].length, numbers: nums });
    }
    // "[12]–[15]" 는 12~15 의 한 묶음
    var merged = [];
    for (var k = 0; k < out.length; k++) {
      var cur = out[k];
      var nx = out[k + 1];
      if (nx && cur.numbers.length === 1 && nx.numbers.length === 1 && nx.numbers[0] > cur.numbers[0] && nx.numbers[0] - cur.numbers[0] <= 60 &&
          /^\s*[-‐-―~]\s*$/.test(t.slice(cur.end, nx.start))) {
        var run = [];
        for (var q = cur.numbers[0]; q <= nx.numbers[0]; q++) run.push(q);
        merged.push({ start: cur.start, end: nx.end, numbers: run });
        k++;
      } else {
        merged.push(cur);
      }
    }
    return merged;
  }

  // ---------- 위첨자 번호 인용 ----------
  // "…한다.7)", "…Health)1)에", "word7,8)", "word7-9)", "previously.12,13", "disease1–3": 번호가 본문보다 작고 기준선이 올라간 글자일 때만 인용이다.
  // 글에는 크기·높이가 없으므로 글자마다의 기하(charGeometry)가 필요하다. 기하를 모르면 아무것도 찾지 않는다.
  // 막는 것: 변수·단위 뒤 지수(r2, cm3, x2, 10^3, Ca2+), 저자 뒤 소속 번호("Kim1, Lee2"), 각주 번호(쪽 아래에 같은 번호로 시작하는 작은 글 줄), 기준 글자와 이어지지 않은 작은 숫자.
  var SUP_TOKEN = /(?<!\d)(\d{1,3}(?:[ ]?[,，‐-―~\-][ ]?\d{1,3})*)(\))?(?!\d|\.\d)/g;
  var UNIT_WORDS = {};
  ("m cm mm km dm nm um kg mg ug ml dl l g s ms min h hz khz mhz ghz db kb mb gb tb ft in sq mol mmol umol rad sr var exp log ln sin cos tan max min lim " +
    "μm ㎡ ㎥").split(" ").forEach(function (w) { UNIT_WORDS[w] = true; });

  // pt: TextMap.buildPageText 결과({text, charItem}), items: pdf.js 글 조각. 반환 {fs, y, x0, x1, item}: 글자마다 글자 크기·기준선 y·조각의 왼쪽/오른쪽 x·조각 번호. 가로쓰기가 아닌 조각의 fs 는 0.
  function charGeometry(pt, items) {
    var n = pt && pt.text ? pt.text.length : 0;
    var g = { fs: new Float32Array(n), y: new Float32Array(n), x0: new Float32Array(n), x1: new Float32Array(n), item: new Int32Array(n).fill(-1) };
    if (!n || !pt.charItem || !items) return g;
    var cache = {};
    for (var i = 0; i < n; i++) {
      var ii = pt.charItem[i];
      if (ii === undefined || ii === null || ii < 0) continue;
      var c = cache[ii];
      if (c === undefined) {
        var it = items[ii];
        c = null;
        if (it && it.transform) {
          var tr = it.transform;
          var size = Math.hypot(tr[2], tr[3]);
          if (size > 0 && Math.abs(tr[1]) < size * 0.02 && Math.abs(tr[2]) < size * 0.02) c = { fs: size, y: Number(tr[5]), x0: Number(tr[4]), x1: Number(tr[4]) + (Number(it.width) || 0) };
        }
        cache[ii] = c;
      }
      if (!c) continue;
      g.fs[i] = c.fs; g.y[i] = c.y; g.x0[i] = c.x0; g.x1[i] = c.x1; g.item[i] = ii;
    }
    return g;
  }

  function bodyFontSize(t, g) {
    var hist = {};
    var best = 0;
    var bestN = 0;
    for (var i = 0; i < t.length; i++) {
      if (!(g.fs[i] > 0) || /\s/.test(t.charAt(i))) continue;
      var k = Math.round(g.fs[i] * 2) / 2;
      hist[k] = (hist[k] || 0) + 1;
      if (hist[k] > bestN) { bestN = hist[k]; best = k; }
    }
    return best;
  }

  function parseNumberList(str, max) {
    var nums = [];
    var parts = str.replace(/\s+/g, "").split(/[,，]/);
    for (var i = 0; i < parts.length; i++) {
      var rg = parts[i].split(/[-‐-―~]/);
      if (rg.length > 2) return null;
      var a = parseInt(rg[0], 10);
      var b = rg.length > 1 ? parseInt(rg[1], 10) : a;
      if (!(a >= 1) || !(b >= a) || b > max || b - a > 60) return null;
      for (var v = a; v <= b; v++) if (nums.indexOf(v) < 0) nums.push(v);
    }
    return nums.length ? nums : null;
  }

  function findSuperscriptCitations(pageText, refCount, geom) {
    var out = [];
    var max = Math.floor(Number(refCount)) || 0;
    var t = norm(pageText);
    if (max <= 0 || !geom || !geom.fs || geom.fs.length !== t.length) return out;
    var body = bodyFontSize(t, geom);
    if (!(body > 0)) return out;
    var lines = splitLines(t);
    // 각주 줄: 줄이 번호로 시작하고 나머지가 본문보다 작은 글자. 같은 번호의 본문 위첨자는 각주 표시다.
    var footnotes = {};
    lines.forEach(function (ln) {
      var m = /^[ \t]*(\d{1,2})\)?(?=[ \t]|[^\d\s.,])/.exec(ln.text);
      if (!m) return;
      var from = ln.s + m[0].length;
      var sum = 0;
      var cnt = 0;
      for (var q = from; q < ln.e; q++) if (geom.fs[q] > 0 && !/\s/.test(t.charAt(q))) { sum += geom.fs[q]; cnt++; }
      if (cnt >= 8 && sum / cnt <= body * 0.92) footnotes[parseInt(m[1], 10)] = true;
    });
    // 소속·각주 표시: 줄 머리의 작고 올라간 번호가 글에 바로 붙어 있고, 앞 줄 끝 글자에 이어 붙지 않은 것("1Department", "3디엠비에이치", "1) …").
    // 값은 괄호가 붙은 꼴과 안 붙은 꼴을 따로 센다.
    var markers = { bare: {}, paren: {} };
    var attachedAt = function (pos) { // 번호가 바로 앞 글자(공백·줄바꿈 건너뜀)의 조각 끝에 이어 붙어 있는가
      var jj = pos - 1;
      while (jj >= 0 && /\s/.test(t.charAt(jj))) jj--;
      if (jj < 0 || !(geom.fs[jj] > 0) || geom.item[jj] === geom.item[pos]) return false;
      var gp = geom.x0[pos] - geom.x1[jj];
      return gp >= -geom.fs[jj] * 0.5 && gp <= geom.fs[jj] && geom.y[pos] - geom.y[jj] >= geom.fs[jj] * 0.12 && geom.y[pos] - geom.y[jj] <= geom.fs[jj] * 0.9;
    };
    lines.forEach(function (ln) {
      var mk = /^[ 	]*(\d{1,2})(\))?(?=\S)/.exec(ln.text);
      if (!mk) return;
      var p0 = ln.s + mk[0].search(/\d/);
      var rest = ln.s + mk[0].length;
      if (!(geom.fs[p0] > 0) || rest >= ln.e || !(geom.fs[rest] > 0)) return;
      if (geom.fs[p0] <= geom.fs[rest] * 0.8 && geom.y[p0] - geom.y[rest] >= geom.fs[rest] * 0.12 && !attachedAt(p0)) markers[mk[2] ? "paren" : "bare"][parseInt(mk[1], 10)] = true;
    });
    var cand = [];
    SUP_TOKEN.lastIndex = 0;
    var m;
    while ((m = SUP_TOKEN.exec(t))) {
      var start = m.index;
      var end = start + m[0].length;
      if (m[0].length === 0) { SUP_TOKEN.lastIndex++; continue; }
      // 기준 글자: 번호 바로 앞의 글자(공백·줄바꿈 건너뜀)
      var j = start - 1;
      while (j >= 0 && /\s/.test(t.charAt(j))) j--;
      if (j < 0 || !(geom.fs[j] > 0)) continue;
      var bfs = geom.fs[j];
      if (bfs < body * 0.75) continue;
      var ok = true;
      for (var q = start; q < end; q++) {
        if (/\s/.test(t.charAt(q))) continue;
        if (!(geom.fs[q] > 0) || geom.fs[q] > bfs * 0.8) { ok = false; break; }
        var dy = geom.y[q] - geom.y[j];
        if (dy < bfs * 0.12 || dy > bfs * 0.9) { ok = false; break; }
      }
      if (!ok) continue;
      // 기준 글자의 조각 바로 끝에 이어 붙어 있어야 한다(줄 머리의 번호가 앞 줄 끝 낱말에 붙은 경우도 같은 모양이다)
      if (geom.item[j] === geom.item[start]) continue;
      var gap = geom.x0[start] - geom.x1[j];
      if (gap < -bfs * 0.5 || gap > bfs * 1.0) continue;
      // 기준 글자: 숫자·연산 기호 뒤는 지수, 한 글자·두 글자 라틴 낱말과 단위 뒤도 지수
      var bc = t.charAt(j);
      if (/[\d%°=+\-−×÷^\/<>]/.test(bc)) continue;
      if (/\p{L}/u.test(bc) && !/[A-Za-z가-힣]/.test(bc)) continue; // χ2, μ2 같은 그리스 문자 뒤 지수
      if (bc === "." && /(?:^|[\s.])\p{Lu}\.$/u.test(t.slice(Math.max(0, j - 3), j + 1))) continue; // "M.D. 2" 저자 직함 뒤 소속 번호
      if (/[가-힣]/.test(bc) && !m[2]) continue; // 한글 낱말에 바로 붙은 괄호 없는 숫자는 저자·소속 번호일 수 있다
      if (/[A-Za-z]/.test(bc)) {
        var wm = /([A-Za-z]+)$/.exec(t.slice(Math.max(0, j - 20), j + 1));
        var word = wm ? wm[1] : bc;
        if (word.length < 3 || UNIT_WORDS[word.toLowerCase()]) continue;
        var pre = j - word.length >= 0 ? t.charAt(j - word.length) : "";
        if (/[\d_^]/.test(pre)) continue; // "10m3"
        if (!m[2] && /^\p{Lu}[\p{Ll}'’]+$/u.test(word)) continue; // "Kwon1, Lee2" 저자 뒤 소속 번호
      }
      // 번호 뒤: 전하·지수 기호, 글자가 바로 붙은 소속 번호("1Department", "1서울대")는 아니다
      var next = t.charAt(end);
      if (/[+\-−^*]/.test(next) && !m[2]) continue;
      if (!m[2] && next && !/[\s.,;:)\]'"”’」]/.test(next)) continue;
      if (!m[2] && /^[ ]?,\s*[\p{Lu}가-힣]/u.test(t.slice(end, end + 8))) continue; // "Kim1, Lee2" 저자 목록
      if (!m[2] && /^\s+\d/.test(t.slice(end, end + 3))) continue; // "1 2 3 4 5" 소속 번호 나열
      var nums = parseNumberList(m[1], max);
      if (!nums) continue;
      // "1),2)" 처럼 위첨자가 쉼표로 이어지는 묶음
      var more;
      while (m[2] && (more = /^[ ]?,[ ]?(\d{1,3}(?:[ ]?[-‐-―~][ ]?\d{1,3})?)\)/.exec(t.slice(end, end + 14)))) {
        var s2 = end + more[0].indexOf(more[1]);
        var e2 = end + more[0].length;
        var good2 = true;
        for (var q2 = s2; q2 < e2; q2++) {
          if (/\s/.test(t.charAt(q2))) continue;
          if (!(geom.fs[q2] > 0) || geom.fs[q2] > bfs * 0.8 || geom.y[q2] - geom.y[j] < bfs * 0.12 || geom.y[q2] - geom.y[j] > bfs * 0.9) { good2 = false; break; }
        }
        var n2 = good2 ? parseNumberList(more[1], max) : null;
        if (!n2) break;
        n2.forEach(function (v) { if (nums.indexOf(v) < 0) nums.push(v); });
        end = e2;
      }
      cand.push({ start: start, end: end, numbers: nums, paren: !!m[2] });
    }
    // 소속 번호: 짧은 거리에 번호가 셋 넘게 몰려 있으면 저자 줄이다
    var res = cand.filter(function (c, idx) {
      var near = 0;
      for (var k = 0; k < cand.length; k++) if (Math.abs(cand[k].start - c.start) <= 90) near++;
      if (near >= 4) return false;
      if (c.numbers.length === 1 && footnotes[c.numbers[0]]) return false;
      if (c.numbers.some(function (v) { return markers[c.paren ? "paren" : "bare"][v]; })) return false;
      return true;
    });
    res.forEach(function (c) { out.push({ start: c.start, end: c.end, numbers: c.numbers, superscript: true }); });
    return out;
  }

  // ---------- 저자-연도식 인용 ----------
  var LEAD_RE = /^(?:see\s+also|see|e\.g\.,?|cf\.?|i\.e\.,?|also|compare|참조|예컨대|예를\s*들어)\s*[,:]?\s*/i;
  var SPLIT_NAMES = /\s*,\s+and\s+|\s*,\s*|\s*&\s*|\s+and\s+|\s*[ㆍ･·]\s*|(?<=[가-힣]{2})[와과]\s+|\s+및\s+/;
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

  // "Kim, Lee, Park (2020)", "Kim, Lee, and Park (2020)", "Kim and Lee (2020)": 마지막 이름만 따로 잡으면 홑저자 항목에 잘못 붙는다
  var NARR_LAT = new RegExp(
    "(?<![\\p{L}\\d'’\\-])(" + NAME_LAT + "(?:(?:\\s*,\\s*" + NAME_LAT + ")*\\s*,?\\s+(?:and|&)\\s+" + NAME_LAT + "|(?:\\s*,\\s*" + NAME_LAT + ")+)?)(\\s+et\\s+al\\.?)?\\s*[(（]\\s*(" + YEAR + ")\\s*[)）]", "gu");
  var NARR_HAN = new RegExp(
    "(?<![가-힣])([가-힣]{2,8}(?:(?:[ㆍ･·]|\\s*,\\s*|와\\s*|과\\s*|\\s+및\\s+)[가-힣]{2,8}){0,5})(\\s*(?:외|등))?\\s*[(（]\\s*(" + YEAR + ")\\s*[)）]", "gu");

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
      var grp = m[1];
      var gstart = m.index;
      // 문장 머리 부사("However, Park (2020)")는 저자가 아니다
      var adv = /^([A-Za-z]+)\s*,\s*(?=\p{Lu})/u.exec(grp);
      if (adv && SENT_ADVERB[adv[1].toLowerCase()]) { grp = grp.slice(adv[0].length); gstart += adv[0].length; }
      var nm = parseNames(grp + (m[2] ? " et al." : ""));
      if (nm) all.push({ start: gstart, end: m.index + m[0].length, authors: nm.authors, year: m[3], etAl: nm.etAl });
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
    var unsafe = false;
    for (var i = 0; i < metas.length; i++) {
      var mt = metas[i];
      if (!mt.key || mt.key !== key || !mt.year) continue;
      var yearOk = hasLetter ? mt.year === cy : mt.year.replace(/[a-z]$/, "") === cy;
      if (!yearOk) continue;
      if (!authorCountsAgree(citation, mt)) continue; // 저자 수가 어긋나는 항목은 후보에서 뺀다
      // 섞인 것처럼 보이는 항목(두 항목이 한 항목으로 붙었다)은 어느 쪽 논문인지 알 수 없다
      if (refs[i].unreliable || looksMerged(refs[i].text, key)) unsafe = true;
      count++;
      hit = i;
    }
    return count === 1 && !unsafe ? hit : -1;
  }

  function authorCountsAgree(cite, mt) {
    var named = cite.authors.length;
    if (cite.etAl) {
      // 서양식 "Kim et al." 은 저자 셋 이상을 뜻한다: 저자가 꼭 둘인 항목에는 붙이지 않는다
      if (!NAME_HAN_FULL.test(cite.authors[0]) && mt.count === 2 && !/et\s+al/i.test(mt.authors)) return false;
      return mt.multi || /et\s+al/i.test(mt.authors);
    }
    if (named === 1) return !mt.multi;
    if (!mt.multi) return false;
    if (mt.count && mt.count !== named) return false; // "Kim and Lee (2020)" 가 세 저자 항목에 붙으면 안 된다
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
    if (!s || !/^X{0,3}(?:IX|IV|V?I{0,3})$/.test(s)) return 0; // 정규형만: IIII·VX·IIX 는 거절
    var total = 0;
    for (var i = 0; i < s.length; i++) {
      var v = ROMAN[s.charAt(i)];
      var nx = i + 1 < s.length ? ROMAN[s.charAt(i + 1)] : 0;
      total += v < nx ? -v : v;
    }
    return total > 0 && total < 40 ? total : 0;
  }
  // 번호 전체("3", "3.2", "2-1", "IV") -> 대상 키에 쓰는 문자열. 점·붙임표 구분은 그대로 둔다(3.2 와 3-2 는 다른 번호 체계일 수 있다). 모르면 "".
  function numOf(str) {
    str = String(str || "").replace(/[–—‐]/g, "-");
    if (/^\d{1,3}(?:[.\-]\d{1,3})*$/.test(str)) return str.replace(/\d+/g, function (d) { return String(parseInt(d, 10)); });
    var r = romanToInt(str);
    return r ? String(r) : "";
  }

  // 번호 한 덩이: 1~3자리, 점·붙임표로 이은 복합 번호("3.2", "2-1"). 4자리 이상·천 단위 쉼표·뒤에 더 붙는 숫자는 잘라 쓰지 않고 통째로 거절한다.
  var NUMLBL = "(\\d{1,3}(?:[.\\-–]\\d{1,3})*)(?![\\d]|[.\\-–]\\d|,\\d{3})";
  var NOT_PREFIXED = "(?![A-Z]\\d)"; // "Table S1", "Fig. A2" 처럼 글자 접두가 붙은 번호는 본문 번호 체계가 아니다

  // 비활성: eq·sec 은 preview.js 의 ENABLED 에서 꺼 둔다(정밀도 근거 부족). 코드는 근거가 모이면 다시 켜도록 둔다.
  var XREF_DEFS = [
    { kind: "fig", re: new RegExp("(?<![\\p{L}\\d])(?:Figures?|FIGURES?|Figs?|FIGS?)\\.?[ \\t]*" + NOT_PREFIXED + NUMLBL + "(?:[a-z]\\b)?", "gu"), num: 1 },
    { kind: "fig", re: new RegExp("(?<![가-힣])그림[ \\t]*" + NUMLBL, "gu"), num: 1, han: true },
    { kind: "table", re: new RegExp("(?<![\\p{L}\\d])(?:Tables?|TABLES?|Tab)\\.?[ \\t]*" + NOT_PREFIXED + "(?:" + NUMLBL + "|([IVX]{1,5}(?![A-Za-z])))", "gu"), num: 1, roman: 2 },
    { kind: "table", re: new RegExp("(?<![가-힣])표[ \\t]*" + NUMLBL, "gu"), num: 1, han: true },
    { kind: "eq", re: new RegExp("(?<![\\p{L}\\d])(?:Eqs?|EQs?|Equations?)\\.?[ \\t]*[(（]?[ \\t]*" + NUMLBL + "[ \\t]*[)）]?", "gu"), num: 1 },
    { kind: "eq", re: /(?<![가-힣])식[ \t]*[(（][ \t]*(\d{1,3})[ \t]*[)）]/gu, num: 1 },
    { kind: "sec", re: /(?<![\p{L}\d])(?:Sections?|Sect?\.)[ \t]*(\d{1,2}(?:\.\d{1,2}){0,3})(?![\d])/gu, num: 1 },
    { kind: "sec", re: /§[ \t]*(\d{1,2}(?:\.\d{1,2}){0,3})(?![\d])/gu, num: 1 },
    // 한국어 절: "2장", "3절", "2.1절" 은 숫자에 바로 붙고 경계나 조사가 뒤따를 때만. "약 2 절반", "비용 3 절감" 은 아니다.
    { kind: "sec", re: /(?<![\p{L}\d.])(\d{1,2}(?:\.\d{1,2}){0,3})[장절](?=$|[\s,.)\]]|에서|에는|에|의|을|를|은|는|과|와|이|가|도|로)/gu, num: 1, secHan: true },
  ];
  var COUNTER_WORD = /(?:약|총|전체|각|매|모두|그|이|저|한|두|세|네|몇)\s*$/;
  var COUNTER_AFTER = /^(?:개|명|회|번|건|가지|곳|배|차|위|점|세|살|년|월|일|원|권|부|종|단계|군|호|층|%)/;

  // 다른 논문·부록의 그림·표를 가리키는 앞말: "Supplementary Table 1", "Extended Data Fig. 3", "S. Table 2", "Appendix Fig. 1", "their Fig. 2", "부록 표 1"
  var SUPPL_BEFORE = /(?:supplement(?:ary|al)?|suppl?\.?|appendix|부록|별첨)[\s-]*(?:data[\s-]*)?(?:figure|fig\.?|table|tab\.?|표|그림)?[\s(]*$|(?:online|extended(?:\s+data)?|additional|보충|추가)[\s-]*(?:data[\s-]*)?(?:figure|fig\.?|table|tab\.?|표|그림)?\s*$|(?:^|[\s(])S\.\s*$|(?:\b(?:their|his|her|its)|[\w.]['’]s)\s+$/i;

  // 번호 뒤 40자 안에 "of|in|from + 인용" 이 이어지면 이 논문의 그림이 아니다: "Table 2 of Kim et al. [5]", "Figure 3 in [12]", "Fig. 4 of Ref. 7"
  var OTHER_SRC = [
    /^\[\s*\d/,
    /^\(?\s*Refs?\b\.?\s*\[?\s*\d/i,
    /^(?:the\s+)?references?\s*(?:\[|\d)/i,
    /^(?:the\s+)?(?:supplement|appendix|online|extended)/i,
    /^(?:the\s+)?(?:paper|work|study|article|book|report|thesis|results?)\s+(?:of|by)\s/i,
    /^(?:their|his|her)\s+(?:paper|work|study)/i,
    /^(?:the\s+)?(?:same|that|latter|former)\s+(?:paper|study|work|article)\b/i,
    /^\p{Lu}[\p{L}'’\-]+(?:\s+(?:and|&)\s+\p{Lu}[\p{L}'’\-]+)?\s+et\s+al\b/u,
    /^\p{Lu}[\p{L}'’\-]+(?:\s+(?:and|&)\s+\p{Lu}[\p{L}'’\-]+)*\s*[,(]?\s*\(?\s*(?:19|20)\d\d/u,
    /^(?:the\s+)?(?:original|previous|earlier|prior|preceding|cited|referenced|published|other|related|existing)\s+(?:paper|papers|work|works|study|studies|article|articles|book|report|thesis|research|literature)\b/i,
  ];

  // 번호 바로 앞이 다른 논문을 가리키는 말인가: "(Kim et al., 2020, Fig. 3)", "[5, Fig. 3]", "Kim (2020)의 표 2", "[5]의 그림 3", "선행연구의 표 2"
  var BEFORE_NUM = /\[\s*\d{1,3}(?:\s*[-–,;]\s*\d{1,3})*\s*[,;]\s*$/;
  var BEFORE_AY = /[(（][^()（）]*?(\p{Lu}[\p{L}'’\-]+|[가-힣]{2,8})(?:\s+et\s+al\.?|\s*(?:외|등))?\s*,?\s*(?:19|20)\d\d[a-z]?\s*[,;:]\s*(?:pp?\.\s*\d+(?:\s*[-–]\s*\d+)?\s*[,;]\s*)?$/u;
  var BEFORE_YEAR_OPEN = /[(（]\s*(?:19|20)\d\d[a-z]?\s*[,;:]\s*(?:pp?\.\s*\d+(?:\s*[-–]\s*\d+)?\s*[,;]\s*)?$/;
  var BEFORE_YEAR_CLOSE = /(?:19|20)\d\d[a-z]?\s*[)）]\s*$/;
  var BEFORE_HAN = [
    /(?:위|동|해당|그)\s*(?:연구|논문|문헌)\s*의\s*$/,
    /(?:19|20)\d\d[a-z]?\s*[)）]\s*의\s*$/,
    /\[\s*\d[\d\s,\-–~]*\]\s*의\s*$/,
    /(?:선행|기존|이전|앞선|관련|타|다른|원|기발표)\s*(?:연구|논문|문헌)(?:들|자들?)?\s*의\s*$/,
    /원\s*(?:문|논문)\s*의\s*$/,
  ];
  function otherPaperBefore(t, idx) {
    var pre = t.slice(Math.max(0, idx - 100), idx).replace(/[<〈【]\s*$/, "");
    if (BEFORE_NUM.test(pre) || BEFORE_YEAR_OPEN.test(pre) || BEFORE_YEAR_CLOSE.test(pre)) return true;
    var m = BEFORE_AY.exec(pre);
    if (m && !NOT_AUTHOR[m[1].toLowerCase()]) return true;
    for (var i = 0; i < BEFORE_HAN.length; i++) if (BEFORE_HAN[i].test(pre)) return true;
    return false;
  }
  function pointsElsewhere(t, end) {
    var win = t.slice(end, end + 60);
    var cut = /[.!?;](?=\s|$)|\n/.exec(win.replace(/et\s+al\./g, "et al"));
    if (cut) win = win.slice(0, cut.index);
    win = win.slice(0, 40);
    if (/^[a-z]?\)?\s*,?\s*therein\b/i.test(win)) return true;
    var m = /^[a-z]?\)?\s*(?:of|in|from|by)\s+/.exec(win);
    if (m) {
      var rest = t.slice(end + m[0].length, end + m[0].length + 50);
      for (var i = 0; i < OTHER_SRC.length; i++) if (OTHER_SRC[i].test(rest)) return true;
    }
    // 창 안 어디서든 "from [5]", "in Ref. 7", "of the references [3]" 처럼 문헌 번호가 직접 나오면 다른 논문이다("(adapted from [5])", ", taken from [3]").
    // 저자·연도·"previous studies" 같은 말은 문장 속에서 흔하므로 위 시작 위치 검사에서만 본다.
    var re = /\b(?:of|in|from|by)\s+/g;
    var mm;
    while ((mm = re.exec(win))) {
      var rest2 = t.slice(end + mm.index + mm[0].length, end + mm.index + mm[0].length + 50);
      if (OTHER_SRC[0].test(rest2) || OTHER_SRC[1].test(rest2) || OTHER_SRC[2].test(rest2)) return true;
    }
    return false;
  }

  function findCrossRefs(pageText) {
    var t = norm(pageText);
    var all = [];
    for (var d = 0; d < XREF_DEFS.length; d++) {
      var def = XREF_DEFS[d];
      def.re.lastIndex = 0;
      var m;
      while ((m = def.re.exec(t))) {
        var raw = m[def.num] || (def.roman ? m[def.roman] : "");
        var num = def.kind === "sec" ? raw : numOf(raw);
        if (!num) continue;
        var end = m.index + m[0].length;
        if (SUPPL_BEFORE.test(t.slice(Math.max(0, m.index - 28), m.index))) continue; // "Supplementary Table 1" 은 본문의 표 1 이 아니다
        if (def.han && COUNTER_AFTER.test(t.slice(end, end + 3))) continue; // "표 3개"
        if (def.secHan && COUNTER_WORD.test(t.slice(Math.max(0, m.index - 4), m.index))) continue;
        if (def.kind === "fig" || def.kind === "table") {
          if (pointsElsewhere(t, end) || otherPaperBefore(t, m.index)) continue;
        }
        all.push({
          start: m.index,
          end: end,
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
  var CAP_RE = new RegExp("^[ \\t]*([<〈\\[【]?)[ \\t]*(Figure|FIGURE|Fig|FIG|Table|TABLE|Tab|그림|표)(\\.?)[ \\t]*(\\d{1,3}(?:[.\\-–]\\d{1,3})*(?![\\d])|[IVX]{1,5}(?![A-Za-z]))([ \\t]*)([>〉\\]】]?)(.*)$", "u");
  var NUM_TITLE = /^\d{1,4}(?:[.,]\d+)?[ \t]+[^\d\s.,;:)\]]/;
  var CONTINUED_RE =/^(?:\(?(?:continued|cont\.?)\)?|\(?계속\)?|이어서)/i;
  var EQ_END = /^(.*?)[ \t]*[(（]\s*(\d{1,3})\s*[)）][ \t]*$/;
  var MATH_SIGN = /[=≈≠≤≥∑∫∂√±×÷∈∝]/;
  // 서술어·조사로 시작하면 "Table 5 shows", "표 3 에서" 같은 본문이지 이름 없는 캡션이 아니다
  var NOT_TITLE_START = /^(?:(?:shows?|presents?|lists?|summari[sz]es?|gives?|illustrates?|displays?|and|or|of|in|is|are|was|were|has|have|can|will|would|also|then|that|which|where|as|for|with|to|from|by|at|on)\b|(?:에서|에는|에도|에|의|은|는|이|가|을|를|과|와|로|으로|도|만|보다)(?:\s|$))/i;
  var SENT_END = /[.!?。…][”"'’)\]」』]*$/;
  // 번호가 붙은 제목 줄("2.1.1. 이론적 배경", "3. Methods", "제2장 …")은 문장 중간에서 끊긴 본문이 아니다
  var HEADING_LIKE = /^\s*(?:\d+(?:\.\d+)*\.?|[IVX]+\.|[가-힣]\.|제\s*\d+\s*[장절편])\s/;

  // 줄 끝이 쪽 번호로 끝나는가(목차·그림 목록): 0 아님, 1 약함(공백 하나 뒤 숫자), 2 확실함(점선·넓은 여백): "…. 12", "⋯⋯ 16", "Setup   9", "장치 12". 소수점·시각·연도·쉼표 뒤 숫자는 쪽 번호가 아니다.
  function endsWithPageNumber(rest) {
    var tail = String(rest || "").replace(/\s+$/, "");
    if (tail.length > 400) return 0;
    // 쪽 번호 앞에는 공백이나 점선·줄표 같은 이음 글자(공백 없이 한 글자짜리 붙임표 "factor-1" 은 제외)가 온다
    var m = /^(.*?)((?:\s|[.·‥…⋯_\-–—•])+)(\d{1,4})$/.exec(tail);
    if (!m || !m[1]) return 0;
    if (!/\s/.test(m[2]) && m[2].length < 2) return 0;
    if (/^(?:19|20)\d\d$/.test(m[3])) return 0;
    if (/[\d.,:;/%+−(]$/.test(m[1])) return 0;
    // 점선·말줄임·세 칸 이상 여백으로 이어졌으면 확실한 쪽 번호(2), 공백 하나로 이어진 숫자는 "group 1" 같은 제목 끝일 수 있어 약한 증거(1)
    var lead = (m[2].match(/[.·‥…⋯_\-–—•]/g) || []).length;
    if (lead >= 2 || /[‥…⋯]/.test(m[2]) || /\s{3,}/.test(m[2])) return 2;
    return 1;
  }

  // 앞 줄이 문장 중간에서 줄바꿈된 본문 줄인가("…listed in" / "…than those in [3]")
  function proseWrapped(prevLine) {
    var p = String(prevLine == null ? "" : prevLine).replace(/\s+$/, "");
    if (!p.trim()) return false;
    if (SENT_END.test(p)) return false;
    if (/:$/.test(p)) return false;
    var lower = (p.match(/(?:^|[\s(])[a-z]{2,}(?=$|[\s,;.)\]])/g) || []).length;
    var han = (p.match(/[가-힣]{2,}/g) || []).length;
    return p.length >= 40 || lower >= 2 || han >= 3;
  }

  // 줄 하나가 캡션 머리 모양인지(앞 줄·쪽 번호 판정 없이). {kind, num, pageTail} | null
  function captionCore(line) {
    var m = CAP_RE.exec(line);
    if (!m) return null;
    var word = m[2];
    var kind = /^(?:Fig|FIG|Figure|FIGURE|그림)$/.test(word) ? "fig" : "table";
    var hangul = word === "그림" || word === "표";
    var num = numOf(m[4]);
    if (!num) return null;
    if (/^[IVX]/.test(m[4]) && kind === "fig") return null; // 로마 숫자 그림 번호는 받지 않는다
    var open = m[1];
    var sp = m[5];
    var close = m[6];
    var rest = m[7];
    var restTrim = rest.replace(/^[ \t]+/, "");
    var ok;
    if (open && close) ok = rest === "" || (/^[ \t]/.test(rest) && !/^[a-z]/.test(restTrim)); // <표 1>, [그림 2] — "<표 1>과" 처럼 조사가 붙은 본문은 아니다
    else if (open || close) ok = false;
    else if (/^[.:：|·\-–—](?:[ \t]|$)/.test(rest)) ok = true; // "Fig. 3." 뒤에 공백이 있어야 한다("Fig. 1.에서" 는 본문)
    else if (restTrim === "") ok = true;
    // 공백이 빠진 추출 글("Table1.모려분의 성분분석"): 라틴 머리말 + 번호 + 마침표 + 바로 이어진 제목, 짧은 줄만
    else if (!hangul && !sp && !open && !close && /^\.[가-힣\p{Lu}]/u.test(rest) && line.length <= 90 && !/[다요]\.?\s*$/.test(line)) ok = true;
    // 구두점 없는 "Table 3 Results of …", "표 5 제목": 번호 뒤 공백, 다음 낱말이 대문자·한글, 줄이 짧고, 서술어·조사로 시작하지 않을 때
    else if (sp && line.length <= 90 && (hangul ? /^[가-힣\p{Lu}]/u : /^\p{Lu}/u).test(restTrim) && !NOT_TITLE_START.test(restTrim) && !/[다요]\.?\s*$/.test(line)) ok = true;
    // 제목이 수치로 시작하는 캡션: "Table 4 25 μmol m-2s-1 PPFD radish sprouts growth promotion test results". 수치 뒤에 단위·낱말이 이어지고 낱말이 넷 이상이며 서술어로 끝나지 않을 때만.
    else if (sp && line.length <= 90 && NUM_TITLE.test(restTrim) && restTrim.split(/\s+/).length >= 5 && !COUNTER_AFTER.test(restTrim.replace(/^\d+(?:[.,]\d+)?\s*/, "")) && !NOT_TITLE_START.test(restTrim.replace(/^\d+(?:[.,]\d+)?\s*/, "")) && !/[다요]\.?\s*$/.test(line)) ok = true;
    else ok = false;
    if (!ok) return null;
    if (CONTINUED_RE.test(restTrim.replace(/^[.:：]\s*/, ""))) return null; // "Table 5. Continued" 는 이어진 쪽이지 캡션이 아니다
    var tail = close ? rest : restTrim;
    var tailKind = endsWithPageNumber(tail);
    return { kind: kind, num: num, pageTail: tailKind === 2, weakTail: tailKind === 1, bracketed: !!(open && close) };
  }

  // 줄 하나가 캡션 머리인지. {kind, num} | null. (그림·표 목록 줄, 문장 중간에서 줄바꿈된 본문 줄은 아니다)
  function captionOfLine(line, prevLine) {
    var c = captionCore(line);
    if (!c || c.pageTail) return null;
    if (prevLine != null && !c.bracketed && proseWrapped(prevLine) && !HEADING_LIKE.test(prevLine)) return null;
    return { kind: c.kind, num: c.num };
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

  // 목록 쪽 증거: 목차 제목 줄, 점선·여백 뒤 쪽 번호로 끝나는 줄
  var LIST_HEAD = /^\s*(?:List\s+of\s+(?:Figures|Tables|Illustrations)|(?:그림|표)(?:\s*(?:및|,)\s*(?:그림|표))?\s*(?:목차|차례|목록))\s*:?\s*$/i;
  // 일반 제목(Contents·목차·차례)은 쪽 번호로 끝나는 줄이 2줄 이상 있을 때만 목록 쪽으로 본다
  var LIST_HEAD_GENERIC = /^\s*(?:(?:Table\s+of\s+)?Contents|목\s*차|차\s*례)\s*:?\s*$/i;
  var LEADER_LINE = /(?:[.·‥…⋯]{2,}|(?:\.\s){2,}\.?)\s*\d{1,4}\s*$|[^\d\s.,:;%)]\s{3,}\d{1,4}\s*$/;
  // 앞 줄이 문장 중간(전치사·접속사·조사)에서 끊겼는가
  var OPEN_END = /(?:\b(?:in|by|see|and|or|of|the|to|with|than|as|from|on|at|for|are|is|was|were|be|that|which|a|an))\s*$/i;

  // 한 쪽의 캡션 후보를 거른다. lines: splitLines 결과, cores: 줄마다 captionCore 결과, meta: 줄마다 {x0, w, fs, y} | null (선택)
  // 반환: 줄마다 true(대상으로 쓸 수 있음) / false
  function acceptCaptions(lines, cores, meta) {
    var n = lines.length;
    var okFlags = new Array(n);
    var i;
    for (i = 0; i < n; i++) okFlags[i] = !!cores[i];
    var none = function () { return okFlags.map(function () { return false; }); };
    // 목록 쪽: 목차 제목 줄이 있거나, 점선·여백 뒤 쪽 번호로 끝나는 줄이 3줄 이상이면 이 쪽의 후보는 모두 버린다(첫 번째가 이기므로 목록 쪽이 진짜 캡션을 가린다)
    var leaders = 0;
    var capLeaders = 0;
    var tailLines = 0;
    var genericHead = false;
    for (i = 0; i < n; i++) {
      var tx = lines[i].text;
      if (tx.length <= 40 && LIST_HEAD.test(tx)) return none();
      if (tx.length <= 40 && LIST_HEAD_GENERIC.test(tx)) { genericHead = true; continue; }
      if (tx.length > 400) continue;
      if (LEADER_LINE.test(tx)) { leaders++; if (cores[i]) capLeaders++; }
      if (endsWithPageNumber(tx) > 0) tailLines++;
    }
    if (genericHead && tailLines >= 2) return none();
    if (capLeaders >= 3) return none(); // 표 행이 점선 꼬리로 끝나는 것은 목록이 아니다: 캡션 모양 줄이 셋일 때만
    var strong = 0;
    var tails = 0;
    for (i = 0; i < n; i++) {
      if (!cores[i]) continue;
      if (cores[i].pageTail) { strong++; tails++; } else if (cores[i].weakTail) tails++;
    }
    if (strong || leaders) {
      // 목록 증거가 있는 쪽에서는 숫자로만 끝나는 후보도 쪽 번호로 본다
      for (i = 0; i < n; i++) if (cores[i] && cores[i].weakTail) okFlags[i] = false;
    }
    // 약한 숫자 꼬리 캡션 바로 곁에 숫자 꼬리가 달린 캡션 모양 줄이 있으면 목록이 이어진 것이다(쪽 번호)
    var adjTail = function (idx, dir) {
      for (var q = idx + dir; q >= 0 && q < n; q += dir) {
        if (!lines[q].text.trim()) continue;
        return !!(cores[q] && (cores[q].weakTail || cores[q].pageTail));
      }
      return false;
    };
    for (i = 0; i < n; i++) if (cores[i] && cores[i].weakTail && okFlags[i] && (adjTail(i, -1) || adjTail(i, 1))) okFlags[i] = false;
    var listy = tails;
    var stats = null;
    if (meta) {
      var ws = [];
      var fss = [];
      var gaps = [];
      var lastY = null;
      for (i = 0; i < n; i++) {
        if (!meta[i]) continue;
        if (lines[i].text.trim().length >= 30) { ws.push(meta[i].w); if (meta[i].fs) fss.push(meta[i].fs); }
        if (lastY !== null && isFinite(meta[i].y)) { var g = Math.abs(lastY - meta[i].y); if (g > 0.5) gaps.push(g); }
        lastY = isFinite(meta[i].y) ? meta[i].y : lastY;
      }
      ws.sort(function (a, b) { return a - b; });
      fss.sort(function (a, b) { return a - b; });
      gaps.sort(function (a, b) { return a - b; });
      if (ws.length >= 5) stats = { maxW: ws[Math.floor(ws.length * 0.9)], fs: fss.length ? fss[fss.length >> 1] : 0, pitch: gaps.length ? gaps[gaps.length >> 1] : 0 };
    }
    // 연속 3줄 이상 이어지는 캡션 모양 줄(빈 줄은 건너뛴다)은 목록이다. 줄 위치와 줄 간격을 알면 왼쪽 x 가 같고 세로 간격이 줄 간격 안팎인 줄끼리만 한 목록으로 본다
    // (같은 높이에 나란한 캡션, 그림 크기만큼 떨어진 캡션 더미는 목록이 아니다)
    var chained = function (a, b) {
      if (!(meta && stats && stats.pitch && meta[a] && meta[b])) return true;
      if (!isFinite(meta[a].x0) || !isFinite(meta[b].x0) || !isFinite(meta[a].y) || !isFinite(meta[b].y)) return true;
      var dy = Math.abs(meta[a].y - meta[b].y);
      return Math.abs(meta[a].x0 - meta[b].x0) <= 3 && dy >= stats.pitch * 0.5 && dy <= stats.pitch * 2.5;
    };
    var run = [];
    var flush = function () {
      if (run.length >= 3) { run.forEach(function (x) { okFlags[x] = false; if (!cores[x].pageTail && !cores[x].weakTail) listy++; }); }
      run = [];
    };
    for (i = 0; i < n; i++) {
      if (!lines[i].text.trim()) continue;
      if (cores[i]) {
        if (run.length && !chained(run[run.length - 1], i)) flush();
        run.push(i);
      } else flush();
    }
    flush();
    if (listy >= 5) return none(); // 그림·표 목차 쪽
    var prevIdx = function (idx) { for (var q = idx - 1; q >= 0; q--) if (lines[q].text.trim()) return q; return -1; };
    var nextIdx = function (idx) { for (var q = idx + 1; q < n; q++) if (lines[q].text.trim()) return q; return -1; };
    var full = function (q) { return q >= 0 && meta && meta[q] && stats && meta[q].w >= stats.maxW * 0.93; };
    var bodySize = function (q) { return q >= 0 && meta && meta[q] && stats && stats.fs && Math.abs(meta[q].fs - stats.fs) <= stats.fs * 0.06; };
    for (i = 0; i < n; i++) {
      if (!okFlags[i]) continue;
      if (cores[i].pageTail) { okFlags[i] = false; continue; }
      if (cores[i].bracketed) continue; // "<표 2>", "[그림 3]" 은 줄 머리에서 본문으로 쓰이지 않는 형태라 앞 줄을 따지지 않는다
      var pi = prevIdx(i);
      if (pi >= 0) {
        var ptxt = lines[pi].text;
        // 앞 줄과의 세로 간격이 줄 간격보다 훨씬 크거나 앞 줄과 글자 크기가 다르면, 이 줄은 새 덩어리(캡션)에서 시작한다.
        // 단, 앞 줄이 전치사·조사에서 끊겼으면 그 간격은 단 바꿈일 뿐이다. 글자 크기는 본문이 아니라 바로 앞 줄과 견준다.
        var blockStart = false;
        if (meta && stats && stats.pitch && meta[pi] && meta[i] && isFinite(meta[pi].y) && isFinite(meta[i].y)) {
          var dyp = meta[pi].y - meta[i].y;
          if (Math.abs(dyp) > stats.pitch * 1.45) {
            // 앞 줄이 전치사·조사에서 끊겼으면 단 바꿈(위로 되돌아감, 다른 단)일 수 있다. 같은 단에서 아래로 줄 간격의 1.5배 넘게 떨어졌으면 새 덩어리다.
            var sameCol = isFinite(meta[pi].x0) && isFinite(meta[i].x0) && Math.abs(meta[pi].x0 - meta[i].x0) <= 3;
            blockStart = !OPEN_END.test(ptxt) || (dyp >= stats.pitch * 1.5 && sameCol);
          }
        }
        if (meta && meta[pi] && meta[i] && meta[pi].ff && meta[i].ff && meta[pi].ff !== meta[i].ff) blockStart = true; // 글꼴 계열이 바뀌면 새 덩어리
        if (meta && stats && meta[pi] && meta[i] && meta[pi].fs && meta[i].fs &&
            Math.abs(meta[pi].fs - meta[i].fs) > Math.max(meta[pi].fs, meta[i].fs) * 0.06) blockStart = true;
        if (!blockStart) {
          if (proseWrapped(ptxt) && !HEADING_LIKE.test(ptxt)) { okFlags[i] = false; continue; }
          // 앞 줄이 본문 폭을 꽉 채웠는데 문장이 끝나지 않았으면 같은 문장이 이어지는 것이다
          if (meta && full(pi) && !SENT_END.test(ptxt.replace(/\s+$/, "")) && !HEADING_LIKE.test(ptxt)) { okFlags[i] = false; continue; }
        }
      }
      if (meta && stats && full(i) && bodySize(i)) {
        // 본문과 같은 글자 크기로 폭을 꽉 채운 줄이 3줄 넘게 이어지면 캡션이 아니라 본문 문단이다
        var n1 = nextIdx(i);
        var n2 = n1 >= 0 ? nextIdx(n1) : -1;
        if (full(n1) && bodySize(n1) && full(n2) && bodySize(n2)) { okFlags[i] = false; continue; }
      }
    }
    return okFlags;
  }

  // 쪽 글 배열 -> Map("fig:3" | "table:2" | "eq:5" -> {page, offset}). 참고문헌 구역 안은 제외. 같은 번호는 첫 번째.
  // lineMeta: 선택. lineMeta[쪽-1][줄 번호] = {w, x0, fs}(줄 폭·왼쪽 x·글자 크기). 있으면 폭·글자 크기로 본문 줄바꿈을 더 정확히 가린다.
  function findTargets(pageTexts, lineMeta) {
    var out = new Map();
    var pages = pageTexts || [];
    var section = findReferenceSection(pages);
    for (var p = 1; p <= pages.length; p++) {
      var t = norm(pages[p - 1]);
      var span = sectionSpanOnPage(section, p, t.length);
      var lines = splitLines(t);
      var cores = lines.map(function (ln) {
        if (span && ln.s >= span.from && ln.s < span.to) return null;
        return captionCore(ln.text);
      });
      var accepted = acceptCaptions(lines, cores, lineMeta && lineMeta[p - 1]);
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (span && ln.s >= span.from && ln.s < span.to) continue;
        if (cores[i]) {
          if (!accepted[i]) continue;
          var k = cores[i].kind + ":" + cores[i].num;
          if (!out.has(k)) out.set(k, { page: p, offset: ln.s + (ln.text.length - ln.text.replace(/^[ \t]+/, "").length) });
          continue;
        }
        var prevLine = i > 0 ? lines[i - 1].text : null;
        var eq = equationOfLine(ln.text, prevLine);
        if (eq) {
          var ek = "eq:" + eq.num;
          if (!out.has(ek)) out.set(ek, { page: p, offset: ln.s });
        }
      }
    }
    return out;
  }

  // 캡션 후보가 있는 쪽 번호(1부터). preview.js 가 이 쪽들만 줄 폭·글자 크기를 읽는 데 쓴다.
  function captionPages(pageTexts) {
    var res = [];
    var pages = pageTexts || [];
    for (var p = 1; p <= pages.length; p++) {
      var lns = splitLines(norm(pages[p - 1]));
      for (var i = 0; i < lns.length; i++) if (captionCore(lns[i].text)) { res.push(p); break; }
    }
    return res;
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

  // 쪽 글 만들기 결과(pt: {text, charItem})와 pdf.js 글 조각(items)에서 줄마다 {x0, w, fs}(왼쪽 x, 폭, 글자 크기) | null 을 뽑는다.
  // findTargets 의 lineMeta 입력을 만드는 순수 함수. 가로쓰기만 다룬다.
  function lineMetaFromItems(pt, items) {
    var res = [];
    if (!pt || typeof pt.text !== "string" || !pt.charItem) return res;
    var pos = 0;
    pt.text.split("\n").forEach(function (ln) {
      var s = pos;
      var e = pos + ln.length;
      pos = e + 1;
      var seen = {};
      var x0 = Infinity;
      var x1 = -Infinity;
      var fs = 0;
      var y = NaN;
      var ff = "";
      for (var k = s; k < e; k++) {
        var ii = pt.charItem[k];
        if (ii === undefined || ii === null || ii < 0 || seen[ii]) continue;
        seen[ii] = true;
        var it = items && items[ii];
        if (!it || !it.transform) continue;
        var x = Number(it.transform[4]);
        var w = Number(it.width) || 0;
        if (!isFinite(x)) continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x + w);
        if (!isFinite(y)) { y = Number(it.transform[5]); ff = String(it.fontName || ""); }
        fs = Math.max(fs, Math.hypot(it.transform[2], it.transform[3]) || 0);
      }
      res.push(isFinite(x0) ? { x0: x0, w: x1 - x0, fs: fs, y: y, ff: ff } : null);
    });
    return res;
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
        if (!trimmed) {
          // 빈 줄 하나는 남겨 둔다(마지막 항목 뒤의 문단 경계를 알아보는 데 쓴다)
          if (parts.length && parts[parts.length - 1] !== "") { parts.push(""); len += 1; }
          continue;
        }
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
  // lineMeta: 선택. findTargets 와 같은 모양({w, x0, fs} 줄 배열의 쪽 배열). 없으면 글만으로 판정한다.
  function analyzeDocument(pageTexts, lineMeta) {
    var res = { section: null, refs: [], numbered: false, refCount: 0, targets: new Map() };
    res.section = findReferenceSection(pageTexts);
    res.targets = findTargets(pageTexts, lineMeta);
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
    // 섞인(두 단이 뒤섞였거나 번호가 겹친) 항목이 10% 넘으면 번호 목록 전체를 믿지 않는다
    res.unreliableCount = refs.filter(function (r) { return r.unreliable; }).length;
    if (res.numericOk && res.unreliableCount > refs.length * 0.1) res.numericOk = false;
    res.display = displayTexts(refs);
    // 섞인 항목은 카드에 쓸 문구를 비운다(referenceUsable 이 거른다)
    refs.forEach(function (r, i) { if (r.unreliable) res.display[i] = ""; });
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
    findSuperscriptCitations: findSuperscriptCitations,
    charGeometry: charGeometry,
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
    captionPages: captionPages,
    lineMetaFromItems: lineMetaFromItems,
    norm: norm,
    _metaList: metaList,
    _surnameKey: surnameKey,
  };
  root.ReaderRefs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
