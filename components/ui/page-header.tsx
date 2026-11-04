import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page title block; `actions` wrap below the title on phones. */
export function PageHeader({ title, description, eyebrow, actions, className }: { title: ReactNode; description?: ReactNode; eyebrow?: string; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("animate-rise mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-title break-words">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-body text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
