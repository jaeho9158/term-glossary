// 본문 말투 변환기: 합쇼체(~ㅂ니다/~습니다)·해요체(~요) 문장 종결을 해라체(~다)로 바꾼다.
//
// 설계
//  - 입력은 텍스트 또는 HTML 조각. 태그는 건드리지 않고 텍스트 노드의 어미만 고친다.
//  - 제외(변환 금지): blockquote, div.example, p.te-cite, ol.te-refs, code/pre/svg/script/style, h1-h6 제목,
//    “…” "…" ‘…’ '…' 「…」 『…』 안의 글.
//  - 등급 A: 결정적 규칙 또는 어휘목록으로 동사/형용사가 확정된 것 -> 변환한다.
//    등급 C: 애매함(동사/형용사 불명, 의문·명령·청유, 경어 -시-, 연결어미 -ㅂ니다만 등) -> 변환하지 않고 보고만 한다.
//  - 동사/형용사 구분은 말뭉치(이미 해라체인 문장의 -ㄴ다/-는다 대 기본형 -다, 그리고 자음 어간 + 는 관형형)에서
//    만든 어휘목록(addToLexicon)과 소수의 시드 목록으로 한다. 외부 사전은 쓰지 않는다.
//  - 사용: node scripts/style/to-plain.js --dry [--root <repo>] [--out <md>] [--sample 300] [--c 100] [--seed 1]
//    (현재 데이터를 쓰는 모드는 없다. 변환 적용은 후속 단계에서 소스 데이터에 대해 수행한다.)
"use strict";

// ---------- 한글 음절 유틸 ----------
const S0 = 0xac00;
const jongOf = (ch) => (ch.charCodeAt(0) - S0) % 28;
const withJong = (ch, j) => {
  const c = ch.charCodeAt(0) - S0;
  return String.fromCharCode(S0 + c - (c % 28) + j);
};
const JB = 17, JN = 4, JL = 8, JSS = 20; // ㅂ ㄴ ㄹ ㅆ

// ---------- 시드 어휘 (말뭉치 증거가 없을 때 보강) ----------
const SEED_A_SET = new Set(
  ("크 작 높 낮 길 짧 넓 좁 깊 얕 빠르 느리 쉽 어렵 가깝 멀 많 적 좋 나쁘 같 다르 옳 비싸 싸 새롭 늙 젊 무겁 가볍 두껍 얇 " +
    "강하 약하 중요하 필요하 가능하 불가능하 충분하 다양하 복잡하 간단하 명확하 정확하 유용하 적합하 적절하 용이하 " +
    "편리하 유사하 동일하 상이하 빈번하 풍부하 엄격하 특수하 비슷하 불리하 유리하 취약하 어색하 모호하 뚜렷하 분명하 흔하 드물").split(/\s+/)
);
const SEED_V_SET = new Set(
  ("가 오 보 주 받 먹 쓰 읽 하 되 나타나 나타내 만들 만드 이루 이르 쓰이 보이 나누 돕 묻 듣 얻 잃 찾 놓 넣 두 세우 말하 뜻하 " +
    "쓰이 보이 놓이 쌓이 모이 높이 줄이 먹이 붙이 섞이 묶이 깎이 덮이 끼이 꽂이 나 두 의미하 가리키 포함하 구성하 적용하 비교하 평가하 사용하 분석하 연구하 설명하 측정하 검증하 제공하").split(/\s+/)
);
const ADJ_SUFFIX = ["스럽", "롭", "답", "스러"]; // 자랑스럽, 새롭, 아름답
const VERB_SUFFIX = ["시키", "당하"]; // 이 말로 끝나는 어간은 동사

