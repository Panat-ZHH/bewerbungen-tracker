"use client";

import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { listMyClassGoals, type ClassGoal } from "@/lib/b2b/client";
import { GoalCard } from "./class-goals";
import { ClassVillage } from "./class-village";

/**
 * Student: the goals of my classes with the shared class progress. Only aggregates, never other students' details.
 * Renders nothing when there are no goals or the feature is not deployed yet.
 */
export function StudentClassGoals() {
  const [groups, setGroups] = useState<{ classId: string; className: string; goals: ClassGoal[] }[] | null>(null);
  useEffect(() => {
    let alive = true;
    listMyClassGoals().then((g) => { if (alive) setGroups(g ?? []); }).catch(() => { if (alive) setGroups([]); });
    return () => { alive = false; };
  }, []);
  if (!groups || groups.length === 0) return null;
  return (
    <section aria-labelledby="student-goals-h" className="space-y-4 border-t-[length:var(--border-w)] border-[var(--outline)] pt-8">
      <div>
        <h2 id="student-goals-h" className="text-heading flex items-center gap-2"><Target size={19} strokeWidth={2.2} aria-hidden /> Ziele deiner Klasse</h2>
        <p className="text-small mt-1 max-w-2xl text-muted">Ihr arbeitet gemeinsam darauf hin. Hier steht nur der Fortschritt der ganzen Klasse, niemand sieht deine einzelnen Bewerbungen.</p>
      </div>
      {groups.map((g) => (
        <div key={g.classId} className="space-y-3">
          {groups.length > 1 && <h3 className="text-[15px] font-bold">Klasse {g.className}</h3>}
          <ClassVillage goals={g.goals} />
          <ul className="rows" aria-label={`Ziele der Klasse ${g.className}`}>{g.goals.map((goal) => <GoalCard key={goal.id} goal={goal} />)}</ul>
        </div>
      ))}
    </section>
  );
}
