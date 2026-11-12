"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DoodleSparkle } from "@/components/ui/doodles";
import { PageHeader } from "@/components/ui/page-header";
import { StatusMessage } from "@/components/ui/skeleton";
import { Modal } from "@/components/ui/modal";
import { friendlyMessage } from "@/lib/ux";
import { toast } from "@/lib/toast";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DeleteAccountCard } from "@/components/settings/delete-account";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { PasswordChangeCard } from "@/components/settings/password-change";
import { SettingsSection } from "@/components/settings/section";
import { withSupport } from "@/lib/account-deletion";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { clearLocalData, getApplications, getCVs, getProfile, importApplications, saveProfile } from "@/lib/storage";
import type { Application } from "@/types";

export default function SettingsPage() {
  const importRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => { if (notice) document.getElementById("settings-notice")?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [notice]);
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
      say("danger", withSupport(friendlyMessage(reason, "Der Download konnte nicht erstellt werden.")));
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
      say("danger", reason instanceof SyntaxError ? "Diese Datei kann nicht gelesen werden. Nutze eine WendApply-Sicherungsdatei (.json)." : withSupport(friendlyMessage(reason, "Die Sicherung konnte nicht eingelesen werden.")));
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
      say("danger", withSupport(friendlyMessage(reason, "Die Daten konnten nicht vollständig gelöscht werden.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspaceShell active="Settings">
      <div className="max-w-4xl pb-safe">
        <PageHeader title="Einstellungen" description="Du hast die Kontrolle über deine Daten und das Aussehen." />

        <div id="settings-notice" className="scroll-mt-24">{notice && <StatusMessage tone={notice.tone} icon={notice.tone === "success" ? <CheckCircle2 /> : undefined} className="mb-5">{notice.text}</StatusMessage>}</div>

        {/* Plain groups under display-font headings, separated by dashed lines. Only the account deletion gets a danger contour. */}
        <div className="rows">
          <SettingsSection title="Darstellung" description="Hell, dunkel oder passend zu deinem Gerät. Wir merken uns deine Wahl.">
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <DoodleSparkle className="hidden h-6 w-6 shrink-0 text-[var(--sun)] min-[420px]:block" />
            </div>
          </SettingsSection>

          <SettingsSection title="Daten sichern" description="Lade eine Kopie deiner Bewerbungen herunter oder lies eine Sicherung ein.">
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button className="sm:min-h-11" onClick={exportData} loading={busy} icon={<Download size={16} />}>Herunterladen</Button>
              <Button variant="secondary" className="sm:min-h-11" onClick={() => importRef.current?.click()} disabled={busy} icon={<Upload size={16} />}>Sicherung einlesen</Button>
              <input ref={importRef} type="file" accept="application/json" onChange={importData} className="hidden" />
            </div>
          </SettingsSection>

          <NotificationSettings />

          <PasswordChangeCard />

          <SettingsSection title="Deine Daten" titleTestId="section-data" description="Das Konto und der Zugang bleiben bestehen.">
            <h3 className="text-[15px] font-bold">Meine Daten löschen</h3>
            <p className="mt-1 text-body text-muted">Entfernt nur deine Bewerbungen, Notizen und Profilangaben. Du bleibst angemeldet, dein Konto und deine Lebenslauf-Vorlagen bleiben bestehen.</p>
            <Button variant="secondary" onClick={() => setConfirmClear(true)} disabled={busy} full className="mt-4 sm:min-h-11 sm:w-auto" icon={<Trash2 size={16} />}>Meine Daten löschen</Button>
            <p className="mt-3 text-small text-muted">Tipp: Lade vorher eine Sicherung herunter. Gelöschte Daten lassen sich nicht zurückholen.</p>
          </SettingsSection>

          <SettingsSection title="Dein Konto" titleTestId="section-account" description="Hier löschst du alles: Daten, Dateien und die Anmeldung.">
            <DeleteAccountCard />
          </SettingsSection>
        </div>

        <Modal open={confirmClear} onClose={() => !busy && setConfirmClear(false)} title="Alle Daten wirklich löschen?" description="Alle Bewerbungen, Notizen und Profilangaben werden entfernt. Deine Lebenslauf-Vorlagen bleiben erhalten."
          footer={<><Button variant="ghost" onClick={() => setConfirmClear(false)} disabled={busy}>Abbrechen</Button><Button variant="danger" onClick={clearData} loading={busy}>Ja, alles löschen</Button></>}>
          <p className="text-sm text-muted">Das kann nicht rückgängig gemacht werden. Hast du eine Sicherung heruntergeladen?</p>
        </Modal>
      </div>
    </WorkspaceShell>
  );
}