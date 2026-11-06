import { Badge, type BadgeTone } from "@/components/ui/badge";
import { statusLabels } from "@/lib/utils";
import type { ApplicationStatus } from "@/types";

/** One colour per status, from design tokens (works in light and dark). */
export const statusTone: Record<ApplicationStatus, BadgeTone> = {
  saved: "neutral",
  preparing: "warning",
  applied: "info",
  schnupper_planned: "warning",
  schnupper_done: "info",
  aptitude_test: "info",
  interview: "success",
  final_interview: "success",
  offer: "success",
  contract_signed: "success",
  rejected: "danger",
  withdrawn: "neutral",
};

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return <Badge tone={statusTone[status]} className={className}>{statusLabels[status]}</Badge>;
}

export { statusHints } from "@/lib/status";
