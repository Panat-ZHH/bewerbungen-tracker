"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import type { AuditEntry, Paged } from "@/lib/admin/types";
import { adminFetch, errorText, fieldOf, qs } from "./api";
import { AuditList, Pager, useDebounced, type OpenDetail } from "./shared";
import { ListSkeleton } from "./users-tab";

const ACTION_RE = /^[a-z_]{1,40}(\.[a-z_]{1,40}){0,2}$/;

export function AuditTab({ onOpen, version }: { onOpen: OpenDetail; version: number }) {
  const [action, setAction] = useState("");
  const [since, setSince] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const debouncedAction = useDebounced(action.trim().toLowerCase());
  // Only send a filter the API accepts; a half-typed "user." waits until it is complete.
  const actionFilter = debouncedAction && ACTION_RE.test(debouncedAction) ? debouncedAction : "";
  const actionInvalid = !!debouncedAction && !actionFilter;
  const key = `${actionFilter}|${since}|${page}|${version}|${retry}`;
  const [result, setResult] = useState<{ key: string; data?: Paged<AuditEntry>; error?: string; field?: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    adminFetch<Paged<AuditEntry>>(`/api/admin/audit${qs({ page, action: actionFilter, since })}`).then((res) => {
      if (alive) setResult(res.ok ? { key, data: res.data } : { key, error: errorText(res, { action: "Aktion", since: "Seit" }), field: fieldOf(res) });
    });
    return () => { alive = false; };
  }, [page, actionFilter, since, key]);

  const loading = !result || result.key !== key;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label="Aktion" htmlFor="admin-audit-action" hint="z. B. user.block oder school" error={actionInvalid ? "Nur Kleinbuchstaben, _ und Punkte." : undefined}>
          <Input id="admin-audit-action" type="search" placeholder="user.block" value={action} maxLength={124}
            aria-invalid={actionInvalid || result?.field === "action" || undefined}
            onChange={(e) => { setAction(e.target.value); setPage(1); }} />
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
        ? <EmptyState icon={<ScrollText />} title="Keine Einträge" description="Für diese Filter gibt es noch nichts im Protokoll." />
        : (
          <>
            <AuditList entries={result.data.items} onOpen={onOpen} />
            <Pager page={result.data.page} pageSize={result.data.page_size} total={result.data.total} onPage={setPage} />
          </>
        ))}
    </div>
  );
}
