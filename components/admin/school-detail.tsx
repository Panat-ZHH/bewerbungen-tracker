"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import type { AdminSchoolDetail, AdminSchoolPerson, SchoolLicence } from "@/lib/admin/types";
import { adminFetch, errorText, fieldOf, type AdminResult } from "./api";
import { AuditList, ConfirmModal, Facts, Section, fmtDate, isoDay, type OpenDetail } from "./shared";
import { LicenceBadge, licenceEnd } from "./schools-tab";
import { freeAccessActive, freeAccessBody, freeAccessLabel, type FreeAccessForm } from "@/lib/admin/free-access";
import { FreeAccessBadge, FreeAccessFields, emptyFreeAccessForm } from "./free-access";

type Action = "grant_access" | "revoke_access" | "assign_licence" | "update_licence" | "revoke_licence" | "add_admin" | "remove_admin" | "add_teacher" | "remove_teacher";

const TITLE: Record<Action, string> = {
  grant_access: "Gratis-Zugang für die Schule",
  revoke_access: "Gratis-Zugang entziehen",
  assign_licence: "Lizenz vergeben",
  update_licence: "Lizenz anpassen",
  revoke_licence: "Lizenz widerrufen",
  add_admin: "Schuladmin hinzufügen",
  remove_admin: "Schuladmin entfernen",
  add_teacher: "Lehrperson hinzufügen",
  remove_teacher: "Lehrperson entfernen",
};
const DONE: Record<Action, string> = {
  grant_access: "Gratis-Zugang für die Schule gegeben.",
  revoke_access: "Gratis-Zugang der Schule entzogen.",
  assign_licence: "Lizenz vergeben.",
  update_licence: "Lizenz angepasst.",
  revoke_licence: "Lizenz widerrufen.",
  add_admin: "Schuladmin hinzugefügt.",
  remove_admin: "Schuladmin entfernt.",
  add_teacher: "Lehrperson hinzugefügt.",
  remove_teacher: "Lehrperson entfernt.",
};
const LABELS: Record<string, string> = {
  package: "Paket", status: "Status", student_limit: "Max. Lernende", start: "Start", end: "Ende", billing_interval: "Abrechnung",
  notes: "Notizen", until: "Gratis bis", note: "Notiz", forever: "Unbefristet", valid_until: "Gültig bis", pilot_end: "Pilot bis", email: "E-Mail", licence_id: "Lizenz", user_id: "Person",
};

type Form = {
  package: string; status: string; student_limit: string; start: string; end: string; billing_interval: string; notes: string;
  valid_until: string; pilot_end: string; email: string;
};
const emptyForm = (): Form => ({
  package: "pilot", status: "", student_limit: "", start: isoDay(0), end: "", billing_interval: "yearly", notes: "", valid_until: "", pilot_end: "", email: "",
});

type Target = { action: Action; licence?: SchoolLicence; person?: AdminSchoolPerson };

