"use client";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { FamilyView } from "@/components/family/family-view";

/** Family area (/familie): parent dashboard or child side. Sign-in and role routing are handled by the shell. */
export default function Page() {
  return (
    <WorkspaceShell active="Familie">
      <FamilyView />
    </WorkspaceShell>
  );
}
