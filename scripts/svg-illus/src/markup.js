// 라벨 마크업: x_{1} 아래첨자, x^{2} 위첨자. 중괄호 없이 한 글자(x_1, x^2)도 받는다.

export function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 분수: rac{분자}{분모} 또는 {frac:분자,분모}(명시 표기 우선). 분자·분모 안에 첨자 한 단계 허용.
export const FRAC_RE = /\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\{((?:[^{}]|\{[^{}]*\})*)\}|\{frac:([^,{}]+),([^{}]+)\}/g;
export const hasFrac = s => { FRAC_RE.lastIndex = 0; return FRAC_RE.test(String(s ?? '')); };

/** {frac:a,b} → rac{a}{b}로 통일(쉼표가 줄바꿈 후보라 도식 배치 전에 바꿔 둔다). */
export function normalizeFrac(s) {
  return String(s).replace(/\{frac:([^,{}]+),([^{}]+)\}/g, (_, n, d) => `\\frac{${n.trim()}}{${d.trim()}}`);
}

/**
 * 선택 기능: 숫자/숫자(1/3)만 분수로. 단위(km/h, m/s)·날짜(2026/10/21)·URL·소수(0.5/2)는 건드리지 않는다.
 * 글자 분수는 반드시 명시 표기를 쓴다.
 */
export function autoFrac(s) {
  return String(s).replace(/(^|[^\w./:])(\d+)\/(\d+)(?![\w./])/g, (m, pre, n, d) => `${pre}\\frac{${n}}{${d}}`);
}

function parseScripts(s, out) {
  const re = /([_^])(?:\{([^}]*)\}|([^\s{}_^]))/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), kind: 'normal' });
    out.push({ text: m[2] !== undefined ? m[2] : m[3], kind: m[1] === '_' ? 'sub' : 'sup' });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last), kind: 'normal' });
}

/** 문자열을 [{text, kind:'normal'|'sub'|'sup'} | {kind:'frac', num, den}] 조각으로 나눈다. */
export function parseMarkup(s) {
  const out = [];
  s = String(s ?? '');
  let last = 0, m;
  FRAC_RE.lastIndex = 0;
  while ((m = FRAC_RE.exec(s))) {
    if (m.index > last) parseScripts(s.slice(last, m.index), out);
    out.push({ kind: 'frac', num: (m[1] ?? m[3]).trim(), den: (m[2] ?? m[4]).trim() });
    last = FRAC_RE.lastIndex;
  }
  if (last < s.length) parseScripts(s.slice(last), out);
  return out;
}

const tsp = p => p.kind === 'normal' ? escapeXml(p.text)
  : `<tspan baseline-shift="${p.kind === 'sub' ? 'sub' : 'super'}" font-size="72%">${escapeXml(p.text)}</tspan>`;

/** SVG <text> 안에 넣을 내용(tspan 포함). 분수는 한 줄 대체 표기(분자⁄분모); 진짜 분수는 richTextSvg가 그린다. */
export function toTspan(s) {
  return parseMarkup(s).map(p => p.kind === 'frac' ? toTspan(p.num) + '⁄' + toTspan(p.den) : tsp(p)).join('');
}

/** MathML 한 줄: 숫자 mn, 한 글자 mi, 그 밖은 mtext. 첨자는 앞 토큰에 msub/msup. */
function mathRow(s) {
  const toks = [];
  for (const p of parseMarkup(s)) {
    if (p.kind === 'frac') { toks.push(`<mfrac><mrow>${mathRow(p.num)}</mrow><mrow>${mathRow(p.den)}</mrow></mfrac>`); continue; }
    if (p.kind === 'normal') {
      for (const t of p.text.match(/\d+(?:\.\d+)?|[A-Za-zα-ωΑ-Ω]+|\s+|./gu) || []) {
        if (/^\s+$/.test(t)) continue;
        toks.push(/^\d/.test(t) ? `<mn>${t}</mn>` : /^[A-Za-zα-ωΑ-Ω]$/.test(t) ? `<mi>${t}</mi>` : /^[A-Za-z]+$/.test(t) ? `<mi mathvariant="normal">${t}</mi>` : `<mo>${escapeXml(t)}</mo>`);
      }
    } else {
      const base = toks.pop() || '<mrow></mrow>';
      toks.push(`<${p.kind === 'sub' ? 'msub' : 'msup'}>${base}<mrow>${mathRow(p.text)}</mrow></${p.kind === 'sub' ? 'msub' : 'msup'}>`);
    }
  }
  return toks.join('');
}

