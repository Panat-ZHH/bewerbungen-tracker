"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ButtonLink } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getApplications } from "@/lib/storage";
import { statusLabels } from "@/lib/utils";
import { isConversationStatus, isPlacedStatus, isRepliedStatus, isSchnupperStatus, STATUS_ORDER } from "@/lib/status";
import type { Application, ApplicationStatus } from "@/types";

const barColors: Partial<Record<ApplicationStatus, string>> = { schnupper_planned: "var(--warning-fg)", schnupper_done: "var(--info-fg)", aptitude_test: "var(--info-fg)", offer: "var(--success-fg)", contract_signed: "var(--success-fg)", rejected: "var(--danger-fg)", withdrawn: "var(--muted)" };

/** Shorter wording for the chart axis. */
const axisLabels: Partial<Record<ApplicationStatus, string>> = { schnupper_planned: "Schnupper geplant", schnupper_done: "Schnupper gemacht", aptitude_test: "Eignungstest", contract_signed: "Vertrag", final_interview: "Weiteres Gespräch", preparing: "Vorbereitung" };

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
  const replied = applications.filter(({ status }) => isRepliedStatus(status)).length;
  const interviews = applications.filter(({ status }) => isConversationStatus(status) || isPlacedStatus(status)).length;
  const schnuppern = applications.filter(({ status }) => isSchnupperStatus(status)).length;
  const orderedStatuses = STATUS_ORDER.map((status) => [status, axisLabels[status] ?? statusLabels[status]] as [ApplicationStatus, string]);
  const data = orderedStatuses.map(([status, label]) => ({ status, label, count: applications.filter((application) => application.status === status).length }));

  return (
    <WorkspaceShell active="Auswertung">
      <PageHeader title="Dein Fortschritt" description="Ein einfacher Überblick darüber, wie es läuft." />

      {failed && <StatusMessage tone="danger" className="mb-5">Deine Auswertung konnte nicht geladen werden.</StatusMessage>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Bewerbungen" value={loading ? "–" : total} trend={total ? undefined : loading ? undefined : "Noch keine Daten"} />
        <StatTile label="Rückmeldungen" value={loading ? "–" : replied} trend={total ? `${Math.round((replied / total) * 100)} % deiner Bewerbungen` : undefined} />
        <StatTile label="Gespräche" value={loading ? "–" : interviews} trend="Gespräch oder Zusage" tone="success" />
        <StatTile label="Schnupperlehren" value={loading ? "–" : schnuppern} trend="Geplant oder gemacht" />
      </section>

      <Card className="animate-rise mt-6 max-w-3xl">
        <CardContent>
          <h2 className="text-heading">Wo stehen deine Bewerbungen?</h2>
          <p className="mt-1 text-body text-muted">So verteilen sie sich auf die einzelnen Schritte.</p>
          {loading ? (
            <div role="status" aria-label="Wird geladen" className="mt-5 space-y-3">{[70, 45, 30, 55, 20, 10, 35, 25].map((w, i) => <Skeleton key={i} className="h-5" style={{ width: `${w}%` }} />)}</div>
          ) : !total ? (
            <EmptyState className="mt-5" icon={<BarChart3 />} title="Noch nichts auszuwerten" description="Sobald du Bewerbungen einträgst, erscheint hier dein Fortschritt." action={<ButtonLink href="/applications/new">Erste Bewerbung eintragen</ButtonLink>} />
          ) : (
            <>
              <div className="mt-5 h-[26rem] w-full" role="img" aria-label={`Balkendiagramm: ${data.filter((item) => item.count).map((item) => `${item.label} ${item.count}`).join(", ")}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                    <XAxis type="number" allowDecimals={false} hide domain={[0, "dataMax"]} />
                    <YAxis type="category" dataKey="label" width={118} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted)" }} interval={0} />
                    <Tooltip cursor={{ fill: "var(--hover)" }} formatter={(value) => [value, "Bewerbungen"]} contentStyle={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", boxShadow: "var(--shadow-md)", fontSize: 13 }} />
                    <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={18} background={{ fill: "var(--hover)", radius: 8 }} isAnimationActive>
                      {data.map((item) => <Cell key={item.status} fill={barColors[item.status] ?? "var(--brand)"} />)}
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
