// 색인 등급(core/archive) 계산과 페이지 태그 적용. 순수 함수 위주.
// archive 페이지에는 Googlebot 전용 noindex만 넣는다(name="robots"는 네이버도 따르므로 금지).
const START = "<!-- index-tier:start -->";
const END = "<!-- index-tier:end -->";
const TAG = '<meta name="googlebot" content="noindex">';
const BLOCK = `${START}\n${TAG}\n${END}\n`;
const BLOCK_RE = /<!-- index-tier:start -->[\s\S]*?<!-- index-tier:end -->\n?/g;
const CANON_RE = /<link rel="canonical" href="[^"]*">\n?/;

// ---- core 등급 기준 (운영자 결정 2026-10-05; Google 색인 피크 2,876건 수준으로 좁힘) ----
// core = Google 색인 대상. 나머지는 archive(Googlebot 전용 noindex). 인기 용어 기준은 폐기.
const GA_STRONG = 2;          // GA 조회수가 이 값 이상이면 무조건 core
const GA_WEAK = 1;            // GA 조회수 >= GA_WEAK 이고 말뭉치 dfNeutral >= DF_WITH_GA 이면 core
const DF_WITH_GA = 1;
const DF_FOCUS = 3;           // 주력 분야 + dfNeutral >= DF_FOCUS 이면 core
const FOCUS_FIELDS = new Set(["psych", "stat", "method", "tool", "medlab", "chem", "bio", "med", "neuro", "nursing", "rehab", "socialecon", "philo"]);

// ga: {"/terms/<slug>.html": views}; stats: {slug: {dfNeutral}}; primaryCat: {slug: categories[0]}
// gsc: 선택 입력. Search Console에서 이미 색인된 slug 배열(없으면 이 기준은 건너뜀).
function computeTiers({ slugs, ga, stats, primaryCat, gsc }) {
  const gscSet = new Set(gsc || []);
  const views = new Map();
  for (const [p, v] of Object.entries(ga || {})) {
    const m = /^\/terms\/(.+)\.html$/.exec(p);
    if (!m) continue;
    let s = m[1];
    try { s = decodeURIComponent(s); } catch { /* 그대로 */ }
    views.set(s, (views.get(s) || 0) + v);
  }
  const core = [], archive = [];
  for (const slug of slugs) {
    const df = ((stats && stats[slug]) || {}).dfNeutral || 0;
    const g = views.get(slug) || 0;
    const cat = primaryCat && primaryCat[slug];
    const isCore = g >= GA_STRONG || (g >= GA_WEAK && df >= DF_WITH_GA) || (df >= DF_FOCUS && FOCUS_FIELDS.has(cat)) || gscSet.has(slug);
    (isCore ? core : archive).push(slug);
  }
  return { core, archive };
}

// ---- core 페이지의 관련 용어 블록에서 archive 대상 링크 제거 (순수 함수) ----
const REL_RE = /(  <h2>관련 용어<\/h2>\r?\n)?  <div class="related-terms">\r?\n([\s\S]*?)  <\/div>(\r?\n)?/;
// 반환: {html, removed, blockRemoved}. 블록이 없으면 그대로.
function filterRelatedLinks(html, archiveSet) {
  const m = REL_RE.exec(html);
  if (!m) return { html, removed: 0, blockRemoved: false };
  const nl = m[0].includes("\r\n") ? "\r\n" : "\n";
  const lines = m[2].split(/\r?\n/).filter((l) => l.trim());
  const kept = lines.filter((l) => {
    const h = /href="([^"]+?)\.html"/.exec(l);
    if (!h) return true;
    let s = h[1];
    try { s = decodeURIComponent(s); } catch { /* 그대로 */ }
    return !archiveSet.has(s);
  });
  const removed = lines.length - kept.length;
  if (!removed) return { html, removed: 0, blockRemoved: false };
  const rep = kept.length ? `${m[1] || ""}  <div class="related-terms">${nl}${kept.join(nl)}${nl}  </div>${m[3] || ""}` : "";
  return { html: html.slice(0, m.index) + rep + html.slice(m.index + m[0].length), removed, blockRemoved: !kept.length };
}

function isStub(html) {
  return /noindex/i.test(html) && /http-equiv="refresh"/i.test(html);
}

// tier: "core" | "archive". 스텁/구조 불일치면 null.
function applyIndexTier(html, tier) {
  if (isStub(html)) return null;
  const stripped = html.replace(BLOCK_RE, "");
  if (tier !== "archive") return stripped;
  if (!CANON_RE.test(stripped)) return null;
  return stripped.replace(CANON_RE, (m) => (m.endsWith("\n") ? m : m + "\n") + BLOCK);
}

module.exports = { filterRelatedLinks, FOCUS_FIELDS, GA_STRONG, GA_WEAK, DF_WITH_GA, DF_FOCUS, computeTiers, applyIndexTier, isStub, BLOCK, TAG, START, END };
