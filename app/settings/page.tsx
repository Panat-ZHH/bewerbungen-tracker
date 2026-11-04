"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Download, Palette, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusMessage } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
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
      <div className="max-w-2xl pb-safe">
        <PageHeader title="Einstellungen" description="Du hast die Kontrolle über deine Daten und das Aussehen." />

        {notice && <StatusMessage tone={/nicht|kann/.test(notice) ? "danger" : "success"} icon={<CheckCircle2 />} className="mb-5">{notice}</StatusMessage>}

        <Card className="animate-rise"><CardContent>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Palette size={18} /></span>
            <div className="min-w-0">
              <h2 className="text-heading">Darstellung</h2>
              <p className="mt-1 text-body text-muted">Hell, dunkel oder passend zu deinem Gerät. Wir merken uns deine Wahl.</p>
            </div>
          </div>
          <div className="mt-4"><ThemeToggle /></div>
        </CardContent></Card>

        <Card className="animate-rise mt-4"><CardContent>
          <h2 className="text-heading">Daten sichern</h2>
          <p className="mt-1 text-body text-muted">Lade eine Kopie deiner Bewerbungen herunter oder lies eine Sicherung ein.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={exportData} loading={busy} icon={<Download size={16} />}>Herunterladen</Button>
            <Button variant="secondary" onClick={() => importRef.current?.click()} disabled={busy} icon={<Upload size={16} />}>Sicherung einlesen</Button>
            <input ref={importRef} type="file" accept="application/json" onChange={importData} className="hidden" />
          </div>
        </CardContent></Card>

        <Card className="animate-rise mt-4 !border-[var(--danger-line)]"><CardContent>
          <h2 className="text-heading">Daten löschen</h2>
          <p className="mt-1 text-body text-muted">Entfernt deine Bewerbungen, Notizen und Profilangaben. Deine Lebenslauf-Vorlagen bleiben bestehen.</p>
          <Button variant="danger" onClick={clearData} disabled={busy} full className="mt-4 sm:w-auto" icon={<Trash2 size={16} />}>Meine Daten löschen</Button>
        </CardContent></Card>
      </div>
    </WorkspaceShell>
  );
}