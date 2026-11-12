import { Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistance } from "./engine";

/**
 * Distance from the searched place to the listing ("12 km", "< 1 km"). Renders nothing when the listing has no distance
 * (search without a place). Look: Agent A, see HANDOFF.md – class `distance-badge`.
 */
export function DistanceBadge({ km, from }: { km?: number; from?: string }) {
  const text = formatDistance(km);
  if (!text) return null;
  const hint = from ? `Luftlinie ab ${from}` : "Luftlinie ab deinem Ort";
  return <Badge className="distance-badge" title={hint}><Navigation size={11} strokeWidth={2.6} aria-hidden /><span className="sr-only">Entfernung: </span>{text}</Badge>;
}
