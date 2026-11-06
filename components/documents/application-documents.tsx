"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Circle, FileText } from "lucide-react";
import { StatusMessage } from "@/components/ui/skeleton";
import { attachDocument, detachDocument, listAttachedDocumentIds, listDocuments } from "@/lib/documents";
import { dossierChecklist, kindLabel } from "@/lib/documents-core";
import { friendlyMessage } from "@/lib/ux";
import type { CV } from "@/types";

/** Dossier checklist + attach/detach of own documents for one application. */
export function ApplicationDocuments({ applicationId }: { applicationId: string }) {
  const [docs, setDocs] = useState<CV[]>([]);
  const [attached, setAttached] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([listDocuments(), listAttachedDocumentIds(applicationId)])
      .then(([all, ids]) => { if (active) { setDocs(all); setAttached(new Set(ids)); } })
      .catch((reason) => { if (active) setError(friendlyMessage(reason, "Deine Unterlagen konnten nicht geladen werden.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applicationId]);

  const checklist = useMemo(() => dossierChecklist(docs.filter((doc) => attached.has(doc.id)).map((doc) => doc.kind)), [docs, attached]);

  async function toggle(doc: CV) {
    setPending(doc.id);
    setError("");
    try {
      if (attached.has(doc.id)) await detachDocument(applicationId, doc.id); else await attachDocument(applicationId, doc.id);
      setAttached((current) => { const next = new Set(current); if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id); return next; });
    } catch (reason) {
      setError(friendlyMessage(reason, "Das konnte nicht gespeichert werden."));
    } finally {
      setPending("");
    }
  }

  if (loading) return <div className="h-24 skeleton rounded-[14px]" role="status" aria-label="Unterlagen werden geladen" />;

  return (
    <div>
      {error && <StatusMessage tone="danger" className="mb-4">{error}</StatusMessage>}
      <p className="text-sm font-medium" aria-live="polite">Dossier: {checklist.done} von {checklist.total} Unterlagen dabei</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {checklist.items.map((item) => (
          <li key={item.kind} className={`flex items-center gap-2 text-sm ${item.done ? "text-[var(--success-fg)]" : "text-muted"}`}>
            {item.done ? <Check size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
            <span>{item.label}</span>
            <span className="sr-only">{item.done ? "dabei" : "fehlt noch"}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-6 text-sm font-semibold">Anhängen</h3>
      {docs.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Du hast noch keine Dokumente hochgeladen. <Link href="/cvs" className="font-medium text-[var(--brand)] hover:underline">Dokument hochladen</Link></p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--line)]">
          {docs.map((doc) => {
            const id = `att-${doc.id}`;
            return (
              <li key={doc.id}>
                <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                  <input id={id} type="checkbox" checked={attached.has(doc.id)} disabled={pending === doc.id} onChange={() => toggle(doc)} className="h-5 w-5 shrink-0 accent-[var(--brand)]" />
                  <FileText size={16} className="shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{doc.name}</span>
                  <span className="text-small shrink-0 text-muted">{kindLabel(doc.kind)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {docs.length > 0 && <p className="mt-3 text-small text-muted"><Link href="/cvs" className="font-medium text-[var(--brand)] hover:underline">Dokumente verwalten</Link></p>}
    </div>
  );
}
