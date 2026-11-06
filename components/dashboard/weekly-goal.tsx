"use client";

import { useEffect, useState } from "react";
import { Target, Minus, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { clampGoal, readGoal, readProgress, subscribeProgress, weekStart, writeGoal } from "@/lib/rewards";
import type { Application } from "@/types";

/** Weekly goal: applications sent this week (stored locally + derived from appliedAt). The goal itself is a local setting. */
export function WeeklyGoal({ applications }: { applications: Application[] }) {
  const [goal, setGoal] = useState(3);
  const [local, setLocal] = useState(0);
  useEffect(() => {
    const sync = () => setLocal(readProgress().applied);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setGoal(readGoal()); sync();
    return subscribeProgress(sync);
  }, []);
  const start = weekStart();
  const fromData = applications.filter((a) => a.appliedAt && a.appliedAt >= start).length;
  const done = Math.max(local, fromData);
  const reached = done >= goal;
  const pct = Math.min(100, Math.round((done / goal) * 100));
  const change = (delta: number) => { const next = clampGoal(goal + delta); setGoal(next); writeGoal(next); };
  return (
    <Card className="mt-6 p-4 sm:p-5" aria-label="Wochenziel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-strong)]"><Target size={20} aria-hidden /></span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Wochenziel</h2>
            <p className="text-sm text-muted">{reached ? "Ziel erreicht – stark gemacht!" : `${done} von ${goal} ${goal === 1 ? "Bewerbung" : "Bewerbungen"} diese Woche abgeschickt`}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Wochenziel anpassen">
          <button type="button" onClick={() => change(-1)} disabled={goal <= 1} aria-label="Ziel verringern" className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-[var(--hover)] disabled:opacity-40"><Minus size={16} /></button>
          <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-hidden>{goal}</span>
          <button type="button" onClick={() => change(1)} aria-label="Ziel erhöhen" className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-[var(--hover)]"><Plus size={16} /></button>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--hover)]" role="progressbar" aria-label="Fortschritt Wochenziel" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(done, goal)}>
        <div className="h-full rounded-full bg-[image:var(--brand-gradient)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </Card>
  );
}
