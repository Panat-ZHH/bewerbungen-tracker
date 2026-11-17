"use client";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { AboView } from "@/components/billing/abo-view";

/** /abo: plan choice (Einzelabo for students, Familienpaket for parents). Allow-listed under the paywall. */
export default function Page() {
  return (
    <WorkspaceShell active="Abo">
      <AboView />
    </WorkspaceShell>
  );
}
