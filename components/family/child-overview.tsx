"use client";

import { useEffect, useState } from "react";
import { BriefcaseBusiness, Eye, EyeOff, Home, Trophy } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { getChildOverview } from "@/lib/family";
import { FAMILY_COPY, fill } from "@/lib/family-copy";
import { familyVillagePath } from "@/lib/family-village";
import { familyError, formatDateCh, groupStatusCounts, statusText, type ChildOverview as Overview } from "@/lib/family-core";

/** What the parent may see of one child: only what the child shares (family_child_overview filters on the server). */
export function ChildOverview({ childId, name }: { childId: string; name: string }) {
  const [data, setData] = useState<Overview | null | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    getChildOverview(childId).then((d) => { if (alive) { setData(d); setError(""); } }).catch((e) => { if (alive) setError(familyError(e)); });
    return () => { alive = false; };
  }, [childId]);

  if (error) return <StatusMessage tone="danger">{error}</StatusMessage>;
  if (data === undefined) return <div className="space-y-2" aria-busy="true"><Skeleton className="h-20 rounded-[var(--radius-lg)]" /><Skeleton className="h-20 rounded-[var(--radius-lg)]" /></div>;
  if (!data || (!data.progress && !data.village && !data.applications)) {
    return <p className="flex items-start gap-2 text-body text-muted"><EyeOff size={17} className="mt-0.5 shrink-0" aria-hidden />{name} teilt im Moment nichts mit der Familie. Das ist in Ordnung: Teilen ist freiwillig.</p>;
  }
  const groups = data.progress ? groupStatusCounts(data.progress.statusCounts) : [];
  return (
    <div className="space-y-4">
      {data.progress ? (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-bold"><BriefcaseBusiness size={16} aria-hidden />Bewerbungen</h4>
          <p className="text-body"><strong className="font-display text-2xl">{data.progress.total}</strong> {data.progress.total === 1 ? "Bewerbung" : "Bewerbungen"} erfasst{data.progress.placed && <span className="ml-2 inline-flex items-center gap-1 font-semibold text-[var(--success-fg)]"><Trophy size={15} aria-hidden />Zusage erhalten</span>}</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Bewerbungen nach Status">
            {groups.map((g) => <li key={g.key} className="rounded-[var(--radius-md)] border-[length:var(--border-w)] border-[var(--line)] px-3 py-2"><span className="block font-display text-xl font-extrabold">{g.count}</span><span className="text-small text-muted">{g.label}</span></li>)}
          </ul>
          {data.progress.lastActivity && <p className="text-small text-muted">Zuletzt aktiv am {formatDateCh(data.progress.lastActivity)}</p>}
        </div>
      ) : <p className="text-small text-muted">Der Fortschritt ist nicht geteilt.</p>}
      {data.village ? (
        <div className="space-y-1">
          <h4 className="flex items-center gap-2 text-sm font-bold"><Home size={16} aria-hidden />{FAMILY_COPY.parent.villageTitle}</h4>
          <p className="text-body">{fill(data.village.points !== null ? FAMILY_COPY.parent.villageLine : FAMILY_COPY.parent.villageLineNoPoints, { islands: `${data.village.level} ${data.village.level === 1 ? "Insel" : "Inseln"}`, houses: `${data.village.items} ${data.village.items === 1 ? "Deko-Objekt" : "Deko-Objekte"}`, points: data.village.points ?? 0 })}</p>
          <ButtonLink href={familyVillagePath(childId)} variant="secondary" size="sm" icon={<Eye size={16} aria-hidden />} className="mt-1" data-testid="child-village-link">Dorf ansehen</ButtonLink>
        </div>
      ) : <p className="text-small text-muted">Das Dorf ist nicht geteilt.</p>}
      {data.applications && data.applications.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-bold">Bewerbungsliste</h4>
          <ul className="rows border-y-[length:var(--border-w)] border-dashed border-[var(--line)]">
            {data.applications.map((a, i) => <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm"><span className="min-w-0"><strong>{a.company || "Firma"}</strong>{a.position && <span className="text-muted"> · {a.position}</span>}</span><span className="text-small font-semibold">{statusText(a.status)}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
