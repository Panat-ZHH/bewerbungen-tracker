"use client";

// «Familienpaket» block of the person panel: current plan, family, members, licence and the two admin actions
// (vergeben / entziehen). Data: GET/POST/DELETE /api/admin/users/:id/family (admin_family_* RPCs, run as the admin).
import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import type { AdminFamilyStatus } from "@/lib/admin/types";
import {
  FAMILY_DURATIONS, FAMILY_LICENCE_STATE_LABEL, FAMILY_MEMBER_STATUS_LABEL, FAMILY_NOTE_MAX, FAMILY_PLAN_KIND_LABEL, FAMILY_ROLE_LABEL,
  FAMILY_SEAT_LIMITS, addMonthsDay, assignedByLabel, emptyFamilyGrantForm, familyGrantBody, type FamilyGrantForm,
} from "@/lib/admin/family";
import { adminFetch, errorText, fieldOf, type AdminResult } from "./api";
import { ConfirmModal, Facts, Section, fmtDate, isoDay } from "./shared";

const LABELS: Record<string, string> = { until: "Gültig bis", note: "Notiz", seats_parents: "Plätze Eltern", seats_children: "Plätze Kinder" };

const STATE_TONE: Record<string, BadgeTone> = { active: "success", pilot: "success", paused: "warning", expired: "coral", cancelled: "neutral", trial: "info", not_started: "info" };

/** "bis 20.11.2027" / "unbefristet" for the licence end (valid_until is the last day with access). */
const untilText = (v: string | null | undefined) => (v ? `bis ${fmtDate(v)}` : "unbefristet");

