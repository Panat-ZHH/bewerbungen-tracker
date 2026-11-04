import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Shimmering placeholder. Size it with className (e.g. "h-4 w-1/2"). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("skeleton h-4 w-full", className)} {...props} />;
}

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/** Inline status/toast-like message. role="alert" for danger/warning, otherwise "status". */
export function StatusMessage({ tone = "info", icon, children, className, toast }: { tone?: StatusTone; icon?: React.ReactNode; children: React.ReactNode; className?: string; toast?: boolean }) {
  return (
    <div role={tone === "danger" || tone === "warning" ? "alert" : "status"} className={cn("status", tone !== "neutral" && `status-${tone}`, toast && "toast", className)}>
      {icon && <span className="mt-0.5 shrink-0 [&>svg]:h-[17px] [&>svg]:w-[17px]">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
