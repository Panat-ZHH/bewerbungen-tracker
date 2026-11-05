"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Download, Palette, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusMessage } from "@/components/ui/skeleton";
import { Modal } from "@/components/ui/modal";
import { friendlyMessage } from "@/lib/ux";
import { toast } from "@/lib/toast";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { clearLocalData, getApplications, getCVs, getProfile, importApplications, saveProfile } from "@/lib/storage";
import type { Application } from "@/types";

export default function SettingsPage() {
  const importRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const say = (tone: "success" | "danger", text: string) => setNotice({ tone, text });

  async function exportData() {
    setBusy(true);
    setNotice(null);
    try {
      const payload = { applications: await getApplications(), profile: await getProfile(), cvs: await getCVs(), exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "wendapply-daten.json";
      anchor.click();
      URL.revokeObjectURL(url);
      say("success", "Deine Daten wurden als Datei „wendapply-daten.json“ heruntergeladen.");
    } catch (reason) {
      say("danger", friendlyMessage(reason, "Der Download konnte nicht erstellt werden."));
    } finally {
      setBusy(false);
    }
  }

  async function importData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const data = JSON.parse(await file.text()) as { applications?: Application[]; profile?: Parameters<typeof saveProfile>[0] };
      if (Array.isArray(data.applications)) await importApplications(data.applications);
      if (data.profile && typeof data.profile === "object") await saveProfile(data.profile);
      say("success", "Deine Sicherung wurde eingelesen. Die Bewerbungen findest du unter „Bewerbungen“.");
    } catch (reason) {
      say("danger", reason instanceof SyntaxError ? "Diese Datei kann nicht gelesen werden. Nutze eine WendApply-Sicherungsdatei (.json)." : friendlyMessage(reason, "Die Sicherung konnte nicht eingelesen werden."));
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function clearData() {
    setBusy(true);
    setNotice(null);
    try {
      await clearLocalData();
      setConfirmClear(false);
      toast({ message: "Deine Bewerbungen und Profildaten wurden gelöscht." });
    } catch (reason) {
      setConfirmClear(false);
      say("danger", friendlyMessage(reason, "Die Daten konnten nicht vollständig gelöscht werden."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspaceShell active="Settings">
      <div className="max-w-2xl pb-safe">
        <PageHeader title="Einstellungen" description="Du hast die Kontrolle über deine Daten und das Aussehen." />

        {notice && <StatusMessage tone={notice.tone} icon={notice.tone === "success" ? <CheckCircle2 /> : undefined} className="mb-5">{notice.text}</StatusMessage>}

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
            <Button className="sm:min-h-11" onClick={exportData} loading={busy} icon={<Download size={16} />}>Herunterladen</Button>
            <Button variant="secondary" className="sm:min-h-11" onClick={() => importRef.current?.click()} disabled={busy} icon={<Upload size={16} />}>Sicherung einlesen</Button>
            <input ref={importRef} type="file" accept="application/json" onChange={importData} className="hidden" />
          </div>
        </CardContent></Card>

        <Card className="animate-rise mt-4 !border-[var(--danger-line)]"><CardContent>
          <h2 className="text-heading">Daten löschen</h2>
          <p className="mt-1 text-body text-muted">Entfernt deine Bewerbungen, Notizen und Profilangaben. Deine Lebenslauf-Vorlagen bleiben bestehen.</p>
          <Button variant="danger" onClick={() => setConfirmClear(true)} disabled={busy} full className="mt-4 sm:min-h-11 sm:w-auto" icon={<Trash2 size={16} />}>Meine Daten löschen</Button>
          <p className="mt-2 text-small text-muted">Tipp: Lade vorher eine Sicherung herunter. Gelöschte Daten lassen sich nicht zurückholen.</p>
        </CardContent></Card>

        <Modal open={confirmClear} onClose={() => !busy && setConfirmClear(false)} title="Alle Daten wirklich löschen?" description="Alle Bewerbungen, Notizen und Profilangaben werden entfernt. Deine Lebenslauf-Vorlagen bleiben erhalten."
          footer={<><Button variant="ghost" onClick={() => setConfirmClear(false)} disabled={busy}>Abbrechen</Button><Button variant="danger" onClick={clearData} loading={busy}>Ja, alles löschen</Button></>}>
          <p className="text-sm text-muted">Das kann nicht rückgängig gemacht werden. Hast du eine Sicherung heruntergeladen?</p>
        </Modal>
      </div>
    </WorkspaceShell>
  );
}