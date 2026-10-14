// 인용 카드의 "자세히" — Crossref 서지 조회. 사용자가 누를 때만, 참고문헌 한 건의 문구만 보낸다.
// 요청에는 사용자 지정 헤더·mailto·식별자를 넣지 않는다(사이트 규칙). 잘못된 논문을 "그 문헌"으로
// 보여 주는 것이 최악이므로 일치 판정은 보수적이다: 제목 낱말 순서 일치·연도·첫 저자가 모두 맞아야 한다.
// 한글(국문) 문헌은 조회하지 않는다(Crossref의 국문 제목 수록이 빈약하고 판정 근거가 약함).
(function () {
  "use strict";

  var API = "https://api.crossref.org/works";
  var TIMEOUT_MS = 8000;
  var RETRY_MS = 1200; // 일시 실패 뒤 한 번만 다시 시도하기 전 대기
  var RETRY_STATUS = { 429: 1, 502: 1, 503: 1, 504: 1 };
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

  // 숫자·로마 숫자(20까지)·영어 수사(20까지, 서수 열째까지)는 모두 "구별 낱말"이다.
  // 비교할 때는 숫자로 바꾼다("part two" = "part 2" = "part II").
  var ROMANV = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13,
    xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20 };
  var NUMV = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
    twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
  // 이 낱말 바로 뒤의 한 글자는 구별 라벨(Part A / Part B)
  var LABELS = { part: 1, study: 1, experiment: 1, appendix: 1, phase: 1, type: 1 };
  // 한 글자 구분자를 받는 명사: 이 뒤의 "a"는 관사가 아니라 구분자(Vitamin A, Hepatitis A)
  var DESIG_NOUNS = { vitamin: 1, hepatitis: 1, influenza: 1, type: 1, group: 1, class: 1, grade: 1, stage: 1, phase: 1,
    part: 1, factor: 1, protein: 1, complex: 1, subunit: 1, chain: 1, virus: 1, strain: 1, cyclin: 1, interleukin: 1, interferon: 1 };
  // 그리스 문자(기호는 이름으로 접는다: α ≡ alpha)는 정확히 일치해야 하고 빼거나 끼울 수 없다
  var GREEK = { alpha: 1, beta: 1, gamma: 1, delta: 1, epsilon: 1, zeta: 1, eta: 1, theta: 1, iota: 1, kappa: 1, lambda: 1, mu: 1,
    nu: 1, xi: 1, omicron: 1, pi: 1, rho: 1, sigma: 1, tau: 1, upsilon: 1, phi: 1, chi: 1, psi: 1, omega: 1 };
  var GREEKCH = { "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ϵ": "epsilon", "ζ": "zeta", "η": "eta",
    "θ": "theta", "ϑ": "theta", "ι": "iota", "κ": "kappa", "λ": "lambda", "μ": "mu", "ν": "nu", "ξ": "xi", "ο": "omicron",
    "π": "pi", "ρ": "rho", "σ": "sigma", "ς": "sigma", "τ": "tau", "υ": "upsilon", "φ": "phi", "ϕ": "phi", "χ": "chi",
    "ψ": "psi", "ω": "omega" };
  // 부정·범위 낱말: 정확히 일치해야 하고 빼거나 끼울 수 없다
  var NEG = { non: 1, not: 1, no: 1, without: 1, never: 1, anti: 1, nor: 1, neither: 1, none: 1 };
  function isNumOrRoman(w) { return /^\d+$/.test(w) || own(ROMANV, w); }
  // 번호 꼴 낱말(숫자·로마 숫자·영어 수사)
  function isNumLike(w) { return /^\d+$/.test(w) || own(ROMANV, w) || own(NUMV, w); }

  // 구별 낱말(숫자·한 글자·그리스 문자·부정어)이면 비교용 표기, 아니면 null. 낱말별로 한 번만 계산한다.
  var canonCache = Object.create(null), canonCount = 0;
  function canonNum(w) {
    var c = canonCache[w];
    if (c !== undefined) return c;
    if (/^\d+d?$/.test(w)) c = w.replace(/^0+(?=\d)/, ""); // "2d"/"3d"도 구별 낱말
    else if (own(ROMANV, w)) c = String(ROMANV[w]);
    else if (own(NUMV, w)) c = String(NUMV[w]);
    else if (/^\p{L}$/u.test(w)) c = "#" + w; // 한 글자 구분자(Part A, hepatitis B)
    else if (own(GREEK, w)) c = "g:" + w;
    else if (own(NEG, w)) c = "n:" + w;
    else c = null;
    if (++canonCount > 20000) { canonCache = Object.create(null); canonCount = 0; }
    canonCache[w] = c;
    return c;
  }
  function isNumber(w) { return canonNum(w) !== null; }

  // 문자열의 낱말 보기. joined가 true면 낱말 안의 하이픈을 붙인다("2-D" → "2d").
  // 글자별로 접어 원문 위치를 함께 기록한다(wo: 낱말이 원문에서 시작하는 위치).
  // words: 2글자 이상 낱말(숫자·로마 숫자는 길이와 무관, 라벨 뒤 한 글자 유지), raw: 모든 낱말(위치 포함)
  function view(text, joined) {
    var src = String(text == null ? "" : text);
    var F = [], O = [], i, k, f, q;
    src = src.replace(/\s&\s/g, " and "); // "Sleep & memory" ≡ "Sleep and memory"
    for (i = 0; i < src.length;) {
      var ch = String.fromCodePoint(src.codePointAt(i));
      f = Array.from(fold(ch));
      if (f.length === 1 && own(GREEKCH, f[0])) f = Array.from(GREEKCH[f[0]]);
      for (q = 0; q < f.length; q++) { F.push(f[q]); O.push(i); }
      i += ch.length;
    }
    var AN = /[\p{L}\p{N}]/u, L = /\p{L}/u;
    var K = [], KO = [];
    for (k = 0; k < F.length; k++) {
      var c = F[k];
      var inner = k > 0 && k + 1 < F.length;
      if (inner && /['’ʼ]/.test(c) && AN.test(F[k - 1]) && L.test(F[k + 1])) continue;
      if (joined && inner && /[\-‐‑]/.test(c) && AN.test(F[k - 1]) && AN.test(F[k + 1])) continue;
      K.push(c); KO.push(O[k]);
    }
    var raw = [], str = "", pos = 0, cur = null;
    for (k = 0; k < K.length; k++) {
      if (AN.test(K[k])) {
        if (!cur) cur = { t: "", s: pos, e: 0, o: KO[k] };
        cur.t += K[k];
      } else if (cur) { cur.e = pos; raw.push(cur); cur = null; }
      str += K[k]; pos += K[k].length;
    }
    if (cur) { cur.e = pos; raw.push(cur); }
    var words = [], wo = [], wi = [];
    for (k = 0; k < raw.length; k++) {
      var t = raw[k].t, keep = false;
      if (t.length >= 2 || isNumOrRoman(t)) keep = true;
      else if (L.test(t)) {
        // 한 글자는 구분자로 남긴다. 관사 "a"만 예외(구분자를 받는 명사 바로 뒤의 "a"는 남김)
        keep = t !== "a" || (k > 0 && own(DESIG_NOUNS, raw[k - 1].t) && /^[\s\-‐‑–]*$/.test(str.slice(raw[k - 1].e, raw[k].s)));
      }
      if (keep) { words.push(t); wo.push(raw[k].o); wi.push(k); }
    }
    return { src: src, str: str, raw: raw, words: words, wo: wo, wi: wi, wl: wi };
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
    var t0 = trimRef(s);
    // 첫 글자 낱말이 한글 두 음절 이상이면 국문 문헌이다(뒤에 영문 원문이 섞여 있어도)
    var fl = /^[^\p{L}]*(\p{L}+)/u.exec(t0);
    if (fl && /^[가-힣]{2,}/.test(fl[1])) return true;
    var head = Array.from(t0.replace(/https?:\/\/\S+|www\.\S+/gi, " ")).slice(0, 120).join(""); // 앞 120자만 본다(뒤쪽 학술지명 등 제외). URL 은 세지 않는다.
    var l = (head.match(/\p{L}/gu) || []).length;
    if (!l) return false;
    return (head.match(/\p{Script=Hangul}/gu) || []).length * 2 >= l; // 정확히 절반이면 한글
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

  // Crossref의 여러 날짜 필드(인쇄본·온라인·게시·발행·등록)의 연도들
  var DATE_FIELDS = ["published-print", "published-online", "published", "issued"];
  function datedYears(item) {
    var out = [];
    for (var k = 0; k < DATE_FIELDS.length; k++) {
      var y = yearOf({ issued: item[DATE_FIELDS[k]] });
      if (y && out.indexOf(y) === -1) out.push(y);
    }
    return out;
  }

  function titleOf(item) { return item ? firstString(item.title) : ""; }

  function toCandidate(item) {
    return {
      title: titleOf(item),
      subtitle: item ? firstString(item.subtitle) : "",
      type: item && typeof item.type === "string" ? item.type : "",
      year: item && item.year ? String(item.year) : yearOf(item),
      years: item ? datedYears(item) : [],
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
  function orgMatch(refText, name, pre) {
    var accs = [];
    // 끝의 괄호 약어 "(CDC)"는 떼어 내고, 대문자 약어면 약어 후보로 쓴다
    var nm = String(name).replace(/\s*\(([^()]*)\)\s*$/, function (all, inner) {
      if (/^[A-Z]{2,8}$/.test(inner.trim())) accs.push(inner.trim());
      return "";
    });
    var sig = orgSig(nm);
    if (!sig.length) return false;
    var rt = letterToks(refText, true).filter(function (w) { return !ORG_STOP[w]; });
    if (hasRun(rt, sig)) return true;
    if (sig.length >= 2) accs.push(sig.map(function (w) { return Array.from(w)[0]; }).join("").toUpperCase());
    // 약어는 대문자로 쓰였고 저자 자리(제목 앞)에 있어야 한다. 두 글자 약어는 의미 낱말이 정확히 둘일 때만(UN, EU).
    var region = String(pre == null ? "" : pre).normalize("NFKC");
    for (var i = 0; i < accs.length; i++) {
      var a = accs[i];
      if (a.length < 2 || (a.length === 2 && sig.length !== 2) || !/^\p{L}+$/u.test(a)) continue;
      if (new RegExp("(?<![\\p{L}\\p{N}])" + a + "(?![\\p{L}\\p{N}])", "u").test(region)) return true;
    }
    return false;
  }

  // ----- 제목 -----

  // 오타 허용(첫 글자 같음, 글자만): (a) 한 글자 삽입·삭제(제목 낱말 6글자 이상), (b) s↔z 치환(organisation/organization),
  // (c) o↔ou 삽입(tumour/tumor: 짧은 쪽 5글자 이상). 그 밖의 한 글자 치환(nitrate/nitrite)은 다른 낱말이다.
  function typoEq(a, b) {
    var la = a.length, lb = b.length, i = 0;
    if (Math.abs(la - lb) > 1 || a.charAt(0) !== b.charAt(0) || !/^\p{L}+$/u.test(a) || !/^\p{L}+$/u.test(b)) return false;
    while (i < la && i < lb && a.charAt(i) === b.charAt(i)) i++;
    if (la === lb) {
      // 인접한 두 글자 맞바꿈(8글자 이상): recieve 류. 그 밖의 한 글자 치환은 다른 낱말이다.
      if (la >= 8 && a.charAt(i) === b.charAt(i + 1) && a.charAt(i + 1) === b.charAt(i) && a.slice(i + 2) === b.slice(i + 2)) return true;
      if (la < 6 || a.slice(i + 1) !== b.slice(i + 1)) return false;
      return (a.charAt(i) === "s" && b.charAt(i) === "z") || (a.charAt(i) === "z" && b.charAt(i) === "s");
    }
    var lg = la > lb ? a : b, sh = la > lb ? b : a;
    if (sh.slice(i) !== lg.slice(i + 1)) return false;
    // 한 글자 삽입·삭제는 철자 변이 o↔ou(tumour/tumor)만. Morality/Mortality, thorough/through 는 다른 낱말이다.
    return lg.charAt(i) === "u" && i > 0 && lg.charAt(i - 1) === "o" && sh.length >= 5;
  }

  // 제목 낱말 a가 서지 낱말 b와 같은가. ca·cb는 canonNum 값. 구별 낱말은 정확히, 그 밖의 글자 낱말은 typoEq까지.
  function wordEq(a, b, ca, cb) {
    if (a === b) return true;
    if (ca !== null || cb !== null) return ca === cb;
    return typoEq(a, b);
  }

  function exactEq(a, b, ca, cb) {
    return ca !== null || cb !== null ? ca === cb : a === b;
  }

  // 정렬 표(접미·접두 LCS). E[i][j]는 제목 i번째와 문구 j번째가 같은 낱말인지.
  function lcsTables(E, n, m) {
    var S = [], P = [], i, j;
    for (i = 0; i <= n + 1; i++) { S.push(new Array(m + 2).fill(0)); P.push(new Array(m + 2).fill(0)); }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) S[i][j] = E[i][j] ? S[i + 1][j + 1] + 1 : Math.max(S[i + 1][j], S[i][j + 1]);
    }
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) P[i][j] = E[i - 1][j - 1] ? P[i - 1][j - 1] + 1 : Math.max(P[i - 1][j], P[i][j - 1]);
    }
    return { S: S, P: P };
  }

  // 가장 이른 위치끼리 맞춘 정렬 [[제목 인덱스, 문구 인덱스], …]
  function alignForward(E, n, m, S, i0, j0) {
    var out = [], i = i0 || 0, j = j0 || 0;
    while (i < n && j < m) {
      if (E[i][j] && S[i][j] === S[i + 1][j + 1] + 1) { out.push([i, j]); i++; j++; }
      else if (S[i + 1][j] === S[i][j]) i++;
      else j++;
    }
    return out;
  }

  // 가장 늦은 위치끼리 맞춘 정렬
  function alignBackward(E, n, m, P) {
    var out = [], i = n, j = m;
    while (i > 0 && j > 0) {
      if (E[i - 1][j - 1] && P[i][j] === P[i - 1][j - 1] + 1) { out.push([i - 1, j - 1]); i--; j--; }
      else if (P[i - 1][j] === P[i][j]) i--;
      else j--;
    }
    return out.reverse();
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

  // 정렬된 구간 바로 뒤의 낱말이 공백·':'·'-' 뿐인 틈으로 이어지면 제목이 거기서 끝나지 않는다(하이픈 복구·철자 변이·숫자 붙임을 거친 구간도)
  function spanContinues(rv, r) {
    var li = rv.wl ? rv.wl[r.lastR] : rv.wi[r.lastR];
    var last = rv.raw[li], next = rv.raw[li + 1];
    if (!last || !next) return false;
    var gap = rv.str.slice(last.e, next.s).replace(/\s+/g, "");
    return gap === "" || /^[:\-–—]+$/.test(gap);
  }

  // 정정·철회·답변·논평·심사·머리말류 표제(앞 세 낱말 안): 이 낱말들은 생략·하이픈 복구로 넘길 수 없고 정렬되어야 한다.
  // 표제 첫 낱말이면 서지 문구의 제목 구간 맨 앞에 있어야 하므로(첫 낱말은 항상 정렬 필수) 위치까지 맞는다.
  var NOTICE_WORDS = ["correction", "corrigendum", "erratum", "errata", "retraction", "retracted", "withdrawal",
    "addendum", "reply", "response", "comment", "commentary", "editorial", "discussion", "letter", "obituary",
    "preface", "foreword", "index", "abstracts", "review"];
  var NOTICE_PHRASES = [["book", "review"], ["decision", "letter"], ["author", "response"], ["peer", "review"],
    ["review", "for"], ["expression", "of", "concern"], ["letter", "to", "the", "editor"], ["in", "reply"],
    ["authors", "reply"], ["author", "reply"], ["in", "memoriam"], ["table", "of", "contents"],
    ["introduction", "to", "the", "special", "issue"]];

  // 표지어가 앞 세 낱말 또는 뒤 세 낱말 안에 있으면 그 자리는 정렬 필수(뒤쪽: "T – CORRIGENDUM", "T: Erratum").
  function noticeMust(w, rawTitle) {
    var must = {}, k, p, s, t, n = w.length;
    function edge(i) { return i < 3 || i >= n - 3; }
    for (k = 0; k < n; k++) if (edge(k) && NOTICE_WORDS.indexOf(w[k]) !== -1) must[k] = true;
    for (p = 0; p < NOTICE_PHRASES.length; p++) {
      var ph = NOTICE_PHRASES[p];
      for (s = 0; s + ph.length <= n; s++) {
        if (!edge(s) && !edge(s + ph.length - 1)) continue;
        var ok = true;
        for (t = 0; ok && t < ph.length; t++) if (w[s + t] !== ph[t]) ok = false;
        if (ok) for (t = 0; t < ph.length; t++) must[s + t] = true;
      }
    }
    if (w[0] === "re" && /^\s*re\s*:/i.test(String(rawTitle))) must[0] = true;
    return must;
  }

  // 낱말 어디에든 표지어·표지 구절이 있는가(부제·뗀 부분 검사용)
  function hasNotice(w) {
    var k, p, s, t;
    for (k = 0; k < w.length; k++) if (NOTICE_WORDS.indexOf(w[k]) !== -1) return true;
    for (p = 0; p < NOTICE_PHRASES.length; p++) {
      var ph = NOTICE_PHRASES[p];
      for (s = 0; s + ph.length <= w.length; s++) {
        var ok = true;
        for (t = 0; ok && t < ph.length; t++) if (w[s + t] !== ph[t]) ok = false;
        if (ok) return true;
      }
    }
    return false;
  }

  // 정렬 al이 규칙에 맞는지: 통과하면 { n, full, firstR, lastR }, 아니면 null
  //  - 제목 낱말은 모두 정렬. 예외는 가운데 낱말 하나뿐: 서지 문구에 그 낱말이 없거나(전체 한 번만, 구별 낱말 제외),
  //    줄 끝 하이픈으로 갈라져 이웃 사이 낱말들을 이어 붙이면 그 낱말이 되는 경우
  //  - 바뀐 낱말(다른 낱말이 그 자리에 있음)은 불일치
  //  - 정렬된 문구 구간 안의 정렬 안 된 낱말은 둘 이하, 구간 안의 구별 낱말은 모두 정렬
  function judge(tv, rv, al) {
    var w = tv.words, r = rv.words, must = tv.must, n = w.length, tAl = new Array(n).fill(-1), rAl = {}, k;
    if (!al.length) return null;
    for (k = 0; k < al.length; k++) { tAl[al[k][0]] = al[k][1]; rAl[al[k][1]] = true; }
    if (tAl[0] < 0 || tAl[n - 1] < 0) return null;
    for (k in must) if (tAl[k] < 0) return null;
    var hyph = 0, extra = 0, i = 0;
    while (i < n) {
      if (tAl[i] >= 0) { i++; continue; }
      var a = i;
      while (i < n && tAl[i] < 0) i++;
      if (i - a > 1) return null; // 연속 두 낱말 이상 빠짐/바뀜
      var t = w[a];
      if (tv.cw[a] !== null) return null;
      var gap = r.slice(tAl[a - 1] + 1, tAl[a + 1]);
      if (!gap.length) return null; // 제목 낱말이 서지 문구에 없음: 생략은 받지 않는다(틀린 연결이 못 찾는 것보다 나쁘다)
      else if (gap.join("") === t) { hyph++; extra += gap.length; }
      else return null; // 다른 낱말로 바뀜
    }
    var firstR = tAl[0], lastR = tAl[n - 1];
    if (lastR - firstR + 1 - al.length > extra) return null; // 흩어짐: 구간 안의 끼어든 낱말은 하이픈 복구로 이은 것만
    for (k = firstR; k <= lastR; k++) if (rv.cr[k] !== null && !rAl[k]) return null;
    var full = !hyph;
    for (k = 0; full && k < al.length; k++) if (!exactEq(w[al[k][0]], r[al[k][1]], tv.cw[al[k][0]], rv.cr[al[k][1]])) full = false;
    return { n: n, full: full, firstR: firstR, lastR: lastR };
  }

  function prepTitle(tv, rawTitle) {
    if (!tv.cw) { tv.cw = tv.words.map(canonNum); tv.must = noticeMust(tv.words, rawTitle); }
    return tv;
  }

  function prepRef(rv) {
    if (!rv.cr) rv.cr = rv.words.map(canonNum);
    return rv;
  }

  // 서지 문구의 이웃한 낱말 둘·셋을 이어 붙이면 제목의 한 낱말이 되는 곳(CO 2 → CO2, net- works → networks)을 합친 보기.
  // 이웃해야 하고(사이에 버려진 낱말 없음) 이어 붙인 결과가 제목 낱말과 정확히 같아야 한다. 없으면 null.
  function mergeView(rv, tv) {
    var r = rv.words, wi = rv.wi, tset = Object.create(null), any = false, i = 0, len, q;
    for (q = 0; q < tv.words.length; q++) tset[tv.words[q]] = 1;
    var words = [], wo = [], wix = [], wlx = [];
    while (i < r.length) {
      var done = false;
      for (len = 3; len >= 2 && !done; len--) {
        if (i + len > r.length) continue;
        var ok = true, c = r[i];
        for (q = 1; q < len; q++) {
          if (wi[i + q] !== wi[i + q - 1] + 1) { ok = false; break; }
          c += r[i + q];
        }
        if (ok && tset[c] === 1) { words.push(c); wo.push(rv.wo[i]); wix.push(wi[i]); wlx.push(rv.wl[i + len - 1]); i += len; done = true; any = true; }
      }
      if (!done) { words.push(r[i]); wo.push(rv.wo[i]); wix.push(wi[i]); wlx.push(rv.wl[i]); i++; }
    }
    return any ? { src: rv.src, str: rv.str, raw: rv.raw, words: words, wo: wo, wi: wix, wl: wlx } : null;
  }

  // 서지 문구 보기 하나와 제목 보기 하나의 판정: 통과하면 { n, full, firstR, lastR, rv }, 아니면 null
  function evalCore(rv, tv) {
    var w = tv.words, r = rv.words, n = w.length, m = r.length, i, j;
    if (n < 3 || !m) return null;
    prepRef(rv);
    var f = false, l = false;
    for (j = 0; j < m && !(f && l); j++) {
      if (!f && wordEq(w[0], r[j], tv.cw[0], rv.cr[j])) f = true;
      if (!l && wordEq(w[n - 1], r[j], tv.cw[n - 1], rv.cr[j])) l = true;
    }
    if (!f || !l) return null; // 첫 낱말과 끝 낱말은 반드시 정렬되어야 한다
    if (titleContinues(rv, tv)) return null;
    var E = [];
    for (i = 0; i < n; i++) {
      var row = [], wi = w[i], ci = tv.cw[i];
      for (j = 0; j < m; j++) row.push(wordEq(wi, r[j], ci, rv.cr[j]));
      E.push(row);
    }
    var T = lcsTables(E, n, m);
    var als = [alignForward(E, n, m, T.S), alignBackward(E, n, m, T.P)];
    // 제목 첫 낱말이 서지 문구에 여러 번 나오면(저자 위치 등) 각 위치에서 시작하는 촘촘한 정렬도 시험한다(최대 4곳)
    for (j = 0, i = 0; j < m && i < 4; j++) {
      if (!E[0][j]) continue;
      i++;
      var st = alignForward(E, n, m, T.S, 1, j + 1);
      st.unshift([0, j]);
      als.push(st);
    }
    for (var k = 0; k < als.length; k++) {
      var res = judge(tv, rv, als[k]);
      if (res && !spanContinues(rv, res)) { res.rv = rv; return res; }
    }
    return null;
  }

  function evalTitle(rv, tv) {
    prepRef(rv);
    var res = evalCore(rv, tv);
    if (res) return res;
    var mv = mergeView(rv, tv);
    return mv ? evalCore(mv, tv) : null;
  }

  var BAD_TYPES = { "peer-review": 1, "journal-issue": 1, "journal": 1, "book-series": 1, "component": 1 };

  // 부제에 이런 낱말이 있으면 앞부분만으로는 비교하지 않는다(시리즈의 다른 편일 수 있음)
  var SUBMARK = { part: 1, pt: 1, volume: 1, vol: 1, edition: 1, ed: 1 };

  function subtitleBlocks(sub) {
    var raw = view(sub, false).raw;
    for (var k = 0; k < raw.length; k++) {
      var t = raw[k].t;
      if (/^\d/.test(t) || own(ROMANV, t) || own(NUMV, t) || own(SUBMARK, t)) return true;
      if (t.length === 1 && k > 0 && own(LABELS, raw[k - 1].t)) return true; // Part A / Part B
    }
    return false;
  }

  // 비교할 제목 문자열들: 제목, 제목+부제(별도 필드), 부제를 뺀 앞부분(낱말 5개 이상, 부제에 번호·편 표지가 없을 때만).
  // 부제 필드에 공지 표지어가 있으면 제목만으로는 비교하지 않고, 뗀 부분에 표지어가 있으면 앞부분 비교를 하지 않는다.
  function titleVariants(title, subtitle) {
    var subNotice = !!subtitle && hasNotice(normalizeTitle(subtitle));
    var out = [];
    if (!subNotice) out.push({ t: title, fb: false });
    if (subtitle) out.push({ t: title + ": " + subtitle, fb: false });
    var m = /^(.*?)(?::\s| [–—-] )/.exec(title);
    if (m && m[1] && !subNotice && normalizeTitle(m[1]).length >= 5) {
      var dropped = title.slice(m[0].length);
      if (!subtitleBlocks(dropped) && !hasNotice(normalizeTitle(dropped))) out.push({ t: m[1], fb: true });
    }
    return out;
  }

  // 제목 뒤 숫자가 쪽·권 번호("prediction. 577:706–710", "prediction, 123–130", "prediction.1 Nature", "10.1038/…")이지 다음 편이 아닌가.
  // 틈에 구두점이 있고 숫자 바로 뒤가 ':'·'–'+숫자 또는 '.'+숫자이거나, 마침표 바로 뒤에 붙은 위첨자 번호일 때만.
  function volumeOrPageAfter(rv, r, nx) {
    var li = rv.wl ? rv.wl[r.lastR] : rv.wi[r.lastR];
    var last = rv.raw[li], nr = rv.raw[rv.wi[r.lastR + 1]];
    if (!last || !nr) return false;
    var gap = rv.str.slice(last.e, nr.s), after = rv.str.slice(nr.e, nr.e + 2);
    if (/^[.]$/.test(gap) && /^\d+$/.test(nx)) return true; // "prediction.1 Nature"
    if (/^\s*$/.test(gap) || !/[.,;]/.test(gap)) return false;
    return /^[:–—\-.]\d/.test(after);
  }

  // 제목 구간 바로 뒤: "Part 2"·"Vol. 3"처럼 후보 제목에 없는 편 표지가 이어지면 다른 편이다.
  // 부제를 뗀 비교(fb)에서는 뒤따르는 네 낱말 안의 편 표지, 바로 다음의 번호(연도 제외)도 본다.
  function tailOk(rv, r, fb) {
    var words = rv.words, nx = words[r.lastR + 1], i, t;
    if (nx === "part" || nx === "pt" || nx === "volume" || nx === "vol") {
      var n2 = words[r.lastR + 2];
      if (n2 !== undefined && isNumber(n2)) return false;
    }
    // 제목 바로 뒤의 연도 아닌 번호("X. II. Experiments", "X (2)")는 다른 편이다. 그 뒤가 연도면 학술지 권호로 본다.
    // 숫자와 두 글자 이상 로마 숫자에만 적용한다("First Monday"·"One Earth"·"X-Ray" 같은 학술지명은 제외).
    // 영어 수사("Two", "One")는 학술지명 첫 낱말일 수 있으므로("One Earth", "Second Language Research") 뒤에 낱말이 이어질 때는 제외한다.
    var nxr = nx === undefined ? null : rv.raw[rv.wi[r.lastR + 1]];
    var spelled = nx !== undefined && own(NUMV, nx) && !(nxr && /^\s+\p{L}/u.test(rv.str.slice(nxr.e)));
    if (nx !== undefined && (/^\d+$/.test(nx) || (own(ROMANV, nx) && nx.length >= 2) || spelled) && !/^(?:19|20)\d\d$/.test(nx)) {
      var n3 = words[r.lastR + 2];
      if (!(n3 !== undefined && /^(?:19|20)\d\d$/.test(n3)) && !volumeOrPageAfter(rv, r, nx)) return false;
    }
    if (!fb) return true;
    for (i = 1; i <= 4; i++) {
      t = words[r.lastR + i];
      if (t === undefined) break;
      if (own(SUBMARK, t) || t === "chapter") return false;
    }
    return true;
  }

  // 제목 구간 바로 앞의 부정어("Anti ", "Non ", "No ")는 후보 제목에 없는 낱말이 제목에 붙은 것이다.
  var HEAD_NOTICE = { correction: 1, corrigendum: 1, erratum: 1, errata: 1, retraction: 1, reply: 1, comment: 1, comments: 1, commentary: 1, addendum: 1 };
  function headOk(rv, r) {
    var prev = rv.words[r.firstR - 1];
    if (prev !== undefined && own(NEG, prev)) return false;
    for (var q = 1; q <= 4; q++) {
      var w = rv.words[r.firstR - q];
      if (w === undefined) break;
      if (own(HEAD_NOTICE, w)) return false; // "Correction to: …", "Reply to comments on …"
    }
    // 제목 구간 바로 앞이 공백만으로 이어진 3글자 이상 낱말이면 그 낱말이 제목에 붙어 있던 것이다("Revisiting the …", "Long-term …")
    var fi = rv.wi[r.firstR], pr = rv.raw[fi - 1], cur = rv.raw[fi];
    if (pr && cur && /^\p{L}{3,}$/u.test(pr.t) && /^\s*$/.test(rv.str.slice(pr.e, cur.s))) return false;
    return true;
  }

  function authorOk(refText, authors, r, rv) {
    var ak = authorKey(authors);
    if (ak) {
      if (!ak.org) {
        // 제목 구간 앞에서 먼저 찾는다. 제목 뒤에서만 찾으면 제목 앞에 저자 모양 글이 없을 때만 받는다(제목 안 낱말은 저자가 아니다).
        var pre = refText.slice(0, rv.wo[r.firstR]);
        if (familyMatch(pre, ak.family)) return true;
        if (/\p{L}/u.test(pre)) return false;
        var post = refText.slice(rv.wo[r.lastR] + 1).replace(/^\p{L}*/u, "");
        return familyMatch(post, ak.family);
      }
      return orgMatch(refText, ak.org, refText.slice(0, rv.wo[r.firstR]));
    }
    return r.n >= 8 && r.full; // 저자 정보가 없으면 긴 제목이 전부 일치할 때만
  }

  var refMemo = { text: null, views: null };

  function refViews(refText) {
    if (refMemo.text !== refText) {
      var a = view(refText, false), b = view(refText, true);
      refMemo = { text: refText, views: b.str === a.str ? [a] : [a, b] };
    }
    return refMemo.views;
  }

  function candidateYears(candidate) {
    var out = [], y = candidate.year == null ? "" : String(candidate.year), k;
    if (y) out.push(y);
    if (Array.isArray(candidate.years)) {
      for (k = 0; k < candidate.years.length; k++) {
        var z = candidate.years[k] == null ? "" : String(candidate.years[k]);
        if (/^\d{4}$/.test(z) && out.indexOf(z) === -1) out.push(z);
      }
    }
    return out;
  }

  function isMatch(refText, candidate) {
    if (!candidate || typeof refText !== "string") return false;
    var title = candidate.title;
    if (typeof title !== "string" || !title) return false;
    if (typeof candidate.type === "string" && own(BAD_TYPES, candidate.type)) return false;
    if (mostlyHangul(title) || mostlyHangul(refText)) return false;
    var ys = candidateYears(candidate), refYears = yearsIn(refText), yok = false, q;
    for (q = 0; q < ys.length; q++) if (refYears.indexOf(ys[q]) !== -1) yok = true;
    if (!yok) return false;

    var sub = typeof candidate.subtitle === "string" ? candidate.subtitle : "";
    var vars = titleVariants(title, sub);
    var rvs = refViews(refText);
    for (var a = 0; a < vars.length; a++) {
      var tv0 = view(vars[a].t, false), tv1 = view(vars[a].t, true);
      var tvs = tv1.str === tv0.str ? [tv0] : [tv0, tv1];
      for (var jt = 0; jt < tvs.length; jt++) {
        prepTitle(tvs[jt], vars[a].t);
        for (var jr = 0; jr < rvs.length; jr++) {
          var r = evalTitle(rvs[jr], tvs[jt]);
          if (r && headOk(r.rv, r) && tailOk(r.rv, r, vars[a].fb) && authorOk(refText, candidate.author, r, r.rv)) return true;
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

  var warned = false; // 문서당 한 번만 내부 예외를 진단 출력

  function expectedErr(msg, retry) { var e = new Error(msg); e.biblioExpected = true; e.reason = msg; e.retry = !!retry; return e; }

  // 네트워크·HTTP·응답 모양 문제가 아닌 내부 예외는 진단용으로 한 번만 console.warn(상태는 그대로 "error")
  function noteError(err) {
    var expected = err && (err.biblioExpected || err.name === "AbortError" || err instanceof TypeError);
    if (expected || warned) return;
    warned = true;
    try { console.warn("[biblio]", err); } catch (e) { /* 콘솔 없음 */ }
  }

  // 요청 한 번. 실패하면 reason·retry가 붙은 오류로 거부한다. 제한 시간·진행 목록 정리는 시도마다 따로.
  function attempt(url) {
    var ctrl = new AbortController();
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, TIMEOUT_MS);
    inflight.push(ctrl);
    function done() {
      clearTimeout(timer);
      var i = inflight.indexOf(ctrl);
      if (i !== -1) inflight.splice(i, 1);
    }
    var f;
    try { f = fetch(url, { signal: ctrl.signal, referrerPolicy: "no-referrer", credentials: "omit" }); } catch (e) { f = Promise.reject(e); }
    return f.then(function (res) {
      if (!res.ok) throw expectedErr("http " + res.status, own(RETRY_STATUS, res.status));
      return Promise.resolve().then(function () { return res.json(); }).catch(function () {
        throw timedOut ? expectedErr("timeout", true) : expectedErr("json");
      });
    }, function (err) {
      if (timedOut) throw expectedErr("timeout", true);
      if (err instanceof TypeError) throw expectedErr("network", true);
      throw expectedErr(err && err.name === "AbortError" ? "aborted" : "error");
    }).then(function (json) { done(); return json; }, function (e) { done(); throw e; });
  }

  var retryDelay = null; // 시험용: (ms) => Promise
  var waiters = [];

  function wait(ms) {
    if (retryDelay) return Promise.resolve(retryDelay(ms));
    return new Promise(function (resolve) {
      var w = { resolve: resolve };
      w.t = setTimeout(function () {
        var i = waiters.indexOf(w);
        if (i !== -1) waiters.splice(i, 1);
        resolve();
      }, ms);
      waiters.push(w);
    });
  }

  function setRetryDelay(fn) { retryDelay = typeof fn === "function" ? fn : null; }

  function lookup(refText) {
    var q = trimRef(refText);
    if (!q) return Promise.resolve({ status: "nomatch" });
    if (mostlyHangul(q)) return Promise.resolve({ status: "nomatch" }); // 국문 문헌은 조회하지 않음
    if (cache[q]) return cache[q];
    var url;
    try {
      url = apiBase() + "?rows=3&select=" + encodeURIComponent("title,subtitle,author,issued,published-print,published-online,published,container-title,DOI,abstract,type") +
        "&query.bibliographic=" + encodeURIComponent(q);
    } catch (e) { return Promise.resolve({ status: "error", reason: "query" }); } // 짝 없는 서로게이트
    var gen = generation;

    var p = attempt(url)
      .catch(function (err) {
        // 네트워크 TypeError·시간 초과·429/502/503/504만 한 번 더. 문서가 바뀌었으면 그만둔다.
        if (!err || !err.retry || gen !== generation) throw err;
        return wait(RETRY_MS).then(function () {
          if (gen !== generation) throw err;
          return attempt(url);
        });
      })
      .then(function (json) {
        var items = json && json.message && json.message.items;
        if (!Array.isArray(items)) throw expectedErr("shape");
        try {
          var hit = pickMatch(q, items);
          return hit ? { status: "ok", data: toData(hit) } : { status: "nomatch" };
        } catch (e) { noteError(e); throw expectedErr("internal"); } // 일치 판정 중 내부 예외(TypeError 포함)
      })
      .catch(function (err) { noteError(err); return { status: "error", reason: (err && err.reason) || "internal" }; })
      .then(function (r) {
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
    warned = false;
    cache = Object.create(null);
    inflight.splice(0).forEach(function (c) { try { c.abort(); } catch (e) { /* 이미 끝남 */ } });
    waiters.splice(0).forEach(function (w) { clearTimeout(w.t); w.resolve(); }); // 대기 중인 재시도는 깨워서 문서 변경으로 끝낸다
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
    viewModel: viewModel, mostlyHangul: mostlyHangul, setRetryDelay: setRetryDelay
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.ReaderBiblio = api;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
    else wire();
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
