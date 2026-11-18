"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Ban, CalendarPlus, ChevronDown, Gift, KeyRound, LockOpen, School } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import type { AdminSchoolRow, AdminUserDetail } from "@/lib/admin/types";
import { ACCESS_REASON_LABEL, subscriptionLabel } from "@/lib/admin/status";
import { PLANS } from "@/lib/billing/plans";
import { adminFetch, errorText, fieldOf, type AdminResult } from "./api";
import { freeAccessActive, freeAccessBody, freeAccessLabel, type FreeAccessForm } from "@/lib/admin/free-access";
import { FreeAccessFields, emptyFreeAccessForm } from "./free-access";
import { ACCOUNT_TYPE_LABEL, AuditList, ConfirmModal, Facts, ROLE_LABEL, Section, StatusBadge, StripeLink, fmtDate, fmtDateTime, fmtRelative, isoDay, type OpenDetail } from "./shared";
import { LicenceBadge } from "./schools-tab";

type Action = "set_trial" | "extend_trial" | "grant_access" | "revoke_access" | "block" | "unblock" | "soft_delete" | "delete_account" | "assign_school";

const LABELS: Record<string, string> = {
  trial_ends_at: "Trial bis", days: "Tage", until: "Gratis bis", note: "Notiz", reason: "Grund", confirm_email: "E-Mail", confirm_text: "E-Mail", email: "E-Mail",
};

const ACTION_TITLE: Record<Action, string> = {
  set_trial: "Trial-Ende auf ein Datum setzen",
  extend_trial: "Trial verlängern",
  grant_access: "Gratis-Zugang geben",
  revoke_access: "Gratis-Zugang entfernen",
  block: "Konto sperren",
  unblock: "Sperre aufheben",
  soft_delete: "Zur Löschung vormerken",
  delete_account: "Konto endgültig löschen",
  assign_school: "Lizenz zuweisen",
};

const DONE: Record<Action, string> = {
  set_trial: "Trial-Ende gesetzt.",
  extend_trial: "Trial verlängert.",
  grant_access: "Gratis-Zugang gegeben.",
  revoke_access: "Gratis-Zugang entfernt.",
  block: "Konto gesperrt.",
  unblock: "Sperre aufgehoben.",
  soft_delete: "Konto gesperrt und zur Löschung vorgemerkt.",
  delete_account: "Konto gelöscht.",
  assign_school: "Zur Schule hinzugefügt.",
};

const SUBMIT: Partial<Record<Action, string>> = {
  grant_access: "Gratis geben", extend_trial: "Verlängern", set_trial: "Speichern", block: "Sperren", unblock: "Sperre aufheben",
  revoke_access: "Entfernen", soft_delete: "Sperren und vormerken", delete_account: "Endgültig löschen", assign_school: "Zuweisen",
};

type Form = { trial_ends_at: string; days: string; reason: string; confirm_email: string; confirm_text: string; school_id: string; school_role: "teacher" | "admin" };
const emptyForm = (): Form => ({ trial_ends_at: isoDay(7), days: "7", reason: "", confirm_email: "", confirm_text: "", school_id: "", school_role: "teacher" });

/** Big, clear action button of the panel (icon, label, one line of help). */
function ActionTile({ action, icon, label, help, onClick, tone = "default" }: { action: Action; icon: ReactNode; label: string; help: string; onClick: () => void; tone?: "default" | "danger" | "brand" }) {
  return (
    <button type="button" data-testid={`admin-action-${action}`} onClick={onClick}
      className={[
        "pressable flex min-h-[4.25rem] w-full items-start gap-3 rounded-[var(--radius-lg)] border-[length:var(--border-w)] px-3.5 py-3 text-left shadow-[var(--shadow-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
        tone === "brand" ? "border-[var(--outline-fill)] bg-[var(--brand)] text-[var(--on-brand)]"
          : tone === "danger" ? "border-[var(--danger-fg)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
          : "border-[var(--outline)] bg-[var(--surface)] text-[var(--ink)]",
      ].join(" ")}>
      <span className="mt-0.5 shrink-0 [&>svg]:h-5 [&>svg]:w-5" aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className={tone === "default" ? "block text-small text-muted" : "block text-small opacity-90"}>{help}</span>
      </span>
    </button>
  );
}

