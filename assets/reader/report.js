// "뜻이 틀려요" 신고. 용어 카드에서 누르면 term_reports 에 한 줄을 보낸다.
//  - 보내는 것: 용어 slug, 문서에 나온 표기, 그 자리 앞뒤 글 약 100자(PDF 글에서 잘라 냄), 용어의 분야 코드, 이 화면 주소(쿼리·해시 제외).
//  - 이메일·이름은 보내지 않는다. 로그인 상태면 서버가 계정 식별자만 user_id 로 붙인다.
// 순수 부분(Node 테스트 대상): buildPayload, contextAround, createReportGuard.
(function (root) {
  "use strict";

  var CAP = { slug: 200, surface: 200, context: 400, doc_field: 50, reason: 50, page_url: 300 };
  var WINDOW = 100; // 표기 앞뒤로 가져올 글자 수

  function clip(v, n) {
    if (v === undefined || v === null) return null;
    var s = String(v).replace(/\s+/g, " ").trim();
    return s ? s.slice(0, n) : null;
  }

  // text 의 [start, end) 자리 앞뒤 WINDOW 자를 잘라 낸다. 자리가 없으면 null.
  function contextAround(text, start, end) {
    if (typeof text !== "string" || !(start >= 0) || !(end > start) || start >= text.length) return null;
    return clip(text.slice(Math.max(0, start - WINDOW), Math.min(text.length, end + WINDOW)), CAP.context);
  }

  // info: {slug, surface, text, start, end, docField, reason, pageUrl}
  function buildPayload(info) {
    var i = info || {};
    var surface = i.surface;
    if (!surface && typeof i.text === "string" && i.end > i.start) surface = i.text.slice(i.start, i.end);
    return {
      slug: clip(i.slug, CAP.slug) || "",
      surface: clip(surface, CAP.surface),
      context: contextAround(i.text, i.start, i.end),
      doc_field: clip(i.docField, CAP.doc_field),
      reason: clip(i.reason, CAP.reason),
      page_url: clip(i.pageUrl, CAP.page_url),
    };
  }

  // 같은 용어·같은 쪽은 한 번만 보낸다(세션 안). store 는 sessionStorage 같은 getItem/setItem 객체(없으면 메모리만).
  function createReportGuard(store) {
    var KEY = "termReportsSent";
    var mem = new Set();
    try { (store ? JSON.parse(store.getItem(KEY) || "[]") : []).forEach(function (k) { mem.add(k); }); } catch (e) { /* 무시 */ }
    function save() {
      try { if (store) store.setItem(KEY, JSON.stringify(Array.from(mem))); } catch (e) { /* 무시 */ }
    }
    return {
      sent: function (slug, page) { return mem.has(slug + "@" + page); },
      mark: function (slug, page) { mem.add(slug + "@" + page); save(); },
      unmark: function (slug, page) { mem.delete(slug + "@" + page); save(); },
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildPayload: buildPayload, contextAround: contextAround, createReportGuard: createReportGuard, CAP: CAP };
  }
  if (typeof document === "undefined") return;

  var guard;
  try { guard = createReportGuard(root.sessionStorage); } catch (e) { guard = createReportGuard(null); }

  async function send(payload) {
    var auth = await import("../auth.js");
    var res = await auth.supabase.from("term_reports").insert(payload);
    if (res.error) throw res.error;
  }

  root.ReaderReport = {
    isSent: guard.sent,
    // info 는 buildPayload 와 같다. page 는 중복 방지 키. 성공하면 true, 실패하면 false.
    submit: async function (info, page) {
      var p = buildPayload(info);
      if (!p.slug) return false;
      if (guard.sent(p.slug, page)) return true;
      guard.mark(p.slug, page); // 누르자마자 막아 두 번 보내지 않는다
      try { await send(p); return true; } catch (err) { guard.unmark(p.slug, page); console.error("[term report]", err); return false; }
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
