"use client";

import { useEffect, useState } from "react";
import { Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import type { AdminSchoolRow, AdminUserRow, Paged } from "@/lib/admin/types";
import { adminFetch, errorText, qs } from "./api";
import { AccessBadge, Pager, RoleBadge, StripeLink, fmtDate, fmtDateTime, useDebounced, type OpenDetail } from "./shared";

type StateFilter = "all" | "blocked" | "grant" | "trial" | "trial_over";
type RoleFilter = "all" | "student" | "teacher" | "school_admin" | "parent";
type SubFilter = "all" | "active" | "none";

/** List of people (search + filters + pages). */
export function UsersTab({ onOpen, version }: { onOpen: OpenDetail; version: number }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<StateFilter>("all");
  const [role, setRole] = useState<RoleFilter>("all");
  const [sub, setSub] = useState<SubFilter>("all");
  const [school, setSchool] = useState("all");
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const debounced = useDebounced(q.trim());
  const [result, setResult] = useState<{ key: string; data?: Paged<AdminUserRow>; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    adminFetch<{ items: AdminSchoolRow[] }>("/api/admin/schools").then((res) => {
      if (alive && res.ok) setSchools(res.data.items.map((x) => ({ id: x.id, name: x.name })));
    });
    return () => { alive = false; };
  }, [version]);

  const key = `${debounced}|${state}|${role}|${sub}|${school}|${page}|${version}|${retry}`;
  useEffect(() => {
    let alive = true;
    adminFetch<Paged<AdminUserRow>>(`/api/admin/users${qs({ q: debounced, page, state, role, sub, school })}`).then((res) => {
      if (!alive) return;
      setResult(res.ok ? { key, data: res.data } : { key, error: errorText(res, { q: "Suche" }) });
    });
    return () => { alive = false; };
  }, [debounced, page, state, role, sub, school, key]);

  const loading = !result || result.key !== key;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <Field label="Suche" htmlFor="admin-search">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <Input id="admin-search" data-testid="admin-search" type="search" placeholder="E-Mail oder Name" value={q} maxLength={120}
              onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-10" />
          </div>
        </Field>
        <Field label="Zugang" htmlFor="admin-filter-state">
          <Select id="admin-filter-state" value={state} onChange={(e) => { setState(e.target.value as StateFilter); setPage(1); }}>
            <option value="all">Alle</option>
            <option value="trial">In der Testphase</option>
            <option value="trial_over">Testphase vorbei</option>
            <option value="grant">Gratis-Zugang</option>
            <option value="blocked">Gesperrt</option>
          </Select>
        </Field>
        <Field label="Rolle" htmlFor="admin-filter-role">
          <Select id="admin-filter-role" value={role} onChange={(e) => { setRole(e.target.value as RoleFilter); setPage(1); }}>
            <option value="all">Alle</option>
            <option value="student">Lernende</option>
            <option value="teacher">Lehrpersonen</option>
            <option value="school_admin">Schuladmins</option>
            <option value="parent">Eltern</option>
          </Select>
        </Field>
        <Field label="Abo" htmlFor="admin-filter-sub">
          <Select id="admin-filter-sub" data-testid="admin-filter-sub" value={sub} onChange={(e) => { setSub(e.target.value as SubFilter); setPage(1); }}>
            <option value="all">Alle</option>
            <option value="active">Mit Abo</option>
            <option value="none">Ohne Abo</option>
          </Select>
        </Field>
        <Field label="Schule" htmlFor="admin-filter-school">
          <Select id="admin-filter-school" data-testid="admin-filter-school" value={school} onChange={(e) => { setSchool(e.target.value); setPage(1); }}>
            <option value="all">Alle</option>
            <option value="none">Ohne Schule</option>
            {schools.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
      </div>

      {result?.error && !loading && (
        <div className="space-y-3">
          <StatusMessage tone="danger">{result.error}</StatusMessage>
          <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>Nochmals laden</Button>
        </div>
      )}
      {loading && <ListSkeleton />}
      {!loading && result?.data && (
        result.data.items.length === 0
          ? <EmptyState icon={<Users />} title="Niemand gefunden" description="Probier eine andere Suche oder andere Filter." />
          : (
            <>
              <UserList rows={result.data.items} onOpen={onOpen} />
              <Pager page={result.data.page} pageSize={result.data.page_size} total={result.data.total} onPage={setPage} />
            </>
          )
      )}
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <p role="status" className="sr-only">Wird geladen …</p>
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );
}

/** Stacked rows on phones, a calm two-column row from md. Click (button) opens the detail. */
export function UserList({ rows, onOpen }: { rows: AdminUserRow[]; onOpen: OpenDetail }) {
  return (
    <ul className="rows">
      {rows.map((u) => (
        <li key={u.id} data-testid="admin-user-row" data-user-id={u.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:gap-4">
          <button type="button" onClick={() => onOpen({ kind: "user", id: u.id })}
            className="row-link min-w-0 flex-1 flex-col !items-start gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">
            <span className="flex w-full flex-wrap items-center gap-2">
              <span className="min-w-0 break-all font-semibold">{u.email ?? "ohne E-Mail"}</span>
              {u.blocked && u.access_state !== "blocked" && <Badge tone="danger">Gesperrt</Badge>}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              {u.name && <span className="mr-1 text-sm">{u.name}</span>}
              <RoleBadge role={u.role} accountType={u.account_type} />
              <AccessBadge state={u.access_state} />
              {u.schools.length > 0 && <span className="text-small text-muted">{u.schools.map((s) => s.name).join(", ")}</span>}
            </span>
            <span className="text-small text-muted">
              Testphase bis {fmtDate(u.trial_ends_at)}
              {u.free_access_until && <> · Gratis bis {fmtDate(u.free_access_until)}</>}
              {" "}· Erstellt {fmtDate(u.created_at)} · Zuletzt da {fmtDateTime(u.last_sign_in_at)}
            </span>
          </button>
          {u.subscription && (
            <div className="flex shrink-0 items-center gap-2 px-1 md:pt-3">
              <Badge tone={["active", "trialing"].includes(u.subscription.status) ? "success" : "warning"}>Abo: {u.subscription.status}</Badge>
              <StripeLink href={u.subscription.stripe_url} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
