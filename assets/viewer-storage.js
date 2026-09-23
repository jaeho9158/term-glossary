// 논문 뷰어 작업 내용 유지(새로고침·재방문 시 복원) 전용 저장 계층.
//
// viewer.js 는 <script src> 로 읽히는 비모듈 스크립트라 여기서도 같은 방식으로
// window.ViewerStorage 에 전역 노출한다(node 테스트를 위해 module.exports 도 함께).
//
// 저장 실패는 전부 조용히 삼킨다. 프라이빗 모드·스토리지 차단·QuotaExceeded 는
// "복원 기능만 안 되는" 상황이지 뷰어 자체가 망가질 이유는 아니기 때문이다.
// 기존 HIDDEN_TERMS_KEY 의 try/catch 패턴과 같은 취지.
(function (root) {
  "use strict";

  var TEXT_KEY = "viewerDraftText";
  // 200KB. localStorage 총량이 보통 5MB 안팎이라 한 문서가 그 이상을 차지하면
  // 다른 키(숨긴 용어·테마 등)까지 같이 죽는다. 상한을 넘으면 저장을 생략한다.
  var MAX_TEXT_BYTES = 200 * 1024;
  var DB_NAME = "tg-viewer";
  var DB_VERSION = 1;
  var STORE = "documents";
  // docHash 가 없던 시절의 고정 키. 지금은 docHash 를 키로 쓰고, 이 값은
  // 옛 레코드를 읽어 오는 경우와 해시 계산이 실패한 경우에만 남는다.
  var DOC_ID = "last";
  // 최근 문서 보관 개수. 한 편이 수 MB라 무제한으로 쌓으면 IndexedDB 할당량을
  // 금방 넘긴다. 넘치면 오래된 것부터 지운다(LRU).
  var MAX_RECENT_DOCS = 5;

  // ---------- 순수 로직 (테스트 대상) ----------

  // UTF-8 기준 바이트 수. 한국어 논문은 문자 수와 바이트 수가 3배까지 차이나서
  // length 로 상한을 재면 실제 용량을 크게 과소평가한다.
  function byteLength(text) {
    if (typeof text !== "string") return 0;
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    return Buffer.byteLength(text, "utf8");
  }

  function shouldStoreText(text) {
    if (typeof text !== "string") return false;
    if (text.trim().length === 0) return false;
    return byteLength(text) <= MAX_TEXT_BYTES;
  }

  function serializeTextRecord(text, savedAt) {
    return JSON.stringify({ v: 1, text: text, savedAt: savedAt || Date.now() });
  }

  // 손상된 값·구버전 포맷·빈 텍스트는 전부 "복원할 것 없음"(null)으로 취급한다.
  function parseTextRecord(raw) {
    if (!raw) return null;
    try {
      var rec = JSON.parse(raw);
      if (!rec || typeof rec.text !== "string" || rec.text.trim().length === 0) return null;
      return { text: rec.text, savedAt: typeof rec.savedAt === "number" ? rec.savedAt : null };
    } catch (err) {
      return null;
    }
  }

  // IndexedDB 에 넣기 전의 메타데이터 정규화. 파일명이 없거나 이상해도
  // 배너에 쓸 수 있는 문자열이 나오도록 한다.
  function buildDocRecord(file, docHash, savedAt, pageCount) {
    return {
      // 같은 문서를 다시 열면 덮어써야 하므로 내용 해시가 곧 키다.
      id: docHash || DOC_ID,
      blob: file,
      name: (file && file.name) || "document.pdf",
      size: (file && file.size) || 0,
      type: (file && file.type) || "application/pdf",
      docHash: docHash || null,
      pageCount: typeof pageCount === "number" ? pageCount : null,
      savedAt: savedAt || Date.now(),
    };
  }

  // 최신순 정렬 + 상한 초과분 분리. 실제 삭제는 호출부가 한다(테스트 가능하게 분리).
  function pruneRecentDocs(records, max) {
    var list = Array.isArray(records) ? records.slice() : [];
    list.sort(function (a, b) { return ((b && b.savedAt) || 0) - ((a && a.savedAt) || 0); });
    var limit = typeof max === "number" ? max : MAX_RECENT_DOCS;
    return { keep: list.slice(0, limit), drop: list.slice(limit) };
  }

  // "논문.pdf · 12쪽 · 3시간 전". 절대 시각은 목록에서 읽어도 와닿지 않아서
  // 상대 시각으로 쓴다.
  function formatRelativeTime(savedAt, now) {
    if (typeof savedAt !== "number") return null;
    var diff = Math.max(0, (now || Date.now()) - savedAt);
    var min = Math.floor(diff / 60000);
    if (min < 1) return "방금";
    if (min < 60) return min + "분 전";
    var hour = Math.floor(min / 60);
    if (hour < 24) return hour + "시간 전";
    return Math.floor(hour / 24) + "일 전";
  }

  function formatRecentLabel(record, now) {
    var parts = [(record && record.name) || "document.pdf"];
    if (record && typeof record.pageCount === "number" && record.pageCount > 0) {
      parts.push(record.pageCount + "쪽");
    }
    var rel = formatRelativeTime(record && record.savedAt, now);
    if (rel) parts.push(rel);
    return parts.join(" · ");
  }

  function formatSize(bytes) {
    if (!bytes || bytes < 1024) return (bytes || 0) + "B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + "KB";
    return (bytes / (1024 * 1024)).toFixed(1) + "MB";
  }

  // ---------- localStorage (텍스트 모드) ----------

  // 실패 사유를 돌려준다(5단계 "무음 실패 0"): 상한 초과("too-large")는
  // 사용자에게 알려야 하고, 프라이빗 모드 등은 알릴 필요가 없다.
  function saveText(text) {
    try {
      if (!shouldStoreText(text)) {
        localStorage.removeItem(TEXT_KEY);
        var tooLarge = typeof text === "string" && text.trim().length > 0;
        return { ok: false, reason: tooLarge ? "too-large" : "empty" };
      }
      localStorage.setItem(TEXT_KEY, serializeTextRecord(text));
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: failureReason(err) };
    }
  }

  function loadText() {
    try {
      return parseTextRecord(localStorage.getItem(TEXT_KEY));
    } catch (err) {
      return null;
    }
  }

  function clearText() {
    try {
      localStorage.removeItem(TEXT_KEY);
    } catch (err) {
      /* 지울 수 없으면 그대로 둔다 — 기능에는 영향 없음 */
    }
  }

  // ---------- IndexedDB (PDF 모드) ----------

  function openDb() {
    return new Promise(function (resolve, reject) {
      try {
        var idb = root.indexedDB;
        if (!idb) {
          reject(new Error("no-indexeddb"));
          return;
        }
        var req = idb.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error("open-failed")); };
        req.onblocked = function () { reject(new Error("blocked")); };
      } catch (err) {
        reject(err);
      }
    });
  }

  function withStore(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { db.close(); resolve(req && req.result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
        tx.onabort = function () { db.close(); reject(tx.error); };
      });
    });
  }

  // 실패 사유를 구분한다 — 5단계에서 "무음 실패 0" 이 목표라, 호출부가
  // 용량 초과인지 미지원인지에 따라 다른 문구를 띄운다.
  function failureReason(err) {
    if (!err) return "error";
    if (err.message === "no-indexeddb") return "unsupported";
    if (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED") return "quota";
    return "error";
  }

  // 목록에서 Blob 까지 들고 오면 5편 × 수 MB 를 메모리에 올리게 된다.
  // 목록 UI 에는 메타데이터만 필요하므로 blob 은 떼고 준다.
  function stripBlob(rec) {
    if (!rec) return null;
    return {
      id: rec.id, name: rec.name, size: rec.size, type: rec.type,
      docHash: rec.docHash, pageCount: rec.pageCount, savedAt: rec.savedAt,
    };
  }

  function listDocuments() {
    return withStore("readonly", function (store) { return store.getAll(); })
      .then(function (all) { return pruneRecentDocs(all, MAX_RECENT_DOCS).keep.map(stripBlob); })
      .catch(function () { return []; });
  }

  function deleteDocument(id) {
    return withStore("readwrite", function (store) { return store.delete(id); })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  // 저장 → 상한 초과분 정리. 용량 초과로 실패하면 오래된 것부터 지우고 한 번
  // 더 시도한다(그래도 안 되면 호출부가 문구를 띄운다).
  function saveDocument(file, docHash, pageCount) {
    var record = buildDocRecord(file, docHash, null, pageCount);
    function put() {
      return withStore("readwrite", function (store) { return store.put(record); });
    }
    return put()
      .then(function () { return pruneStore(record.id); })
      .then(function () { return { ok: true }; })
      .catch(function (err) {
        var reason = failureReason(err);
        if (reason !== "quota") return { ok: false, reason: reason };
        // 용량 초과 — 이 문서를 뺀 나머지 중 오래된 것부터 전부 비우고 재시도.
        return dropOldest(record.id)
          .then(put)
          .then(function () { return { ok: true, evicted: true }; })
          .catch(function (err2) { return { ok: false, reason: failureReason(err2) }; });
      });
  }

  // 방금 넣은 문서를 뺀 목록에서 상한 초과분을 지운다.
  function pruneStore(keepId) {
    return withStore("readonly", function (store) { return store.getAll(); }).then(function (all) {
      var drop = pruneRecentDocs(all, MAX_RECENT_DOCS).drop.filter(function (r) { return r && r.id !== keepId; });
      if (!drop.length) return true;
      return Promise.all(drop.map(function (r) { return deleteDocument(r.id); })).then(function () { return true; });
    });
  }

  // 용량이 이미 꽉 찬 상태. 이번 문서를 뺀 가장 오래된 것부터 지운다.
  function dropOldest(keepId) {
    return withStore("readonly", function (store) { return store.getAll(); }).then(function (all) {
      var sorted = pruneRecentDocs(all, MAX_RECENT_DOCS).keep
        .concat(pruneRecentDocs(all, MAX_RECENT_DOCS).drop)
        .filter(function (r) { return r && r.id !== keepId; })
        .reverse(); // 오래된 것부터
      if (!sorted.length) return true;
      return deleteDocument(sorted[0].id);
    });
  }

  // 인자가 없으면 "가장 최근 1개"(옛 동작). id 를 주면 그 문서.
  function loadDocument(id) {
    if (id) {
      return withStore("readonly", function (store) { return store.get(id); })
        .then(function (rec) { return rec && rec.blob ? rec : null; })
        .catch(function () { return null; });
    }
    return withStore("readonly", function (store) { return store.getAll(); })
      .then(function (all) {
        var keep = pruneRecentDocs(all, 1).keep[0];
        return keep && keep.blob ? keep : null;
      })
      .catch(function () { return null; });
  }

  function clearDocument(id) {
    if (id) return deleteDocument(id);
    return withStore("readwrite", function (store) { return store.clear(); })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  // 저장된 Blob 을 다시 File 로 만들어 준다. 업로드 경로가 file.name/file.size 를
  // 쓰기 때문에, 복원 경로도 같은 함수에 그대로 넘길 수 있어야 한다.
  function toFile(record) {
    if (!record || !record.blob) return null;
    try {
      return new File([record.blob], record.name, { type: record.type || "application/pdf" });
    } catch (err) {
      return record.blob; // File 생성자 미지원 환경 — Blob 그대로도 arrayBuffer() 는 된다
    }
  }

  var api = {
    TEXT_KEY: TEXT_KEY,
    MAX_TEXT_BYTES: MAX_TEXT_BYTES,
    DB_NAME: DB_NAME,
    STORE: STORE,
    DOC_ID: DOC_ID,
    MAX_RECENT_DOCS: MAX_RECENT_DOCS,
    pruneRecentDocs: pruneRecentDocs,
    formatRelativeTime: formatRelativeTime,
    formatRecentLabel: formatRecentLabel,
    listDocuments: listDocuments,
    deleteDocument: deleteDocument,
    byteLength: byteLength,
    shouldStoreText: shouldStoreText,
    serializeTextRecord: serializeTextRecord,
    parseTextRecord: parseTextRecord,
    buildDocRecord: buildDocRecord,
    formatSize: formatSize,
    saveText: saveText,
    loadText: loadText,
    clearText: clearText,
    saveDocument: saveDocument,
    loadDocument: loadDocument,
    clearDocument: clearDocument,
    toFile: toFile,
  };

  root.ViewerStorage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
