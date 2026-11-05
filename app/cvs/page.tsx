"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Eye, FileText, Pencil, Upload } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { friendlyMessage } from "@/lib/ux";
import { toast } from "@/lib/toast";
import { getCVPreviewUrl, getCVs, updateCV, uploadCV } from "@/lib/storage";
import type { CV, CVType } from "@/types";

const titles: Record<CVType, string> = {
  developer: "Lebenslauf für Technik",
  sales: "Lebenslauf für Vertrieb",
  finance: "Lebenslauf für Finanzen",
  other: "Mein Lebenslauf",
};

export default function CVsPage() {
  const [cvs, setCvs] = useState<CV[]>([]);
  const [editing, setEditing] = useState<CV>();
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let active = true;
    getCVs().then((data) => { if (active) setCvs(data); }).catch((reason) => { if (active) setNotice(friendlyMessage(reason, "Deine Lebensläufe konnten nicht geladen werden.")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function replaceCV(cv: CV, file?: File) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setNotice("Die Datei ist grösser als 10 MB. Wähle eine kleinere PDF- oder Word-Datei."); return; }
    if (!/\.(pdf|docx?)$/i.test(file.name)) { setNotice("Dieses Dateiformat wird nicht unterstützt. Nutze PDF oder Word (.pdf, .doc, .docx)."); return; }
    setBusy(cv.id);
    setNotice("");
    try {
      const updated = await uploadCV(cv.id, file);
      if (updated) setCvs((current) => current.map((item) => item.id === cv.id ? updated : item));
      toast({ message: `${file.name} ist gespeichert.` });
    } catch (reason) {
      setNotice(friendlyMessage(reason, "Die Datei konnte nicht gespeichert werden."));
    } finally {
      setBusy("");
    }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBusy(editing.id);
    try {
      const updated = await updateCV(editing.id, editing);
      setCvs((current) => current.map((item) => item.id === editing.id ? updated : item));
      setEditing(undefined);
      toast({ message: "Beschreibung gespeichert." });
    } catch (reason) {
      setNotice(friendlyMessage(reason, "Die Änderungen konnten nicht gespeichert werden."));
    } finally {
      setBusy("");
    }
  }

  async function preview(cv: CV) {
    if (!cv.storagePath) return;
    try {
      window.open(await getCVPreviewUrl(cv.storagePath), "_blank", "noopener,noreferrer");
    } catch (reason) {
      setNotice(friendlyMessage(reason, "Die Datei konnte nicht geöffnet werden."));
    }
  }

  return (
    <WorkspaceShell active="Lebensläufe">
      <PageHeader title="Deine Lebensläufe" description="Lade hier die Version hoch, die du für deine Bewerbungen nutzt." />

      {notice && <StatusMessage tone="danger" className="mb-5">{notice}</StatusMessage>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="space-y-4 p-5" aria-hidden><Skeleton className="h-10 w-10 !rounded-full" /><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4" /><Skeleton className="h-11 w-1/2" /></Card>)}</div>
      ) : cvs.length === 0 && !notice ? (
        <EmptyState icon={<FileText />} title="Noch keine Lebenslauf-Vorlagen" description="Sobald Vorlagen da sind, kannst du hier PDF- oder Word-Dateien hochladen." />
      ) : (
        <div className="pb-safe grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
          {cvs.map((cv) => (
            <Card key={cv.id} interactive className="animate-rise flex min-h-[250px] flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--neutral-bg)] text-[var(--neutral-fg)]"><FileText size={19} /></span>
                <Badge tone={cv.fileName ? "success" : "neutral"}>{cv.fileName ? "Datei da" : "Noch leer"}</Badge>
              </div>
              <h2 className="text-heading mt-5">{titles[cv.type]}</h2>
              <p className="text-body mt-2 line-clamp-2 text-muted">{cv.description || "Hier kannst du eine passende Version speichern."}</p>
              <p className="text-small mt-3 mb-4 truncate text-muted">{cv.fileName ?? "PDF oder Word-Datei"}</p>
              <input ref={(element) => { fileRefs.current[cv.id] = element; }} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(event) => replaceCV(cv, event.target.files?.[0])} />
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
                <Button onClick={() => fileRefs.current[cv.id]?.click()} loading={busy === cv.id} icon={<Upload size={15} />} className="flex-1 sm:min-h-11 sm:flex-none">
                  {busy === cv.id ? "Lädt …" : cv.fileName ? "Ersetzen" : "Datei auswählen"}
                </Button>
                <button onClick={() => preview(cv)} disabled={!cv.storagePath} aria-label="Lebenslauf ansehen" title="Lebenslauf ansehen" className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-[var(--hover)] hover:text-[var(--ink)] disabled:opacity-40"><Eye size={16} /></button>
                <button onClick={() => setEditing(cv)} aria-label="Beschreibung ändern" title="Beschreibung ändern" className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"><Pencil size={15} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(undefined)}
        title="Lebenslauf beschreiben"
        footer={editing ? <><Button type="button" variant="ghost" onClick={() => setEditing(undefined)}>Abbrechen</Button><Button type="submit" form="cv-edit-form" loading={busy === editing.id} icon={<Check size={15} />}>Speichern</Button></> : undefined}
      >
        {editing && <form id="cv-edit-form" onSubmit={saveEdit}>
          <Field label="Wofür ist dieser Lebenslauf?" htmlFor="cv-description">
            <Textarea id="cv-description" data-autofocus rows={4} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
          </Field>
        </form>}
      </Modal>
    </WorkspaceShell>
  );
}