// 목차(내장 목차 또는 제목 추정)와 쪽 축소 그림. 왼쪽 패널의 "목차"·"쪽" 탭을 스스로 채운다.
// 순수 함수(linesFromItems, guessHeadings, buildTree, findCurrentEntry)는 Node 테스트에서 require 로 검증한다.
// 브라우저에서는 window.ReaderOutline = {load, currentEntry, guessHeadings, linesFromItems}.
// 좌표는 쪽 좌표계(배율 1, 원점 왼쪽 위, 회전 반영). lines 의 y 는 글줄 밑선, 항목의 y 는 글줄 윗선이다.
(function (root) {
  "use strict";

  // ---------- 순수 계산 ----------
  var BOLD_RE = /bold|black|heavy/i;
  var GAP_LIMIT_EM = 1.5;      // 한 줄로 이을 수 있는 조각 사이 최대 간격(글자 크기 배수). 이보다 벌어지면 단이 다른 것으로 본다
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

  // fonts: {fontName: 실제 글꼴 이름} 또는 fontName -> 이름 함수. 없으면 굵기를 알 수 없어 보통으로 본다.
  function fontRealName(fonts, fontName) {
    if (!fonts || !fontName) return "";
    var v = typeof fonts === "function" ? fonts(fontName) : fonts[fontName];
    return typeof v === "string" ? v : "";
  }

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

  // bold: 글꼴 이름을 아는 글자가 절반을 넘으면 true/false, 모르면 null(글꼴 이름은 그 쪽이 그려져야 알 수 있다).
  function finishLine(cur) {
    var text = normalizeLineText(cur.parts.join(""));
    if (!text) return null;
    var bold = null;
    if (cur.knownChars * 2 >= cur.chars && cur.knownChars > 0) bold = cur.boldChars * 2 > cur.knownChars;
    return {
      text: text,
      fontSize: Number(topKey(cur.sizes)),
      bold: bold,
      font: topKey(cur.fontChars),
      x: cur.x,
      y: cur.y,
      x2: cur.x2,
    };
  }

  // textContent.items 를 글줄로 묶는다. 같은 밑선에서 이어지고 간격이 좁은 조각만 한 줄이 된다(단이 다르면 갈라진다).
  function linesFromItems(items, viewportTransform, fonts) {
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
      if (it.str.trim() === "") {
        if (it.hasEOL) flush();
        return;
      }
      var m = mul(vt, it.transform);
      // 세로로 눕은 글(표 안 회전 글 등)은 제목 후보에서 뺀다
      if (Math.abs(m[1]) > Math.abs(m[0])) { flush(); return; }
      var fs = Math.hypot(m[2], m[3]);
      if (!(fs > 0)) return;
      var x = m[4];
      var y = m[5];
      var w = (Number(it.width) || 0) * hScale;
      var chars = it.str.replace(/\s/g, "").length;
      var realName = fontRealName(fonts, it.fontName);
      var ref = cur ? Math.max(fs, cur.maxFs) : fs;
      // 위·아래 첨자(본문보다 작은 조각)는 밑선이 더 벌어져도 같은 줄로 본다
      var small = cur && fs <= 0.8 * cur.maxFs;
      var joins = cur &&
        Math.abs(y - cur.y) <= (small ? 0.7 : 0.35) * ref &&
        x >= cur.x2 - 0.5 * ref &&
        x - cur.x2 <= ((cur.lastLen === 1 && it.str.trim().length === 1) ? 4 : GAP_LIMIT_EM) * ref; // 자간을 벌린 제목("본 론")은 글자 하나씩 조각난다
      if (!joins) {
        flush();
        cur = { parts: [], sizes: {}, fontChars: {}, chars: 0, boldChars: 0, knownChars: 0, x: x, y: y, x2: x, maxFs: fs };
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
      if (realName) {
        cur.knownChars += chars;
        if (BOLD_RE.test(realName)) cur.boldChars += chars;
      }
      cur.x2 = x + w;
      if (fs > cur.maxFs) cur.maxFs = fs;
      if (it.hasEOL) flush();
    });
    flush();
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

  // 번호·표제 형식에 맞는지 본다. {kind, depth, rest, keyword}
  function classifyHeading(text) {
    var m;
    var depth = 0;
    var kind = "";
    var rest = text;
    if ((m = JANG_RE.exec(text))) {
      kind = "jang";
      depth = m[1] === "절" ? 2 : 1;
      rest = m[2] || "";
    } else if ((m = ROMAN_RE.exec(text))) {
      kind = "roman";
      depth = 1;
      rest = m[2];
    } else if ((m = NUM_RE.exec(text))) {
      var firstNum = parseInt(m[1].split(".")[0], 10);
      if (firstNum >= 1 && firstNum <= 30 && TITLE_START_RE.test(m[3]) && m[3].length >= 2) {
        // "1)" 처럼 닫는 괄호만 있으면 "1." 아래 단계
        kind = m[2].indexOf(")") >= 0 && m[1].indexOf(".") < 0 ? "paren" : "num";
        depth = m[1].split(".").length;
        rest = m[3];
      }
    }
    if (!kind && (m = SUBLETTER_RE.exec(text)) && TITLE_START_RE.test(m[2]) && !/[,&]/.test(m[2].slice(0, 30))) {
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
    return { kind: kind, depth: Math.min(4, depth), rest: rest, keyword: isKeyword };
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

  var LEADER_RE = /(\.{4,}|·{3,}|…{2,}|⋯{2,}|\.\s\.\s\.)/;

  // 한 줄이 제목이면 {level, kind, emph}, 아니면 null. ctx = {body, fonts}
  function judgeLine(line, ctx) {
    var text = String(line.text || "").replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > MAX_TITLE_LEN) return null;
    var cls = classifyHeading(text);
    if (!cls) return null;
    if (LEADER_RE.test(text)) return null; // 목차 쪽의 점선 줄
    var ratio = ctx.body > 0 ? line.fontSize / ctx.body : 1;
    var big = ratio >= BIG_RATIO;
    // 굵기: 글꼴 이름에 Bold 가 있으면 굵음. 이름만으로 알 수 없는 글꼴(예 "YDVYGO34")이 많으므로,
    // 본문과 다른 글꼴이면서 문서에서 드물게(전체 글자의 20% 이하) 쓰인 글꼴도 강조로 본다. 문자 번호 목록(A. B.)은 이 추정을 쓰지 않는다.
    var rareFont = !!line.font && !!ctx.fonts.body && line.font !== ctx.fonts.body &&
      ctx.fonts.total > 0 && (ctx.fonts.all[line.font] || 0) / ctx.fonts.total <= RARE_FONT_SHARE;
    var bold = (line.bold === true || (rareFont && cls.kind !== "letter")) && ratio >= MIN_BOLD_RATIO;
    // 문장 끝 부호로 끝나는 줄은 본문이다(번호 뒤의 점은 위에서 이미 번호로 처리됨).
    if (SENTENCE_END_RE.test(text)) return null;
    var numbered = cls.kind === "num" || cls.kind === "roman" || cls.kind === "jang" || cls.kind === "paren";
    var ok;
    if (numbered && cls.keyword) ok = big || bold || ratio >= MIN_BOLD_RATIO; // "1. 서론" 은 본문 크기여도 제목(본문보다 작으면 목차·각주)
    else ok = big || bold;                                                    // 번호만 있고 본문 크기·보통 굵기면 본문 항목
    if (!ok) return null;
    return { level: cls.depth, kind: cls.kind, emph: big || bold, big: big, bold: bold };
  }

  function repeatKey(text, y) {
    return text.replace(/\d+/g, "#").replace(/\s+/g, "") + "|" + Math.round(y / 3);
  }

  // 줄이 강조(큰 글자·굵은 글꼴·드문 글꼴)인지.
  function isEmphLine(line, ctx) {
    var ratio = ctx.body > 0 ? line.fontSize / ctx.body : 1;
    if (ratio >= BIG_RATIO) return true;
    if (line.bold === true && ratio >= MIN_BOLD_RATIO) return true;
    return !!line.font && !!ctx.fonts.body && line.font !== ctx.fonts.body && ctx.fonts.total > 0 &&
      (ctx.fonts.all[line.font] || 0) / ctx.fonts.total <= RARE_FONT_SHARE && ratio >= MIN_BOLD_RATIO;
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

  var CAPTION_RE = /^(table|fig|figure|supplementary|그림|표|도표|부록\s*\d)\b/i;

  // 번호·표제어가 없는 짧은 제목 후보(예: "세균에서의 QS", "Conflicts of Interest").
  function judgeTitleLine(line, ctx) {
    var text = String(line.text || "").replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > 45) return null;
    if (ctx.lineWidth > 0 && typeof line.x2 === "number" && line.x2 - line.x > 0.8 * ctx.lineWidth) return null; // 본문 폭을 꽉 채운 줄은 문장
    if (!/[A-Za-z가-힣]/.test(text) || SENTENCE_END_RE.test(text) || CAPTION_RE.test(text)) return null;
    if (/[@\[\]*†‡]|https?:|doi/i.test(text) || LEADER_RE.test(text)) return null; // 저자 표시(*, †)가 붙은 줄은 저자명
    if (!/^[A-Z가-힣一-鿿]/.test(text)) return null; // 소문자·숫자·부호로 시작하면 문장 조각
    if (text.split(" ").length > 8) return null;
    var ratio = ctx.body > 0 ? line.fontSize / ctx.body : 1;
    var rareFont = !!line.font && !!ctx.fonts.body && line.font !== ctx.fonts.body &&
      ctx.fonts.total > 0 && (ctx.fonts.all[line.font] || 0) / ctx.fonts.total <= RARE_FONT_SHARE;
    var emph = (line.bold === true && ratio >= MIN_BOLD_RATIO) || (rareFont && ratio >= 1.1);
    return emph ? { level: 1, kind: "title" } : null;
  }

  function medianOf(a) {
    var b = a.slice().sort(function (x, y) { return x - y; });
    return b.length ? b[Math.floor(b.length / 2)] : 0;
  }

  // pages: [{page, lines:[{text,fontSize,bold,font?,x,y}], height?}] -> [{title,page,y,yRatio?,level}]
  function guessHeadings(pages) {
    var ctx = { body: bodyFontSize(pages), fonts: fontStats(pages), lineWidth: bodyLineWidth(pages) };
    var cands = [];
    var seen = {};
    var firstPos = Infinity; // 번호·표제어 제목이 처음 나온 자리(쪽 번호와 세로 위치로 비교)
    function push(p, l, title, j, key) {
      cands.push({ title: title, page: p.page, line: l, level: j.level, kind: j.kind, key: key, height: p.height });
    }
    (pages || []).forEach(function (p) {
      var lines = p.lines || [];
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
        } else {
          firstPos = Math.min(firstPos, p.page * 1e6 + l.y);
        }
        var title = String(l.text).replace(/\s+/g, " ").trim();
        var key = repeatKey(title, l.y);
        (seen[key] = seen[key] || {})[p.page] = true;
        if (!titleOnly && isContinuation(l, j, lines[i + 1], ctx)) {
          title += " " + String(lines[i + 1].text).replace(/\s+/g, " ").trim();
          i++;
        }
        push(p, l, title, j, key);
      }
    });
    // 표지의 제목·저자·소속은 본문 제목이 아니다. 번호·표제어 제목이 처음 나온 자리 뒤의 번호 없는 제목만 받는다.
    cands = cands.filter(function (c) { return c.kind !== "title" || c.page * 1e6 + c.line.y > firstPos; });
    var out = [];
    cands.forEach(function (c) {
      if (Object.keys(seen[c.key]).length >= REPEAT_PAGES) return;
      var prev = out[out.length - 1];
      if (prev && prev.page === c.page && prev.title === c.title) return;
      var top = Math.max(0, c.line.y - c.line.fontSize);
      out.push({ title: c.title, page: c.page, y: top, level: c.level, kind: c.kind, size: c.line.fontSize, yRatio: c.height > 0 ? Math.min(1, top / c.height) : undefined });
    });
    // 번호가 붙은 같은 제목이 되풀이되면 앞의 것은 목차 쪽이다. 마지막(본문) 것만 남긴다.
    var lastIdx = {};
    out.forEach(function (e, i) { if (e.kind !== "keyword" && e.kind !== "title") lastIdx[e.kind + "|" + e.title] = i; });
    out = out.filter(function (e, i) { return e.kind === "keyword" || e.kind === "title" || lastIdx[e.kind + "|" + e.title] === i; });
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
      return o;
    });
  }

  // 평평한 목록 [{title,page,y,level}] 을 children 이 있는 트리로 바꾼다.
  function buildTree(flat) {
    var roots = [];
    var stack = [];
    (flat || []).forEach(function (f) {
      var node = { title: f.title, page: f.page, y: f.y, level: f.level, children: [] };
      if (f.yRatio !== undefined) node.yRatio = f.yRatio;
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

  // 지금 읽는 위치(page, y)보다 앞서 있거나 같은 마지막 항목의 번호. 없으면 -1. flat 은 문서 순서.
  function findCurrentEntry(flat, page, y) {
    var idx = -1;
    var pos = page * 1e6 + (y || 0);
    for (var i = 0; i < flat.length; i++) {
      var e = flat[i];
      var p = e.page * 1e6 + (e.y || 0);
      if (p <= pos + 2) idx = i;
    }
    return idx;
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

      async function convertOutline(pdf, nodes, level, tk) {
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
          if (tk !== token) return out;
          var n = nodes[i];
          var title = String((n && n.title) || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
          var pos = null;
          try { pos = n && n.dest ? await resolveDest(pdf, n.dest) : null; } catch (e) { pos = null; }
          var kids = n && n.items && n.items.length && level < 6 ? await convertOutline(pdf, n.items, level + 1, tk) : [];
          if (!pos || !title) {
            // 대상이 없는 항목은 건너뛰고 아래 항목은 같은 깊이로 올린다
            kids.forEach(function (k) { out.push(k); });
            continue;
          }
          out.push({ title: title, page: pos.page, y: pos.y, yRatio: pos.yRatio, level: level, children: kids });
        }
        return out;
      }

      // ----- 제목 추정 -----
      // 글꼴 번호는 문서 전체에서 같다. 그려진 쪽에서만 이름을 알 수 있으므로 알게 된 것은 문서 단위로 모은다.
      function collectFontNames(pg, tc, names) {
        (tc.items || []).forEach(function (it) {
          var f = it.fontName;
          if (!f || names[f]) return;
          try {
            if (pg.commonObjs.has(f)) {
              var o = pg.commonObjs.get(f);
              if (o && o.name) names[f] = o.name;
            }
          } catch (e) { /* 아직 읽히지 않은 글꼴 */ }
        });
      }

      async function guessDocument(tk) {
        var total = D.numPages();
        var pages = [];
        var names = {};
        var t0 = performance.now();
        for (var n = 1; n <= total; n++) {
          if (tk !== token) return null;
          var tc = await D.getTextContent(n);
          var pg = await D.getPage(n);
          if (tk !== token) return null;
          var vp = pg.getViewport({ scale: 1 });
          collectFontNames(pg, tc, names);
          var lines = linesFromItems(tc.items, vp.transform, names);
          pages.push({ page: n, lines: lines, height: vp.height });
          if (performance.now() - t0 > 10) { await nextIdle(); t0 = performance.now(); }
        }
        if (tk !== token) return null;
        // 나중에 그려진 쪽에서 알게 된 글꼴 이름으로 앞쪽의 모르던 굵기를 채운다
        pages.forEach(function (p) {
          p.lines.forEach(function (l) {
            if (l.bold === null && l.font && names[l.font]) l.bold = /bold|black|heavy/i.test(names[l.font]);
          });
        });
        return guessHeadings(pages);
      }

      async function loadFor(tk) {
        var pdf = D && D.getPdf && D.getPdf();
        if (!pdf) return { source: "none", entries: [] };
        var outline = null;
        try { outline = await pdf.getOutline(); } catch (e) { outline = null; }
        if (tk !== token) return null;
        if (outline && outline.length) {
          var tree = await convertOutline(pdf, outline, 1, tk);
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
        var left = $("rd-left");
        if (left) {
          left.addEventListener("click", function (ev) {
            if (ev.target && ev.target.closest && ev.target.closest('[role="tab"]')) {
              userPicked = true;
              pump();
            }
          });
        }
        // 패널·탭이 열리고 닫힐 때 보이는 축소 그림을 다시 살핀다.
        if (typeof MutationObserver !== "undefined") {
          var mo = new MutationObserver(function () { pump(); });
          var b = $("rd-body");
          if (b) mo.observe(b, { attributes: true, attributeFilter: ["class"] });
          var pp = panes().pages;
          if (pp) mo.observe(pp, { attributes: true, attributeFilter: ["hidden"] });
        }
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
      linesFromItems: linesFromItems,
      classifyHeading: classifyHeading,
      bodyFontSize: bodyFontSize,
      buildTree: buildTree,
      flattenTree: flattenTree,
      findCurrentEntry: findCurrentEntry,
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
