"use client";

import { Check } from "lucide-react";
import { statusTone } from "@/components/ui/status-badge";
import { cn, statusLabels } from "@/lib/utils";
import type { ApplicationStatus } from "@/types";

// Local adapter: renders every status of statusLabels (so new Lehrstellen statuses show up automatically)
// as a radio group of pills instead of a <select>.
const toneClass: Record<string, string> = {
  neutral: "border-[var(--neutral-line)] bg-[var(--neutral-bg)] text-[var(--neutral-fg)]",
  brand: "border-[var(--info-line)] bg-[var(--brand-soft)] text-[var(--brand-strong)]",
  info: "border-[var(--info-line)] bg-[var(--info-bg)] text-[var(--info-fg)]",
  success: "border-[var(--success-line)] bg-[var(--success-bg)] text-[var(--success-fg)]",
  warning: "border-[var(--warning-line)] bg-[var(--warning-bg)] text-[var(--warning-fg)]",
  danger: "border-[var(--danger-line)] bg-[var(--danger-bg)] text-[var(--danger-fg)]",
};

export function StatusPills({ value, onChange, describedBy }: { value: ApplicationStatus; onChange: (status: ApplicationStatus) => void; describedBy?: string }) {
  const entries = Object.entries(statusLabels) as [ApplicationStatus, string][];
  return (
    <div role="radiogroup" aria-label="Stand der Bewerbung" aria-describedby={describedBy} className="flex flex-wrap gap-2">
      {entries.map(([status, label]) => {
        const selected = status === value;
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(status)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand)]/25",
              selected ? cn(toneClass[statusTone[status] ?? "neutral"], "font-semibold ring-2 ring-current/30") : "border-[var(--field-border)] bg-[var(--field-bg)] text-muted hover:bg-[var(--hover)] hover:text-[var(--ink)]",
            )}
          >
            {selected && <Check size={14} aria-hidden />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
