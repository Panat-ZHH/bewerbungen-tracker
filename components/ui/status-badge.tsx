import { Badge, type BadgeTone } from "@/components/ui/badge";
import { statusLabels } from "@/lib/utils";
import type { ApplicationStatus } from "@/types";

/**
 * One flat colour per stage, from design tokens (works in light and dark):
 * Offen = paper/yellow, Abgeschickt = blue, Gespräch = coral, Zusage = green.
 * Absage is deliberately calm (sand), never red: a rejection should not look like an error.
 */
export const statusTone: Record<ApplicationStatus, BadgeTone> = {
  saved: "paper",
  preparing: "warning",
  applied: "info",
  schnupper_planned: "info",
  schnupper_done: "info",
  aptitude_test: "info",
  interview: "coral",
  final_interview: "coral",
  offer: "success",
  contract_signed: "success",
  rejected: "neutral",
  withdrawn: "neutral",
};

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return <Badge tone={statusTone[status]} className={className}>{statusLabels[status]}</Badge>;
}

export { statusHints } from "@/lib/status";
