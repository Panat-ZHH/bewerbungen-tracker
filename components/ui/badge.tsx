import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-[var(--neutral-bg)] text-[var(--neutral-fg)] border-[var(--neutral-line)]",
  brand: "bg-[var(--brand-soft)] text-[var(--brand-strong)] border-[var(--info-line)]",
  info: "bg-[var(--info-bg)] text-[var(--info-fg)] border-[var(--info-line)]",
  success: "bg-[var(--success-bg)] text-[var(--success-fg)] border-[var(--success-line)]",
  warning: "bg-[var(--warning-bg)] text-[var(--warning-fg)] border-[var(--warning-line)]",
  danger: "bg-[var(--danger-bg)] text-[var(--danger-fg)] border-[var(--danger-line)]",
};

export function Badge({ className, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)} {...props} />;
}
