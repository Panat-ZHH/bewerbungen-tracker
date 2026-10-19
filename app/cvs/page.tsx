"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Eye, FileText, Pencil, Upload } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
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
    getCVs().then((data) => { if (active) setCvs(data); }).catch(() => { if (active) setNotice("Deine Lebensläufe konnten nicht geladen werden."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function replaceCV(cv: CV, file?: File) {
    if (!file) return;
    setBusy(cv.id);
    setNotice("");
    try {
      const updated = await uploadCV(cv.id, file);
      if (updated) setCvs((current) => current.map((item) => item.id === cv.id ? updated : item));
      setNotice(`${file.name} ist gespeichert.`);
    } catch {
      setNotice("Die Datei konnte nicht gespeichert werden. Versuch es bitte noch einmal.");
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
      setNotice("Deine Änderungen sind gespeichert.");
    } catch {
      setNotice("Die Änderungen konnten nicht gespeichert werden.");
    } finally {
      setBusy("");
    }
  }

  async function preview(cv: CV) {
    if (!cv.storagePath) return;
    try {
      window.open(await getCVPreviewUrl(cv.storagePath), "_blank", "noopener,noreferrer");
    } catch {
      setNotice("Die Datei konnte nicht geöffnet werden.");
    }
  }

  return (
    <WorkspaceShell active="Lebensläufe">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-1px] md:text-[38px]">Deine Lebensläufe</h1>
        <p className="mt-2 text-base text-muted">Lade hier die Version hoch, die du für deine Bewerbungen nutzt.</p>
      </div>

      {notice && <p role="status" className="mt-5 rounded-xl border border-[#c5dfcf] bg-[#f1faf4] px-4 py-3 text-sm text-[#246c40]">{notice}</p>}

      {loading ? (
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-56 animate-pulse rounded-[14px] bg-[#e9e9ed]" />)}</div>
      ) : (
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cvs.map((cv) => (
            <article key={cv.id} className="glass-surface flex min-h-[250px] flex-col rounded-[14px] p-5">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f2f2f4] text-[#5e5e63]"><FileText size={19} /></span>
                <span className="rounded-full bg-[#f2f2f4] px-3 py-1 text-xs font-medium text-[#4a4a4f]">{cv.fileName ? "Datei da" : "Noch leer"}</span>
              </div>
              <h2 className="mt-5 text-base font-semibold">{titles[cv.type]}</h2>
              <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted">{cv.description || "Hier kannst du eine passende Version speichern."}</p>
              <p className="mt-3 truncate text-xs text-muted">{cv.fileName ?? "PDF oder Word-Datei"}</p>
              <input ref={(element) => { fileRefs.current[cv.id] = element; }} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(event) => replaceCV(cv, event.target.files?.[0])} />
              <div className="mt-auto flex flex-wrap gap-2 border-t border-[#e5e5ea] pt-4">
                <button onClick={() => fileRefs.current[cv.id]?.click()} disabled={busy === cv.id} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#0866d6] px-3.5 text-sm font-semibold text-white hover:bg-[#075bbb] disabled:opacity-60">
                  <Upload size={15} /> {busy === cv.id ? "Lädt …" : cv.fileName ? "Ersetzen" : "Datei auswählen"}
                </button>
                <button onClick={() => preview(cv)} disabled={!cv.storagePath} aria-label="Lebenslauf ansehen" title="Lebenslauf ansehen" className="flex h-9 w-9 items-center justify-center rounded-full text-[#5e5e63] hover:bg-[#f2f2f4] disabled:opacity-40"><Eye size={16} /></button>
                <button onClick={() => setEditing(cv)} aria-label="Beschreibung ändern" title="Beschreibung ändern" className="flex h-9 w-9 items-center justify-center rounded-full text-[#5e5e63] hover:bg-[#f2f2f4]"><Pencil size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(undefined); }}>
        <form onSubmit={saveEdit} role="dialog" aria-modal="true" aria-labelledby="edit-cv-title" className="glass-surface w-full max-w-md rounded-[16px] p-6 shadow-xl">
          <h2 id="edit-cv-title" className="text-lg font-semibold">Lebenslauf beschreiben</h2>
          <label className="mt-5 block text-sm font-medium" htmlFor="cv-description">Wofür ist dieser Lebenslauf?</label>
          <textarea id="cv-description" rows={4} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} className="mt-2 w-full rounded-xl border border-[#d2d2d7] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#0866d6]" />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(undefined)} className="min-h-10 rounded-full px-4 text-sm font-medium text-[#5e5e63] hover:bg-[#f2f2f4]">Abbrechen</button>
            <button disabled={busy === editing.id} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#0866d6] px-4 text-sm font-semibold text-white disabled:opacity-60"><Check size={15} />Speichern</button>
          </div>
        </form>
      </div>}
    </WorkspaceShell>
  );
}