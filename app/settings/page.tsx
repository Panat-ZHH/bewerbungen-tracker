"use client";

import { useRef, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { clearLocalData, getApplications, getCVs, getProfile, importApplications, saveProfile } from "@/lib/storage";
import type { Application } from "@/types";

export default function SettingsPage() {
  const importRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setBusy(true);
    setNotice("");
    try {
      const payload = { applications: await getApplications(), profile: await getProfile(), cvs: await getCVs(), exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "wendapply-daten.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("Deine Daten wurden heruntergeladen.");
    } catch {
      setNotice("Der Download konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function importData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setNotice("");
    try {
      const data = JSON.parse(await file.text()) as { applications?: Application[]; profile?: Parameters<typeof saveProfile>[0] };
      if (Array.isArray(data.applications)) await importApplications(data.applications);
      if (data.profile && typeof data.profile === "object") await saveProfile(data.profile);
      setNotice("Deine Daten wurden eingelesen.");
    } catch {
      setNotice("Diese Datei kann nicht gelesen werden. Nutze eine WendApply-Sicherungsdatei.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function clearData() {
    if (!window.confirm("Alle Bewerbungen und Profildaten wirklich löschen? Deine Lebenslauf-Vorlagen bleiben erhalten.")) return;
    setBusy(true);
    setNotice("");
    try {
      await clearLocalData();
      setNotice("Deine Bewerbungen und Profildaten wurden gelöscht.");
    } catch {
      setNotice("Die Daten konnten nicht vollständig gelöscht werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspaceShell active="Settings">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-[-1px] md:text-[38px]">Einstellungen</h1>
        <p className="mt-2 text-base text-muted">Du hast die Kontrolle über deine Daten.</p>

        {notice && <p role="status" className="glass-surface mt-5 rounded-xl px-4 py-3 text-sm text-muted">{notice}</p>}

        <section className="mt-7 border-y border-[#e5e5ea] py-5">
          <h2 className="text-base font-semibold">Daten sichern</h2>
          <p className="mt-1 text-sm text-muted">Lade eine Kopie deiner Bewerbungen herunter oder lies eine Sicherung ein.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={exportData} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#0866d6] px-4 text-sm font-semibold text-white hover:bg-[#075bbb] disabled:opacity-60"><Download size={16} /> Herunterladen</button>
            <button onClick={() => importRef.current?.click()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#d2d2d7] bg-white px-4 text-sm font-semibold hover:bg-[#f5f5f7] disabled:opacity-60"><Upload size={16} /> Sicherung einlesen</button>
            <input ref={importRef} type="file" accept="application/json" onChange={importData} className="hidden" />
          </div>
        </section>

        <section className="mt-7 border-b border-[#e5e5ea] pb-6">
          <h2 className="text-base font-semibold">Daten löschen</h2>
          <p className="mt-1 text-sm text-muted">Entfernt deine Bewerbungen, Notizen und Profilangaben. Deine Lebenslauf-Vorlagen bleiben bestehen.</p>
          <button onClick={clearData} disabled={busy} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#e8c7c7] bg-white px-4 text-sm font-semibold text-[#b42323] hover:bg-[#fff0f0] disabled:opacity-60"><Trash2 size={16} /> Meine Daten löschen</button>
        </section>
      </div>
    </WorkspaceShell>
  );
}