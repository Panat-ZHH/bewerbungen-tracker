"use client";

import { BewerbungCheck } from "@/components/ai-review/bewerbung-check";
import { WorkspaceShell } from "@/components/layout/workspace-shell";

export default function BewerbungCheckPage() {
  return (
    <WorkspaceShell active="Dokumente">
      <BewerbungCheck />
    </WorkspaceShell>
  );
}