export function UserDetail({ id, selfId, onOpen, onChanged, onDeleted }: { id: string; selfId: string; onOpen: OpenDetail; onChanged: () => void; onDeleted: () => void }) {
  const [res, setRes] = useState<AdminResult<AdminUserDetail> | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [free, setFree] = useState<FreeAccessForm>(emptyFreeAccessForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<string | null>(null);
  const [schools, setSchools] = useState<AdminSchoolRow[] | null>(null);

  const load = useCallback(async () => {
    const r = await adminFetch<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(id)}`);
    setRes(r);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function openAction(a: Action) {
    setForm(emptyForm());
    setFree(emptyFreeAccessForm());
    setError(null);
    setBadField(null);
    setAction(a);
    if (a === "assign_school" && !schools) {
      adminFetch<{ items: AdminSchoolRow[] }>("/api/admin/schools").then((r) => {
        if (r.ok) {
          setSchools(r.data.items);
          setForm((f) => (f.school_id ? f : { ...f, school_id: r.data.items[0]?.id ?? "" }));
        } else setError(errorText(r));
      });
    } else if (a === "assign_school" && schools) setForm((f) => ({ ...f, school_id: schools[0]?.id ?? "" }));
  }
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const invalid = (k: string) => (badField === k ? true : undefined);

  async function submit() {
    if (!action || !res?.ok) return;
    let r: AdminResult<{ ok: boolean; deleted?: boolean }>;
    setBusy(true);
    setError(null);
    setBadField(null);
    if (action === "assign_school") {
      if (!["teacher", "school_admin", "unknown"].includes(res.data.role)) { setBusy(false); setError("Schüler:innen und Eltern bekommen eine Lizenz über ihre Klasse, nicht hier."); return; }
      // Licences belong to schools: adding the person to a school (existing school action) gives them its licence.
      if (!form.school_id || !res.data.email) { setBusy(false); setError("Bitte wähle eine Schule."); return; }
      r = await adminFetch(`/api/admin/schools/${encodeURIComponent(form.school_id)}`, {
        method: "POST", body: { action: form.school_role === "admin" ? "add_admin" : "add_teacher", email: res.data.email, confirm: true },
      });
    } else {
      const body: Record<string, unknown> = { action, confirm: true };
      switch (action) {
        case "set_trial": body.trial_ends_at = form.trial_ends_at; break;
        case "extend_trial": body.days = Number(form.days); break;
        case "grant_access": Object.assign(body, freeAccessBody(free)); break;
        case "block": body.reason = form.reason.trim(); break;
        case "soft_delete": body.confirm_email = form.confirm_email.trim(); if (form.reason.trim()) body.reason = form.reason.trim(); break;
        case "delete_account": body.confirm_text = form.confirm_text.trim(); break;
      }
      r = await adminFetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: "POST", body });
    }
    setBusy(false);
    if (!r.ok) {
      setError(errorText(r, LABELS));
      setBadField(fieldOf(r));
      if (r.status === 429) toast({ message: errorText(r), tone: "danger" });
      return;
    }
    toast({ message: DONE[action] });
    setAction(null);
    if (action === "delete_account") { onDeleted(); return; }
    onChanged();
    void load();
  }

  if (!res) {
    return (
      <div aria-busy="true" className="space-y-4" data-testid="admin-user-detail">
        <p role="status" className="sr-only">Wird geladen …</p>
        <Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-1/2" />
        <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[4.25rem] w-full" />)}</div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!res.ok) {
    return (
      <div className="space-y-3" data-testid="admin-user-detail">
        <StatusMessage tone="danger">{errorText(res)}</StatusMessage>
        <Button variant="secondary" size="sm" onClick={() => { setRes(null); void load(); }}>Nochmals laden</Button>
      </div>
    );
  }

  const u = res.data;
  const aa = u.account_access;
  const grant = { forever: aa?.free_access_forever ?? u.free_access_forever, until: aa?.free_access_until ?? u.free_access_until };
  const granted = freeAccessActive(grant);
  const grantText = freeAccessLabel(grant, fmtDate);
  const isSelf = u.id === selfId;
  const protectedAccount = isSelf || u.platform_admin; // server refuses block / delete / revoke for these (409)
  const trialEnd = aa?.trial_ends_at ?? u.trial_ends_at;
  const statusRow = { ...u, free_access_forever: grant.forever, free_access_until: grant.until };
  // Only staff can be added to a school here; students join via a class, parents via family (server would make them teachers).
  const canJoinSchool = u.role === "teacher" || u.role === "school_admin" || u.role === "unknown";
  const openSub = u.subscriptions.find((s) => ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(s.status)) ?? null;

  return (
    <div className="space-y-7" data-testid="admin-user-detail">
      <header className="space-y-2">
        <h2 className="text-title break-words">{u.name || u.email || "ohne E-Mail"}</h2>
        {u.name && <p className="break-all text-body text-muted">{u.email ?? "ohne E-Mail"}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge row={statusRow} />
          <Badge tone="paper">{ROLE_LABEL[u.role] ?? u.role}{u.account_type && <span className="font-normal text-muted">· {ACCOUNT_TYPE_LABEL[u.account_type] ?? u.account_type}</span>}</Badge>
          {u.platform_admin && <Badge tone="brand">Plattform-Admin</Badge>}
          {isSelf && <Badge tone="paper">Das bist du</Badge>}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {[
          ["Trial bis", fmtDate(trialEnd)],
          ["Zuletzt da", fmtRelative(u.last_sign_in_at)],
          ["Dabei seit", fmtDate(u.created_at)],
          ["Abo", openSub ? subscriptionLabel(openSub.status) : "keins"],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-small text-muted">{k}</dt>
            <dd className="truncate font-semibold tabular">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="admin-actions-title" className="space-y-3">
        <h3 id="admin-actions-title" className="text-heading">Aktionen</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {granted && grant.forever && !protectedAccount
            ? <ActionTile action="revoke_access" icon={<Gift />} label="Gratis-Zugang entfernen" help="Danach gelten wieder Trial, Abo oder Schule." onClick={() => openAction("revoke_access")} />
            : <ActionTile action="grant_access" tone="brand" icon={<Gift />} label="Gratis geben (unbefristet)" help={grantText ? `Jetzt: ${grantText}` : "Voller Zugang ohne Abo und ohne Enddatum."} onClick={() => openAction("grant_access")} />}
          <ActionTile action="extend_trial" icon={<CalendarPlus />} label="Trial verlängern" help={`Jetzt bis ${fmtDate(trialEnd)}`} onClick={() => openAction("extend_trial")} />
          {u.blocked
            ? <ActionTile action="unblock" icon={<LockOpen />} label="Sperre aufheben" help="Die Person kann die App wieder nutzen." onClick={() => openAction("unblock")} />
            : !protectedAccount && <ActionTile action="block" tone="danger" icon={<Ban />} label="Sperren" help="Die Person sieht nur noch «Konto gesperrt»." onClick={() => openAction("block")} />}
          <ActionTile action="assign_school" icon={<KeyRound />} label="Lizenz zuweisen" help={canJoinSchool ? "Zu einer Schule hinzufügen und deren Lizenz nutzen." : "Schüler:innen und Eltern: über Klasse oder Familie."} onClick={() => openAction("assign_school")} />
        </div>

        <details className="group rounded-[var(--radius-lg)] border-[length:var(--border-w)] border-dashed border-[var(--line)] px-3.5 py-2" data-testid="admin-more-actions">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            Weitere Aktionen<ChevronDown size={16} aria-hidden className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-wrap gap-2 pb-2 pt-3">
            <Button size="sm" variant="secondary" data-testid="admin-action-set_trial" onClick={() => openAction("set_trial")}>Trial-Ende auf Datum setzen</Button>
            {granted && grant.forever && !protectedAccount && <Button size="sm" variant="secondary" onClick={() => openAction("grant_access")}>Gratis bis Datum statt unbefristet</Button>}
            {!grant.forever && (granted || aa?.free_access_until) && !protectedAccount && <Button size="sm" variant="secondary" data-testid="admin-action-revoke_access" onClick={() => openAction("revoke_access")}>Gratis-Zugang entfernen</Button>}
            {!protectedAccount && !u.blocked && <Button size="sm" variant="danger" data-testid="admin-action-soft_delete" onClick={() => openAction("soft_delete")}>Zur Löschung vormerken</Button>}
            {!protectedAccount && u.blocked && <Button size="sm" variant="danger" data-testid="admin-action-delete_account" onClick={() => openAction("delete_account")}>Konto endgültig löschen</Button>}
          </div>
          {!protectedAccount && <p className="pb-2 text-small text-muted">Löschen geht in zwei Schritten: zuerst sperren (vormerken), dann endgültig löschen.</p>}
          {protectedAccount && <p className="pb-2 text-small text-muted">{isSelf ? "Dein eigenes Konto" : "Admin-Konten"} kannst du hier nicht sperren, löschen oder den Gratis-Zugang entziehen.</p>}
        </details>
      </section>

      <Section title="Zugang">
        <Facts items={[
          ["Status", <StatusBadge key="s" row={statusRow} />],
          ["Warum", u.access?.reason ? ACCESS_REASON_LABEL[u.access.reason] : u.access_reason ? ACCESS_REASON_LABEL[u.access_reason] : "–"],
          ["Trial", `${fmtDate(aa?.trial_started_at)} bis ${fmtDate(trialEnd)}`],
          ["Gratis-Zugang", grantText ? `${grantText}${aa?.free_access_note ? ` · ${aa.free_access_note}` : ""}${aa?.free_access_granted_at ? ` · seit ${fmtDate(aa.free_access_granted_at)}` : ""}` : aa?.free_access_until ? `abgelaufen am ${fmtDate(aa.free_access_until)}` : "keiner"],
          ["Gesperrt", aa?.blocked_at ? `seit ${fmtDateTime(aa.blocked_at)}${aa.blocked_reason ? ` · ${aa.blocked_reason}` : ""}` : "nein"],
          ...(u.access?.grace_until ? [["Zahlung offen bis", fmtDate(u.access.grace_until)] as [string, string]] : []),
          ...(u.access?.school ? [[u.access.school.free ? "Schule (gratis)" : "Lizenz der Schule", `${u.access.school.name} · ${u.access.grant?.scope === "school" && u.access.grant.forever ? "unbefristet" : `bis ${fmtDate(u.access.school.valid_until)}`}`] as [string, string]] : []),
        ]} />
      </Section>

      <Section title="Abos">
        {u.subscriptions.length === 0 ? <p className="text-small text-muted">Keine Abos.</p> : (
          <ul className="rows">
            {u.subscriptions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                <Badge tone={["active", "trialing"].includes(s.status) ? "success" : "warning"}>{subscriptionLabel(s.status)}</Badge>
                <span className="text-small text-muted">{s.owner === "user" ? "Eigenes Abo" : s.owner === "family" ? PLANS.family.name : "Schullizenz"} · bis {fmtDate(s.current_period_end)}{s.cancel_at_period_end ? " · gekündigt" : ""}</span>
                <span className="flex gap-3"><StripeLink href={s.stripe_url} label="Abo in Stripe" /><StripeLink href={s.customer_url} label="Kunde" /></span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Schulen, Klassen, Familie">
        {u.schools.length === 0 && u.classes.length === 0 && u.families.length === 0 ? <p className="text-small text-muted">Keine Schule, Klasse oder Familie.</p> : (
          <ul className="rows text-sm">
            {u.schools.map((s) => (
              <li key={`s-${s.id}-${s.via}`} className="flex flex-wrap items-center gap-2 py-2">
                <School size={15} aria-hidden className="text-muted" />
                <button type="button" onClick={() => onOpen({ kind: "school", id: s.id })} className="font-semibold text-[var(--brand)] underline underline-offset-4">{s.name}</button>
                <span className="text-muted">als {s.via === "class" ? "Schüler:in" : s.via === "admin" ? "Schuladmin" : "Lehrperson"}</span>
              </li>
            ))}
            {u.classes.map((c) => <li key={`c-${c.id}-${c.as}`} className="py-2">Klasse {c.name} <span className="text-muted">· {c.as === "teacher" ? "als Lehrperson" : "als Schüler:in"}</span></li>)}
            {u.families.map((f) => <li key={`f-${f.id}`} className="py-2">{f.name} <span className="text-muted">· Familie</span></li>)}
          </ul>
        )}
      </Section>

      <Section title="Verlauf">
        <AuditList entries={u.audit} onOpen={onOpen} empty="Noch keine Änderungen durch Admins." />
      </Section>

      <details className="text-small text-muted">
        <summary className="cursor-pointer underline decoration-[var(--line)] underline-offset-4">Technische Details</summary>
        <Facts items={[
          ["ID", <code key="id" className="break-all font-mono text-xs">{u.id}</code>],
          ["Erstellt", fmtDateTime(u.created_at)],
          ["Zuletzt angemeldet", fmtDateTime(u.last_sign_in_at)],
          ["Zwei-Faktor", u.mfa ? "eingerichtet" : "nein"],
          ["Zugangsregeln aktiv", u.access ? (u.access.enforced ? "ja" : "nein") : "–"],
        ]} />
      </details>

      <ConfirmModal
        open={action !== null}
        title={action ? ACTION_TITLE[action] : ""}
        description={u.name ? `${u.name} · ${u.email ?? ""}` : u.email ?? undefined}
        danger={action === "block" || action === "soft_delete" || action === "delete_account"}
        submitLabel={action ? SUBMIT[action] ?? "Bestätigen" : "Bestätigen"}
        busy={busy}
        error={error}
        onClose={() => setAction(null)}
        onSubmit={submit}
      >
        {action === "set_trial" && (
          <Field label="Trial bis" htmlFor="f-trial" hint="Gilt bis Ende dieses Tages.">
            <Input id="f-trial" type="date" value={form.trial_ends_at} onChange={set("trial_ends_at")} aria-invalid={invalid("trial_ends_at")} data-autofocus />
          </Field>
        )}
        {action === "extend_trial" && (
          <>
            <p className="text-small text-muted">Gerechnet ab heute oder ab dem aktuellen Ende ({fmtDate(trialEnd)}), je nachdem was später ist.</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Schnellwahl">
              {[7, 14, 30].map((d) => (
                <Button key={d} type="button" size="sm" variant={form.days === String(d) ? "primary" : "secondary"} aria-pressed={form.days === String(d)} onClick={() => setForm((f) => ({ ...f, days: String(d) }))}>+{d} Tage</Button>
              ))}
            </div>
            <Field label="Tage" htmlFor="f-days" hint="1 bis 365">
              <Input id="f-days" type="number" min={1} max={365} inputMode="numeric" value={form.days} onChange={set("days")} aria-invalid={invalid("days")} />
            </Field>
          </>
        )}
        {action === "grant_access" && (
          <>
            {grantText && <p className="text-small">Jetzt: <strong>{grantText}</strong>. Wird ersetzt.</p>}
            <FreeAccessFields scope="user" form={free} onChange={setFree} invalid={invalid} />
          </>
        )}
        {action === "revoke_access" && <p className="text-body">Der Gratis-Zugang ({grantText ?? `bis ${fmtDate(aa?.free_access_until)}`}) wird sofort entfernt. Danach gelten wieder Trial, Abo oder Schullizenz.</p>}
        {action === "block" && (
          <>
            <p className="text-body">Die Person kann sich noch anmelden, sieht aber nur «Konto gesperrt». Du kannst die Sperre jederzeit aufheben.</p>
            <Field label="Grund" htmlFor="f-reason" hint="Nur für Admins sichtbar. Max. 500 Zeichen.">
              <Textarea id="f-reason" maxLength={500} required value={form.reason} onChange={set("reason")} aria-invalid={invalid("reason")} data-autofocus />
            </Field>
          </>
        )}
        {action === "unblock" && <p className="text-body">Die Sperre wird aufgehoben. Danach gelten wieder die normalen Regeln.</p>}
        {action === "assign_school" && (
          <>
            <p className="text-small text-muted">Lizenzen gehören zu einer Schule. Die Person wird dort als Lehrperson oder Schuladmin eingetragen und hat dann den Zugang der Schule. Schüler:innen kommen über eine Klasse dazu.</p>
            {!u.email && <StatusMessage tone="warning">Diese Person hat keine E-Mail und kann nicht zugewiesen werden.</StatusMessage>}
            {schools === null && !error && <Skeleton className="h-11 w-full" />}
            {schools?.length === 0 && <StatusMessage tone="info">Noch keine Schule angelegt. Lege sie zuerst im Bereich «Schulen» an.</StatusMessage>}
            {!canJoinSchool && <StatusMessage tone="info">{ROLE_LABEL[u.role] ?? "Diese Person"}: Der Zugang über eine Schule kommt automatisch, sobald die Person in einer Klasse der Schule ist. Für Schüler:innen oder Eltern ohne Schule nimm «Gratis geben».</StatusMessage>}
            {canJoinSchool && schools && schools.length > 0 && (
              <>
                <Field label="Schule" htmlFor="f-school">
                  <Select id="f-school" value={form.school_id} onChange={set("school_id")} data-autofocus>
                    {schools.map((s) => <option key={s.id} value={s.id}>{s.name}{s.licence ? "" : " (ohne Lizenz)"}</option>)}
                  </Select>
                </Field>
                {(() => {
                  const s = schools.find((x) => x.id === form.school_id);
                  if (!s) return null;
                  const usable = (s.licence && ["active", "pilot"].includes(s.licence.state)) || freeAccessActive(s.free_access);
                  return (
                    <div className="space-y-2">
                      <p className="flex flex-wrap items-center gap-2 text-small">Lizenz: <LicenceBadge licence={s.licence} /></p>
                      {!usable && <StatusMessage tone="warning">Diese Schule hat gerade keine gültige Lizenz. Die Person wird eingetragen, bekommt aber erst Zugang, wenn die Schule eine Lizenz hat.</StatusMessage>}
                    </div>
                  );
                })()}
                <div className="flex flex-wrap gap-2" role="group" aria-label="Als">
                  {(["teacher", "admin"] as const).map((r) => (
                    <Button key={r} type="button" size="sm" variant={form.school_role === r ? "primary" : "secondary"} aria-pressed={form.school_role === r}
                      onClick={() => setForm((f) => ({ ...f, school_role: r }))}>{r === "teacher" ? "Als Lehrperson" : "Als Schuladmin"}</Button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {action === "soft_delete" && (
          <>
            <StatusMessage tone="warning">Das Konto wird jetzt gesperrt und zur Löschung vorgemerkt. Gelöscht wird erst in einem zweiten Schritt.</StatusMessage>
            <Field label="E-Mail zur Bestätigung eintippen" htmlFor="f-confirm-email" hint={u.email ?? undefined}>
              <Input id="f-confirm-email" type="email" autoComplete="off" value={form.confirm_email} onChange={set("confirm_email")} aria-invalid={invalid("confirm_email")} data-autofocus />
            </Field>
            <Field label="Grund (optional)" htmlFor="f-sd-reason" hint="Max. 400 Zeichen">
              <Textarea id="f-sd-reason" maxLength={400} value={form.reason} onChange={set("reason")} aria-invalid={invalid("reason")} />
            </Field>
          </>
        )}
        {action === "delete_account" && (
          <>
            <StatusMessage tone="danger">Endgültig: Dateien, Daten und das Konto werden gelöscht. Das lässt sich nicht rückgängig machen.</StatusMessage>
            <Field label="E-Mail nochmals eintippen" htmlFor="f-confirm-text" hint={u.email ?? undefined}>
              <Input id="f-confirm-text" type="email" autoComplete="off" value={form.confirm_text} onChange={set("confirm_text")} aria-invalid={invalid("confirm_text")} data-autofocus />
            </Field>
          </>
        )}
      </ConfirmModal>
    </div>
  );
}
