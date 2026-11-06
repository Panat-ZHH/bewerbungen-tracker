"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Eye, HandHelping } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { formatDateCh, type ClassDeadline } from "@/lib/teacher-extras";
import { getMyClassDeadlines, getMySelfReports, getMyViewLog, setSelfReport, type ViewLogEntry } from "@/lib/teacher-more";
import { ErrorBanner, teacherError } from "./shared";

/** Student side of the class features: class deadlines, the voluntary "noch keine Lehrstelle" flag and who looked at the data. */
export function StudentClassExtras() {
  const [deadlines, setDeadlines] = useState<ClassDeadline[] | null>(null);
  const [reports, setReports] = useState<{ classId: string; className: string; selfReport: boolean }[]>([]);
  const [log, setLog] = useState<ViewLogEntry[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    Promise.all([getMyClassDeadlines(), getMySelfReports(), getMyViewLog(10)])
      .then(([d, r, l]) => { setDeadlines(d); setReports(r); setLog(l); setError(""); })
      .catch((e) => setError(teacherError(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(classId: string, value: boolean) {
    setReports((list) => list.map((r) => (r.classId === classId ? { ...r, selfReport: value } : r)));
    try { await setSelfReport(classId, value); toast({ message: value ? "Deine Lehrperson sieht jetzt, dass du noch eine Lehrstelle suchst." : "Meldung zurückgenommen.", tone: "success" }); }
    catch (e) { setReports((list) => list.map((r) => (r.classId === classId ? { ...r, selfReport: !value } : r))); toast({ message: teacherError(e), tone: "danger" }); }
  }

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!deadlines) return <Skeleton className="h-24 rounded-[var(--radius-lg)]" />;
  if (deadlines.length === 0 && reports.length === 0 && log.length === 0) return null;
  return (
    <div className="space-y-4">
      {deadlines.length > 0 && (
        <Card className="space-y-3 p-5">
          <h2 className="text-heading flex items-center gap-2"><CalendarClock size={18} aria-hidden /> Fristen deiner Klasse</h2>
          <ul className="divide-y divide-[var(--line)]">{deadlines.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <div className="min-w-0"><p className="text-sm font-semibold break-words">{d.title}</p><p className="text-small text-muted">{d.className}{d.note ? ` · ${d.note}` : ""}</p></div>
              <span className="tabular text-sm font-medium text-[var(--warning-fg)]">{formatDateCh(d.dueDate)}</span>
            </li>
          ))}</ul>
        </Card>
      )}
      {reports.length > 0 && (
        <Card className="space-y-3 p-5">
          <div><h2 className="text-heading flex items-center gap-2"><HandHelping size={18} aria-hidden /> Noch keine Lehrstelle?</h2><p className="text-small text-muted">Freiwillig: Deine Lehrperson sieht nur diese Meldung, auch wenn du deine Bewerbungen nicht teilst. Du kannst sie jederzeit zurücknehmen.</p></div>
          <ul className="space-y-1">{reports.map((r) => (
            <li key={r.classId}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={r.selfReport} onChange={(e) => void toggle(r.classId, e.target.checked)} />
                <span>Ich habe noch keine Lehrstelle (Klasse {r.className})</span>
              </label>
            </li>
          ))}</ul>
        </Card>
      )}
      {log.length > 0 && (
        <Card className="space-y-3 p-5">
          <div><h2 className="text-heading flex items-center gap-2"><Eye size={18} aria-hidden /> Wer hat deine Daten angesehen?</h2><p className="text-small text-muted">Lehrpersonen sehen nur, was du für die Klasse freigegeben hast. Jedes Ansehen und jeder Export wird hier eingetragen.</p></div>
          <ul className="divide-y divide-[var(--line)]">{log.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 py-2 text-sm">
              <span>{e.teacherName || "Eine Lehrperson"} hat {e.kind === "export" ? "deine Daten exportiert" : "angesehen"} <span className="text-muted">({e.className})</span></span>
              <span className="tabular text-small text-muted">{formatDateCh(e.viewedOn)}</span>
            </li>
          ))}</ul>
        </Card>
      )}
    </div>
  );
}