/** HTML: 첨자는 <sub>/<sup>, 분수는 MathML <math><mfrac>(외부 라이브러리 없이 최신 브라우저가 그린다. 색은 상속). */
export function toHtml(s) {
  return parseMarkup(s).map(p => p.kind === 'frac'
    ? `<math class="si-math"><mfrac><mrow>${mathRow(p.num)}</mrow><mrow>${mathRow(p.den)}</mrow></mfrac></math>`
    : p.kind === 'normal' ? escapeXml(p.text) : `<${p.kind}>${escapeXml(p.text)}</${p.kind}>`).join('');
}

const LETTER = /^[A-Za-zα-ωΑ-Ω]$/;

/**
 * 범례 기호의 kind를 정한다. 명시값이 있으면 그대로.
 * var 한 글자 변수(첨자 허용) · expr 수식 · func 함수명 · const 상수 · abbr 약어 · term 한글 용어 · note 기호 없는 주석
 */
export function kindOf(sym, kind) {
  if (kind) return kind;
  if (!sym) return 'note';
  if (/[가-힣]/.test(sym)) return 'term';
  if (/^(sin|cos|tan|log|ln|exp|max|min|lim|det)$/.test(sym)) return 'func';
  if (/^(π|e)$/.test(sym)) return 'const';
  if (/^[A-Z]{2,6}$/.test(sym)) return 'abbr';
  if (/^[A-Za-zα-ωΑ-Ω]((_|\^)(\{[^}]*\}|\S))?$/.test(sym)) return 'var';
  return 'expr';
}

/** 범례 기호 HTML. var·expr만 한 글자 라틴·그리스 문자를 기울인다(proj, cos 같은 낱말은 정체). */
export function symHtml(sym, kind) {
  const k = kindOf(sym, kind);
  const h = toHtml(sym);
  if (k !== 'var' && k !== 'expr') return h;
  return h.replace(/(<[^>]+>)|(&[a-z]+;)|([A-Za-zα-ωΑ-Ω]+)/g, (m, tag, ent, word) =>
    tag || ent ? m : (LETTER.test(word) ? `<i>${word}</i>` : word));
}

