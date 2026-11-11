import { cn } from "@/lib/utils";
import { furthestStage, pathCounts, pathLabels, PATH_STAGES, type PathStage } from "@/lib/next-step";
import type { Application } from "@/types";

// One flat colour per stage (same family as the status badges).
const stageFill: Record<PathStage, string> = {
  saved: "bg-[var(--sun)] text-[var(--on-sun)]",
  sent: "bg-[var(--brand)] text-[var(--on-brand)]",
  talk: "bg-[var(--coral)] text-[var(--on-coral)]",
  placed: "bg-[var(--mint)] text-[var(--on-mint)]",
};

/**
 * Progress as a ticket strip instead of KPI boxes: Gemerkt → Abgeschickt → Gespräch → Zusage.
 * Stages with applications are coloured in, the furthest one carries a "Du bist hier" sticker.
 */
export function ProgressPath({ applications }: { applications: Application[] }) {
  const counts = pathCounts(applications);
  const furthest = furthestStage(counts);
  const hereIndex = furthest ? PATH_STAGES.indexOf(furthest) : -1;
  return (
    <section aria-labelledby="path-h" className="relative">
      <h2 id="path-h" className="text-heading">Dein Weg zur Lehrstelle</h2>
      <div className="relative mt-7">
        {hereIndex >= 0 && (
          <span aria-hidden className="sticker sticker-paper animate-sticker absolute -top-4 z-10 -translate-x-1/2 text-[11px]" style={{ left: `${((hereIndex + 0.5) / PATH_STAGES.length) * 100}%`, "--tilt": "-4deg" } as React.CSSProperties}>Du bist hier</span>
        )}
        <ol className="ticket">
          {PATH_STAGES.map((stage) => {
            const count = counts[stage];
            return (
              <li key={stage} className={cn("ticket-stub", count > 0 ? stageFill[stage] : "text-[var(--muted)]")} aria-current={stage === furthest ? "step" : undefined}>
                <span className="num-big block text-[2rem] min-[400px]:text-[2.5rem] sm:text-[3.25rem]">{count}</span>
                <span className="mt-1.5 block truncate text-[11px] font-bold min-[400px]:text-xs sm:text-sm">{pathLabels[stage]}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-3 text-sm text-muted">
        {counts.total === 1 ? "1 Bewerbung insgesamt" : `${counts.total} Bewerbungen insgesamt`}
        {counts.rejected > 0 && <> · {counts.rejected === 1 ? "1 Absage" : `${counts.rejected} Absagen`} – gehört dazu.</>}
      </p>
    </section>
  );
}
