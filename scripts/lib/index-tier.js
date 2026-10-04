// 색인 등급(keep/archive) 계산과 페이지 태그 적용. 순수 함수 위주.
// archive 페이지에는 Googlebot 전용 noindex만 넣는다(name="robots"는 네이버도 따르므로 금지).
const START = "<!-- index-tier:start -->";
const END = "<!-- index-tier:end -->";
const TAG = '<meta name="googlebot" content="noindex">';
const BLOCK = `${START}\n${TAG}\n${END}\n`;
const BLOCK_RE = /<!-- index-tier:start -->[\s\S]*?<!-- index-tier:end -->\n?/g;
const CANON_RE = /<link rel="canonical" href="[^"]*">\n?/;

// ga: {"/terms/<slug>.html": views}; stats: {slug: {df, dfNeutral}}; popular: {cat: [slug]}
function computeTiers({ slugs, ga, stats, popular }) {
  const gaSlugs = new Set();
  for (const [p, v] of Object.entries(ga || {})) {
    const m = /^\/terms\/(.+)\.html$/.exec(p);
    if (m && v >= 1) { try { gaSlugs.add(decodeURIComponent(m[1])); } catch { gaSlugs.add(m[1]); } }
  }
  const pop = new Set();
  for (const list of Object.values(popular || {})) for (const s of list) pop.add(s);
  const keep = [], archive = [];
  for (const slug of slugs) {
    const st = (stats && stats[slug]) || {};
    const isKeep = gaSlugs.has(slug) || (st.dfNeutral || 0) >= 1 || (st.df || 0) >= 2 || pop.has(slug);
    (isKeep ? keep : archive).push(slug);
  }
  return { keep, archive };
}

function isStub(html) {
  return /noindex/i.test(html) && /http-equiv="refresh"/i.test(html);
}

// tier: "keep" | "archive". 스텁/구조 불일치면 null.
function applyIndexTier(html, tier) {
  if (isStub(html)) return null;
  const stripped = html.replace(BLOCK_RE, "");
  if (tier !== "archive") return stripped;
  if (!CANON_RE.test(stripped)) return null;
  return stripped.replace(CANON_RE, (m) => (m.endsWith("\n") ? m : m + "\n") + BLOCK);
}

module.exports = { computeTiers, applyIndexTier, isStub, BLOCK, TAG, START, END };
