"use client";

import { Check } from "lucide-react";
import { cn, statusLabels } from "@/lib/utils";
import type { ApplicationStatus } from "@/types";

// Renders every status of statusLabels (so new Lehrstellen statuses show up automatically)
// as a radio group of chips instead of a <select>. Selected = solid ink fill + check (unmistakable),
// all others flat tinted chips without contour, so two chips never look alike.
export function StatusPills({ value, onChange, describedBy }: { value: ApplicationStatus; onChange: (status: ApplicationStatus) => void; describedBy?: string }) {
  const entries = Object.entries(statusLabels) as [ApplicationStatus, string][];
  return (
    <div role="radiogroup" aria-label="Status der Bewerbung" aria-describedby={describedBy} className="flex flex-wrap gap-2">
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
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border-[length:var(--border-w)] px-3.5 text-sm transition-colors duration-150 active:translate-y-px",
              selected ? "border-[var(--ink)] bg-[var(--ink)] font-bold text-[var(--paper)]" : "border-transparent bg-[var(--surface-2)] font-medium text-[var(--muted)] hover:text-[var(--ink)]",
            )}
          >
            {selected && <Check size={14} strokeWidth={3} aria-hidden />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
