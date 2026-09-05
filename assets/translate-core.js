// assets/translate-core.js — PDF 번역 기능의 순수 로직.
//
// 모델 응답이 어떻든 결정론적으로 동작해야 하는 부분만 모았다. DOM·네트워크 없음.
// quiz-core.js와 같은 패턴: 브라우저에서는 전역 TranslateCore, Node에서는 module.exports.
(function (root) {
  // 선택 번역 입력 상한. 상한을 넘으면 마지막 문장 경계까지 후퇴해 자른다 —
  // 문장 중간에서 잘리면 번역이 앞뒤 없이 뭉개진다.
  function truncateSelection(text, max = 2000) {
    const s = String(text || "").trim();
    if (s.length <= max) return s;
    const head = s.slice(0, max);
    // 마지막 문장 종결 부호 위치를 찾는다. 상한의 절반보다 앞이면 문장이 너무 길어
    // 후퇴가 의미 없으니 그냥 상한에서 자른다.
    const lastEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "), head.lastIndexOf(".\n"));
    if (lastEnd >= max / 2) return head.slice(0, lastEnd + 1);
    return head;
  }

  // 라틴 문자 비율로 영어 여부를 판정한다. 한글 논문을 번역기에 넣는 헛수고를 막는 용도라
  // 정밀할 필요는 없고, 영문 논문 안의 짧은 한글 인용에 흔들리지 않으면 된다.
  function isLikelyEnglish(text) {
    const s = String(text || "");
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    const hangul = (s.match(/[가-힣]/g) || []).length;
    const letters = latin + hangul;
    if (letters < 20) return false;
    return latin / letters >= 0.6;
  }

  // 앞 페이지에서 확정된 역어를 유지한다. 뒤 페이지가 다른 역어를 제안해도
  // 먼저 것을 지킨다 — 문서 안에서 같은 용어가 두 이름으로 흔들리는 것을 막는다.
  function mergeGlossary(base, incoming) {
    const out = {};
    for (const src of [base, incoming]) {
      if (!src || typeof src !== "object") continue;
      for (const [k, v] of Object.entries(src)) {
        if (typeof v !== "string" || !v.trim()) continue;
        if (!(k in out)) out[k] = v;
      }
    }
    return out;
  }

  // 번역문 안의 사전 용어를 링크로 감싼다. matches는 viewer.js matchTerms 결과.
  // 겹치는 매치는 시작이 빠른 것, 같은 시작이면 긴 것을 남긴다(뷰어 하이라이트와 같은 규칙).
  function linkTerms(text, matches, escapeHtml, hrefPrefix = "terms/") {
    const src = String(text || "");
    const spans = [];
    for (const m of matches || []) {
      const occ = m.occurrences && m.occurrences.length
        ? m.occurrences
        : (m.firstStart >= 0 ? [{ start: m.firstStart, length: m.firstLength }] : []);
      for (const o of occ) if (o.start >= 0) spans.push({ slug: m.slug, start: o.start, length: o.length });
    }
    spans.sort((a, b) => a.start - b.start || b.length - a.length);

    let html = "";
    let cursor = 0;
    for (const sp of spans) {
      if (sp.start < cursor) continue; // 앞 스팬과 겹침 → 버림
      html += escapeHtml(src.slice(cursor, sp.start));
      const word = src.slice(sp.start, sp.start + sp.length);
      html += `<a href="${hrefPrefix}${sp.slug}.html" class="tr-term" target="_blank" rel="noopener">${escapeHtml(word)}</a>`;
      cursor = sp.start + sp.length;
    }
    html += escapeHtml(src.slice(cursor));
    return html;
  }

  const api = { truncateSelection, isLikelyEnglish, mergeGlossary, linkTerms };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TranslateCore = api;
})(typeof window !== "undefined" ? window : globalThis);
