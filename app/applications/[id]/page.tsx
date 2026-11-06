"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Pencil, Trash2 } from "lucide-react";
import { ApplicationForm } from "@/components/applications/application-form";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { deleteApplication, getApplication, importApplications, updateApplication } from "@/lib/storage";
import { statusLabels } from "@/lib/utils";
import { deadlineInfo, friendlyMessage } from "@/lib/ux";
import { reward } from "@/lib/rewards";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { StatusMessage } from "@/components/ui/skeleton";
import { statusHints } from "@/components/ui/status-badge";
import type { Application, ApplicationStatus } from "@/types";

const statuses = Object.entries(statusLabels) as [ApplicationStatus, string][];

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [application, setApplication] = useState<Application>();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    getApplication(params.id)
      .then((data) => { if (active) setApplication(data); })
      .catch((reason) => { if (active) setError(friendlyMessage(reason, "Diese Bewerbung konnte nicht geladen werden.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.id]);

  async function changeStatus(status: ApplicationStatus) {
    if (!application) return;
    if (status === application.status) return;
    setError("");
    const previous = application.status;
    try {
      const updated = await updateApplication(application.id, { status });
      if (updated) setApplication(updated);
      if (status === "applied") reward("applied");
      toast({
        message: `Stand geändert: ${statusLabels[status]}`,
        action: { label: "Rückgängig", onClick: async () => {
          try { const back = await updateApplication(application.id, { status: previous }); if (back) setApplication(back); toast({ message: `Wieder auf „${statusLabels[previous]}“ gesetzt` }); }
          catch (reason) { toast({ tone: "danger", message: friendlyMessage(reason, "Das konnte nicht rückgängig gemacht werden.") }); }
        } },
      });
    } catch (reason) {
      setError(friendlyMessage(reason, "Der neue Stand konnte nicht gespeichert werden."));
    }
  }

  async function remove() {
    if (!application) return;
    setDeleting(true);
    const backup = application;
    try {
      await deleteApplication(backup.id);
      toast({
        message: `„${backup.position}“ bei ${backup.company} gelöscht`,
        action: { label: "Rückgängig", onClick: async () => {
          try { await importApplications([backup]); toast({ message: "Bewerbung wiederhergestellt" }); router.push(`/applications/${backup.id}`); }
          catch (reason) { toast({ tone: "danger", message: friendlyMessage(reason, "Die Bewerbung konnte nicht wiederhergestellt werden.") }); }
        } },
      });
      router.push("/applications");
    } catch (reason) {
      setConfirmDelete(false);
      setDeleting(false);
      setError(friendlyMessage(reason, "Die Bewerbung konnte nicht gelöscht werden."));
    }
  }

  return (
    <WorkspaceShell active="Bewerbungen">
      <Link href="/applications" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted transition hover:text-[var(--brand)]">
        <ArrowLeft size={16} /> Alle Bewerbungen
      </Link>

      {loading ? (
        <div className="mt-6 space-y-4" role="status" aria-label="Bewerbung wird geladen">
          <div className="h-9 w-2/3 skeleton rounded-lg" />
          <div className="h-5 w-1/3 skeleton rounded-lg" />
          <div className="h-40 skeleton rounded-[14px]" />
        </div>
      ) : !application ? (
        <Card className="mt-6 p-6">
          <h1 className="text-xl font-semibold">{error ? "Das hat nicht geklappt" : "Bewerbung nicht gefunden"}</h1>
          <p className="mt-2 text-sm text-muted">{error || "Vielleicht wurde sie schon gelöscht."}</p>
          <Link href="/applications" className="mt-5 inline-flex min-h-11 items-center rounded-full border border-[var(--glass-border)] bg-[var(--raised)] px-5 text-sm font-semibold hover:bg-[var(--raised-hover)]">Zur Übersicht</Link>
        </Card>
      ) : editing ? (
        <div className="mt-4 max-w-3xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0"><h1 className="text-[28px] font-semibold tracking-[-1px]">Bewerbung ändern</h1><p className="mt-2 text-sm text-muted">{application.position} bei {application.company}</p></div>
            <Button variant="ghost" onClick={() => setEditing(false)} className="min-h-11 sm:min-h-11 shrink-0">Abbrechen</Button>
          </div>
          <Card className="mt-6 p-4 sm:p-7"><ApplicationForm application={application} /></Card>
        </div>
      ) : (
        <>
          {error && <StatusMessage tone="danger" className="mt-5">{error}</StatusMessage>}
          <div className="mt-4 flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-semibold leading-tight tracking-[-1px] [hyphens:auto] min-[360px]:text-[28px] md:text-[38px]">{application.position}</h1>
              <p className="mt-2 text-lg text-muted">{application.company}</p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                {application.location && <span><MapPin size={15} className="mr-1 inline" />{application.location}</span>}
                {application.appliedAt && <span><CalendarDays size={15} className="mr-1 inline" />Abgeschickt am {new Date(application.appliedAt).toLocaleDateString("de-CH")}</span>}
                {application.jobUrl && <a href={application.jobUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[var(--brand)] hover:underline"><ExternalLink size={14} className="mr-1 inline" />Stellenanzeige öffnen</a>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="application-status">Stand der Bewerbung</label>
              <select id="application-status" aria-describedby="status-hint" value={application.status} onChange={(event) => changeStatus(event.target.value as ApplicationStatus)} className="min-h-11 sm:min-h-11 min-w-0 basis-full flex-1 rounded-full border border-[var(--field-border)] bg-[var(--field-bg)] px-3 min-[360px]:px-4 text-base text-[var(--ink)] pointer-fine:text-sm font-medium outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand)]/15 min-[480px]:basis-auto sm:flex-none">
                {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <Button variant="secondary" onClick={() => setEditing(true)} className="min-h-11 sm:min-h-11"><Pencil size={15} /> Ändern</Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)} aria-label="Bewerbung löschen" title="Bewerbung löschen" className="h-11 w-11 shrink-0 px-0"><Trash2 size={16} /></Button>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted" id="status-hint">{statusHints[application.status]}</p>

          <Card className="mt-6 max-w-3xl divide-y divide-[var(--line)] px-5 md:px-6">
            {application.deadline && <DetailRow label="Bewerben bis" value={new Date(application.deadline).toLocaleDateString("de-CH")} badge={["saved", "preparing"].includes(application.status) ? deadlineInfo(application.deadline) : null} />}
            {application.source && <DetailRow label="Gefunden bei" value={application.source} />}
            {(application.salaryMin || application.salaryMax) && <DetailRow label="Lohn" value={`${application.salaryMin ?? "?"}–${application.salaryMax ?? "?"} ${application.currency ?? "CHF"}`} />}
            {application.notes && <div className="py-5"><h2 className="text-sm font-semibold">Deine Notizen</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{application.notes}</p></div>}
            {application.jobDescription && <div className="py-5"><h2 className="text-sm font-semibold">Zur Stelle</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{application.jobDescription}</p></div>}
            {!application.deadline && !application.source && !application.salaryMin && !application.salaryMax && !application.notes && !application.jobDescription && <p className="py-5 text-sm text-muted">Noch keine weiteren Angaben. Du kannst sie jederzeit ergänzen.</p>}
          </Card>
        </>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        title="Bewerbung löschen?"
        description={application ? `${application.position} bei ${application.company} wird gelöscht.` : undefined}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting} className="min-h-11 sm:min-h-11">Abbrechen</Button>
            <Button variant="danger" onClick={remove} loading={deleting} className="min-h-11 sm:min-h-11">Löschen</Button>
          </div>
        }
      >
        <p className="text-sm text-muted">Gleich danach kannst du das Löschen noch rückgängig machen.</p>
      </Modal>
    </WorkspaceShell>
  );
}

function DetailRow({ label, value, badge }: { label: string; value: string; badge?: ReturnType<typeof deadlineInfo> }) {
  return <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center"><span className="w-44 shrink-0 text-sm text-muted">{label}</span><span className="flex min-w-0 flex-wrap items-center gap-2 break-words text-sm font-medium">{value}{badge && <Badge tone={badge.tone}>{badge.label}</Badge>}</span></div>;
}