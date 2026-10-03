// assets/track.js — GA4 행동 이벤트 도우미.
// window.trackEvent(name, params): gtag가 있을 때만 보내고 절대 예외를 던지지 않는다.
// 문자열 값은 100자로 자르고, 이메일 모양이 들어 있으면 그 값은 버린다.
// 논문 본문·파일명 같은 자유 텍스트는 호출하는 쪽에서 아예 넘기지 않는다.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.trackEvent = api.trackEvent;
    root.trackNoResult = api.trackNoResult;
    // track.js가 늦게 로드되기 전에 쌓인 호출을 비운다.
    const q = root.__trackQueue;
    if (Array.isArray(q)) {
      root.__trackQueue = null;
      q.forEach((a) => api[a[0]].apply(null, a[1]));
    }
  }
})(typeof window !== "undefined" ? window : null, function (root) {
  const MAX_STR = 100;
  const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

  function sanitizeParams(params) {
    const out = {};
    if (!params || typeof params !== "object") return out;
    let n = 0;
    for (const k of Object.keys(params)) {
      if (n >= 20) break;
      let v = params[k];
      if (typeof v === "string") {
        if (EMAIL_RE.test(v)) continue;
        v = v.slice(0, MAX_STR);
      } else if (typeof v === "number") {
        if (!Number.isFinite(v)) continue;
      } else if (typeof v !== "boolean") {
        continue;
      }
      out[String(k).slice(0, 40)] = v;
      n++;
    }
    return out;
  }

  function trackEvent(name, params) {
    try {
      const g = root ? root.gtag : (typeof globalThis !== "undefined" ? globalThis.gtag : null);
      if (typeof g !== "function" || !name) return;
      g("event", String(name).slice(0, 40), sanitizeParams(params));
    } catch (e) { /* 분석 실패가 화면 동작을 막으면 안 된다 */ }
  }

  // search_no_result: 입력이 1.2초 멈췄을 때 결과가 없고(2자 이상),
  // 같은 검색어를 한 페이지 조회에서 두 번 보내지 않는다.
  const sentTerms = new Set();
  let timer = null;
  const IDLE_MS = 1200;

  function trackNoResult(term, source, resultCount) {
    try {
      clearTimeout(timer);
      timer = null;
      if (resultCount !== 0) return;
      const t = String(term || "").trim().toLowerCase().slice(0, 60);
      if (t.length < 2 || sentTerms.has(t + "|" + source)) return;
      timer = setTimeout(() => {
        timer = null;
        const key = t + "|" + source;
        if (sentTerms.has(key)) return;
        sentTerms.add(key);
        trackEvent("search_no_result", { search_term: t, source });
      }, IDLE_MS);
    } catch (e) { /* ignore */ }
  }

  function _reset() {
    sentTerms.clear();
    clearTimeout(timer);
    timer = null;
  }

  return { trackEvent, trackNoResult, sanitizeParams, _reset, IDLE_MS };
});
