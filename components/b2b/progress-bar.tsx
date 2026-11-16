import { cn } from "@/lib/utils";

type Tone = "brand" | "mint" | "sun" | "coral" | "warning" | "danger";
const FILL: Record<Tone, string> = {
  brand: "bg-[var(--brand)]", mint: "bg-[var(--mint)]", sun: "bg-[var(--sun)]", coral: "bg-[var(--coral)]",
  warning: "bg-[var(--warning-line)]", danger: "bg-[var(--danger-line)]",
};

/**
 * Accessible progress bar (role=progressbar with a readable value text). The number is always printed next to or
 * above the bar, so the colour never carries the meaning alone.
 */
export function ProgressBar({ value, max = 100, label, valueText, tone = "brand", className, size = "md" }: { value: number; max?: number; label: string; valueText?: string; tone?: Tone; className?: string; size?: "sm" | "md" }) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, Math.round((value / safeMax) * 100)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.min(Math.max(0, value), safeMax)}
      aria-valuetext={valueText ?? `${pct} %`}
      className={cn("w-full overflow-hidden rounded-full border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface-2)]", size === "sm" ? "h-2.5" : "h-4", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", FILL[tone], pct > 0 && pct < 100 && "border-r-[length:var(--border-w)] border-[var(--outline-fill)]")} style={{ width: `${pct}%` }} />
    </div>
  );
}
