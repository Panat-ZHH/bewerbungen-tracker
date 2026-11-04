import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Friendly placeholder for empty lists. `action` is usually a Button/ButtonLink. */
export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("animate-rise flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--field-border)] bg-white/40 px-6 py-10 text-center sm:py-14", className)}>
      {icon && <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)] shadow-[var(--shadow-sm)] [&>svg]:h-6 [&>svg]:w-6">{icon}</span>}
      <h3 className="text-heading">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-body text-muted">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
