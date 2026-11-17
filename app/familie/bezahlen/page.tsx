"use client";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { InAppCheckout } from "@/components/billing/in-app-checkout";

/** In-app payment of the family package (Payment Element in the app's design). Parents only; the API re-checks. */
export default function Page() {
  return (
    <WorkspaceShell active="Familie">
      <InAppCheckout />
    </WorkspaceShell>
  );
}
