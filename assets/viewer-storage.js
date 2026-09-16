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
  // 최근 1개만 보관하므로 키를 고정한다(새 업로드 = 덮어쓰기).
  var DOC_ID = "last";

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
  function buildDocRecord(file, docHash, savedAt) {
    return {
      id: DOC_ID,
      blob: file,
      name: (file && file.name) || "document.pdf",
      size: (file && file.size) || 0,
      type: (file && file.type) || "application/pdf",
      docHash: docHash || null,
      savedAt: savedAt || Date.now(),
    };
  }

  function formatSize(bytes) {
    if (!bytes || bytes < 1024) return (bytes || 0) + "B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + "KB";
    return (bytes / (1024 * 1024)).toFixed(1) + "MB";
  }

  // ---------- localStorage (텍스트 모드) ----------

  function saveText(text) {
    try {
      if (!shouldStoreText(text)) {
        localStorage.removeItem(TEXT_KEY);
        return false;
      }
      localStorage.setItem(TEXT_KEY, serializeTextRecord(text));
      return true;
    } catch (err) {
      return false;
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

  // 최근 1개만 유지: put 이 같은 키를 덮어쓰므로 별도 정리가 필요 없다.
  function saveDocument(file, docHash) {
    var record = buildDocRecord(file, docHash);
    return withStore("readwrite", function (store) { return store.put(record); })
      .then(function () { return true; })
      .catch(function () { return false; }); // QuotaExceeded·미지원 모두 조용히 무시
  }

  function loadDocument() {
    return withStore("readonly", function (store) { return store.get(DOC_ID); })
      .then(function (rec) {
        if (!rec || !rec.blob) return null;
        return rec;
      })
      .catch(function () { return null; });
  }

  function clearDocument() {
    return withStore("readwrite", function (store) { return store.delete(DOC_ID); })
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