// ---------- 어휘 ----------
function newLexicon() {
  return { V: new Map(), A: new Map(), N: new Map() };
}
function bump(m, k) {
  m.set(k, (m.get(k) || 0) + 1);
}
// text: 따옴표가 가려진 일반 텍스트. 이미 해라체인 문장과 자음 어간 관형형에서 증거를 모은다.
function addToLexicon(lex, text) {
  const reFinal = /([가-힣]+)다(?=[.!?]|[ \t]*$)/gm;
  let m;
  while ((m = reFinal.exec(text))) {
    const body = m[1];
    if (body.endsWith("는") && body.length >= 2) {
      bump(lex.V, body.slice(0, -1));
      continue;
    }
    const last = body[body.length - 1];
    if (jongOf(last) === JN) {
      bump(lex.V, body.slice(0, -1) + withJong(last, 0));
      continue;
    }
    if (jongOf(last) === JSS) continue; // 었/았/했/겠
    if (/[이있없않]$/.test(body)) continue; // 이다, 있다, 없다, 않다
    if (body === "하") continue;
    bump(lex.A, body);
  }
  const reN = /([가-힣]+)(?:를|의)(?=[\s,.)])/g;
  while ((m = reN.exec(text))) bump(lex.N, m[1]);
  const reYeo = /([가-힣]*[가-힣])여(?=[\s,.)])/g;
  while ((m = reYeo.exec(text))) if (m[1] !== "하") bump(lex.V, m[1] + "이");
  const reAdn = /([가-힣]*[가-힣])는(?=[\s,.)])/g;
  while ((m = reAdn.exec(text))) {
    const st = m[1];
    const last = st[st.length - 1];
    if (jongOf(last) === 0 || jongOf(last) === JL) continue;
    if (/[있없]$/.test(st)) continue;
    bump(lex.V, st);
  }
}

function classifyExact(lex, stem) {
  if (!stem) return null;
  if (stem === "되" || VERB_SUFFIX.some((s) => stem.endsWith(s))) return "V";
  if (ADJ_SUFFIX.some((s) => stem.endsWith(s))) return "A";
  const v = lex.V.get(stem) || 0;
  const a = lex.A.get(stem) || 0;
  if (v === 0 && a === 0) return SEED_A_SET.has(stem) ? "A" : SEED_V_SET.has(stem) ? "V" : null;
  if (a === 0) return "V";
  if (v === 0) return "A";
  if (v >= 10 * a && v >= 3) return "V";
  if (a >= 10 * v && a >= 3) return "A";
  return null;
}
// 어간 판정: 정확히 일치 -> 길이 3 이상이면 뒤쪽 접미(2자 이상)로 후퇴
function classify(lex, stem) {
  const exact = classifyExact(lex, stem);
  if (exact) return exact;
  if (stem.length >= 3) {
    for (let k = 1; k <= stem.length - 2; k++) {
      const c = classifyExact(lex, stem.slice(k));
      if (c) return c;
    }
  }
  return null;
}

// ---------- 문장 종결 판정 ----------
const END_OK = new Set([".", "!", "?", "…", ")", "]", "(", "”", '"', "’", "'", "\n", "\u0001", undefined, "」", "』"]);
const rep = (from, to, rule) => ({ tier: "A", rule, from, to });
const C = (rule) => ({ tier: "C", rule });
const isBnida = (W) => W.length >= 3 && W.endsWith("니다") && !W.endsWith("습니다") && jongOf(W[W.length - 3]) === JB;

// W: 한글 어절, next: 뒤 문자, ctx.prev: 직전 어절
function decide(lex, W, next, ctx) {
  const endOk = END_OK.has(next);
  if (/(습니까|십니까)$/.test(W) || (W.endsWith("니까") && W.length >= 3 && jongOf(W[W.length - 3]) === JB)) return C("question");
  if (/(십시오|시오|합시다|읍시다|ㅂ시다|세요|셔요|으세요|주세요)$/.test(W) || (W.endsWith("시다") && W.length >= 3 && jongOf(W[W.length - 3]) === JB)) return C("imperative-or-suggestion");
  if (/십니다$/.test(W)) return C("honorific");
  if (/(셨습니다|셨어요|시어요)$/.test(W)) return C("honorific");
  if (/(드립니다|드려요)$/.test(W)) return C("humble");
  if (/(바랍니다|바라요)$/.test(W)) return C("request-baramnida");
  if (/(감사합니다|죄송합니다)$/.test(W)) return C("greeting");
  if (/(습니다만|니다만)$/.test(W)) return C("connective-man");
  if (W.endsWith("습니다") || isBnida(W)) {
    if (!endOk) return C(next === "," ? "internal-comma" : "internal-nonfinal");
    return decideHapsyo(lex, W, ctx);
  }
  if ((W.endsWith("요") || W.endsWith("죠")) && endOk) return decideHaeyo(lex, W, ctx);
  return null;
}

