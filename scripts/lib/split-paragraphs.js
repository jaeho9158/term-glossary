// 긴 단일 문단 분할 — 용어 페이지 본문 섹션(쉽게 풀면 등)의 한 덩어리 <p>를 문장 단위로 나눈다.
// scripts/split-long-paragraphs.js(일괄 적용)와 build-term-page.js(신규 생성)가 함께 쓴다.
// 텍스트(태그 제거·공백 정리 후)는 절대 바뀌지 않는다: 문단 경계만 추가한다.

const SECTION_TITLES = ["쉽게 풀면", "왜 중요한가", "조금 더 깊게 보면", "주의할 점"];
const MIN_TEXT = 250;       // 이보다 길어야 분할 대상
const MAX_SENT = 3;         // 문단당 최대 문장 수
const MAX_CHARS = 180;      // 문단당 목표 글자 수
const MIN_TAIL = 40;        // 한 문장짜리 꼬리 문단의 최소 글자 수

const VOID = new Set(["br", "img", "wbr", "hr", "input", "meta", "link"]);
const ABBR = new Set(["e.g", "i.e", "al", "vs", "fig", "figs", "eq", "eqs", "cf", "etc", "approx", "no", "vol", "dr", "mr", "mrs", "ms", "prof", "ca", "resp", "ref", "sec", "ch", "pp", "inc", "ltd", "co", "st", "viz", "ex"]);
const OPEN_BR = "([{「『（［";
const CLOSE_BR = ")]}」』）］";

const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
const plain = (h) => h.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/g, "x").replace(/\s+/g, " ").trim();

// inner HTML을 문장 배열로 쪼갠다. 반환: [{html, sep}] — sep은 다음 문장과의 원래 공백.
function splitSentences(inner) {
  const sents = [];
  let start = 0;
  let depthTag = 0;
  let br = 0;       // 괄호 깊이
  let curly = 0;    // “ ” 깊이
  let straight = false;
  const tokRe = /(<[^>]*>)|([^<]+)/g;
  let m;
  while ((m = tokRe.exec(inner)) !== null) {
    if (m[1]) {
      const tag = m[1];
      const nm = /^<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(tag);
      if (!nm || tag.startsWith("<!--")) continue;
      const name = nm[1].toLowerCase();
      if (VOID.has(name) || /\/>$/.test(tag)) continue;
      if (tag[1] === "/") depthTag = Math.max(0, depthTag - 1);
      else depthTag++;
      continue;
    }
    const text = m[2];
    const base = m.index;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (text.startsWith("&quot;", i)) { straight = !straight; i += 5; continue; }
      if (text.startsWith("&ldquo;", i)) { curly++; i += 6; continue; }
      if (text.startsWith("&rdquo;", i)) { curly = Math.max(0, curly - 1); i += 6; continue; }
      if (ch === "&") { const e = /^&#?[a-zA-Z0-9]+;/.exec(text.slice(i)); if (e) { i += e[0].length - 1; continue; } }
      if (OPEN_BR.includes(ch)) { br++; continue; }
      if (CLOSE_BR.includes(ch)) { br = Math.max(0, br - 1); continue; }
      if (ch === "“") { curly++; continue; }
      if (ch === "”") { curly = Math.max(0, curly - 1); continue; }
      if (ch === '"') { straight = !straight; continue; }
      if (ch !== "." && ch !== "?" && ch !== "!") continue;
      if (depthTag || br || curly || straight) continue;
      if (!/\s/.test(text[i + 1] || "")) continue;
      if (ch === ".") {
        const before = text.slice(0, i);
        const w = /([A-Za-z][A-Za-z.]*)$/.exec(before);
        if (w) {
          const word = w[1];
          if (word.length === 1) continue;                    // 이니셜 (J. Smith)
          if (ABBR.has(word.toLowerCase().replace(/\.$/, ""))) continue;
        }
        // 문장 맨 앞의 "1." 같은 번호 매기기
        const sentSoFar = inner.slice(start, base + i);
        if (/^\s*\d{1,2}$/.test(sentSoFar)) continue;
      }
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      const endAbs = base + i + 1;
      const nextAbs = base + j;
      sents.push({ html: inner.slice(start, endAbs), sep: inner.slice(endAbs, nextAbs) });
      start = nextAbs;
      i = j - 1;
    }
  }
  const last = inner.slice(start);
  if (last.trim()) sents.push({ html: last, sep: "" });
  else if (sents.length) { sents[sents.length - 1].html += last; }
  return sents;
}

// inner HTML → 문단 inner HTML 배열 (분할 안 하면 [inner] 그대로)
function splitParagraph(inner) {
  const text = plain(inner);
  if (text.length <= MIN_TEXT) return [inner];
  const sents = splitSentences(inner);
  if (sents.length <= 2) return [inner];
  const groups = [];
  let cur = null;
  for (const s of sents) {
    const len = plain(s.html).length;
    if (cur && cur.n < MAX_SENT && cur.len + len <= MAX_CHARS) {
      cur.html += cur.lastSep + s.html; cur.n++; cur.len += len; cur.lastSep = s.sep;
    } else {
      if (cur) groups.push(cur);
      cur = { html: s.html, n: 1, len, lastSep: s.sep };
    }
  }
  if (cur) groups.push(cur);
  if (groups.length >= 2) {
    const tail = groups[groups.length - 1];
    if (tail.n === 1 && tail.len < MIN_TAIL) {
      const prev = groups[groups.length - 2];
      prev.html += prev.lastSep + tail.html; prev.n += 1; prev.len += tail.len;
      groups.pop();
    }
  }
  if (groups.length < 2) return [inner];
  return groups.map((g) => g.html.trim());
}

// 페이지 HTML 전체에서 대상 섹션을 찾아 분할한다. 반환: {html, changed}
function splitPageHtml(html) {
  let changed = 0;
  const re = /(<h2[^>]*>\s*([^<]+?)\s*<\/h2>)(\s*)(<p((?:\s[^>]*)?)>)((?:(?!<\/p>|<h2|<p[\s>])[\s\S])*)<\/p>(\s*?)(?=<h2|<\/main>|<\/section>|<\/article>|$)/g;
  const out = html.replace(re, (all, h2, title, ws1, openTag, _attrs, inner, ws2) => {
    if (!SECTION_TITLES.includes(title)) return all;
    if (/<p[\s>]/i.test(inner)) return all;
    const parts = splitParagraph(inner);
    if (parts.length < 2) return all;
    changed++;
    const nl = /\r?\n/.exec(ws1);
    const eol = nl ? nl[0] : "\n";
    const indent = ws1.slice(ws1.lastIndexOf("\n") + 1);
    const sep = eol + indent;
    return h2 + ws1 + parts.map((p) => openTag + p + "</p>").join(sep) + ws2;
  });
  return { html: out, changed };
}

module.exports = { splitParagraph, splitSentences, splitPageHtml, strip, SECTION_TITLES };
