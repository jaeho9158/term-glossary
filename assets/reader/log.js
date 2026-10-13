// 읽은 기록(로그인한 사용자)과 사용 통계(GA4)를 남긴다. 옛 뷰어(viewer.js)의 logPaperHistory / trackAnalyze 를 옮겼다.
//
//  - 기록: tg_reading_history 에 item_type "paper" 한 줄(history.html 이 목록으로 보여 준다). 로그인하지 않았으면 아무것도 하지 않는다.
//    제목은 PDF 면 "<파일 이름>...", 붙여넣은 글이면 "<글 앞 40자>...". 옛 코드와 같은 모양이다.
//  - 통계: viewer_analyze 이벤트. 출처(pdf / paste)와 용어 수 구간만 보낸다. 파일 이름·문서 제목·글 내용은 보내지 않는다.
//    분석이 글자를 칠 때마다 돌 수 있어 30초에 한 번만 보낸다.
// 순수 부분(Node 테스트 대상): termCountBucket, historyTitle, createThrottle.
(function (root) {
  "use strict";

  var THROTTLE_MS = 30000;

  function termCountBucket(count) {
    return count === 0 ? "0" : count <= 10 ? "1-10" : count <= 50 ? "11-50" : "50+";
  }

  // 기록에 남기는 제목. 파일 이름이 있으면 그것, 없으면 글 앞 40자.
  function historyTitle(fileName, text) {
    return fileName ? fileName + "..." : String(text || "").trim().slice(0, 40) + "...";
  }

  // 마지막으로 허용한 시각에서 ms 가 지났을 때만 true 를 돌려주는 함수를 만든다.
  function createThrottle(ms, clock) {
    var last = 0;
    var nowFn = clock || Date.now;
    return function () {
      var t = nowFn();
      if (t - last < ms) return false;
      last = t;
      return true;
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { termCountBucket: termCountBucket, historyTitle: historyTitle, createThrottle: createThrottle };
  }
  if (typeof document === "undefined") return;

  var allowAnalyze = createThrottle(THROTTLE_MS);

  function trackAnalyze(source, count) {
    if (!root.trackEvent || !allowAnalyze()) return;
    root.trackEvent("viewer_analyze", { source: source, term_count: termCountBucket(count) });
  }

  async function logPaperHistory(title) {
    try {
      var auth = await import("../auth.js");
      var session = await auth.getSession();
      if (!session) return;
      var key = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await auth.supabase.from("tg_reading_history").insert({
        user_id: session.user.id,
        item_type: "paper",
        item_key: key,
        item_title: title,
      });
    } catch (err) {
      // 기록은 논문을 보는 일의 부수 효과다. 오프라인·차단·세션 없음으로 실패해도 화면은 그대로 둔다.
      console.error("[logPaperHistory]", err);
    }
  }

  root.ReaderLog = {
    termCountBucket: termCountBucket,
    historyTitle: historyTitle,
    trackAnalyze: trackAnalyze,
    logPaperHistory: logPaperHistory,
    // 붙여넣은 글 분석이 끝났을 때(paste.js)
    pasteAnalyzed: function (text, count) {
      logPaperHistory(historyTitle("", text));
      trackAnalyze("paste", count);
    },
  };

  var readerEl = document.getElementById("reader");
  if (readerEl) {
    // 문서를 열 때마다 읽은 기록 한 줄(옛 뷰어는 PDF 분석이 끝날 때 한 번이었다).
    readerEl.addEventListener("reader:docopen", function (e) {
      var d = e.detail || {};
      logPaperHistory(historyTitle(d.fileName || (d.title ? d.title + ".pdf" : ""), ""));
    });
    // 용어 찾기가 끝나면 통계(출처 pdf, 용어 수 구간).
    readerEl.addEventListener("reader:termsready", function (e) {
      trackAnalyze("pdf", e.detail && typeof e.detail.count === "number" ? e.detail.count : 0);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
