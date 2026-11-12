import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One plain settings group on paper: display-font heading (left column from `lg`), content beside it.
 * Put the sections in a `.rows` wrapper: dashed lines separate them, no cards.
 */
export function SettingsSection({ title, description, titleTestId, children, className, ...props }: Omit<HTMLAttributes<HTMLElement>, "title"> & { title: ReactNode; description?: ReactNode; titleTestId?: string }) {
  return (
    <section className={cn("animate-rise py-8 first:pt-0 lg:grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-12", className)} {...props}>
      <div className="min-w-0">
        <h2 className="text-heading" data-testid={titleTestId}>{title}</h2>
        {description && <p className="mt-1 text-body text-muted">{description}</p>}
      </div>
      <div className="mt-4 min-w-0 lg:mt-0">{children}</div>
    </section>
  );
}