export function SchoolDetail({ id, onOpen, onChanged }: { id: string; onOpen: OpenDetail; onChanged: () => void }) {
  const [res, setRes] = useState<AdminResult<AdminSchoolDetail> | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [free, setFree] = useState<FreeAccessForm>(emptyFreeAccessForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRes(await adminFetch<AdminSchoolDetail>(`/api/admin/schools/${encodeURIComponent(id)}`));
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function openAction(t: Target) {
    const f = emptyForm();
    if (t.licence) {
      f.valid_until = t.licence.valid_until ?? "";
      f.pilot_end = t.licence.pilot_end ?? "";
      f.student_limit = String(t.licence.student_limit ?? "");
      f.notes = t.licence.notes ?? "";
    }
    setForm(f); setFree(emptyFreeAccessForm()); setError(null); setBadField(null); setTarget(t);
  }
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const invalid = (k: string) => (badField === k ? true : undefined);

  async function submit() {
    if (!target) return;
    const { action, licence, person } = target;
    const body: Record<string, unknown> = { action, confirm: true };
    switch (action) {
      case "grant_access": Object.assign(body, freeAccessBody(free)); break;
      case "revoke_access": break;
      case "assign_licence":
        body.package = form.package;
        body.billing_interval = form.billing_interval;
        if (form.status) body.status = form.status;
        if (form.student_limit.trim()) body.student_limit = Number(form.student_limit);
        if (form.start) body.start = form.start;
        if (form.end) body.end = form.end;
        if (form.notes.trim()) body.notes = form.notes.trim();
        break;
      case "update_licence": {
        if (!licence) return;
        body.licence_id = licence.id;
        if (licence.status === "pilot") { if (form.pilot_end && form.pilot_end !== (licence.pilot_end ?? "")) body.pilot_end = form.pilot_end; }
        else if (form.valid_until && form.valid_until !== (licence.valid_until ?? "")) body.valid_until = form.valid_until;
        if (form.student_limit.trim() && Number(form.student_limit) !== licence.student_limit) body.student_limit = Number(form.student_limit);
        if (form.notes.trim() !== (licence.notes ?? "").trim()) body.notes = form.notes.trim();
        if (Object.keys(body).length === 3) { setError("Du hast nichts geändert."); return; }
        break;
      }
      case "revoke_licence": if (licence) body.licence_id = licence.id; break;
      case "add_admin": case "add_teacher": body.email = form.email.trim(); break;
      case "remove_admin": case "remove_teacher": if (person) body.user_id = person.user_id; break;
    }
    setBusy(true); setError(null); setBadField(null);
    const r = await adminFetch(`/api/admin/schools/${encodeURIComponent(id)}`, { method: "POST", body });
    setBusy(false);
    if (!r.ok) {
      setError(errorText(r, LABELS));
      setBadField(fieldOf(r));
      if (r.status === 429) toast({ message: errorText(r), tone: "danger" });
      return;
    }
    toast({ message: DONE[action] });
    setTarget(null);
    onChanged();
    void load();
  }

  if (!res) return <div aria-busy="true" className="space-y-3" data-testid="admin-school-detail"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-48 w-full" /></div>;
  if (!res.ok) {
    return (
      <div className="space-y-3" data-testid="admin-school-detail">
        <StatusMessage tone="danger">{errorText(res)}</StatusMessage>
        <Button variant="secondary" size="sm" onClick={() => { setRes(null); void load(); }}>Nochmals laden</Button>
      </div>
    );
  }
  const s = res.data;
  const action = target?.action;
  const freeText = freeAccessLabel(s.free_access, fmtDate);

  const people = (list: AdminSchoolPerson[], remove: "remove_admin" | "remove_teacher", empty: string) => (
    list.length === 0 ? <p className="text-small text-muted">{empty}</p> : (
      <ul className="rows">
        {list.map((p) => (
          <li key={p.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <button type="button" onClick={() => onOpen({ kind: "user", id: p.user_id })} className="min-w-0 text-left text-sm">
              <span className="break-all font-semibold text-[var(--brand)] underline underline-offset-4">{p.email ?? p.user_id.slice(0, 8)}</span>
              {p.name && <span className="text-muted"> · {p.name}</span>}
            </button>
            <Button size="sm" variant="ghost" data-testid={`admin-action-${remove}`} onClick={() => openAction({ action: remove, person: p })}>Entfernen</Button>
          </li>
        ))}
      </ul>
    )
  );

  return (
    <div className="animate-rise space-y-8" data-testid="admin-school-detail">
      <header className="space-y-2">
        <h1 className="text-title break-words">{s.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <FreeAccessBadge grant={s.free_access} />
          <LicenceBadge licence={s.licence} />
          <span className="text-small text-muted">{[s.canton_or_state, s.country].filter(Boolean).join(" · ")} · erstellt {fmtDate(s.created_at)}</span>
        </div>
        <p className="text-small tabular">{s.students} Lernende · {s.teachers} Lehrpersonen · {s.admins} Admins</p>
      </header>

      <Card>
        <CardContent className="space-y-3" data-testid="admin-school-free">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-heading">Gratis-Zugang</h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" data-testid="admin-action-grant_access" onClick={() => openAction({ action: "grant_access" })}>{freeText ? "Ändern" : "Gratis-Zugang geben"}</Button>
              {s.free_access && <Button size="sm" variant="danger" data-testid="admin-action-revoke_access" onClick={() => openAction({ action: "revoke_access" })}>Entziehen</Button>}
            </div>
          </div>
          <p className="text-small text-muted">
            {freeText
              ? <>{freeText}{s.free_access?.note ? ` · ${s.free_access.note}` : ""}{s.free_access?.granted_at ? ` · seit ${fmtDate(s.free_access.granted_at)}` : ""}. Alle Lernenden, Lehrpersonen und Schuladmins dieser Schule haben Zugang, ohne Platzbeschränkung.</>
              : s.free_access && !freeAccessActive(s.free_access) ? `Abgelaufen am ${fmtDate(s.free_access.until)}.` : "Kein Gratis-Zugang. Zugang nur über eine gültige Lizenz."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-heading">Lizenzen</h2>
            <Button size="sm" data-testid="admin-action-assign_licence" icon={<Plus size={16} strokeWidth={2.4} aria-hidden />} onClick={() => openAction({ action: "assign_licence" })}>Lizenz vergeben</Button>
          </div>
          {s.licences.length === 0 ? <p className="text-small text-muted">Noch keine Lizenz.</p> : (
            <ul className="rows">
              {s.licences.map((l) => {
                const closed = l.status === "cancelled" || l.status === "expired";
                return (
                  <li key={l.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <LicenceBadge licence={l} />
                      <p className="text-small text-muted">
                        {l.status === "pilot" ? `Pilot ${fmtDate(l.pilot_start)} bis ${fmtDate(l.pilot_end)}` : `${fmtDate(l.valid_from)} bis ${fmtDate(l.valid_until)}`}
                        {" "}· max. {l.student_limit} Lernende · {l.billing_interval === "monthly" ? "monatlich" : "jährlich"}
                      </p>
                      {l.notes && <p className="text-small break-words">{l.notes}</p>}
                    </div>
                    {!closed && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button size="sm" variant="secondary" data-testid="admin-action-update_licence" onClick={() => openAction({ action: "update_licence", licence: l })}>Anpassen</Button>
                        {l.status !== "cancelled" && <Button size="sm" variant="danger" data-testid="admin-action-revoke_licence" onClick={() => openAction({ action: "revoke_licence", licence: l })}>Widerrufen</Button>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Schuladmins" actions={<Button size="sm" variant="secondary" data-testid="admin-action-add_admin" onClick={() => openAction({ action: "add_admin" })}>Hinzufügen</Button>}>
          {people(s.admin_users, "remove_admin", "Noch kein Schuladmin.")}
        </Section>
        <Section title="Lehrpersonen" actions={<Button size="sm" variant="secondary" data-testid="admin-action-add_teacher" onClick={() => openAction({ action: "add_teacher" })}>Hinzufügen</Button>}>
          {people(s.teacher_users, "remove_teacher", "Noch keine Lehrperson.")}
        </Section>
      </div>

      <Section title="Klassen">
        {s.classes.length === 0 ? <p className="text-small text-muted">Keine Klassen.</p> : (
          <ul className="rows">
            {s.classes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-semibold">{c.name}</span>
                <span className="text-muted">· {c.students} Lernende</span>
                {c.archived && <Badge tone="neutral">archiviert</Badge>}
                <button type="button" onClick={() => onOpen({ kind: "user", id: c.teacher_id })} className="text-small font-semibold text-[var(--brand)] underline underline-offset-4">Lehrperson öffnen</button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Protokoll">
        <AuditList entries={s.audit} onOpen={onOpen} />
      </Section>

      <ConfirmModal
        open={target !== null}
        title={action ? TITLE[action] : ""}
        description={s.name}
        danger={action === "revoke_access" || action === "revoke_licence" || action === "remove_admin" || action === "remove_teacher"}
        submitLabel={action === "revoke_access" ? "Entziehen" : action === "revoke_licence" ? "Widerrufen" : action?.startsWith("remove") ? "Entfernen" : "Bestätigen"}
        busy={busy}
        error={error}
        onClose={() => setTarget(null)}
        onSubmit={submit}
      >
        {action === "grant_access" && (
          <>
            {freeText && <p className="text-small">Jetzt: <strong>{freeText}</strong>. Wird ersetzt.</p>}
            <FreeAccessFields scope="school" form={free} onChange={setFree} invalid={invalid} />
          </>
        )}
        {action === "revoke_access" && <p className="text-body">Der Gratis-Zugang ({freeText ?? "abgelaufen"}) wird sofort entzogen. Danach braucht die Schule wieder eine gültige Lizenz.</p>}
        {action === "assign_licence" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Paket" htmlFor="f-package">
              <Select id="f-package" value={form.package} onChange={set("package")} aria-invalid={invalid("package")} data-autofocus>
                <option value="pilot">Pilot</option>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
                <option value="custom">Individuell</option>
              </Select>
            </Field>
            <Field label="Status" htmlFor="f-status" hint="Leer = passend zum Paket">
              <Select id="f-status" value={form.status} onChange={set("status")} aria-invalid={invalid("status")}>
                <option value="">Automatisch</option>
                <option value="pilot">Pilot</option>
                <option value="active">Aktiv</option>
              </Select>
            </Field>
            <Field label={form.package === "custom" ? "Max. Lernende" : "Max. Lernende (optional)"} htmlFor="f-limit" hint={form.package === "custom" ? "Pflicht bei «Individuell»" : "Leer = Standard des Pakets"}>
              <Input id="f-limit" type="number" min={1} max={100000} inputMode="numeric" value={form.student_limit} onChange={set("student_limit")} aria-invalid={invalid("student_limit")} />
            </Field>
            <Field label="Abrechnung" htmlFor="f-interval">
              <Select id="f-interval" value={form.billing_interval} onChange={set("billing_interval")} aria-invalid={invalid("billing_interval")}>
                <option value="yearly">Jährlich</option>
                <option value="monthly">Monatlich</option>
              </Select>
            </Field>
            <Field label="Start (optional)" htmlFor="f-start">
              <Input id="f-start" type="date" value={form.start} onChange={set("start")} aria-invalid={invalid("start")} />
            </Field>
            <Field label="Ende (optional)" htmlFor="f-end">
              <Input id="f-end" type="date" min={form.start || undefined} value={form.end} onChange={set("end")} aria-invalid={invalid("end")} />
            </Field>
            <Field label="Notizen (optional)" htmlFor="f-notes" className="sm:col-span-2">
              <Textarea id="f-notes" maxLength={2000} value={form.notes} onChange={set("notes")} aria-invalid={invalid("notes")} />
            </Field>
          </div>
        )}
        {action === "update_licence" && target?.licence && (
          <>
            <p className="text-small text-muted">{target.licence.package} · jetzt bis {fmtDate(licenceEnd(target.licence))}</p>
            {target.licence.status === "pilot" ? (
              <Field label="Pilot bis" htmlFor="f-pilot-end">
                <Input id="f-pilot-end" type="date" min={target.licence.pilot_start ?? undefined} value={form.pilot_end} onChange={set("pilot_end")} aria-invalid={invalid("pilot_end")} data-autofocus />
              </Field>
            ) : (
              <Field label="Gültig bis" htmlFor="f-valid-until">
                <Input id="f-valid-until" type="date" min={target.licence.valid_from ?? undefined} value={form.valid_until} onChange={set("valid_until")} aria-invalid={invalid("valid_until")} data-autofocus />
              </Field>
            )}
            <Field label="Max. Lernende" htmlFor="f-u-limit">
              <Input id="f-u-limit" type="number" min={1} max={100000} inputMode="numeric" value={form.student_limit} onChange={set("student_limit")} aria-invalid={invalid("student_limit")} />
            </Field>
            <Field label="Notizen" htmlFor="f-u-notes">
              <Textarea id="f-u-notes" maxLength={2000} value={form.notes} onChange={set("notes")} aria-invalid={invalid("notes")} />
            </Field>
          </>
        )}
        {action === "revoke_licence" && target?.licence && (
          <p className="text-body">Die Lizenz «{target.licence.package}» (bis {fmtDate(licenceEnd(target.licence))}) wird sofort beendet. Lernende und Lehrpersonen dieser Schule verlieren den Zugang über die Schule.</p>
        )}
        {(action === "add_admin" || action === "add_teacher") && (
          <Field label="E-Mail" htmlFor="f-email" hint="Die Person braucht schon ein Konto.">
            <Input id="f-email" type="email" autoComplete="off" value={form.email} onChange={set("email")} aria-invalid={invalid("email")} data-autofocus />
          </Field>
        )}
        {(action === "remove_admin" || action === "remove_teacher") && target?.person && (
          <p className="text-body">{target.person.email ?? target.person.user_id} wird als {action === "remove_admin" ? "Schuladmin" : "Lehrperson"} dieser Schule entfernt. Das Konto bleibt bestehen.</p>
        )}
      </ConfirmModal>

      <Facts items={[["Schul-ID", <code key="id" className="break-all font-mono text-xs">{s.id}</code>]]} />
    </div>
  );
}
