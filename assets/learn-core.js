// assets/learn-core.js — 퀴즈·로드맵이 공유하는 순수 로직(DOM 없음, Node 테스트 가능).
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LearnCore = api;
})(typeof window !== "undefined" ? window : globalThis, function () {

  // "#stat" 같은 맨 토큰 해시 → 유효한 분야 코드(또는 extra 허용값), 아니면 "".
  function parseFieldHash(hash, validCodes, extra) {
    const t = String(hash || "").replace(/^#/, "").trim();
    if (!t) return "";
    if (extra && extra.indexOf(t) !== -1) return t;
    return validCodes && Object.prototype.hasOwnProperty.call(validCodes, t) ? t : "";
  }

  // quiz.html?slugs=a,b,c → 중복 제거·형식 검증·최대 max개. known(Set 또는 객체)이 있으면 그 안의 것만.
  function parseSlugsParam(raw, known, max) {
    max = max || 50;
    const out = [];
    const seen = new Set();
    for (const s of String(raw || "").split(",")) {
      const slug = s.trim();
      if (!slug || seen.has(slug) || !/^[\w\-.%]+$/.test(slug)) continue;
      if (known && !(known instanceof Set ? known.has(slug) : known[slug])) continue;
      seen.add(slug);
      out.push(slug);
      if (out.length >= max) break;
    }
    return out;
  }

  // 인기 순(pop 오름차순, pop 없는 용어는 뒤) — 같으면 원래 순서.
  function byPriority(terms) {
    return terms
      .map((t, i) => ({ t, i }))
      .sort((a, b) => {
        const pa = a.t.pop || Infinity, pb = b.t.pop || Infinity;
        if (pa !== pb) return pa < pb ? -1 : 1;
        return a.i - b.i;
      })
      .map((x) => x.t);
  }

  // 선수 용어를 먼저 놓는 위상 정렬. 같은 목록 안의 선수만 고려하고, 우선순위(인기) 순을 안정적으로 유지.
  // 순환은 스택으로 끊는다.
  function topoOrder(terms) {
    const ordered = byPriority(terms);
    const bySlug = new Map(ordered.map((t) => [t.slug, t]));
    const seen = new Set();
    const out = [];
    function visit(t, stack) {
      if (seen.has(t.slug) || stack.has(t.slug)) return;
      stack.add(t.slug);
      for (const p of t.prerequisites || []) {
        const pt = bySlug.get(p);
        if (pt) visit(pt, stack);
      }
      stack.delete(t.slug);
      if (!seen.has(t.slug)) { seen.add(t.slug); out.push(t); }
    }
    for (const t of ordered) visit(t, new Set());
    return out;
  }

  // 분야 용어 → 입문/중급/심화 3단계. 단계당 perStage개, 전체 totalCap개(인기순으로 뽑고 단계 안은 선수 순).
  function selectRoadmap(terms, opts) {
    opts = opts || {};
    const perStage = opts.perStage || 17;
    const totalCap = opts.totalCap || 50;
    const names = { 1: "입문", 2: "중급", 3: "심화" };
    let room = totalCap;
    const stages = [];
    for (const level of [1, 2, 3]) {
      const mine = byPriority(terms.filter((t) => t.level === level));
      const take = mine.slice(0, Math.min(perStage, room));
      room -= take.length;
      if (take.length) stages.push({ level, name: names[level], terms: topoOrder(take), available: mine.length });
    }
    return stages;
  }

  function progressOf(terms, doneSet) {
    const total = terms.length;
    const done = terms.filter((t) => doneSet.has(t.slug)).length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  // 첫 번째 미완료 용어(단계 순서 → 단계 내 순서). 전부 끝났으면 null.
  function nextTerm(stages, doneSet) {
    for (const s of stages) for (const t of s.terms) if (!doneSet.has(t.slug)) return { term: t, stage: s };
    return null;
  }

  // 기본으로 펼칠 단계 = 첫 미완료 단계의 level. 전부 끝났으면 0.
  function firstOpenLevel(stages, doneSet) {
    for (const s of stages) if (s.terms.some((t) => !doneSet.has(t.slug))) return s.level;
    return 0;
  }

  return { parseFieldHash, parseSlugsParam, byPriority, topoOrder, selectRoadmap, progressOf, nextTerm, firstOpenLevel };
});
