import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page title block: one loud title in the display font, an optional calm line below. `actions` wrap below the title on phones. */
export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("animate-rise mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-title break-words">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-body text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}
