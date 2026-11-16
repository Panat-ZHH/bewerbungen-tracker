"use client";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { InAppReturn } from "@/components/billing/in-app-return";

/** Return page after the in-app payment: confirms the payment and shows the active plan. */
export default function Page() {
  return (
    <WorkspaceShell active="Familie">
      <InAppReturn />
    </WorkspaceShell>
  );
}
