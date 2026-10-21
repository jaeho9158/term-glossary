// 공통 디자인 토큰. 도식(diagram)과 도해(illus)가 같은 --si-* 변수를 쓴다.
// 값은 기존 사이트 도식 팔레트(--dg-*, figlib)와 사이트 강조색(--accent)을 그대로 옮겼다.

export const ROLES = ['blue', 'green', 'amber', 'rose', 'violet', 'gray'];

export const TOKENS = {
  light: {
    'blue-f': '#dde5f0', 'blue-s': '#7f9ac0', 'blue-t': '#12305c',
    'green-f': '#e3f1ea', 'green-s': '#5b9b83', 'green-t': '#14543c',
    'amber-f': '#fdf0d8', 'amber-s': '#d79a2b', 'amber-t': '#7a5210',
    'rose-f': '#fbe4e4', 'rose-s': '#c97b7b', 'rose-t': '#7d2626',
    'violet-f': '#eae4f4', 'violet-s': '#9382bd', 'violet-t': '#3f2f6b',
    'gray-f': '#eef1f6', 'gray-s': '#aab6c6', 'gray-t': '#44546a',
    navy: '#12305c', pos: '#14543c', limit: '#7d2626', general: '#5c6b7f', 'badge-t': '#ffffff',
    ink: '#1f2328', accent: '#2454ff', 'accent-soft': '#eef4ff', bg: '#ffffff', border: '#e2e5e9',
  },
  dark: {
    'blue-f': '#1d2a3e', 'blue-s': '#6f8fbf', 'blue-t': '#c9d8f0',
    'green-f': '#1a3028', 'green-s': '#5b9b83', 'green-t': '#bfe3d2',
    'amber-f': '#372b15', 'amber-s': '#d79a2b', 'amber-t': '#f3d9a6',
    'rose-f': '#3a1f1f', 'rose-s': '#c97b7b', 'rose-t': '#f2c4c4',
    'violet-f': '#2a2440', 'violet-s': '#9382bd', 'violet-t': '#d9cff0',
    'gray-f': '#242a33', 'gray-s': '#7f8a99', 'gray-t': '#c5ccd6',
    navy: '#9fb6db', pos: '#7fcfa8', limit: '#f0a0a0', general: '#9aa8b8', 'badge-t': '#14171a',
    ink: '#e6edf3', accent: '#6ea8ff', 'accent-soft': '#1e2a44', bg: '#1c2128', border: '#30363d',
  },
};

/** 굵기·글꼴·여백 토큰(문서화와 템플릿용). */
export const METRICS = {
  font: "'Pretendard','Noto Sans KR','Apple SD Gothic Neo',sans-serif",
  fontSize: 13, fontSizeSmall: 11.5, fontSizeSub: 11.5,
  strokeMain: 1.5, strokeThin: 0.8, strokeBold: 2.4,
  margin: 14, boxRadius: 6, boxPadX: 12, boxPadY: 10,
};

// 도해 스펙의 색 이름 → 토큰. 의미 별칭: fg(글자색=currentColor), muted=general, good=pos, bad=limit.
const ALIAS = { muted: 'general', good: 'pos', bad: 'limit', line: 'navy', soft: 'accent-soft' };
export const DEFAULT_PALETTE = {};

/** 색 이름을 CSS 값으로. 토큰 이름이면 var(--si-*, 기본값), 그 밖은 CSS 색 그대로. */
export function colorRef(name, palette = {}) {
  if (name === 'fg' || name === 'currentColor') return 'currentColor';
  let key = ALIAS[name] || name;
  if (ROLES.includes(key)) key += '-s';
  if (key in TOKENS.light) {
    const fb = palette[name] || palette[key] || TOKENS.light[key];
    return `var(--si-${key},${fb})`;
  }
  return String(name);
}

/** spec.palette → svg style 속성에 덧붙일 CSS 변수 덮어쓰기. */
export function paletteStyle(palette) {
  return Object.entries(palette).map(([k, v]) => {
    let key = ALIAS[k] || k; if (ROLES.includes(key)) key += '-s';
    return `;--si-${key}:${v}`;
  }).join('');
}

/** var(--si-x) 처럼 기본값 없는 참조에 기본값을 채운다(CSS 없이 열어도 색이 나오게). */
export function withFallbacks(svg) {
  return svg.replace(/var\(--si-([a-z-]+)\)/g, (m, k) => TOKENS.light[k] ? `var(--si-${k},${TOKENS.light[k]})` : m);
}

function block(t) { return Object.entries(t).map(([k, v]) => `--si-${k}:${v};`).join(''); }

/** 공통 CSS(토큰·다크 모드·figure 구조). assets/svg-illus.css와 같은 내용. */
export function themeCss() {
  return `:root{${block(TOKENS.light)}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${block(TOKENS.dark)}}}
:root[data-theme="dark"]{${block(TOKENS.dark)}}
.si-figure{margin:1.5em 0;padding:1em;background:var(--card-bg,var(--si-bg));border:1px solid var(--border,var(--si-border));border-radius:8px;color:var(--si-ink)}
.si-figure .si-frame{display:flex;flex-direction:column;align-items:center}
.si-figure svg{display:block;width:100%;height:auto;margin:0 auto}
.si-figure svg.si-illus{color:var(--si-ink)}
.si-figure figcaption{margin-top:.6em;font-size:.875rem;line-height:1.6;color:var(--si-general)}
.si-figure .si-caption{display:block;color:var(--si-ink)}
.si-figure .si-credit{display:block;margin-top:4px;font-size:.8125rem}
.si-figure.si-dual .dg-v{display:none}
@media (max-width:640px){.si-figure.si-dual .dg-h{display:none}.si-figure.si-dual .dg-v{display:block}}
.si-legend{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:8px 0;padding:8px 10px;background:var(--si-accent-soft);border-radius:6px;color:var(--si-ink)}
.si-legend>div{display:contents}
.si-legend dt{font-weight:600;white-space:nowrap}
.si-legend dt i{font-family:"Times New Roman",serif;font-style:italic;font-size:1.08em}
.si-legend dd{margin:0}
.si-math{font-size:1.05em;color:inherit}
.si-note{margin:6px 0;font-size:.8125rem}
.si-table-wrap{overflow-x:auto;margin:8px 0}
.si-table{border-collapse:collapse;font-size:.8125rem;color:var(--si-ink)}
.si-table th,.si-table td{border:1px solid var(--si-border);padding:3px 8px;text-align:left}
.si-badge{display:inline-block;min-width:18px;height:18px;line-height:18px;border-radius:50%;background:var(--si-accent);color:var(--si-bg);text-align:center;font-weight:700;font-size:11px}
`;
}