// 동사/형용사 동형어: 절 안에서 가장 가까운 주격 조사(이/가/은/는/도)는 형용사, 목적격(을/를)은 동사. 둘 다 없으면 불명.
const HOMO = new Set(["적", "맞", "낫", "굳", "늘", "밝", "붇"]);
function homoKind(stem, ctx) {
  if (!HOMO.has(stem)) return undefined;
  const ws = (ctx && ctx.clause) || [];
  for (let i = ws.length - 1; i >= 0; i--) {
    const w = ws[i];
    if (/[가-힣][을를]$/.test(w)) return "V";
    if (/[가-힣](이|가|은|는|도)$/.test(w)) return "A";
  }
  return null;
}
function decideAnh(lex, ctx, from, toV, toA) {
  const m = (ctx.prev || "").match(/^(.*)지(는|도|를)?$/);
  if (!m || !m[1]) return C("anh-no-ji");
  const stem = m[1];
  const hk = homoKind(stem, ctx);
  const c = hk !== undefined ? hk : /[있없]$/.test(stem) ? "A" : classify(lex, stem);
  if (c === "V") return rep(from, toV, "anh-verb");
  if (c === "A") return rep(from, toA, "anh-adj");
  return C("anh-ambiguous");
}

function decideHapsyo(lex, W, ctx) {
  if (W.endsWith("아닙니다")) return rep("아닙니다", "아니다", "anida");
  if (W.endsWith("입니다")) {
    // 명사+입니다(이다) 대 동사 어간 X이(쓰이/보이/놓이 …)+ㅂ니다
    const X = W.slice(0, -3);
    if (X && classifyExact(lex, X + "이") === "V") {
      if ((lex.N.get(X) || 0) > 0) return C("ida-vs-verb-i-ambiguous");
      return rep("입니다", "인다", "verb-i-bnida");
    }
    return rep("입니다", "이다", "ida");
  }
  if (/답니다$/.test(W) || /랍니다$/.test(W)) return C("hearsay-dapnida");
  if (W.endsWith("맙니다")) return C("mal-da");
  if (W.length >= 4 && W.endsWith("습니다") && (jongOf(W[W.length - 4]) === JSS || W[W.length - 4] === "겠")) return rep("습니다", "다", "past-future");
  if (/[있없]습니다$/.test(W)) return rep("습니다", "다", "iss-eops");
  if (W === "않습니다") return decideAnh(lex, ctx, "습니다", "는다", "다");
  if (W.endsWith("됩니다")) return rep("됩니다", "된다", "doeda");
  if (W.endsWith("못합니다")) {
    const cl = ctx.clause || [];
    if (ctx.prev === "지" || /지$/.test(ctx.prev)) return rep("합니다", "한다", "mot-ha");
    if (/만$/.test(ctx.prev) || cl.some((w) => /보다$/.test(w))) return rep("합니다", "하다", "mot-ha-adj");
    return rep("합니다", "한다", "mot-ha");
  }
  if (W.endsWith("합니다")) {
    const X = W.slice(0, -3);
    if (X === "") return rep("합니다", "한다", "ha-verb-bare");
    const c = classify(lex, X + "하");
    if (c === "V") return rep("합니다", "한다", "ha-verb");
    if (c === "A") return rep("합니다", "하다", "ha-adj");
    return C("ha-ambiguous");
  }
  if (W.endsWith("집니다") && W.length > 3) return rep("집니다", "진다", "jida");
  if (isBnida(W)) {
    const syl = W[W.length - 3];
    const pre = W.slice(0, -3);
    const stem0 = pre + withJong(syl, 0);
    const stemL = pre + withJong(syl, JL);
    const c0 = classify(lex, stem0);
    const cL = classifyExact(lex, stemL);
    if (c0 === "V" && cL !== "A") return rep(syl + "니다", withJong(syl, JN) + "다", "verb-bnida");
    if (c0 === "A" && cL !== "A") return rep(syl + "니다", withJong(syl, 0) + "다", "adj-bnida");
    if (cL === "A" && c0 !== "V" && c0 !== "A") return rep(syl + "니다", withJong(syl, JL) + "다", "adj-l-bnida");
    return C("bnida-ambiguous");
  }
  if (W.endsWith("습니다")) {
    const head = W.slice(0, -3);
    if (!head) return C("seumnida-bare");
    const hk = homoKind(head, ctx);
    if (hk === null) return C("homograph-no-particle");
    const c = hk !== undefined ? hk : classify(lex, head);
    if (c === "V") return rep("습니다", "는다", "verb-seumnida");
    if (c === "A") return rep("습니다", "다", "adj-seumnida");
    return C("seumnida-ambiguous");
  }
  return C("unknown-hapsyo");
}

