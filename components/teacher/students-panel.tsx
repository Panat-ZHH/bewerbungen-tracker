"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BellRing, CheckCircle2, ChevronRight, Download, EyeOff, Search, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAvatarUrls } from "@/components/ui/use-avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { downloadCsv, toCsv } from "@/lib/teacher-csv";
import { applicationCsvColumns, buildApplicationCsvLines, studentLabel } from "@/lib/teacher-extras";
import { exportClassApplications } from "@/lib/teacher-more";
import { statusLabels } from "@/lib/utils";
import { StatusBar, TABLE_HEAD, TABLE_ROW, formatDate } from "@/components/classes/shared";
import { nudgeStudent, removeClassStudent, teacherErrorCode, type DashboardClass, type TeacherStudent } from "./api";
import { STUDENT_FILTERS, canNudge, filterStudents, sortStudents, studentCsvColumns, studentMatches, type StudentFilter, type StudentSort } from "./logic";
import { relativeDays, teacherError } from "./shared";

function StatusBadges({ s }: { s: TeacherStudent }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {s.placed && <Badge tone="success"><CheckCircle2 size={12} className="mr-1" aria-hidden />Lehrstelle gefunden</Badge>}
      {s.inactive && <Badge tone="warning">Inaktiv</Badge>}
      {s.hidden && <Badge><EyeOff size={12} className="mr-1" aria-hidden />Teilt nicht</Badge>}
    </span>
  );
}

