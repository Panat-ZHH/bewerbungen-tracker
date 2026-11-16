"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarClock, Flag, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { formatDateCh } from "@/lib/teacher-extras";
import { createClassGoal, deleteClassGoal, listClassGoals, updateClassGoal, type ClassGoal } from "@/lib/b2b/client";
import { ErrorBanner, teacherError } from "@/components/teacher/shared";
import { GOAL_DESCRIPTION_MAX, GOAL_METRICS, GOAL_TARGET_MAX, GOAL_TITLE_MAX, daysRemaining, goalCaption, goalProblem, goalStatus, metricLabel, metricUnit, type GoalDraft, type GoalMetric } from "./logic";
import { ProgressBar } from "./progress-bar";
import { ClassVillage } from "./class-village";

const EMPTY: GoalDraft = { title: "", description: "", metric: "trial_days", target: 2, dueDate: "" };

/** One goal with its shared class progress. `actions` are the teacher's edit/delete buttons. */
export function GoalCard({ goal, actions }: { goal: ClassGoal; actions?: React.ReactNode }) {
  const st = goalStatus(goal);
  const due = daysRemaining(goal.dueDate);
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-bold">{goal.title}{st.kind === "progress" && st.done && <Badge tone="success"><Flag size={12} className="mr-1" aria-hidden />Erreicht</Badge>}</h3>
          <p className="text-small mt-0.5 text-muted">{metricLabel(goal.metric)}{goal.target !== null && goal.metric !== "custom" && <> · Ziel: {goal.target} {metricUnit(goal.metric, goal.target)} pro Person</>}{goal.dueDate && <> · <CalendarClock size={12} className="mb-0.5 inline" aria-hidden /> bis {formatDateCh(goal.dueDate)}</>}</p>
          {goal.description && <p className="mt-1.5 text-sm">{goal.description}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-1">{actions}</div>}
      </div>
      {st.kind === "progress" ? (
        <div className="mt-3">
          <ProgressBar value={st.reached} max={Math.max(1, st.counted)} tone={st.done ? "sun" : "mint"} label={`Fortschritt: ${goal.title}`} valueText={`${st.reached} von ${st.counted} haben das Ziel erreicht`} />
          <p className="text-small mt-1.5 text-muted">{goalCaption(st, goal.metric, due)}</p>
        </div>
      ) : (
        <p className="text-small mt-2 text-muted">{st.kind === "custom" ? "Eigenes Ziel: den Fortschritt besprecht ihr im Unterricht." : st.kind === "suppressed" ? "Der Fortschritt erscheint, sobald mindestens drei Personen ihre Daten mit der Klasse teilen." : "Der Fortschritt wird angezeigt, sobald er berechnet werden kann."}</p>
      )}
    </li>
  );
}