/** 글자 폭 추정(px). 한글 1em, 대문자 0.72em, 좁은 글자 0.3em, 나머지 0.62em. 첨자는 72%. */
export function estimateTextWidth(s, fontSize = 13) {
  let w = 0;
  for (const p of parseMarkup(s)) {
    if (p.kind === 'frac') { w += Math.max(estimateTextWidth(p.num, fontSize * FRAC_SCALE), estimateTextWidth(p.den, fontSize * FRAC_SCALE)) + FRAC_PAD * 2; continue; }
    const k = p.kind === 'normal' ? 1 : 0.72;
    for (const ch of p.text) {
      const r = /[ᄀ-ᇿ㄰-㆏가-힣一-鿿]/.test(ch) ? 1.0 : /[il.,:;|'!· ]/.test(ch) ? 0.3 : /[A-Z]/.test(ch) ? 0.72 : 0.62;
      w += r * fontSize * k;
    }
  }
  return w;
}

// ── SVG 진짜 분수 ──
export const FRAC_SCALE = 0.8, FRAC_PAD = 2;

/**
 * 분수가 섞인 라벨을 SVG로: 일반 구간은 <text>, 분수는 분자 <text> · 가로선 <line> · 분모 <text>.
 * 분수 폭은 분자·분모 중 긴 쪽 기준, 글자 0.8배, 가로선은 수학 축(기준선 위 0.32em)에 맞춘다.
 * attrs: <g>에 붙일 속성(글꼴 크기·굵기·색). color: 가로선 색(CSS 값, 기본 currentColor).
 */
export function fracSvg(x, y, num, den, { size = 13, color = 'currentColor', measure = estimateTextWidth } = {}) {
  const fs = size * FRAC_SCALE, w = Math.max(measure(num, fs), measure(den, fs)) + FRAC_PAD * 2;
  const cx = x + w / 2, ly = y - size * 0.32, r = n => +n.toFixed(1);
  return {
    width: w,
    svg: `<text x="${r(cx)}" y="${r(ly - size * 0.16)}" text-anchor="middle" font-size="${r(fs)}">${toTspan(num)}</text>`
      + `<line x1="${r(x + 0.5)}" y1="${r(ly)}" x2="${r(x + w - 0.5)}" y2="${r(ly)}" style="stroke:${color}" stroke-width="${r(Math.max(0.8, size / 16))}"/>`
      + `<text x="${r(cx)}" y="${r(ly + fs * 0.86)}" text-anchor="middle" font-size="${r(fs)}">${toTspan(den)}</text>`,
  };
}

/** 분수 포함 라벨의 세로 범위(기준선 기준): 위로 1.15em, 아래로 0.62em. */
export const FRAC_BOX = { up: 1.15, down: 0.62 };

/** 라벨 전체를 SVG로. 분수가 없으면 <text> 하나, 있으면 <g>로 구간을 이어 붙인다. */
export function richTextSvg(x, y, s, { size = 13, anchor = 'start', attrs = '', color, measure = estimateTextWidth } = {}) {
  const r = n => +n.toFixed(1);
  if (!hasFrac(s)) return `<text x="${r(x)}" y="${r(y)}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''} ${attrs}>${toTspan(s)}</text>`;
  const parts = parseMarkup(s), segs = [];
  let cur = [];
  for (const p of parts) { if (p.kind === 'frac') { if (cur.length) segs.push(cur); segs.push(p); cur = []; } else cur.push(p); }
  if (cur.length) segs.push(cur);
  const run = ps => ps.map(p => p.kind === 'normal' ? p.text : `${p.kind === 'sub' ? '_' : '^'}{${p.text}}`).join('');
  const total = estimateTextWidthWith(s, size, measure);
  let cx = anchor === 'middle' ? x - total / 2 : anchor === 'end' ? x - total : x;
  let out = '';
  for (const sg of segs) {
    if (Array.isArray(sg)) {
      const t = run(sg);
      out += `<text x="${r(cx)}" y="${r(y)}">${toTspan(t)}</text>`;
      cx += measure(t, size);
    } else {
      const f = fracSvg(cx + 1, y, sg.num, sg.den, { size, color: color || 'currentColor', measure });
      out += f.svg; cx += f.width + 2;
    }
  }
  return `<g class="si-rich" font-size="${size}" ${attrs}>${out}</g>`;
}

function estimateTextWidthWith(s, size, measure) {
  let w = 0;
  const parts = parseMarkup(s);
  let buf = '';
  const flush = () => { if (buf) { w += measure(buf, size); buf = ''; } };
  for (const p of parts) {
    if (p.kind === 'frac') { flush(); w += Math.max(measure(p.num, size * FRAC_SCALE), measure(p.den, size * FRAC_SCALE)) + FRAC_PAD * 2 + 2; }
    else buf += p.kind === 'normal' ? p.text : `${p.kind === 'sub' ? '_' : '^'}{${p.text}}`;
  }
  flush();
  return w;
}
