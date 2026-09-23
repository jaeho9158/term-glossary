const test = require("node:test");
const assert = require("node:assert");

const storage = require("../assets/viewer-storage.js");

function rec(id, savedAt) {
  return { id: id, name: id + ".pdf", savedAt: savedAt, size: 1024, pageCount: 10 };
}

test("MAX_RECENT_DOCS 는 5", () => {
  assert.strictEqual(storage.MAX_RECENT_DOCS, 5);
});

test("pruneRecentDocs: 최신순으로 정렬하고 상한을 넘는 것만 버린다", () => {
  const list = [rec("a", 100), rec("b", 500), rec("c", 300)];
  const { keep, drop } = storage.pruneRecentDocs(list, 2);
  assert.deepStrictEqual(keep.map((r) => r.id), ["b", "c"]);
  assert.deepStrictEqual(drop.map((r) => r.id), ["a"]);
});

test("pruneRecentDocs: 상한 이내면 버리는 것이 없다", () => {
  const { keep, drop } = storage.pruneRecentDocs([rec("a", 1), rec("b", 2)], 5);
  assert.deepStrictEqual(keep.map((r) => r.id), ["b", "a"]);
  assert.deepStrictEqual(drop, []);
});

test("pruneRecentDocs: savedAt 이 없으면 0 으로 보고 맨 뒤로 민다", () => {
  const { keep } = storage.pruneRecentDocs([{ id: "x" }, rec("y", 5)], 5);
  assert.deepStrictEqual(keep.map((r) => r.id), ["y", "x"]);
});

test("pruneRecentDocs: 빈 입력·잘못된 입력에도 터지지 않는다", () => {
  assert.deepStrictEqual(storage.pruneRecentDocs(null, 5), { keep: [], drop: [] });
  assert.deepStrictEqual(storage.pruneRecentDocs([], 5), { keep: [], drop: [] });
});

test("buildDocRecord: docHash 를 키로 쓰고 쪽수를 함께 저장한다", () => {
  const r = storage.buildDocRecord({ name: "논문.pdf", size: 2048, type: "application/pdf" }, "hash123", 42, 12);
  assert.strictEqual(r.id, "hash123");
  assert.strictEqual(r.docHash, "hash123");
  assert.strictEqual(r.name, "논문.pdf");
  assert.strictEqual(r.pageCount, 12);
  assert.strictEqual(r.savedAt, 42);
});

test("buildDocRecord: docHash 가 없으면 옛 고정 키로 떨어진다", () => {
  const r = storage.buildDocRecord(null, null, 1);
  assert.strictEqual(r.id, storage.DOC_ID);
  assert.strictEqual(r.name, "document.pdf");
});

test("formatRecentLabel: 파일명·쪽수·연 시각을 한 줄로", () => {
  const now = Date.UTC(2026, 0, 2, 0, 0, 0);
  assert.strictEqual(
    storage.formatRecentLabel(rec("a", now - 60 * 1000), now),
    "a.pdf · 10쪽 · 1분 전"
  );
  assert.strictEqual(
    storage.formatRecentLabel({ name: "b.pdf", savedAt: now - 3 * 3600 * 1000 }, now),
    "b.pdf · 3시간 전"
  );
  assert.strictEqual(
    storage.formatRecentLabel({ name: "c.pdf", savedAt: now - 2 * 86400 * 1000 }, now),
    "c.pdf · 2일 전"
  );
  assert.strictEqual(storage.formatRecentLabel({ name: "d.pdf" }, now), "d.pdf");
  assert.strictEqual(storage.formatRecentLabel({ savedAt: now }, now), "document.pdf · 방금");
});

test("clearDocument: 인자가 없으면 아무것도 지우지 않고 false", async () => {
  // 예전에는 전체 삭제로 떨어져서 오타 한 번에 최근 문서가 통째로 날아갔다.
  assert.strictEqual(await storage.clearDocument(), false);
  assert.strictEqual(typeof storage.clearAllDocuments, "function");
});

test("touchDocument: id 가 없거나 IndexedDB 가 없으면 false", async () => {
  assert.strictEqual(await storage.touchDocument(), false);
  assert.strictEqual(await storage.touchDocument("hash123"), false);
});
