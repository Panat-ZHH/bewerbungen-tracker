"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import type { AuditEntry, Paged } from "@/lib/admin/types";
import { adminFetch, errorText, fieldOf, qs } from "./api";
import { AuditList, Pager, type OpenDetail } from "./shared";
import { ListSkeleton } from "./users-tab";

// Plain-language groups → the existing `action` filter of /api/admin/audit (substring without a dot, prefix with a dot).
const GROUPS: { value: string; label: string }[] = [
  { value: "", label: "Alle Änderungen" },
  { value: "user", label: "Personen" },
  { value: "school", label: "Schulen" },
  { value: "grant_access", label: "Gratis-Zugang gegeben" },
  { value: "trial", label: "Trial geändert" },
  { value: "block", label: "Sperren und Entsperren" },
  { value: "licence", label: "Lizenzen" },
  { value: "delete", label: "Löschungen" },
  { value: "failed", label: "Fehlgeschlagen" },
];

export function AuditTab({ onOpen, version }: { onOpen: OpenDetail; version: number }) {
  const [action, setAction] = useState("");
  const [since, setSince] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const key = `${action}|${since}|${page}|${version}|${retry}`;
  const [result, setResult] = useState<{ key: string; data?: Paged<AuditEntry>; error?: string; field?: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    adminFetch<Paged<AuditEntry>>(`/api/admin/audit${qs({ page, action, since })}`).then((res) => {
      if (alive) setResult(res.ok ? { key, data: res.data } : { key, error: errorText(res, { action: "Art", since: "Seit" }), field: fieldOf(res) });
    });
    return () => { alive = false; };
  }, [page, action, since, key]);

  const loading = !result || result.key !== key;

  return (
    <div className="space-y-5">
      <p className="text-small text-muted">Jede Änderung durch einen Admin wird hier festgehalten, auch fehlgeschlagene Versuche.</p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="Art der Änderung" htmlFor="admin-audit-action">
          <Select id="admin-audit-action" data-testid="admin-audit-action" value={action} aria-invalid={result?.field === "action" || undefined}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            {GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </Select>
        </Field>
        <Field label="Seit" htmlFor="admin-audit-since">
          <Input id="admin-audit-since" type="date" value={since} aria-invalid={result?.field === "since" || undefined}
            onChange={(e) => { setSince(e.target.value); setPage(1); }} />
        </Field>
      </div>

      {!loading && result?.error && (
        <div className="space-y-3">
          <StatusMessage tone="danger">{result.error}</StatusMessage>
          <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>Nochmals laden</Button>
        </div>
      )}
      {loading && <ListSkeleton />}
      {!loading && result?.data && (result.data.items.length === 0
        ? <EmptyState icon={<ScrollText />} title="Keine Einträge" description={action || since ? "Für diese Auswahl gibt es nichts im Protokoll." : "Noch hat kein Admin etwas geändert."} />
        : (
          <>
            <div className="panel-flat px-3 sm:px-4"><AuditList entries={result.data.items} onOpen={onOpen} /></div>
            <Pager page={result.data.page} pageSize={result.data.page_size} total={result.data.total} onPage={setPage} />
          </>
        ))}
    </div>
  );
}
