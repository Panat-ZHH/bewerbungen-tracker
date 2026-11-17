import { Badge, type BadgeTone } from "@/components/ui/badge";
import { statusLabels } from "@/lib/utils";
import { statusFamily, statusFamilyStyle } from "@/lib/status";
import type { ApplicationStatus } from "@/types";

/**
 * One flat colour per status FAMILY (lib/status.ts `statusFamily`), the same everywhere (badges, bars, dashboard path):
 * Gemerkt = paper, In Vorbereitung = yellow, Abgeschickt / Schnupperlehre / Test = blue, Gespräch = coral, Zusage / Vertrag = green,
 * Absage / Zurückgezogen = calm sand (never red: a rejection should not look like an error).
 */
export const statusTone = Object.fromEntries(
  Object.entries(statusFamily).map(([status, family]) => [status, statusFamilyStyle[family].tone]),
) as Record<ApplicationStatus, BadgeTone>;

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return <Badge tone={statusTone[status]} className={className}>{statusLabels[status]}</Badge>;
}

export { statusHints } from "@/lib/status";
