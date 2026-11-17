"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusMessage } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AuditEntry, AdminRole } from "@/lib/admin/types";
import type { AccessState } from "@/lib/access/types";

export type OpenDetail = (target: { kind: "user" | "school"; id: string }) => void;

// ------------------------------------------------------------------ formatting

const dateFmt = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Zurich" });
const dateTimeFmt = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "–";
  const d = new Date(v.length === 10 ? `${v}T12:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? "–" : dateFmt.format(d);
}
export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "–";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "–" : dateTimeFmt.format(d);
}
/** YYYY-MM-DD in Zurich time, `days` from today (for date inputs). */
export function isoDay(days = 0): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(d);
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = window.setTimeout(() => setV(value), ms); return () => window.clearTimeout(t); }, [value, ms]);
  return v;
}

// ------------------------------------------------------------------ badges

const ACCESS: Record<AccessState, { label: string; tone: BadgeTone }> = {
  active: { label: "Aktiv", tone: "success" },
  trial: { label: "Testphase", tone: "info" },
  grace: { label: "Zahlung offen", tone: "warning" },
  expired: { label: "Abgelaufen", tone: "coral" },
  licence_required: { label: "Lizenz fehlt", tone: "warning" },
  blocked: { label: "Gesperrt", tone: "danger" },
};
export function AccessBadge({ state }: { state: AccessState | null }) {
  if (!state) return <Badge tone="neutral">Zugang unbekannt</Badge>;
  const a = ACCESS[state] ?? { label: state, tone: "neutral" as BadgeTone };
  return <Badge tone={a.tone}>{a.label}</Badge>;
}

export const ROLE_LABEL: Record<AdminRole, string> = {
  student: "Lernende:r", teacher: "Lehrperson", school_admin: "Schuladmin", parent: "Elternteil", unknown: "Unbekannt",
};
export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  school_student: "über Schule", independent_student: "selbstständig", parent: "Eltern",
};
export function RoleBadge({ role, accountType }: { role: AdminRole; accountType?: string | null }) {
  return (
    <Badge tone="paper">
      {ROLE_LABEL[role] ?? role}
      {accountType && <span className="font-normal text-muted">· {ACCOUNT_TYPE_LABEL[accountType] ?? accountType}</span>}
    </Badge>
  );
}

export function StripeLink({ href, label = "Stripe" }: { href: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)]">
      {label}<ExternalLink size={13} strokeWidth={2.4} aria-hidden /><span className="sr-only"> (öffnet neues Fenster)</span>
    </a>
  );
}

// ------------------------------------------------------------------ layout bits

/** Label/value list for detail views (dashed rows, two columns from sm). */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="rows">
      {items.map(([label, value]) => (
        <div key={label} className="grid gap-0.5 py-2 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <dt className="text-small font-medium text-muted">{label}</dt>
          <dd className="min-w-0 break-words text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, actions, children, className }: { title: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-heading">{title}</h2>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= pageSize && page === 1) return <p className="text-small text-muted">{total} Einträge</p>;
  return (
    <nav aria-label="Seiten" className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft size={16} aria-hidden />}>Zurück</Button>
      <span className="text-small tabular text-muted">Seite {page} von {pages} · {total} Einträge</span>
      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Weiter<ChevronRight size={16} aria-hidden /></Button>
    </nav>
  );
}

// ------------------------------------------------------------------ confirm modal

/**
 * Confirmation dialog for every admin change. Fields go in `children`; Enter submits. `error` is shown above the buttons.
 */
export function ConfirmModal({ open, title, description, danger, submitLabel, busy, error, onClose, onSubmit, children }: {
  open: boolean; title: string; description?: string; danger?: boolean; submitLabel: string; busy?: boolean; error?: string | null;
  onClose: () => void; onSubmit: () => void; children?: ReactNode;
}) {
  const formId = useId();
  function submit(e: FormEvent) { e.preventDefault(); if (!busy) onSubmit(); }
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      description={description}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button type="submit" form={formId} variant={danger ? "danger" : "primary"} loading={busy} data-testid="admin-confirm-submit">{submitLabel}</Button>
        </>
      )}
    >
      <form id={formId} onSubmit={submit} noValidate data-testid="admin-confirm-modal" className="space-y-4">
        {children}
        {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ audit list

function compact(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function AuditDetails({ details }: { details: Record<string, unknown> | null }) {
  if (!details) return null;
  const { before, after, ...rest } = details as { before?: unknown; after?: unknown } & Record<string, unknown>;
  const hasDiff = before !== undefined || after !== undefined;
  return (
    <div className="inset mt-1.5 space-y-1 px-2.5 py-2 text-xs">
      {hasDiff && (
        <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5">
          {before !== undefined && <span className="text-muted">{compact(before)}</span>}
          {before !== undefined && after !== undefined && <span aria-label="danach"> → </span>}
          {after !== undefined && <span>{compact(after)}</span>}
        </pre>
      )}
      {Object.keys(rest).length > 0 && <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-muted">{compact(rest)}</pre>}
    </div>
  );
}

export function AuditList({ entries, onOpen, empty = "Noch keine Einträge." }: { entries: AuditEntry[]; onOpen?: OpenDetail; empty?: string }) {
  if (!entries.length) return <p className="text-small text-muted">{empty}</p>;
  return (
    <ul className="rows">
      {entries.map((a) => (
        <li key={a.id} data-testid="admin-audit-row" className="py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <time dateTime={a.at} className="text-small tabular text-muted">{fmtDateTime(a.at)}</time>
            <Badge tone={a.action.endsWith(".failed") ? "danger" : "paper"} className="font-mono">{a.action}</Badge>
            {a.target_user && (onOpen
              ? <button type="button" onClick={() => onOpen({ kind: "user", id: a.target_user! })} className="text-small font-semibold text-[var(--brand)] underline underline-offset-4">Person öffnen</button>
              : null)}
            {a.target_school && (onOpen
              ? <button type="button" onClick={() => onOpen({ kind: "school", id: a.target_school! })} className="text-small font-semibold text-[var(--brand)] underline underline-offset-4">Schule öffnen</button>
              : null)}
          </div>
          <p className="mt-0.5 text-small text-muted">
            {a.admin_email ?? (a.admin_id ? `Admin ${a.admin_id.slice(0, 8)}` : "System")}
            {a.ip && <> · IP {a.ip}</>}
          </p>
          <AuditDetails details={a.details} />
        </li>
      ))}
    </ul>
  );
}
