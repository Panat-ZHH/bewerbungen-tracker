"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, FileText, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { addDocument, documentUrl, listDocuments, removeDocument } from "@/lib/documents";
import { DOCUMENT_KINDS, MAX_DOCUMENT_BYTES, formatBytes, validateDocumentFile } from "@/lib/documents-core";
import { friendlyMessage } from "@/lib/ux";
import { toast } from "@/lib/toast";
import type { CV, DocumentKind } from "@/types";

const accept = (kind: DocumentKind) => (kind === "foto" ? ".jpg,.jpeg,.png" : ".pdf,.jpg,.jpeg,.png");

export function DocumentLibrary() {
  const [docs, setDocs] = useState<CV[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<DocumentKind | "">("");
  const [toDelete, setToDelete] = useState<CV>();
  const [deleting, setDeleting] = useState(false);
  const inputs = useRef<Partial<Record<DocumentKind, HTMLInputElement | null>>>({});

  useEffect(() => {
    let active = true;
    listDocuments()
      .then((data) => { if (active) setDocs(data); })
      .catch((reason) => { if (active) setNotice(friendlyMessage(reason, "Deine Dokumente konnten nicht geladen werden.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function upload(kind: DocumentKind, file?: File) {
    if (!file) return;
    const problem = validateDocumentFile(file, kind);
    if (problem) { setNotice(problem); return; }
    setBusy(kind);
    setNotice("");
    try {
      const created = await addDocument(kind, file);
      setDocs((current) => [created, ...current]);
      toast({ message: `${file.name} ist gespeichert.` });
    } catch (reason) {
      setNotice(friendlyMessage(reason, "Die Datei konnte nicht gespeichert werden."));
    } finally {
      setBusy("");
      const input = inputs.current[kind];
      if (input) input.value = "";
    }
  }

  async function open(doc: CV) {
    if (!doc.storagePath) return;
    try { window.open(await documentUrl(doc.storagePath), "_blank", "noopener,noreferrer"); }
    catch (reason) { setNotice(friendlyMessage(reason, "Die Datei konnte nicht geöffnet werden.")); }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await removeDocument(toDelete);
      setDocs((current) => current.filter((item) => item.id !== toDelete.id));
      toast({ message: `„${toDelete.name}“ gelöscht` });
      setToDelete(undefined);
    } catch (reason) {
      setNotice(friendlyMessage(reason, "Die Datei konnte nicht gelöscht werden."));
      setToDelete(undefined);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="grid gap-4 lg:grid-cols-2" role="status" aria-label="Dokumente werden geladen">{[0, 1, 2, 3].map((item) => <Card key={item} className="space-y-3 p-5"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4" /><Skeleton className="h-11 w-1/3" /></Card>)}</div>;
  }

  return (
    <>
      {notice && <StatusMessage tone="danger" className="mb-5">{notice}</StatusMessage>}
      <div className="pb-safe grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {DOCUMENT_KINDS.map((info) => {
          const items = docs.filter((doc) => doc.kind === info.kind);
          const Icon = info.photoOnly ? ImageIcon : FileText;
          const single = info.kind === "lebenslauf" || info.kind === "foto";
          return (
            <Card key={info.kind} className="animate-rise flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--neutral-bg)] text-[var(--neutral-fg)]"><Icon size={19} /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-heading">{info.plural}</h2>
                  <p className="text-small mt-1 text-muted">{info.hint}</p>
                </div>
                <Badge tone={items.length ? "success" : "neutral"}>{items.length ? (items.length === 1 ? "1 Datei" : `${items.length} Dateien`) : "Fehlt noch"}</Badge>
              </div>

              {items.length > 0 && (
                <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
                  {items.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{doc.name}</p>
                        <p className="text-small truncate text-muted">{[formatBytes(doc.fileSize), doc.updatedAt && new Date(doc.updatedAt).toLocaleDateString("de-CH")].filter(Boolean).join(" · ")}</p>
                      </div>
                      <button type="button" onClick={() => open(doc)} aria-label={`${doc.name} ansehen`} title="Ansehen" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"><Eye size={16} /></button>
                      <button type="button" onClick={() => setToDelete(doc)} aria-label={`${doc.name} löschen`} title="Löschen" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-[var(--danger-bg)] hover:text-[var(--danger-fg)]"><Trash2 size={16} /></button>
                    </li>
                  ))}
                </ul>
              )}

              <input ref={(element) => { inputs.current[info.kind] = element; }} type="file" accept={accept(info.kind)} className="hidden" aria-label={`${info.plural} hochladen`} onChange={(event) => upload(info.kind, event.target.files?.[0])} />
              <div className="mt-4 flex items-center gap-3">
                <Button variant={items.length ? "secondary" : "primary"} loading={busy === info.kind} icon={<Upload size={15} />} onClick={() => inputs.current[info.kind]?.click()}>
                  {busy === info.kind ? "Lädt …" : single && items.length ? "Weitere Version" : "Datei auswählen"}
                </Button>
                <span className="text-small text-muted">{info.photoOnly ? "JPG oder PNG" : "PDF, JPG oder PNG"}, max. {MAX_DOCUMENT_BYTES / 1024 / 1024} MB</span>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={Boolean(toDelete)}
        onClose={() => !deleting && setToDelete(undefined)}
        title="Dokument löschen?"
        description={toDelete ? `„${toDelete.name}“ wird gelöscht.` : undefined}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setToDelete(undefined)} disabled={deleting}>Abbrechen</Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>Löschen</Button>
          </div>
        }
      >
        <p className="text-sm text-muted">Die Datei wird auch bei allen Bewerbungen entfernt, an die du sie angehängt hast.</p>
      </Modal>
    </>
  );
}
