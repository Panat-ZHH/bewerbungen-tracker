"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
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
  const change = (delta: number) => { const next = clampGoal(goal + delta); setGoal(next); writeGoal(next); };
  const stepButton = "flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink)] transition-colors hover:bg-[var(--hover)] active:translate-y-px disabled:opacity-40";
  return (
    <section className="panel relative p-4 sm:p-5 lg:rotate-[.8deg]" aria-label="Wochenziel">
      {reached && <span className="sticker sticker-mint animate-sticker absolute -right-2 -top-3" style={{ "--tilt": "5deg" } as React.CSSProperties}>Geschafft!</span>}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-heading">Wochenziel</h2>
          <p className="mt-1 text-sm text-muted">{reached ? "Ziel erreicht – stark gemacht!" : `${done} von ${goal} ${goal === 1 ? "Bewerbung" : "Bewerbungen"} diese Woche abgeschickt`}</p>
        </div>
        <div className="flex shrink-0 items-center" role="group" aria-label="Wochenziel anpassen">
          <button type="button" onClick={() => change(-1)} disabled={goal <= 1} aria-label="Ziel verringern" className={stepButton}><Minus size={17} strokeWidth={2.4} /></button>
          <span className="font-display w-7 text-center text-xl font-extrabold tabular-nums" aria-hidden>{goal}</span>
          <button type="button" onClick={() => change(1)} aria-label="Ziel erhöhen" className={stepButton}><Plus size={17} strokeWidth={2.4} /></button>
        </div>
      </div>
      {/* One flat segment per application of the goal: filled = sent this week. */}
      <div className="mt-4 flex gap-1.5" role="progressbar" aria-label="Fortschritt Wochenziel" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(done, goal)}>
        {Array.from({ length: goal }, (_, index) => (
          <span key={index} className={`h-3.5 min-w-0 flex-1 rounded-full border-[length:var(--border-w)] border-[var(--outline)] transition-colors duration-300 ${index < done ? "bg-[var(--sun)]" : "bg-[var(--surface-2)]"}`} />
        ))}
      </div>
    </section>
  );
}
