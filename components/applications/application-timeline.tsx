import { applicationTimeline } from "@/lib/application-timeline";
import type { Application } from "@/types";

export function ApplicationTimeline({ application, today }: { application: Application; today?: Date }) {
  const entries = applicationTimeline(application, today);
  return (
    <ol className="relative ml-2 space-y-4 border-l-2 border-dashed border-[var(--line)] pl-5" aria-label="Zeitachse">
      {entries.map((entry) => (
        <li key={entry.key} className="relative">
          <span aria-hidden className={`absolute -left-[28px] top-1 h-3.5 w-3.5 rounded-full border-[length:var(--border-w)] border-[var(--outline)] ${entry.future ? "bg-[var(--surface)]" : "bg-[var(--sun)]"}`} />
          <p className="text-sm font-semibold">{entry.label}</p>
          <p className="text-small text-muted">{entry.dateLabel}</p>
        </li>
      ))}
    </ol>
  );
}
