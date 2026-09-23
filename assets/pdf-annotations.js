// Storage layer for PDF viewer highlights/memos.
// Logged-in users persist to Supabase (tg_pdf_annotations); anonymous users
// fall back to localStorage keyed by the document's content hash.
import { supabase, getSession } from "./auth.js";

const LOCAL_PREFIX = "tg-pdf-annotations:";

function localKey(docHash) {
  return LOCAL_PREFIX + docHash;
}

function readLocal(docHash) {
  try {
    const raw = localStorage.getItem(localKey(docHash));
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error(err);
    return [];
  }
}

// 성공 여부를 돌려준다 — 메모 저장 실패는 사용자에게 보여야 하는 실패다
// (5단계 "무음 실패 0"). 호출부가 false 를 받으면 #pdf-status 에 문구를 띄운다.
function writeLocal(docHash, list) {
  try {
    localStorage.setItem(localKey(docHash), JSON.stringify(list));
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function rowToAnnotation(row) {
  return {
    id: row.id,
    page: row.page,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    quoteText: row.quote_text,
    color: row.color,
    note: row.note || "",
    createdAt: row.created_at,
  };
}

function makeLocalId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function loadAnnotations(docHash) {
  const session = await getSession();
  if (session) {
    const { data, error } = await supabase
      .from("tg_pdf_annotations")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("doc_hash", docHash)
      .order("page", { ascending: true })
      .order("start_offset", { ascending: true });
    // 조용히 빈 목록을 돌려주면 "메모가 사라졌다"로 보인다. 호출부가 문구를
    // 띄울 수 있도록 던진다(5단계 "무음 실패 0").
    if (error) {
      console.error(error);
      throw new Error("annotations-load-failed");
    }
    return data.map(rowToAnnotation);
  }
  return readLocal(docHash);
}

export async function createAnnotation(docHash, docTitle, annotation) {
  const session = await getSession();
  if (session) {
    const { data, error } = await supabase
      .from("tg_pdf_annotations")
      .insert({
        user_id: session.user.id,
        doc_hash: docHash,
        doc_title: docTitle || null,
        page: annotation.page,
        start_offset: annotation.startOffset,
        end_offset: annotation.endOffset,
        quote_text: annotation.quoteText,
        color: annotation.color,
        note: annotation.note || null,
      })
      .select()
      .single();
    if (error) {
      console.error(error);
      return null;
    }
    return rowToAnnotation(data);
  }

  const list = readLocal(docHash);
  const record = {
    id: makeLocalId(),
    page: annotation.page,
    startOffset: annotation.startOffset,
    endOffset: annotation.endOffset,
    quoteText: annotation.quoteText,
    color: annotation.color,
    note: annotation.note || "",
    createdAt: new Date().toISOString(),
    v: 2, // 읽기 모드 페이지 텍스트 기준 오프셋
  };
  list.push(record);
  if (!writeLocal(docHash, list)) return null;
  return record;
}

export async function updateAnnotationNote(docHash, id, note) {
  const session = await getSession();
  if (session) {
    const { error } = await supabase
      .from("tg_pdf_annotations")
      .update({ note, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", session.user.id)
      // doc_hash 까지 걸어 둔다 — 문서를 빠르게 갈아타면 이전 문서의 갱신이
      // 늦게 도착할 수 있는데, 그때 남의 문서 행을 건드리지 않게 하는 안전장치.
      .eq("doc_hash", docHash);
    if (error) {
      console.error(error);
      return false;
    }
    return true;
  }
  const list = readLocal(docHash);
  const item = list.find((a) => a.id === id);
  if (!item) return false;
  item.note = note;
  return writeLocal(docHash, list);
}

// 앵커 재탐색(읽기 모드 이전·텍스트 추출 규칙 변경)으로 오프셋이 바뀐 것을
// 다시 저장한다. 스키마는 그대로다 — 옛 레코드도 page/offset/quote 칸을 이미
// 갖고 있고, 바뀌는 건 그 안의 값뿐이라 마이그레이션 SQL 이 필요 없다.
// 로컬 레코드에는 `v: 2` 를 같이 남겨 "읽기 모드 좌표"임을 표시한다.
export async function updateAnnotationAnchor(docHash, id, anchor) {
  const session = await getSession();
  if (session) {
    const { error } = await supabase
      .from("tg_pdf_annotations")
      .update({
        page: anchor.page,
        start_offset: anchor.startOffset,
        end_offset: anchor.endOffset,
        quote_text: anchor.quoteText,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", session.user.id)
      // doc_hash 까지 걸어 둔다 — 문서를 빠르게 갈아타면 이전 문서의 갱신이
      // 늦게 도착할 수 있는데, 그때 남의 문서 행을 건드리지 않게 하는 안전장치.
      .eq("doc_hash", docHash);
    if (error) {
      console.error(error);
      return false;
    }
    return true;
  }
  const list = readLocal(docHash);
  const item = list.find((a) => a.id === id);
  if (!item) return false;
  item.page = anchor.page;
  item.startOffset = anchor.startOffset;
  item.endOffset = anchor.endOffset;
  item.quoteText = anchor.quoteText;
  item.v = 2;
  writeLocal(docHash, list);
  return true;
}

export async function deleteAnnotation(docHash, id) {
  const session = await getSession();
  if (session) {
    const { error } = await supabase
      .from("tg_pdf_annotations")
      .delete()
      .eq("id", id)
      .eq("user_id", session.user.id)
      // doc_hash 까지 걸어 둔다 — 문서를 빠르게 갈아타면 이전 문서의 갱신이
      // 늦게 도착할 수 있는데, 그때 남의 문서 행을 건드리지 않게 하는 안전장치.
      .eq("doc_hash", docHash);
    if (error) {
      console.error(error);
      return false;
    }
    return true;
  }
  return writeLocal(docHash, readLocal(docHash).filter((a) => a.id !== id));
}