/** Teacher: create, edit and delete the goals of one class. Hidden completely if class goals are not deployed yet. */
export function ClassGoalsPanel({ classId, archived = false }: { classId: string; archived?: boolean }) {
  const [goals, setGoals] = useState<ClassGoal[] | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ClassGoal | "new" | null>(null);
  const [draft, setDraft] = useState<GoalDraft>(EMPTY);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<ClassGoal | null>(null);

  const load = useCallback(() => { listClassGoals(classId).then((g) => { setGoals(g); setError(""); }).catch((e) => setError(teacherError(e))); }, [classId]);
  useEffect(() => { load(); }, [load]);

  function open(goal: ClassGoal | "new") {
    setEditing(goal); setFormError("");
    setDraft(goal === "new" ? EMPTY : { title: goal.title, description: goal.description, metric: goal.metric, target: goal.target ?? "", dueDate: goal.dueDate ?? "" });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const problem = goalProblem(draft);
    if (problem) { setFormError(problem); return; }
    setSaving(true); setFormError("");
    const input = { title: draft.title, description: draft.description, metric: draft.metric, target: draft.metric === "custom" && draft.target === "" ? null : Number(draft.target), dueDate: draft.dueDate || null };
    try {
      if (editing === "new") await createClassGoal(classId, input); else if (editing) await updateClassGoal(editing.id, input);
      toast({ message: editing === "new" ? "Ziel erstellt." : "Ziel gespeichert.", tone: "success" });
      setEditing(null); load();
    } catch (e) { setFormError(teacherError(e)); } finally { setSaving(false); }
  }
  async function remove() {
    if (!removing) return;
    setSaving(true);
    try { await deleteClassGoal(removing.id); toast({ message: "Ziel gelöscht.", tone: "success" }); setRemoving(null); load(); }
    catch (e) { toast({ message: teacherError(e), tone: "danger" }); } finally { setSaving(false); }
  }

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (goals === undefined) return <Skeleton className="h-32 rounded-[var(--radius-lg)]" />;
  if (goals === null) return <EmptyState icon={<Target size={26} />} title="Klassenziele kommen bald" description="Diese Funktion wird gerade für deine Schule eingerichtet. Sobald sie bereit ist, kannst du hier gemeinsame Ziele setzen." />;

  const metric = GOAL_METRICS.find((m) => m.value === draft.metric);
  return (
    <section aria-labelledby="b2b-goals-h" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="b2b-goals-h" className="text-heading">Klassenziele</h2>
          <p className="text-small mt-1 max-w-2xl text-muted">Gemeinsame Ziele motivieren mehr als Ranglisten. Die Klasse sieht nur den gemeinsamen Fortschritt, nie einzelne Personen.</p>
        </div>
        {!archived && <Button className="min-h-11 sm:min-h-11" icon={<Plus size={16} />} onClick={() => open("new")}>Ziel erstellen</Button>}
      </div>
      {goals.length === 0 ? (
        <EmptyState icon={<Target size={26} />} title="Noch keine Klassenziele" description="Zum Beispiel: «Alle schnuppern zweimal bis zu den Sportferien» oder «Alle haben ein Bewerbungsdossier». Wichtig sind sinnvolle Schritte, nicht möglichst viele Bewerbungen." action={!archived ? <Button variant="sun" onClick={() => open("new")}>Erstes Ziel erstellen</Button> : undefined} />
      ) : (
        <>
          <ClassVillage goals={goals} />
          <ul className="rows border-y-[length:var(--border-w)] border-[var(--outline)]" aria-label="Klassenziele">
            {goals.map((g) => (
              <GoalCard key={g.id} goal={g} actions={!archived && <>
                <Button size="sm" variant="ghost" className="min-h-11 min-w-11 sm:min-h-11" aria-label={`Ziel «${g.title}» bearbeiten`} onClick={() => open(g)}><Pencil size={15} /></Button>
                <Button size="sm" variant="ghost" className="min-h-11 min-w-11 sm:min-h-11" aria-label={`Ziel «${g.title}» löschen`} onClick={() => setRemoving(g)}><Trash2 size={15} /></Button>
              </>} />
            ))}
          </ul>
        </>
      )}

      <Modal open={editing !== null} onClose={() => !saving && setEditing(null)} title={editing === "new" ? "Klassenziel erstellen" : "Klassenziel bearbeiten"} description="Die Klasse sieht Titel, Beschreibung und wie viele das Ziel schon erreicht haben, nie wer.">
        <form onSubmit={save} className="space-y-4" noValidate>
          <Field label="Titel" htmlFor="goal-title" hint={`${draft.title.length}/${GOAL_TITLE_MAX} Zeichen`}><Input id="goal-title" data-autofocus className="text-base! sm:text-base!" maxLength={GOAL_TITLE_MAX} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="z. B. Alle schnuppern zweimal bis Ende Januar" /></Field>
          <Field label="Was wird gezählt?" htmlFor="goal-metric" hint={metric?.hint}>
            <Select id="goal-metric" value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value as GoalMetric })}>{GOAL_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={draft.metric === "custom" ? "Zielwert pro Person (optional)" : "Zielwert pro Person"} htmlFor="goal-target" hint={draft.metric === "custom" ? undefined : "Das Ziel ist erreicht, wenn alle diesen Wert schaffen."}><Input id="goal-target" type="number" inputMode="numeric" min={1} max={GOAL_TARGET_MAX} className="text-base! sm:text-base!" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} /></Field>
            <Field label="Bis wann? (optional)" htmlFor="goal-due"><Input id="goal-due" type="date" className="text-base! sm:text-base!" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></Field>
          </div>
          <Field label="Beschreibung (optional)" htmlFor="goal-desc" hint={`${draft.description.length}/${GOAL_DESCRIPTION_MAX} Zeichen`}><Textarea id="goal-desc" rows={3} maxLength={GOAL_DESCRIPTION_MAX} className="text-base! sm:text-base!" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Warum ist das Ziel wichtig? Wie helft ihr euch gegenseitig?" /></Field>
          {formError && <p role="alert" className="text-small text-[var(--danger-fg)]">{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Abbrechen</Button><Button type="submit" loading={saving}>Speichern</Button></div>
        </form>
      </Modal>

      <Modal open={!!removing} onClose={() => !saving && setRemoving(null)} title="Ziel löschen?" description={removing ? `Das Ziel «${removing.title}» wird für die ganze Klasse entfernt. Die Bewerbungsdaten bleiben unverändert.` : undefined}>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" data-autofocus onClick={() => setRemoving(null)}>Abbrechen</Button><Button variant="danger" loading={saving} onClick={remove}>Löschen</Button></div>
      </Modal>
    </section>
  );
}
