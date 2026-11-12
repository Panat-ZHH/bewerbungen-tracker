"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { Figures } from "@/components/ui/figures";
import { ButtonLink } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getApplications } from "@/lib/storage";
import { statusLabels } from "@/lib/utils";
import { isConversationStatus, isPlacedStatus, isRepliedStatus, isSchnupperStatus, STATUS_ORDER } from "@/lib/status";
import type { Application, ApplicationStatus } from "@/types";

// Flat token fills, same colour family as the status stickers: Gemerkt = paper, Vorbereitung = yellow, unterwegs = blue,
// Gespräch = coral, Zusage = green, Absage / Zurückgezogen = calm sand (never red).
const barColors: Record<ApplicationStatus, string> = {
  saved: "var(--surface-2)", preparing: "var(--sun)",
  applied: "var(--brand)", schnupper_planned: "var(--brand)", schnupper_done: "var(--brand)", aptitude_test: "var(--brand)",
  interview: "var(--coral)", final_interview: "var(--coral)",
  offer: "var(--mint)", contract_signed: "var(--mint)",
  rejected: "var(--sand)", withdrawn: "var(--sand)",
};
// Calm fills need the theme contour to stay visible; bright fills get the always-dark contour.
const calmBars: ApplicationStatus[] = ["saved", "rejected", "withdrawn"];

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

      <Figures
        label="Deine Zahlen"
        className="animate-rise"
        items={[
          { label: total === 1 ? "Bewerbung" : "Bewerbungen", value: loading ? "–" : total, hint: total || loading ? undefined : "Noch keine Daten" },
          { label: "Rückmeldungen", value: loading ? "–" : replied, hint: total ? `${Math.round((replied / total) * 100)} % deiner Bewerbungen` : undefined },
          { label: "Gespräche", value: loading ? "–" : interviews, hint: "Gespräch oder Zusage", tone: "success" },
          { label: "Schnupperlehren", value: loading ? "–" : schnuppern, hint: "Geplant oder gemacht" },
        ]}
      />

      <Card className="animate-rise mt-9 max-w-3xl">
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
                  <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }}>
                    <XAxis type="number" allowDecimals={false} hide domain={[0, "dataMax"]} />
                    <YAxis type="category" dataKey="label" width={118} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted)" }} interval={0} />
                    <Tooltip cursor={{ fill: "var(--hover)" }} formatter={(value) => [value, "Bewerbungen"]} contentStyle={{ fontSize: 13 }} itemStyle={{ color: "var(--ink)" }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18} background={{ fill: "var(--surface-2)", radius: 4 }} isAnimationActive>
                      {data.map((item) => <Cell key={item.status} fill={barColors[item.status]} stroke={calmBars.includes(item.status) ? "var(--outline)" : "var(--outline-fill)"} strokeWidth={1.5} />)}
                      <LabelList dataKey="count" position="right" formatter={(value) => (value ? String(value) : "")} style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 700 }} />
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
