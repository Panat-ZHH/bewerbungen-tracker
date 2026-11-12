import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FigureItem = { label: string; value: ReactNode; hint?: string; tone?: "neutral" | "success" | "danger" };

/**
 * Key numbers without boxes: the first one is huge (display font, yellow marker under the label),
 * the others follow as a calm inline list. Replaces the old row of equal KPI tiles.
 */
export function Figures({ items, className, label }: { items: FigureItem[]; className?: string; label?: string }) {
  const [lead, ...rest] = items;
  if (!lead) return null;
  return (
    <section aria-label={label} className={cn("flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-10", className)}>
      <p className="flex shrink-0 items-end gap-3">
        <span className="num-display">{lead.value}</span>
        <span className="pb-1">
          <span className="font-display block text-lg font-bold leading-tight"><span className="marker">{lead.label}</span></span>
          {lead.hint && <span className="text-small mt-0.5 block text-muted">{lead.hint}</span>}
        </span>
      </p>
      {rest.length > 0 && (
        <dl className="flex flex-wrap gap-x-7 gap-y-3 sm:pb-1">
          {rest.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col-reverse">
              <dt className="text-small font-medium text-muted">{item.label}{item.hint && <span className="font-normal"> · {item.hint}</span>}</dt>
              <dd className={cn("num-big", item.tone === "success" && "text-[var(--success-fg)]", item.tone === "danger" && "text-[var(--danger-fg)]")}>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
