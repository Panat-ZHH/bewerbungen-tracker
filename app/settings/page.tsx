"use client";

import { useRef, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

        <Card className="mt-7"><CardContent>
          <h2 className="text-base font-semibold">Daten sichern</h2>
          <p className="mt-1 text-sm text-muted">Lade eine Kopie deiner Bewerbungen herunter oder lies eine Sicherung ein.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={exportData} disabled={busy} className="min-h-11"><Download size={16} /> Herunterladen</Button>
            <Button variant="secondary" onClick={() => importRef.current?.click()} disabled={busy} className="min-h-11"><Upload size={16} /> Sicherung einlesen</Button>
            <input ref={importRef} type="file" accept="application/json" onChange={importData} className="hidden" />
          </div>
        </CardContent></Card>

        <Card className="mt-4 border-[#e8c7c7]"><CardContent>
          <h2 className="text-base font-semibold">Daten löschen</h2>
          <p className="mt-1 text-sm text-muted">Entfernt deine Bewerbungen, Notizen und Profilangaben. Deine Lebenslauf-Vorlagen bleiben bestehen.</p>
          <Button variant="danger" onClick={clearData} disabled={busy} className="mt-4 min-h-11 w-full sm:w-auto"><Trash2 size={16} /> Meine Daten löschen</Button>
        </CardContent></Card>
      </div>
    </WorkspaceShell>
  );
}