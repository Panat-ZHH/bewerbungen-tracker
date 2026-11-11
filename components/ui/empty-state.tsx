import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DoodleSparkle } from "@/components/ui/doodles";

/** Friendly placeholder for empty lists: dashed contour, a doodle, no icon tile. `action` is usually a Button/ButtonLink. */
export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("animate-rise relative flex flex-col items-center rounded-[var(--radius-xl)] border-2 border-dashed border-[var(--outline)] px-6 py-10 text-center sm:py-14", className)}>
      <DoodleSparkle className="absolute right-5 top-4 h-7 w-7 text-[var(--sun)]" />
      {icon && <span className="mb-3 text-[var(--brand)] [&>svg]:h-9 [&>svg]:w-9 [&>svg]:stroke-[1.8]">{icon}</span>}
      <h3 className="text-heading">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-body text-muted">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2.5">{action}</div>}
    </div>
  );
}
