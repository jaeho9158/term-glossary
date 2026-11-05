// 채움(related-same-field) 후보의 표제어 관련성 점수.
// 제목·별칭·정의의 한글 2글자 조각/영문 단어 겹침 + related 그래프(직접·2촌) 연결 가산.
const COMMON_RATIO = 0.01; // 전체 용어의 1% 넘게 나오는 조각은 흔한 말로 보고 버린다

function rawTokens(text) {
  const out = new Set();
  const s = String(text || "").toLowerCase();
  for (const w of s.match(/[a-z][a-z0-9]{2,}/g) || []) out.add(w);
  for (const w of s.match(/[가-힣]{2,}/g) || []) for (let i = 0; i + 2 <= w.length; i++) out.add(w.slice(i, i + 2));
  return out;
}

function buildRelatedScorer(terms) {
  const raw = new Map();
  const df = new Map();
  for (const t of terms) {
    const name = rawTokens([t.title_ko, t.title_en, ...(t.aliases || [])].join(" "));
    const def = rawTokens(t.definition);
    raw.set(t.slug, { name, def });
    for (const k of new Set([...name, ...def])) df.set(k, (df.get(k) || 0) + 1);
  }
  const maxDf = Math.max(20, terms.length * COMMON_RATIO);
  const keep = (set) => new Set([...set].filter((k) => df.get(k) <= maxDf));
  const tok = new Map([...raw].map(([s, v]) => [s, { name: keep(v.name), def: keep(v.def) }]));
  const nb = new Map(terms.map((t) => [t.slug, new Set()]));
  for (const t of terms) for (const r of t.related || []) {
    if (!nb.has(r)) continue;
    nb.get(t.slug).add(r);
    nb.get(r).add(t.slug);
  }
  const inter = (a, b) => { let n = 0; for (const k of a) if (b.has(k)) n++; return n; };
  return function score(a, b) {
    const A = tok.get(a), B = tok.get(b);
    if (!A || !B) return 0;
    let s = 2 * inter(A.name, B.name) + inter(A.name, B.def) + inter(B.name, A.def) + 0.5 * inter(A.def, B.def);
    const na = nb.get(a), nbb = nb.get(b);
    if (na.has(b)) s += 4;
    else if (inter(na, nbb) > 0) s += 3;
    return s;
  };
}

module.exports = { buildRelatedScorer };
