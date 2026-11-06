"use client";

import { Bus, Check, ExternalLink, MapPin, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listingSources } from "@/lib/job-results";
import { cardFacts, formatIsoDate } from "@/lib/job-card-info";
import { JOB_TYPE_LABELS, type RankedJob } from "./engine";

export function Highlight({ text, ranges }: { text: string; ranges?: [number, number][] }) {
  if (!ranges?.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], i) => {
    if (start < at || end > text.length) return;
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={i} className="rounded bg-[var(--brand-soft)] px-0.5 text-inherit">{text.slice(start, end)}</mark>);
    at = end;
  });
  parts.push(text.slice(at));
  return <>{parts}</>;
}

function ago(iso?: string): string | undefined {
  const time = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(time)) return undefined;
  const days = Math.floor((Date.now() - time) / 86_400_000);
  return days <= 0 ? "Heute" : days === 1 ? "Gestern" : `Vor ${days} Tagen`;
}

export function ResultCard({ item, saved, saving, onSave, compact = false }: { item: RankedJob; saved: boolean; saving: boolean; onSave: () => void; compact?: boolean }) {
  const { job } = item;
  const sources = listingSources(job);
  const match = (field: string) => item.matches.find((m) => m.field === field)?.ranges;
  const posted = ago(job.postedAt);
  const facts = cardFacts(job);
  const workload = job.workloadMin !== undefined ? (job.workloadMax && job.workloadMax !== job.workloadMin ? `${job.workloadMin}–${job.workloadMax}%` : `${job.workloadMin}%`) : undefined;
  return (
    <Card interactive className="animate-rise">
      <article className={`flex flex-col md:flex-row md:items-center md:justify-between ${compact ? "gap-2 p-3 md:min-h-[150px]" : "gap-4 p-4 sm:p-5"}`}>
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold"><Highlight text={job.title} ranges={match("title")} /></h3>
          {job.company && <p className="mt-1 break-words text-sm"><Highlight text={job.company} ranges={match("company")} /></p>}
          {job.snippet && !compact && <p className="mt-1.5 line-clamp-2 break-words text-sm text-muted"><Highlight text={job.snippet} ranges={match("snippet")} /></p>}
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {job.location && <Badge><MapPin size={12} aria-hidden /><Highlight text={job.location} ranges={match("location")} /></Badge>}
            {job.jobType && <Badge tone="brand">{JOB_TYPE_LABELS[job.jobType]}</Badge>}
            {workload && <Badge>{workload}</Badge>}
            {facts.start && <Badge>Lehrbeginn {facts.start}</Badge>}
            {facts.deadline && <Badge tone="brand">Frist {formatIsoDate(facts.deadline)}</Badge>}
            {facts.schnupperlehre && <Badge>Schnupperlehre möglich</Badge>}
            {facts.transit && <Badge><Bus size={12} aria-hidden />{facts.transit}</Badge>}
            {posted && <Badge>{posted}</Badge>}
            <Badge>{sources.length > 1 ? `${sources.length} Quellen` : job.source}</Badge>
          </p>
          <ul aria-label="Originalanzeigen" hidden={compact && sources.length <= 1} className="mt-1 flex flex-wrap gap-x-4 text-xs text-[var(--brand-strong)]">
            {sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 hover:underline">{s.name}<ExternalLink size={12} aria-hidden /></a></li>)}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button type="button" variant={saved ? "secondary" : "primary"} disabled={saving || saved} onClick={onSave} icon={saved ? <Check size={15} /> : <Plus size={15} />}>{saved ? "Gemerkt" : saving ? "Speichert …" : "Merken"}</Button>
          <ButtonLink href={job.url} target="_blank" rel="noopener noreferrer" variant="secondary" icon={<ExternalLink size={15} />}>Originalanzeige öffnen</ButtonLink>
        </div>
      </article>
    </Card>
  );
}
