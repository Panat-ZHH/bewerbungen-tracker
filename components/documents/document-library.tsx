"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, FileText, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    return <div className="rows border-y-[length:var(--border-w)] border-[var(--outline)]" role="status" aria-label="Dokumente werden geladen">{[0, 1, 2, 3].map((item) => <div key={item} className="space-y-3 py-6"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-10 w-40" /></div>)}</div>;
  }

  // Only one loud (blue) upload button per view: the first kind that is still missing.
  const firstMissing = DOCUMENT_KINDS.find((info) => !docs.some((doc) => doc.kind === info.kind))?.kind;
  const kindsDone = DOCUMENT_KINDS.filter((info) => docs.some((doc) => doc.kind === info.kind)).length;

  return (
    <>
      {notice && <StatusMessage tone="danger" className="mb-5">{notice}</StatusMessage>}
      <p className="mb-4 flex items-center gap-2.5 text-sm text-muted">
        <span className={`sticker tilt-l ${kindsDone === DOCUMENT_KINDS.length ? "sticker-mint" : ""}`}>{kindsDone} von {DOCUMENT_KINDS.length}</span>
        {kindsDone === DOCUMENT_KINDS.length ? "Dein Dossier ist komplett." : "Arten von Unterlagen sind schon da."}
      </p>
      <div className="pb-safe"><div className="rows border-y-[length:var(--border-w)] border-[var(--outline)] [&>*]:min-w-0">
        {DOCUMENT_KINDS.map((info) => {
          const items = docs.filter((doc) => doc.kind === info.kind);
          const Icon = info.photoOnly ? ImageIcon : FileText;
          const single = info.kind === "lebenslauf" || info.kind === "foto";
          return (
            <section key={info.kind} className="animate-rise grid gap-x-10 gap-y-3 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
              <div className="flex items-start gap-3">
                <Icon size={24} strokeWidth={2.2} aria-hidden className={`mt-0.5 shrink-0 ${items.length ? "text-[var(--brand)]" : "text-[var(--muted)]"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="text-heading">{info.plural}</h2>
                    <Badge tone={items.length ? "success" : "neutral"}>{items.length ? (items.length === 1 ? "1 Datei" : `${items.length} Dateien`) : "Fehlt noch"}</Badge>
                  </div>
                  <p className="text-small mt-1 text-muted">{info.hint}</p>
                </div>
              </div>

              <div className="min-w-0">
                {items.length > 0 && (
                  <ul className="rows mb-3">
                    {items.map((doc) => (
                      <li key={doc.id} className="flex items-center gap-1 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{doc.name}</p>
                          <p className="text-small truncate text-muted">{[formatBytes(doc.fileSize), doc.updatedAt && new Date(doc.updatedAt).toLocaleDateString("de-CH")].filter(Boolean).join(" · ")}</p>
                        </div>
                        <button type="button" onClick={() => open(doc)} aria-label={`${doc.name} ansehen`} title="Ansehen" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ink)] transition-colors hover:bg-[var(--hover)] active:translate-y-px"><Eye size={17} /></button>
                        <button type="button" onClick={() => setToDelete(doc)} aria-label={`${doc.name} löschen`} title="Löschen" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger-fg)] active:translate-y-px"><Trash2 size={17} /></button>
                      </li>
                    ))}
                  </ul>
                )}

                <input ref={(element) => { inputs.current[info.kind] = element; }} type="file" accept={accept(info.kind)} className="hidden" aria-label={`${info.plural} hochladen`} onChange={(event) => upload(info.kind, event.target.files?.[0])} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Button variant={info.kind === firstMissing ? "primary" : "secondary"} loading={busy === info.kind} icon={<Upload size={15} />} onClick={() => inputs.current[info.kind]?.click()}>
                    {busy === info.kind ? "Lädt …" : single && items.length ? "Weitere Version" : "Datei auswählen"}
                  </Button>
                  <span className="text-small text-muted">{info.photoOnly ? "JPG oder PNG" : "PDF, JPG oder PNG"}, max. {MAX_DOCUMENT_BYTES / 1024 / 1024} MB</span>
                </div>
              </div>
            </section>
          );
        })}
      </div></div>

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