function decideHaeyo(lex, W, ctx) {
  if (W.endsWith("아니에요")) return rep("아니에요", "아니다", "yo-anida");
  if (W.endsWith("이에요")) return rep("이에요", "이다", "yo-ida");
  if (W.length >= 2 && W.endsWith("예요")) return rep("예요", "이다", "yo-ida-ye");
  if (W.length >= 3 && W.endsWith("어요") && (jongOf(W[W.length - 3]) === JSS || W[W.length - 3] === "겠")) return rep("어요", "다", "yo-past");
  if (/[있없]어요$/.test(W)) return rep("어요", "다", "yo-iss-eops");
  if (W === "않아요") return decideAnh(lex, ctx, "아요", "는다", "다");
  if (W.endsWith("돼요")) return rep("돼요", "된다", "yo-dwae");
  if (W.endsWith("해요")) {
    const X = W.slice(0, -2);
    if (X === "") return rep("해요", "한다", "yo-ha-verb-bare");
    const c = classify(lex, X + "하");
    if (c === "V") return rep("해요", "한다", "yo-ha-verb");
    if (c === "A") return rep("해요", "하다", "yo-ha-adj");
    return C("yo-ha-ambiguous");
  }
  const m = W.match(/^(.*[가-힣])[아어]요$/);
  if (m) {
    const stem = m[1];
    const j = jongOf(stem[stem.length - 1]);
    if (j !== 0 && j !== JSS) {
      const hk = homoKind(stem, ctx);
      if (hk === null) return C("homograph-no-particle");
      const c = hk !== undefined ? hk : classify(lex, stem);
      if (c === "V") return rep(W.slice(stem.length), "는다", "yo-cons-verb");
      if (c === "A") return rep(W.slice(stem.length), "다", "yo-cons-adj");
      return C("yo-cons-ambiguous");
    }
  }
  if (/(지요|죠|네요|군요|거든요|까요|나요|가요|래요|데요)$/.test(W)) return C("yo-pragmatic");
  return C("yo-other");
}

// ---------- 토크나이저: HTML -> 노드 ----------
const PROT = new RegExp(
  [
    "<!--[\\s\\S]*?-->",
    "<(script|style|svg|pre|code|blockquote|h[1-6]|title)\\b[^>]*>[\\s\\S]*?<\\/\\1>",
    '<div class="example"[^>]*>[\\s\\S]*?<\\/div>',
    '<p class="te-cite"[^>]*>[\\s\\S]*?<\\/p>',
    '<ol class="te-refs"[^>]*>[\\s\\S]*?<\\/ol>',
    "<[^>]+>",
  ].join("|"),
  "gi"
);
const BLOCK_TAG = /^<\/?(p|li|ul|ol|div|table|thead|tbody|tr|td|th|br|section|article|figure|figcaption|main|dl|dd|dt|header|footer|nav|details|summary)\b/i;
const HEAD_RE = /^<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>$/i;

function tokenize(html) {
  const toks = [];
  let last = 0;
  let m;
  PROT.lastIndex = 0;
  while ((m = PROT.exec(html))) {
    if (m.index > last) toks.push({ k: "text", s: html.slice(last, m.index) });
    const s = m[0];
    let hm;
    if (/^<(script|style|svg|pre|code)\b/i.test(s)) toks.push({ k: "inline-prot", s });
    else if ((hm = HEAD_RE.exec(s))) toks.push({ k: "heading", s, level: hm[1][1], text: s.replace(/<[^>]+>/g, "") });
    else if (/^<(blockquote|title)\b/i.test(s) || /^<div class="example"/i.test(s) || /^<p class="te-cite"/i.test(s) || /^<ol class="te-refs"/i.test(s)) toks.push({ k: "block-prot", s });
    else toks.push({ k: "tag", s, block: BLOCK_TAG.test(s) });
    last = m.index + s.length;
  }
  if (last < html.length) toks.push({ k: "text", s: html.slice(last) });
  return toks;
}

