"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getApplications } from "@/lib/storage";
import { statusLabels } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";

const barColors: Partial<Record<ApplicationStatus, string>> = { offer: "#248a57", rejected: "#c43d3d", withdrawn: "#9a9aa0" };

export default function AnalyticsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getApplications().then((data) => { if (active) setApplications(data); }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const total = applications.length;
  const replied = applications.filter(({ status }) => ["interview", "final_interview", "offer", "rejected"].includes(status)).length;
  const interviews = applications.filter(({ status }) => ["interview", "final_interview", "offer"].includes(status)).length;
  const orderedStatuses = Object.entries(statusLabels) as [ApplicationStatus, string][];
  const data = orderedStatuses.map(([status, label]) => ({ status, label, count: applications.filter((application) => application.status === status).length }));

  return (
    <WorkspaceShell active="Auswertung">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-1px] md:text-[38px]">Dein Fortschritt</h1>
        <p className="mt-2 text-base text-muted">Ein einfacher Überblick darüber, wie es läuft.</p>
      </div>

      {failed && <p role="alert" className="mt-5 rounded-xl border border-[#e8c7c7] bg-[#fff8f8] px-4 py-3 text-sm text-[#a32828]">Deine Auswertung konnte nicht geladen werden.</p>}

      <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Bewerbungen" value={loading ? "–" : total} />
        <Stat label="Rückmeldungen" value={loading ? "–" : replied} detail={total ? `${Math.round((replied / total) * 100)} % deiner Bewerbungen` : "Noch keine Daten"} />
        <Stat label="Gespräche" value={loading ? "–" : interviews} detail="Gespräch oder Angebot" />
      </section>

      <Card className="mt-8 max-w-3xl">
        <CardContent>
          <h2 className="text-xl font-semibold tracking-[-.4px]">Wo stehen deine Bewerbungen?</h2>
          <p className="mt-1 text-sm text-muted">So verteilen sie sich auf die einzelnen Schritte.</p>
          {loading ? (
            <div role="status" aria-label="Wird geladen" className="mt-5 h-72 animate-pulse rounded-xl bg-white/60" />
          ) : !total ? (
            <div className="mt-5 flex flex-col items-center rounded-xl bg-white/50 px-4 py-10 text-center">
              <BarChart3 size={26} className="text-[#737378]" />
              <p className="mt-3 text-sm font-semibold">Noch nichts auszuwerten</p>
              <p className="mt-1 text-sm text-muted">Sobald du Bewerbungen einträgst, erscheint hier dein Fortschritt.</p>
            </div>
          ) : (
            <>
              <div className="mt-5 h-80 w-full" role="img" aria-label={`Balkendiagramm: ${data.filter((item) => item.count).map((item) => `${item.label} ${item.count}`).join(", ")}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                    <XAxis type="number" allowDecimals={false} hide domain={[0, "dataMax"]} />
                    <YAxis type="category" dataKey="label" width={112} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} interval={0} />
                    <Tooltip cursor={{ fill: "rgba(8,102,214,.06)" }} formatter={(value) => [value, "Bewerbungen"]} contentStyle={{ borderRadius: 12, border: "1px solid #e5e5ea", fontSize: 13 }} />
                    <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={18} isAnimationActive>
                      {data.map((item) => <Cell key={item.status} fill={barColors[item.status] ?? "#0866d6"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="sr-only">{data.map((item) => <li key={item.status}>{item.label}: {item.count}</li>)}</ul>
            </>
          )}
        </CardContent>
      </Card>
    </WorkspaceShell>
  );
}

function Stat({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return <Card className="p-5"><p className="text-sm text-muted">{label}</p><p className="mt-3 text-3xl font-semibold tabular-nums tracking-[-1px]">{value}</p>{detail && <p className="mt-1 text-xs text-muted">{detail}</p>}</Card>;
}
