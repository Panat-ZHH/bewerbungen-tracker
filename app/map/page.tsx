"use client";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { VillageMap } from "@/components/applications/village-map";

/** /map: the child's own village. The same VillageMap renders the parent's read-only view (/familie/kind/[id]/dorf, `watch`). */
export default function MapPage() {
  return <WorkspaceShell active="Map" fullscreen><VillageMap /></WorkspaceShell>;
}
