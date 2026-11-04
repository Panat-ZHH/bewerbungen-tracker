"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = { value: T; label: ReactNode; icon?: ReactNode; count?: number };

/**
 * Segmented control / tab list (controlled). Scrolls horizontally on narrow screens.
 * Render your own panel content based on `value`; give panel `role="tabpanel"` if desired.
 */
export function Segmented<T extends string>({ options, value, onChange, label, full, className }: { options: SegmentOption<T>[]; value: T; onChange: (value: T) => void; label?: string; full?: boolean; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const dir = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    event.preventDefault();
    const next = (index + dir + options.length) % options.length;
    refs.current[next]?.focus();
    onChange(options[next].value);
  }

  return (
    <div role="tablist" aria-label={label} className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--glass-border)] bg-[var(--hover)] p-1 [scrollbar-width:none]", full && "flex w-full", className)}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => { refs.current[index] = el; }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn("inline-flex min-h-9 pointer-coarse:min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap transition duration-200", full && "flex-1", selected ? "bg-[var(--solid)] text-[var(--ink)] shadow-[var(--shadow-sm)]" : "text-muted hover:text-[var(--ink)]")}
          >
            {option.icon}{option.label}
            {option.count !== undefined && <span className={cn("tabular rounded-full px-1.5 text-[11px]", selected ? "bg-[var(--brand-soft)] text-[var(--brand-strong)]" : "bg-[var(--hover)]")}>{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export { Segmented as Tabs };
