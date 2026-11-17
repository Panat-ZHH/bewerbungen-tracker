"use client";

import { useEffect, useState } from "react";
import { Plus, School, Search } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import type { AdminSchoolRow, SchoolLicence } from "@/lib/admin/types";
import { adminFetch, errorText, fieldOf, qs } from "./api";
import { ConfirmModal, fmtDate, useDebounced, type OpenDetail } from "./shared";
import { ListSkeleton } from "./users-tab";

const LICENCE_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  pilot: { label: "Pilot", tone: "info" },
  active: { label: "Aktiv", tone: "success" },
  not_started: { label: "Noch nicht gestartet", tone: "neutral" },
  expired: { label: "Abgelaufen", tone: "coral" },
  cancelled: { label: "Widerrufen", tone: "danger" },
};
export function LicenceBadge({ licence }: { licence: SchoolLicence | null }) {
  if (!licence) return <Badge tone="neutral">Keine Lizenz</Badge>;
  const s = LICENCE_STATE[licence.state] ?? { label: licence.state, tone: "neutral" as BadgeTone };
  return <Badge tone={s.tone}>{licence.package} · {s.label}</Badge>;
}
export const licenceEnd = (l: SchoolLicence) => (l.status === "pilot" ? l.pilot_end : l.valid_until);

export function SchoolsTab({ onOpen, version }: { onOpen: OpenDetail; version: number }) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim());
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; items?: AdminSchoolRow[]; error?: string } | null>(null);
  const key = `${debounced}|${version}|${retry}`;

  useEffect(() => {
    let alive = true;
    adminFetch<{ items: AdminSchoolRow[] }>(`/api/admin/schools${qs({ q: debounced })}`).then((res) => {
      if (alive) setResult(res.ok ? { key, items: res.data.items } : { key, error: errorText(res, { q: "Suche" }) });
    });
    return () => { alive = false; };
  }, [debounced, key]);

  // create
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", canton_or_state: "", country: "CH" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null); setBadField(null);
    const body: Record<string, unknown> = { action: "create", confirm: true, name: form.name.trim(), country: form.country };
    if (form.canton_or_state.trim()) body.canton_or_state = form.canton_or_state.trim();
    const res = await adminFetch<{ ok: boolean; school_id: string }>("/api/admin/schools", { method: "POST", body });
    setBusy(false);
    if (!res.ok) { setError(errorText(res, { name: "Name", canton_or_state: "Kanton / Bundesland", country: "Land" })); setBadField(fieldOf(res)); return; }
    toast({ message: "Schule angelegt." });
    setOpen(false);
    setRetry((r) => r + 1);
  }

  const loading = !result || result.key !== key;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Schule suchen" htmlFor="admin-school-search" className="flex-1">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <Input id="admin-school-search" type="search" placeholder="Name oder Kanton" value={q} maxLength={120} onChange={(e) => setQ(e.target.value)} className="pl-10" />
          </div>
        </Field>
        <Button data-testid="admin-school-create" icon={<Plus size={18} strokeWidth={2.4} aria-hidden />}
          onClick={() => { setForm({ name: "", canton_or_state: "", country: "CH" }); setError(null); setBadField(null); setOpen(true); }}>Schule anlegen</Button>
      </div>

      {!loading && result?.error && (
        <div className="space-y-3">
          <StatusMessage tone="danger">{result.error}</StatusMessage>
          <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>Nochmals laden</Button>
        </div>
      )}
      {loading && <ListSkeleton />}
      {!loading && result?.items && (result.items.length === 0
        ? <EmptyState icon={<School />} title="Keine Schule gefunden" />
        : (
          <ul className="rows">
            {result.items.map((s) => (
              <li key={s.id} data-testid="admin-school-row" data-school-id={s.id}>
                <button type="button" onClick={() => onOpen({ kind: "school", id: s.id })}
                  className="row-link w-full flex-col !items-start gap-1.5 text-left md:flex-row md:!items-center md:justify-between focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">
                  <span className="min-w-0">
                    <span className="block font-semibold">{s.name}</span>
                    <span className="text-small text-muted">{[s.canton_or_state, s.country].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <LicenceBadge licence={s.licence} />
                    {s.licence && <span className="text-small text-muted">bis {fmtDate(licenceEnd(s.licence))} · max. {s.licence.student_limit}</span>}
                    <span className="text-small tabular">{s.students} Lernende · {s.teachers} Lehrpersonen · {s.admins} Admins</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}

      <ConfirmModal open={open} title="Schule anlegen" submitLabel="Anlegen" busy={busy} error={error} onClose={() => setOpen(false)} onSubmit={create}>
        <Field label="Name" htmlFor="f-school-name">
          <Input id="f-school-name" maxLength={200} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-invalid={badField === "name" || undefined} data-autofocus />
        </Field>
        <Field label="Kanton / Bundesland (optional)" htmlFor="f-school-canton">
          <Input id="f-school-canton" maxLength={60} value={form.canton_or_state} onChange={(e) => setForm((f) => ({ ...f, canton_or_state: e.target.value }))} aria-invalid={badField === "canton_or_state" || undefined} />
        </Field>
        <Field label="Land" htmlFor="f-school-country">
          <Select id="f-school-country" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} aria-invalid={badField === "country" || undefined}>
            <option value="CH">Schweiz</option>
            <option value="DE">Deutschland</option>
            <option value="AT">Österreich</option>
          </Select>
        </Field>
      </ConfirmModal>
    </div>
  );
}
