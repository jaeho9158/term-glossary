// 목차(내장 목차 또는 제목 추정)와 쪽 축소 그림. 왼쪽 패널의 "목차"·"쪽" 탭을 스스로 채운다.
// 순수 함수(linesFromItems, guessHeadings, buildTree, findCurrentEntry)는 Node 테스트에서 require 로 검증한다.
// 브라우저에서는 window.ReaderOutline = {load, currentEntry, guessHeadings, linesFromItems}.
// 좌표는 쪽 좌표계(배율 1, 원점 왼쪽 위, 회전 반영). lines 의 y 는 글줄 밑선, 항목의 y 는 글줄 윗선이다.
(function (root) {
  "use strict";

  // ---------- 순수 계산 ----------
  var GAP_LIMIT_EM = 1.0;      // 한 줄로 이을 수 있는 조각 사이 최대 간격(글자 크기 배수). 이보다 벌어지면 단이 다른 것으로 본다
  var WS_TOL_EM = 0.05;        // 공백 조각이 낀 틈의 허용 오차(공백 글자 폭이 정확히 1em 인 글꼴이 있다)
  var DETECT_GAP_EM = 0.5;     // 단 위치를 찾을 때 한 줄로 이을 최대 간격
  var WORD_GAP_EM = 0.18;      // 이 이상 벌어지면 공백을 넣는다
  var BIG_RATIO = 1.12;        // 본문보다 이 배수 이상 크면 "큰 글자"
  var MIN_BOLD_RATIO = 0.95;   // 굵은 제목 후보의 최소 크기 비율
  var MAX_TITLE_LEN = 80;
  var REPEAT_PAGES = 3;        // 같은 글이 이 쪽수 이상 같은 높이에 나오면 머리말·꼬리말
  var MIN_HEADINGS = 3;
  var RARE_FONT_SHARE = 0.2;

  function mul(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
  }

  function roundHalf(v) { return Math.round(v * 2) / 2; }

  function normalizeLineText(s) {
    // 일부 글꼴은 공백을 NUL 같은 제어 문자로 내보낸다
    var t = String(s).replace(/[\u0000-\u001f\u00a0\u200b]/g, " ").replace(/\s+/g, " ").trim();
    var collapse = root.collapseLetterSpacedHangul;
    if (typeof collapse === "function") t = collapse(t);
    return t;
  }

  function topKey(counts) {
    var best = 0;
    var bestKey = "";
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > best) { best = counts[k]; bestKey = k; }
    });
    return bestKey;
  }

  function finishLine(cur) {
    var text = normalizeLineText(cur.parts.join(""));
    if (!text) return null;
    return {
      text: text,
      fontSize: Number(topKey(cur.sizes)),
      font: topKey(cur.fontChars),
      x: cur.x,
      y: cur.y,
      x2: cur.x2,
    };
  }

  // textContent.items 를 글줄로 묶는다. 같은 밑선에서 이어지고 간격이 좁은 조각만 한 줄이 된다(단이 다르면 갈라진다).
  // gx: 두 단 쪽의 단 사이 가로 위치(없으면 null). 단 경계를 넘어 이어 붙이지 않는다.
  function assembleLines(items, viewportTransform, gx, gapEm) {
    var vt = viewportTransform || [1, 0, 0, 1, 0, 0];
    var hScale = Math.hypot(vt[0], vt[1]) || 1;
    var lines = [];
    var cur = null;
    function flush() {
      if (!cur) return;
      var l = finishLine(cur);
      if (l) lines.push(l);
      cur = null;
    }
    (items || []).forEach(function (it) {
      if (!it || typeof it.str !== "string" || !it.transform) return;
      var m = mul(vt, it.transform);
      if (it.str.trim() === "") {
        // 낱말 사이 공백 조각은 그 폭만큼 줄 끝을 늘린다(안 그러면 공백이 낀 틈이 실제보다 넓게 보여 줄이 갈라진다)
        var sw = (Number(it.width) || 0) * hScale;
        var sfs = Math.hypot(m[2], m[3]);
        if (cur && sfs > 0 && sw > 0 && sw <= (GAP_LIMIT_EM + WS_TOL_EM) * sfs && Math.abs(m[5] - cur.y) <= 0.35 * cur.maxFs &&
            m[4] >= cur.x2 - 0.5 * cur.maxFs && m[4] - cur.x2 <= 0.3 * cur.maxFs) {
          if (cur.parts.length && !/\s$/.test(cur.parts[cur.parts.length - 1])) cur.parts.push(" ");
          cur.x2 = Math.max(cur.x2, m[4] + Math.min(sw, 0.6 * sfs)); // 한 칸 공백은 0.6em 까지만 인정
          cur.ws = true; // 공백 조각이 낀 틈: 실제 글자 사이 전체 간격이 한계(1em)를 넘으면 이어 붙이지 않는다
        }
        if (it.hasEOL) flush();
        return;
      }
      // 세로로 눕은 글(표 안 회전 글 등)은 제목 후보에서 뺀다
      if (Math.abs(m[1]) > Math.abs(m[0])) { flush(); return; }
      var fs = Math.hypot(m[2], m[3]);
      if (!(fs > 0)) return;
      var x = m[4];
      var y = m[5];
      var w = (Number(it.width) || 0) * hScale;
      var chars = it.str.replace(/\s/g, "").length;
      var ref = cur ? Math.max(fs, cur.maxFs) : fs;
      // 위·아래 첨자(본문보다 작은 조각)는 밑선이 더 벌어져도 같은 줄로 본다
      var small = cur && fs <= 0.8 * cur.maxFs;
      var joins = cur &&
        Math.abs(y - cur.y) <= (small ? 0.7 : 0.35) * ref &&
        x >= cur.x2 - 0.5 * ref &&
        x - cur.x2 <= ((cur.lastLen === 1 && it.str.trim().length === 1) ? 4 : gapEm) * ref && // 자간을 벌린 제목("본 론")은 글자 하나씩 조각난다
        !(cur.ws && x - cur.tx2 > (((cur.lastLen === 1 && it.str.trim().length === 1) ? 4 : gapEm) + WS_TOL_EM) * ref) &&
        !(gx !== null && gx !== undefined && cur.x < gx && x >= gx);
      if (!joins) {
        flush();
        cur = { parts: [], sizes: {}, fontChars: {}, chars: 0, x: x, y: y, x2: x, maxFs: fs };
      } else if (x - cur.x2 > WORD_GAP_EM * ref) {
        var last = cur.parts.length ? cur.parts[cur.parts.length - 1] : "";
        if (!/\s$/.test(last) && !/^\s/.test(it.str)) cur.parts.push(" ");
      }
      cur.parts.push(it.str);
      cur.lastLen = it.str.trim().length;
      var key = String(roundHalf(fs));
      cur.sizes[key] = (cur.sizes[key] || 0) + chars;
      cur.chars += chars;
      cur.fontChars[it.fontName || ""] = (cur.fontChars[it.fontName || ""] || 0) + chars;
      cur.x2 = x + w;
      cur.tx2 = x + w;
      cur.ws = false;
      if (fs > cur.maxFs) cur.maxFs = fs;
      if (it.hasEOL) flush();
    });
    flush();
    return lines;
  }

  // 글줄 시작 가로 위치의 분포로 두 단 쪽인지 본다. 두 단이면 단 사이 가로 위치, 아니면 null.
  // 긴 줄(20자 이상)의 시작 위치가 왼쪽(왼쪽 끝에서 100pt 안쪽 전부, 들여쓴 줄 포함)과, 왼쪽 끝에서 100pt 이상 오른쪽의 한 지점(±1칸=6pt 창, 들여쓴 줄 포함)에 각각 6줄 이상·25% 이상 모이고,
  // (줄 끝 x2 를 아는 경우) 왼쪽 줄이 오른쪽 시작점을 넘어 뻗지 않으면 두 단이다.
  function detectGutter(lines) {
    var longL = (lines || []).filter(function (l) {
      return typeof l.x === "number" && String(l.text || "").replace(/\s/g, "").length >= 20;
    });
    if (longL.length < 12) return null;
    var xs = longL.map(function (l) { return l.x; }).sort(function (a, b) { return a - b; });
    var minX = xs[Math.floor(xs.length * 0.05)];
    // 왼쪽 단: 오른쪽 단 후보(왼쪽 끝에서 100pt 이상 오른쪽)에 못 미치는 모든 줄. 내어쓰기·들여쓴 첫 줄(참고문헌 쪽의 "50 x14 / 70 x34")도 같은 단이다.
    var left = longL.filter(function (l) { return l.x < minX + 100; });
    var rest = longL.filter(function (l) { return l.x >= minX + 100; });
    if (left.length < 6 || rest.length < 6) return null;
    var buckets = {};
    rest.forEach(function (l) { var k = Math.round(l.x / 6); buckets[k] = (buckets[k] || 0) + 1; });
    var bestK = null;
    Object.keys(buckets).forEach(function (k) {
      var n = (buckets[k] || 0) + (buckets[Number(k) - 1] || 0) + (buckets[Number(k) + 1] || 0);
      if (bestK === null || n > bestK.n) bestK = { k: Number(k), n: n };
    });
    if (!bestK) return null;
    // 후보를 고른 것과 같은 반올림 창(k-1..k+1)으로 줄을 거른다. 실수 비교(|x/6-k|<=1.01)로 하면 창 가장자리 줄이 빠져 진짜 두 단 쪽을 놓친다.
    var rightLines = rest.filter(function (l) { return Math.abs(Math.round(l.x / 6) - bestK.k) <= 1; });
    if (rightLines.length < 1) return null;
    var xr = medianOf(rightLines.map(function (l) { return l.x; }));
    // 오른쪽 단의 들여쓴 첫 줄·내어쓴 줄(±25pt)도 같은 단 군집으로 센다.
    var rightAll = rest.filter(function (l) { return Math.abs(l.x - xr) <= 25; });
    if (rightAll.length < 6 || rightAll.length < 0.25 * longL.length || left.length < 0.25 * longL.length) return null;
    var withX2 = left.filter(function (l) { return typeof l.x2 === "number"; });
    if (withX2.length >= 4) {
      var e = withX2.map(function (l) { return l.x2; }).sort(function (a, b) { return a - b; });
      var p90 = e[Math.floor(e.length * 0.9)];
      if (p90 > xr + 1) return null; // 왼쪽 줄이 오른쪽 시작점을 넘어서면 한 단(들여쓴 줄 모음)
      return (p90 + xr) / 2;
    }
    return xr - 6;
  }

  function linesFromItems(items, viewportTransform) {
    // 단 사이 간격이 좁아도(1em 미만) 단을 알아볼 수 있도록 먼저 0.5em 이상 벌어진 곳에서 끊어 단 위치를 찾고,
    // 찾았으면 그 경계를 넘지 않게, 못 찾았으면 1em 까지의 간격만 이어 붙인다.
    var g = detectGutter(assembleLines(items, viewportTransform, null, DETECT_GAP_EM));
    var lines = assembleLines(items, viewportTransform, g, GAP_LIMIT_EM);
    lines.gutter = g;
    return lines;
  }

  // ----- 제목 추정 -----
  var KEYWORDS = {};
  [
    "abstract", "introduction", "background", "literaturereview", "relatedwork", "relatedworks",
    "method", "methods", "methodology", "materialsandmethods", "experimental", "results",
    "resultsanddiscussion", "discussion", "conclusion", "conclusions", "conclusionsandfuturework",
    "summary", "references", "bibliography", "acknowledgment", "acknowledgments", "acknowledgement",
    "acknowledgements", "appendix", "appendices",
    "초록", "요약", "국문초록", "국문요약", "영문초록", "영문요약", "서론", "머리말", "들어가며", "들어가는말",
    "연구방법", "연구방법론", "이론적배경", "이론적고찰", "선행연구", "문헌고찰", "연구결과", "결과", "논의", "고찰",
    "결과및논의", "논의및결론", "결론", "결론및제언", "결론및논의", "맺음말", "참고문헌", "인용문헌", "참고자료",
    "감사의글", "사사", "부록", "결론및전망", "본론", "대상및방법", "재료및방법", "연구대상및방법", "증례", "서언", "연구의한계",
    "casereport", "casepresentation", "patientsandmethods", "limitations", "conflictsofinterest",
  ].forEach(function (k) { KEYWORDS[k] = true; });

  var REF_KEYS = { references: true, bibliography: true, 참고문헌: true, 인용문헌: true, 참고자료: true };

  function keywordKey(s) {
    return String(s).replace(/[\s<>\[\]()「」『』*]/g, "").replace(/[:：]$/, "").toLowerCase();
  }

  var NUM_RE = /^(\d{1,2}(?:\.\d{1,2}){0,3})(\s*[.)]\s*|\s+)(\S.*)$/;
  var ROMAN_RE = /^([IVX]{1,5}|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)\s*[.)]\s*(\S.*)$/;
  var JANG_RE = /^제\s*\d{1,2}\s*(장|절|편)\s*(\S.*)?$/;
  var SUBLETTER_RE = /^([A-Z])\s*[.)]\s+(\S.{1,})$/;
  var TITLE_START_RE = /^[A-Z가-힣一-鿿(\[「『“"']/;
  var SENTENCE_END_RE = /[.,;:。，；：]$|[-‐‑–]$/; // 문장 끝 부호, 또는 줄바꿈 하이픈
  // 소속·주소·전자우편 줄("1 Department of Medicine", "2 서울대학교 의과대학")
  var AFFIL_RE = /\b(?:Department|Dept|University|Univ|Institute|Institution|College|School|Hospital|Center|Centre|Laboratory|Faculty|Clinic|Division|Graduate|Academy|Labs?|Laborator(?:y|ies)|Corp|Corporation|Inc|Ltd|GmbH|LLC|Company|Corresponding|Tel|Fax|Seoul|Korea|Japan|China|USA|Taiwan|Germany|France|Canada|Australia|Kingdom)\b|대학교|대학원|대학|학과|학부|연구소|연구원|병원|센터|우편|주소|@|e-?mail|\b\d{5}(?:-\d{4})?\b/i;
  // 저자 나열("Kim and J. Lee", "Kim, J. Lee", "Smith & Jones", "Kim et al")
  var AUTHOR_LIST_RE = /^[A-Z][A-Za-z'’-]+(?:\s+[A-Z]\.?)*\s*(?:,\s*|\s+&\s+|\s+and\s+)(?:[A-Z]\.|[A-Z][a-z]+\b)|^[A-Z][A-Za-z'’-]+\s+et\s+al\b/;
  // 참고문헌 항목("Kim JH, ...", "Rychert J. ...", "J. Lee ...", "김철수 (2010)", "et al")
  var REF_ENTRY_RE = /^[가-힣]{2,4}(?:\s*[․·ㆍ,]\s*[가-힣]{2,4})+\s*[.,]|^\p{Lu}[\p{L}'’-]+,?\s+[A-Z]{1,3}[,.]|^(?:[A-Z]\.\s*)+[A-Z][a-z]+|\bet\s+al\b|\(\s*(?:19|20)\d{2}[a-z]?\s*\)/u;

  // 번호·표제 형식에 맞는지 본다. {kind, depth, rest, keyword, nodot}
  // nodot: 번호 뒤에 점·닫는 괄호가 없다("1 Introduction"). 소속·주소와 구별이 어려워 호출한 쪽에서 위치 조건을 더 건다.
  function classifyHeading(text) {
    var m;
    var depth = 0;
    var kind = "";
    var rest = text;
    var nodot = false;
    if ((m = JANG_RE.exec(text))) {
      kind = "jang";
      depth = m[1] === "절" ? 2 : 1;
      rest = m[2] || "";
    } else if ((m = ROMAN_RE.exec(text))) {
      var r = m[2];
      // 한 글자 로마 숫자("I.")는 저자 이름의 머리글자와 같다: 저자 나열·참고문헌 항목 모양이면 제목이 아니다
      var authorLike = /^[IVX]$/.test(m[1]) && KEYWORDS[keywordKey(r)] !== true &&
        (AUTHOR_LIST_RE.test(r) || REF_ENTRY_RE.test(r) || (r.match(/,/g) || []).length >= 2);
      if (!authorLike) {
        kind = "roman";
        depth = 1;
        rest = r;
      }
    } else if ((m = NUM_RE.exec(text))) {
      var firstNum = parseInt(m[1].split(".")[0], 10);
      var hasDot = /[.)]/.test(m[2]);
      if (firstNum >= 1 && firstNum <= 30 && TITLE_START_RE.test(m[3]) && m[3].length >= 2 &&
          !REF_ENTRY_RE.test(m[3]) && (hasDot || !AFFIL_RE.test(m[3]))) {
        // "1)" 처럼 닫는 괄호만 있으면 "1." 아래 단계
        kind = m[2].indexOf(")") >= 0 && m[1].indexOf(".") < 0 ? "paren" : "num";
        depth = m[1].split(".").length;
        rest = m[3];
        nodot = !hasDot;
      }
    }
    if (!kind && (m = SUBLETTER_RE.exec(text)) && TITLE_START_RE.test(m[2]) && !/[,&]/.test(m[2].slice(0, 30)) &&
        !AUTHOR_LIST_RE.test(m[2]) && !REF_ENTRY_RE.test(m[2])) {
      kind = "letter";
      depth = 2;
      rest = m[2];
    }
    var isKeyword = KEYWORDS[keywordKey(rest)] === true;
    if (!kind) {
      if (!isKeyword) return null;
      kind = "keyword";
      depth = 1;
    }
    return { kind: kind, depth: Math.min(4, depth), rest: rest, keyword: isKeyword, nodot: nodot };
  }

  // 본문 크기: 쪽마다 긴 줄(문장)에서 가장 많이 쓰인 크기를 구하고, 그런 쪽이 가장 많은 크기를 고른다
  // (참고문헌 쪽은 글자가 빽빽해 글자 수로 세면 이기므로 쪽 수로 센다). 동률이면 글자 수가 많은 쪽.
  function bodyFontSize(pages) {
    function pick(minLen) {
      var pageVotes = {};
      var chars = {};
      (pages || []).forEach(function (p) {
        var c = {};
        (p.lines || []).forEach(function (l) {
          if (!(l.fontSize > 0)) return;
          var n = String(l.text || "").replace(/\s/g, "").length;
          if (n < minLen) return;
          var k = String(roundHalf(l.fontSize));
          c[k] = (c[k] || 0) + n;
          chars[k] = (chars[k] || 0) + n;
        });
        var top = topKey(c);
        if (top !== "") pageVotes[top] = (pageVotes[top] || 0) + 1;
      });
      var best = "";
      Object.keys(pageVotes).forEach(function (k) {
        if (best === "" || pageVotes[k] > pageVotes[best] || (pageVotes[k] === pageVotes[best] && chars[k] > chars[best])) best = k;
      });
      return best;
    }
    var k0 = pick(25);
    if (k0 === "") k0 = pick(1);
    return k0 === "" ? 10 : Number(k0);
  }

  // 본문 한 줄의 가로 길이 기준(긴 줄의 90분위). x2 가 없으면 0.
  function bodyLineWidth(pages) {
    var w = [];
    (pages || []).forEach(function (p) {
      (p.lines || []).forEach(function (l) {
        if (typeof l.x2 === "number" && typeof l.x === "number" && String(l.text || "").length >= 25) w.push(l.x2 - l.x);
      });
    });
    if (w.length < 5) return 0;
    w.sort(function (a, b) { return a - b; });
    return w[Math.floor(w.length * 0.9)];
  }

  // 글꼴 번호별 글자 수 비율과 본문 글꼴(긴 줄에서 가장 많이 쓰인 글꼴).
  function fontStats(pages) {
    var all = {};
    var long = {};
    var total = 0;
    (pages || []).forEach(function (p) {
      (p.lines || []).forEach(function (l) {
        if (!l.font) return;
        var n = String(l.text || "").replace(/\s/g, "").length;
        all[l.font] = (all[l.font] || 0) + n;
        total += n;
        if (n >= 25) long[l.font] = (long[l.font] || 0) + n;
      });
    });
    var body = topKey(long) || topKey(all);
    return { all: all, total: total, body: body };
  }

  var LEADER_RE = /(\.{4,}|·{3,}|…{2,}|⋯{2,}|\.\s\.\s\.|-{4,}|_{4,}|─{3,})/;

  // 굵기 판정 규칙(결정적): pdf.js 는 글꼴의 실제 이름(Bold 여부)을 그 쪽이 그려진 뒤에야 주므로 쓰지 않는다
  // (같은 PDF가 그려진 순서에 따라 다른 목차가 나오면 안 된다). textContent.styles 의 fontFamily 는 serif/sans-serif 같은
  // 대체 글꼴 분류일 뿐 굵기를 담지 않아 쓰지 않는다. 쓰는 신호는 getTextContent 만으로 모든 쪽에서 얻는 둘뿐이다:
  // (1) 글자 크기가 본문 크기의 몇 배인가, (2) 줄의 글꼴 번호가 본문 글꼴과 다르면서 문서 전체 글자의 20% 이하로 드문가.
  // 호출자가 준 입력 플래그 line.bold === true 는 같은 신호로 본다(입력만으로 정해지므로 결정적). 브라우저 경로(linesFromItems)는 bold 를 만들지 않는다.
  function isRareFont(line, ctx) {
    if (line.bold === true) return true;
    return !!line.font && !!ctx.fonts.body && line.font !== ctx.fonts.body &&
      ctx.fonts.total > 0 && (ctx.fonts.all[line.font] || 0) / ctx.fonts.total <= RARE_FONT_SHARE;
  }

  // 한 줄이 제목이면 {level, kind, emph}, 아니면 null. ctx = {body, fonts}
  function judgeLine(line, ctx) {
    var text = String(line.text || "").replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > MAX_TITLE_LEN) return null;
    var cls = classifyHeading(text);
    if (!cls) return null;
    if (LEADER_RE.test(text)) return null; // 목차 쪽의 점선 줄
    var ratio = ctx.body > 0 ? line.fontSize / ctx.body : 1;
    var big = ratio >= BIG_RATIO;
    // 문자 번호 목록(A. B.)은 드문 글꼴 추정을 쓰지 않는다.
    var bold = isRareFont(line, ctx) && cls.kind !== "letter" && ratio >= MIN_BOLD_RATIO;
    // 문장 끝 부호로 끝나는 줄은 본문이다(번호 뒤의 점은 위에서 이미 번호로 처리됨).
    if (SENTENCE_END_RE.test(text)) return null;
    var numbered = cls.kind === "num" || cls.kind === "roman" || cls.kind === "jang" || cls.kind === "paren";
    var ok;
    if (numbered && cls.keyword) ok = big || bold || ratio >= MIN_BOLD_RATIO; // "1. 서론" 은 본문 크기여도 제목(본문보다 작으면 목차·각주)
    else ok = big || bold;                                                    // 번호만 있고 본문 크기·보통 굵기면 본문 항목
    if (!ok) return null;
    return { level: cls.depth, kind: cls.kind, emph: big || bold, big: big, bold: bold, nodot: cls.nodot, keyword: cls.keyword };
  }

  // 머리말·꼬리말 판별 열쇠: 줄 처음이나 끝의 쪽 번호 모양("3", "- 3 -", "3 / 12")만 떼고 비교한다.
  // 글 속 숫자까지 지우면 "1.1 개요 / 2.1 개요 / 3.1 개요" 같은 진짜 소절이 머리말로 오인된다.
  function repeatKey(text, y) {
    var s = String(text).replace(/\s+/g, " ").trim();
    s = s.replace(/^[–—-]?\s*\d{1,4}(?:\s*\/\s*\d{1,4})?\s*[–—-]?(?=\s|$)\s*/, "");
    s = s.replace(/(?:^|\s)[–—-]?\s*\d{1,4}(?:\s*\/\s*\d{1,4})?\s*[–—-]?$/, "");
    return s.replace(/\s+/g, "") + "|" + Math.round(y / 3);
  }

  // 줄이 강조(큰 글자·드문 글꼴)인지.
  function isEmphLine(line, ctx) {
    var ratio = ctx.body > 0 ? line.fontSize / ctx.body : 1;
    if (ratio >= BIG_RATIO) return true;
    return isRareFont(line, ctx) && ratio >= MIN_BOLD_RATIO;
  }

  // 제목이 두 줄로 꺾인 경우 다음 줄을 이어 붙일 수 있는지(둘 다 강조이고 크기·간격이 이어짐).
  function isContinuation(head, hj, next, ctx) {
    if (!next || !hj.emph) return false;
    if (Math.abs(next.fontSize - head.fontSize) > 0.6) return false;
    var dy = next.y - head.y;
    if (!(dy > 0 && dy <= head.fontSize * 1.9)) return false;
    var nt = String(next.text || "").replace(/\s+/g, " ").trim();
    if (!nt || head.text.length + nt.length + 1 > 120) return false;
    if (/[.,;:。]$/.test(nt) || classifyHeading(nt)) return false;
    // 본문 글꼴이 둘 이상인 문서에서 본문 줄을 이어 붙이지 않도록, 앞 줄과 같은 글꼴이어야 한다
    if (head.font && next.font && head.font !== next.font) return false;
    return isEmphLine(next, ctx);
  }

  // 표·그림 캡션 시작. \b 는 한글에서 경계로 동작하지 않으므로 "뒤에 글자가 이어지지 않음"으로 본다("표본", "도입"은 캡션이 아니다).
  var CAPTION_RE = /^(?:table|tab\.|fig\.?|figure|scheme|chart|plate|supplementary|supplemental|appendix\s+table|box|algorithm|equation|표|그림|도표|도|사진|식|부록\s*\d)(?![A-Za-z가-힣])/i;
  var TITLE_EMPH_RATIO = 1.1;

  // 번호 없는 제목 후보에서 뺄 줄: 저자명 나열, 날짜·접수 정보, 학술지명, 식별자.
  var TITLE_WORDS_RE = /\b(?:analysis|study|studies|review|effects?|factors?|disease|diseases|treatment|therapy|outcomes?|risk|model|models|method|methods|approach|design|system|systems|research|development|evaluation|management|prevention|diagnosis|clinical|patients?|policy|education)\b/i;
  var EN_NAME = "[A-Z][a-z]+(?:[-'’][A-Z]?[a-z]+)?";
  // "Kim Jaeho and Lee Minsu", "Kim Jaeho, Lee Minsu & Park"
  var EN_NAME_LIST_RE = new RegExp("^" + EN_NAME + "(?:\\s+(?:[A-Z]\\.?|" + EN_NAME + ")){1,2}\\s*(?:,|\\s+and\\s+|\\s+&\\s+)\\s*" + EN_NAME + "(?:\\s+(?:[A-Z]\\.?|" + EN_NAME + ")){0,2}(?:\\s*(?:,|\\s+and\\s+|\\s+&\\s+).*)?$");
  // "J. Kim, S. Lee", "Kim, J., Lee, S."
  var INITIAL_AUTHOR_RE = /^(?:[A-Z]\.\s*)+[A-Z][a-z]+(?:\s*[,&]|\s+and\b)|^[A-Z][a-z]+,\s*(?:[A-Z]\.\s*)+/;
  var KO_SURNAMES = "김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉사부";
  var META_LINE_RE = /^(?:received|accepted|revised|published|submitted|available\s+online|online\s+(?:first|publication)|correspond|address|copyright|keywords?|key\s+words?|running\s+(?:title|head)|orcid|corresponding|이메일|접수|수정|게재|투고|심사|채택|발행|수신|주저자|교신|공동저자|제\s*1\s*저자|키워드|주제어|핵심어)|orcid|\b(?:issn|isbn|vol\.?|pp\.?)\s*\d|\bno\.\s*\d|©|\b(?:19|20)\d{2}\s*년\s*\d{1,2}\s*월|(?:\d{1,2}\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:\d{1,2},?\s+)?(?:19|20)\d{2}\b/i;
  var JOURNAL_RE = /\b(?:journal|proceedings|transactions|annals|archives|bulletin)\s+of\b|\bjournal\s*$|학회지|학술지|논문집|학보$|저널/i;
  var INSTITUTION_RE = /^(?:department|dept\.?|division|school|faculty|institute|college|center|centre)\s+of\b|\b(?:university|hospital|laborator(?:y|ies))\s+(?:of\b|(?:college|school|hospital|medical|press|library|institute|department|graduate|center|centre)\b)|\b(?:university|hospital|laborator(?:y|ies))\s*$|\blabs?\b|\bcorp(?:oration)?\.?$|\b(?:ltd|inc|gmbh|llc)\.?$|대학교|대학원|병원|연구소|연구원/i;
  // 한글 저자 나열("김철수 이영희 박민수", "김철수·이영희"): 성씨로 시작하는 세 글자 낱말이 둘 이상이고 조사·접미로 끝나는 것이 없을 때.
  var KO_NON_NAME_END = "의에를은는과와로적들화론학법계률율업제책소회국인";
  function isKoreanNameList(text) {
    var toks = text.split(/[\s,·․ㆍ•]+/).filter(Boolean);
    if (toks.length < 2 || toks.length > 8) return false;
    for (var i = 0; i < toks.length; i++) {
      // 이름은 모두 세 글자(성+이름 두 글자)이고 낱말 끝이 조사·접미(의, 적, 학, 법, 인 …)가 아니다: "연구 방법의 한계" 같은 제목을 이름으로 오인하지 않는다
      if (!/^[가-힣]{3}$/.test(toks[i]) || KO_SURNAMES.indexOf(toks[i].charAt(0)) < 0 || KO_NON_NAME_END.indexOf(toks[i].charAt(2)) >= 0) return false;
      if (KEYWORDS[keywordKey(toks[i])] === true) return false;
    }
    return true;
  }
  // 쉼표·&·머리글자·et al 이 있거나 "Kim Jaeho and Lee Minsu"(양쪽 모두 두 낱말)일 때만 저자 나열이다: "Men and Women", "Supply and Demand" 는 제목.
  var AUTHOR_SHAPE_RE = /,|&|\b[A-Z]\.|\bet\s+al\b|^[A-Z][a-z]+ [A-Z][a-z]+ and [A-Z][a-z]+ [A-Z][a-z]+$/;
  function isPersonOrMeta(text) {
    if (META_LINE_RE.test(text) || JOURNAL_RE.test(text) || INSTITUTION_RE.test(text)) return true;
    if (INITIAL_AUTHOR_RE.test(text)) return true;
    if (!TITLE_WORDS_RE.test(text) && ((AUTHOR_LIST_RE.test(text) && AUTHOR_SHAPE_RE.test(text)) || EN_NAME_LIST_RE.test(text))) return true;
    return isKoreanNameList(text);
  }

  // 번호·표제어가 없는 짧은 제목 후보(예: "세균에서의 QS", "Conflicts of Interest").
  function judgeTitleLine(line, ctx) {
    var text = String(line.text || "").replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > 45) return null;
    if (ctx.lineWidth > 0 && typeof line.x2 === "number" && line.x2 - line.x > 0.8 * ctx.lineWidth) return null; // 본문 폭을 꽉 채운 줄은 문장
    if (!/[A-Za-z가-힣]/.test(text) || SENTENCE_END_RE.test(text) || CAPTION_RE.test(text)) return null;
    if (/[@\[\]*†‡]|https?:|doi/i.test(text) || LEADER_RE.test(text)) return null; // 저자 표시(*, †)가 붙은 줄은 저자명
    if (!/^[A-Z가-힣一-鿿]/.test(text)) return null; // 소문자·숫자·부호로 시작하면 문장 조각
    if (!/[가-힣一-鿿]/.test(text) && text.replace(/[^A-Za-z]/g, "").length < 4) return null; // "Li" 같은 라틴 조각
    if (isPersonOrMeta(text)) return null;
    if (text.split(" ").length > 8) return null;
    var ratio = ctx.body > 0 ? line.fontSize / ctx.body : 1;
    return isRareFont(line, ctx) && ratio >= TITLE_EMPH_RATIO ? { level: 1, kind: "title" } : null;
  }

  function medianOf(a) {
    var b = a.slice().sort(function (x, y) { return x - y; });
    return b.length ? b[Math.floor(b.length / 2)] : 0;
  }

  // ----- 제목 추정 단계 (동기 버전과 쪼갠 비동기 버전이 같은 단계를 쓴다) -----
  function makeContext(pages) {
    return { body: bodyFontSize(pages), fonts: fontStats(pages), lineWidth: bodyLineWidth(pages) };
  }

  function newState() {
    return { cands: [], seen: {}, firstPos: Infinity };
  }

  // 한 쪽의 후보를 모은다. 두 단 쪽의 후보는 읽는 순서(단, 세로 위치)로 정렬해 담는다.
  function pageCandidates(p, ctx, st) {
    var lines = p.lines || [];
    var gutter = p.gutter !== undefined ? p.gutter : detectGutter(lines);
    var tc = typeof gutter === "number";
    var mine = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      var j = judgeLine(l, ctx);
      var titleOnly = false;
      if (!j) {
        j = judgeTitleLine(l, ctx);
        if (!j) continue;
        titleOnly = true;
        // 앞 줄과 같은 글꼴·크기로 이어지는 줄은 여러 줄 제목(표지의 긴 제목 등)의 뒷부분이다
        var prev = lines[i - 1];
        if (prev && prev.font === l.font && Math.abs(prev.fontSize - l.fontSize) <= 0.6 && l.y - prev.y > 0 && l.y - prev.y <= l.fontSize * 1.9) continue;
      } else if (!j.nodot || j.keyword) {
        // 표지·소속과 구별되는 확실한 제목(점이 붙은 번호, 표제어)만 "본문이 시작된 자리"를 정한다
        st.firstPos = Math.min(st.firstPos, p.page * 1e6 + l.y);
      }
      var title = String(l.text).replace(/\s+/g, " ").trim();
      var key = repeatKey(title, l.y);
      (st.seen[key] = st.seen[key] || {})[p.page] = true;
      if (!titleOnly && isContinuation(l, j, lines[i + 1], ctx)) {
        title += " " + String(lines[i + 1].text).replace(/\s+/g, " ").trim();
        i++;
      }
      mine.push({
        title: title, page: p.page, line: l, level: j.level, kind: j.kind, key: key, height: p.height,
        nodot: !!j.nodot, keyword: !!j.keyword, tc: tc, col: tc && l.x >= gutter ? 1 : 0,
      });
    }
    if (tc) mine.sort(function (a, b) { return a.col - b.col || a.line.y - b.line.y; });
    for (var k = 0; k < mine.length; k++) st.cands.push(mine[k]);
  }

  function finishGuess(st) {
    var seen = st.seen;
    // 표지의 제목·저자·소속은 본문 제목이 아니다. 번호 없는 제목과 점 없는 번호("1 Department…")는
    // 점이 붙은 번호·표제어 제목이 처음 나온 자리 뒤에서만 받는다.
    var cands = st.cands.filter(function (c) {
      var weak = c.kind === "title" || (c.nodot && !c.keyword);
      return !weak || c.page * 1e6 + c.line.y > st.firstPos;
    });
    // 앞 번호가 없는 3번 이상의 "15)"·"3." 줄은 참고문헌 목록의 항목이다(앞 번호가 후보로 있어야 연속 번호로 본다. 걸러진 후보끼리 연쇄하지 않도록 거르기 전 후보로 본다).
    var seqHave = {};
    cands.forEach(function (c) {
      var sm = (c.kind === "num" || c.kind === "paren") && /^(\d{1,3})\s*[.)]/.exec(c.title);
      if (sm) seqHave[c.kind + "|" + sm[1]] = true;
    });
    var out = [];
    cands.forEach(function (c) {
      if (Object.keys(seen[c.key]).length >= REPEAT_PAGES) return;
      var sq = (c.kind === "num" || c.kind === "paren") && /^(\d{1,3})\s*[.)]/.exec(c.title);
      if (sq && Number(sq[1]) >= 3 && !seqHave[c.kind + "|" + (Number(sq[1]) - 1)]) return;
      var prev = out[out.length - 1];
      if (prev && prev.page === c.page && prev.title === c.title) return;
      var top = Math.max(0, c.line.y - c.line.fontSize);
      out.push({ title: c.title, page: c.page, y: top, level: c.level, kind: c.kind, size: c.line.fontSize, tc: c.tc, col: c.col, yRatio: c.height > 0 ? Math.min(1, top / c.height) : undefined });
    });
    // 번호가 붙은 같은 제목이 되풀이되면 앞의 것은 목차 쪽이다. 마지막(본문) 것만 남긴다.
    var lastIdx = {};
    out.forEach(function (e, i) { if (e.kind !== "keyword" && e.kind !== "title") lastIdx[e.kind + "|" + e.title.replace(/\s+/g, "")] = i; });
    out = out.filter(function (e, i) { return e.kind === "keyword" || e.kind === "title" || lastIdx[e.kind + "|" + e.title.replace(/\s+/g, "")] === i; });
    // 참고문헌 구역의 항목(문헌 목록)은 제목이 아니다. 다른 표제어(부록, 영문 초록 등)가 나오면 구역이 끝난다.
    var inRefs = false;
    out = out.filter(function (e) {
      if (e.kind === "keyword") { inRefs = REF_KEYS[keywordKey(e.title)] === true; return true; }
      return !inRefs;
    });
    // 번호·표제어 제목이 3개 미만이면 번호 없는 제목까지 합쳐 5개 이상일 때만 목차로 본다(굵은 줄 몇 개로 목차를 만들지 않는다).
    var structured = out.filter(function (e) { return e.kind !== "title"; });
    if (structured.length < MIN_HEADINGS && out.length < MIN_HEADINGS + 2) return [];
    if (out.length < MIN_HEADINGS) return [];
    // 번호 체계 사이의 위아래: 로마 숫자·장 > 아라비아 번호 > 괄호 번호·영문 가나다
    var hasRoman = out.some(function (e) { return e.kind === "roman" || (e.kind === "jang" && e.level === 1); });
    var maxNum = 0;
    out.forEach(function (e) { if (e.kind === "num" && e.level > maxNum) maxNum = e.level; });
    var kwSizes = out.filter(function (e) { return e.kind === "keyword"; }).map(function (e) { return e.size; });
    var topSizes = out.filter(function (e) { return e.kind === "roman" || (e.kind === "num" && e.level === 1) || e.kind === "jang"; }).map(function (e) { return e.size; });
    var refSize = medianOf(kwSizes.length ? kwSizes : topSizes);
    out.forEach(function (e) {
      if (e.kind === "num") e.level += hasRoman ? 1 : 0;
      else if (e.kind === "letter" || e.kind === "paren") e.level = 1 + (hasRoman ? 1 : 0) + maxNum;
      else if (e.kind === "title") e.level = !refSize || Math.abs(e.size - refSize) <= 0.6 || e.size > refSize ? 1 : 2;
    });
    var minLevel = Math.min.apply(null, out.map(function (e) { return e.level; }));
    return out.map(function (e) {
      var o = { title: e.title, page: e.page, y: e.y, level: e.level - (minLevel - 1) };
      if (e.yRatio !== undefined) o.yRatio = e.yRatio;
      if (e.tc) { o.tc = true; o.col = e.col; }
      return o;
    });
  }

  // pages: [{page, lines:[{text,fontSize,font?,x,y}], height?, gutter?}] -> [{title,page,y,yRatio?,level,tc?,col?}] (읽는 순서)
  function guessHeadings(pages) {
    var ctx = makeContext(pages);
    var st = newState();
    (pages || []).forEach(function (p) { pageCandidates(p, ctx, st); });
    return finishGuess(st);
  }

  // 같은 계산을 단계 사이에 pace() 를 불러 쪼갠다(pace 가 false 를 돌려주면 중단하고 null). 큰 문서에서 한 작업이 길게 막지 않도록.
  async function guessHeadingsAsync(pages, pace) {
    pages = pages || [];
    async function step() { return pace ? (await pace()) !== false : true; }
    if (!(await step())) return null;
    var ctx = { body: bodyFontSize(pages) };
    if (!(await step())) return null;
    ctx.fonts = fontStats(pages);
    if (!(await step())) return null;
    ctx.lineWidth = bodyLineWidth(pages);
    if (!(await step())) return null;
    var st = newState();
    for (var i = 0; i < pages.length; i++) {
      pageCandidates(pages[i], ctx, st);
      if ((i & 7) === 7 && !(await step())) return null;
    }
    if (!(await step())) return null;
    return finishGuess(st);
  }

  // 평평한 목록 [{title,page,y,level}] 을 children 이 있는 트리로 바꾼다.
  function buildTree(flat) {
    var roots = [];
    var stack = [];
    (flat || []).forEach(function (f) {
      var node = { title: f.title, page: f.page, y: f.y, level: f.level, children: [] };
      if (f.yRatio !== undefined) node.yRatio = f.yRatio;
      if (f.tc) { node.tc = true; node.col = f.col; }
      while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
      if (stack.length) stack[stack.length - 1].children.push(node);
      else roots.push(node);
      stack.push(node);
    });
    return roots;
  }

  function flattenTree(entries, out) {
    out = out || [];
    (entries || []).forEach(function (e) {
      out.push(e);
      if (e.children && e.children.length) flattenTree(e.children, out);
    });
    return out;
  }

  // 지금 읽는 위치(page, y)보다 앞서 있거나 같은 마지막 항목의 번호. 없으면 -1. flat 은 읽는 순서.
  // 두 단 쪽(항목의 tc)에서는 위에서 아래로 스크롤하는 동안 "어느 단을 읽는지" 알 수 없으므로 다음 규칙을 쓴다:
  // 이전 쪽의 마지막 항목이 기본이고, 이 쪽에서는 왼쪽 단 항목(y 가 위쪽 이하인 마지막 것)을 따르다가,
  // 보이는 맨 위가 이 쪽의 왼쪽 단 마지막 제목 y 를 지나면 그때부터 y 를 지난 오른쪽 단 항목을 따른다.
  function findCurrentEntry(flat, page, y) {
    var pos = (y || 0) + 2;
    var idx = -1;
    var onPage = [];
    for (var i = 0; i < flat.length; i++) {
      if (flat[i].page < page) idx = i;
      else if (flat[i].page === page) onPage.push(i);
    }
    if (!onPage.length) return idx;
    var twoCol = onPage.some(function (i) { return flat[i].tc; });
    if (!twoCol) {
      onPage.forEach(function (i) { if ((flat[i].y || 0) <= pos) idx = i; });
      return idx;
    }
    var leftIdx = -1;
    var rightIdx = -1;
    var lastLeftY = -Infinity;
    onPage.forEach(function (i) {
      var e = flat[i];
      var ey = e.y || 0;
      if (e.col === 1) { if (ey <= pos) rightIdx = i; } else {
        if (ey > lastLeftY) lastLeftY = ey;
        if (ey <= pos) leftIdx = i;
      }
    });
    if (rightIdx >= 0 && pos >= lastLeftY) return rightIdx;
    return leftIdx >= 0 ? leftIdx : idx;
  }

  // 그려 둔 축소 그림(쪽 번호 목록 done)이 max 개를 넘으면 비울 쪽 번호들: 현재 쪽에서 먼 것부터, 현재 쪽과 화면에 보이는 것(inView: Set)은 제외.
  function thumbsToRelease(done, cur, inView, max) {
    if (done.length <= max) return [];
    var order = done.slice().sort(function (a, b) { return Math.abs(b - cur) - Math.abs(a - cur) || b - a; });
    var out = [];
    var left = done.length;
    for (var i = 0; i < order.length && left > max; i++) {
      if (order[i] === cur || (inView && inView.has(order[i]))) continue;
      out.push(order[i]);
      left--;
    }
    return out;
  }

  // ----- 내장 목차 변환 (순수: resolve 가 대상을 {page,y,yRatio} 로 바꿔 준다) -----
  function shiftLevels(list, d) {
    (list || []).forEach(function (n) { n.level += d; shiftLevels(n.children, d); });
    return list;
  }

  function clampLevels(list, max) {
    (list || []).forEach(function (n) { if (n.level > max) n.level = max; clampLevels(n.children, max); });
    return list;
  }

  async function convertNodes(nodes, resolve, level, stale) {
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      if (stale && stale()) return out;
      var n = nodes[i];
      var title = String((n && n.title) || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
      var pos = null;
      try { pos = n && n.dest ? await resolve(n.dest) : null; } catch (e) { pos = null; }
      var kids = n && n.items && n.items.length && level < 60 ? await convertNodes(n.items, resolve, level + 1, stale) : [];
      if (!pos || !title) {
        // 대상이 없는 항목은 건너뛰고 아래 항목은 한 단계 올린다(건너뛴 조상 하나당 한 단계)
        shiftLevels(kids, -1).forEach(function (k) { out.push(k); });
        continue;
      }
      out.push({ title: title, page: pos.page, y: pos.y, yRatio: pos.yRatio, level: level, children: kids });
    }
    return out;
  }

  // 6단계보다 깊은 항목은 버리지 않고 6단계로 눌러 둔다.
  async function convertOutlineTree(nodes, resolve, stale) {
    var tree = await convertNodes(nodes || [], resolve, 1, stale);
    return clampLevels(tree, 6);
  }

  // ---------- 브라우저 ----------
  var api = {
    guessHeadings: guessHeadings,
    linesFromItems: linesFromItems,
    load: function () { return Promise.resolve({ source: "none", entries: [] }); },
    currentEntry: function () { return null; },
  };

  if (typeof document !== "undefined") {
    (function browser() {
      var D = null;
      var token = 0;
      var loadPromise = null;
      var flatEntries = [];
      var items = [];          // 목차 단추들 [{entry, el}]
      var currentIdx = -1;
      var userPicked = false;
      var thumbs = [];         // 쪽 축소 그림 [null, {btn, box, canvas, state}]
      var thumbTasks = [];
      var curThumb = 0;
      var inView = new Set();
      var running = 0;
      var io = null;
      var THUMB_W = 120;
      var THUMB_CONCURRENCY = 2;
      var MAX_THUMBS = 60;      // 그려 둔 채로 두는 축소 그림 수의 상한
      var pumpTimer = 0;

      function $(id) { return document.getElementById(id); }
      function rootEl() { return $("reader"); }
      function panes() {
        var P = root.ReaderPanels;
        return {
          outline: P && P.tabPanel("left", "outline"),
          pages: P && P.tabPanel("left", "pages"),
        };
      }
      function idle(fn) {
        if (root.requestIdleCallback) root.requestIdleCallback(function () { fn(); }, { timeout: 500 });
        else root.setTimeout(fn, 16);
      }
      function nextIdle() { return new Promise(function (res) { idle(res); }); }

      // ----- 내장 목차 -----
      async function resolveDest(pdf, dest) {
        if (typeof dest === "string") dest = await pdf.getDestination(dest);
        if (!Array.isArray(dest) || !dest.length) return null;
        var ref = dest[0];
        var idx;
        if (typeof ref === "number") idx = ref;
        else if (ref && typeof ref === "object") idx = await pdf.getPageIndex(ref);
        else return null;
        var page = idx + 1;
        if (!(page >= 1 && page <= pdf.numPages)) return null;
        var kind = dest[1] && dest[1].name;
        var left = 0;
        var top = null;
        if (kind === "XYZ") { left = dest[2]; top = dest[3]; }
        else if (kind === "FitH" || kind === "FitBH") top = dest[2];
        else if (kind === "FitR") { left = dest[2]; top = dest[5]; }
        var y = 0;
        var yRatio = 0;
        if (typeof top === "number" && isFinite(top)) {
          try {
            var pg = await D.getPage(page);
            var vp = pg.getViewport({ scale: 1 });
            var pt = vp.convertToViewportPoint(typeof left === "number" ? left : 0, top);
            y = Math.max(0, Math.min(vp.height, pt[1]));
            yRatio = vp.height > 0 ? y / vp.height : 0;
          } catch (e) { y = 0; yRatio = 0; }
        }
        return { page: page, y: y, yRatio: yRatio };
      }

      // ----- 제목 추정 -----
      // 글꼴 이름(Bold 여부)은 쓰지 않는다: 그려진 쪽에서만 알 수 있어 결과가 렌더 순서에 따라 달라지므로
      // 크기와 글꼴 번호의 드묾만으로 판정한다(위 순수 함수 isRareFont 설명 참고).
      // 한 번에 오래 막지 않도록 "동기로 일한 시간"만 재서(기다린 시간은 세지 않는다) 10ms 가 넘으면 유휴 시간에 양보한다.
      async function guessDocument(tk) {
        var total = D.numPages();
        var pages = [];
        var work = 0;
        for (var n = 1; n <= total; n++) {
          if (tk !== token) return null;
          var tc = await D.getTextContent(n);
          var pg = await D.getPage(n);
          if (tk !== token) return null;
          var t0 = performance.now();
          var vp = pg.getViewport({ scale: 1 });
          var lines = linesFromItems(tc.items, vp.transform);
          pages.push({ page: n, lines: lines, height: vp.height, gutter: lines.gutter });
          work += performance.now() - t0;
          if (work > 10) { await nextIdle(); work = 0; }
        }
        if (tk !== token) return null;
        // 모아 둔 줄 기록(글, 크기, 글꼴 번호, 위치)만으로 문서 전체 단계를 단계별로 쪼개 돌린다
        var last = performance.now();
        function pace() {
          if (tk !== token) return false;
          if (performance.now() - last < 8) return true;
          return nextIdle().then(function () { last = performance.now(); return tk === token; });
        }
        return guessHeadingsAsync(pages, pace);
      }

      async function loadFor(tk) {
        var pdf = D && D.getPdf && D.getPdf();
        if (!pdf) return { source: "none", entries: [] };
        var outline = null;
        try { outline = await pdf.getOutline(); } catch (e) { outline = null; }
        if (tk !== token) return null;
        if (outline && outline.length) {
          var tree = await convertOutlineTree(outline, function (dest) { return resolveDest(pdf, dest); }, function () { return tk !== token; });
          if (tk !== token) return null;
          if (tree.length) return { source: "pdf", entries: tree };
        }
        var flat;
        try { flat = await guessDocument(tk); } catch (err) {
          if (tk !== token) return null;
          console.error("[reader] 목차 추정 실패", err);
          return { source: "none", entries: [], failed: true };
        }
        if (flat === null) return null;
        if (flat.length) return { source: "guess", entries: buildTree(flat) };
        return { source: "none", entries: [] };
      }

      function load() {
        if (!loadPromise) {
          var tk = token;
          loadPromise = loadFor(tk).then(function (r) {
            return r || { source: "none", entries: [] };
          });
        }
        return loadPromise;
      }

      // ----- 목차 패널 -----
      function setMessage(pane, text) {
        pane.textContent = "";
        var p = document.createElement("p");
        p.className = "rd-pane-empty";
        p.textContent = text;
        pane.appendChild(p);
      }

      function goEntry(e) {
        var N = root.ReaderNav;
        var ratio = typeof e.yRatio === "number" ? e.yRatio : 0;
        if (N && N.jump) N.jump(e.page, ratio);
        else if (D) D.goToPage(e.page, { yRatio: ratio });
        var narrow = root.matchMedia && root.matchMedia("(max-width: 767px)").matches;
        if (narrow && root.ReaderPanels) root.ReaderPanels.close("left");
      }

      function renderOutline(result, tk) {
        var pane = panes().outline;
        if (!pane || tk !== token) return;
        flatEntries = flattenTree(result.entries);
        items = [];
        currentIdx = -1;
        if (!flatEntries.length) {
          setMessage(pane, result.failed ? "목차를 만드는 중 문제가 생겼습니다." : "이 문서에서는 목차를 찾지 못했습니다");
          if (!userPicked && root.ReaderPanels) root.ReaderPanels.selectTab("left", "pages");
          return;
        }
        pane.textContent = "";
        if (result.source === "guess") {
          var note = document.createElement("p");
          note.className = "ro-note";
          note.textContent = "글자 크기와 번호 형식으로 추정한 목차입니다.";
          pane.appendChild(note);
        }
        var ul = document.createElement("ul");
        ul.className = "ro-list";
        flatEntries.forEach(function (e) {
          var li = document.createElement("li");
          var b = document.createElement("button");
          b.type = "button";
          b.className = "ro-item";
          b.style.setProperty("--ro-lv", String(Math.max(0, e.level - 1)));
          var t = document.createElement("span");
          t.className = "ro-title";
          t.textContent = e.title;
          var pg = document.createElement("span");
          pg.className = "ro-pg";
          pg.textContent = String(e.page);
          b.appendChild(t);
          b.appendChild(pg);
          b.title = e.title;
          b.addEventListener("click", function () { goEntry(e); });
          li.appendChild(b);
          ul.appendChild(li);
          items.push({ entry: e, el: b });
        });
        pane.appendChild(ul);
        if (!userPicked && root.ReaderPanels) root.ReaderPanels.selectTab("left", "outline");
        updateCurrent();
      }

      function readingY() {
        var N = root.ReaderNav;
        var sc = D && D.scrollEl && D.scrollEl();
        if (!N || !N.position || !sc) return null;
        var pt = N.position(sc.clientHeight * 0.25);
        if (!pt) return null;
        return { page: pt.page, y: pt.yRatio * D.pageSize(pt.page).h };
      }

      function currentEntry(page, y) {
        var i = findCurrentEntry(flatEntries, page, y);
        return i >= 0 ? flatEntries[i] : null;
      }

      function updateCurrent() {
        if (!items.length) return;
        var pos = readingY();
        if (!pos) return;
        var idx = findCurrentEntry(flatEntries, pos.page, pos.y);
        if (idx === currentIdx) return;
        if (currentIdx >= 0 && items[currentIdx]) {
          items[currentIdx].el.classList.remove("is-current");
          items[currentIdx].el.removeAttribute("aria-current");
        }
        currentIdx = idx;
        if (idx < 0) return;
        var el = items[idx].el;
        el.classList.add("is-current");
        el.setAttribute("aria-current", "true");
        keepVisible(panes().outline, el);
      }

      function keepVisible(pane, el) {
        if (!pane || !el || pane.hidden || pane.clientHeight === 0) return;
        var pr = pane.getBoundingClientRect();
        var er = el.getBoundingClientRect();
        if (er.top < pr.top + 8) pane.scrollTop -= pr.top + 8 - er.top;
        else if (er.bottom > pr.bottom - 8) pane.scrollTop += er.bottom - (pr.bottom - 8);
      }

      // ----- 쪽 축소 그림 -----
      function thumbsVisible() {
        var pane = panes().pages;
        if (!pane || pane.hidden) return false;
        var P = root.ReaderPanels;
        return !P || P.isOpen("left");
      }

      function buildThumbs(total, tk) {
        var pane = panes().pages;
        if (!pane) return;
        pane.textContent = "";
        thumbs = [null];
        var wrap = document.createElement("div");
        wrap.className = "ro-thumbs";
        for (var n = 1; n <= total; n++) {
          var sz = D.pageSize(n);
          var b = document.createElement("button");
          b.type = "button";
          b.className = "ro-thumb";
          b.dataset.page = String(n);
          b.setAttribute("aria-label", n + "쪽으로 이동");
          var box = document.createElement("span");
          box.className = "ro-thumb-box";
          box.style.width = THUMB_W + "px";
          box.style.height = Math.round(THUMB_W * sz.h / sz.w) + "px";
          var lab = document.createElement("span");
          lab.className = "ro-thumb-n";
          lab.textContent = String(n);
          b.appendChild(box);
          b.appendChild(lab);
          (function (page) {
            b.addEventListener("click", function () {
              if (D) D.goToPage(page);
              var narrow = root.matchMedia && root.matchMedia("(max-width: 767px)").matches;
              if (narrow && root.ReaderPanels) root.ReaderPanels.close("left");
            });
          })(n);
          wrap.appendChild(b);
          thumbs.push({ btn: b, box: box, state: "idle" });
        }
        pane.appendChild(wrap);
        if (typeof IntersectionObserver !== "undefined") {
          io = new IntersectionObserver(function (entries) {
            if (tk !== token) return;
            entries.forEach(function (en) {
              var n = Number(en.target.dataset.page);
              if (en.isIntersecting) inView.add(n); else inView.delete(n);
            });
            pump();
          }, { root: pane, rootMargin: "240px 0px" });
          for (var i = 1; i <= total; i++) io.observe(thumbs[i].btn);
        }
        markCurrentThumb(D.currentPage());
      }

      function pump() {
        if (pumpTimer) return;
        pumpTimer = root.setTimeout(function () { pumpTimer = 0; doPump(); }, 0);
      }

      function doPump() {
        if (!D || !thumbsVisible()) return;
        while (running < THUMB_CONCURRENCY) {
          var next = 0;
          inView.forEach(function (n) {
            if (thumbs[n] && thumbs[n].state === "idle" && (!next || n < next)) next = n;
          });
          if (!next) return;
          renderThumb(next);
        }
      }

      async function renderThumb(n) {
        var th = thumbs[n];
        var tk = token;
        th.state = "running";
        running++;
        var task = null;
        try {
          var pg = await D.getPage(n);
          if (tk !== token) return;
          var v1 = pg.getViewport({ scale: 1 });
          var dpr = Math.min(2, root.devicePixelRatio || 1);
          var s = (THUMB_W / v1.width) * dpr;
          var vp = pg.getViewport({ scale: s });
          var canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(vp.width));
          canvas.height = Math.max(1, Math.floor(vp.height));
          canvas.style.width = THUMB_W + "px";
          canvas.style.height = Math.round(THUMB_W * v1.height / v1.width) + "px";
          canvas.className = "ro-thumb-canvas";
          task = pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
          thumbTasks.push(task);
          await task.promise;
          if (tk !== token) return;
          th.box.style.height = canvas.style.height;
          th.box.textContent = "";
          th.box.appendChild(canvas);
          th.state = "done";
          trimThumbs();
        } catch (err) {
          if (tk !== token) return;
          var cancelled = err && (err.name === "RenderingCancelledException" || /cancel/i.test(String(err.message || "")));
          th.state = cancelled ? "idle" : "failed";
          if (!cancelled) console.error("[reader] 쪽 축소 그림 실패", n, err);
        } finally {
          if (task) {
            var i = thumbTasks.indexOf(task);
            if (i >= 0) thumbTasks.splice(i, 1);
          }
          if (tk === token) {
            running--;
            pump();
          }
        }
      }

      // 그려 둔 축소 그림이 MAX_THUMBS 를 넘으면 현재 쪽에서 가장 먼 것부터 비운다(캔버스 크기를 0 으로 줄여 메모리를 돌려준다).
      // 지금 화면에 보이는 것과 현재 쪽은 비우지 않으며, 비운 것은 다시 보이면 새로 그려진다.
      function trimThumbs() {
        var done = [];
        for (var n = 1; n < thumbs.length; n++) if (thumbs[n] && thumbs[n].state === "done") done.push(n);
        thumbsToRelease(done, curThumb, inView, MAX_THUMBS).forEach(function (k) { releaseThumb(thumbs[k]); });
      }

      function releaseThumb(th) {
        var cv = th.box.querySelector("canvas");
        if (cv) { cv.width = 0; cv.height = 0; }
        th.box.textContent = "";
        th.state = "idle";
      }

      // "쪽"·"목차" 탭이 나중에 열렸을 때 그 순간 현재 항목이 보이게 한다(숨겨진 동안에는 스크롤 위치를 계산할 수 없다).
      var wasShown = { pages: false, outline: false };
      function paneShown(pane) { return !!pane && !pane.hidden && pane.clientHeight > 0; }
      // 처음 관찰을 시작할 때 실제 상태로 맞춰 둔다(그렇지 않으면 이미 열려 있던 탭이 첫 변화 때 한 번 스크롤된다).
      function syncShown() {
        var P = panes();
        wasShown.pages = paneShown(P.pages);
        wasShown.outline = paneShown(P.outline);
      }
      function revealCurrent() {
        var P = panes();
        var shown = paneShown;
        var sp = shown(P.pages);
        var so = shown(P.outline);
        // 보이지 않던 것이 보이게 된 때만(보이는 동안 사용자가 스크롤한 자리는 건드리지 않는다)
        if (sp && !wasShown.pages && curThumb && thumbs[curThumb]) keepVisible(P.pages, thumbs[curThumb].btn);
        if (so && !wasShown.outline && currentIdx >= 0 && items[currentIdx]) keepVisible(P.outline, items[currentIdx].el);
        wasShown.pages = sp;
        wasShown.outline = so;
      }

      function markCurrentThumb(n) {
        if (curThumb && thumbs[curThumb]) {
          thumbs[curThumb].btn.classList.remove("is-current");
          thumbs[curThumb].btn.removeAttribute("aria-current");
        }
        curThumb = 0;
        var th = thumbs[n];
        if (!th) return;
        curThumb = n;
        th.btn.classList.add("is-current");
        th.btn.setAttribute("aria-current", "page");
        keepVisible(panes().pages, th.btn);
      }

      // ----- 수명 -----
      function teardown() {
        token++;
        loadPromise = null;
        flatEntries = [];
        items = [];
        currentIdx = -1;
        userPicked = false;
        thumbTasks.forEach(function (t) { try { t.cancel(); } catch (e) { /* 이미 끝남 */ } });
        thumbTasks = [];
        if (io) { io.disconnect(); io = null; }
        inView.clear();
        running = 0;
        thumbs = [null];
        curThumb = 0;
        wasShown.pages = false;
        wasShown.outline = false;
        if (pumpTimer) { root.clearTimeout(pumpTimer); pumpTimer = 0; }
        var p = panes();
        if (p.outline) p.outline.textContent = "";
        if (p.pages) p.pages.textContent = "";
      }

      function onDocOpen() {
        D = root.ReaderDoc;
        teardown();
        var tk = token;
        var p = panes();
        if (!p.outline || !p.pages) return;
        setMessage(p.outline, "목차를 찾는 중…");
        if (root.ReaderPanels) root.ReaderPanels.selectTab("left", "outline");
        buildThumbs(D.numPages(), tk);
        load().then(function (res) { renderOutline(res, tk); }, function (err) {
          if (tk !== token) return;
          console.error("[reader] 목차 읽기 실패", err);
          renderOutline({ source: "none", entries: [], failed: true }, tk);
        });
      }

      function wire() {
        var el = rootEl();
        if (!el) return;
        D = root.ReaderDoc;
        var scheduled = 0;
        el.addEventListener("reader:docopen", onDocOpen);
        el.addEventListener("reader:docclose", teardown);
        el.addEventListener("reader:pagechange", function (ev) {
          markCurrentThumb(ev.detail && ev.detail.page);
          updateCurrent();
        });
        el.addEventListener("reader:scalechange", function () { updateCurrent(); });
        var sc = D && D.scrollEl && D.scrollEl();
        if (sc) {
          sc.addEventListener("scroll", function () {
            if (scheduled) return;
            scheduled = root.requestAnimationFrame(function () { scheduled = 0; updateCurrent(); });
          }, { passive: true });
        }
        // 사용자가 직접 탭을 고르면(누르기·화살표 키) 자동 전환을 멈춘다. 알림은 ReaderPanels 가 준다.
        if (root.ReaderPanels && root.ReaderPanels.onTabChange) {
          root.ReaderPanels.onTabChange(function (ev) {
            if (ev.side === "left") { userPicked = true; pump(); }
          });
        }
        // 패널·탭이 열리고 닫힐 때 보이는 축소 그림을 다시 살핀다.
        if (typeof MutationObserver !== "undefined") {
          var mo = new MutationObserver(function () { pump(); revealCurrent(); });
          var b = $("rd-body");
          if (b) mo.observe(b, { attributes: true, attributeFilter: ["class"] });
          var pp = panes().pages;
          if (pp) mo.observe(pp, { attributes: true, attributeFilter: ["hidden"] });
          var po = panes().outline;
          if (po) mo.observe(po, { attributes: true, attributeFilter: ["hidden"] });
        }
        syncShown();
        // 이미 열린 문서가 있으면 따라잡는다.
        if (D && D.getPdf && D.getPdf()) onDocOpen();
      }

      api.load = load;
      api.currentEntry = function (page, y) { return currentEntry(page, y); };

      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
      else wire();
    })();
  }

  if (typeof document !== "undefined") root.ReaderOutline = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      guessHeadings: guessHeadings,
      guessHeadingsAsync: guessHeadingsAsync,
      linesFromItems: linesFromItems,
      detectGutter: detectGutter,
      thumbsToRelease: thumbsToRelease,
      repeatKey: repeatKey,
      convertOutlineTree: convertOutlineTree,
      shiftLevels: shiftLevels,
      clampLevels: clampLevels,
      classifyHeading: classifyHeading,
      bodyFontSize: bodyFontSize,
      buildTree: buildTree,
      flattenTree: flattenTree,
      findCurrentEntry: findCurrentEntry,
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
