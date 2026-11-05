import { Badge, type BadgeTone } from "@/components/ui/badge";
import { statusLabels } from "@/lib/utils";
import type { ApplicationStatus } from "@/types";

/** One colour per status, from design tokens (works in light and dark). */
export const statusTone: Record<ApplicationStatus, BadgeTone> = {
  saved: "neutral",
  preparing: "warning",
  applied: "info",
  interview: "success",
  final_interview: "success",
  offer: "success",
  rejected: "danger",
  withdrawn: "neutral",
};

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return <Badge tone={statusTone[status]} className={className}>{statusLabels[status]}</Badge>;
}

/** Short explanation per status, shown as hint under the status picker. */
export const statusHints: Record<ApplicationStatus, string> = {
  saved: "Die Stelle ist dir aufgefallen, du hast noch nichts unternommen.",
  preparing: "Du arbeitest an Lebenslauf und Anschreiben.",
  applied: "Deine Unterlagen sind unterwegs.",
  interview: "Du wurdest zu einem Gespräch eingeladen.",
  final_interview: "Es gibt eine weitere Runde oder ein Probearbeiten.",
  offer: "Du hast eine Zusage bekommen. Gratulation!",
  rejected: "Diesmal hat es nicht geklappt – das gehört dazu.",
  withdrawn: "Du hast die Bewerbung selbst zurückgezogen.",
};
