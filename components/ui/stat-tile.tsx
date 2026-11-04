import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** KPI tile. `trend` is a short string like "+3 diese Woche"; `tone` colors the trend. */
export function StatTile({ label, value, icon, trend, tone = "neutral", className }: { label: string; value: ReactNode; icon?: ReactNode; trend?: string; tone?: "neutral" | "success" | "danger"; className?: string }) {
  const toneClass = tone === "success" ? "text-[var(--success-fg)]" : tone === "danger" ? "text-[var(--danger-fg)]" : "text-muted";
  return (
    <div className={cn("panel card-interactive min-w-0 p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-eyebrow truncate">{label}</p>
        {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)] [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      </div>
      <p className="tabular mt-3 text-[1.75rem] font-bold leading-none tracking-[-.03em] sm:text-[2rem]">{value}</p>
      {trend && <p className={cn("mt-2 text-small", toneClass)}>{trend}</p>}
    </div>
  );
}
