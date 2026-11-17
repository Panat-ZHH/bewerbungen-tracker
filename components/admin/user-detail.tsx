"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import type { AdminUserDetail } from "@/lib/admin/types";
import { adminFetch, errorText, fieldOf, type AdminResult } from "./api";
import { AccessBadge, AuditList, ConfirmModal, Facts, RoleBadge, Section, StripeLink, fmtDate, fmtDateTime, isoDay, type OpenDetail } from "./shared";

type Action = "set_trial" | "extend_trial" | "grant_access" | "revoke_access" | "block" | "unblock" | "soft_delete" | "delete_account";

const LABELS: Record<string, string> = {
  trial_ends_at: "Testphase bis", days: "Tage", until: "Gratis bis", note: "Notiz", reason: "Grund", confirm_email: "E-Mail", confirm_text: "E-Mail",
};

const ACTION_TITLE: Record<Action, string> = {
  set_trial: "Testphase setzen",
  extend_trial: "Testphase verlängern",
  grant_access: "Gratis-Zugang geben",
  revoke_access: "Gratis-Zugang entfernen",
  block: "Konto sperren",
  unblock: "Sperre aufheben",
  soft_delete: "Zur Löschung vormerken",
  delete_account: "Konto endgültig löschen",
};

const DONE: Record<Action, string> = {
  set_trial: "Testphase gesetzt.",
  extend_trial: "Testphase verlängert.",
  grant_access: "Gratis-Zugang gegeben.",
  revoke_access: "Gratis-Zugang entfernt.",
  block: "Konto gesperrt.",
  unblock: "Sperre aufgehoben.",
  soft_delete: "Konto gesperrt und zur Löschung vorgemerkt.",
  delete_account: "Konto gelöscht.",
};

type Form = { trial_ends_at: string; days: string; until: string; note: string; reason: string; confirm_email: string; confirm_text: string };
const emptyForm = (): Form => ({ trial_ends_at: isoDay(7), days: "7", until: isoDay(30), note: "", reason: "", confirm_email: "", confirm_text: "" });