// 한 줄 안에서 짝이 맞는 따옴표 구간을 \u0002 로 가린다.
function maskQuotes(line) {
  const out = line.split("");
  const pairs = [["“", "”"], ["‘", "’"], ["「", "」"], ["『", "』"], ["《", "》"], ["〈", "〉"]];
  for (const [o, c] of pairs) {
    let i = 0;
    while ((i = line.indexOf(o, i)) !== -1) {
      const j = line.indexOf(c, i + 1);
      if (j === -1) break;
      for (let k = i; k <= j; k++) out[k] = "\u0002";
      i = j + 1;
    }
  }
  for (const q of ['"', "'"]) {
    const idx = [];
    for (let i = 0; i < line.length; i++) if (line[i] === q) idx.push(i);
    if (idx.length % 2 === 0) for (let p = 0; p < idx.length; p += 2) for (let k = idx[p]; k <= idx[p + 1]; k++) out[k] = "\u0002";
  }
  return out.join("");
}

function buildPlain(toks) {
  let plain = "";
  const segs = [];
  const fieldAt = [];
  toks.forEach((t, ti) => {
    if (t.k === "text") {
      segs.push({ ps: plain.length, pe: plain.length + t.s.length, ti });
      plain += t.s;
    } else if (t.k === "inline-prot") plain += "\u0001";
    else if (t.k === "block-prot") plain += "\n";
    else if (t.k === "heading") {
      plain += "\n";
      if (t.level === "2") fieldAt.push({ ps: plain.length, field: t.text.trim() });
    } else {
      if (t.block) plain += "\n";
      if (/class="definition-box"/.test(t.s)) fieldAt.push({ ps: plain.length, field: "definition-box" });
    }
  });
  return { plain, segs, fieldAt };
}

function sentStartOf(s, pos) {
  for (let i = pos - 1; i >= 0; i--) {
    if (s[i] === "\n") return i + 1;
    if (/[.!?]/.test(s[i]) && (s[i + 1] === " " || s[i + 1] === undefined)) return i + 2;
  }
  return 0;
}

