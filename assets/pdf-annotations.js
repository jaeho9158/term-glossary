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

function writeLocal(docHash, list) {
  try {
    localStorage.setItem(localKey(docHash), JSON.stringify(list));
  } catch (err) {
    console.error(err);
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
    if (error) {
      console.error(error);
      return [];
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
  };
  list.push(record);
  writeLocal(docHash, list);
  return record;
}

export async function updateAnnotationNote(docHash, id, note) {
  const session = await getSession();
  if (session) {
    const { error } = await supabase
      .from("tg_pdf_annotations")
      .update({ note, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", session.user.id);
    if (error) console.error(error);
    return;
  }
  const list = readLocal(docHash);
  const item = list.find((a) => a.id === id);
  if (item) {
    item.note = note;
    writeLocal(docHash, list);
  }
}

export async function deleteAnnotation(docHash, id) {
  const session = await getSession();
  if (session) {
    const { error } = await supabase
      .from("tg_pdf_annotations")
      .delete()
      .eq("id", id)
      .eq("user_id", session.user.id);
    if (error) console.error(error);
    return;
  }
  const list = readLocal(docHash).filter((a) => a.id !== id);
  writeLocal(docHash, list);
}
