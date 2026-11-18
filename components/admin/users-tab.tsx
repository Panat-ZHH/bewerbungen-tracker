"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Search, SlidersHorizontal, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/input";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AdminSchoolRow, AdminUserRow, Paged, SignupStats } from "@/lib/admin/types";
import { adminFetch, errorText, qs } from "./api";
import { CHIPS, chipQuery, type Chip } from "./overview";
import { Pager, ROLE_LABEL, StatusBadge, fmtDate, fmtRelative, useDebounced, type OpenDetail } from "./shared";

type RoleFilter = "all" | "student" | "teacher" | "school_admin" | "parent";

/** The main list: one big search box, filter chips, a simple table. Clicking a person opens the side panel. */
export function UsersTab({ onOpen, version, chip, onChip, selectedId }: { onOpen: OpenDetail; version: number; chip: Chip; onChip: (c: Chip) => void; selectedId?: string | null }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [school, setSchool] = useState("all");
  const [more, setMore] = useState(false);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const debounced = useDebounced(q.trim());
  const [result, setResult] = useState<{ key: string; data?: Paged<AdminUserRow>; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);

  // School names for the "Schule" filter: only loaded when the extra filters are opened.
  useEffect(() => {
    if (!more) return;
    let alive = true;
    adminFetch<{ items: AdminSchoolRow[] }>("/api/admin/schools").then((res) => {
      if (alive && res.ok) setSchools(res.data.items.map((x) => ({ id: x.id, name: x.name })));
    });
    return () => { alive = false; };
  }, [more, version]);

  const key = `${debounced}|${chip}|${role}|${school}|${page}|${version}|${retry}`;
  useEffect(() => {
    let alive = true;
    if (chip === "new") {
      // New this week: /signups (no pages); search and extra filters apply on the short list.
      adminFetch<SignupStats>("/api/admin/signups?days=7").then((res) => {
        if (!alive) return;
        if (!res.ok) { setResult({ key, error: errorText(res) }); return; }
        const needle = debounced.toLowerCase();
        const items = res.data.users.filter((u) =>
          (!needle || (u.email ?? "").toLowerCase().includes(needle) || (u.name ?? "").toLowerCase().includes(needle))
          && (role === "all" || u.role === role)
          && (school === "all" || (school === "none" ? u.schools.length === 0 : u.schools.some((s) => s.id === school))));
        setResult({ key, data: { items, total: items.length, page: 1, page_size: Math.max(1, items.length) } });
      });
    } else {
      adminFetch<Paged<AdminUserRow>>(`/api/admin/users${qs({ q: debounced, page, role, school, ...chipQuery(chip) })}`).then((res) => {
        if (!alive) return;
        setResult(res.ok ? { key, data: res.data } : { key, error: errorText(res, { q: "Suche" }) });
      });
    }
    return () => { alive = false; };
  }, [debounced, page, chip, role, school, key]);

  const loading = !result || result.key !== key;
  const extraActive = (role !== "all" ? 1 : 0) + (school !== "all" ? 1 : 0);
  const filtered = chip !== "all" || extraActive > 0 || !!debounced;

  return (
    <div className="space-y-4">
      <div className="relative">
        <label htmlFor="admin-search" className="sr-only">Person suchen</label>
        <Search size={20} strokeWidth={2.4} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id="admin-search" data-testid="admin-search" type="search" placeholder="Name oder E-Mail suchen …" value={q} maxLength={120} autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          className="h-14 w-full rounded-[var(--radius-lg)] border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] pl-12 pr-4 text-base shadow-[var(--shadow-sm)] placeholder:text-[var(--muted)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter" className="flex flex-wrap gap-2">
          {CHIPS.map((c) => {
            const on = chip === c.value;
            return (
              <button key={c.value} type="button" aria-pressed={on} data-testid={`admin-chip-${c.value}`}
                onClick={() => { onChip(c.value); setPage(1); }}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full border-[length:var(--border-w)] px-3.5 text-[13px] font-semibold transition-colors pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
                  on ? "border-[var(--outline-fill)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--outline)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--hover)]",
                )}>
                {c.label}
              </button>
            );
          })}
        </div>
        <button type="button" aria-expanded={more} aria-controls="admin-more-filters" data-testid="admin-more-filters" onClick={() => setMore((m) => !m)}
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-[var(--ink)] underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:bg-[var(--hover)] pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">
          <SlidersHorizontal size={15} aria-hidden />Mehr Filter{extraActive > 0 && <span className="tabular rounded-full bg-[var(--sun)] px-1.5 text-[11px] text-[var(--on-sun)]">{extraActive}</span>}
          <ChevronDown size={15} aria-hidden className={cn("transition-transform", more && "rotate-180")} />
        </button>
      </div>

      {more && (
        <div id="admin-more-filters" className="inset grid gap-3 p-3 sm:grid-cols-2">
          <Field label="Rolle" htmlFor="admin-filter-role">
            <Select id="admin-filter-role" value={role} onChange={(e) => { setRole(e.target.value as RoleFilter); setPage(1); }}>
              <option value="all">Alle Rollen</option>
              <option value="student">Schüler:innen</option>
              <option value="teacher">Lehrpersonen</option>
              <option value="school_admin">Schuladmins</option>
              <option value="parent">Eltern</option>
            </Select>
          </Field>
          <Field label="Schule" htmlFor="admin-filter-school">
            <Select id="admin-filter-school" data-testid="admin-filter-school" value={school} onChange={(e) => { setSchool(e.target.value); setPage(1); }}>
              <option value="all">Alle Schulen</option>
              <option value="none">Ohne Schule</option>
              {schools.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
        </div>
      )}

      {result?.error && !loading && (
        <div className="space-y-3">
          <StatusMessage tone="danger">{result.error}</StatusMessage>
          <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>Nochmals laden</Button>
        </div>
      )}
      {loading && <TableSkeleton />}
      {!loading && result?.data && (
        result.data.items.length === 0
          ? (
            <EmptyState icon={<Users />} title={filtered ? "Niemand gefunden" : "Noch niemand registriert"}
              description={filtered ? "Probier eine andere Suche oder einen anderen Filter." : undefined}
              action={filtered ? <Button variant="secondary" size="sm" onClick={() => { setQ(""); setRole("all"); setSchool("all"); onChip("all"); setPage(1); }}>Filter zurücksetzen</Button> : undefined} />
          )
          : (
            <>
              <UserTable rows={result.data.items} onOpen={onOpen} selectedId={selectedId} />
              <Pager page={result.data.page} pageSize={result.data.page_size} total={result.data.total} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
            </>
          )
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="panel-flat overflow-hidden">
      <p role="status" className="sr-only">Wird geladen …</p>
      <div className="rows px-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 py-3.5">
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-56" /></div>
            <Skeleton className="hidden h-6 w-20 rounded-full md:block" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="hidden h-4 w-20 md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kept for the school detail / other lists. */
export function ListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <p role="status" className="sr-only">Wird geladen …</p>
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );
}

/** Real table from md (header + columns); on phones every row becomes a compact card. One DOM tree for both. */
export function UserTable({ rows, onOpen, selectedId }: { rows: AdminUserRow[]; onOpen: OpenDetail; selectedId?: string | null }) {
  const th = "px-3 py-2.5 text-left text-small font-semibold text-muted";
  return (
    <div className="panel-flat overflow-hidden">
      <table className="block w-full border-collapse text-sm md:table">
        <caption className="sr-only">Personen. Zeile anklicken, um Details und Aktionen zu öffnen.</caption>
        <thead className="hidden border-b-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface-2)] md:table-header-group">
          <tr>
            <th scope="col" className={cn(th, "pl-4")}>Person</th>
            <th scope="col" className={th}>Rolle</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={th}>Trial bis</th>
            <th scope="col" className={th}>Zuletzt da</th>
            <th scope="col" className="w-10"><span className="sr-only">Öffnen</span></th>
          </tr>
        </thead>
        <tbody className="block md:table-row-group">
          {rows.map((u, i) => (
            <tr key={u.id} data-testid="admin-user-row" data-user-id={u.id}
              onClick={(e) => { if (!(e.target as HTMLElement).closest("button,a")) onOpen({ kind: "user", id: u.id }); }}
              className={cn(
                "grid cursor-pointer grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-[var(--hover)] md:table-row md:p-0",
                i > 0 && "border-t-[1.5px] border-dashed border-[var(--line)]",
                selectedId === u.id && "bg-[var(--hover)]",
              )}>
              <td className="col-span-1 min-w-0 md:table-cell md:py-3 md:pl-4 md:pr-3">
                <button type="button" onClick={() => onOpen({ kind: "user", id: u.id })} data-testid="admin-user-open"
                  className="block min-w-0 max-w-full rounded-[var(--radius-sm)] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">
                  <span className="block truncate font-semibold">{u.name || u.email || "ohne E-Mail"}</span>
                  {u.name && <span className="block truncate text-small text-muted">{u.email ?? "ohne E-Mail"}</span>}
                </button>
              </td>
              <td className="row-start-1 col-start-2 self-start md:table-cell md:px-3 md:py-3">
                <StatusBadge row={u} className="md:hidden" />
                <span className="hidden text-sm md:inline">{ROLE_LABEL[u.role] ?? u.role}</span>
              </td>
              <td className="hidden md:table-cell md:px-3 md:py-3"><StatusBadge row={u} /></td>
              <td className="col-span-2 text-small text-muted md:table-cell md:px-3 md:py-3 md:text-sm md:text-[var(--ink)]">
                <span className="md:hidden">{ROLE_LABEL[u.role] ?? u.role} · Trial bis {fmtDate(u.trial_ends_at)} · zuletzt da {fmtRelative(u.last_sign_in_at)}</span>
                <span className="hidden tabular md:inline">{fmtDate(u.trial_ends_at)}</span>
              </td>
              <td className="hidden tabular md:table-cell md:px-3 md:py-3" title={u.last_sign_in_at ?? undefined}>{fmtRelative(u.last_sign_in_at)}</td>
              <td className="hidden pr-3 text-muted md:table-cell" aria-hidden><ChevronRight size={18} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

