const test = require("node:test");
const assert = require("node:assert");

const storage = require("../assets/viewer-storage.js");

test("byteLength: 한글은 UTF-8 3바이트로 센다", () => {
  assert.strictEqual(storage.byteLength("abc"), 3);
  assert.strictEqual(storage.byteLength("가나다"), 9);
  assert.strictEqual(storage.byteLength(null), 0);
});

test("shouldStoreText: 빈 텍스트·공백만 있는 텍스트는 저장하지 않는다", () => {
  assert.strictEqual(storage.shouldStoreText(""), false);
  assert.strictEqual(storage.shouldStoreText("   \n\t "), false);
  assert.strictEqual(storage.shouldStoreText(undefined), false);
  assert.strictEqual(storage.shouldStoreText("논문 초록"), true);
});

test("shouldStoreText: 200KB 상한을 넘으면 저장을 생략한다", () => {
  const limit = storage.MAX_TEXT_BYTES;
  assert.strictEqual(storage.shouldStoreText("a".repeat(limit)), true);
  assert.strictEqual(storage.shouldStoreText("a".repeat(limit + 1)), false);
  // 한글은 3바이트라 문자 수가 훨씬 적어도 상한에 걸린다
  assert.strictEqual(storage.shouldStoreText("가".repeat(Math.floor(limit / 3) + 1)), false);
});

test("serializeTextRecord/parseTextRecord 왕복", () => {
  const raw = storage.serializeTextRecord("유의확률(p-value)", 1700000000000);
  const rec = storage.parseTextRecord(raw);
  assert.strictEqual(rec.text, "유의확률(p-value)");
  assert.strictEqual(rec.savedAt, 1700000000000);
});

test("parseTextRecord: 손상된 값·빈 텍스트는 null", () => {
  assert.strictEqual(storage.parseTextRecord(null), null);
  assert.strictEqual(storage.parseTextRecord(""), null);
  assert.strictEqual(storage.parseTextRecord("{not json"), null);
  assert.strictEqual(storage.parseTextRecord("{}"), null);
  assert.strictEqual(storage.parseTextRecord(JSON.stringify({ text: "  " })), null);
  assert.strictEqual(storage.parseTextRecord(JSON.stringify({ text: 42 })), null);
});

test("parseTextRecord: savedAt 이 없거나 숫자가 아니면 null 로 정규화", () => {
  const rec = storage.parseTextRecord(JSON.stringify({ text: "본문", savedAt: "어제" }));
  assert.strictEqual(rec.text, "본문");
  assert.strictEqual(rec.savedAt, null);
});

test("buildDocRecord: docHash 키와 메타데이터를 만든다", () => {
  const fakeFile = { name: "paper.pdf", size: 12345, type: "application/pdf" };
  const rec = storage.buildDocRecord(fakeFile, "abc123", 1700000000000);
  assert.strictEqual(rec.id, "abc123");
  assert.strictEqual(rec.blob, fakeFile);
  assert.strictEqual(rec.name, "paper.pdf");
  assert.strictEqual(rec.size, 12345);
  assert.strictEqual(rec.docHash, "abc123");
  assert.strictEqual(rec.savedAt, 1700000000000);
});

test("buildDocRecord: 파일명·크기가 없어도 배너에 쓸 값이 나온다", () => {
  const rec = storage.buildDocRecord(null, null);
  assert.strictEqual(rec.name, "document.pdf");
  assert.strictEqual(rec.size, 0);
  assert.strictEqual(rec.type, "application/pdf");
  assert.strictEqual(rec.docHash, null);
  assert.ok(typeof rec.savedAt === "number");
});

test("formatSize: 사람이 읽는 단위", () => {
  assert.strictEqual(storage.formatSize(0), "0B");
  assert.strictEqual(storage.formatSize(512), "512B");
  assert.strictEqual(storage.formatSize(2048), "2KB");
  assert.strictEqual(storage.formatSize(3 * 1024 * 1024), "3.0MB");
});

test("IndexedDB 미지원 환경에서도 조용히 실패한다", async () => {
  // node 에는 indexedDB 가 없다 — 프라이빗 모드/차단과 같은 경로.
  assert.strictEqual(await storage.loadDocument(), null);
  assert.deepStrictEqual(await storage.saveDocument({ name: "a.pdf", size: 1 }, "h"), {
    ok: false,
    reason: "unsupported",
  });
  assert.deepStrictEqual(await storage.listDocuments(), []);
  assert.strictEqual(await storage.clearDocument(), false);
});

test("localStorage 가 없어도 텍스트 저장/복원이 예외를 던지지 않는다", () => {
  assert.deepStrictEqual(storage.saveText("본문"), { ok: false, reason: "error" });
  assert.strictEqual(storage.loadText(), null);
  assert.doesNotThrow(() => storage.clearText());
});

test("toFile: 레코드가 비어 있으면 null", () => {
  assert.strictEqual(storage.toFile(null), null);
  assert.strictEqual(storage.toFile({ name: "a.pdf" }), null);
});