// ---------- 변환 본체 ----------
// 반환: { html, edits:[{tier,rule,word,field,sentBefore,sentAfter?}], headings }
function convertHtml(html, lex, opts) {
  const templates = (opts && opts.templates) || null;
  const toks = tokenize(html);
  const { plain, segs, fieldAt } = buildPlain(toks);
  const masked = plain.split("\n").map(maskQuotes).join("\n");
  const edits = [];
  const applied = [];
  const wordRe = /[가-힣]+/g;
  let m;
  while ((m = wordRe.exec(masked))) {
    const W = m[0];
    if (!/(니다|니다만|니까|시오|세요|요|죠|시다)$/.test(W)) continue;
    const start = m.index, end = start + W.length;
    let j = start - 1;
    while (j >= 0 && masked[j] === " ") j--;
    let s = j;
    while (s >= 0 && /[가-힣]/.test(masked[s])) s--;
    const prev = masked.slice(s + 1, j + 1);
    let nx = masked[end];
    if (nx === " " && /^ +[—–(\[\u0002]/.test(masked.slice(end, end + 4))) nx = ".";
    let cs = start - 1;
    while (cs >= 0 && !/[,.;:!?\n\u0001]/.test(masked[cs])) cs--;
    const clause = masked.slice(cs + 1, start).trim().split(/\s+/).filter(Boolean).slice(-8);
    const d = decide(lex, W, nx, { prev, clause });
    if (!d) continue;
    const ss = sentStartOf(plain, start);
    let se = end;
    while (se < plain.length && !/[.!?\n]/.test(plain[se])) se++;
    if (/[.!?]/.test(plain[se] || "")) se++;
    const clean = (x) => x.replace(/[\u0001\u0002]/g, "·").trim();
    let field = "intro";
    for (const f of fieldAt) { if (f.ps <= start) field = f.field; else break; }
    let pb = plain.lastIndexOf("\n", start - 1) + 1;
    let pa = plain.indexOf("\n", end);
    if (pa < 0) pa = plain.length;
    let para = clean(plain.slice(pb, pa));
    if (para.length > 300) {
      const k = Math.max(0, Math.min(start - pb - 100, para.length - 300));
      para = para.slice(k, k + 300);
    }
    const rec = { tier: d.tier, rule: d.rule, word: W, para, wordAfter: d.from ? W.slice(0, W.length - d.from.length) + d.to : null, field, sentBefore: clean(plain.slice(ss, se)) };
    if (templates && templates.has(rec.sentBefore)) {
      rec.tier = "T";
      rec.rule = "template";
    } else if (d.tier === "A") {
      const fs0 = end - d.from.length;
      const seg = segs.find((g) => fs0 >= g.ps && end <= g.pe);
      if (!seg) {
        rec.tier = "C";
        rec.rule = "cross-node";
      } else {
        applied.push({ ti: seg.ti, ls: fs0 - seg.ps, le: end - seg.ps, to: d.to });
        rec.sentAfter = clean(plain.slice(ss, fs0) + d.to + plain.slice(end, se));
      }
    }
    edits.push(rec);
  }
  const byTi = new Map();
  for (const a of applied) {
    if (!byTi.has(a.ti)) byTi.set(a.ti, []);
    byTi.get(a.ti).push(a);
  }
  for (const [ti, arr] of byTi) {
    arr.sort((x, y) => y.ls - x.ls);
    let s = toks[ti].s;
    for (const a of arr) s = s.slice(0, a.ls) + a.to + s.slice(a.le);
    toks[ti].s = s;
  }
  return {
    html: toks.map((t) => t.s).join(""),
    edits,
    headings: toks.filter((t) => t.k === "heading").map((t) => ({ level: t.level, text: t.text.trim() })),
  };
}

function convertText(text, lex) {
  const r = convertHtml(text, lex);
  return { text: r.html, edits: r.edits };
}

function plainForLexicon(html) {
  const { plain } = buildPlain(tokenize(html));
  return plain.split("\n").map(maskQuotes).join("\n");
}

module.exports = { convertHtml, convertText, newLexicon, addToLexicon, classify, decide, plainForLexicon, tokenize };

// ---------- CLI ----------
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const args = process.argv.slice(2);
  const opt = (n, d) => {
    const i = args.indexOf("--" + n);
    return i >= 0 ? args[i + 1] : d;
  };
  if (!args.includes("--dry")) {
    console.error("현재는 --dry (집계·표본, 데이터 쓰기 없음)만 지원한다.");
    process.exit(2);
  }
  const root = path.resolve(opt("root", path.join(__dirname, "..", "..")));
  const nSample = +opt("sample", 300), nC = +opt("c", 100);
  let seed = +opt("seed", 20261016);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const files = fs.readdirSync(path.join(root, "terms")).filter((f) => f.endsWith(".html"));
  const lex = newLexicon();
  const mains = [];
  for (const f of files) {
    const h = fs.readFileSync(path.join(root, "terms", f), "utf8");
    const a = h.indexOf("<main"), b = h.lastIndexOf("</main>");
    if (a < 0 || b <= a) continue;
    const mn = h.slice(a, b);
    mains.push([f.slice(0, -5), mn]);
    addToLexicon(lex, plainForLexicon(mn));
  }
  const terms = JSON.parse(fs.readFileSync(path.join(root, "terms.json"), "utf8"));
  for (const t of terms) if (t.definition) addToLexicon(lex, t.definition);
  const all = [];
  const tally = { A: 0, C: 0 };
  const ruleCount = {};
  const headingCount = {};
  const pairCount = {};
  const defCount = { A: 0, C: 0 };
  const take = (slug, edits, forceField) => {
    for (const e of edits) {
      tally[e.tier]++;
      if (forceField) defCount[e.tier]++;
      if (e.tier === "A" && e.wordAfter) { const pk = e.word + " → " + e.wordAfter; pairCount[pk] = (pairCount[pk] || 0) + 1; }
      const rk = e.tier + ":" + e.rule;
      ruleCount[rk] = (ruleCount[rk] || 0) + 1;
      all.push({ slug, ...e, field: forceField || e.field });
    }
  };
  for (const t of terms) if (t.definition) take(t.slug, convertText(t.definition, lex).edits, "terms.json:definition");
  for (const [slug, mn] of mains) {
    const r = convertHtml(mn, lex);
    take(slug, r.edits);
    for (const h of r.headings) if (/(니다|다|요)$/.test(h.text)) headingCount[h.text] = (headingCount[h.text] || 0) + 1;
  }
  // 반복 템플릿 문장(전체 문장이 100회 이상 동일): 본문 변환에서 제외하고 생성기에서 손으로 고친다
  const sentCount = {};
  for (const e of all) sentCount[e.sentBefore] = (sentCount[e.sentBefore] || 0) + 1;
  const templates = Object.entries(sentCount).filter(([, n]) => n >= 100).sort((a, b) => b[1] - a[1]);
  const tset = new Set(templates.map(([k]) => k));
  const srcFiles = [];
  for (const d of ["scripts", "assets"]) {
    const walk = (dir) => { for (const f of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { if (f.name === "enrich-data" || f.name === "node_modules") continue; const rel = dir + "/" + f.name; if (f.isDirectory()) walk(rel); else if (f.name.endsWith(".js")) srcFiles.push(rel); } };
    walk(d);
  }
  const findSrc = (sent) => { const frag = sent.replace(/[.!?]$/, "").slice(-14); for (const f of srcFiles) { const ls = fs.readFileSync(path.join(root, f), "utf8").split("\n"); const i = ls.findIndex((l) => l.includes(frag)); if (i >= 0) return f + ":" + (i + 1); } return "(생성기에서 못 찾음: 데이터/정적 HTML)"; };
  tally.A = 0; tally.C = 0; tally.T = 0;
  for (const k of Object.keys(ruleCount)) delete ruleCount[k];
  for (const k of Object.keys(pairCount)) delete pairCount[k];
  for (const e of all) {
    if (tset.has(e.sentBefore)) e.tier = "T";
    tally[e.tier]++;
    const rk = e.tier + ":" + (e.tier === "T" ? "template" : e.rule);
    ruleCount[rk] = (ruleCount[rk] || 0) + 1;
    if (e.tier === "A" && e.wordAfter) { const pk = e.word + " → " + e.wordAfter; pairCount[pk] = (pairCount[pk] || 0) + 1; }
  }
  const total = tally.A + tally.C;
  const pct = (x) => ((x / total) * 100).toFixed(1) + "%";
  const A = all.filter((e) => e.tier === "A");
  const Cs = all.filter((e) => e.tier === "C");
  const pick = (arr, n) => {
    const a = arr.slice(), o = [];
    while (o.length < n && a.length) o.push(a.splice(Math.floor(rnd() * a.length), 1)[0]);
    return o;
  };
  const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
  let md = "# 본문 해라체 변환 드라이런 표본 (자동 생성)\n\n";
  md += `대상: terms/*.html main 본문 ${mains.length}쪽 + terms.json definition. 인용·.example·제목 제외. 데이터 변경 없음.\n\n`;
  md += `## 집계\n- 합쇼/해요 종결 총 ${total}건: 등급 A(자동 변환) ${tally.A} (${pct(tally.A)}), 등급 C(검수 필요, 변환 안 함) ${tally.C} (${pct(tally.C)})\n- 정의(terms.json): A ${defCount.A} / C ${defCount.C}\n\n### 규칙별\n| 규칙 | 건수 |\n|---|---|\n`;
  md += Object.entries(ruleCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join("\n") + "\n\n";
  md += "### 문장형 제목(변환 제외, 별도 처리 대상)\n| 제목 | 쪽수 |\n|---|---|\n" + Object.entries(headingCount).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => `| ${esc(k)} | ${v} |`).join("\n") + "\n\n";
  md += "### 반복 템플릿 문장 (변환 제외, 생성기에서 직접 수정)\n| 문장 | 건수 | 생성기 |\n|---|---|---|\n" + templates.map(([k, n]) => `| ${esc(k)} | ${n} | ${findSrc(k)} |`).join("\n") + "\n\n";
  md += "### 어절 변환쌍 상위 200 (전 → 후, 건수)\n| 전 → 후 | 건수 |\n|---|---|\n" + Object.entries(pairCount).sort((x, y) => y[1] - x[1]).slice(0, 200).map(([k, v]) => `| ${esc(k)} | ${v} |`).join("\n") + "\n\n";
  md += `## 변환 표본 ${nSample}건\n\n`;
  for (const e of pick(A, nSample)) md += `- \`${e.slug}\` [${esc(e.field)}] ${e.rule}\n  - 전: ${esc(e.sentBefore)}\n  - 후: ${esc(e.sentAfter)}\n`;
  md += `\n## 등급 C 표본 ${nC}건\n\n`;
  for (const e of pick(Cs, nC)) md += `- \`${e.slug}\` [${esc(e.field)}] ${e.rule}: ${esc(e.sentBefore)}\n`;
  const out = opt("out", null);
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, md);
  }
  console.log(JSON.stringify({ pages: mains.length, total, T: tally.T, templates: templates.map(([k, n]) => [k, n, findSrc(k)]), A: tally.A, C: tally.C, autoPct: pct(tally.A), defCount, ruleCount }, null, 1));
}
