import { applicationTimeline } from "@/lib/application-timeline";
import type { Application } from "@/types";

export function ApplicationTimeline({ application, today }: { application: Application; today?: Date }) {
  const entries = applicationTimeline(application, today);
  return (
    <ol className="relative space-y-4 border-l border-[var(--line)] pl-5" aria-label="Zeitachse">
      {entries.map((entry) => (
        <li key={entry.key} className="relative">
          <span aria-hidden className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface,var(--bg))] ${entry.future ? "bg-[var(--neutral-line)]" : "bg-[var(--brand)]"}`} />
          <p className="text-sm font-medium">{entry.label}</p>
          <p className="text-small text-muted">{entry.dateLabel}</p>
        </li>
      ))}
    </ol>
  );
}
