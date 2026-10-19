"use client";

import { useEffect, useState } from "react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getApplications } from "@/lib/storage";
import { statusLabels } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";

export default function AnalyticsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getApplications().then((data) => { if (active) setApplications(data); }).catch(() => undefined).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const total = applications.length;
  const replied = applications.filter(({ status }) => ["interview", "final_interview", "offer", "rejected"].includes(status)).length;
  const interviews = applications.filter(({ status }) => ["interview", "final_interview", "offer"].includes(status)).length;
  const orderedStatuses = Object.entries(statusLabels) as [ApplicationStatus, string][];

  return (
    <WorkspaceShell active="Auswertung">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-1px] md:text-[38px]">Dein Fortschritt</h1>
        <p className="mt-2 text-base text-muted">Ein einfacher Überblick darüber, wie es läuft.</p>
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Bewerbungen" value={loading ? "–" : total} />
        <Stat label="Rückmeldungen" value={loading ? "–" : replied} detail={total ? `${Math.round((replied / total) * 100)} % deiner Bewerbungen` : "Noch keine Daten"} />
        <Stat label="Gespräche" value={loading ? "–" : interviews} detail="Gespräch oder Angebot" />
      </section>

      <section className="mt-10 max-w-2xl">
        <h2 className="text-xl font-semibold tracking-[-.4px]">Wo stehen deine Bewerbungen?</h2>
        <p className="mt-1 text-sm text-muted">So verteilen sie sich auf die einzelnen Schritte.</p>
        <div className="mt-5 space-y-5">
          {orderedStatuses.map(([status, label]) => {
            const count = applications.filter((application) => application.status === status).length;
            const width = total ? (count / total) * 100 : 0;
            return (
              <div key={status}>
                <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                  <span>{label}</span>
                  <span className="tabular-nums text-muted">{loading ? "–" : count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#e5e5ea]" role="progressbar" aria-label={label} aria-valuenow={count} aria-valuemin={0} aria-valuemax={total}>
                  <div className="h-full rounded-full bg-[#0866d6] transition-[width] duration-500" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        {!loading && !total && <p className="glass-surface mt-6 rounded-xl px-4 py-3 text-sm text-muted">Sobald du Bewerbungen einträgst, erscheint hier dein Fortschritt.</p>}
      </section>
    </WorkspaceShell>
  );
}

function Stat({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return <div className="glass-surface rounded-[14px] p-5"><p className="text-sm text-muted">{label}</p><p className="mt-3 text-3xl font-semibold tabular-nums tracking-[-1px]">{value}</p>{detail && <p className="mt-1 text-xs text-muted">{detail}</p>}</div>;
}