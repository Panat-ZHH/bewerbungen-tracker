"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminSchoolRow, Paged, SignupStats } from "@/lib/admin/types";
import { adminFetch, qs } from "./api";

/** Filter chips of the people list. Each maps to an existing /api/admin/users filter (or /signups for "new"). */
export type Chip = "all" | "new" | "trial" | "paying" | "free_forever" | "trial_over" | "blocked";

export const CHIPS: { value: Chip; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "new", label: "Neu diese Woche" },
  { value: "trial", label: "Trial" },
  { value: "paying", label: "Zahlend" },
  { value: "free_forever", label: "Gratis unbefristet" },
  { value: "trial_over", label: "Trial vorbei" },
  { value: "blocked", label: "Gesperrt" },
];

/** Query params of /api/admin/users for a chip ("new" uses /api/admin/signups instead). */
export function chipQuery(chip: Chip): { state?: string; sub?: string } {
  switch (chip) {
    case "trial": return { state: "trial" };
    case "paying": return { sub: "active" };
    case "free_forever": return { state: "grant_forever" };
    case "trial_over": return { state: "trial_over" };
    case "blocked": return { state: "blocked" };
    default: return {};
  }
}

type Stats = { total: number; newWeek: number; trial: number; paying: number; forever: number; schools: number; licensed: number };
type Tile = { key: keyof Stats; label: string; hint?: (s: Stats) => string; chip?: Chip; tab?: "schools" };

const TILES: Tile[] = [
  { key: "total", label: "Personen", chip: "all" },
  { key: "newWeek", label: "Neu diese Woche", chip: "new" },
  { key: "trial", label: "Im Trial", chip: "trial" },
  { key: "paying", label: "Zahlend", chip: "paying" },
  { key: "forever", label: "Gratis unbefristet", chip: "free_forever" },
  { key: "schools", label: "Schulen", hint: (s) => `${s.licensed} mit Lizenz`, tab: "schools" },
];

const total = (path: string) => adminFetch<Paged<unknown>>(path).then((r) => (r.ok ? r.data.total : null));

/** Six big numbers. Built from the existing read-only endpoints (counts = `total` of page 1), no extra server code. */
export function Overview({ version, chip, onChip, onSchools }: { version: number; chip: Chip; onChip: (c: Chip) => void; onSchools: () => void }) {
  const [stats, setStats] = useState<{ v: number; s: Stats | null; failed?: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      total("/api/admin/users"),
      adminFetch<SignupStats>("/api/admin/signups?days=7").then((r) => (r.ok ? r.data.total : null)),
      total(`/api/admin/users${qs(chipQuery("trial"))}`),
      total(`/api/admin/users${qs(chipQuery("paying"))}`),
      total(`/api/admin/users${qs(chipQuery("free_forever"))}`),
      adminFetch<{ items: AdminSchoolRow[] }>("/api/admin/schools").then((r) => (r.ok ? r.data.items : null)),
    ]).then(([all, newWeek, trial, paying, forever, schools]) => {
      if (!alive) return;
      if ([all, newWeek, trial, paying, forever].some((x) => x === null) || !schools) { setStats({ v: version, s: null, failed: true }); return; }
      const licensed = schools.filter((x) => x.licence && ["active", "pilot"].includes(x.licence.state)).length;
      setStats({ v: version, s: { total: all!, newWeek: newWeek!, trial: trial!, paying: paying!, forever: forever!, schools: schools.length, licensed } });
    });
    return () => { alive = false; };
  }, [version]);

  const s = stats?.s ?? null;
  const loading = !stats;

  return (
    <section aria-label="Überblick" data-testid="admin-overview">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {TILES.map((t) => {
          const active = !!t.chip && t.chip === chip && t.chip !== "all";
          return (
            <li key={t.key}>
              <button
                type="button"
                data-testid={`admin-stat-${t.key}`}
                aria-pressed={t.chip ? active : undefined}
                onClick={() => (t.tab ? onSchools() : onChip(t.chip!))}
                className={cn(
                  "card-interactive flex h-full w-full flex-col items-start gap-1 rounded-[var(--radius-lg)] border-[length:var(--border-w)] px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
                  active ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] shadow-[var(--shadow-sm)]" : "border-[var(--outline)] bg-[var(--surface)]",
                )}
              >
                <span className={cn("text-small font-semibold", !active && "text-muted")}>{t.label}</span>
                {loading ? <Skeleton className="mt-1 h-8 w-12" /> : (
                  <span className="num-big" data-testid={`admin-stat-${t.key}-value`}>{s ? s[t.key] : "–"}</span>
                )}
                {s && t.hint && <span className={cn("text-small", !active && "text-muted")}>{t.hint(s)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {stats?.failed && <p className="mt-2 text-small text-muted" role="status">Einige Zahlen konnten nicht geladen werden.</p>}
    </section>
  );
}
