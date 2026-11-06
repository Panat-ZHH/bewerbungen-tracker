// Supabase access for "Meine Dokumente" and per-application attachments.
// Table public.cvs holds the document rows (kind column), private bucket "cvs" holds the files, owner-only via RLS.
import { supabase } from "@/lib/supabase";
import { safeFileName, validateDocumentFile } from "@/lib/documents-core";
import type { CV, DocumentKind } from "@/types";

async function userId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You must be signed in.");
  return data.user.id;
}

type Row = { id: string; name: string; type: CV["type"]; kind?: DocumentKind; description: string; updated_at: string; status: CV["status"]; file_name?: string; storage_path?: string; file_type?: string; file_size?: number };
const fromRow = (row: Row): CV => ({ id: row.id, name: row.name, type: row.type, kind: row.kind ?? "lebenslauf", description: row.description, updatedAt: row.updated_at, status: row.status, fileName: row.file_name ?? undefined, storagePath: row.storage_path ?? undefined, fileType: row.file_type ?? undefined, fileSize: row.file_size ?? undefined });

function dbError(error: { code?: string; message?: string }) {
  return Object.assign(new Error(`Database error: ${[error.code, error.message].filter(Boolean).join(" | ")}`), { code: error.code });
}

export async function listDocuments(): Promise<CV[]> {
  const uid = await userId();
  const { data, error } = await supabase.from("cvs").select("*").eq("user_id", uid).order("updated_at", { ascending: false });
  if (error) throw dbError(error);
  return ((data ?? []) as Row[]).filter((row) => row.storage_path).map(fromRow);
}

/** Validates, uploads to <uid>/<docId>/<name> and creates the row. */
export async function addDocument(kind: DocumentKind, file: File, title?: string): Promise<CV> {
  const problem = validateDocumentFile(file, kind);
  if (problem) throw new Error(problem);
  const uid = await userId();
  const id = `doc-${uid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const path = `${uid}/${id}/${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("cvs").upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (uploadError) throw dbError(uploadError);
  const { data, error } = await supabase.from("cvs").insert({
    id, user_id: uid, name: (title || file.name).trim().slice(0, 120), type: "other", kind, description: "",
    updated_at: new Date().toISOString().slice(0, 10), status: "Ready", file_name: file.name, storage_path: path, file_type: file.type, file_size: file.size,
  }).select("*").single();
  if (error) { await supabase.storage.from("cvs").remove([path]); throw dbError(error); }
  return fromRow(data as Row);
}

export async function renameDocument(id: string, name: string): Promise<void> {
  const uid = await userId();
  const { error } = await supabase.from("cvs").update({ name: name.trim().slice(0, 120), updated_at: new Date().toISOString().slice(0, 10) }).eq("id", id).eq("user_id", uid);
  if (error) throw dbError(error);
}

export async function removeDocument(doc: CV): Promise<void> {
  const uid = await userId();
  if (doc.storagePath) {
    const { error: fileError } = await supabase.storage.from("cvs").remove([doc.storagePath]);
    if (fileError) throw dbError(fileError);
  }
  const { error } = await supabase.from("cvs").delete().eq("id", doc.id).eq("user_id", uid);
  if (error) throw dbError(error);
}

export async function documentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("cvs").createSignedUrl(path, 60 * 10);
  if (error) throw dbError(error);
  return data.signedUrl;
}

export async function listAttachedDocumentIds(applicationId: string): Promise<string[]> {
  const uid = await userId();
  const { data, error } = await supabase.from("application_documents").select("document_id").eq("application_id", applicationId).eq("user_id", uid);
  if (error) throw dbError(error);
  return (data ?? []).map((row: { document_id: string }) => row.document_id);
}

export async function attachDocument(applicationId: string, documentId: string): Promise<void> {
  const uid = await userId();
  const { error } = await supabase.from("application_documents").upsert({ application_id: applicationId, document_id: documentId, user_id: uid }, { onConflict: "application_id,document_id" });
  if (error) throw dbError(error);
}

export async function detachDocument(applicationId: string, documentId: string): Promise<void> {
  const uid = await userId();
  const { error } = await supabase.from("application_documents").delete().eq("application_id", applicationId).eq("document_id", documentId).eq("user_id", uid);
  if (error) throw dbError(error);
}