export function StudentsPanel({ cls, students, onChanged }: { cls: DashboardClass; students: TeacherStudent[]; onChanged: () => void }) {
  const avatars = useAvatarUrls(students.map((s) => s.studentId));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StudentFilter>("all");
  const [sort, setSort] = useState<StudentSort>("activity");
  const [nudge, setNudge] = useState<TeacherStudent[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [nudgeError, setNudgeError] = useState("");
  const [removing, setRemoving] = useState<TeacherStudent | null>(null);
  const [removeError, setRemoveError] = useState("");

  const rows = useMemo(() => sortStudents(filterStudents(students, filter, query), sort), [students, filter, query, sort]);
  const counts = useMemo(() => Object.fromEntries(STUDENT_FILTERS.map((f) => [f.value, students.filter(studentMatches[f.value]).length])) as Record<StudentFilter, number>, [students]);
  const nudgeable = rows.filter((s) => s.inactive && canNudge(s));

  function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`${cls.name.replace(/[^\p{L}\p{N}]+/gu, "-")}-${stamp}.csv`, toCsv(rows, studentCsvColumns(statusLabels)));
    toast({ message: `${rows.length} Zeilen exportiert.`, tone: "success" });
  }

  /** One line per application (consented fields only) plus one line for every student without data. The server logs the export for each student. */
  async function exportApplications() {
    setBusy(true);
    try {
      const data = await exportClassApplications(cls.id);
      const lines = buildApplicationCsvLines(rows, data, (status) => (statusLabels as Record<string, string>)[status]);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`${cls.name.replace(/[^\p{L}\p{N}]+/gu, "-")}-Bewerbungen-${stamp}.csv`, toCsv(lines, applicationCsvColumns));
      toast({ message: `${lines.length} Zeilen exportiert. Die Schülerinnen und Schüler sehen den Export in ihrem Protokoll.`, tone: "success" });
    } catch (e) { toast({ message: teacherError(e), tone: "danger" }); } finally { setBusy(false); }
  }

  async function sendNudges() {
    if (!nudge) return;
    setBusy(true); setNudgeError("");
    let ok = 0; let limited = 0; let failed = "";
    for (const s of nudge) {
      try { await nudgeStudent(cls.id, s.studentId, message.trim() || null); ok++; }
      catch (e) { if (teacherErrorCode(e) === "RATE_LIMITED") limited++; else failed = teacherError(e); }
    }
    setBusy(false);
    if (ok) toast({ message: ok === 1 ? "Erinnerung gesendet." : `${ok} Erinnerungen gesendet.`, tone: "success" });
    if (limited || failed) { setNudgeError(failed || (nudge.length === 1 ? teacherError("RATE_LIMITED") : `${limited} Person(en) wurden in den letzten 3 Tagen schon erinnert und übersprungen.`)); }
    if (!limited && !failed) { setNudge(null); setMessage(""); }
    if (ok) onChanged();
  }

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true); setRemoveError("");
    try { await removeClassStudent(cls.id, removing.studentId); toast({ message: `${studentLabel(removing.displayName)} wurde aus der Klasse entfernt.`, tone: "success" }); setRemoving(null); onChanged(); }
    catch (e) { setRemoveError(teacherError(e)); } finally { setBusy(false); }
  }

  return (
    <section className="space-y-4" aria-label="Schülerliste">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative lg:w-64">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <Input type="search" aria-label="Schüler:innen suchen" placeholder="Name suchen" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9 text-base! sm:text-base!" />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-muted">Sortierung
            <Select aria-label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value as StudentSort)} className="w-auto min-w-60 flex-1 font-normal lg:flex-none">
              <option value="activity">Am längsten inaktiv zuerst</option><option value="total">Meiste Bewerbungen</option><option value="name">Name A–Z</option><option value="joined">Zuletzt beigetreten</option>
            </Select>
          </label>
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <Button variant="secondary" className="min-h-11 sm:min-h-11" icon={<BellRing size={15} />} disabled={nudgeable.length === 0} onClick={() => { setNudge(nudgeable); setNudgeError(""); }}>Inaktive erinnern ({nudgeable.length})</Button>
            <Button variant="ghost" className="min-h-11 sm:min-h-11" icon={<Download size={15} />} disabled={rows.length === 0} onClick={exportCsv}>CSV Übersicht</Button>
            <Button variant="ghost" className="min-h-11 sm:min-h-11" icon={<Download size={15} />} disabled={rows.length === 0 || busy} onClick={() => void exportApplications()}>CSV Bewerbungen</Button>
          </div>
        </div>
        <Segmented className="[&_button]:min-h-11" label="Filter" value={filter} onChange={setFilter} options={STUDENT_FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />
      </div>

      {rows.length === 0 && <EmptyState icon={<Search size={24} />} title="Niemand passt zur Auswahl" description="Ändere Suche oder Filter, um wieder Schüler:innen zu sehen." action={<Button variant="secondary" className="min-h-11 sm:min-h-11" onClick={() => { setFilter("all"); setQuery(""); }}>Zurücksetzen</Button>} />}

      {/* Phones: plain rows with dashed dividers */}
      <ul className={`rows md:hidden ${rows.length > 0 ? "border-y-[length:var(--border-w)] border-[var(--outline)]" : ""}`} aria-label="Schüler:innen als Karten">
        {rows.map((s) => (
          <li key={s.studentId} className="space-y-2.5 py-4">
            <Link href={`/teacher/classes/${cls.id}/students/${s.studentId}`} className="flex min-h-11 items-center gap-3">
              <Avatar name={studentLabel(s.displayName)} src={avatars[s.studentId]} size="sm" />
              <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-bold">{studentLabel(s.displayName)}</p><p className="text-small tabular text-muted">{s.hidden ? "Teilt keine Daten" : `${s.total} Bewerbungen · ${relativeDays(s.lastActivity)}`}</p></div>
              <ChevronRight size={18} strokeWidth={2.4} className="shrink-0" aria-hidden />
            </Link>
            {!s.hidden && <StatusBar counts={s.statusCounts} total={s.total} />}
            <StatusBadges s={s} />
            <div className="flex flex-wrap items-center gap-2">
              {s.inactive && <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-11" icon={<BellRing size={14} />} disabled={!canNudge(s)} onClick={() => { setNudge([s]); setNudgeError(""); }}>{canNudge(s) ? "Erinnern" : "Kürzlich erinnert"}</Button>}
              <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-11" icon={<Trash2 size={14} />} aria-label={`${studentLabel(s.displayName)} aus der Klasse entfernen`} onClick={() => { setRemoving(s); setRemoveError(""); }}>Entfernen</Button>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table on paper, ink line under the head, dashed row dividers */}
      {rows.length > 0 && <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Schüler:innen der Klasse {cls.name}</caption>
          <thead className={TABLE_HEAD}><tr>
            <th scope="col" className="py-3 pr-3">Name</th><th scope="col" className="px-3 py-3 text-right">Bewerb.</th><th scope="col" className="px-3 py-3 text-right">Gespräche</th><th scope="col" className="px-3 py-3 text-right">Zusagen</th>
            <th scope="col" className="min-w-40 px-3 py-3">Verteilung</th><th scope="col" className="px-3 py-3">Letzte Aktivität</th><th scope="col" className="px-3 py-3">Status</th><th scope="col" className="py-3 pl-3 text-right">Aktionen</th>
          </tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.studentId} className={TABLE_ROW}>
                <td className="py-2 pr-3"><Link href={`/teacher/classes/${cls.id}/students/${s.studentId}`} className="flex min-h-11 items-center gap-3 font-bold hover:underline hover:decoration-2 hover:underline-offset-4"><Avatar name={studentLabel(s.displayName)} src={avatars[s.studentId]} size="sm" /><span className="truncate">{studentLabel(s.displayName)}</span></Link></td>
                <td className="tabular px-3 py-2 text-right font-bold">{s.hidden ? "–" : s.total}</td><td className="tabular px-3 py-2 text-right">{s.hidden ? "–" : s.interviews}</td><td className="tabular px-3 py-2 text-right">{s.hidden ? "–" : s.offers}</td>
                <td className="px-3 py-2">{s.hidden ? <span className="text-small text-muted">Nicht sichtbar</span> : <StatusBar counts={s.statusCounts} total={s.total} />}</td>
                <td className="px-3 py-2 whitespace-nowrap text-muted">{s.hidden ? "–" : <span title={formatDate(s.lastActivity ?? undefined)}>{relativeDays(s.lastActivity)}</span>}</td>
                <td className="px-3 py-2"><StatusBadges s={s} /></td>
                <td className="py-2 pl-3"><div className="flex justify-end gap-1">
                  {s.inactive && <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-11" icon={<BellRing size={14} />} disabled={!canNudge(s)} title={canNudge(s) ? "Erinnerung senden" : "Wurde in den letzten 3 Tagen schon erinnert"} onClick={() => { setNudge([s]); setNudgeError(""); }}>{canNudge(s) ? "Erinnern" : "Erinnert"}</Button>}
                  <Button size="sm" variant="ghost" className="min-h-11 min-w-11 sm:min-h-11" aria-label={`${studentLabel(s.displayName)} aus der Klasse entfernen`} onClick={() => { setRemoving(s); setRemoveError(""); }}><Trash2 size={15} /></Button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      <Modal open={!!nudge} onClose={() => setNudge(null)} title={nudge && nudge.length > 1 ? `${nudge.length} inaktive Schüler:innen erinnern` : "Erinnerung senden"} description={nudge && nudge.length === 1 ? `${studentLabel(nudge[0].displayName)} erhält eine freundliche Erinnerung in WendApply. Pro Person ist eine Erinnerung alle 3 Tage möglich.` : "Alle erhalten eine freundliche Erinnerung in WendApply. Pro Person ist eine Erinnerung alle 3 Tage möglich."}>
        <div className="space-y-4">
          <Field label="Eigene Nachricht (optional)" htmlFor="nudge-msg" hint={`${message.length}/200 Zeichen`}><Textarea id="nudge-msg" data-autofocus className="text-base! sm:text-base!" rows={3} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Wie läuft die Suche? Brauchst du Hilfe beim Lebenslauf?" /></Field>
          {nudgeError && <p role="alert" className="text-small text-[var(--danger-fg)]">{nudgeError}</p>}
          <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => setNudge(null)}>{nudgeError ? "Schliessen" : "Abbrechen"}</Button><Button loading={busy} icon={<BellRing size={15} />} onClick={sendNudges}>Erinnerung senden</Button></div>
        </div>
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Aus der Klasse entfernen?" description={removing ? `${studentLabel(removing.displayName)} wird aus der Klasse "${cls.name}" entfernt. Die Bewerbungen der Person bleiben unverändert. Mit einem neuen Einladungslink kann sie wieder beitreten.` : undefined}>
        <div className="space-y-4">
          {removeError && <p role="alert" className="text-small text-[var(--danger-fg)]">{removeError}</p>}
          <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" data-autofocus onClick={() => setRemoving(null)}>Abbrechen</Button><Button variant="danger" loading={busy} onClick={confirmRemove}>Entfernen</Button></div>
        </div>
      </Modal>
    </section>
  );
}
