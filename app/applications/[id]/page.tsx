"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Pencil, Trash2 } from "lucide-react";
import { ApplicationForm } from "@/components/applications/application-form";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteApplication, getApplication, updateApplication } from "@/lib/storage";
import { statusLabels } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";

const statuses = Object.entries(statusLabels) as [ApplicationStatus, string][];

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [application, setApplication] = useState<Application>();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getApplication(params.id)
      .then((data) => { if (active) setApplication(data); })
      .catch(() => { if (active) setError("Diese Bewerbung konnte nicht geladen werden."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.id]);

  async function changeStatus(status: ApplicationStatus) {
    if (!application) return;
    setError("");
    try {
      const updated = await updateApplication(application.id, { status });
      if (updated) setApplication(updated);
    } catch {
      setError("Der neue Stand konnte nicht gespeichert werden.");
    }
  }

  async function remove() {
    if (!application || !window.confirm("Diese Bewerbung wirklich löschen?")) return;
    try {
      await deleteApplication(application.id);
      router.push("/applications");
    } catch {
      setError("Die Bewerbung konnte nicht gelöscht werden.");
    }
  }

  return (
    <WorkspaceShell active="Bewerbungen">
      <Link href="/applications" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#5e5e63] transition hover:text-[#0866d6]">
        <ArrowLeft size={16} /> Alle Bewerbungen
      </Link>

      {loading ? (
        <div className="mt-6 space-y-4" role="status" aria-label="Bewerbung wird geladen">
          <div className="h-9 w-2/3 animate-pulse rounded-lg bg-white/60" />
          <div className="h-5 w-1/3 animate-pulse rounded-lg bg-white/60" />
          <div className="h-40 animate-pulse rounded-[14px] bg-white/60" />
        </div>
      ) : !application ? (
        <Card className="mt-6 p-6">
          <h1 className="text-xl font-semibold">{error ? "Das hat nicht geklappt" : "Bewerbung nicht gefunden"}</h1>
          <p className="mt-2 text-sm text-muted">{error || "Vielleicht wurde sie schon gelöscht."}</p>
          <Link href="/applications" className="mt-5 inline-flex min-h-11 items-center rounded-full border border-[#d2d2d7] bg-white px-5 text-sm font-semibold hover:bg-[#f5f5f7]">Zur Übersicht</Link>
        </Card>
      ) : editing ? (
        <div className="mt-4 max-w-3xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0"><h1 className="text-[28px] font-semibold tracking-[-1px]">Bewerbung ändern</h1><p className="mt-2 text-sm text-muted">{application.position} bei {application.company}</p></div>
            <Button variant="ghost" onClick={() => setEditing(false)} className="min-h-11 shrink-0">Abbrechen</Button>
          </div>
          <Card className="mt-6 p-4 sm:p-7"><ApplicationForm application={application} /></Card>
        </div>
      ) : (
        <>
          {error && <p role="alert" className="mt-5 rounded-xl border border-[#e8c7c7] bg-[#fff8f8] px-4 py-3 text-sm text-[#a32828]">{error}</p>}
          <div className="mt-4 flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <h1 className="break-words text-[28px] font-semibold leading-tight tracking-[-1px] md:text-[38px]">{application.position}</h1>
              <p className="mt-2 text-lg text-muted">{application.company}</p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                {application.location && <span><MapPin size={15} className="mr-1 inline" />{application.location}</span>}
                {application.appliedAt && <span><CalendarDays size={15} className="mr-1 inline" />Abgeschickt am {new Date(application.appliedAt).toLocaleDateString("de-CH")}</span>}
                {application.jobUrl && <a href={application.jobUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center text-[#0866d6] hover:underline"><ExternalLink size={14} className="mr-1 inline" />Stellenanzeige öffnen</a>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="application-status">Stand der Bewerbung</label>
              <select id="application-status" value={application.status} onChange={(event) => changeStatus(event.target.value as ApplicationStatus)} className="min-h-11 min-w-0 flex-1 rounded-full border border-[#d2d2d7] bg-white px-4 text-sm font-medium outline-none transition focus:border-[#0866d6] focus:ring-2 focus:ring-[#0866d6]/15 sm:flex-none">
                {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <Button variant="secondary" onClick={() => setEditing(true)} className="min-h-11"><Pencil size={15} /> Ändern</Button>
              <Button variant="danger" onClick={remove} aria-label="Bewerbung löschen" title="Bewerbung löschen" className="h-11 w-11 shrink-0 px-0"><Trash2 size={16} /></Button>
            </div>
          </div>

          <Card className="mt-8 max-w-3xl divide-y divide-[#e5e5ea] px-5 md:px-6">
            {application.deadline && <DetailRow label="Bewerben bis" value={new Date(application.deadline).toLocaleDateString("de-CH")} />}
            {application.source && <DetailRow label="Gefunden bei" value={application.source} />}
            {(application.salaryMin || application.salaryMax) && <DetailRow label="Lohn" value={`${application.salaryMin ?? "?"}–${application.salaryMax ?? "?"} ${application.currency ?? "CHF"}`} />}
            {application.notes && <div className="py-5"><h2 className="text-sm font-semibold">Deine Notizen</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{application.notes}</p></div>}
            {application.jobDescription && <div className="py-5"><h2 className="text-sm font-semibold">Zur Stelle</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{application.jobDescription}</p></div>}
            {!application.deadline && !application.source && !application.salaryMin && !application.salaryMax && !application.notes && !application.jobDescription && <p className="py-5 text-sm text-muted">Noch keine weiteren Angaben. Du kannst sie jederzeit ergänzen.</p>}
          </Card>
        </>
      )}
    </WorkspaceShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center"><span className="w-44 shrink-0 text-sm text-muted">{label}</span><span className="min-w-0 break-words text-sm font-medium">{value}</span></div>;
}