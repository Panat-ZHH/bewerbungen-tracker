import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Subtle "Wird aktualisiert…" while a device snapshot is shown and the server answer is pending (always mounted: aria-live). */
export function RefreshHint({ active, className }: { active: boolean; className?: string }) {
  return (
    <p role="status" aria-live="polite" data-testid="snapshot-refresh" className={cn("inline-flex min-h-5 items-center gap-1.5 text-xs text-muted", className)}>
      {active && <><RefreshCw size={12} strokeWidth={2.4} aria-hidden className="animate-spin [animation-duration:1.6s] motion-reduce:animate-none" />Wird aktualisiert…</>}
    </p>
  );
}