export function UserDetail({ id, selfId, onOpen, onChanged, onDeleted }: { id: string; selfId: string; onOpen: OpenDetail; onChanged: () => void; onDeleted: () => void }) {
  const [res, setRes] = useState<AdminResult<AdminUserDetail> | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<string | null>(null);

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
    setError(null);
    setBadField(null);
    setAction(a);
  }
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const invalid = (k: string) => (badField === k ? true : undefined);

  async function submit() {
    if (!action) return;
    const body: Record<string, unknown> = { action, confirm: true };
    switch (action) {
      case "set_trial": body.trial_ends_at = form.trial_ends_at; break;
      case "extend_trial": body.days = Number(form.days); break;
      case "grant_access": body.until = form.until; if (form.note.trim()) body.note = form.note.trim(); break;
      case "block": body.reason = form.reason.trim(); break;
      case "soft_delete": body.confirm_email = form.confirm_email.trim(); if (form.reason.trim()) body.reason = form.reason.trim(); break;
      case "delete_account": body.confirm_text = form.confirm_text.trim(); break;
    }
    setBusy(true);
    setError(null);
    setBadField(null);
    const r = await adminFetch<{ ok: boolean; deleted?: boolean }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: "POST", body });
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
    return <div aria-busy="true" className="space-y-3" data-testid="admin-user-detail"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-48 w-full" /></div>;
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
  const isSelf = u.id === selfId;
  const actionButton = (a: Action, variant: "secondary" | "danger" = "secondary") => (
    <Button key={a} size="sm" variant={variant} data-testid={`admin-action-${a}`} onClick={() => openAction(a)}>{ACTION_TITLE[a]}</Button>
  );

  return (
    <div className="animate-rise space-y-8" data-testid="admin-user-detail">
      <header className="space-y-2">
        <h1 className="text-title break-all">{u.email ?? "ohne E-Mail"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {u.name && <span className="mr-1">{u.name}</span>}
          <RoleBadge role={u.role} accountType={u.account_type} />
          <AccessBadge state={u.access_state} />
          {u.blocked && u.access_state !== "blocked" && <Badge tone="danger">Gesperrt</Badge>}
          {u.platform_admin && <Badge tone="brand">Plattform-Admin</Badge>}
          {u.mfa && <Badge tone="paper">2FA aktiv</Badge>}
          {isSelf && <Badge tone="paper">Das bist du</Badge>}
        </div>
      </header>

      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-heading">Aktionen</h2>
          <div className="flex flex-wrap gap-2">
            {actionButton("extend_trial")}
            {actionButton("set_trial")}
            {actionButton("grant_access")}
            {aa?.free_access_until && actionButton("revoke_access")}
            {u.blocked ? actionButton("unblock") : !isSelf && actionButton("block")}
          </div>
          {!isSelf && (
            <div className="flex flex-wrap gap-2 border-t-[length:var(--border-w)] border-dashed border-[var(--line)] pt-4">
              {!u.blocked && actionButton("soft_delete", "danger")}
              {u.blocked && !u.platform_admin && actionButton("delete_account", "danger")}
              {!u.blocked && <p className="w-full text-small text-muted">Löschen geht in zwei Schritten: zuerst sperren (vormerken), dann endgültig löschen.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <Section title="Fakten">
          <Facts items={[
            ["Name", u.name ?? "–"],
            ["ID", <code key="id" className="break-all font-mono text-xs">{u.id}</code>],
            ["Erstellt", fmtDateTime(u.created_at)],
            ["Zuletzt angemeldet", fmtDateTime(u.last_sign_in_at)],
            ["Schulen", u.schools.length ? u.schools.map((s) => (
              <button key={`${s.id}-${s.via}`} type="button" onClick={() => onOpen({ kind: "school", id: s.id })} className="mr-2 font-semibold text-[var(--brand)] underline underline-offset-4">
                {s.name}<span className="font-normal text-muted"> ({s.via === "class" ? "Klasse" : s.via === "admin" ? "Admin" : "Lehrperson"})</span>
              </button>
            )) : "–"],
          ]} />
        </Section>

        <Section title="Zugang">
          <Facts items={[
            ["Status", <AccessBadge key="s" state={u.access_state} />],
            ["Grund", u.access?.reason ?? u.access_reason ?? "–"],
            ["Testphase", `${fmtDate(aa?.trial_started_at)} bis ${fmtDate(aa?.trial_ends_at ?? u.trial_ends_at)}`],
            ["Gratis bis", aa?.free_access_until ? `${fmtDate(aa.free_access_until)}${aa.free_access_note ? ` · ${aa.free_access_note}` : ""}` : "–"],
            ["Gesperrt", aa?.blocked_at ? `${fmtDateTime(aa.blocked_at)}${aa.blocked_reason ? ` · ${aa.blocked_reason}` : ""}` : "nein"],
            ["Regeln aktiv", u.access ? (u.access.enforced ? "ja" : "nein (noch nicht scharf)") : "–"],
            ...(u.access?.grace_until ? [["Zahlung offen bis", fmtDate(u.access.grace_until)] as [string, string]] : []),
            ...(u.access?.school ? [["Schullizenz", `${u.access.school.name} · bis ${fmtDate(u.access.school.valid_until)}`] as [string, string]] : []),
          ]} />
        </Section>
      </div>

      <Section title="Abos">
        {u.subscriptions.length === 0 ? <p className="text-small text-muted">Keine Abos.</p> : (
          <ul className="rows">
            {u.subscriptions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                <Badge tone={["active", "trialing"].includes(s.status) ? "success" : "warning"}>{s.status}</Badge>
                <span className="text-sm font-semibold">{s.plan_id}</span>
                <span className="text-small text-muted">{s.owner === "user" ? "eigenes Abo" : s.owner === "family" ? "Familie" : "Schule"} · bis {fmtDate(s.current_period_end)}{s.cancel_at_period_end ? " · gekündigt" : ""}</span>
                <span className="flex gap-3"><StripeLink href={s.stripe_url} label="Abo" /><StripeLink href={s.customer_url} label="Kunde" /></span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Familien">
          {u.families.length === 0 ? <p className="text-small text-muted">Keine Familie.</p> : (
            <ul className="rows">{u.families.map((f) => <li key={f.id} className="py-2 text-sm">{f.name} <span className="text-muted">· {f.role} · {f.status}</span></li>)}</ul>
          )}
        </Section>
        <Section title="Klassen">
          {u.classes.length === 0 ? <p className="text-small text-muted">Keine Klasse.</p> : (
            <ul className="rows">
              {u.classes.map((c) => (
                <li key={`${c.id}-${c.as}`} className="py-2 text-sm">
                  {c.name} <span className="text-muted">· {c.as === "teacher" ? "als Lehrperson" : "als Lernende:r"}</span>
                  {c.school_id && <> · <button type="button" onClick={() => onOpen({ kind: "school", id: c.school_id! })} className="font-semibold text-[var(--brand)] underline underline-offset-4">Schule</button></>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Protokoll">
        <AuditList entries={u.audit} onOpen={onOpen} />
      </Section>

      <ConfirmModal
        open={action !== null}
        title={action ? ACTION_TITLE[action] : ""}
        description={u.email ?? undefined}
        danger={action === "block" || action === "soft_delete" || action === "delete_account"}
        submitLabel={action === "delete_account" ? "Endgültig löschen" : action === "soft_delete" ? "Sperren und vormerken" : "Bestätigen"}
        busy={busy}
        error={error}
        onClose={() => setAction(null)}
        onSubmit={submit}
      >
        {action === "set_trial" && (
          <Field label="Testphase bis" htmlFor="f-trial" hint="Gilt bis Ende dieses Tages.">
            <Input id="f-trial" type="date" value={form.trial_ends_at} onChange={set("trial_ends_at")} aria-invalid={invalid("trial_ends_at")} data-autofocus />
          </Field>
        )}
        {action === "extend_trial" && (
          <>
            <p className="text-small text-muted">Ab heute oder ab dem aktuellen Ende, je nachdem was später ist. Jetzt: {fmtDate(aa?.trial_ends_at ?? u.trial_ends_at)}.</p>
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
            <Field label="Gratis bis" htmlFor="f-until">
              <Input id="f-until" type="date" min={isoDay(0)} value={form.until} onChange={set("until")} aria-invalid={invalid("until")} data-autofocus />
            </Field>
            <Field label="Notiz (optional)" htmlFor="f-note" hint="Max. 500 Zeichen">
              <Textarea id="f-note" maxLength={500} value={form.note} onChange={set("note")} aria-invalid={invalid("note")} />
            </Field>
          </>
        )}
        {action === "revoke_access" && <p className="text-body">Der Gratis-Zugang (bis {fmtDate(aa?.free_access_until)}) wird sofort entfernt.</p>}
        {action === "block" && (
          <>
            <p className="text-body">Die Person kann sich noch anmelden, sieht aber nur «Konto gesperrt».</p>
            <Field label="Grund" htmlFor="f-reason" hint="Max. 500 Zeichen">
              <Textarea id="f-reason" maxLength={500} required value={form.reason} onChange={set("reason")} aria-invalid={invalid("reason")} data-autofocus />
            </Field>
          </>
        )}
        {action === "unblock" && <p className="text-body">Die Sperre wird aufgehoben. Danach gelten wieder die normalen Regeln.</p>}
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
            <StatusMessage tone="danger">Endgültig: Dateien, Daten und Login werden gelöscht. Das lässt sich nicht rückgängig machen.</StatusMessage>
            <Field label="E-Mail nochmals eintippen" htmlFor="f-confirm-text" hint={u.email ?? undefined}>
              <Input id="f-confirm-text" type="email" autoComplete="off" value={form.confirm_text} onChange={set("confirm_text")} aria-invalid={invalid("confirm_text")} data-autofocus />
            </Field>
          </>
        )}
      </ConfirmModal>
    </div>
  );
}