export function FamilyPackSection({ userId, userLabel, adminEmail, onChanged }: {
  userId: string;
  /** Name / e-mail of the person, shown in the dialogs. */
  userLabel?: string;
  /** Admin uuid → e-mail (from the audit rows), for «Vergeben von». */
  adminEmail?: (id: string) => string | null;
  onChanged: () => void;
}) {
  const [res, setRes] = useState<AdminResult<AdminFamilyStatus> | null>(null);
  const [dialog, setDialog] = useState<"grant" | "revoke" | null>(null);
  const [form, setForm] = useState<FamilyGrantForm>(emptyFamilyGrantForm);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<string | null>(null);
  const path = `/api/admin/users/${encodeURIComponent(userId)}/family`;

  const load = useCallback(async () => { setRes(await adminFetch<AdminFamilyStatus>(path)); }, [path]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function open(kind: "grant" | "revoke") {
    const s = res?.ok ? res.data : null;
    const lic = s?.licence?.manual && s.licence.state === "active" ? s.licence : null;
    // Changing an existing grant starts from its current end date and seats (so e.g. a seat change never silently
    // turns an unlimited grant into a 12-month one).
    setForm({ ...emptyFamilyGrantForm(), ...(lic ? {
      duration: lic.valid_until ? "custom" as const : "unlimited" as const, custom: lic.valid_until?.slice(0, 10) ?? "",
      seats_parents: String(lic.seats_parents), seats_children: String(lic.seats_children),
    } : {}) });
    setNote("");
    setError(null);
    setBadField(null);
    setDialog(kind);
  }
  const invalid = (k: string) => (badField === k ? true : undefined);

  async function submit() {
    if (!dialog) return;
    if (dialog === "grant" && form.duration === "custom" && !form.custom) { setError("Bitte wähle ein Datum."); setBadField("until"); return; }
    setBusy(true);
    setError(null);
    setBadField(null);
    const r = dialog === "grant"
      ? await adminFetch(path, { method: "POST", body: { ...familyGrantBody(form), confirm: true } })
      : await adminFetch(path, { method: "DELETE", body: { confirm: true, ...(note.trim() ? { note: note.trim() } : {}) } });
    setBusy(false);
    if (!r.ok) {
      setError(errorText(r, LABELS));
      setBadField(fieldOf(r));
      if (r.status === 429) toast({ message: errorText(r), tone: "danger" });
      return;
    }
    toast({ message: dialog === "grant" ? "Familienpaket vergeben." : "Familienpaket entzogen." });
    setDialog(null);
    void load();
    onChanged();
  }

  const s = res?.ok ? res.data : null;
  const lic = s?.licence ?? null;
  const manualActive = Boolean(lic?.manual && lic.state === "active");
  const presetEnd = form.duration === "unlimited" ? null : form.duration === "custom" ? form.custom || null : addMonthsDay(Number(form.duration));

  return (
    <Section title="Familienpaket" className="family-pack" actions={s && (
      <>
        {s.can_grant && (
          <Button size="sm" variant="primary" icon={<Users size={16} aria-hidden />} data-testid="admin-family-grant" onClick={() => open("grant")}>
            {manualActive ? "Familienpaket ändern" : "Familienpaket vergeben"}
          </Button>
        )}
        {s.can_revoke && <Button size="sm" variant="danger" data-testid="admin-family-revoke" onClick={() => open("revoke")}>Familienpaket entziehen</Button>}
      </>
    )}>
      <div data-testid="admin-family-pack" aria-busy={res ? undefined : true}>
        {!res && (<><p role="status" className="sr-only">Familienpaket wird geladen …</p><Skeleton className="h-24 w-full" /></>)}
        {res && !res.ok && (
          <div className="space-y-2">
            <StatusMessage tone="danger">{res.status === 503 ? "Familienpakete sind auf diesem Server noch nicht eingerichtet." : errorText(res)}</StatusMessage>
            <Button variant="secondary" size="sm" onClick={() => { setRes(null); void load(); }}>Nochmals laden</Button>
          </div>
        )}
        {s && (
          <div className="space-y-3">
            {s.stripe_managed && <StatusMessage tone="info">Diese Familie zahlt über Stripe. Das Familienpaket lässt sich hier nicht ändern – zuerst in Stripe kündigen.</StatusMessage>}
            {!s.eligible && <StatusMessage tone="info">Lehrpersonen und Schuladmins bekommen keinen Zugang über eine Familie.</StatusMessage>}
            {s.family && s.family.my_status !== "active" && <StatusMessage tone="warning">Die Person ist noch nicht aktiv in ihrer Familie (Einladung offen).</StatusMessage>}
            <Facts items={[
              ["Aktueller Plan", <span key="p" data-testid="admin-family-plan" data-kind={s.plan_kind}>{FAMILY_PLAN_KIND_LABEL[s.plan_kind] ?? s.plan_kind}</span>],
              ["Familie", s.family ? `${s.family.name} · als ${FAMILY_ROLE_LABEL[s.family.my_role] ?? s.family.my_role}` : "keine"],
              ["Lizenz", lic
                ? <span key="l" className="flex flex-wrap items-center gap-2" data-testid="admin-family-licence">
                    <Badge tone={STATE_TONE[lic.state ?? ""] ?? "neutral"}>{FAMILY_LICENCE_STATE_LABEL[lic.state ?? ""] ?? lic.state ?? lic.status}</Badge>
                    <span>{untilText(lic.valid_until)}</span>
                    <span className="text-muted">· {lic.manual ? "vom Admin" : lic.source === "stripe" ? "über Stripe" : "manuell"}</span>
                  </span>
                : "keins"],
              ...(lic ? [
                ["Plätze", `${lic.seats_parents} ${lic.seats_parents === 1 ? "Elternteil" : "Eltern"} · ${lic.seats_children} ${lic.seats_children === 1 ? "Kind" : "Kinder"}`] as [string, string],
                ["Vergeben von", `${assignedByLabel(lic.assigned_by, adminEmail)} · ${fmtDate(lic.created_at)}`] as [string, string],
                ...(lic.notes ? [["Notiz", lic.notes] as [string, string]] : []),
              ] : []),
            ]} />
            {s.members.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-small font-semibold text-muted" id={`fam-members-${userId}`}>Mitglieder ({s.members.length})</h4>
                <ul className="rows text-sm" aria-labelledby={`fam-members-${userId}`} data-testid="admin-family-members">
                  {s.members.map((m) => (
                    <li key={m.user_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
                      <span className="min-w-0 break-all font-semibold">{m.email ?? "ohne E-Mail"}</span>
                      <Badge tone="paper">{FAMILY_ROLE_LABEL[m.role] ?? m.role}</Badge>
                      <span className="text-small text-muted">{FAMILY_MEMBER_STATUS_LABEL[m.status] ?? m.status}{m.user_id === userId ? " · diese Person" : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={dialog !== null}
        title={dialog === "grant" ? (manualActive ? "Familienpaket ändern" : "Familienpaket vergeben") : "Familienpaket entziehen"}
        description={userLabel}
        danger={dialog === "revoke"}
        submitLabel={dialog === "grant" ? "Vergeben" : "Entziehen"}
        busy={busy}
        error={error}
        onClose={() => setDialog(null)}
        onSubmit={submit}
      >
        {dialog === "grant" && (
          <>
            <p className="text-small text-muted">
              {s?.family
                ? `Gilt für alle Mitglieder der Familie «${s.family.name}». Kein Stripe-Abo, keine Rechnung.`
                : "Es wird eine Familie «Familie» angelegt, mit dieser Person als erstem Mitglied. Weitere Mitglieder kommen über die normale Familien-Einladung dazu."}
            </p>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">Dauer</legend>
              <div className="flex flex-wrap gap-2">
                {FAMILY_DURATIONS.map((d) => (
                  <Button key={d.value} type="button" size="sm" variant={form.duration === d.value ? "primary" : "secondary"} aria-pressed={form.duration === d.value}
                    data-testid={`admin-family-duration-${d.value}`} onClick={() => setForm((f) => ({ ...f, duration: d.value, custom: d.value === "custom" && !f.custom ? addMonthsDay(12) : f.custom }))}>
                    {d.label}
                  </Button>
                ))}
              </div>
            </fieldset>
            {form.duration === "custom" && (
              <Field label="Gültig bis" htmlFor="f-family-until" hint="Letzter Tag mit Zugang.">
                <Input id="f-family-until" type="date" min={isoDay(0)} value={form.custom} onChange={(e) => setForm((f) => ({ ...f, custom: e.target.value }))} aria-invalid={invalid("until")} />
              </Field>
            )}
            <p className="text-small" data-testid="admin-family-summary">{presetEnd ? <>Zugang bis und mit <strong>{fmtDate(presetEnd)}</strong>.</> : <>Zugang <strong>unbefristet</strong>, bis du ihn entziehst.</>}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plätze Eltern" htmlFor="f-family-parents" hint={`${FAMILY_SEAT_LIMITS.parents.min}–${FAMILY_SEAT_LIMITS.parents.max}`}>
                <Input id="f-family-parents" type="number" inputMode="numeric" min={FAMILY_SEAT_LIMITS.parents.min} max={FAMILY_SEAT_LIMITS.parents.max}
                  value={form.seats_parents} onChange={(e) => setForm((f) => ({ ...f, seats_parents: e.target.value }))} aria-invalid={invalid("seats_parents")} />
              </Field>
              <Field label="Plätze Kinder" htmlFor="f-family-children" hint={`${FAMILY_SEAT_LIMITS.children.min}–${FAMILY_SEAT_LIMITS.children.max}`}>
                <Input id="f-family-children" type="number" inputMode="numeric" min={FAMILY_SEAT_LIMITS.children.min} max={FAMILY_SEAT_LIMITS.children.max}
                  value={form.seats_children} onChange={(e) => setForm((f) => ({ ...f, seats_children: e.target.value }))} aria-invalid={invalid("seats_children")} />
              </Field>
            </div>
            <Field label="Notiz (optional)" htmlFor="f-family-note" hint={`Nur für Admins sichtbar. Max. ${FAMILY_NOTE_MAX} Zeichen.`}>
              <Textarea id="f-family-note" maxLength={FAMILY_NOTE_MAX} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} aria-invalid={invalid("note")} />
            </Field>
          </>
        )}
        {dialog === "revoke" && (
          <>
            <p className="text-body">
              Das Familienpaket{lic ? ` (${untilText(lic.valid_until)})` : ""} wird sofort beendet. Die Familie und ihre Mitglieder bleiben bestehen;
              danach gelten wieder Testwoche, eigenes Abo oder Schullizenz.
            </p>
            <Field label="Notiz (optional)" htmlFor="f-family-revoke-note" hint={`Max. ${FAMILY_NOTE_MAX} Zeichen.`}>
              <Textarea id="f-family-revoke-note" maxLength={FAMILY_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={invalid("note")} />
            </Field>
          </>
        )}
      </ConfirmModal>
    </Section>
  );
}
